// WebCall Copyright 2022 timur.mobi. All rights reserved.
package main

import (
	"time"
	"fmt"
	"strings"
	"strconv"
	"bytes"
	"unicode"
	"encoding/gob"
	"sort"
	"io"
	"os"
	"os/exec"
	"sync"
	"sync/atomic"
	"github.com/mehrvarz/webcall/skv"
	"github.com/mehrvarz/webcall/twitter"
	"gopkg.in/ini.v1"
	bolt "go.etcd.io/bbolt"
)

var followerIDs twitter.FollowerIDs
var followerIDsLock sync.RWMutex

func ticker3hours() {
	if logWantedFor("timer") {
		fmt.Printf("ticker3hours start\n")
	}
	kv := kvMain.(skv.SKV)
	db := kv.Db

	// put ticker3hours out of step with other tickers
	time.Sleep(37 * time.Second)

	threeHoursTicker := time.NewTicker(3*60*60*time.Second)
	defer threeHoursTicker.Stop()
	for {
		timeNowUnix := time.Now().Unix()

		// loop all dbRegisteredIDs to delete outdated dbUserBucket entries (not online for 180+ days)
		if logWantedFor("timer") {
			fmt.Printf("ticker3hours start looking for outdated IDs...\n")
		}
		var maxDaysOffline int64 = 180
		var deleteKeyArray []string  // for deleting
		skv.DbMutex.Lock()
		counterDeleted := 0
		counter := 0
		err := db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(dbRegisteredIDs))
			c := b.Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				userID := string(k)
				if strings.HasPrefix(userID,"answie") || strings.HasPrefix(userID,"talkback") {
					continue
				}
				if !isOnlyNumericString(userID) {
					continue
				}
				var dbEntry DbEntry // DbEntry{unixTime, remoteAddr, urlPw}
				d := gob.NewDecoder(bytes.NewReader(v))
				d.Decode(&dbEntry)
				// we now must find out when this user was using the account the last time
				dbUserKey := fmt.Sprintf("%s_%d", userID, dbEntry.StartTime)
				var dbUser DbUser
				err2 := kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
				if err2 != nil {
					// this occurs with mapping tmpID's - is not an error
					//fmt.Printf("# ticker3hours %d error read db=%s bucket=%s get key=%v err=%v\n",
					//	counter, dbMainName, dbUserBucket, dbUserKey, err2)
				} else {
					counter++
					lastLoginTime := dbUser.LastLoginTime
					if(lastLoginTime==0) {
						lastLoginTime = dbEntry.StartTime // created by httpRegister()
					}
					if(lastLoginTime==0) {
						if logWantedFor("timer") {
							fmt.Printf("ticker3hours %d id=%s sinceLastLogin=0 StartTime=0\n", counter, k)
						}
					} else {
						sinceLastLoginSecs := timeNowUnix - lastLoginTime
						sinceLastLoginDays := sinceLastLoginSecs/(24*60*60)
						if sinceLastLoginDays > maxDaysOffline {
							// account is outdated, delete this entry
							if logWantedFor("timer") {
								fmt.Printf("ticker3hours %d id=%s regist delete sinceLastLogin=%ds days=%d\n",
									counter, k, sinceLastLoginSecs, sinceLastLoginDays)
							}
							err2 = c.Delete()
							if err2!=nil {
								// this is bad
								fmt.Printf("# ticker3hours %d id=%s regist delete err=%v\n", counter, k, err2)
							} else {
								counterDeleted++
								//if logWantedFor("timer") {
								//	fmt.Printf("ticker3hours %d id=%s regist deleted %d\n",
								//		counter, k, counterDeleted)
								//}
								// we will delete dbUserKey from dbUserBucket after db.Update() is finished
								deleteKeyArray = append(deleteKeyArray,dbUserKey)
							}
						}
					}
				}
			}
			return nil
		})
		skv.DbMutex.Unlock()
		if err!=nil {
			// this is bad
			fmt.Printf("# ticker3hours delete=%d offline for %d days err=%v\n", counterDeleted,maxDaysOffline,err)
		} else /*if counterDeleted>0*/ {
			if logWantedFor("timer") {
				fmt.Printf("ticker3hours delete=%d/%d offline for %d days (no err)\n",
					counterDeleted, counter, maxDaysOffline)
			}
		}
		for _,key := range deleteKeyArray {
			idxUnderline := strings.LastIndex(key,"_")
			if idxUnderline<0 {
				fmt.Printf("# ticker3hours error key=%s no underline\n", key)
				continue
			}
			userID := key[:idxUnderline]
			//if logWantedFor("timer") {
			//	fmt.Printf("ticker3hours delete outdated key=%s userID=%s\n", key, userID)
			//}
/*
				starttimeStr := key[idxUnderline+1:]
				starttime64, err := strconv.ParseInt(starttimeStr, 10, 64)
				if err!=nil {
					fmt.Printf("# ticker3hours error bucket=%s key=%s conv timestr err=%v\n",
						dbBlockedIDs, key, err)
				} else {
					sinceDeletedInSecs := timeNowUnix - starttime64
*/

			// delete/outdate mapped tmpIDs of outdated userID
			errcode,altIDs := getMapping(userID,"")
			if errcode==0 && altIDs!="" {
				tokenSlice := strings.Split(altIDs, "|")
				for _, tok := range tokenSlice {
					deleteMapping(userID,tok,"")
				}
			}

			// also delete userID's contacts
			err = kvContacts.Delete(dbContactsBucket, userID)
			if err!=nil {
				fmt.Printf("# ticker3hours delete contacts of id=%s err=%v\n", userID, err)
			}

			err = kv.Delete(dbUserBucket, key)
			if err!=nil {
				// this is bad
				fmt.Printf("# ticker3hours delete user-id=%s err=%v\n", key, err)
			} else {
				// all is well: create a dbBlockedIDs entry (will be deleted after 60 days)
				//fmt.Printf("ticker3hours key=%s user deleted\n", key)
				dbUserKey := fmt.Sprintf("%s_%d",userID, timeNowUnix)
				err = kvMain.Put(dbBlockedIDs, dbUserKey, DbUser{}, false)
				if err!=nil {
					// this is bad
					fmt.Printf("# ticker3hours error db=%s bucket=%s put key=%s err=%v\n",
						dbMainName,dbBlockedIDs,dbUserKey,err)
				}
			}
		}

		// loop all dbBlockedIDs to delete blocked entries
		var deleteKeyArray2 []string  // for deleting
		if logWantedFor("timer") {
			fmt.Printf("ticker3hours start looking for outdated blocked entries...\n")
		}
		var blockedForDays int64 = 60
		counterDeleted2 := 0
		counter2 := 0
		skv.DbMutex.Lock()
		err = db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(dbBlockedIDs))
			c := b.Cursor()
			for k, _ := c.First(); k != nil; k, _ = c.Next() {
/*
				userID := string(k) // key_timeNowUnix
				if strings.HasPrefix(userID,"answie") || strings.HasPrefix(userID,"talkback") {
					continue
				}
				if !isOnlyNumericString(userID) {
					continue
				}

				var dbEntry DbEntry // DbEntry{unixTime, remoteAddr, urlPw}
				d := gob.NewDecoder(bytes.NewReader(v))
				d.Decode(&dbEntry)

				sinceDeletedInSecs := timeNowUnix - dbEntry.StartTime
				if sinceDeletedInSecs > blockedForDays * 24*60*60 {
					deleteKeyArray2 = append(deleteKeyArray2,userID)
					counterDeleted2++
				}
*/
				dbUserKey := string(k)
				// dbUserKey format: 'calleeID_unixtime'
				counter2++
				idxUnderline := strings.LastIndex(dbUserKey,"_")
				if idxUnderline<0 {
					fmt.Printf("# ticker3hours error bucket=%s key=%s no underline\n", dbBlockedIDs, dbUserKey)
				} else {
					userID := dbUserKey[:idxUnderline]
					if strings.HasPrefix(userID,"answie") || strings.HasPrefix(userID,"talkback") {
						continue
					}
					if !isOnlyNumericString(userID) {
						fmt.Printf("_ticker3hours !isOnlyNumericString key=%s\n", userID)
						continue
					}

					starttimeStr := dbUserKey[idxUnderline+1:]
					starttime64, err := strconv.ParseInt(starttimeStr, 10, 64)
					if err!=nil {
						fmt.Printf("# ticker3hours error bucket=%s key=%s conv timestr err=%v\n",
							dbBlockedIDs, dbUserKey, err)
					} else {
						sinceDeletedInSecs := timeNowUnix - starttime64
						if sinceDeletedInSecs > blockedForDays * 24*60*60 {
							deleteKeyArray2 = append(deleteKeyArray2,dbUserKey)
							counterDeleted2++
						} else {
							if logWantedFor("timer") {
								secsToLive := blockedForDays * 24*60*60 - sinceDeletedInSecs
								if logWantedFor("blocked") {
									fmt.Printf("ticker3hours blocked but not outdated key=%s (wait %ds %ddays)\n",
										dbUserKey, secsToLive, secsToLive/(24*60*60))
								}
							}
						}
					}
				}
			}
			return nil
		})
		skv.DbMutex.Unlock()
		if err!=nil {
			// this is bad
			fmt.Printf("# ticker3hours delete=%d blocked for %d days err=%v\n",counterDeleted2,blockedForDays,err)
		} else /*if counterDeleted2>0*/ {
			if logWantedFor("timer") {
				fmt.Printf("ticker3hours delete=%d/%d id's blocked for %d days (no err)\n",
					counterDeleted2, counter2, blockedForDays)
			}
		}
		for _,key := range deleteKeyArray2 {
			if logWantedFor("timer") {
				fmt.Printf("ticker3hours delete blocked user-id=%s\n", key)
			}
			err = kv.Delete(dbBlockedIDs, key)
			if err!=nil {
				// this is bad
				fmt.Printf("# ticker3hours delete blocked user-id=%s err=%v\n", key, err)
			} else {
				// all is well
				//fmt.Printf("ticker3hours key=%s user deleted\n", key)
			}
		}

		if counterDeleted>0 || counterDeleted2>0 {
			if logWantedFor("timer") {
				fmt.Printf("ticker3hours done\n")
			}
		}

		<-threeHoursTicker.C
		if shutdownStarted.Get() {
			break
		}
	}
}

