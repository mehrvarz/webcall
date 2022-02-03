// WebCall Copyright 2021 timur.mobi. All rights reserved.
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

	// we look for urlID either in the local or in the global hubmap
	reportHiddenCallee := false
	occupy := false
	if logWantedFor("online") {
		fmt.Printf("/online urlID=%s rip=%s\n", urlID, remoteAddr)
	}
	glUrlID, locHub, globHub, err := GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
		remoteAddr, occupy, "/online")
	if err != nil {
		// error
		fmt.Printf("# /online GetOnlineCallee(%s/%s) err=%v rip=%s\n", urlID, glUrlID, err, remoteAddr)
		fmt.Fprintf(w, "error")
		return
	}
/*
	if locHub == nil && globHub == nil {
		// unknown urlID
		fmt.Printf("/online callee(%s/%s) not online rip=%s\n", urlID, glUrlID, remoteAddr)
		fmt.Fprintf(w, "unknown")
		return
	}
*/
	if glUrlID == "" {
		// callee urlID is currently NOT online (this is not an error)
		// try to find out how long it has been offline
		var secsSinceLogoff int64 = 0
		var dbEntry DbEntry
		err := kvMain.Get(dbRegisteredIDs, urlID, &dbEntry)
		if err != nil {
			fmt.Printf("# /online error db=%s get key=%v err=%v\n", dbRegisteredIDs, urlID, err)
		} else {
			dbUserKey := fmt.Sprintf("%s_%d", urlID, dbEntry.StartTime)
			var dbUser DbUser
			err := kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
			if err != nil {
				fmt.Printf("# /online error db=%s bucket=%s get key=%v err=%v\n",
					dbMainName, dbUserBucket, dbUserKey, err)
			} else {
				// use dbUser.LastLogoffTime to see how long it has been offline
				secsSinceLogoff = time.Now().Unix() - dbUser.LastLogoffTime
			}
		}
		fmt.Printf("/online callee %s is offline (for %d secs) rip=%s\n", urlID, secsSinceLogoff, remoteAddr)
		if(secsSinceLogoff>0 && secsSinceLogoff < 15*60) {
			// callee may come back very soon
			fmt.Fprintf(w, "notavailtemp")
			return
		}
		fmt.Fprintf(w, "notavail")
		return
	}

/* this code can go
	callerID := ""
	url_arg_array, ok := r.URL.Query()["callerId"]
	if ok && len(url_arg_array[0]) > 0 {
		callerID = strings.ToLower(url_arg_array[0])
	}

	callerName := ""
	url_arg_array, ok = r.URL.Query()["name"]
	if ok && len(url_arg_array[0]) > 0 {
		callerName = strings.ToLower(url_arg_array[0])
	}
*/
	if locHub != nil {
		// callee is managed by this server
fmt.Printf("/online locHub.ConnectedCallerIp=%s locHub.CallerClient=%v\n",
	locHub.ConnectedCallerIp,locHub.CallerClient!=nil)

		if locHub.ConnectedCallerIp != "" {
			// this callee (urlID/glUrlID) is online but currently busy
			fmt.Printf("/online busy for (%s/%s) callerIp=(%s) rip=%s\n",
				urlID, glUrlID, locHub.ConnectedCallerIp, remoteAddr)
			fmt.Fprintf(w, "busy")
			return
		}

		locHub.HubMutex.RLock()
		wsClientID := locHub.WsClientID
		locHub.HubMutex.RUnlock()
		if wsClientID == 0 {
			// something has gone wrong
			fmt.Printf("# /online loc wsClientID==0 id=(%s/%s) rip=%s\n",
				urlID, glUrlID, remoteAddr)
			// clear local ConnectedCallerIp
			locHub.HubMutex.Lock()
			locHub.ConnectedCallerIp = ""
			locHub.HubMutex.Unlock()
			fmt.Fprintf(w, "error")
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
		if logWantedFor("wsAddr") {
			fmt.Printf("/online callee=%s avail %s rip=%s\n", glUrlID, wsAddr, remoteAddr)
		} else {
			fmt.Printf("/online callee=%s avail rip=%s\n", glUrlID, remoteAddr)
		}
		fmt.Fprintf(w, wsAddr)
		return
	}
	if globHub != nil {
		// callee is managed by a remote server
		if globHub.ConnectedCallerIp != "" {
			// this callee (urlID/glUrlID) is online but currently busy
			fmt.Printf("/online busy for (%s/%s) callerIp=(%s) rip=%s\n",
				urlID, glUrlID, globHub.ConnectedCallerIp, remoteAddr)
			fmt.Fprintf(w, "busy")
			return
		}

		wsClientID := globHub.WsClientID
		if wsClientID == 0 {
			// something has gone wrong
			fmt.Printf("# /online glob wsClientID==0 (%s) for id=(%s/%s) rip=%s\n",
				glUrlID, urlID, glUrlID, remoteAddr)
			// clear global ConnectedCallerIp
			err := StoreCallerIpInHubMap(glUrlID, "", false)
			if err!=nil {
				fmt.Printf("# /online rkv.StoreCallerIpInHubMap err=%v\n", err)
			}
			fmt.Fprintf(w, "error")
			return
		}

		wsAddr = globHub.WsUrl
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			wsAddr = globHub.WssUrl
		}
		wsAddr = fmt.Sprintf("%s?wsid=%d", wsAddr, wsClientID)

		if logWantedFor("wsAddr") {
			fmt.Printf("/online id=%s avail wsAddr=%s rip=%s\n", glUrlID, wsAddr, remoteAddr)
		} else {
			fmt.Printf("/online id=%s avail rip=%s\n", glUrlID, remoteAddr)
		}
		fmt.Fprintf(w, wsAddr)
		return
	}

	// something has gone wrong - callee not found anywhere
	fmt.Printf("# /online no hub found for id=(%s/%s) rip=%s\n", urlID, glUrlID, remoteAddr)

	// clear ConnectedCallerIp
	StoreCallerIpInHubMap(glUrlID, "", false)
	fmt.Fprintf(w, "error")
	return
}

