// WebCall Copyright 2022 timur.mobi. All rights reserved.
//
// WebCall server will send push notifications to callees
// if they have specified such channels and if they are not online 
// at the time of a call (or are hidden). Push notifications can be 
// sent via WebPush and/or Twitter.
//
// httpCanbenotified() is called via XHR "/rtcsig/canbenotified".
// This method checks if the specified callee has at least one 
// push channel configured. If this is the case, an "OK" string 
// is returned to the requesting client.
//
// httpNotifyCallee() is called via XHR "/rtcsig/notifyCallee".
// This method is used if the specified callee can be notified, 
// if the caller wants a push notification to be sent and is willing 
// to wait for the callee to come online. 
// httpNotifyCallee() will send the actual push message and will keep 
// the caller online until the callee picks up the call, or until the 
// caller disconnects.

package main

import (
	"net/http"
	"time"
	"strings"
	"strconv"
	"fmt"
	"encoding/json"
	"io/ioutil"
	"sync"
	"github.com/mehrvarz/webcall/twitter"
	"github.com/mrjones/oauth"
//	webpush "github.com/SherClockHolmes/webpush-go"
)

var twitterClient *twitter.DesktopClient = nil
var twitterClientLock sync.RWMutex
var twitterAuthFailedCount = 0

func httpNotifyCallee(w http.ResponseWriter, r *http.Request, urlID string, remoteAddr string, remoteAddrWithPort string) {
	// caller wants to wait for callee (urlID) to come online to answer call
	if urlID == "" {
		fmt.Printf("# /notifyCallee failed no urlID\n")
		// JS will tell caller: could not reach urlID
		return
	}

	//fmt.Printf("/notifyCallee (%s) r.URL.Query()=(%v)\n", urlID, r.URL.Query())

	// get callerId + callerName from url-args
	callerId := ""
	url_arg_array, ok := r.URL.Query()["callerId"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerId = url_arg_array[0]
	}
	callerName := ""
	url_arg_array, ok = r.URL.Query()["name"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerName = url_arg_array[0]
	}
	fmt.Printf("/notifyCallee (%s) for callerId=(%s)\n", urlID, callerId)

	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs, urlID, &dbEntry)
	if err != nil {
		fmt.Printf("/notifyCallee (%s) failed on dbRegisteredIDs\n", urlID)
		return
	}
	dbUserKey := fmt.Sprintf("%s_%d", urlID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err != nil {
		fmt.Printf("# /notifyCallee (%s) failed on dbUserBucket\n", urlID)
		return
	}

	if dbUser.StoreContacts && callerId != "" {
		addContact(urlID, callerId, callerName, "/notifyCallee")
	}

	// check if callee is hidden online
	calleeIsHiddenOnline := false
	ejectOn1stFound := true
	reportHiddenCallee := true
	reportBusyCallee := true
	glUrlID, locHub, globHub, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee,
		reportHiddenCallee, remoteAddr, "/notifyCallee")
	if err != nil {
		fmt.Printf("# /notifyCallee (%s) GetOnlineCallee() err=%v\n", urlID, err)
		return
	}
	if glUrlID != "" {
		// callee is online
		if (locHub!=nil && locHub.IsCalleeHidden) || (globHub!=nil && globHub.IsCalleeHidden) {
			// callee is online but hidden
			fmt.Printf("/notifyCallee (%s) isHiddenOnline\n", glUrlID)
			calleeIsHiddenOnline = true
		}
	}

	notificationSent := 0
	if glUrlID == "" {
		// requested callee (urlID) is offline - send push notification(s)
		msg := "Unknown caller is waiting for you to pick up the phone."
		if callerName!="" {
			msg = callerName + " is waiting for you to pick up the phone."
		} else if callerId!="" {
			msg = callerId + " is waiting for you to pick up the phone."
		}
/*
		if dbUser.Str2 != "" {
			// web push device 1 subscription is specified
			// here we use web push to send a notification
			err, statusCode := webpushSend(dbUser.Str2, msg, urlID)
			if err != nil {
				fmt.Printf("# /notifyCallee (%s) webpush fail device1 err=%v\n", urlID, err)
			} else if statusCode == 201 {
				notificationSent |= 1
			} else if statusCode == 410 {
				fmt.Printf("# /notifyCallee (%s) webpush fail device1 delete subscr\n", urlID)
				dbUser.Str2 = ""
			} else {
				fmt.Printf("# /notifyCallee (%s) webpush fail device1 status=%d\n",	urlID, statusCode)
			}
		}

		if dbUser.Str3 != "" {
			// web push device 2 subscription is specified
			// here we use web push to send a notification
			err, statusCode := webpushSend(dbUser.Str3, msg, urlID)
			if err != nil {
				fmt.Printf("# /notifyCallee (%s) webpush fail device2 err=%v\n", urlID, err)
			} else if statusCode == 201 {
				notificationSent |= 2
			} else if statusCode == 410 {
				fmt.Printf("# /notifyCallee (%s) webpush fail device2 delete subscr\n", urlID)
				dbUser.Str3 = ""
			} else {
				fmt.Printf("# /notifyCallee (%s) webpush fail device2 status=%d\n",
					urlID, statusCode)
			}
		}
*/
		// notify urlID via twitter message
		// here we use twitter message (or twitter direct message) to send a notification
		if dbUser.Email2 != "" {
			// twitter handle exists
			twitterClientLock.Lock()
			if twitterClient == nil {
				twitterAuth()
			}
			twitterClientLock.Unlock()
			if twitterClient == nil {
				fmt.Printf("# /notifyCallee (%s) failed no twitterClient\n", urlID)
				// script will tell caller: could not reach urlID
			} else {
				// we are authenticated to twitter, does this user have a twid?
				var twid int64 = 0
				if dbUser.Str1 == "" {
					// if twitter-id (dbUser.Str1) is NOT given, get it via twitter handle (dbUser.Email2)
					twitterClientLock.Lock()
					userDetail, _, err := twitterClient.QueryFollowerByName(dbUser.Email2)
					twitterClientLock.Unlock()
					if err!=nil {
						fmt.Printf("# /notifyCallee (%s) dbUser.Email2=(%s) err=%v (%s)\n",
							urlID, dbUser.Email2, err, msg)
					} else {
						fmt.Printf("/notifyCallee (%s) dbUser.Email2=(%s) fetched id=%v\n",
							urlID, dbUser.Email2, userDetail.ID)
						if userDetail.ID > 0 {
							// dbUser.Email2 is a real twitter handle
							twid = userDetail.ID
							dbUser.Str1 = fmt.Sprintf("%d",twid)
							// store this modified dbUser
							err2 := kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
							if err2!=nil {
								fmt.Printf("# /notifyCallee (%s) kvMain.Put fail err=%v\n", urlID, err2)
							}
						}
					}
				} else {
					fmt.Printf("/notifyCallee (%s) dbUser.Email2=(%s) stored Str1=%s\n",
						urlID, dbUser.Email2, dbUser.Str1)
					// tw-id is given
					i64, err := strconv.ParseInt(dbUser.Str1, 10, 64)
					if err!=nil {
						fmt.Printf("# /notifyCallee (%s) ParseInt64 Str1=(%s) err=%v\n",
							urlID, dbUser.Str1, err)
					} else {
						twid = i64
					}
				}

				// check if dbUser.Email2 is a follower
				isFollower := false
				if twid>0 {
					// check if twid exist in followerIDs
					followerIDsLock.RLock()
					for _,id := range followerIDs.Ids {
						if id == twid {
							isFollower = true
							break
						}
					}
					followerIDsLock.RUnlock()
				}

				// send tweet only if user is a follower
				if isFollower {
					// twid is a follower
/*
					if strings.HasPrefix(dbUser.Email2, "@") {
						msg = dbUser.Email2 + " " + msg
					} else {
						msg = "@" + dbUser.Email2 + " " + msg
					}
					msg = msg + " " + operationalNow().Format("2006-01-02 15:04:05")
					respdata, err := twitterClient.SendTweet(msg)
*/
					respdata, err := twitterClient.SendDirect(dbUser.Str1, msg)
					if err != nil {
						// failed to send tweet
						maxlen := 30
						if len(dbUser.Email2) < 30 {
							maxlen = len(dbUser.Email2)
						}
						fmt.Printf("# /notifyCallee (%s) %s SendTweet err=%v msg=%s\n",
							urlID, dbUser.Email2[:maxlen], err, msg)
						// something is wrong with tw-handle (dbUser.Email2) clear the twid (dbUser.Str1)
						dbUser.Str1 = ""
						err2 := kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
						if err2!=nil {
							fmt.Printf("# /notifyCallee (%s) kvMain.Put fail err=%v\n", urlID, err2)
						}
					} else {
						tweet := twitter.TimelineTweet{}
						err = json.Unmarshal(respdata, &tweet)
						if err != nil {
							fmt.Printf("# SendTweet (%s) cannot parse respdata err=%v\n", urlID, err)
						} else {
							// twitter notification succesfully sent
							notificationSent |= 4
							maxlen := 30
							if len(dbUser.Email2) < 30 {
								maxlen = len(dbUser.Email2)
							}
							fmt.Printf("SendTweet (%s) OK twHandle=%s tweetId=%s\n",
								urlID, dbUser.Email2[:maxlen], tweet.IdStr)

//							// in 1hr we want to delete this tweet in ticker3min() via tweet.Id
//							// so we store tweet.Id dbSentNotifTweets
//							notifTweet := NotifTweet{time.Now().Unix(), msg}
//							err = kvNotif.Put(dbSentNotifTweets, tweet.IdStr, notifTweet, false)
//							if err != nil {
//								fmt.Printf("# /notifyCallee (%s) failed to store dbSentNotifTweets (%s)\n",
//									urlID, tweet.IdStr)
//							}

						}
					}
				}
			}
		}

		if notificationSent==0 {
			// we could not send any notifications: store call as missed call
			fmt.Printf("# /notifyCallee (%s) no notification sent\n", urlID)
			if(dbUser.StoreMissedCalls) {
				fmt.Printf("# /notifyCallee (%s) no notification sent - store as missed call\n", urlID)
				caller := CallerInfo{remoteAddrWithPort, callerName, time.Now().Unix(), callerId}
				var missedCallsSlice []CallerInfo
				err := kvCalls.Get(dbMissedCalls, urlID, &missedCallsSlice)
				if err != nil {
					//fmt.Printf("# /notifyCallee (%s) failed to read dbMissedCalls %v\n", urlID, err)
				}
				// make sure we never have more than 10 missed calls
				if missedCallsSlice != nil && len(missedCallsSlice) >= 10 {
					missedCallsSlice = missedCallsSlice[1:]
				}
				missedCallsSlice = append(missedCallsSlice, caller)
				err = kvCalls.Put(dbMissedCalls, urlID, missedCallsSlice, false)
				if err != nil {
					fmt.Printf("# /notifyCallee (%s) failed to store dbMissedCalls %v\n", urlID, err)
				}
			}
			// there is no need for the caller to wait, bc we could not send a push notification
			// by NOT responding "ok" we tell the caller that we were NOT able to reach the callee
			return
		}
	}

	// we now "freeze" the callers xhr until callee goes online and sends a value to the callers chan
	// waitingCallerChanMap[urlID] <- 1 to signal it is picking up the call
	c := make(chan int)
	waitingCallerChanLock.Lock()
	waitingCallerChanMap[remoteAddrWithPort] = c
	waitingCallerChanLock.Unlock()

	waitingCaller := CallerInfo{remoteAddrWithPort, callerName, time.Now().Unix(), callerId}
	var waitingCallerSlice []CallerInfo
	var calleeWsClient *WsClient = nil
	if calleeIsHiddenOnline {
		// send a waitingCaller json-update (containing remoteAddrWithPort + callerName) to hidden callee
		err = kvCalls.Get(dbWaitingCaller, urlID, &waitingCallerSlice)
		if err != nil {
			// we can ignore this
		}
		waitingCallerSlice = append(waitingCallerSlice, waitingCaller)
		err = kvCalls.Put(dbWaitingCaller, urlID, waitingCallerSlice, false)
		if err != nil {
			fmt.Printf("# /notifyCallee (%s) failed to store dbWaitingCaller\n", urlID)
		}

		hubMapMutex.RLock()
		myhub := hubMap[urlID]
		hubMapMutex.RUnlock()
		if myhub!=nil {
			calleeWsClient = myhub.CalleeClient
		}
		if calleeWsClient != nil {
			calleeWsClient.hub.IsUnHiddenForCallerAddr = ""
			//fmt.Printf("/notifyCallee (%s) send waitingCallerSlice len=%d\n",
			//	urlID, len(waitingCallerSlice))
			json, err := json.Marshal(waitingCallerSlice)
			if err != nil {
				fmt.Printf("# /notifyCallee (%s) json.Marshal(waitingCallerSlice) err=%v\n", urlID, err)
			} else {
				calleeWsClient.Write([]byte("waitingCallers|" + string(json)))
			}
		}
	}

	// let caller wait (let it's xhr stand) until callee picks up the call
	fmt.Printf("/notifyCallee (%s) waiting for callee to come online (%d)\n", urlID, notificationSent)
	callerGaveUp := false
	select {
	case <-c:
		// callee is accepting this caller to call
		// coming from callee.js: function pickupWaitingCaller(callerID)
		//             client.go: if cmd=="pickupWaitingCaller"

		// in the mean time callee may have gone offline (and is now back online)
		// so we assume calleeWsClient may be invalid and obtain it again
		calleeWsClient = nil
		glUrlID, _, _, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee, 
			reportHiddenCallee, remoteAddr, "/notifyCallee")
		if err != nil {
			fmt.Printf("# /notifyCallee (%s) GetOnlineCallee() err=%v\n", urlID, err)
			return
		}
		if glUrlID == "" {
			fmt.Printf("# /notifyCallee (%s/%s) callee wants caller (%s) to connect - but not online\n",
				urlID, glUrlID, remoteAddr)
		} else {
			// make the hidden callee "visible" for this particular caller
			fmt.Printf("/notifyCallee (%s/%s) callee wants caller (%s) to connect\n", urlID, glUrlID, remoteAddr)
			if err := SetUnHiddenForCaller(glUrlID, remoteAddr); err != nil {
				fmt.Printf("# /notifyCallee (%s) SetUnHiddenForCaller ip=%s err=%v\n", glUrlID, remoteAddr, err)
			} else {
				hubMapMutex.RLock()
				calleeWsClient = hubMap[glUrlID].CalleeClient
				hubMapMutex.RUnlock()

				// clear unHiddenForCaller after a while, say, after 3 min
				go func() {
					time.Sleep(60 * time.Second)
					// in the mean time callee may have gone offline (and is now back online)
					// this is why we check if callee is online now
					glUrlID, _, _, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee,
						reportHiddenCallee, remoteAddr, "/notifyCallee")
					if err != nil {
						return
					}
					if glUrlID == "" {
						return
					}
					hubMapMutex.RLock()
					myhub := hubMap[glUrlID]
					hubMapMutex.RUnlock()
					if myhub!=nil {
						if myhub.IsUnHiddenForCallerAddr == remoteAddr {
							myhub.IsUnHiddenForCallerAddr = ""
							fmt.Printf("/notifyCallee (%s) clear HiddenForCallerAddr=%s\n",
								glUrlID, remoteAddr)
						}
					}
				}()
			}
		}
		// caller receiving this "ok" will automatically attempt to make a call now
		fmt.Fprintf(w, "ok")
	case <-r.Context().Done():
		// caller has disconnected (before callee could wake this channel to answer the call)
		// in the mean time callee may have gone offline (and is now back online)
		// so we assume calleeWsClient invalid and re-obtain it
		calleeWsClient = nil
		fmt.Printf("/notifyCallee (%s) caller disconnected\n", urlID)
		callerGaveUp = true
		glUrlID, _, _, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee, 
			reportHiddenCallee, remoteAddr, "/notifyCallee")
		if err != nil {
			fmt.Printf("# /notifyCallee (%s/%s) GetOnlineCallee() err=%v\n", urlID, glUrlID, err)
		} else if glUrlID == "" {
			fmt.Printf("# /notifyCallee (%s/%s) GetOnlineCallee() is empty\n", urlID, glUrlID)
		} else {
			hubMapMutex.RLock()
			calleeWsClient = hubMap[glUrlID].CalleeClient
			hubMapMutex.RUnlock()
		}
	}

	//fmt.Printf("/notifyCallee (%s) delete callee online-notification chan\n", urlID)
	waitingCallerChanLock.Lock()
	delete(waitingCallerChanMap, remoteAddrWithPort)
	waitingCallerChanLock.Unlock()

	if calleeWsClient==nil {
		fmt.Printf("# /notifyCallee (%s/%s) calleeWsClient==nil cannot update dbWaitingCaller\n", urlID, glUrlID)
	} else {
		err = kvCalls.Get(dbWaitingCaller, urlID, &waitingCallerSlice)
		if err != nil {
			// we can ignore this
		}

		var missedCallsSlice []CallerInfo

		// remove this caller from waitingCallerSlice
		for idx := range waitingCallerSlice {
			if waitingCallerSlice[idx].AddrPort == remoteAddrWithPort {
				//fmt.Printf("/notifyCallee (%s) remove caller from waitingCallerSlice + store\n", urlID)
				waitingCallerSlice = append(waitingCallerSlice[:idx], waitingCallerSlice[idx+1:]...)
				err = kvCalls.Put(dbWaitingCaller, urlID, waitingCallerSlice, false)
				if err != nil {
					fmt.Printf("# /notifyCallee (%s) failed to store dbWaitingCaller\n", urlID)
				}

				if callerGaveUp {
					// store missed call
					if(dbUser.StoreMissedCalls) {
						//fmt.Printf("/notifyCallee (%s) store missed call\n", urlID)
						err = kvCalls.Get(dbMissedCalls, urlID, &missedCallsSlice)
						if err != nil {
							fmt.Printf("# /notifyCallee (%s) failed to read dbMissedCalls %v\n", urlID, err)
						}
						// make sure we never have more than 10 missed calls
						if missedCallsSlice != nil && len(missedCallsSlice) >= 10 {
							missedCallsSlice = missedCallsSlice[1:]
						}
						missedCallsSlice = append(missedCallsSlice, waitingCaller)
						err = kvCalls.Put(dbMissedCalls, urlID, missedCallsSlice, false)
						if err != nil {
							fmt.Printf("# /notifyCallee (%s) failed to store dbMissedCalls %v\n", urlID, err)
						}
					}
				}
				break
			}
		}
		// send updated waitingCallerSlice + missedCalls
		waitingCallerToCallee(urlID, waitingCallerSlice, missedCallsSlice, calleeWsClient)
	}
	return
}

