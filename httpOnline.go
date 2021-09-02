// WebCall Copyright 2021 timur.mobi. All rights reserved.
package main

import (
	"net/http"
	"strings"
	"time"
	"fmt"
	"io"
	"github.com/mehrvarz/webcall/skv"
	"github.com/mehrvarz/webcall/rkv"
)

func httpOnline(w http.ResponseWriter, r *http.Request, urlID string, remoteAddr string) {
	// a caller uses this to check if a callee is online and free
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
	var globHub *rkv.Hub
	var locHub *Hub
	var globalID = ""
	var err error
	if logWantedFor("online") {
		fmt.Printf("/online urlID=%s rtcdb=%s rip=%s\n", urlID, rtcdb, remoteAddr)
	}
	if rtcdb == "" {
		// note: globalID in this case is of course NOT "global"
		globalID, locHub, _ = GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
			remoteAddr, occupy, "/online")
	} else {
		// if urlID lives on another server, globHub will contain that servers wsUrl/wssUrl
		// below we must distinguish between locHub and globHub as they are different structs
		globalID, globHub, err = rkv.GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
			remoteAddr, occupy, "/online")
		if err != nil {
			// error
			fmt.Printf("# /online GetOnlineCallee(%s/%s) err=%v rip=%s\n", urlID, globalID, err, remoteAddr)
			fmt.Fprintf(w, "error")
			return
		}
	}
	if locHub == nil && globHub == nil {
		// error
		fmt.Printf("# /online GetOnlineCallee(%s/%s) no hub rip=%s\n", urlID, globalID, remoteAddr)
		fmt.Fprintf(w, "error")
		return
	}
	if globalID == "" {
		// no error: no such callee (urlID) is currently avaliable
		//fmt.Printf("/online GetOnlineCallee(%s) cur not avail rip=%s\n", urlID, remoteAddr)
		fmt.Fprintf(w, "notavail")
		return
	}

	if rtcdb == "" && locHub != nil {
		// callee is managed by this server
		locHub.HubMutex.RLock()
		wsClientID := locHub.WsClientID
		locHub.HubMutex.RUnlock()
		if wsClientID == 0 {
			// something has gone wrong
			fmt.Printf("# /online loc wsClientID==0 id=(%s/%s) rip=%s\n",
				urlID, globalID, remoteAddr)
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
			fmt.Printf("/online id=%s onl/avail %s rip=%s\n", globalID, wsAddr, remoteAddr)
		} else {
			fmt.Printf("/online id=%s onl/avail rip=%s\n", globalID, remoteAddr)
		}
		fmt.Fprintf(w, wsAddr)
		return
	}

	if rtcdb != "" && globHub != nil {
		// callee is managed by a remote server
		if globHub.ConnectedCallerIp != "" {
			// this callee (urlID/globalID) is online but currently busy
			fmt.Printf("/online busy for (%s/%s) callerIp=(%s) rip=%s\n",
				urlID, globalID, globHub.ConnectedCallerIp, remoteAddr)
			fmt.Fprintf(w, "busy")
			return
		}

		wsClientID := globHub.WsClientID
		if wsClientID == 0 {
			// something has gone wrong
			fmt.Printf("# /online glob [%s] wsClientID==0 (%s) for id=(%s/%s) rip=%s\n",
				rtcdb, globalID, urlID, globalID, remoteAddr)
			// clear global ConnectedCallerIp
			StoreCallerIpInHubMap(globalID, "", false)
			err := rkv.StoreCallerIpInHubMap(globalID, "", false)
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
			fmt.Printf("/online id=%s onl/avail wsAddr=%s rip=%s\n", globalID, wsAddr, remoteAddr)
		} else {
			fmt.Printf("/online id=%s onl/avail rip=%s\n", globalID, remoteAddr)
		}
		fmt.Fprintf(w, wsAddr)
		return
	}

	// something has gone wrong - callee not found anywhere
	fmt.Printf("# /online no hub found for id=(%s/%s) rip=%s\n", urlID, globalID, remoteAddr)

	// clear ConnectedCallerIp
	StoreCallerIpInHubMap(globalID, "", false)
	if rtcdb!="" {
		rkv.StoreCallerIpInHubMap(globalID, "", false)
		if err!=nil {
			fmt.Printf("# /online rkv.StoreCallerIpInHubMap err=%v\n", err)
		}
	}
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

		var dbEntryRegistered skv.DbEntry
		var dbEntryBlocked skv.DbEntry
		// checkID is blocked in dbBlockedIDs
		err := kvMain.Get(dbBlockedIDs,checkID,&dbEntryBlocked)
		if err!=nil {
			// id is not listed in dbBlockedIDs
			fmt.Printf("/avail check id=%s not found in dbBlockedIDs\n",checkID)
			err = kvMain.Get(dbRegisteredIDs,checkID,&dbEntryRegistered)
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
		fmt.Fprintf(w, "false")
	}
	return
}

