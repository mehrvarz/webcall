// WebCall Copyright 2021 timur.mobi. All rights reserved.
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
	"fmt"
	"encoding/json"
	"io/ioutil"
	"sync"
	"github.com/mehrvarz/webcall/twitter"
	"github.com/mrjones/oauth"
	webpush "github.com/SherClockHolmes/webpush-go"
)

var twitterClient *twitter.DesktopClient = nil
var twitterClientLock sync.RWMutex
var twitterAuthFailedCount = 0

func httpNotifyCallee(w http.ResponseWriter, r *http.Request, urlID string, remoteAddr string, remoteAddrWithPort string) {
	// caller wants to wait for callee to come online to answer call
	if urlID == "" {
		fmt.Printf("# /notifyCallee failed no urlID\n")
		// JS will tell caller: could not reach urlID
		return
	}

	// get callerId + callerName from url-args
	callerId := ""
	url_arg_array, ok := r.URL.Query()["callerId"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerId = url_arg_array[0]
	}
	callerName := ""
	url_arg_array, ok = r.URL.Query()["callerName"]
	if ok && len(url_arg_array[0]) >= 1 {
		callerName = url_arg_array[0]
	}
	fmt.Printf("/notifyCallee callerId=(%s) callerName=(%s)\n", callerId, callerName)

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
	occupy := false
	globalID, locHub, globHub, err := GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
		remoteAddr, occupy, "/notifyCallee")
	if err != nil {
		fmt.Printf("# /notifyCallee GetOnlineCallee() err=%v\n", err)
		return
	}
	if globalID != "" {
		if (locHub!=nil && locHub.IsCalleeHidden) || (globHub!=nil && globHub.IsCalleeHidden) {
			fmt.Printf("/notifyCallee (%s) isHiddenOnline\n", urlID)
			calleeIsHiddenOnline = true
		}
	}

	if globalID == "" {
		// callee (urlID) is really offline - send push notification(s)
		// NOTE: on Chromium/Mac this msg is cut off after "the phone." (with callerName="Dave")
		msg := "Caller " + callerName + " is waiting for you to pick up the phone." +
			" Please open your callee app now."
		notificationSent := false

		if dbUser.Str2 != "" {
			// web push device 1 subscription is specified
			// here we use web push to send a notification
			err, statusCode := webpushSend(dbUser.Str2, msg, urlID)
			if err != nil {
				fmt.Printf("# /notifyCallee (%s) webpush fail device1 err=%v\n", urlID, err)
			} else if statusCode == 201 {
				notificationSent = true
			} else if statusCode == 410 {
				fmt.Printf("# /notifyCallee (%s) webpush fail device1 delete subscr\n", urlID)
				dbUser.Str2 = ""
			} else {
				fmt.Printf("# /notifyCallee (%s) webpush fail device1 status=%d\n",
					urlID, statusCode)
			}
		}

		if dbUser.Str3 != "" {
			// web push device 2 subscription is specified
			// here we use web push to send a notification
			err, statusCode := webpushSend(dbUser.Str3, msg, urlID)
			if err != nil {
				fmt.Printf("# /notifyCallee (%s) webpush fail device2 err=%v\n", urlID, err)
			} else if statusCode == 201 {
				notificationSent = true
			} else if statusCode == 410 {
				fmt.Printf("# /notifyCallee (%s) webpush fail device2 delete subscr\n", urlID)
				dbUser.Str3 = ""
			} else {
				fmt.Printf("# /notifyCallee (%s) webpush fail device2 status=%d\n",
					urlID, statusCode)
			}
		}

		// notify urlID via twitter direct message
		// here we use twitter message (or twitter direct message) to send a notification
		if dbUser.Email2 != "" { // twitter handle
			twitterClientLock.Lock()
			if twitterClient == nil {
				twitterAuth()
			}
			twitterClientLock.Unlock()
			if twitterClient == nil {
				fmt.Printf("# /notifyCallee (%s) failed no twitterClient\n", urlID)
				// script will tell caller: could not reach urlID
			} else {
				//_,err = twitterClient.SendDirect(dbUser.Email2, msg)
				if strings.HasPrefix(dbUser.Email2, "@") {
					msg = dbUser.Email2 + " " + msg
				} else {
					msg = "@" + dbUser.Email2 + " " + msg
				}
				msg = msg + " " + operationalNow().Format("2006-01-02 15:04:05")
				respdata, err := twitterClient.SendTweet(msg)
				if err != nil {
					maxlen := 30
					if len(dbUser.Email2) < 30 {
						maxlen = len(dbUser.Email2)
					}
					fmt.Printf("# /notifyCallee (%s/%s) SendDirect err=%v\n",
						urlID, dbUser.Email2[:maxlen], err)
					// script will tell caller: could not reach urlID
					// TODO: but if the err is caused by the callee entering a faulty tw_user_id
					//       how will this callee find out about the issue?
				} else {
					tweet := twitter.TimelineTweet{}
					err = json.Unmarshal(respdata, &tweet)
					if err != nil {
						fmt.Printf("# SendTweet cannot parse respdata err=%v\n", err)
					} else {
						// twitter notification succesfully sent
						notificationSent = true
						maxlen := 30
						if len(dbUser.Email2) < 30 {
							maxlen = len(dbUser.Email2)
						}
						fmt.Printf("SendTweet OK (id=%s/twHandle=%s/tweetId=%s)\n",
							urlID, dbUser.Email2[:maxlen], tweet.IdStr)
						// in 1hr we want to delete this tweet via tweet.Id
						// so we store tweet.Id dbSentNotifTweets
						notifTweet := NotifTweet{time.Now().Unix(), msg}
						err = kvNotif.Put(dbSentNotifTweets, tweet.IdStr, notifTweet, false)
						if err != nil {
							fmt.Printf("# /notifyCallee (%s) failed to store dbSentNotifTweets\n",
								tweet.IdStr)
						}
					}
				}
			}
		}

		if !notificationSent {
			// we couldn't send any notifications: store call as missed call
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

	// the following will "freeze" the caller until callee sends a value to the callers chan
	// waitingCallerChanMap[urlID] <- 1
	c := make(chan int)
	waitingCallerChanLock.Lock()
	waitingCallerChanMap[remoteAddrWithPort] = c
	waitingCallerChanLock.Unlock()

	waitingCaller := CallerInfo{remoteAddrWithPort, callerName, time.Now().Unix(), callerId}

	var waitingCallerSlice []CallerInfo
	err = kvCalls.Get(dbWaitingCaller, urlID, &waitingCallerSlice)
	if err != nil {
		//fmt.Printf("# /notifyCallee (%s) failed to read dbWaitingCaller\n",urlID)
	}
	waitingCallerSlice = append(waitingCallerSlice, waitingCaller)
	err = kvCalls.Put(dbWaitingCaller, urlID, waitingCallerSlice, false)
	if err != nil {
		fmt.Printf("# /notifyCallee (%s) failed to store dbWaitingCaller\n", urlID)
	}

	hubMapMutex.RLock()
	myhub := hubMap[globalID]
	var cli *WsClient = nil
	if myhub!=nil {
		cli = myhub.CalleeClient
	}
	hubMapMutex.RUnlock()

	if calleeIsHiddenOnline {
		// send an updated json to callee-client
		fmt.Printf("/notifyCallee (%s) send waitingCallerSlice len=%d\n",
			urlID, len(waitingCallerSlice))
		json, err := json.Marshal(waitingCallerSlice)
		if err != nil {
			fmt.Printf("# /notifyCallee json.Marshal(waitingCallerSlice) err=%v\n", err)
		} else {
			fmt.Printf("/notifyCallee send waitingCallers (%s)\n", urlID)

			if cli != nil {
				cli.Write([]byte("waitingCallers|" + string(json)))
			}
		}
	}

	// let caller wait (let it's xhr stand) until callee picks up the call
	fmt.Printf("/notifyCallee (%s) waiting for callee online notification\n", urlID)
	if cli != nil {
		cli.unHiddenForCaller = "" // TODO ???
	}
	callerGaveUp := false
	select {
	case <-c:
		// callee allows caller to connect
		// coming from callee.js: function pickupWaitingCaller(callerID)
		//             client.go: if cmd=="pickupWaitingCaller"
		// in the mean time callee may have gone offline (and is now back online)
		urlID, _, _, err := GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
			remoteAddr, occupy, "/notifyCallee")
		if err != nil {
			fmt.Printf("# /notifyCallee GetOnlineCallee() err=%v\n", err)
			return
		}

		if urlID != "" {
			fmt.Printf("/notifyCallee callee (%s) wants caller (%s) to connect (%s)\n",
				urlID, remoteAddr, cli.unHiddenForCaller)
			// this will make the hidden callee "visible" for the caller
			cli.unHiddenForCaller = remoteAddr
			if err := SetUnHiddenForCaller(urlID, remoteAddr); err != nil {
				fmt.Printf("# /notifyCallee SetUnHiddenForCaller id=%s ip=%s err=%v\n",
					urlID, remoteAddr, err)
			}

			hubMapMutex.RLock()
			cli = hubMap[urlID].CalleeClient
			hubMapMutex.RUnlock()
		} else {
			fmt.Printf("# /notifyCallee callee (%s) wants caller (%s) to connect - hubclient==nil\n",
				urlID, remoteAddr)
			cli = nil
		}
		// caller receiving this "ok" will automatically attempt to make a call now
		fmt.Fprintf(w, "ok")
	case <-r.Context().Done():
		// caller has disconnected (before callee could wake this channel to answer the call)
		fmt.Printf("/notifyCallee (%s) caller disconnected\n", urlID)
		callerGaveUp = true

		// callee may have gone offline in the mean time - and may be back online now
		// so it only helps if we retrieve hubclient before we hubclient.send below
		urlID, _, _, err := GetOnlineCallee(urlID, ejectOn1stFound, reportHiddenCallee,
			remoteAddr, occupy, "/notifyCallee")
		if err != nil {
			fmt.Printf("# /notifyCallee GetOnlineCallee() id=%s err=%v\n", urlID, err)
		}
		if urlID != "" {
			hubMapMutex.RLock()
			cli = hubMap[urlID].CalleeClient
			hubMapMutex.RUnlock()
		} else {
			cli = nil
		}
	}

	fmt.Printf("/notifyCallee (%s) delete callee online-notification chan\n", urlID)
	waitingCallerChanLock.Lock()
	delete(waitingCallerChanMap, remoteAddrWithPort)
	waitingCallerChanLock.Unlock()

	var missedCallsSlice []CallerInfo

	// remove this caller from waitingCallerSlice
	for idx := range waitingCallerSlice {
		if waitingCallerSlice[idx].AddrPort == remoteAddrWithPort {
			fmt.Printf("/notifyCallee (%s) remove caller from waitingCallerSlice + store\n", urlID)
			waitingCallerSlice = append(waitingCallerSlice[:idx], waitingCallerSlice[idx+1:]...)
			err = kvCalls.Put(dbWaitingCaller, urlID, waitingCallerSlice, false)
			if err != nil {
				fmt.Printf("# /notifyCallee (%s) failed to store dbWaitingCaller\n", urlID)
			}

			if callerGaveUp {
				// store missed call
				if(dbUser.StoreMissedCalls) {
					fmt.Printf("/notifyCallee (%s) store missed call\n", urlID)
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

	if cli != nil {
		// send updated waitingCallerSlice + missedCalls
		waitingCallerToCallee(urlID, waitingCallerSlice, missedCallsSlice, cli)
	} else {
		fmt.Printf("# /notifyCallee (%s) cli==nil\n", urlID)
	}
	return
}

func httpMissedCall(w http.ResponseWriter, r *http.Request, urlID string, remoteAddr string, remoteAddrWithPort string) {
	fmt.Printf("/httpMissedCall (%s) rip=%s\n", urlID, remoteAddrWithPort)
	// urlID is encoded: calleeId+"|"+callerName+"|"+callerId
	tok := strings.Split(urlID, "|")
	if len(tok) != 3 {
		fmt.Printf("# /httpMissedCall (%s) failed len(tok)=%d rip=%s\n",urlID,len(tok),remoteAddr)
		return
	}
	if tok[0]=="" {
		fmt.Printf("# /httpMissedCall (%s) failed no calleeId rip=%s\n",urlID,remoteAddr)
		return
	}
	if tok[1]=="" && tok[2]=="" {
		fmt.Printf("# /httpMissedCall (%s) failed no callerName + no callerId rip=%s\n",urlID,remoteAddr)
		return
	}
	calleeId := tok[0]
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
		fmt.Printf("/httpMissedCall (%s) no StoreMissedCalls rip=%s\n",dbUserKey,remoteAddr)
		return
	}
	// store missed call
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
	caller := CallerInfo{remoteAddrWithPort,tok[1],time.Now().Unix(),""}
	if tok[1]=="" || tok[1]=="undefined" {
		if tok[2]=="undefined" {
			caller = CallerInfo{remoteAddrWithPort,"unknown",time.Now().Unix(),""}
		} else {
			caller = CallerInfo{remoteAddrWithPort,tok[2],time.Now().Unix(),""}
		}
	}
	missedCallsSlice = append(missedCallsSlice, caller)
	err = kvCalls.Put(dbMissedCalls, calleeId, missedCallsSlice, true) // skipConfirm
	if err!=nil {
		fmt.Printf("# /httpMissedCall (%s) fail store dbMissedCalls err=%v rip=%s\n", calleeId, err, remoteAddr)
	}
	fmt.Printf("/httpMissedCall (%s) stored dbMissedCalls caller=%v rip=%s %v\n",
		calleeId, caller, remoteAddr, missedCallsSlice)
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

	// remoteAddrWithPort of incoming call
	caller := CallerInfo{remoteAddrWithPort,"unknown",time.Now().Unix(),""}

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

	if dbUser.Email2=="" && dbUser.Str2=="" && dbUser.Str3=="" {
		// this user can NOT rcv push msg (not pushable)
		fmt.Printf("/canbenotified (%s) has no push channel rip=%s\n",urlID,remoteAddr)
		if(dbUser.StoreMissedCalls) {
			// store missed call
			var missedCallsSlice []CallerInfo
			err := kvCalls.Get(dbMissedCalls,urlID,&missedCallsSlice)
			if err!=nil {
				fmt.Printf("# /canbenotified (%s) failed to read dbMissedCalls err=%v rip=%s\n",
					urlID, err, remoteAddr)
			}
			// make sure we never show more than 10 missed calls
			if missedCallsSlice!=nil && len(missedCallsSlice)>=10 {
				missedCallsSlice = missedCallsSlice[1:]
			}
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
	fmt.Printf("/canbenotified urlID=(%s) return (ok|%s) rip=%s\n",urlID,calleeName,remoteAddr)
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
	fmt.Printf("webpush.SendNotif OK (id=%s) (httpRespCode=%v)\n",	urlID, httpResponse.StatusCode)
	httpResponse.Body.Close()
	return err, httpResponse.StatusCode
}

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
		fmt.Printf("twitter auth using accessToken.txt (%s)\n",accessTokenFile)
		str := string(b)
		linetokens := strings.SplitN(str, "\n", 4)
		//log.Println("linetokens[0]="+linetokens[0])
		//log.Println("linetokens[1]="+linetokens[1])
		fmt.Printf("twitter auth linetokens[2]=%s\n", linetokens[2])
		//log.Println("linetokens[3]="+linetokens[3])
		var accessToken oauth.AccessToken
		accessToken.Token = linetokens[0]
		accessToken.Secret = linetokens[1]
		accessToken.AdditionalData = make(map[string]string)
		accessToken.AdditionalData["screen_name"] = linetokens[2]
		accessToken.AdditionalData["user_id"] = linetokens[3]
		accessTokenPtr, err := twitterClient.DoAuth(&accessToken)
		fmt.Printf("twitter auth accessToken=%v err=%v\n", accessTokenPtr, err)
		if err != nil {
			fmt.Printf("# twitter auth failed err=%v\n", err)
			twitterClient = nil
			twitterAuthFailedCount++
		} else {
			fmt.Printf("twitter auth success\n")
		}
	}
}