func isOnlyNumericString(s string) bool {
    for _, r := range s {
        if unicode.IsLetter(r) {
            return false
        }
    }
    return true
}

func ticker20min() {
	readConfigLock.RLock()
	mytwitterKey := twitterKey
	//mytwitterSecret := twitterSecret
	readConfigLock.RUnlock()

	twentyMinTicker := time.NewTicker(20*60*time.Second)
	defer twentyMinTicker.Stop()
	for {
		if shutdownStarted.Get() {
			break
		}

		if mytwitterKey!="" && queryFollowerIDsNeeded.Get() {
			// fetch list of all twitter followers
			twitterClientLock.Lock()
			if twitterClient==nil {
				twitterAuth()
			}
			if twitterClient==nil {
				fmt.Printf("# ticker20min no twitterClient\n")
			} else {
				if logWantedFor("timer") {
					fmt.Printf("ticker20min fetch list of twitter followers...\n")
				}
				// TODO we must later support more than 5000 followers
				var err error
				followerIDsLock.Lock()
				var data []byte
				followerIDs, data, err = twitterClient.QueryFollowerIDs(5000)
				if err!=nil {
					fmt.Printf("# ticker20min QueryFollowerIDs err=%v [%v]\n", err, data)
				} else {
					if logWantedFor("timer") {
						fmt.Printf("ticker20min QueryFollowerIDs count=%d\n", len(followerIDs.Ids))
						if logWantedFor("twitter") {
							for idx,id := range followerIDs.Ids {
								fmt.Printf("ticker20min %d followerIDs.Id=%v\n", idx+1, int64(id))
							}
						}
					}
				}
				followerIDsLock.Unlock()
			}
			twitterClientLock.Unlock()
			queryFollowerIDsNeeded.Set(false)
		}

		cleanupCalleeLoginMap(os.Stdout, 3, "ticker20min")
		cleanupClientRequestsMap(os.Stdout, 10, "ticker20min")

		<-twentyMinTicker.C
	}
}