func httpMissedCall(w http.ResponseWriter, r *http.Request, callerInfo string, remoteAddr string, remoteAddrWithPort string) {
	// called by caller.js goodby() via "/missedCall?id=(callerInfo)"
	// callerInfo is encoded: calleeId+"|"+callerName+"|"+callerId (plus optional: "|"+ageSecs
	// "timur|92929|92929658912|50" tok[0]=calleeID, tok[1]=callerName, tok[2]=callerID, tok[3]=ageSecs
	//fmt.Printf("/httpMissedCall (%s) rip=%s\n", callerInfo, remoteAddrWithPort)
	tok := strings.Split(callerInfo, "|")
	if len(tok) < 3 {
		fmt.Printf("# /httpMissedCall (%s) failed len(tok)=%d<3 rip=%s\n",callerInfo,len(tok),remoteAddr)
		return
	}
	if tok[0]=="" || tok[0]=="undefined" {
		fmt.Printf("# /httpMissedCall (%s) failed no calleeId rip=%s\n",callerInfo,remoteAddr)
		return
	}
	calleeId := tok[0]

	var ageSecs64 int64 = 1
	if len(tok) >= 4 {
		// the age of the call is given in number of seconds; below we will substract this from the current time
		var err error
		ageSecs64, err = strconv.ParseInt(tok[3], 10, 64)
		if err!=nil {
			//fmt.Printf("# /httpMissedCall (%s) ParseInt err=%v\n",calleeId,err)
			ageSecs64 = 0
		} else if ageSecs64<0 {
			//fmt.Printf("# /httpMissedCall (%s) ageSecs64=%d < 0\n",calleeId,ageSecs64)
			ageSecs64 = 0
		} else {
			//fmt.Printf("/httpMissedCall (%s) ageSecs64=%d\n",calleeId,ageSecs64)
		}
	}
	// find current state of dbUser.StoreMissedCalls via calleeId
	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs,calleeId,&dbEntry)
	if err!=nil {
		fmt.Printf("# /httpMissedCall (%s) failed on get dbRegisteredIDs rip=%s\n",calleeId,remoteAddr)
		return
	}
	dbUserKey := fmt.Sprintf("%s_%d",calleeId, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("# /httpMissedCall (%s) failed on dbUserBucket rip=%s\n",dbUserKey,remoteAddr)
		return
	}
	if(!dbUser.StoreMissedCalls) {
		//fmt.Printf("/httpMissedCall (%s) no StoreMissedCalls rip=%s\n",dbUserKey,remoteAddr)
		return
	}
	// load, add, store missedCalls
	var missedCallsSlice []CallerInfo
	err = kvCalls.Get(dbMissedCalls,calleeId,&missedCallsSlice)
	if err!=nil {
		fmt.Printf("# /httpMissedCall (%s) fail read dbMissedCalls err=%v rip=%s\n", calleeId, err, remoteAddr)
		return
	}
	// make sure we never show more than 10 missed calls
	if missedCallsSlice!=nil && len(missedCallsSlice)>=10 {
		missedCallsSlice = missedCallsSlice[1:]
	}
	//fmt.Printf("/httpMissedCall (%s) missedCall arrived %ds ago\n", calleeId, ageSecs64)
	callerName := tok[1]
	callerID := tok[2]

	// the actual call occured ageSecs64 ago (may be a big number, if caller waits long before aborting the page)
	timeOfCall := time.Now().Unix() - ageSecs64
	caller := CallerInfo{remoteAddrWithPort,callerName,timeOfCall,callerID}
	missedCallsSlice = append(missedCallsSlice, caller)
	err = kvCalls.Put(dbMissedCalls, calleeId, missedCallsSlice, true) // skipConfirm
	if err!=nil {
		fmt.Printf("# /httpMissedCall (%s) fail store dbMissedCalls err=%v rip=%s\n", calleeId, err, remoteAddr)
	} else {
		fmt.Printf("/httpMissedCall (%s) caller=%s rip=%s\n", calleeId, callerID, remoteAddr)

		// send updated waitingCallerSlice + missedCalls to callee (if (hidden) online)
		// check if callee is (hidden) online
		calleeIsHiddenOnline := false
		ejectOn1stFound := true
		reportHiddenCallee := true
		reportBusyCallee := false
		glCalleeId, locHub, globHub, err := GetOnlineCallee(calleeId, ejectOn1stFound, reportBusyCallee,
			reportHiddenCallee, remoteAddr, "/httpMissedCall")
		if err != nil {
			//fmt.Printf("# /httpMissedCall GetOnlineCallee() err=%v\n", err)
			return
		}
		if glCalleeId != "" {
			if (locHub!=nil && locHub.IsCalleeHidden) || (globHub!=nil && globHub.IsCalleeHidden) {
				//fmt.Printf("/httpMissedCall (%s) isHiddenOnline\n", glCalleeId)
				calleeIsHiddenOnline = true
			}
		}
		if calleeIsHiddenOnline {
			var calleeWsClient *WsClient = nil
			hubMapMutex.RLock()
			myhub := hubMap[calleeId]
			hubMapMutex.RUnlock()
			if myhub!=nil {
				calleeWsClient = myhub.CalleeClient
			}
			if calleeWsClient != nil {
				var waitingCallerSlice []CallerInfo
				err = kvCalls.Get(dbWaitingCaller, calleeId, &waitingCallerSlice)
				if err != nil {
					// we can ignore this
				}
				waitingCallerToCallee(calleeId, waitingCallerSlice, missedCallsSlice, calleeWsClient)
			}
		}
	}
}

