// WebCall Copyright 2022 timur.mobi. All rights reserved.
//
// These methods enable callees to read and modify their 
// callee specific settings. As well as read and modify their
// contacts.
//
// httpGetSettings() is called via XHR "/rtcsig/getsettings".
// httpSetSettings() is called via XHR "/rtcsig/setsettings".
// httpGetContacts() is called via XHR "/rtcsig/getcontacts".
// httpSetContacts() is called via XHR "/rtcsig/setcontact".
// httpDeleteContact() is called via XHR "/rtcsig/deletecontact".

package main

import (
	"net/http"
	"fmt"
	"encoding/json"
	"io"
	"strconv"
	"strings"
)

func httpGetSettings(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if cookie==nil {
		// no settings without a cookie (but not worth logging)
		//fmt.Printf("# /getsettings fail calleeID(%s) cookie==nil rip=%s\n", calleeID, remoteAddr)
		return
	}
	if calleeID=="" {
		fmt.Printf("# /getsettings fail no calleeID rip=%s\n", remoteAddr)
		return
	}
	if calleeID!=urlID {
		// this happens bc someone with calleeID in the cookie is now trying to use urlID via url
		fmt.Printf("# /getsettings fail calleeID(%s) != urlID(%s) rip=%s\n", calleeID, urlID, remoteAddr)
		return
	}

	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs,calleeID,&dbEntry)
	if err!=nil {
		fmt.Printf("# /getsettings (%s) fail on dbRegisteredIDs rip=%s\n", calleeID, remoteAddr)
		return
	}

	dbUserKey := fmt.Sprintf("%s_%d",calleeID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("# /getsettings (%s) fail on dbUserBucket rip=%s\n", calleeID, remoteAddr)
		return
	}

	var reqBody []byte
	readConfigLock.RLock() // for vapidPublicKey
	reqBody, err = json.Marshal(map[string]string{
		"nickname": dbUser.Name,
		"twname": dbUser.Email2, // twitter handle (starting with @)
		"twid": dbUser.Str1, // twitter user_id
		"storeContacts": strconv.FormatBool(dbUser.StoreContacts),
		"storeMissedCalls": strconv.FormatBool(dbUser.StoreMissedCalls),
		"webPushSubscription1": dbUser.Str2,
		"webPushUA1": dbUser.Str2ua,
		"webPushSubscription2": dbUser.Str3,
		"webPushUA2": dbUser.Str3ua,
		"vapidPublicKey": vapidPublicKey,
	})
	readConfigLock.RUnlock()
	if err != nil {
		fmt.Printf("# /getsettings (%s) fail on json.Marshal rip=%s\n", calleeID, remoteAddr)
		return
	}
	if logWantedFor("getsettings") {
		fmt.Printf("/getsettings for (%s) [%s]\n",calleeID,reqBody)
	}
	fmt.Fprintf(w,string(reqBody))
	return
}