func cleanupCalleeLoginMap(w io.Writer, min int, title string) {
	// cleanup calleeLoginMap so we don't hold on to memory after we don't have to
	var deleteID []string
	calleeLoginMutex.Lock()
	defer calleeLoginMutex.Unlock()
	for calleeID,calleeLoginSlice := range calleeLoginMap {
		//fmt.Fprintf(w,"%s calleeLoginMap (%s) A len=%d\n", title, calleeID, len(calleeLoginSlice))
		for len(calleeLoginSlice)>0 {
			if time.Now().Sub(calleeLoginSlice[0]) < 30 * time.Minute {
				break
			}
			if len(calleeLoginSlice)<=1 {
				calleeLoginSlice = nil
				break
			}
			calleeLoginSlice = calleeLoginSlice[1:]
		}
		if calleeLoginSlice==nil || len(calleeLoginSlice)<=0 {
			deleteID = append(deleteID,calleeID)
		} else {
			calleeLoginMap[calleeID] = calleeLoginSlice
		}
	}
	for _,ID := range deleteID {
		delete(calleeLoginMap,ID)
	}
	if len(calleeLoginMap)>0 {
		fmt.Fprintf(w,"%s calleeLoginMap len=%d\n", title, len(calleeLoginMap))
		for calleeID,calleeLoginSlice := range calleeLoginMap {
			if len(calleeLoginSlice)>=min {
				// get calleeIP for calleeID
				calleeIP := ""
				ejectOn1stFound := true
				reportHiddenCallee := true
				reportBusyCallee := true
				_, hub, _, err := GetOnlineCallee(calleeID, ejectOn1stFound, reportBusyCallee,
					reportHiddenCallee, "", title)
				if err != nil {
					// not online anymore
					calleeIP = "err="+err.Error()
				} else if hub == nil {
					// not online anymore
					calleeIP = "gone"
				} else if hub.CalleeClient == nil {
					// not online anymore
					calleeIP = "gone"
				} else {
					calleeIP = hub.CalleeClient.RemoteAddrNoPort
				}

				fmt.Fprintf(w,"%s calleeLoginMap %-11s %d/%d %s\n",
					title, calleeID, len(calleeLoginSlice), maxLoginPer30min, calleeIP)
			}
		}
	}
	//calleeLoginMutex.Unlock()
}