func httpCanbenotified(w http.ResponseWriter, r *http.Request, urlID string, remoteAddr string, remoteAddrWithPort string) {
	// checks if urlID can be notified of an incoming call
	// either directly (while callee is hidden online) or via twitter
	if urlID=="" {
		fmt.Printf("# /canbenotified failed on empty urlID rip=%s\n",remoteAddr)
		return
	}

	var dbEntry DbEntry
	var dbUser DbUser
	err := kvMain.Get(dbRegisteredIDs,urlID,&dbEntry)
	if err!=nil {
		fmt.Printf("/canbenotified (%s) failed on dbRegisteredIDs rip=%s\n",urlID,remoteAddr)
		return
	}
	dbUserKey := fmt.Sprintf("%s_%d",urlID, dbEntry.StartTime)
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("# /canbenotified (%s) failed on dbUserBucket rip=%s\n",urlID,remoteAddr)
		return
	}
	calleeName := dbUser.Name

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

/* removed to fix caller getting "xxx is not online at this time" when callee is in hidden mode
	// check if hidden online, if so skip pushable check
	ejectOn1stFound := true
	reportHiddenCallee := true
	occupy := false
	key, locHub, globHub, err := GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
		remoteAddr, occupy, "/canbenotified")
	if err!=nil {
		fmt.Printf("# /canbenotified GetOnlineCallee() err=%v\n",err)
		return
	}

	if key!="" {
		if (locHub!=nil && locHub.IsCalleeHidden) || (globHub!=nil && globHub.IsCalleeHidden) {
			fmt.Printf("/canbenotified (%s) isHiddenOnline rip=%s\n",urlID,remoteAddr)
			return
		}
	}
*/

	// check if callee is hidden online
	calleeIsHiddenOnline := false
	ejectOn1stFound := true
	reportHiddenCallee := true
	reportBusyCallee := true
	glUrlID, locHub, globHub, err := GetOnlineCallee(urlID, ejectOn1stFound, reportBusyCallee,
		reportHiddenCallee, remoteAddr, "/canbenotified")
	if logWantedFor("hub") {
		fmt.Printf("/canbenotified (%s/%s) locHub=%v isHiddenOnline=%v/%v\n", urlID, glUrlID, locHub!=nil,
			(locHub!=nil && locHub.IsCalleeHidden), (globHub!=nil && globHub.IsCalleeHidden))
	}
	if err==nil && glUrlID != "" {
		if (locHub!=nil && locHub.IsCalleeHidden) || (globHub!=nil && globHub.IsCalleeHidden) {
			//fmt.Printf("/canbenotified (%s) isHiddenOnline\n", glUrlID)
			calleeIsHiddenOnline = true
		}
	}

	// dbUser.Email2 used as tw_handle, dbUser.Str2 used as web push
	if dbUser.Email2=="" && dbUser.Str2=="" && dbUser.Str3=="" && !calleeIsHiddenOnline {
		// this user can NOT rcv push msg (not pushable)
		fmt.Printf("/canbenotified (%s) has no push channel rip=%s\n",urlID,remoteAddr)

		if(dbUser.StoreMissedCalls) {
			// store missed call
			var missedCallsSlice []CallerInfo
			err := kvCalls.Get(dbMissedCalls,urlID,&missedCallsSlice)
			if err!=nil && strings.Index(err.Error(),"key not found")<0 {
				fmt.Printf("# /canbenotified (%s) failed to read dbMissedCalls err=%v rip=%s\n",
					urlID, err, remoteAddr)
			}
			// make sure we never show more than 10 missed calls
			if missedCallsSlice!=nil && len(missedCallsSlice)>=10 {
				missedCallsSlice = missedCallsSlice[1:]
			}
			caller := CallerInfo{remoteAddrWithPort,callerName,time.Now().Unix(),callerID}
			missedCallsSlice = append(missedCallsSlice, caller)
			err = kvCalls.Put(dbMissedCalls, urlID, missedCallsSlice, true) // skipConfirm
			if err!=nil {
				fmt.Printf("# /canbenotified (%s) failed to store dbMissedCalls err=%v rip=%s\n",
					urlID, err, remoteAddr)
			}
		}
		return
	}

	// yes, urlID can be notified
	// problem is that we don't get any event if the caller gives up at this point (TODO still true?)
	fmt.Printf("/canbenotified (%s) ok name=%s tw=%s onl=%v rip=%s\n",
		urlID,calleeName,dbUser.Email2,calleeIsHiddenOnline,remoteAddr)
	fmt.Fprintf(w,"ok|"+calleeName)
	return
}