func httpSetSettings(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if calleeID=="" {
		fmt.Printf("# /setsettings fail no calleeID rip=%s\n", remoteAddr)
		return
	}
	if cookie==nil {
		fmt.Printf("# /setsettings (%s) fail no cookie rip=%s\n", calleeID, remoteAddr)
		return
	}

	if calleeID!=urlID {
		fmt.Printf("# /setsettings fail calleeID(%s) != urlID(%s) rip=%s\n", calleeID, urlID, remoteAddr)
		return
	}

	// get json response via post to store settings for calleeID (from cookie)
	data := ""
	postBuf := make([]byte, 2000)
	length,_ := io.ReadFull(r.Body, postBuf)
	if length>0 {
		data = string(postBuf[:length])
	}
	if data=="" {
		fmt.Printf("# /setsettings (%s) failed on io.ReadFull body rip=%s\n",calleeID, remoteAddr)
		return
	}
	fmt.Printf("/setsettings (%s) len=%d rip=%s\n", calleeID, len(data), remoteAddr)

	var newSettingsMap map[string]string
	err := json.Unmarshal([]byte(data), &newSettingsMap)
	if err!=nil {
		fmt.Printf("# /setsettings (%s) failed on json.Unmarshal (%v) err=%v\n", calleeID, data, err)
		return
	}

	var dbEntry DbEntry
	err = kvMain.Get(dbRegisteredIDs,calleeID,&dbEntry)
	if err!=nil {
		fmt.Printf("# /setsettings (%s) failed on dbRegisteredIDs rip=%s\n", calleeID, remoteAddr)
		return
	}

	dbUserKey := fmt.Sprintf("%s_%d",calleeID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("# /setsettings (%s) failed on dbUserBucket rip=%s\n", calleeID, remoteAddr)
		return
	}

	for key,val := range newSettingsMap {
		switch(key) {
		case "nickname":
			if val != dbUser.Name {
				fmt.Printf("/setsettings (%s) new nickname (%s) (old:%s)\n",calleeID,val,dbUser.Name)
				dbUser.Name = val
			}
		case "twname":
			if val != dbUser.Email2 {
				fmt.Printf("/setsettings (%s) new twname (%s) (old:%s)\n",calleeID,val,dbUser.Email2)
				dbUser.Email2 = val
			}
		case "twid":
			if val != dbUser.Str1 {
				fmt.Printf("/setsettings (%s) new twid (%s) (old:%s)\n",calleeID,val,dbUser.Str1)
				dbUser.Str1 = val
			}
		case "storeContacts":
			if(val=="true") {
				if dbUser.StoreContacts != true {
					fmt.Printf("/setsettings (%s) new storeContacts (%s) (old:%v)\n",
						calleeID,val,dbUser.StoreContacts)
					dbUser.StoreContacts = true
				}
			} else {
				if dbUser.StoreContacts != false {
					fmt.Printf("/setsettings (%s) new storeContacts (%s) (old:%v)\n",
						calleeID,val,dbUser.StoreContacts)
					dbUser.StoreContacts = false
				}
			}
		case "storeMissedCalls":
			if(val=="true") {
				if !dbUser.StoreMissedCalls {
					fmt.Printf("/setsettings (%s) new storeMissedCalls (%s) old:%v\n",
						calleeID,val,dbUser.StoreMissedCalls)
					dbUser.StoreMissedCalls = true
					// show missedCalls on callee web client (if avail)
					hubMapMutex.RLock()
					hub := hubMap[calleeID]
					hubMapMutex.RUnlock()
					if hub!=nil && hub.CalleeClient!=nil {
						var callsWhileInAbsence []CallerInfo
						err := kvCalls.Get(dbMissedCalls,calleeID,&callsWhileInAbsence)
						if err!=nil {
							// "key not found" is here NOT an error
							if strings.Index(err.Error(),"key not found")<0 {
								fmt.Printf("# /setsettings (%s) storeMissedCalls kvCalls.Get fail err=%v\n",
									calleeID, err)
							}
						} else {
							json, err := json.Marshal(callsWhileInAbsence)
							if err != nil {
								fmt.Printf("# /setsettings (%s) storeMissedCalls json.Marshal fail err=%v\n",
									calleeID, err)
							} else {
								hub.CalleeClient.Write([]byte("missedCalls|"+string(json)))
							}
						}
					}
				}
			} else {
				if dbUser.StoreMissedCalls {
					fmt.Printf("/setsettings (%s) new storeMissedCalls (%s) old:%v\n",
						calleeID,val,dbUser.StoreMissedCalls)
					dbUser.StoreMissedCalls = false
					// hide missedCalls on callee web client
					hubMapMutex.RLock()
					hub := hubMap[calleeID]
					hubMapMutex.RUnlock()
					if hub!=nil && hub.CalleeClient!=nil {
						hub.CalleeClient.Write([]byte("missedCalls|")) // need websocket
					}
				}
			}
/*
		case "webPushSubscription1":
			newVal,err := url.QueryUnescape(val)
			if err!=nil {
				fmt.Printf("# /setsettings (%s) url.QueryUnescape webPushSubscription1 err=%v\n",
					calleeID, err)
			} else if newVal != dbUser.Str2 {
				fmt.Printf("/setsettings (%s) new webPushSubscription1 (%s) (old:%s)\n",
					calleeID, newVal, dbUser.Str2)
				if dbUser.Str2 != newVal {
					dbUser.Str2 = newVal
					if newVal!="" {
						// send welcome/verification push-msg
						msg := "You will from now on receive a WebPush notification for every call"+
								" you receive while not being connected to the WebCall server."
						err,statusCode := webpushSend(dbUser.Str2,msg,calleeID)
						if err!=nil {
							fmt.Printf("# setsettings (%s) webpush fail device1 err=%v\n",urlID,err)
						} else if statusCode==201 {
							// success
						} else if statusCode==410 {
							fmt.Printf("# setsettings (%s) webpush fail device1 delete subscr\n",
								urlID)
							dbUser.Str2 = ""
						} else {
							fmt.Printf("# setsettings (%s) webpush fail device1 status=%d\n",
								urlID, statusCode)
						}
					}
				}
			}

		case "webPushUA1":
			newVal,err := url.QueryUnescape(val)
			if err!=nil {
				fmt.Printf("# /setsettings (%s) url.QueryUnescape webPushUA1 err=%v\n",
					calleeID, err)
			} else if newVal != dbUser.Str2ua {
				fmt.Printf("/setsettings (%s) new webPushUA1 (%s) (old:%s)\n",
					calleeID, newVal, dbUser.Str2ua)
				dbUser.Str2ua = newVal
			}

		case "webPushSubscription2":
			newVal,err := url.QueryUnescape(val)
			if err!=nil {
				fmt.Printf("# /setsettings (%s) url.QueryUnescape webPushSubscription2 err=%v\n",
					calleeID, err)
			} else if newVal != dbUser.Str3 {
				fmt.Printf("/setsettings (%s) new webPushSubscription2 (%s) (old:%s)\n",
					calleeID, newVal, dbUser.Str3)
				if dbUser.Str3 != newVal {
					dbUser.Str3 = newVal
					if newVal!="" {
						// send welcome/verification push-msg
						msg := "You will from now on receive a WebPush notification for every call"+
								" you receive while not being connected to the WebCall server."
						err,statusCode := webpushSend(dbUser.Str3,msg,calleeID)
						if err!=nil {
							fmt.Printf("# /setsettings (%s) webpush fail device2 err=%v\n",urlID,err)
						} else if statusCode==201 {
							// success
						} else if statusCode==410 {
							fmt.Printf("# /setsettings (%s) webpush fail device2 delete subscr\n",
								urlID)
							dbUser.Str3 = ""
						} else {
							fmt.Printf("# /setsettings (%s) webpush fail device2 status=%d\n",
								urlID, statusCode)
						}
					}
				}
			}

		case "webPushUA2":
			newVal,err := url.QueryUnescape(val)
			if err!=nil {
				fmt.Printf("# /setsettings (%s) url.QueryUnescape webPushUA2 err=%v\n",
					calleeID, err)
			} else if newVal != dbUser.Str3ua {
				fmt.Printf("/setsettings (%s) new webPushUA2 (%s) (old:%s)\n",
					calleeID, newVal, dbUser.Str3ua)
				dbUser.Str3ua = newVal
			}
*/
		}
	}

	// store data
	err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
	if err!=nil {
		fmt.Printf("# /setsettings (%s) store db=%s bucket=%s err=%v\n", calleeID, dbMainName, dbUserBucket, err)
	} else {
		fmt.Printf("/setsettings (%s) stored db=%s bucket=%s\n", calleeID, dbMainName, dbUserBucket)
	}
	return
}