func cleanupClientRequestsMap(w io.Writer, min int, title string) {
	// cleanup clientRequestsMap (remove outdated
	// so we don't hold on to memory after we don't have to
	//fmt.Fprintf(w,"%s clientRequestsMap len=%d\n", title, len(clientRequestsMap))
	var deleteIps []string
	clientRequestsMutex.Lock()
	defer clientRequestsMutex.Unlock()
	for ip,clientRequestsSlice := range clientRequestsMap {
		//fmt.Fprintf(w,"%s clientRequestsMap (%s) A len=%d\n", title, ip, len(clientRequestsSlice))
		for len(clientRequestsSlice)>0 {
			if time.Now().Sub(clientRequestsSlice[0]) < 30 * time.Minute {
				break
			}
			if len(clientRequestsSlice)<=1 {
				clientRequestsSlice = nil
				break
			}
			clientRequestsSlice = clientRequestsSlice[1:]
		}
		if clientRequestsSlice==nil || len(clientRequestsSlice)<=0 {
			deleteIps = append(deleteIps,ip)
		} else {
			clientRequestsMap[ip] = clientRequestsSlice
		}
	}
	for _,ip := range deleteIps {
		delete(clientRequestsMap,ip)
	}
	if len(clientRequestsMap)>0 {
		fmt.Fprintf(w,"%s clientRequestsMap len=%d\n", title, len(clientRequestsMap))
/*
		for ip,clientRequestsSlice := range clientRequestsMap {
			if len(clientRequestsSlice)>=min {
				fmt.Fprintf(w,"%s clientRequestsMap (%s) %d/%d\n",
					title, ip, len(clientRequestsSlice), maxClientRequestsPer30min)
			}
		}
*/
		var tmpSlice []string
		for ip,clientRequestsSlice := range clientRequestsMap {
			if len(clientRequestsSlice)>=min {
				tmpSlice = append(tmpSlice,ip)
			}
		}
		sortableIpAddrFunc := func(remoteAddr string) string {
			// takes "192.168.3.29" and returns "192168003029"
			toks := strings.Split(remoteAddr, ".")
			sortableIpAddr := ""
			if toks[0]=="127" {
				// sort localhost on top
				toks[0]="000"
			}
			for _,tok := range(toks) {
				if len(tok) == 1 {
					sortableIpAddr += "00"+tok
				} else if len(tok) == 2 {
					sortableIpAddr += "0"+tok
				} else { // len(tok) == 3
					sortableIpAddr += tok
				}
			}

			return sortableIpAddr
		}
		sort.Slice(tmpSlice, func(i, j int) bool {
			return sortableIpAddrFunc(tmpSlice[i]) < sortableIpAddrFunc(tmpSlice[j])
		})
		for idx := range tmpSlice {
			ip := tmpSlice[idx]
			clientRequestsSlice := clientRequestsMap[ip]
			fmt.Fprintf(w,"%s clientRequestsMap (%s) %d/%d\n",
				title, ip, len(clientRequestsSlice), maxClientRequestsPer30min)
		}
	}
	//clientRequestsMutex.Unlock()
}