func addContact(calleeID string, callerID string, callerName string, comment string) error {
	if strings.HasPrefix(calleeID,"answie") {
		return nil
	}
	if calleeID == callerID {
		return nil
	}
	if strings.HasPrefix(calleeID,"!") {
		return nil
	}
	if strings.HasPrefix(callerID,"!") {
		return nil
	}

	callerInfoMap := make(map[string]string) // callerID -> name
	err := kvContacts.Get(dbContactsBucket,calleeID,&callerInfoMap)
	if err!=nil {
		//fmt.Printf("# addContact get key=%s err=%v (ignored)\n", calleeID, err)
		//can be ignored: return err // key not found (empty)
	}
	oldName,ok := callerInfoMap[callerID]
	if ok && oldName!="" {
		//fmt.Printf("# addContact store key=%s callerID=%s EXISTS(%s) newname=%s comment=%s\n",
		//	calleeID, callerID, oldName, callerName, comment)
		return nil
	}
	callerInfoMap[callerID] = callerName
	err = kvContacts.Put(dbContactsBucket, calleeID, callerInfoMap, true)
	if err!=nil {
		fmt.Printf("# addContact store key=%s err=%v\n", calleeID, err)
		return err
	}
	//fmt.Printf("addContact stored for id=%s callerID=%s name=%s comment=%s\n",
	//	calleeID, callerID, callerName, comment)
	return nil
}