func httpGetContacts(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if calleeID=="" {
		fmt.Printf("# /getcontacts calleeID empty\n")
		return
	}
	if cookie==nil {
		fmt.Printf("# /getcontacts (%s) fail no cookie rip=%s\n", calleeID, remoteAddr)
		return
	}
	if urlID!=calleeID {
		fmt.Printf("# /getcontacts urlID=%s != calleeID=%s\n",urlID,calleeID)
		return
	}
	var callerInfoMap map[string]string // callerID -> name
	err := kvContacts.Get(dbContactsBucket,calleeID,&callerInfoMap)
	if err!=nil {
		fmt.Printf("# /getcontacts db get calleeID=%s err=%v\n", calleeID, err)
		return
	}
	jsonStr, err := json.Marshal(callerInfoMap)
	if err != nil {
		fmt.Printf("# /getcontacts (%s) failed on json.Marshal err=%v\n", calleeID, err)
		return
	}
	if logWantedFor("contacts") {
		fmt.Printf("/getcontacts (%s) send %d elements\n",calleeID,len(callerInfoMap))
	}
	fmt.Fprintf(w,string(jsonStr))
	return
}

func httpSetContacts(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if urlID=="" || urlID=="undefined" {
		//fmt.Printf("# /setcontact urlID empty\n")
		return
	}
	if cookie==nil {
		fmt.Printf("# /setcontact (%s) fail no cookie rip=%s\n", calleeID, remoteAddr)
		return
	}
	if urlID!=calleeID {
		fmt.Printf("# /setcontact urlID=%s != calleeID=%s\n",urlID,calleeID)
		return
	}

	contactID := ""
	url_arg_array, ok := r.URL.Query()["contactID"]
	if ok && len(url_arg_array[0]) >= 1 {
		contactID = url_arg_array[0]
	}
	if contactID=="" {
		if logWantedFor("contacts") {
			fmt.Printf("/setcontact (%s) contactID from client is empty\n", calleeID)
		}
		return
	}
	contactID = strings.ToLower(contactID)

	name := ""
	url_arg_array, ok = r.URL.Query()["name"]
	if ok && len(url_arg_array[0]) >= 1 {
		name = url_arg_array[0]
	}

	// if dbUser.StoreContacts==false (not checked), just return fmt.Fprintf(w,"ok")
	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs,calleeID,&dbEntry)
	if err!=nil {
		fmt.Printf("# /setcontact (%s) fail on dbRegisteredIDs rip=%s\n", calleeID, remoteAddr)
		return
	}
	dbUserKey := fmt.Sprintf("%s_%d",calleeID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("# /setcontact (%s) fail on dbUserBucket rip=%s\n", calleeID, remoteAddr)
		return
	}
	if !dbUser.StoreContacts {
		if logWantedFor("contacts") {
			fmt.Printf("/setcontact (%s) !StoreContacts rip=%s\n", calleeID, remoteAddr)
		}
		fmt.Fprintf(w,"ok")
		return
	}

	var callerInfoMap map[string]string // callerID -> name
	err = kvContacts.Get(dbContactsBucket,calleeID,&callerInfoMap)
	if err!=nil {
		if(strings.Index(err.Error(),"key not found")<0) {
			fmt.Printf("# /setcontact db get calleeID=%s err=%v\n", calleeID, err)
			return
		}
		// "key not found" is just an empty contacts list
		if logWantedFor("contacts") {
			fmt.Printf("/setcontact creating new contacts map\n")
		}
		callerInfoMap = make(map[string]string)
	}

	oldName,ok := callerInfoMap[contactID]
	if ok && oldName!="" && oldName!="unknown" && oldName!="?" && name=="" {
		// don't overwrite existing name with empty name
		if logWantedFor("contacts") {
			fmt.Printf("/setcontact (%s) contactID=%s already exists (%s)\n",
				calleeID, contactID, oldName)
		}
		return
	}

	if name=="" {
		name = "unknown"
	}
	if name!=oldName {
		fmt.Printf("/setcontact (%s) store changed name of %s from (%s) to (%s)\n",
			calleeID, contactID, oldName, name)
		callerInfoMap[contactID] = name
		err = kvContacts.Put(dbContactsBucket, calleeID, callerInfoMap, false)
		if err!=nil {
			fmt.Printf("# /setcontact store calleeID=%s err=%v\n", calleeID, err)
			return
		}
	}
	// name has not changed
	fmt.Fprintf(w,"ok")
	return
}