// send url (pointing to update news) to all online callees
var newsLinkDeliveredCounter int = 0
var lastDate string = ""
func broadcastNewsLink(date string, url string) {
	// let's loop through hubMap, so we see all connected callee users
	hubMapMutex.RLock()
	defer hubMapMutex.RUnlock()
	countAll := 0
	countSent := 0
	countSentNoErr := 0
	if date>lastDate {
		newsLinkDeliveredCounter = 0
		lastDate = date
	}
	sendData := "news|"+date+"|"+url;
	for calleeID,hub := range hubMap {
		if strings.HasPrefix(calleeID,"answie") || 
		   strings.HasPrefix(calleeID,"talkback") {
			continue
		}
		countAll++
		if hub!=nil {
			hub.HubMutex.RLock()
			// we make sure to send each news with a particular date string only once
			if hub.CalleeClient==nil {
				fmt.Printf("# newsLink hub.CalleeClient==nil to=%s sendData=%s\n",calleeID,sendData)
			} else {
				// the callee in this hub is online
				// we don't need newsDateMutex bc no one else is using newsDateMap
				//newsDateMutex.RLock()
				lastNewsCallee := newsDateMap[calleeID]
				//newsDateMutex.RUnlock()
				if date <= lastNewsCallee {
					// this news-msg was sent to calleeID already
					//fmt.Printf("# newsLink date(%s) <= lastNewsCallee(%s) to=%s\n",date,lastNewsCallee,calleeID)
				} else {
					// send it now
					err := hub.CalleeClient.Write([]byte(sendData))
					countSent++

					if err!=nil {
						fmt.Printf("# newsLink write to=%s err=%v\n",calleeID,err)
					} else {
						//newsDateMutex.Lock()
						newsDateMap[calleeID] = date
						//newsDateMutex.Unlock()
						countSentNoErr++
					}
				}
			}
			hub.HubMutex.RUnlock()
		} else {
			fmt.Printf("# newsLink hub==nil to=%s sendData=%s\n",calleeID,sendData)
		}
	}
	if countSent>0 {
		newsLinkDeliveredCounter += countSentNoErr
		if logWantedFor("timer") {
			fmt.Printf("newsLink sent=%d/%d total=%d sendData=%s\n",
				countSentNoErr, countSent, newsLinkDeliveredCounter, sendData)
		}
	}
	return
}