func httpNewId(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, remoteAddr string) {
	// get a random ID that is not yet used in hubmap
	if !allowNewAccounts {
		fmt.Printf("# /newid !allowNewAccounts\n")
		return
	}
	tmpCalleeID := ""
	if rtcdb=="" {
		tmpCalleeID,_ = GetRandomCalleeID()
	} else {
		// NOTE only globalHubMap[] will be used to ensure uniqueness
		// however /register will run against dbRegisteredIDs and may find this id
		var err error
		tmpCalleeID,err = rkv.GetRandomCalleeID()
		if err!=nil {
			fmt.Printf("# /newid GetRandomCalleeID err=%v\n",err)
			return
		}
	}
	// NOTE tmpCalleeID is currently free, but it is NOT reserved
	fmt.Printf("/newid generated new id=%s for rip=%s\n",tmpCalleeID,remoteAddr)
	fmt.Fprintf(w, tmpCalleeID)
	return
}

func httpRegister(w http.ResponseWriter, r *http.Request, urlID string, urlPath string, remoteAddr string, startRequestTime time.Time) {
	if allowNewAccounts {
		// registerID should be tmpCalleeID from /newid
		registerID := urlPath[10:]
		fmt.Printf("/register id=%s\n",registerID)

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
			//fmt.Printf("avail check id=%s not found in dbBlockedIDs\n",checkID)
			var dbEntryRegistered skv.DbEntry
			err := kvMain.Get(dbRegisteredIDs,registerID,&dbEntryRegistered)
			if err==nil {
				// registerID is already registered
				fmt.Printf("/register fail db=%s bucket=%s get id=%s already registered\n",
					dbMainName, dbRegisteredIDs, registerID)
				fmt.Fprintf(w, "was already registered")
				return
			}

// TODO temporarily outremarked
//			if remoteAddr!="127.0.0.1" {
//				// check if the requesting IP-addr has a valid account
//				// this is supposed to prevent the same IP to register many different accounts
//				var foundIp byte = 0
//				err := kvMain.SearchIp(dbRegisteredIDs, remoteAddr, &foundIp)
//				if err!=nil {
//					// error (ErrDisconnect, ErrTimeout) we should NOT register now
//					fmt.Printf("# /register fail db=%s bucket=%s rip=%s err=%v\n",
//						dbMainName, dbRegisteredIDs, remoteAddr, err)
//					fmt.Fprintf(w,"error cannot register")
//					return
//				} else if foundIp!=0 {
//					// the requesting IP-addr has a valid account already
//					fmt.Printf("# /register fail rip=%s has valid account already\n",
//						remoteAddr)
//					fmt.Fprintf(w,"already registered")
//					return
//				}
//				// the requesting IP-addr has no valid account, try to register it
//			}

			unixTime := startRequestTime.Unix()
			dbUserKey := fmt.Sprintf("%s_%d",registerID, unixTime)
			dbUser := skv.DbUser{PremiumLevel:1, PermittedConnectedToPeerSecs:freeAccountTalkSecs, 
				Ip1:remoteAddr, UserAgent:r.UserAgent()}
			err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
			if err!=nil {
				fmt.Printf("# /register error db=%s bucket=%s put key=%s err=%v\n",
					dbMainName, dbUserBucket, registerID, err)
				fmt.Fprintf(w,"cannot register user")
			} else {
				err = kvMain.Put(dbRegisteredIDs, registerID,
						skv.DbEntry{unixTime, freeAccountServiceSecs, remoteAddr, pw}, false)
				if err!=nil {
					fmt.Printf("# /register error db=%s bucket=%s put key=%s err=%v\n",
						dbMainName,dbRegisteredIDs,registerID,err)
					fmt.Fprintf(w,"cannot register ID")
					// TODO this is bad! got to role back kvMain.Put((dbUser...) from above
				} else {
					fmt.Printf("/register db=%s bucket=%s stored ID=%s OK\n",
						dbMainName, dbRegisteredIDs, registerID)
					// registerID is now available for use for 24h
					fmt.Fprintf(w, "OK")
				}
			}
		}
	}
	return
}

