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
	"os"
	"math/rand"
	"sync"
)

func httpLogin(w http.ResponseWriter, r *http.Request, urlID string, cookie *http.Cookie, pw string, remoteAddr string, remoteAddrWithPort string, nocookie bool, startRequestTime time.Time, pwIdCombo PwIdCombo, userAgent string) {
	//fmt.Printf("/login (%s) rip=%s rt=%v\n",
	//	urlID, remoteAddrWithPort, time.Since(startRequestTime)) // rt=4.393µs

	clientVersion := ""
	url_arg_array, ok := r.URL.Query()["ver"]
	if ok && len(url_arg_array[0]) >= 1 {
		clientVersion = url_arg_array[0]
	}

	blockMapMutex.RLock()
	blockedTime,ok := blockMap[urlID]
	blockMapMutex.RUnlock()
	if ok {
		if time.Now().Sub(blockedTime) < 20 * time.Minute {
			fmt.Fprintf(w,"noservice|Websocket communication issue detected on your device. Please check your System WebView and network settings. Account blocked for 20 minutes.")
			fmt.Printf("/login (%s) blocked (%v) rip=%s ua=%s ver=%s\n",
				urlID, time.Now().Sub(blockedTime), remoteAddr, userAgent, clientVersion)
			return
		} else {
			blockMapMutex.Lock()
			delete(blockMap,urlID)
			blockMapMutex.Unlock()
		}
	}


	// reached maxCallees?
	hubMapMutex.RLock()
	lenHubMap := len(hubMap)
	hubMapMutex.RUnlock()
	readConfigLock.RLock()
	myMaxCallees := maxCallees
	readConfigLock.RUnlock()
	if lenHubMap > myMaxCallees {
		fmt.Printf("# /login lenHubMap %d > myMaxCallees %d rip=%s ver=%s\n",
			lenHubMap, myMaxCallees, remoteAddr, clientVersion)
		fmt.Fprintf(w, "error")
		return
	}

	readConfigLock.RLock()
	myMultiCallees := multiCallees
	readConfigLock.RUnlock()

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
			fmt.Printf("# /login (%s) GetOnlineCallee() err=%v ver=%s\n", key, err, clientVersion)
		}
		if key != "" {
			// found "already logged in"
			// delay a bit to see if we receive a parallel exithub that might delete this key
			time.Sleep(1000 * time.Millisecond)
			// check again
			key, _, _, err = GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee, 
				reportHiddenCallee, remoteAddr, "/login")
			if err != nil {
				fmt.Printf("# /login (%s) GetOnlineCallee() err=%v ver=%s\n", key, err, clientVersion)
			}
			if key != "" {
				// "already logged in" entry still exists
				// if remoteAddr == hub.CalleeClient.RemoteAddrNoPort: unregister old entry
				hubMapMutex.RLock()
				hub := hubMap[key]
				hubMapMutex.RUnlock()
				offlineReason := 0
				if hub==nil {
					offlineReason = 1 // callee's hub is gone
				} else if hub.CalleeClient==nil {
					offlineReason = 2 // CalleeClient is gone
				} else if !hub.CalleeClient.isOnline.Get() {
					offlineReason = 3 // CalleeClient is not online anymore
				} else {
					// hub.CalleeClient seems to be online; let's see if this holds if we ping it
					if logWantedFor("login") {
						fmt.Printf("/login (%s) send ping to prev rip=%s\n", key, remoteAddr)
					}
					hub.CalleeClient.SendPing(2000)

					// we wait max 22x100ms = 2200ms
					for i := 0; i < 22; i++ {
						time.Sleep(100 * time.Millisecond)
						// is hub.CalleeClient still online now?
						if hub==nil || hub.CalleeClient==nil || !hub.CalleeClient.isOnline.Get() {
							// CalleeClient is not online anymore
							offlineReason = 4
							break
						}
					}
				}
				if offlineReason==0 {
					// abort login: old/sameId callee is still online
					fmt.Fprintf(w,"fatal")
					fmt.Printf("/login (%s) is already logged in (%d) rip=%s ua=%s ver=%s\n",
						key, offlineReason, remoteAddr, userAgent, clientVersion)
					return
				}
				// apparently the new login comes from the old callee, bc it is not online anymore
				// no need to hub.doUnregister(hub.CalleeClient, ""); just continue with the login
			}
		}
	}

	//fmt.Printf("/login pw before httpPost (%s)\n", pw)
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
					pw = pwFromPost
					//fmt.Printf("/login pw from httpPost (%s)\n", pw)
					break
				}
			}
		}
	}

	// pw must be available now
	if pw == "" {
		fmt.Printf("/login (%s) no pw rip=%s ua=%s ver=%s\n", urlID, remoteAddr, r.UserAgent(), clientVersion)
		fmt.Fprintf(w, "error")
		return
	}

	//fmt.Printf("/login (%s) pw given rip=%s rt=%v\n",
	//	urlID, remoteAddr, time.Since(startRequestTime)) // rt=23.184µs
	var dbEntry DbEntry
	var dbUser DbUser
	var wsClientID uint64
	var lenGlobalHubMap int64
	serviceSecs := 0
	globalID := ""
	dbUserKey := ""

	if strings.HasPrefix(urlID, "random") {
		// ignore
	} else if strings.HasPrefix(urlID, "!") {
		// duo: create new unique wsClientID
		wsClientMutex.Lock()
		wsClientID = getNewWsClientID()
		wsClientMutex.Unlock()
		//fmt.Printf("/login (%s) set wsClientMap[%d] for \n", globalID, wsClientID)
		// hub.WsClientID and hub.ConnectedCallerIp will be set by wsclient.go

		var err error
		globalID,_,err = StoreCalleeInHubMap(urlID, myMultiCallees, remoteAddrWithPort, wsClientID, false)
		if err != nil || globalID == "" {
			fmt.Printf("# /login (%s) StoreCalleeInHubMap(%s) err=%v ver=%s\n",
				globalID, urlID, err, clientVersion)
			fmt.Fprintf(w, "noservice")
			return
		}
		//fmt.Printf("/login (%s) urlID=(%s) rip=%s rt=%v\n",
		//	globalID, urlID, remoteAddr, time.Since(startRequestTime))
	} else {
		// pw check for everyone other than random and duo
		if len(pw) < 6 {
			// guessing more difficult if delayed
			fmt.Printf("/login (%s) pw too short rip=%s ver=%s\n", urlID, remoteAddr, clientVersion)
			time.Sleep(3000 * time.Millisecond)
			fmt.Fprintf(w, "error")
			return
		}

		err := kvMain.Get(dbRegisteredIDs, urlID, &dbEntry)
		if err != nil {
			fmt.Printf("/login (%s) error db=%s bucket=%s rip=%s get registeredID err=%v ver=%s\n",
				urlID, dbMainName, dbRegisteredIDs, remoteAddr, err, clientVersion)
			if strings.Index(err.Error(), "disconnect") >= 0 {
				// TODO admin email notif may be useful
				fmt.Fprintf(w, "error")
				return
			}
			if strings.Index(err.Error(), "timeout") < 0 {
				// pw guessing more difficult if delayed
				time.Sleep(3000 * time.Millisecond)
			}
			fmt.Fprintf(w, "notregistered")
			return
		}
		if pw != dbEntry.Password {
			fmt.Fprintf(os.Stderr, "/login fail id=%s wrong password rip=%s\n", urlID, remoteAddr)
			// must delay to make guessing more difficult
			time.Sleep(3000 * time.Millisecond)
			fmt.Fprintf(w, "error")
			return
		}

		// pw accepted
		dbUserKey = fmt.Sprintf("%s_%d", urlID, dbEntry.StartTime)
		err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
		if err != nil {
			fmt.Printf("# /login (%s) error db=%s bucket=%s get rip=%s err=%v ver=%s\n",
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
			fmt.Printf("# /login (%s) error db=%s bucket=%s put rip=%s err=%v ver=%s\n",
				urlID, dbMainName, dbUserBucket, remoteAddr, err, clientVersion)
			fmt.Fprintf(w, "error")
			return
		}

		// create new unique wsClientID
		wsClientMutex.Lock()
		wsClientID = getNewWsClientID()
		wsClientMutex.Unlock()
		//fmt.Printf("/login set wsClientMap[%d] for ID=(%s)\n", wsClientID, globalID)
		// hub.WsClientID and hub.ConnectedCallerIp will be set by wsclient.go

		globalID,_,err = StoreCalleeInHubMap(urlID, myMultiCallees, remoteAddrWithPort, wsClientID, false)
		if err != nil || globalID == "" {
			fmt.Printf("# /login id=(%s) StoreCalleeInHubMap(%s) err=%v ver=%s\n",
				globalID, urlID, err, clientVersion)
			fmt.Fprintf(w, "noservice")
			return
		}
		//fmt.Printf("/login globalID=(%s) urlID=(%s) rip=%s rt=%v\n",
		//	globalID, urlID, remoteAddr, time.Since(startRequestTime))

		if /*cookie == nil &&*/ !nocookie {
			err,cookieValue := createCookie(w, urlID, pw, &pwIdCombo)
			if err != nil {
				fmt.Printf("# /login persist PwIdCombo error db=%s bucket=%s cookie=%s err=%v ver=%s\n",
					dbHashedPwName, dbHashedPwBucket, cookieValue, err, clientVersion)
				if globalID != "" {
					_,lenGlobalHubMap = DeleteFromHubMap(globalID)
				}
				fmt.Fprintf(w, "noservice")
				return
			}

			if logWantedFor("cookie") {
				fmt.Printf("/login persisted PwIdCombo db=%s bucket=%s key=%s ver=%s\n",
					dbHashedPwName, dbHashedPwBucket, cookieValue, clientVersion)
			}
			//fmt.Printf("/login pwIdCombo stored time=%v\n", time.Since(startRequestTime))
		}
	}

	readConfigLock.RLock()
	myMaxRingSecs := maxRingSecs
	myMaxTalkSecsIfNoP2p := maxTalkSecsIfNoP2p
	readConfigLock.RUnlock()
	var myHubMutex sync.RWMutex
	hub := newHub(myMaxRingSecs, myMaxTalkSecsIfNoP2p, dbEntry.StartTime)
	//fmt.Printf("/login newHub urlID=%s duration %d/%d rt=%v\n",
	//	urlID, maxRingSecs, maxTalkSecsIfNoP2p, time.Since(startRequestTime))

	exitFunc := func(calleeClient *WsClient, comment string) {
		// exitFunc: callee is logging out: release hub and port of this session

		if hub == nil {
			fmt.Printf("exithub (%s) ws=%d hub already closed %s rip=%s ver=%s\n",
				globalID, wsClientID, comment, remoteAddrWithPort, clientVersion)
			return;
		}

		// verify if the old calleeClient.hub.WsClientID is really same as the new wsClientID
		var reqWsClientID uint64 = 0
		if(calleeClient!=nil && calleeClient.hub!=nil) {
			reqWsClientID = calleeClient.hub.WsClientID
		}
		if reqWsClientID != wsClientID {
			// not the same: deny deletion
			fmt.Printf("exithub (%s) abort ws=%d/%d %s rip=%s ver=%s\n",
				globalID, wsClientID, reqWsClientID, comment, remoteAddrWithPort, clientVersion)
			return;
		}

		fmt.Printf("exithub (%s) ws=%d %s %s ver=%s\n",
			globalID, wsClientID, comment, remoteAddrWithPort, clientVersion)

		if dbUserKey!="" {
			// feed LastLogoffTime
			err := kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
			if err != nil {
				fmt.Printf("# exithub (%s) error db=%s bucket=%s get key=%v err=%v\n",
					globalID, dbMainName, dbUserBucket, dbUserKey, err)
			} else {
				// store dbUser with modified LastLogoffTime
				dbUser.LastLogoffTime = time.Now().Unix()
				err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
				if err!=nil {
					fmt.Printf("# exithub (%s) error db=%s bucket=%s put key=%s err=%v\n",
						globalID, dbMainName, dbUserBucket, urlID, err)
				}
			}
		}

		myHubMutex.Lock()
		if hub != nil {
			if globalID != "" {
				_,lenGlobalHubMap = DeleteFromHubMap(globalID)
			}
			hub = nil
		}
		myHubMutex.Unlock()

        wsClientMutex.Lock()
        delete(wsClientMap, wsClientID)
        wsClientMutex.Unlock()
		calleeClient.hub.WsClientID = 0
	}

	hub.exitFunc = exitFunc
	hub.calleeUserAgent = userAgent

	wsClientMutex.Lock()
	myHubMutex.RLock()
	wsClientMap[wsClientID] = wsClientDataType{hub, dbEntry, dbUser, urlID, globalID, clientVersion, false}
	myHubMutex.RUnlock()
	wsClientMutex.Unlock()

	//fmt.Printf("/login newHub store in local hubMap with globalID=%s\n", globalID)
	hubMapMutex.Lock()
	myHubMutex.RLock()
	hubMap[globalID] = hub
	myHubMutex.RUnlock()
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

	fmt.Printf("/login (%s) ws=%v %v rip=%s ver=%s\n",
		urlID, wsClientID, time.Since(startRequestTime), remoteAddrWithPort, clientVersion)

	responseString := fmt.Sprintf("%s|%d|%s|%d|%v",
		wsAddr,                     // 0
		dbUser.ConnectedToPeerSecs, // 1
		outboundIP,                 // 2
		serviceSecs,                // 3
		dbUser.Int2&1 != 0)         // 4 isHiddenCallee
	fmt.Fprintf(w, responseString)

	if urlID != "" && globalID != "" {
		// start a goroutine for max X seconds to check if callee has succefully logged in via ws
		// if hub.CalleeLogin is still false then, do skv.DeleteFromHubMap(globalID)
		// to invalidate this callee/hub
		go func() {
			waitForClientWsConnectSecs := 30
			waitedFor := 0
			for i := 0; i < waitForClientWsConnectSecs; i++ {
				myHubMutex.RLock()
				if hub == nil {
					myHubMutex.RUnlock()
					break
				}
				if hub.CalleeLogin.Get() {
					// this is set when callee sends 'init'
					myHubMutex.RUnlock()
					break
				}
				myHubMutex.RUnlock()

				time.Sleep(1 * time.Second)
				waitedFor++

				hubMapMutex.RLock()
				myHubMutex.Lock()
				hub = hubMap[globalID]
				myHubMutex.Unlock()
				hubMapMutex.RUnlock()

				myHubMutex.RLock()
				if hub == nil {
					// callee is already gone
					myHubMutex.RUnlock()
					break
				}
				myHubMutex.RUnlock()
			}
			// hub.CalleeLogin will be set by callee-client sending "init|"
			myHubMutex.RLock()
			if hub != nil && !hub.CalleeLogin.Get() {
				myHubMutex.RUnlock()

				fmt.Printf("/login (%s/%s) ws-connect timeout %ds ws=%v rip=%s ver=%s ua=%s\n",
					urlID, globalID, waitedFor, wsClientID, remoteAddrWithPort, clientVersion, r.UserAgent())

				// send status msg to callee
				if hub != nil && hub.CalleeClient != nil {
					msg := "Websocket communication problem detected."+
							" Please check your System WebView and network settings."
					hub.CalleeClient.Write([]byte("status|"+msg))
					time.Sleep(2 * time.Second)
				}

				// we must deny the next login attempt of urlID/globalID
				blockMapMutex.Lock()
				blockMap[urlID] = time.Now()
				blockMapMutex.Unlock()

				if globalID != "" {
					//_,lenGlobalHubMap = 
						DeleteFromHubMap(globalID)
				}
				// also unregister callee
				if hub != nil && hub.CalleeClient != nil {
					hub.doUnregister(hub.CalleeClient, "ws-con timeout")
				}
				myHubMutex.RLock()
			}
			myHubMutex.RUnlock()
		}()
	}
	return
}

