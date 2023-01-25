// WebCall Copyright 2022 timur.mobi. All rights reserved.
//
// httpLogin() is called by callees via XHR "/rtcsig/login". 
// httpLogin() makes sure that the given urlID and password 
// (or the stored cookie) are the same as during registration.
// Cookie support is not required for a successful login.
// If cookies are supported by the client, a cookie is stored
// to allow for convenient reconnect. On successful login, the 
// callee client will receive a responseString in the form of 
// "wss://(hostname):(wssPort)/ws|other|parameters|...|..."
// with which the websocket connection can be established.

package main

import (
	"net/http"
	"time"
	"strings"
	"fmt"
	"io"
	"math/rand"
	"sync"
	"golang.org/x/crypto/bcrypt"
)

func httpLogin(w http.ResponseWriter, r *http.Request, urlID string, cookie *http.Cookie, hashPw string, remoteAddr string, remoteAddrWithPort string, nocookie bool, startRequestTime time.Time, pwIdCombo PwIdCombo, userAgent string) {
	clientVersion := ""
	url_arg_array, ok := r.URL.Query()["ver"]
	if ok && len(url_arg_array[0]) >= 1 {
		clientVersion = url_arg_array[0]
	}

	mid := ""
	url_arg_array, ok = r.URL.Query()["mid"]
	if ok && len(url_arg_array[0]) >= 1 {
		mid = url_arg_array[0]
	}

//	if logWantedFor("loginex") {
	if logWantedFor("login") {
		fmt.Printf("/login (%s) mid=%s ip=%s rt=%v\n",
			urlID, mid, remoteAddrWithPort, time.Since(startRequestTime)) // rt=4.393µs
	}


	// answie and talkback can only log in from localhost
	if strings.HasPrefix(urlID, "answie") || strings.HasPrefix(urlID, "talkback") {
		if remoteAddr!="127.0.0.1" && remoteAddr!=outboundIP {
			fmt.Printf("/login (%s) not from local host denied %s\n", urlID, remoteAddrWithPort)
			return
		}
	}

	// checking clientBlockBelowVersion (but not for answie and talkback)
	if !strings.HasPrefix(urlID,"answie") && !strings.HasPrefix(urlID,"talkback") {
		readConfigLock.RLock()
		if clientBlockBelowVersion!="" && (clientVersion=="" || clientVersion < clientBlockBelowVersion) {
			fmt.Printf("/login (%s) deny clientVersion (%s) < clientBlockBelowVersion (%s) %s\n",
				urlID, clientVersion, clientBlockBelowVersion, remoteAddr)
			readConfigLock.RUnlock()

			// NOTE: msg MUST NOT contain apostroph (') characters
			msg := "The version of WebCall you are using is no longer supported."+
					" <a href=\"/webcall/update/\">Please upgrade.</a>"
			fmt.Fprintf(w,msg)
			return
		}
		readConfigLock.RUnlock()
	}

	// was this callee blocked (due to ws-connect timeout26)?
	blockMapMutex.RLock()
	blockedTime,ok := blockMap[urlID]
	blockMapMutex.RUnlock()
	if ok {
		// callee with urlID was blocked due to an earlier ws-reconnect issue (likely due to battery optimization)
		if time.Now().Sub(blockedTime) <= 10 * 60 * time.Minute {
			// urlID was blocked in the last 10h
			if logWantedFor("overload") {
				fmt.Printf("/login (%s) block recon (%v) rip=%s v=%s ua=%s\n",
					urlID, time.Now().Sub(blockedTime), remoteAddr, clientVersion, userAgent)
			}
			// this error response string is formated so that callee.js will show it via showStatus()
			// it also makes Android service (1.0.0-RC3+) abort the reconnecter loop
			// NOTE: msg MUST NOT contain apostroph (') characters
			msg :=  "A Websocket reconnect has failed. Likely in device sleep mode. "+
					"Please deactivate battery optimizations aka provide keep-awake permission. "+
					"<a href=\"/webcall/more/#keepawake\">More info</a>"
			fmt.Fprintf(w,msg)
			blockMapMutex.Lock()
			delete(blockMap,urlID)
			blockMapMutex.Unlock()
			return
		}
		blockMapMutex.Lock()
		delete(blockMap,urlID)
		blockMapMutex.Unlock()
	}

	// deny a callee to do more than X logins per 30min (relative to urlID)
	calleeLoginMutex.RLock()
	calleeLoginSlice,ok := calleeLoginMap[urlID]
	calleeLoginMutex.RUnlock()
	readConfigLock.RLock()
	maxLoginPer30minTmp := maxLoginPer30min
	readConfigLock.RUnlock()
	if maxLoginPer30minTmp>0 && remoteAddr!=outboundIP && remoteAddr!="127.0.0.1" {
		if ok {
			for len(calleeLoginSlice)>0 {
				if time.Now().Sub(calleeLoginSlice[0]) < 30 * time.Minute {
					break
				}
				if len(calleeLoginSlice)>1 {
					calleeLoginSlice = calleeLoginSlice[1:]
				} else {
					calleeLoginSlice = calleeLoginSlice[:0]
				}
			}
			if len(calleeLoginSlice) >= maxLoginPer30minTmp {
				if logWantedFor("overload") {
					fmt.Printf("/login (%s) %d >= %d logins/30m rip=%s v=%s\n",
						urlID, len(calleeLoginSlice), maxLoginPer30minTmp, remoteAddr, clientVersion)
				}
				fmt.Fprintf(w,"Too many reconnects / login attempts in short order. "+
							  "Is your network connection stable? "+
							  "Please take a pause.")
				calleeLoginMutex.Lock()
				calleeLoginMap[urlID] = calleeLoginSlice
				calleeLoginMutex.Unlock()
				return
			}
		}
		calleeLoginSlice = append(calleeLoginSlice,time.Now())
		calleeLoginMutex.Lock()
		calleeLoginMap[urlID] = calleeLoginSlice
		calleeLoginMutex.Unlock()

		//if logWantedFor("attach") {
		//	fmt.Printf("/login (%s) +1 %d/%d rip=%s v=%s\n",
		//		urlID, len(calleeLoginSlice), maxLoginPer30minTmp, remoteAddr, clientVersion)
		//}
	}

	// reached maxCallees?
	hubMapMutex.RLock()
	lenHubMap := len(hubMap)
	hubMapMutex.RUnlock()
	readConfigLock.RLock()
	myMaxCallees := maxCallees
	myMultiCallees := multiCallees
	readConfigLock.RUnlock()
	if lenHubMap > myMaxCallees {
		fmt.Printf("# /login lenHubMap %d > myMaxCallees %d rip=%s v=%s\n",
			lenHubMap, myMaxCallees, remoteAddr, clientVersion)
		fmt.Fprintf(w, "error")
		return
	}

	if strings.Index(myMultiCallees, "|"+urlID+"|") < 0 {
		// urlID is NOT a multiCallee user
		// so if urlID is already logged-in, we must abort
		// unless the request comes from the same IP, in which case we log the old session out
		ejectOn1stFound := true
		reportHiddenCallee := true
		reportBusyCallee := true
		key, _, _, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee, 
			reportHiddenCallee, remoteAddr, "/login")
		if err != nil {
			fmt.Printf("# /login (%s) GetOnlineCallee() err=%v v=%s\n", key, err, clientVersion)
		}
		if key != "" {
			// found "already logged in"
			// delay a bit to see if we receive a parallel exitFunc that might delete this key
			time.Sleep(1000 * time.Millisecond)
			// check again
			key, _, _, err = GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee, 
				reportHiddenCallee, remoteAddr, "/login")
			if err != nil {
				fmt.Printf("# /login (%s) GetOnlineCallee() err=%v v=%s\n", key, err, clientVersion)
			}
			if key != "" {
				// a login request for a user that is still logged in
				// maybe it has logged out and we didn't find out yet
				// if remoteAddr == hub.CalleeClient.RemoteAddrNoPort: unregister old entry
				hubMapMutex.RLock()
				hub := hubMap[key]
				hubMapMutex.RUnlock()
				offlineReason := 0
				calleeIP := ""

				if hub==nil {
					offlineReason = 1 // callee's hub is gone
				} else if hub.CalleeClient==nil {
					offlineReason = 2 // CalleeClient is gone
				} else {
					calleeIP = hub.CalleeClient.RemoteAddr
					if !hub.CalleeClient.isOnline.Get() {
						offlineReason = 3 // CalleeClient is not online anymore
					} else {
						// hub.CalleeClient seems to (still) be online; let's see if this holds if we ping it
						if logWantedFor("login") {
							fmt.Printf("/login (%s) ping-wait %s <- %s v=%s\n",
								key, calleeIP, remoteAddrWithPort, clientVersion)
						}

						// ping the callee client and if it doesn't respond within 2500ms, disconnect it
						hub.CalleeClient.SendPing(2500)

						// now we wait up to 30x100ms = 3000ms for id=key to possibly log out...
						for i := 0; i < 30; i++ {
							time.Sleep(100 * time.Millisecond)
							// is hub.CalleeClient still online now?
							if hub==nil || hub.CalleeClient==nil || !hub.CalleeClient.isOnline.Get() {
								// CalleeClient is not online anymore (we can accept the new login)
								offlineReason = 4
								if logWantedFor("login") {
								  fmt.Printf("/login (%s) logged out after wait %dms/%v %s ws=%d v=%s\n", key,
									i*100, time.Since(startRequestTime), remoteAddr, hub.WsClientID, clientVersion)
								}
								break
							}
						}
					}
				}

				if offlineReason==0 {
					// abort this login attempt: old/sameId callee is already/still logged in
					fmt.Printf("/login (%s) already/still logged in %v by %s <- %s v=%s ua=%s\n",
						key, time.Since(startRequestTime), calleeIP, remoteAddrWithPort, clientVersion, userAgent)
					fmt.Fprintf(w,"fatal")
					return
				}

				// the new login is valid (the old callee is not online anymore)
				// there is no need to hub.doUnregister(hub.CalleeClient, ""); just continue with the login
			}
		}
	}

	formPw := ""
	postBuf := make([]byte, 128)
	length, _ := io.ReadFull(r.Body, postBuf)
	if length > 0 {
		var pwData = string(postBuf[:length])
		//fmt.Printf("/login pwData (%s)\n", pwData)
		pwData = strings.ToLower(pwData)
		pwData = strings.TrimSpace(pwData)
		tokenSlice := strings.Split(pwData, "&")
		for _, tok := range tokenSlice {
			if strings.HasPrefix(tok, "pw=") {
				pwFromPost := tok[3:]
				if(pwFromPost!="") {
					formPw = pwFromPost
					break
				}
			}
		}
	}

	if hashPw == "" && len(formPw) < 6 {
		// delay guessing
		fmt.Printf("/login (%s) formPw too short %s v=%s\n", urlID, remoteAddr, clientVersion)
		time.Sleep(3000 * time.Millisecond)
		fmt.Fprintf(w, "error")
		return
	}

	if formPw!="" {
		// pw form-input is given
//fmt.Printf("/login (%s) nocookie=%v\n", urlID, nocookie)
		if nocookie && (strings.HasPrefix(urlID,"answie") || strings.HasPrefix(urlID,"talkback")) {
			// accept
		} else {
			if hashPw=="" {
				// no cookie (maybe client deleted it): compare form input against pw-of-urlID
				var pwIdCombo PwIdCombo
				err := kvHashedPw.Get(dbHashedPwBucket,urlID,&pwIdCombo)
				if err!=nil {
					if strings.Index(err.Error(),"key not found")>=0 {
						fmt.Printf("# /login (%s) ID not found\n", urlID)
						fmt.Fprintf(w, "notregistered")
						return
					}
					// some other error;
					fmt.Printf("# /login (%s) got formPw, no cookiePw err=%v\n", urlID, err)
				} else {
					hashPw = pwIdCombo.Pw
//fmt.Printf("/login (%s) got formPw, no cookiePw, pwIdCombo.Pw=%s\n", urlID, pwIdCombo.Pw) // TODO remove
				}
			} else {
//				fmt.Printf("/login (%s) got formPw, cookiePw=(%s)\n", urlID, hashPw)
			}
			// this gets executed after form-field submit
			// compare form-cleartext-formPw vs. hashPw-dbHashedPw-plus-cookie (if empty: hashPw-dbEntry.Password)
//fmt.Printf("/login (%s) compare hash(%s) form(%s)\n", urlID, hashPw, formPw) // TODO remove

			err := bcrypt.CompareHashAndPassword([]byte(hashPw), []byte(formPw))
			if err != nil {
				fmt.Printf("# /login (%s) bcrypt.CompareHashAndPassword err=%v\n", urlID, err)
/*
				// in case hashPw was not crypted:
				if hashPw != formPw {
//fmt.Printf("# /login (%s) clear pw err (%s|%s) %s\n", urlID, hashPw, formPw, remoteAddr)
					fmt.Printf("# /login (%s) clear pw err %s\n", urlID, remoteAddr)
					// make pw guessing slow
					time.Sleep(2000 * time.Millisecond)
					fmt.Fprintf(w, "error")
					return
				}
				fmt.Printf("/login (%s) clear pw success\n", urlID)
*/
				return
			} else {
//				fmt.Printf("/login (%s) bcrypt.CompareHashAndPassword success\n", urlID)
			}
		}
	} else {
		// no pw form-input is given
		// this happens on page reload
		if hashPw=="" {
			// without a cookie and without formPw, we will fail, causing the pw-form to be shown on the client
			fmt.Printf("/login (%s) got no formPw, no cookiePw\n", urlID)
			// make pw guessing slow
			time.Sleep(2000 * time.Millisecond)
			fmt.Fprintf(w, "error")
			return
		}

		// no pw form-input but a cookie is given
		// hashPw comes from our local dbHashedPw (based on key=cookie)
		// hashPw!="" means that the cookie is valid
		//fmt.Printf("/login (%s) got no formPw, cookiePw\n", urlID)
	}

	// pw is accepted, get dbEntry and dbUser based on urlID

	//fmt.Printf("/login (%s) rip=%s rt=%v\n",
	//	urlID, remoteAddr, time.Since(startRequestTime)) // rt=23.184µs
	var dbEntry DbEntry
	var dbUser DbUser
	var wsClientID uint64
	err := kvMain.Get(dbRegisteredIDs, urlID, &dbEntry)
	if err != nil {
		// err is most likely "skv key not found"
		// log "skv key not found" only if "login" is wanted
		if strings.Index(err.Error(), "skv key not found") >= 0 {
			if logWantedFor("login") {
				fmt.Printf("/login (%s) error db=%s bucket=%s %s get registeredID err=%v v=%s\n",
					urlID, dbMainName, dbRegisteredIDs, remoteAddr, err, clientVersion)
			}
		} else {
			fmt.Printf("/login (%s) error db=%s bucket=%s %s get registeredID err=%v v=%s\n",
				urlID, dbMainName, dbRegisteredIDs, remoteAddr, err, clientVersion)
		}
		if strings.Index(err.Error(), "disconnect") >= 0 {
			// TODO admin email notif may be useful
			fmt.Fprintf(w, "error")
			return
		}
		if strings.Index(err.Error(), "timeout") < 0 {
			// pw guessing more difficult if delayed
			time.Sleep(3000 * time.Millisecond)
		}
		// TODO clear cookie?
		//clearCookie(w, r, urlID, remoteAddr)
		fmt.Fprintf(w, "notregistered")
		return
	}

	dbUserKey := fmt.Sprintf("%s_%d", urlID, dbEntry.StartTime)
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err != nil {
		fmt.Printf("# /login (%s) error db=%s bucket=%s get %s err=%v v=%s\n",
			dbUserKey, dbMainName, dbUserBucket, remoteAddr, err, clientVersion)
		fmt.Fprintf(w, "error")
		return
	}
	//fmt.Printf("/login dbUserKey=%v dbUser.Int=%d (hidden) rt=%v\n",
	//	dbUserKey, dbUser.Int2, time.Since(startRequestTime)) // rt=75ms

	// store dbUser with modified LastLoginTime
	dbUser.LastLoginTime = time.Now().Unix()
	err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
	if err!=nil {
		fmt.Printf("# /login (%s) error db=%s bucket=%s put %s err=%v v=%s\n",
			urlID, dbMainName, dbUserBucket, remoteAddr, err, clientVersion)
		fmt.Fprintf(w, "error")
		return
	}

	// create new unique wsClientID
	wsClientMutex.Lock()
	wsClientID = getNewWsClientID()
	wsClientMutex.Unlock()
	//fmt.Printf("/login (%s) set wsClientMap[%d] for\n", globalID, wsClientID)
	// hub.WsClientID and hub.ConnectedCallerIp will be set by wsclient.go

	globalID := ""
	globalID,_,err = StoreCalleeInHubMap(urlID, myMultiCallees, remoteAddrWithPort, wsClientID, false)
	if err != nil || globalID == "" {
		fmt.Printf("# /login (%s/%s) StoreCalleeInHubMap err=%v v=%s\n",
			urlID, globalID, err, clientVersion)
		fmt.Fprintf(w, "noservice")
		return
	}
	//fmt.Printf("/login (%s) urlID=(%s) rip=%s rt=%v\n",
	//	globalID, urlID, remoteAddr, time.Since(startRequestTime))

	var lenGlobalHubMap int64
	if cookie == nil && !nocookie && formPw!="" {
		err,cookieValue := createCookie(w, urlID, formPw, &pwIdCombo)
		if err != nil {
			if globalID != "" {
				_,lenGlobalHubMap = DeleteFromHubMap(globalID)
			}
			fmt.Printf("# /login (%s) persist PwIdCombo error db=%s bucket=%s cookie=%s err=%v v=%s (%d)\n",
				urlID, dbHashedPwName, dbHashedPwBucket, cookieValue, err, clientVersion, lenGlobalHubMap)
			fmt.Fprintf(w, "noservice")
			return
		}

		if logWantedFor("cookie") {
			fmt.Printf("/login (%s) persisted PwIdCombo db=%s bucket=%s key=%s v=%s\n",
				urlID, dbHashedPwName, dbHashedPwBucket, cookieValue, clientVersion)
		}
		//fmt.Printf("/login (%s) pwIdCombo stored time=%v\n", urlID, time.Since(startRequestTime))
	}

	readConfigLock.RLock()
	myMaxRingSecs := maxRingSecs
	myMaxTalkSecsIfNoP2p := maxTalkSecsIfNoP2p
	readConfigLock.RUnlock()
	var myHubMutex sync.RWMutex // only to protect local hub from exitFunc
	hub := newHub(myMaxRingSecs, myMaxTalkSecsIfNoP2p, dbEntry.StartTime)
	//fmt.Printf("/login newHub urlID=%s duration %d/%d rt=%v\n",
	//	urlID, maxRingSecs, maxTalkSecsIfNoP2p, time.Since(startRequestTime))

	exitFunc := func(reqWsClientID uint64, comment string) {
		// exitFunc: callee is logging out: release hub and port of this session

		if hub == nil {
			// connection was cut off by the device / or timeout26s
			fmt.Printf("# exitfunc (%s) hub==nil ws=%d %s rip=%s v=%s\n",
				globalID, wsClientID, comment, remoteAddrWithPort, clientVersion)
			return;
		}

		// make sure the old calleeClient.hub.WsClientID is really same as the new wsClientID
		if reqWsClientID != wsClientID {
			// not the same (already exited, possibly by timeout26s): abort exit / deny deletion
			// exitfunc (id) abort ws=54553222902/0 'OnClose'
			if reqWsClientID!=0 {
				fmt.Printf("exitfunc (%s) abort ws=%d/%d '%s' %s v=%s\n",
					globalID, wsClientID, reqWsClientID, comment, remoteAddrWithPort, clientVersion)
			}
			return;
		}

		if logWantedFor("attach") {
			fmt.Printf("exitfunc (%s) '%s' ws=%d %s\n",
				globalID, comment, wsClientID, remoteAddr)
		}

		if dbUserKey!="" {
			// feed LastLogoffTime
			var dbUser2 DbUser
			err := kvMain.Get(dbUserBucket, dbUserKey, &dbUser2)
			if err != nil {
				fmt.Printf("# exitfunc (%s) error db=%s bucket=%s get key=%v err=%v\n",
					globalID, dbMainName, dbUserBucket, dbUserKey, err)
			} else {
				//fmt.Printf("exitfunc (%s) dbUserKey=%s isHiddenCallee=%v (%d)\n",
				//	globalID, dbUserKey, dbUser2.Int2&1!=0, dbUser2.Int2)

				// store dbUser with modified LastLogoffTime
				dbUser2.LastLogoffTime = time.Now().Unix()
				err = kvMain.Put(dbUserBucket, dbUserKey, dbUser2, false)
				if err!=nil {
					fmt.Printf("# exitfunc (%s) error db=%s bucket=%s put key=%s err=%v\n",
						globalID, dbMainName, dbUserBucket, urlID, err)
				}
			}
		}

		myHubMutex.Lock()
		if hub != nil {
			if globalID != "" {
				_,lenGlobalHubMap = DeleteFromHubMap(globalID)
			} else {
				fmt.Printf("# exitfunc (%s) globalID is empty\n", urlID)
			}
			hub = nil
		} else {
			fmt.Printf("# exitfunc (%s) hub==nil\n", urlID)
		}
		myHubMutex.Unlock()

		if wsClientID>0 {
		    wsClientMutex.Lock()
		    delete(wsClientMap, wsClientID)
		    wsClientMutex.Unlock()
			//fmt.Printf("exitfunc (%s) done\n", urlID)
		} else {
			fmt.Printf("# exitfunc (%s) wsClientID==0\n", urlID)
		}
	}

	hub.exitFunc = exitFunc
	hub.calleeUserAgent = userAgent

	//fmt.Printf("/login create wsClientMap[] with urlID=%s globalID=%s \n",urlID,globalID)
	wsClientMutex.Lock()
	// dialID empty for now, will be patched in by /online
	wsClientMap[wsClientID] =
		wsClientDataType{hub, dbEntry, dbUser, urlID, globalID, "", clientVersion, false}
	wsClientMutex.Unlock()

	//fmt.Printf("/login newHub store in local hubMap with globalID=%s\n", globalID)
	hubMapMutex.Lock()
	hubMap[globalID] = hub
	hubMapMutex.Unlock()

	//fmt.Printf("/login run hub id=%s durationSecs=%d/%d rt=%v\n",
	//	urlID,maxRingSecs,maxTalkSecsIfNoP2p, time.Since(startRequestTime)) // rt=44ms, 113ms
	wsAddr := fmt.Sprintf("ws://%s:%d/ws", hostname, wsPort)
	readConfigLock.RLock()
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		// hand out the wss url
		if wssUrl != "" {
			wsAddr = wssUrl
		} else {
			wsAddr = fmt.Sprintf("wss://%s:%d/ws", hostname, wssPort)
		}
	} else {
		if wsUrl != "" {
			wsAddr = wsUrl
		}
	}
	readConfigLock.RUnlock()
	wsAddr = fmt.Sprintf("%s?wsid=%d", wsAddr, wsClientID)
	//if logWantedFor("wsAddr") {
	//	fmt.Printf("/login wsAddr=%s\n",wsAddr)
	//}

	if logWantedFor("login") {
		fmt.Printf("/login (%s) success %d %v ws=%d %s v=%s ua=%s\n",
			urlID, len(calleeLoginSlice), time.Since(startRequestTime), wsClientID,
			remoteAddrWithPort, clientVersion, userAgent)
	}

	serviceSecs := 0
	responseString := fmt.Sprintf("%s|%d|%s|%d|%v|%v",
		wsAddr,                     // 0
		dbUser.ConnectedToPeerSecs, // 1
		outboundIP,                 // 2
		serviceSecs,                // 3
		dbUser.Int2&1 != 0,         // 4 isHiddenCallee
		dbUser.Int2&4 != 0)         // 5 dialSoundsMuted (if bit is set, dialSounds will be muted)
	fmt.Fprintf(w, responseString)

	if urlID != "" && globalID != "" {
		// start a goroutine for max X seconds to check if callee has succefully logged in via ws
		// if hub.CalleeLogin is still false then, do skv.DeleteFromHubMap(globalID)
		// to invalidate this callee/hub
		go func() {
			waitForClientWsConnectSecs := 26 // timeout26s

			if logWantedFor("login") {
				fmt.Printf("/login (%s) waitForClientWsConnectSecs...\n", urlID)
			}

			waitedFor := 0
			for i := 0; i < waitForClientWsConnectSecs; i++ {
				myHubMutex.RLock()
				if hub == nil {
					myHubMutex.RUnlock()
					break
				}
				if hub.CalleeLogin.Get() {
					// this is set when callee has send 'init'
					myHubMutex.RUnlock()
					break
				}
				myHubMutex.RUnlock()

				time.Sleep(1 * time.Second)
				waitedFor++

				myHubMutex.Lock()
				hubMapMutex.RLock()
				hub = hubMap[globalID]
				hubMapMutex.RUnlock()
				if hub == nil {
					// callee is already gone
					myHubMutex.Unlock()
					break
				}
				myHubMutex.Unlock()
			}

			if logWantedFor("login") {
				fmt.Printf("/login (%s) waitForClientWsConnectSecs done waitedFor=%d\n", urlID, waitedFor)
			}

			// hub.CalleeLogin will be set by callee-client sending "init|"
			// if hub.CalleeLogin is not set, the client couldn't send "init|", may be due to battery optimization
			myHubMutex.RLock()
			if hub==nil {
				// callee is already gone
				myHubMutex.RUnlock()
				if logWantedFor("login") {
					fmt.Printf("/login (%s) no hub\n", urlID)
				}
			} else {
				if logWantedFor("login") {
					fmt.Printf("/login (%s) has hub\n", urlID)
				}
				if hub.CalleeLogin.Get() {
					// this is perfect: ws-connect / init did occur (callee fully logged in)
					myHubMutex.RUnlock()

					if logWantedFor("login") {
						fmt.Printf("/login (%s) has CalleeLogin.Get (is online, did init)\n", urlID)
					}

					if mastodonMgr!=nil && mid!="" {
						// tell caller that callee is ready to receive a call (and maybe other related tasks)

						if logWantedFor("login") {
							fmt.Printf("/login (%s) mastodonMgr.calleeLoginSuccess mid=%s\n", urlID, mid)
						}
						mastodonMgr.sendCallerLink(mid,urlID,remoteAddr)
					}
				} else {
					// hub!=nil but CalleeLogin==false (callee still there but did NOT send 'init' within 26s)
					hub.HubMutex.RLock()

					if logWantedFor("login") {
						fmt.Printf("/login (%s) has no CalleeLogin.Get\n", urlID)
					}

					unregisterNeeded := false
					if hub.CalleeClient != nil {
						unregisterNeeded = true
					}
					hub.HubMutex.RUnlock()
					myHubMutex.RUnlock()

					if unregisterNeeded {
						// this looks like a ws-(re)connect problem
						// the next login attempt of urlID/globalID will be denied to break it's reconnecter loop
						fmt.Printf("/login (%s) timeout26s unregisterNeeded\n", urlID)
						blockMapMutex.Lock()
						blockMap[urlID] = time.Now()
						blockMapMutex.Unlock()

						msg := fmt.Sprintf("timeout%ds",waitedFor)
						hub.closeCallee(msg) // -> exitFunc()
					} else {
						// callee has exited early
						if logWantedFor("login") {
							fmt.Printf("/login (%s/%s) timeout%ds callee gone skip hub.doUnregister\n",
								urlID, globalID, waitedFor)
						}
					}

					if globalID != "" {
						//_,lenGlobalHubMap =
							DeleteFromHubMap(globalID)
					} else {
						fmt.Printf("# /login (%s/%s) timeout%ds no globalID skip DeleteFromHubMap()\n",
							urlID, globalID, waitedFor)
					}
				}
			}
		}()
	} else {
		fmt.Printf("# /login (%s/%s) not starting waitForWsConnect\n", urlID, globalID)
	}
	return
}