/******
	if urlPath=="/dial" {
		// a caller uses this to check if a callee is online and free and to occupy the callee
		// NOTE: here the variable naming is twisted
		// the caller (calleeID) is trying to find out if the specified callee (urlID) is online
		// if urlID is online, we will return it's ws-address (the caller will connect there to call callee)

		if calleeID!="" && urlID!="" {
			// store the callee (urlID) as a new contact for the caller (calleeID) (without name)
			addContact(calleeID, urlID, "", "/dial")

			// store the caller (calleeID) (ideally with name) as a new contact for the callee (urlID)
			// TODO maybe the callee (urlID) does not want this caller (calleeID) in it's contact list?
			var dbEntry skv.DbEntry
			err := kv.Get(dbRegisteredIDs,calleeID,&dbEntry)
			if err==nil {
				dbUserKey := fmt.Sprintf("%s_%d",calleeID, dbEntry.StartTime)
				var dbUser skv.DbUser
				err = kv.Get(dbUserBucket, dbUserKey, &dbUser)
				if err==nil && dbUser.Name!="" {
					calleeName = dbUser.Name
				}
			}
			// TODO calleeName looks false
			addContact(urlID, calleeID, calleeName, "/dial")

			// TODO when callee urlID receives the call and if calleeName!=""
			// we would like to show calleeID + calleeName when we play the ringing tone
		}

		ejectOn1stFound := true
		readConfigLock.RLock()
		if strings.Index(multiCallees,"|"+urlID+"|")>=0 {
			// there may be multiple logins from urlID if listed under config.ini "multiCallees"
			ejectOn1stFound = false
		}
		readConfigLock.RUnlock()

		reportHiddenCallee := false
		occupy := true
		globalID, globHub, err :=
			skv.GetOnlineCallee(urlID,ejectOn1stFound,reportHiddenCallee,remoteAddr,occupy,"/dial")
		if err!=nil {
			// error
			fmt.Printf("# /dial GetOnlineCallee(%s/%s) err=%v rip=%s\n", urlID, globalID, err, remoteAddr)
			fmt.Fprintf(w,"error")
		} else if globHub==nil {
			// error
			fmt.Printf("# /dial GetOnlineCallee(%s/%s) no globHub rip=%s\n", urlID, globalID, remoteAddr)
			fmt.Fprintf(w,"error")
		} else if globalID=="" {
			// no error: no such callee (urlID) is currently avaliable
			//fmt.Printf("/dial GetOnlineCallee(%s) cur not avail rip=%s\n", urlID, remoteAddr)
			fmt.Fprintf(w,"notavail")
			//fmt.Printf("/dial urlID=(%s) is not available at this time rip=%s\n", urlID, remoteAddr)
			if !strings.HasPrefix(urlID,"random") && !strings.HasPrefix(urlID,"answie") {
// TODO missed call: must tell urlID later that remoteAddr tried to call at xx:xx
			}
		} else {
			// no error: this callee (urlID/globalID) is online
			// GetOnlineCallee() will set globHub.ConnectedCallerIp='wait' so noone else will steal it from us
			// if this callee's ConnectedCallerIp is not "wait" and not empty, the callee is really busy
			if globHub.ConnectedCallerIp!="wait" && globHub.ConnectedCallerIp!="" {
				// this callee is currently busy
				fmt.Printf("/dial busy for (%s/%s) callerIp=(%s) rip=%s\n",
					urlID, globalID, globHub.ConnectedCallerIp, remoteAddr)
				if !strings.HasPrefix(urlID,"random") && !strings.HasPrefix(urlID,"answie") {
// TODO missed call: must tell urlID later that remoteAddr tried to call at xx:xx
// we can do so via websocket using a dedicated message "calleeInfo"
				}
				fmt.Fprintf(w,"busy")

			} else {
				// this callee (urlID/globalID) is online and available to be called
				hubMapMutex.RLock()
				hub := hubMap[globalID]
				hubMapMutex.RUnlock()
				if hub==nil {
					// error! maybe this callee lives on another server?
					fmt.Printf("# /dial no hub found for id=(%s/%s) rip=%s\n", urlID, globalID, remoteAddr)
					// clear global ConnectedCallerIp
					skv.StoreCallerIpInHubMap(globalID,"", false)
					fmt.Fprintf(w,"error")
					return
				}
				hub.HubMutex.RLock()
				wsClientID := hub.WsClientID
				hub.HubMutex.RUnlock()
				if wsClientID==0 {
					// error! maybe this callee lives on another server?
					fmt.Printf("# /dial wsClientID==0 (%s) for id=(%s/%s) rip=%s\n",
						hub.calleeID, urlID, globalID, remoteAddr)
					// clear global ConnectedCallerIp
					skv.StoreCallerIpInHubMap(globalID,"", false)
					fmt.Fprintf(w,"error")
					return
				}

				// this callee (urlID/globalID) is online and available (has no caller in it's hub)
				// this caller will use the returned wsAddr to call callee (urlID)
				// but when callee (urlID) receives the call
				// we would like to display the callers id and/or nickname (calleeID/calleeName)

				// so try to read the callers cookie and store the callerID + nickname
				// in callee's hub or wsClientData.dbUser.Name or c.hub.callerNickname
				cookie, err := r.Cookie("webcallid")
				if err == nil {
					idxAmpasent := strings.Index(cookie.Value,"&")
					if idxAmpasent<0 {
						fmt.Printf("# /dial no ampasent in cookie.Value=(%s) from rip=%s\n",
							cookie.Value, remoteAddr)
					} else {
						// NOTE: callers only have a cookie if they are logged in as callees themselves
						clientIdFromCookie := cookie.Value[:idxAmpasent]
						if clientIdFromCookie=="" {
							fmt.Printf("/dial no clientIdFromCookie from rip=%s\n", remoteAddr)
						} else {
							var pwIdCombo PwIdCombo
							err = dbHashedPw.Get(dbHashedPwBucket,cookie.Value,&pwIdCombo)
							if err!=nil {
								//
							} else if pwIdCombo.CalleeId != clientIdFromCookie {
								fmt.Printf("# /dial pwIdCombo.CalleeId(%s) != IdFromCookie(%s) rip=%s\n",
								    pwIdCombo.CalleeId, clientIdFromCookie, remoteAddr)
							} else {
								//fmt.Printf("/dial clientIdFromCookie=(%s)\n",clientIdFromCookie)

								var dbEntry skv.DbEntry
								err := kvMain.Get(dbRegisteredIDs,clientIdFromCookie,&dbEntry)
								if err!=nil {
								    fmt.Printf("# /dial kvMain.Get clientIdFromCookie (%s) err=%v rip=%s\n",
								        clientIdFromCookie, err, remoteAddr)
								} else {
									dbUserKey := fmt.Sprintf("%s_%d",clientIdFromCookie, dbEntry.StartTime)
								    var dbUser skv.DbUser
								    err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
								    if err!=nil {
								        fmt.Printf("# /dial err kvMain.Get dbUserKey (%v) err=%v rip=%s\n",
											dbUserKey, err, remoteAddr)
								    } else if dbUser.Name=="" {
										//fmt.Printf("# /dial err dbUser.Name is empty\n")
								    } else {
								        //fmt.Printf("/dial client nicknameFromDb=(%s)\n",dbUser.Name)
// TODO store this in local hub
										//hub.ConnectedCallerNickname = dbUser.Name
								    }
								}
							}
						}
					}
		 		}

				wsAddr := fmt.Sprintf("ws://%s:%d/ws", hostname, wsPort)
				readConfigLock.RLock()
				if r.TLS!=nil || r.Header.Get("X-Forwarded-Proto")=="https" {
					if wssUrl!="" {
						wsAddr = wssUrl
					} else {
						wsAddr = fmt.Sprintf("wss://%s:%d/ws", hostname, wssPort)
					}
				} else {
					if wsUrl!="" {
						wsAddr = wsUrl
					}
				}
				readConfigLock.RUnlock()
				wsAddr = fmt.Sprintf("%s?wsid=%d", wsAddr, wsClientID)
				fmt.Printf("/dial %s wsid=%d rip=%s\n", globalID, wsClientID, remoteAddr)
				fmt.Fprintf(w, wsAddr)

				// if the caller ws-connect fails, we need to clear the global ConnectedCallerIp
				// like so: skv.StoreCallerIpInHubMap(globalID, "", false)
				// but what if the caller does not even try to ws-connect? this is why
				// we start a goroutine for X seconds to check if caller has succefully ws-connected
				// and will it's ip via: skv.StoreCallerIpInHubMap(hub.calleeID,clientIp, false)
				go func() {
					waitForClientWsConnectSecs := 30

					callerIp := ""
					waitedSecs := 0
					for i:=0; i<=waitForClientWsConnectSecs; {
						time.Sleep(2 * time.Second)	
						i+=2
						waitedSecs = i
						ip,err := skv.GetCallerIpInHubMap(globalID)
						if err!=nil {
							callerIp = ""
							break
						}
						callerIp = ip
						if callerIp!="wait" && callerIp!="" {
							break
						}
					}

					// globalhub CallerIp will be set when the caller-client ws-connects
					if callerIp=="wait" {
						// ws-connects of caller-client must have failed
						fmt.Printf("/dial ws-con %s timeout %d waiting for callerIp\n",
							globalID, waitedSecs)
						err := skv.StoreCallerIpInHubMap(globalID,"", false)
						if err!=nil {
							// ignore: no error: most likely the callee has disconnected
							//fmt.Printf("# /dial failed to clr callerIp for %s err=%v\n", globalID, err)
						}
					} else if callerIp=="" {
						// all is well, caller has logged in and out
						if logWantedFor("online") {
							fmt.Printf("/dial callerIp cleared for %s wait=%d\n",
								globalID, waitedSecs)
						}
					} else {
						// all is well, caller has logged in
						if logWantedFor("online") {
							fmt.Printf("/dial callerIp set=%s for %s wait=%d\n",
								callerIp, globalID, waitedSecs)
						}
					}
				}()
			}
		}
		return
	}
*******/