func httpAvail(w http.ResponseWriter, r *http.Request, urlID string, urlPath string, remoteAddr string) {
	checkID := urlPath[7:]
	if !allowNewAccounts {
		fmt.Printf("# /avail !allowNewAccounts id=%s for rip=%s\n",checkID,remoteAddr)
	} else {
		// checks if ID is free to be registered for a new calle
		// this is NOT the case if it is listed as registered or blocked
		fmt.Printf("/avail check id=%s for rip=%s\n",checkID,remoteAddr)
		var dbEntryBlocked DbEntry
		// checkID is blocked in dbBlockedIDs
		err := kvMain.Get(dbBlockedIDs,checkID,&dbEntryBlocked)
		if err!=nil {
			// id is not listed in dbBlockedIDs
			fmt.Printf("/avail check id=%s not found in dbBlockedIDs\n",checkID)
			var dbEntryRegistered DbEntry
			err := kvMain.Get(dbRegisteredIDs,checkID,&dbEntryRegistered)
			if err!=nil {
				// id is not listed in dbRegisteredIDs
				//fmt.Printf("avail check id=%s not found in dbRegisteredIDs\n",checkID)
				fmt.Printf("/avail check id=%s for rip=%s is positive\n",checkID,remoteAddr)
				fmt.Fprintf(w, "true")
				return
			}
			fmt.Printf("/avail check id=%s found in dbRegisteredIDs\n",checkID)
		}
		// id is listed in dbBlockedIDs
		// but if it is blocked by the same remoteAddr then we provide access of course
		if dbEntryBlocked.Ip==remoteAddr {
			fmt.Printf("/avail check id=%s with SAME rip=%s is positive\n",checkID,remoteAddr)
			fmt.Fprintf(w, "true")
			return
		}
		fmt.Printf("/avail check id=%s for rip=%s is negative\n",checkID,remoteAddr)
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
	tmpCalleeID,err := GetRandomCalleeID()
	if err!=nil {
		fmt.Printf("# /newid GetRandomCalleeID err=%v\n",err)
		return
	}
	// NOTE tmpCalleeID is currently free, but it is NOT reserved
	fmt.Printf("/newid generated new id=%s for rip=%s\n",tmpCalleeID,remoteAddr)
	fmt.Fprintf(w, tmpCalleeID)
	return
}

func httpRegister(w http.ResponseWriter, r *http.Request, urlID string, urlPath string, remoteAddr string, startRequestTime time.Time) {
	if allowNewAccounts {
		registerID := urlPath[10:]
		fmt.Printf("/register id=%s rip=%s\n",registerID,remoteAddr)

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
				fmt.Printf("/register fail pw too short\n")
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
				fmt.Printf("/register fail db=%s bucket=%s get id=%s already registered\n",
					dbMainName, dbRegisteredIDs, registerID)
				fmt.Fprintf(w, "was already registered")
				return
			}

			unixTime := startRequestTime.Unix()
			dbUserKey := fmt.Sprintf("%s_%d",registerID, unixTime)
			dbUser := DbUser{Ip1:remoteAddr, UserAgent:r.UserAgent()}
			err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
			if err!=nil {
				fmt.Printf("# /register error db=%s bucket=%s put key=%s err=%v\n",
					dbMainName, dbUserBucket, registerID, err)
				fmt.Fprintf(w,"cannot register user")
			} else {
				err = kvMain.Put(dbRegisteredIDs, registerID,
						DbEntry{unixTime, remoteAddr, pw}, false)
				if err!=nil {
					fmt.Printf("# /register error db=%s bucket=%s put key=%s err=%v\n",
						dbMainName,dbRegisteredIDs,registerID,err)
					fmt.Fprintf(w,"cannot register ID")
					// TODO this is bad! got to role back kvMain.Put((dbUser...) from above
				} else {
					fmt.Printf("/register db=%s bucket=%s stored ID=%s OK\n",
						dbMainName, dbRegisteredIDs, registerID)
					// registerID is now available for use
					var pwIdCombo PwIdCombo
					err,cookieValue := createCookie(w, registerID, pw, &pwIdCombo)
					if err!=nil {
						fmt.Printf("/register create cookie error id=%s cookie=%s err=%v\n",
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
						fmt.Printf("# /register kvContacts.Put registerID=%s err=%v\n", registerID, err)
					} else {
						fmt.Printf("/register kvContacts.Put registerID=%s OK\n", registerID)
					}

					fmt.Fprintf(w, "OK")
				}
			}
		}
	}
	return
}

