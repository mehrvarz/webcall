// WebCall Copyright 2022 timur.mobi. All rights reserved.
//
// httpOnline() is called by callers via XHR "/rtcsig/online". 
// httpAvail() is called via XHR "/rtcsig/avail".
// httpNewId() is called via XHR "/rtcsig/newid".
// httpRegister() is called via XHR "/rtcsig/register".
//
// These methods provide the functionality for callees to 
// register new accounts. And for callers to call callees.

package main

import (
	"net/http"
	"strings"
	"time"
	"fmt"
	"io"
)

func httpOnline(w http.ResponseWriter, r *http.Request, urlID string, remoteAddr string) {
	// a caller uses this to check if a callee is online and available
	// NOTE: here the variable naming is twisted
	// the caller (calleeID) is trying to find out if the specified callee (urlID) is online
	// if urlID is online, we return it's ws-address (the caller will connect there to call callee)
	ejectOn1stFound := true
	readConfigLock.RLock()
	if strings.Index(multiCallees, "|"+urlID+"|") >= 0 {
		// there may be multiple logins from urlID if listed under config.ini "multiCallees"
		ejectOn1stFound = false
	}
	readConfigLock.RUnlock()

	clientVersion := ""
	url_arg_array, ok := r.URL.Query()["ver"]
	if ok && len(url_arg_array[0]) >= 1 {
		clientVersion = url_arg_array[0]
	}

	callerId := ""
	url_arg_array, ok = r.URL.Query()["callerId"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerId = url_arg_array[0]
	}

	wait := false
	url_arg_array, ok = r.URL.Query()["wait"]
	if ok && len(url_arg_array[0]) >= 1 {
		wait = true
	}

	// we look for urlID either in the local or in the global hubmap
	reportHiddenCallee := true
	reportBusyCallee := true
	if logWantedFor("online") {
		fmt.Printf("/online (%s) %s ver=%s\n", urlID, remoteAddr, clientVersion)
	}
	// TODO fmt.Fprintf(w, "clear")

	glUrlID, locHub, globHub, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee, 
		reportHiddenCallee, remoteAddr, "/online")
	if err != nil {
		// error
		fmt.Printf("# /online GetOnlineCallee(%s/%s) %s ver=%s err=%v\n",
			urlID, glUrlID, remoteAddr, clientVersion, err)
		fmt.Fprintf(w, "error")
		return
	}

	if glUrlID == "" {
		// callee urlID is not online; try to find out for how long
		if logWantedFor("hub") {
			fmt.Printf("/online (%s) glUrlID=empty locHub=%v globHub=%v\n",
				urlID, locHub!=nil, globHub!=nil)
		}
		var secsSinceLogoff int64 = 0
		var dbEntry DbEntry
		err := kvMain.Get(dbRegisteredIDs, urlID, &dbEntry)
		if err != nil {
			// callee urlID does not exist
			// do not log key not found
			if strings.Index(err.Error(),"key not found")<0 {
				fmt.Printf("/online (%s) error (%v) (%s) %s ver=%s ua=%s\n",
					urlID, err, callerId, remoteAddr, clientVersion, r.UserAgent())
			} else {
				// delay brute
				time.Sleep(1000 * time.Millisecond)
			}
			fmt.Fprintf(w, "error")
			return
		}
		//fmt.Printf("/online (%s) avail wsAddr=%s (%s) %s ver=%s\n",
		//	urlID, wsAddr, callerId, remoteAddr, clientVersion)

		dbUserKey := fmt.Sprintf("%s_%d", urlID, dbEntry.StartTime)
		var dbUser DbUser
		err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
		if err != nil {
			fmt.Printf("# /online (%s) error db=%s bucket=%s get key=%v ver=%s err=%v\n",
				urlID, dbMainName, dbUserBucket, dbUserKey, clientVersion, err)
		} else {
			// use dbUser.LastLogoffTime to see how long it has been offline
			secsSinceLogoff = time.Now().Unix() - dbUser.LastLogoffTime
		}
		if secsSinceLogoff>0 && secsSinceLogoff < 8*60 {
			// callee may come back very soon
			if(!wait) {
				if logWantedFor("login") {
					fmt.Printf("/online (%s) offline temp (for %d secs) %s ver=%s ua=%s\n",
						urlID, secsSinceLogoff, remoteAddr, clientVersion, r.UserAgent())
				}
// "notavailtemp" is evaluated by caller.js, which will respond by requesting /online with &wait=true
// and it will start to wait up to 15min for callee to come online
// this &wait= request is handeled below, where also up to 15min will be waited for the caller to come online
// TODO it would be good if we would reduce the wait-time depending on our secsSinceLogoff
// so for example if secsSinceLogoff==7*60, it would make sense to wait only up to (15-7=8) minutes for callee
// however, we would need to deliver the max-wait duration (say, 8min) to the caller
// and the caller would deliver it back with the wait-parameter (currently boolean)
				fmt.Fprintf(w, fmt.Sprintf("notavailtemp%d",secsSinceLogoff))
				return
			}
			// loop: wait for callee
			loopStartTime := time.Now()
			for {
				//if logWantedFor("login") {
				//	fmt.Printf("/online (%s) offline temp, caller waiting... %s\n",
				//		urlID, remoteAddr)
				//}
				time.Sleep(3 * time.Second)
				select {
				case <-r.Context().Done():
					// client gave up
					if logWantedFor("login") {
						fmt.Printf("/online (%s) offline temp, caller wait abort %s\n",
							urlID, remoteAddr)
					}
					return
				default:
					glUrlID, locHub, globHub, err = GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee,
						reportHiddenCallee, remoteAddr, "/online")
					if err != nil {
						// error: something went wrong
						fmt.Printf("# /online GetOnlineCallee(%s/%s) %s ver=%s err=%v\n",
							urlID, glUrlID, remoteAddr, clientVersion, err)
						fmt.Fprintf(w, "error")
						return
					}
					//fmt.Printf("/online (%s) offline temp: glUrlID=(%s) %v %v\n",
					//	urlID, glUrlID, locHub!=nil, globHub!=nil)
				}
				if glUrlID != "" {
					// callee urlID is now online, continue below to return ws/wss url
					break
				}
				if time.Now().Sub(loopStartTime) > 15 * time.Minute {
					// callee still not online: give up waiting
					fmt.Fprintf(w, "notavail")
					return
				}
			}

		} else {
			if secsSinceLogoff>1651395074 { // offline for >=52 years (since 1970)
				if logWantedFor("login") {
					fmt.Printf("/online (%s) offline (was never online) %s ver=%s ua=%s\n",
						urlID, remoteAddr, clientVersion, r.UserAgent())
				}
				fmt.Fprintf(w, "notavail")
				return
			}
			if logWantedFor("login") {
				fmt.Printf("/online (%s) offline (for %d secs) %s ver=%s ua=%s\n",
					urlID, secsSinceLogoff, remoteAddr, clientVersion, r.UserAgent())
			}
			fmt.Fprintf(w, "notavail")
			return
		}
	}

	locHub.HubMutex.RLock()
	if locHub != nil {
		// callee is managed by this server
		if logWantedFor("hub") {
			fmt.Printf("/online (%s/%s) locHub callerIp=%s Caller=%v hidden=%v\n",
				urlID, glUrlID, locHub.ConnectedCallerIp, locHub.CallerClient!=nil, locHub.IsCalleeHidden)
		}

		if locHub.ConnectedCallerIp != "" {
			// this callee (urlID/glUrlID) is online but currently busy
			fmt.Printf("/online (%s) busy callerIp=%s %s ver=%s\n",
				urlID, locHub.ConnectedCallerIp, remoteAddr, clientVersion)
			locHub.HubMutex.RUnlock()
			fmt.Fprintf(w, "busy")
			return
		}

		if locHub.IsCalleeHidden && locHub.IsUnHiddenForCallerAddr != remoteAddr {
			fmt.Printf("/online (%s) notavail (hidden) %s ver=%s ua=%s\n",
				urlID, remoteAddr, clientVersion, r.UserAgent())
			locHub.HubMutex.RUnlock()
			fmt.Fprintf(w, "notavail")
			return
		}

		wsClientID := locHub.WsClientID // set by wsClient serve()
		if wsClientID == 0 {
			// this seems to happen when urlID has not logged in or is just now logging in but not finished
			// just act as if (urlID) is not curretly online
			locHub.HubMutex.RUnlock()
			fmt.Printf("/online (%s) notavail ws=0 %s ver=%s\n", urlID, remoteAddr, clientVersion)
			fmt.Fprintf(w, "notavail")
			return
		}

		wsAddr := fmt.Sprintf("ws://%s:%d/ws", hostname, wsPort)
		readConfigLock.RLock()
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
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
		if logWantedFor("login") {
			if !strings.HasPrefix(glUrlID,"answie") && !strings.HasPrefix(glUrlID,"talkback") {
				fmt.Printf("/online (%s) avail wsAddr=%s %s <- %s (%s) ver=%s ua=%s\n",
					glUrlID, wsAddr, locHub.CalleeClient.RemoteAddr,
					remoteAddr, callerId, clientVersion, r.UserAgent())
			}
		}
		locHub.HubMutex.RUnlock()
		fmt.Fprintf(w, wsAddr)
		return
	}

	if globHub != nil {
		// callee is managed by a remote server
		if globHub.ConnectedCallerIp != "" {
			// this callee (urlID/glUrlID) is online but currently busy
			fmt.Printf("/online (%s/%s) busy callerIp=(%s) %s ver=%s ua=%s\n",
				urlID, glUrlID, globHub.ConnectedCallerIp, remoteAddr, clientVersion, r.UserAgent())
			fmt.Fprintf(w, "busy")
			return
		}

		wsClientID := globHub.WsClientID
		if wsClientID == 0 {
			// something has gone wrong
			fmt.Printf("# /online (%s/%s) glob ws=0 %s ver=%s\n",
				urlID, glUrlID, remoteAddr, clientVersion)
			// clear global ConnectedCallerIp
			err := StoreCallerIpInHubMap(glUrlID, "", false)
			if err!=nil {
				fmt.Printf("# /online (%s/%s) rkv.StoreCallerIpInHubMap err=%v\n", urlID, glUrlID, err)
			}
			fmt.Fprintf(w, "error")
			return
		}

		wsAddr = globHub.WsUrl
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			wsAddr = globHub.WssUrl
		}
		wsAddr = fmt.Sprintf("%s?wsid=%d", wsAddr, wsClientID)
		if logWantedFor("login") {
			if !strings.HasPrefix(glUrlID,"answie") && !strings.HasPrefix(glUrlID,"talkback") {
				fmt.Printf("/online (%s) avail wsAddr=%s (%s) %s ver=%s ua=%s\n",
					glUrlID, wsAddr, callerId, remoteAddr, clientVersion, r.UserAgent())
			}
		}
		fmt.Fprintf(w, wsAddr)
		return
	}

	// something has gone wrong - callee not found anywhere
	fmt.Printf("# /online (%s/%s) not found (%s) %s ver=%s\n",
		urlID, glUrlID, callerId, remoteAddr, clientVersion)

	// clear ConnectedCallerIp
	StoreCallerIpInHubMap(glUrlID, "", false)
	fmt.Fprintf(w, "error")
	return
}