func createCookie(w http.ResponseWriter, urlID string, pw string, pwIdCombo *PwIdCombo) (error,string) {
	// create new cookie with name=webcallid value=urlID
	// store only if url parameter nocookie is NOT set
	cookieSecret := fmt.Sprintf("%d", rand.Int63n(99999999999))
	if logWantedFor("cookie") {
		fmt.Printf("/login cookieSecret=%s\n", cookieSecret)
	}

	// we need urlID in cookieName only for answie#
	cookieName := "webcallid"
	if strings.HasPrefix(urlID, "answie") {
		cookieName = "webcallid-" + urlID
	}
	expiration := time.Now().Add(6 * 31 * 24 * time.Hour)
	cookieValue := fmt.Sprintf("%s&%s", urlID, string(cookieSecret))
	if logWantedFor("cookie") {
		fmt.Printf("/login create cookie cookieName=(%s) cookieValue=(%s)\n",
			cookieName, cookieValue)
	}
	cookieObj := http.Cookie{Name: cookieName, Value: cookieValue,
		Path:     "/",
		HttpOnly: false,
		SameSite: http.SameSiteStrictMode,
		Expires:  expiration}
	cookie := &cookieObj
	http.SetCookie(w, cookie)
	if logWantedFor("cookie") {
		fmt.Printf("/login cookie (%v) created\n", cookieValue)
	}

	pwIdCombo.Pw = pw
	pwIdCombo.CalleeId = urlID
	pwIdCombo.Created = time.Now().Unix()
	pwIdCombo.Expiration = expiration.Unix()

	skipConfirm := true
	return kvHashedPw.Put(dbHashedPwBucket, cookieValue, pwIdCombo, skipConfirm), cookieValue
}