func ticker3min() {
	threeMinTicker := time.NewTicker(3*60*time.Second)
	defer threeMinTicker.Stop()
	lastBackupTime := time.Now()
	for {
		<-threeMinTicker.C
		if shutdownStarted.Get() {
			break
		}

		if isLocalDb() {
			// delete old twitter notifications
			readConfigLock.RLock()
			mytwitterKey := twitterKey
			mytwitterSecret := twitterSecret
			readConfigLock.RUnlock()
			if mytwitterKey!="" && mytwitterSecret!="" {
				kv := kvNotif.(skv.SKV)

				skv.DbMutex.Lock()
				kv.Db.Update(func(tx *bolt.Tx) error {
					unixNow := time.Now().Unix()
					//fmt.Printf("ticker3min release outdated entries from db=%s bucket=%s\n",
					//	dbNotifName, dbSentNotifTweets)
					b := tx.Bucket([]byte(dbSentNotifTweets))
					if b==nil {
						fmt.Printf("# ticker3min bucket=(%s) no tx\n",dbSentNotifTweets)
						return nil
					}
					c := b.Cursor()
					deleteCount := 0
					for k, v := c.First(); k != nil; k, v = c.Next() {
						idStr := string(k)
						d := gob.NewDecoder(bytes.NewReader(v))
						var notifTweet NotifTweet
						d.Decode(&notifTweet)
						ageSecs := unixNow - notifTweet.TweetTime
						if ageSecs >= 60*60 {
							if logWantedFor("timer") {
								fmt.Printf("ticker3min outdated ID=%s ageSecs=%d > 1h (%s) deleting\n",
									idStr, ageSecs, notifTweet.Comment)
							}
/* kvNotif is currently not fed from httpNotifyCallee.go
							twitterClientLock.Lock()
							if twitterClient==nil {
								twitterAuth()
							}
							if twitterClient==nil {
								fmt.Printf("# ticker3min failed on no twitterClient\n")
								twitterClientLock.Unlock()
								break
							}
							respdata,err := twitterClient.DeleteTweet(idStr)
							twitterClientLock.Unlock()
							if err!=nil {
								fmt.Printf("# ticker3min DeleteTweet %s err=%v (%s)\n", idStr, err, respdata)
							} else 
*/
							{
								//fmt.Printf("ticker3min DeleteTweet %s OK\n", idStr)
								err := c.Delete()
								if err!=nil {
									fmt.Printf("# ticker3min error db=%s bucket=%s delete id=%s err=%v\n",
										dbMainName, dbSentNotifTweets, idStr, err)
								} else {
									deleteCount++
								}
							}
						}
					}
					if deleteCount>0 {
						//fmt.Printf("ticker3min db=%s bucket=%s deleted %d entries\n",
						//	dbNotifName, dbSentNotifTweets, deleteCount)
					}
					return nil
				})
				skv.DbMutex.Unlock()
			}

			// call backupScript
			readConfigLock.RLock()
			mybackupScript := backupScript
			mybackupPauseMinutes := backupPauseMinutes
			readConfigLock.RUnlock()
			if mybackupScript!="" && mybackupPauseMinutes>0 {
				timeNow := time.Now()
				diff := timeNow.Sub(lastBackupTime)
				if diff < time.Duration(mybackupPauseMinutes) * time.Minute {
					//fmt.Printf("ticker3min next bckupTime not yet reached (%d < %d)\n",
					//	diff/time.Minute, mybackupPauseMinutes)
				} else {
					_,err := os.Stat(mybackupScript)
					if err!=nil {
						fmt.Printf("# ticker3min file %s err=%v\n",mybackupScript,err)
					} else {
						if callBackupScript(mybackupScript) == nil {
							lastBackupTime = timeNow
						}
					}
				}
			}
		}

		// tmtmtm cleanup missedCallAllowedMap
		var deleteIpArray []string  // for deleting
		missedCallAllowedMutex.Lock()
		for ip,settime := range missedCallAllowedMap {
			if time.Now().Sub(settime) > 20*time.Minute {
				deleteIpArray = append(deleteIpArray, ip)
			}
		}
		for _,ip := range deleteIpArray {
//			if logWantedFor("timer") {
//				if logWantedFor("missedcall") {
//					fmt.Printf("ticker3min delete (%s) from missedCallAllowedMap\n",ip)
//				}
//			}
			delete(missedCallAllowedMap,ip)
		}
		missedCallAllowedMutex.Unlock()


		// load "news.ini", file should contain two lines: date= and url=
		newsIni, err := ini.Load("news.ini")
		if err == nil {
			// "news.ini" exists
			dateValue,ok := readIniEntry(newsIni,"date")
			if(ok && dateValue!="") {
				// date entry exists
				urlValue,ok := readIniEntry(newsIni,"url")
				if(ok && urlValue!="") {
					// url entry exists
					// lets send this url to all connected users who didn't receive it yet
					broadcastNewsLink(dateValue,urlValue)
				}
			}
		}
	}
}