func httpAvail(w http.ResponseWriter, r *http.Request, urlID string, urlPath string, remoteAddr string) {
	checkID := urlPath[7:]
	if !allowNewAccounts {
		fmt.Printf("# /avail (%s) !allowNewAccounts rip=%s\n",checkID,remoteAddr)
	} else {
		// checks if ID is free to be registered for a new calle
		// this is NOT the case if it is listed as registered or blocked
		fmt.Printf("/avail (%s) rip=%s\n",checkID,remoteAddr)
		var dbEntryBlocked DbEntry
		// checkID is blocked in dbBlockedIDs
		err := kvMain.Get(dbBlockedIDs,checkID,&dbEntryBlocked)
		if err!=nil {
			// id is not listed in dbBlockedIDs
			fmt.Printf("/avail (%s) not found in dbBlockedIDs\n",checkID)
			var dbEntryRegistered DbEntry
			err := kvMain.Get(dbRegisteredIDs,checkID,&dbEntryRegistered)
			if err!=nil {
				// id is not listed in dbRegisteredIDs
				//fmt.Printf("avail check id=%s not found in dbRegisteredIDs\n",checkID)
				fmt.Printf("/avail (%s) for rip=%s is positive\n",checkID,remoteAddr)
				fmt.Fprintf(w, "true")
				return
			}
			fmt.Printf("/avail (%s) found in dbRegisteredIDs\n",checkID)
		}
		// id is listed in dbBlockedIDs
		// but if it is blocked by the same remoteAddr then we provide access of course
		if dbEntryBlocked.Ip==remoteAddr {
			fmt.Printf("/avail (%s) with SAME rip=%s is positive\n",checkID,remoteAddr)
			fmt.Fprintf(w, "true")
			return
		}
		fmt.Printf("/avail (%s) for rip=%s is negative\n",checkID,remoteAddr)
	}
	fmt.Fprintf(w, "false")
	return
}