func createCookie(w http.ResponseWriter, urlID string, pw string, pwIdCombo *PwIdCombo) (error,string) {
	// create new cookie with name=webcallid value=urlID
	// store only if url parameter nocookie is NOT set
	cookieSecret := fmt.Sprintf("%d", rand.Int63n(99999999999))

	// we need urlID in cookieName only for answie#
	cookieName := "webcallid"
	if strings.HasPrefix(urlID, "answie") {
		cookieName = "webcallid-" + urlID
	}
	expiration := time.Now().Add(6 * 31 * 24 * time.Hour)
	cookieValue := fmt.Sprintf("%s&%s", urlID, string(cookieSecret))
	cookieObj := http.Cookie{Name: cookieName, Value: cookieValue,
		Path:     "/",
		HttpOnly: false,
		SameSite: http.SameSiteStrictMode,
		Expires:  expiration}
	cookie := &cookieObj
	http.SetCookie(w, cookie)
	if logWantedFor("cookie") {
		fmt.Printf("/login cookie created (%v)\n", cookieValue)
	}

	//pwIdCombo.Pw = pw
    hash, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.MinCost)
    if err != nil {
		fmt.Printf("# /login bcrypt err=%v\n", err)
		pwIdCombo.Pw = pw
    } else {
		fmt.Printf("/login (%s) createCookie bcrypt store (%v)\n", urlID, string(hash))
//fmt.Printf("createCookie (%s) pw(%s) hashPw(%s)\n", urlID, pw, string(hash)) // TODO remove
		pwIdCombo.Pw = string(hash)
	}

	pwIdCombo.CalleeId = urlID
	pwIdCombo.Created = time.Now().Unix()
	pwIdCombo.Expiration = expiration.Unix()

	skipConfirm := true
//	return kvHashedPw.Put(dbHashedPwBucket, cookieValue, pwIdCombo, skipConfirm), cookieValue
	// cookieSecret is no opsolete
	return kvHashedPw.Put(dbHashedPwBucket, urlID, pwIdCombo, skipConfirm), cookieValue
}

