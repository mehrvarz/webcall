// WebCall Copyright 2021 timur.mobi. All rights reserved.
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

func httpLogin(w http.ResponseWriter, r *http.Request, urlID string, cookie *http.Cookie, pw string, remoteAddr string, remoteAddrWithPort string, myRequestCount int, nocookie bool, startRequestTime time.Time, pwIdCombo PwIdCombo) {
	//fmt.Printf("/login urlID=(%s) rip=%s id=%d rt=%v\n",
	//	urlID, remoteAddrWithPort, myRequestCount, time.Since(startRequestTime)) // rt=4.393µs

	// reached maxCallees?
	hubMapMutex.RLock()
	lenHubMap := len(hubMap)
	hubMapMutex.RUnlock()
	readConfigLock.RLock()
	myMaxCallees := maxCallees
	readConfigLock.RUnlock()
	if lenHubMap > myMaxCallees {
		fmt.Printf("# /login lenHubMap %d > myMaxCallees %d rip=%s\n", lenHubMap, myMaxCallees, remoteAddr)
		fmt.Fprintf(w, "error")
		return
	}

	readConfigLock.RLock()
	myMultiCallees := multiCallees
	readConfigLock.RUnlock()

	if strings.Index(myMultiCallees, "|"+urlID+"|") < 0 {
		// urlID is NOT a multiCallee user
		// so if it is already logged-in, we must abort
		ejectOn1stFound := true
		reportHiddenCallee := true
		occupy := false
		key, _, _, err := GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
			remoteAddr, occupy, "/login")
		if err != nil {
			fmt.Printf("# /login GetOnlineCallee() err=%v\n", err)
		}
		if key != "" {
			fmt.Fprintf(w, "fatal")
			httpResponseCount++
			fmt.Printf("/login key=(%s) is already logged in rip=%s\n", key, remoteAddr)
			return
		}
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
		}
	}
	// pw must be available now
	if pw == "" {
		fmt.Printf("/login no pw urlID=%s rip=%s ua=%s\n", urlID, remoteAddr, r.UserAgent())
		fmt.Fprintf(w, "error")
		return
	}

	//fmt.Printf("/login pw given urlID=(%s) rip=%s id=%d rt=%v\n",
	//	urlID, remoteAddr, myRequestCount, time.Since(startRequestTime)) // rt=23.184µs
	var dbEntry DbEntry
	var dbUser DbUser
	var wsClientID uint64
	var lenGlobalHubMap int64
	serviceSecs := 0
	globalID := ""

	if strings.HasPrefix(urlID, "random") {
		// ignore
	} else if strings.HasPrefix(urlID, "!") {
		// create new unique wsClientID
		wsClientMutex.Lock()
		wsClientID = getNewWsClientID()
		wsClientMutex.Unlock()
		//fmt.Printf("/login set wsClientMap[%d] for ID=(%s)\n", wsClientID, globalID)
		// hub.WsClientID and hub.ConnectedCallerIp will be set by wsclient.go

		var err error
		globalID,_,err = StoreCalleeInHubMap(urlID, myMultiCallees, remoteAddrWithPort, wsClientID, false)
		if err != nil || globalID == "" {
			fmt.Printf("# /login id=(%s) StoreCalleeInHubMap(%s) err=%v\n", globalID, urlID, err)
			fmt.Fprintf(w, "noservice")
			return
		}
		//fmt.Printf("/login globalID=(%s) urlID=(%s) rip=%s id=%d rt=%v\n",
		//	globalID, urlID, remoteAddr, myRequestCount, time.Since(startRequestTime))
	} else {
		// pw check for everyone other than random and duo
		if len(pw) < 6 {
			// guessing more difficult if delayed
			fmt.Printf("/login pw too short urlID=(%s) rip=%s\n", urlID, remoteAddr)
			time.Sleep(3000 * time.Millisecond)
			fmt.Fprintf(w, "error")
			return
		}

		err := kvMain.Get(dbRegisteredIDs, urlID, &dbEntry)
		if err != nil {
			fmt.Printf("# /login error db=%s bucket=%s key=%s get registeredID err=%v\n",
				dbMainName, dbRegisteredIDs, urlID, err)
			if strings.Index(err.Error(), "disconnect") >= 0 {
				// TODO admin email notif may be useful
				fmt.Fprintf(w, "error")
				return
			}
			if strings.Index(err.Error(), "timeout") < 0 {
				// guessing more difficult if delayed
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
		dbUserKey := fmt.Sprintf("%s_%d", urlID, dbEntry.StartTime)
		err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
		if err != nil {
			fmt.Printf("# /login error db=%s bucket=%s get key=%v err=%v\n",
				dbMainName, dbUserBucket, dbUserKey, err)
			fmt.Fprintf(w, "error")
			return
		}
		//fmt.Printf("/login dbUserKey=%v dbUser.Int=%d (hidden) id=%d rt=%v\n",
		//	dbUserKey, dbUser.Int2, myRequestCount, time.Since(startRequestTime)) // rt=75ms

		// create new unique wsClientID
		wsClientMutex.Lock()
		wsClientID = getNewWsClientID()
		wsClientMutex.Unlock()
		//fmt.Printf("/login set wsClientMap[%d] for ID=(%s)\n", wsClientID, globalID)
		// hub.WsClientID and hub.ConnectedCallerIp will be set by wsclient.go

		globalID,_,err = StoreCalleeInHubMap(urlID, myMultiCallees, remoteAddrWithPort, wsClientID, false)
		if err != nil || globalID == "" {
			fmt.Printf("# /login id=(%s) StoreCalleeInHubMap(%s) err=%v\n", globalID, urlID, err)
			fmt.Fprintf(w, "noservice")
			return
		}
		//fmt.Printf("/login globalID=(%s) urlID=(%s) rip=%s id=%d rt=%v\n",
		//	globalID, urlID, remoteAddr, myRequestCount, time.Since(startRequestTime))

		if cookie == nil && !nocookie {
			err,cookieValue := createCookie(w, urlID, pw, &pwIdCombo)
			if err != nil {
				fmt.Printf("# /login persist PwIdCombo error db=%s bucket=%s cookie=%s err=%v\n",
					dbHashedPwName, dbHashedPwBucket, cookieValue, err)
				if globalID != "" {
					_,lenGlobalHubMap = DeleteFromHubMap(globalID)
				}
				fmt.Fprintf(w, "noservice")
				return
			}

			if logWantedFor("cookie") {
				fmt.Printf("/login persisted PwIdCombo db=%s bucket=%s key=%s\n",
					dbHashedPwName, dbHashedPwBucket, cookieValue)
			}
			//fmt.Printf("/login pwIdCombo stored id=%d time=%v\n",
			//	myRequestCount, time.Since(startRequestTime))
		}
	}

	readConfigLock.RLock()
	myMaxRingSecs := maxRingSecs
	myMaxTalkSecsIfNoP2p := maxTalkSecsIfNoP2p
	readConfigLock.RUnlock()
	var myHubMutex sync.RWMutex
	hub := newHub(myMaxRingSecs, myMaxTalkSecsIfNoP2p, dbEntry.StartTime)
	//fmt.Printf("/login newHub urlID=%s duration %d/%d id=%d rt=%v\n",
	//	urlID, maxRingSecs, maxTalkSecsIfNoP2p, myRequestCount, time.Since(startRequestTime))

	exitFunc := func(calleeClient *WsClient, comment string) {
		// exitFunc: callee is logging out: release hub and port of this session
		myHubMutex.Lock()
		if hub != nil {
			if globalID != "" {
				_,lenGlobalHubMap = DeleteFromHubMap(globalID)
			}
			hub = nil
		}
		myHubMutex.Unlock()

		hubMapMutex.RLock()
		fmt.Printf("exithub callee=%s wsID=%d %s rip=%s\n", globalID, wsClientID, comment, remoteAddrWithPort)
		hubMapMutex.RUnlock()

		wsClientMutex.Lock()
		delete(wsClientMap, wsClientID)
		wsClientMutex.Unlock()
	}

	hub.exitFunc = exitFunc

	wsClientMutex.Lock()
	myHubMutex.RLock()
	wsClientMap[wsClientID] = wsClientDataType{hub, dbEntry, dbUser, urlID, globalID}
	myHubMutex.RUnlock()
	wsClientMutex.Unlock()

	//fmt.Printf("/login newHub store in local hubMap with globalID=%s\n", globalID)
	hubMapMutex.Lock()
	myHubMutex.RLock()
	hubMap[globalID] = hub
	myHubMutex.RUnlock()
	hubMapMutex.Unlock()

	//fmt.Printf("/login run hub id=%s durationSecs=%d/%d id=%d rt=%v\n",
	//	urlID,maxRingSecs,maxTalkSecsIfNoP2p, myRequestCount, time.Since(startRequestTime)) // rt=44ms, 113ms
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

	//hubMapMutex.RLock()
	fmt.Printf("/login callee=%s reqtime=%v rip=%s\n", urlID, time.Since(startRequestTime), remoteAddrWithPort)
	//hubMapMutex.RUnlock()

	responseString := fmt.Sprintf("%s|%d|%s|%d|%v",
		wsAddr,                     // 0
		dbUser.ConnectedToPeerSecs, // 1
		outboundIP,                 // 2
		serviceSecs,                // 3
		dbUser.Int2&1 != 0)         // 4 isHiddenCallee
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
				fmt.Printf("# /login ws-connect timeout %ds removing %s/%s rip=%s\n",
					waitedFor, urlID, globalID, remoteAddrWithPort)
				if globalID != "" {
					//_,lenGlobalHubMap = 
						DeleteFromHubMap(globalID)
				}
				// also Unregister callee
				myHubMutex.RLock()
				if hub != nil && hub.CalleeClient != nil {
					hub.doUnregister(hub.CalleeClient, "ws-con timeout")
				}
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
/*
	if err != nil {
		fmt.Printf("# /login persist PwIdCombo error db=%s bucket=%s cookie=%s err=%v\n",
			dbHashedPwName, dbHashedPwBucket, cookieValue, err)
		if globalID != "" {
			_,lenGlobalHubMap = DeleteFromHubMap(globalID)
		}
		fmt.Fprintf(w, "noservice")
		return
	}

	if logWantedFor("cookie") {
		fmt.Printf("/login persisted PwIdCombo db=%s bucket=%s key=%s\n",
			dbHashedPwName, dbHashedPwBucket, cookieValue)
	}
*/
	//fmt.Printf("/login pwIdCombo stored id=%d time=%v\n",
	//	myRequestCount, time.Since(startRequestTime))
}