func httpNewId(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, remoteAddr string) {
	// get a random ID that is not yet used in hubmap
	if !allowNewAccounts {
		fmt.Printf("# /newid !allowNewAccounts\n")
		return
	}

// TODO begrenzen, wie oft eine ip /newid aufrufen kann

	tmpCalleeID,err := GetRandomCalleeID()
	if err!=nil {
		fmt.Printf("# /newid GetRandomCalleeID err=%v\n",err)
		return
	}
	// NOTE tmpCalleeID is currently free, but it is NOT reserved

	clientVersion := ""
	url_arg_array, ok := r.URL.Query()["ver"]
	if ok && len(url_arg_array[0]) >= 1 {
		clientVersion = url_arg_array[0]
	}
	if logWantedFor("login") {
		fmt.Printf("/newid (%s) generated %s ver=%s ua=%s\n",
			tmpCalleeID, remoteAddr, clientVersion, r.UserAgent())
	}
	time.Sleep(1 * time.Second)
	fmt.Fprintf(w, tmpCalleeID)
	return
}

func httpRegister(w http.ResponseWriter, r *http.Request, urlID string, urlPath string, remoteAddr string, startRequestTime time.Time) {
	if allowNewAccounts {
		registerID := urlPath[10:]
		argIdx := strings.Index(registerID,"&")
		if argIdx>=0 {
			registerID = registerID[0:argIdx]
		}

		clientVersion := ""
		url_arg_array, ok := r.URL.Query()["ver"]
		if ok && len(url_arg_array[0]) >= 1 {
			clientVersion = url_arg_array[0]
		}

		if registerID=="" {
			fmt.Printf("# /register fail no ID urlPath=(%s) %s ver=%s ua=%s\n",
				urlPath, remoteAddr, clientVersion, r.UserAgent())
			return
		}

		fmt.Printf("/register (%s) %s ver=%s ua=%s\n",
			registerID, remoteAddr, clientVersion, r.UserAgent())

		postBuf := make([]byte, 128)
		length,_ := io.ReadFull(r.Body, postBuf)
		if length>0 {
			pw := ""
			pwData := string(postBuf[:length])
			pwData = strings.ToLower(pwData)
			pwData = strings.TrimSpace(pwData)
			pwData = strings.TrimRight(pwData,"\r\n")
			pwData = strings.TrimRight(pwData,"\n")
			if strings.HasPrefix(pwData,"pw=") {
				pw = pwData[3:]
			}
			// deny if pw is too short or not valid
			if len(pw)<6 {
				fmt.Printf("/register (%s) fail pw too short\n",registerID)
				fmt.Fprintf(w, "too short")
				return
			}
			//fmt.Printf("register pw=%s(%d)\n",pw,len(pw))

			// this can be a fake request
			// we need to verify if registerID is in use
			var dbEntryRegistered DbEntry
			err := kvMain.Get(dbRegisteredIDs,registerID,&dbEntryRegistered)
			if err==nil {
				// registerID is already registered
				fmt.Printf("/register (%s) fail db=%s bucket=%s get already registered\n",
					registerID, dbMainName, dbRegisteredIDs)
				fmt.Fprintf(w, "was already registered")
				return
			}

			unixTime := startRequestTime.Unix()
			dbUserKey := fmt.Sprintf("%s_%d",registerID, unixTime)
			dbUser := DbUser{Ip1:remoteAddr, UserAgent:r.UserAgent()}
			err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
			if err!=nil {
				fmt.Printf("# /register (%s) error db=%s bucket=%s put err=%v\n",
					registerID, dbMainName, dbUserBucket, err)
				fmt.Fprintf(w,"cannot register user")
			} else {
				err = kvMain.Put(dbRegisteredIDs, registerID,
						DbEntry{unixTime, remoteAddr, pw}, false)
				if err!=nil {
					fmt.Printf("# /register (%s) error db=%s bucket=%s put err=%v\n",
						registerID,dbMainName,dbRegisteredIDs,err)
					fmt.Fprintf(w,"cannot register ID")
					// TODO this is bad! got to role back kvMain.Put((dbUser...) from above
				} else {
					//fmt.Printf("/register (%s) db=%s bucket=%s stored OK\n",
					//	registerID, dbMainName, dbRegisteredIDs)
					// registerID is now available for use
					var pwIdCombo PwIdCombo
					err,cookieValue := createCookie(w, registerID, pw, &pwIdCombo)
					if err!=nil {
						fmt.Printf("/register (%s) create cookie error cookie=%s err=%v\n",
							registerID, cookieValue, err)
						// not fatal, but user needs to enter pw again now
					}

					// preload contacts with 2 Answie accounts
					var callerInfoMap map[string]string // callerID -> name
					err = kvContacts.Get(dbContactsBucket, registerID, &callerInfoMap)
					if err!=nil {
						callerInfoMap = make(map[string]string)
					}
					callerInfoMap["answie"] = "Answie Spoken"
					callerInfoMap["answie7"] = "Answie Jazz"
					err = kvContacts.Put(dbContactsBucket, registerID, callerInfoMap, false)
					if err!=nil {
						fmt.Printf("# /register (%s) kvContacts.Put err=%v\n", registerID, err)
					} else {
						//fmt.Printf("/register (%s) kvContacts.Put OK\n", registerID)
					}

					fmt.Fprintf(w, "OK")
				}
			}
		}
	} else {
		fmt.Printf("# /register newAccounts not allowed urlPath=(%s) %s ua=%s\n",
			urlPath, remoteAddr, r.UserAgent())
	}
	return
}