func httpDeleteContact(w http.ResponseWriter, r *http.Request, urlID string, calleeID string, cookie *http.Cookie, remoteAddr string) {
	if calleeID=="" {
		fmt.Printf("# /deletecontact calleeID empty\n")
		return
	}
	if(cookie==nil) {
		fmt.Printf("# /deletecontact cookie==nil urlID=%s calleeID=%s\n",urlID,calleeID)
		return
	}
	if urlID!=calleeID {
		fmt.Printf("# /deletecontact urlID=%s != calleeID=%s\n",urlID,calleeID)
		return
	}

	contactID := ""
	url_arg_array, ok := r.URL.Query()["contactID"]
	if ok && len(url_arg_array[0]) >= 1 {
		contactID = url_arg_array[0]
	}
	if contactID=="" {
		fmt.Printf("# /deletecontact (%s) contactID from client is empty\n", calleeID)
		return
	}
	contactID = strings.ToLower(contactID)

	var callerInfoMap map[string]string // callerID -> name
	err := kvContacts.Get(dbContactsBucket,calleeID,&callerInfoMap)
	if err!=nil {
		fmt.Printf("# /deletecontact db get calleeID=%s err=%v\n", calleeID, err)
		return
	}

	_,ok = callerInfoMap[contactID]
	if !ok {
		fmt.Printf("# /deletecontact (%s) callerInfoMap[%s] does not exist\n", calleeID, contactID)
		return
	}
	delete(callerInfoMap,contactID)
	err = kvContacts.Put(dbContactsBucket, calleeID, callerInfoMap, false)
	if err!=nil {
		fmt.Printf("# /deletecontact store calleeID=%s err=%v\n", calleeID, err)
		return
	}
	fmt.Printf("/deletecontact calleeID=(%s) contactID[%s]\n",calleeID, contactID)
	fmt.Fprintf(w,"ok")
	return
}