/*
func webpushSend(subscription string, msg string, urlID string) (error,int) {
	// Decode subscription
	s := &webpush.Subscription{}
	json.Unmarshal([]byte(subscription), s)
	//fmt.Printf("unmarshalled subscription (%v)\n",s)

	// Send Notification
	readConfigLock.RLock()
	httpResponse, err := webpush.SendNotification([]byte(msg), s, &webpush.Options{
		Subscriber:      adminEmail, // Do not use "mailto:"
		VAPIDPublicKey:  vapidPublicKey,
		VAPIDPrivateKey: vapidPrivateKey,
		TTL:             60,
	})
	readConfigLock.RUnlock()
	if err != nil {
		maxlen:=30; if len(subscription)<30 { maxlen=len(subscription) }
		fmt.Printf("# webpush.SendNotif err=%v (id=%s) (%s)\n",
			urlID, err, subscription[:maxlen])
		return err, 0
	}
	// httpResponse.StatusCode should be 201
	fmt.Printf("webpush.SendNotif OK id=%s (httpRespCode=%v) (%s)\n", urlID, httpResponse.StatusCode, subscription)
	httpResponse.Body.Close()
	return err, httpResponse.StatusCode
}
*/

func twitterAuth() {
	// twitterClientLock must be set outside
	if twitterAuthFailedCount>3 {
		return
	}
	readConfigLock.RLock()
	mytwitterKey := twitterKey
	mytwitterSecret := twitterSecret
	readConfigLock.RUnlock()
	if mytwitterKey=="" || mytwitterSecret=="" {
		return
	}

	twitterClient = twitter.NewDesktopClient(mytwitterKey, mytwitterSecret)
	basepath := "."
	accessTokenFile := basepath+"/accessToken.txt"
	b, err := ioutil.ReadFile(accessTokenFile)
	if err != nil {
		fmt.Printf("# twitter auth cannot read accessTokenFile=%s\n", accessTokenFile)
		twitterClient = nil
	} else {
		//fmt.Printf("twitter auth using accessToken.txt (%s)\n",accessTokenFile)
		accessTokenContent := string(b)
		linetokens := strings.SplitN(accessTokenContent, "\n", 4)
		//log.Println("linetokens[0]="+linetokens[0])
		//log.Println("linetokens[1]="+linetokens[1])
		//fmt.Printf("twitter auth linetokens[2]=%s\n", linetokens[2])
		//log.Println("linetokens[3]="+linetokens[3])
		var accessToken oauth.AccessToken
		accessToken.Token = linetokens[0]
		accessToken.Secret = linetokens[1]
		accessToken.AdditionalData = make(map[string]string)
		accessToken.AdditionalData["screen_name"] = linetokens[2]
		accessToken.AdditionalData["user_id"] = linetokens[3]
		accessTokenPtr, err := twitterClient.DoAuth(&accessToken)
		//fmt.Printf("twitter auth accessToken=%v err=%v\n", accessTokenPtr, err)
		if err != nil {
			fmt.Printf("# twitter auth %v err=%v\n", accessTokenPtr, err)
			twitterClient = nil
			twitterAuthFailedCount++
		} else {
			//fmt.Printf("OAuth twitterClient ready\n")
		}
	}
}