func callBackupScript(scriptName string) error {
	skv.DbMutex.Lock()
	defer skv.DbMutex.Unlock()

	fmt.Printf("callBackupScript sync db's (%s)\n",scriptName)

	kv := kvMain.(skv.SKV)
	if err := kv.Db.Sync(); err != nil {
		fmt.Printf("# callBackupScript kvMain sync error: %s\n", err)
	}
	kv = kvCalls.(skv.SKV)
	if err := kv.Db.Sync(); err != nil {
		fmt.Printf("# callBackupScript kvCalls sync error: %s\n", err)
	}
	kv = kvContacts.(skv.SKV)
	if err := kv.Db.Sync(); err != nil {
		fmt.Printf("# callBackupScript kvContacts sync error: %s\n", err)
	}
	kv = kvNotif.(skv.SKV)
	if err := kv.Db.Sync(); err != nil {
		fmt.Printf("# callBackupScript kvNotif sync error: %s\n", err)
	}
	kv = kvHashedPw.(skv.SKV)
	if err := kv.Db.Sync(); err != nil {
		fmt.Printf("# callBackupScript kvHashedPw sync error: %s\n", err)
	}

	fmt.Printf("callBackupScript exec (%s)...\n",scriptName)
	cmd, err := exec.Command("/bin/sh", scriptName).Output()
	if err != nil {
		fmt.Printf("# callBackupScript %s err=%s log=(%s)", scriptName, err, string(cmd))
		return err
	}
	fmt.Printf("callBackupScript %s done log=(%s)\n",scriptName,string(cmd))
	return nil
}

// ticker30sec: logs stats, cleanup recentTurnCalleeIps
var ticker30secCounter=0;
func ticker30sec() {
	thirtySecTicker := time.NewTicker(30*time.Second)
	defer thirtySecTicker.Stop()
	for {
		<-thirtySecTicker.C
		if shutdownStarted.Get() {
			break
		}

		readConfigLock.RLock()
		mythirtySecStats := thirtySecStats
		readConfigLock.RUnlock()
		if mythirtySecStats {
			fmt.Printf("%s\n",getStats())
		}

		// cleanup recentTurnCalleeIps
		timeNow := time.Now()
		deleted := 0
		recentTurnCalleeIpMutex.Lock()
		//fmt.Printf("ticker30sec recentTurnCalleeIps cleanup elementCount=%d\n",len(recentTurnCalleeIps))
		for ipAddr := range recentTurnCalleeIps {
			turnCallee, ok := recentTurnCalleeIps[ipAddr]
			if ok {
				timeSinceLastFound := timeNow.Sub(turnCallee.TimeStored)
				if timeSinceLastFound.Seconds() > 610 { // 10min
					delete(recentTurnCalleeIps,ipAddr)
					deleted++
				}
			}
		}
		if deleted>0 {
			if logWantedFor("timer") {
				if logWantedFor("turn") {
					fmt.Printf("ticker30sec deleted %d entries from recentTurnCalleeIps (remain=%d)\n",
						deleted, len(recentTurnCalleeIps))
				}
			}
		}
		recentTurnCalleeIpMutex.Unlock()


		// every 10 min
		ticker30secCounter++
/*
		if(ticker30secCounter%20==0) {
			// loop through all hubs
			fmt.Printf("ticker10min %d\n",ticker30secCounter/20)
			hubMapMutex.RLock()
			for _,hub := range hubMap {
				if hub!=nil {
					err := hub.CalleeClient.Write([]byte("dummy|"+timeNow.String()))
					if err != nil {
						fmt.Printf("ticker10min send dummy id=%s err=%v\n",hub.CalleeClient.calleeID,err)
					} else {
						//fmt.Printf("ticker10min send dummy id=%s noerr\n",hub.CalleeClient.calleeID)
					}
				}
			}
			hubMapMutex.RUnlock()
		}
*/
	}
	if logWantedFor("timer") {
		fmt.Printf("ticker30sec ending\n")
	}
}

// 10s-ticker: periodically call readConfig()
func ticker10sec() {
	tenSecTicker := time.NewTicker(10*time.Second)
	defer tenSecTicker.Stop()
	for ; true; <-tenSecTicker.C {
		if shutdownStarted.Get() {
			break
		}
		readConfig(false)
	}
}

func ticker2sec() {
	twoSecTicker := time.NewTicker(2*time.Second)
	defer twoSecTicker.Stop()
	for ; true; <-twoSecTicker.C {
		if shutdownStarted.Get() {
			break
		}

		// detect new day
		timeNow := time.Now()
		if timeNow.Day() != lastCurrentDayOfMonth {
			fmt.Printf("we have a new day\n")
			lastCurrentDayOfMonth = timeNow.Day()
			numberOfCallsTodayMutex.Lock()
			numberOfCallsToday = 0
			numberOfCallSecondsToday = 0
			numberOfCallsTodayMutex.Unlock()
			atomic.StoreInt64(&pingSentCounter, 0)
			atomic.StoreInt64(&pongSentCounter, 0)
			writeStatsFile()
		}
	}
}