func httpTwId(w http.ResponseWriter, r *http.Request, twHandle string, cookie *http.Cookie, remoteAddr string) {
	// /twid returns twitter-Id for a twHandle
	if(cookie==nil) {
		fmt.Printf("# /twid cookie==nil twHandle=%s\n",twHandle)
		return
	}

	twitterClientLock.Lock()
	if twitterClient == nil {
		fmt.Printf("/twid twitterAuth... twHandle=%s\n",twHandle)
		twitterAuth()
	}
	twitterClientLock.Unlock()

	if(twitterClient==nil) {
		fmt.Printf("# /twid twitterClient==nil twHandle=%s\n",twHandle)
		fmt.Fprintf(w,"errorauth")
	} else {
		twitterClientLock.Lock()
		userDetail, _, err := twitterClient.QueryFollowerByName(twHandle)
		twitterClientLock.Unlock()
		if err!=nil {
			fmt.Printf("# /twid twHandle=(%s) err=%v\n", twHandle, err)
			fmt.Fprintf(w,"errorquery")
		} else {
			fmt.Printf("/twid twHandle.Email2=(%s) fetched id=%v\n",
				twHandle, userDetail.ID)
			// "0" = twHandle not found
			fmt.Fprintf(w,fmt.Sprintf("%d",userDetail.ID))
		}
	}
	return
}

func httpTwFollower(w http.ResponseWriter, r *http.Request, twId string, cookie *http.Cookie, remoteAddr string) {
	// return twId for twHandle
	if(cookie==nil) {
		fmt.Printf("# /twfollower cookie==nil twId=%s\n",twId)
		fmt.Fprintf(w,"error denied")
		return
	}

	twid, err := strconv.ParseInt(twId, 10, 64)
	if err!=nil {
		fmt.Printf("# /twfollower ParseInt64 fail twid=(%s) err=%v\n", twid, err)
		fmt.Fprintf(w,"error format "+err.Error())
	} else {
		foundId := false
		if twid>0 {
			// check if twid exist in followerIDs
			for _,id := range followerIDs.Ids {
				if id == twid {
					foundId = true
				}
			}
		}
		if foundId {
			// this twid is a follower
			//fmt.Printf("/twfollower found twHandle=%s twId=%d\n", dbUser.Email2, twid)
			fmt.Fprintf(w,"OK")
		} else {
			// this twid is NOT a follower
			fmt.Printf("# /twfollower twId=%d not found\n", twid)
			fmt.Fprintf(w,"error id not found")
		}
	}
}

