// Copyright 2021 timur.mobi. All rights reserved.
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
	"runtime"
	"github.com/mehrvarz/webcall/skv"
	"github.com/mehrvarz/webcall/rkv"
)

func httpLogin(w http.ResponseWriter, r *http.Request, urlID string, cookie *http.Cookie, pw string, remoteAddr string, remoteAddrWithPort string, myRequestCount int, nocookie bool, startRequestTime time.Time, pwIdCombo PwIdCombo) {
	// this is used by callee.js
	// if client arrives with cookie + is already logged in, then this is just starting a new ws-con

	// each caller-callee session spawns two goroutines: 1 hub-manager and 1 ws-server

	// the caller-id is 100% public; everyone can see it
	// callee must log in with a pw in addition to it's urlID
	// both clients will use the new port (/rtcsig/(caller-id) will return the callee-port)

	//fmt.Printf("/login urlID=(%s) rip=%s id=%d rt=%v\n",
	//	urlID, remoteAddrWithPort, myRequestCount, time.Since(startRequestTime)) // rt=4.393µs

	// deny bot's
	referer := r.Referer()
	if strings.Index(referer, "bot") >= 0 ||
		strings.Index(referer, "search") >= 0 ||
		strings.Index(referer, "facebook") >= 0 {
		fmt.Printf("# /login by bot denied referer=(%s) urlID=(%s) rip=%s\n",
			referer, urlID, remoteAddr)
		return
	}

	readConfigLock.RLock()
	if strings.Index(multiCallees, "|"+urlID+"|") < 0 {
		readConfigLock.RUnlock()
		// this urlID is NOT listed in multiCallees
		// so if it is already logged-in, we must abort
		ejectOn1stFound := true
		reportHiddenCallee := true
		occupy := false
		key := ""
		var err error
		if rtcdb == "" {
			key, _, _ = GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
				remoteAddr, occupy, "/login")
		} else {
			key, _, err = rkv.GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
				remoteAddr, occupy, "/login")
			if err != nil {
				fmt.Printf("# /login GetOnlineCallee() err=%v\n", err)
			} else {
				//fmt.Printf("/login new urlID=(%s) rip=%s id=%d time=%v\n",
				//	urlID, remoteAddrWithPort, myRequestCount, time.Since(startRequestTime))
			}
		}
		if key != "" {
			fmt.Fprintf(w, "fatal")
			httpResponseCount++
			fmt.Printf("# /login key=(%s) is already logged in rip=%s\n", key, remoteAddr)
			return
		}
	} else {
		readConfigLock.RUnlock()
		// for a multiCallee user we don't need to call GetOnlineCallee
		// bc for them "already logged-in" doesn't matter
	}

	if cookie == nil || pw == "" {
		// get callee-pw from post
		cookie = nil
		pw = ""
		postBuf := make([]byte, 128)
		length, _ := io.ReadFull(r.Body, postBuf)
		if length > 0 {
			var pwData = string(postBuf[:length])
			pwData = strings.ToLower(pwData)
			pwData = strings.TrimSpace(pwData)
			if strings.HasPrefix(pwData, "pw=") {
				pwData = strings.TrimRight(pwData, "\r\n")
				pwData = strings.TrimRight(pwData, "\n")
				pw = pwData[3:]
			}
			//fmt.Printf("/login urlID=(%s) get pw from http post\n", urlID)
		}
	}
	// a pw must now exist
	if pw == "" {
		fmt.Fprintf(w, "error")
		fmt.Printf("# /login urlID=(%s) rip=%s no pw (ua=%s)\n",
			urlID, remoteAddr, r.UserAgent())
		return
	}

	// no time lost until here
	//fmt.Printf("/login pw given urlID=(%s) rip=%s id=%d rt=%v\n",
	//	urlID, remoteAddr, myRequestCount, time.Since(startRequestTime)) // rt=23.184µs
	var dbEntry skv.DbEntry
	var dbUser skv.DbUser
	var wsClientID uint64
	var lenGlobalHubMap int64
	serviceSecs := 0
	globalID := ""

	if !strings.HasPrefix(urlID, "random") && !strings.HasPrefix(urlID, "!") {
		// pw check for everyone other than random and duo
		// if pw is not valid (or just too short) abort
		if len(pw) < 6 {
			// must delay to make guessing more difficult
			fmt.Printf("/login pw too short urlID=(%s) rip=%s\n", urlID, remoteAddr)
			time.Sleep(3000 * time.Millisecond)
			fmt.Fprintf(w, "error")
			return
		}

		err := kvMain.Get(dbRegisteredIDs, urlID, &dbEntry) // costly A 40ms
		if err != nil {
			fmt.Printf("# /login error db=%s bucket=%s key=%s get registeredID err=%v\n",
				dbMainName, dbRegisteredIDs, urlID, err)
			if strings.Index(err.Error(), "disconnect") >= 0 {
				// TODO admin email notif (but not a 1000 times)
				fmt.Fprintf(w, "error")
				return
			}
			if strings.Index(err.Error(), "timeout") < 0 {
				// not disconnect and not timeout: delay response to make pw-guessing more difficult
				time.Sleep(3000 * time.Millisecond)
			}
			fmt.Fprintf(w, "notregistered")
			return
		}

		//fmt.Printf("/login pw=%s dbEntry.Password=%s\n",pw,dbEntry.Password)
		if pw != dbEntry.Password {
			// we need to log the pw here, so we can see what is the issue
			fmt.Fprintf(os.Stderr, "# /login fail id=%s pw %s(%d) != %s(%d)\n",
				urlID, pw, len(pw), dbEntry.Password, len(dbEntry.Password))
			// must delay to make guessing more difficult
			time.Sleep(3000 * time.Millisecond)
			fmt.Fprintf(w, "error")
			return
		}

		// don't log successful pw
		//fmt.Printf("/login pw accepted %s==%s\n", pw, dbEntry.Password)
		//fmt.Printf("/login pw accepted urlID=(%s) rip=%s id=%d rt=%v\n",
		//	urlID, remoteAddr, myRequestCount, time.Since(startRequestTime)) // rt=40ms

		// in addition to the port we also want to deliver
		// ConnectedToPeerSecs (PermittedConnectedToPeerSecs)
		// now-StartTime (DurationSecs)
		dbUserKey := fmt.Sprintf("%s_%d", urlID, dbEntry.StartTime)
		err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser) // costly B 35ms
		if err != nil {
			fmt.Printf("# /login error db=%s bucket=%s get key=%v err=%v\n",
				dbMainName, dbUserBucket, dbUserKey, err)
			fmt.Fprintf(w, "error")
			return
		}
		//fmt.Printf("/login dbUserKey=%v dbUser.Int=%d (hidden) id=%d rt=%v\n",
		//	dbUserKey, dbUser.Int2, myRequestCount, time.Since(startRequestTime)) // rt=75ms

		if dbUser.ConnectedToPeerSecs >= dbUser.PermittedConnectedToPeerSecs {
			fmt.Printf("# /login error no talk time (%d >= %d)\n",
				dbUser.ConnectedToPeerSecs, dbUser.PermittedConnectedToPeerSecs)
			fmt.Fprintf(w, "noservice")
			return
		}

		serviceSecs = int(startRequestTime.Unix() - dbEntry.StartTime)
		if serviceSecs >= dbEntry.DurationSecs {
			fmt.Printf("# /login error no service time (%d >= %d)\n",
				serviceSecs, dbEntry.DurationSecs)
			fmt.Fprintf(w, "noservice")
			return
		}

		// create a new unique wsClientID
		wsClientMutex.Lock()
		wsClientID = getNewWsClientID()
		wsClientMutex.Unlock()
		//fmt.Printf("/login set wsClientMap[%d] for ID=(%s)\n", wsClientID, globalID)
		// hub.WsClientID and hub.ConnectedCallerIp will be set by wsclient.go

		if rtcdb != "" {
			// NOTE: globalID will be globaly unique and will differ from urlID ("answie" -> "answie!94874")
			//       globalID will be stored in hub.calleeID
			//       urlID    will be stored in client.calleeID
			// NOTE: skvHub.ServerIpAddr will be set automatically by rkv.StoreCalleeInHubMap()
			// NOTE: skvHub.ClientIpAddr will be uploaded via StoreCalleeInHubMap() and used as global hub
			// NOTE: ClientIpAddr in the global hub will be used for turn auth (via SearchIpInHubMap)
			var rkvHub rkv.Hub
			rkvHub.ClientIpAddr = remoteAddrWithPort //remoteAddr

			readConfigLock.RLock()
			rkvHub.WsUrl = fmt.Sprintf("ws://%s:%d/ws", hostname, wsPort)
			if wsUrl != "" {
				rkvHub.WsUrl = wsUrl
			}
			rkvHub.WssUrl = fmt.Sprintf("wss://%s:%d/ws", hostname, wsPort)
			if wssUrl != "" {
				rkvHub.WssUrl = wssUrl
			}
			readConfigLock.RUnlock()

			rkvHub.WsClientID = wsClientID

			readConfigLock.RLock()
			myMultiCallees := multiCallees
			readConfigLock.RUnlock()

			globalID, lenGlobalHubMap, err =
				rkv.StoreCalleeInHubMap(urlID, &rkvHub, myMultiCallees, false) // costly C 37ms
			if err != nil || globalID == "" {
				fmt.Printf("# /login id=(%s) rkv.StoreCalleeInHubMap(%s) err=%v\n", globalID, urlID, err)
				fmt.Fprintf(w, "noservice")
				return
			}
		} else {
			globalID = urlID
		}

		//fmt.Printf("/login globalID=(%s) rip=%s id=%d rt=%v\n",
		//	globalID, remoteAddr, myRequestCount, time.Since(startRequestTime))	// rt=44ms, 112ms
		// no cost between here and /login run hub

		if cookie == nil && !nocookie {
			// create new cookie with name=webcallid value=urlID
			// store only if url parameter nocookie is NOT set
			cookieSecret := fmt.Sprintf("%d", rand.Int63n(99999999999))
			if logWantedFor("cookie") {
				fmt.Printf("/login cookieSecret=%s id=%d time=%v\n",
					cookieSecret, myRequestCount, time.Since(startRequestTime))
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
			cookie = &cookieObj
			http.SetCookie(w, cookie) // no cost
			if logWantedFor("cookie") {
				fmt.Printf("/login cookie (%v) created id=%d rt=%v\n",
					cookieValue, myRequestCount, time.Since(startRequestTime)) // rt=44ms, 112ms
			}

			pwIdCombo.Pw = pw
			pwIdCombo.CalleeId = urlID // TODO or globalID?
			pwIdCombo.Created = time.Now().Unix()
			pwIdCombo.Expiration = expiration.Unix()

			skipConfirm := true // low cost
			err = kvHashedPw.Put(dbHashedPwBucket, cookieValue, pwIdCombo, skipConfirm)
			if err != nil {
				fmt.Printf("# /login persist PwIdCombo error db=%s bucket=%s cookie=%s err=%v\n",
					dbHashedPwName, dbHashedPwBucket, cookieValue, err)
				if globalID != "" {
					hubMapMutex.Lock()
					delete(hubMap, globalID)
					hubMapMutex.Unlock()

					if rtcdb != "" {
						count, err := rkv.DeleteFromHubMap(globalID)
						if err != nil {
							fmt.Printf("# /login DeleteFromHubMap id=%s err=%v\n", globalID, err)
						} else {
							lenGlobalHubMap = count
						}
					}
				}
				fmt.Fprintf(w, "noservice")
				return
			}

			if logWantedFor("cookie") {
				fmt.Printf("/login persisted PwIdCombo db=%s bucket=%s key=%s\n",
					dbHashedPwName, dbHashedPwBucket, cookieValue)
			}

			// TODO once in a while (far less often than 3m-loop; more like 1x per day)
			// we need to delete entries that have expired (see pwIdCombo.Expiration)
			//fmt.Printf("/login pwIdCombo stored id=%d time=%v\n",
			//	myRequestCount, time.Since(startRequestTime))
		}
	}

	durationSecs1 := 0 // 0=unlimited
	durationSecs2 := 0 // 0=unlimited
	if strings.HasPrefix(urlID, "answie") {
		//durationSecs1 = 60
		durationSecs2 = 300
	} else if strings.HasPrefix(urlID, "random") || strings.HasPrefix(urlID, "!") {
		durationSecs1 = randomCallerWaitSecs
		durationSecs2 = randomCallerCallSecs
	}

	var myHubMutex sync.RWMutex
	hub := newHub(globalID, durationSecs1, durationSecs2,
		dbEntry.StartTime, nil) // no cpu cost
	if hub == nil {
		fmt.Printf("# /login create newhub fail id=%s/%s\n", urlID, globalID)
		if globalID != "" {
			hubMapMutex.Lock()
			delete(hubMap, globalID)
			hubMapMutex.Unlock()

			if rtcdb != "" {
				count, err := rkv.DeleteFromHubMap(globalID)
				if err != nil {
					fmt.Printf("# /login DeleteFromHubMap id=%s err=%v\n", globalID, err)
				} else {
					lenGlobalHubMap = count
				}
			}
		}
		fmt.Fprintf(w, "noservice")
		return
	}

	//fmt.Printf("/login newHub urlID=%s duration %d/%d id=%d rt=%v\n",
	//	urlID, durationSecs1, durationSecs2, myRequestCount, time.Since(startRequestTime))
	exitFunc := func(calleeClient *WsClient, comment string) {
		// exitFunc: callee is logging out: release hub and port of this session

		if dbEntry.StartTime > 0 && dbEntry.Password == "" {
			// a callee without a password (single test user) is now being logging out
			/* TODO?
			remoteAddr2 := ""
			if calleeClient!=nil {
				// calleeClient.remoteAddr is the IP from STUN
				remoteAddr2 = calleeClient.RemoteAddr
				// cut off :port from remoteAddr2
				idxPort := strings.Index(remoteAddr2,":")
				if idxPort>=0 {
					remoteAddr2 = remoteAddr2[:idxPort]
				}
			}
			if remoteAddr2!="" {
				remoteAddr = remoteAddr2
			}
			*/
			// mark calleeID as busy for a while
			// 1. so that nobody calls the next guy trying to call the prev guy
			// 2. so that noone else can pay-subscribe this id but the same guy with the same ip?
			// 3. so that non-paying subscriber don't get to keep the same ID
			if rtcdb != "" {
				err := kvMain.Put(dbBlockedIDs, urlID,
					skv.DbEntry{dbEntry.StartTime, freeAccountBlockSecs, remoteAddr, ""}, true) // skipConfirm
				if err != nil {
					fmt.Printf("# exitFunc error db=%s bucket=%s block key=%s err=%v\n",
						dbMainName, dbBlockedIDs, urlID, err)
				} else {
					//fmt.Printf("exitFunc db=%s bucket=%s now blocked key=%s\n",
					//	dbMainName, dbBlockedIDs, urlID)
				}
			}
		}

		myHubMutex.Lock()
		if hub != nil {
			if globalID != "" {
				hubMapMutex.Lock()
				delete(hubMap, globalID)
				hubMapMutex.Unlock()

				if rtcdb != "" {
					count, err := rkv.DeleteFromHubMap(globalID)
					if err != nil {
						fmt.Printf("# exitFunc id=%s rkv.DeleteFromHubMap() err=%v\n", globalID, err)
					} else {
						lenGlobalHubMap = count
					}
				}
			}
			hub = nil
		} else {
			// this may happen if exitFunc is being called twice for the same callee
			//fmt.Printf("# exitFunc hub==nil wsClientMap[wsClientID=%d] user=%d/%d (%s)\n",
			//	wsClientID, len(hubMap), lenGlobalHubMap, comment)
		}
		myHubMutex.Unlock()

		hubMapMutex.RLock()
		fmt.Printf("exithub %s wsID=%d %d/%d %s rip=%s\n",
			globalID, wsClientID, len(hubMap), lenGlobalHubMap, comment, remoteAddr)
		hubMapMutex.RUnlock()

		wsClientMutex.Lock()
		delete(wsClientMap, wsClientID)
		wsClientMutex.Unlock()
	}

	hub.exitFunc = exitFunc

	wsClientMutex.Lock()
	myHubMutex.RLock()
	wsClientMap[wsClientID] = wsClientDataType{hub, dbEntry, dbUser, urlID}
	myHubMutex.RUnlock()
	wsClientMutex.Unlock()

	//fmt.Printf("/login newHub store in local hubMap with globalID=%s\n", globalID)
	// NOTE: urlID as key would not be unique (answie/answie!1030569238)
	// TODO why do we not use StoreCalleeInHubMap() ?
	//		globalID, lenGlobalHubMap, err = StoreCalleeInHubMap(urlID, &hub, myMultiCallees, false)
	// TODO do we need to set hub.ServerIpAddr ?
	//		if hub.ServerIpAddr == "" {
	//			hub.ServerIpAddr = skv.MyOutBoundIpAddr
	//		}
	hubMapMutex.Lock()
	myHubMutex.RLock()
	hubMap[globalID] = hub
	myHubMutex.RUnlock()
	hubMapMutex.Unlock()

	//fmt.Printf("/login run hub id=%s durationSecs=%d/%d id=%d rt=%v\n",
	//	urlID,durationSecs1,durationSecs2, myRequestCount, time.Since(startRequestTime)) // rt=44ms, 113ms
	myHubMutex.RLock()
	if hub.durationSecs1 != 0 {
		hub.setDeadline(hub.durationSecs1)
	}
	myHubMutex.RUnlock()

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

	hubMapMutex.RLock()
	fmt.Printf("/login %s %d/%d %d go=%d rt=%v rip=%s\n",
		urlID,
		len(hubMap),
		lenGlobalHubMap,
		myRequestCount,
		runtime.NumGoroutine(),       // rt=63ms, 147ms
		time.Since(startRequestTime), // 90% of this is the time spent talking to rtcdb
		remoteAddrWithPort)
	hubMapMutex.RUnlock()

	responseString := fmt.Sprintf("%s|%d|%d|%d|%d|%d|%v",
		wsAddr,
		dbUser.ConnectedToPeerSecs,
		dbUser.PermittedConnectedToPeerSecs,
		serviceSecs, //remainingServiceSecs,
		dbEntry.DurationSecs,
		dbUser.PremiumLevel,
		dbUser.Int2&1 != 0) // isHiddenCallee
	fmt.Fprintf(w, responseString)

	httpRequestCountMutex.Lock()
	httpResponseTime = time.Since(startRequestTime)
	httpRequestCountMutex.Unlock()

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
				//if i==0 {
				//	fmt.Printf("/login checking callee id=%s for activiy in the next %ds...\n",
				//		urlID, waitForClientWsConnectSecs)
				//}
			}
			// hub.CalleeLogin will be set by callee-client sending "init|"
			myHubMutex.RLock()
			if hub != nil && !hub.CalleeLogin.Get() {
				myHubMutex.RUnlock()
				fmt.Printf("/login ws-connect timeout %ds removing %s/%s rip=%s\n",
					waitedFor, urlID, globalID, remoteAddr)
				if globalID != "" {
					hubMapMutex.Lock()
					delete(hubMap, globalID)
					hubMapMutex.Unlock()

					if rtcdb != "" {
						count, err := rkv.DeleteFromHubMap(globalID)
						if err != nil {
							fmt.Printf("# /login ws-connect DeleteFromHubMap id=%s err=%v\n", globalID, err)
						} else {
							lenGlobalHubMap = count
						}
					}
				}
				// also Unregister callee
				myHubMutex.RLock()
				if hub != nil && hub.CalleeClient != nil {
					hub.doUnregister(hub.CalleeClient, "ws-con timeout")
				}
			} else {
				// all is well, callee client has logged in (or is gone already)
				//fmt.Printf("/login detected client activity from id=%s\n",globalID)
			}
			myHubMutex.RUnlock()
		}()
	}
	return
}

