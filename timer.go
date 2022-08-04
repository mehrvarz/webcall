// WebCall Copyright 2022 timur.mobi. All rights reserved.
package main

import (
	"time"
	"fmt"
	"strings"
	"bytes"
	"unicode"
	"encoding/gob"
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
	fmt.Printf("ticker3hours start\n")
	kv := kvMain.(skv.SKV)
	db := kv.Db

	// put ticker3hours out of step with other tickers
	time.Sleep(7 * time.Second)

	threeHoursTicker := time.NewTicker(3*60*60*time.Second)
	defer threeHoursTicker.Stop()
	for {
		<-threeHoursTicker.C
		if shutdownStarted.Get() {
			break
		}

		timeNowUnix := time.Now().Unix()

		// loop all dbRegisteredIDs to delete outdated dbUserBucket entries (not online for 180+ days)
		fmt.Printf("ticker3hours start looking for outdated IDs...\n")
		var maxDaysOffline int64 = 180
		var deleteKeyArray []string  // for deleting
		skv.DbMutex.Lock()
		counterDeleted := 0
		err := db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(dbRegisteredIDs))
			c := b.Cursor()
			counter := 0
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
						fmt.Printf("ticker3hours %d id=%s sinceLastLogin=0 StartTime=0\n", counter, k)
					} else {
						sinceLastLoginSecs := timeNowUnix - lastLoginTime
						sinceLastLoginDays := sinceLastLoginSecs/(24*60*60)
						if sinceLastLoginDays > maxDaysOffline {
							// account is outdated, delete this entry
							fmt.Printf("ticker3hours %d id=%s regist delete sinceLastLogin=%ds days=%d\n",
								counter, k, sinceLastLoginSecs, sinceLastLoginDays)
							err2 = c.Delete()
							if err2!=nil {
								// this is bad
								fmt.Printf("ticker3hours %d id=%s regist delete err=%v\n", counter, k, err2)
							} else {
								counterDeleted++
								//fmt.Printf("ticker3hours %d id=%s regist deleted %d\n",
								//	counter, k, counterDeleted)
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
		} else if counterDeleted>0 {
			fmt.Printf("ticker3hours delete=%d offline for %d days (no err)\n", counterDeleted, maxDaysOffline)
		}
		for _,key := range deleteKeyArray {
			fmt.Printf("ticker3hours delete outdated user-id=%s\n", key)

			// delete/outdate mapped tmpIDs of outdated user 'key'
			errcode,altIDs := getMapping(key,"")
			if errcode==0 && altIDs!="" {
				tokenSlice := strings.Split(altIDs, "|")
				for _, tok := range tokenSlice {
					deleteMapping(key,tok,"")
				}
			}

			err = kv.Delete(dbUserBucket, key)
			if err!=nil {
				// this is bad
				fmt.Printf("# ticker3hours delete user-id=%s err=%v\n", key, err)
			} else {
				// all is well
				//fmt.Printf("ticker3hours key=%s user deleted\n", key)
				// create a dbBlockedIDs entry (will be deleted after 60 days)
				dbUserKey := fmt.Sprintf("%s_%d",key, timeNowUnix)
				dbUser := DbUser{/*Ip1:remoteAddr*/}
				err = kvMain.Put(dbBlockedIDs, dbUserKey, dbUser, false)
				if err!=nil {
					// this is bad
					fmt.Printf("# /deletemapping error db=%s bucket=%s put key=%s err=%v\n",
						dbMainName,dbBlockedIDs,key,err)
				}
			}
		}


		// loop all dbBlockedIDs to delete blocked entries
		fmt.Printf("ticker3hours start looking for outdated blocked entries...\n")
		var blockedForDays int64 = 60
		counterDeleted2 := 0
		skv.DbMutex.Lock()
		err = db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(dbBlockedIDs))
			c := b.Cursor()
			counter := 0
			for k, v := c.First(); k != nil; k, v = c.Next() {
				userID := string(k)
				if strings.HasPrefix(userID,"answie") || strings.HasPrefix(userID,"talkback") {
					continue
				}
				if !isOnlyNumericString(userID) {
					continue
				}

				counter++
				var dbEntry DbEntry // DbEntry{unixTime, remoteAddr, urlPw}
				d := gob.NewDecoder(bytes.NewReader(v))
				d.Decode(&dbEntry)

				sinceDeletedInSecs := timeNowUnix - dbEntry.StartTime
				if sinceDeletedInSecs > blockedForDays * 24*60*60 {
					deleteKeyArray = append(deleteKeyArray,userID)
					counterDeleted2++
				}
			}
			return nil
		})
		skv.DbMutex.Unlock()
		if err!=nil {
			// this is bad
			fmt.Printf("# ticker3hours delete=%d blocked for %d days err=%v\n",blockedForDays,counterDeleted2,err)
		} else if counterDeleted2>0 {
			fmt.Printf("ticker3hours delete=%d id's blocked for %d days (no err)\n",blockedForDays,counterDeleted2)
		}
		for _,key := range deleteKeyArray {
			fmt.Printf("ticker3hours delete blocked user-id=%s\n", key)
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
			fmt.Printf("ticker3hours done\n")
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
				fmt.Printf("ticker20min fetch list of twitter followers...\n")
				// TODO we must later support more than 5000 followers
				var err error
				followerIDsLock.Lock()
				var data []byte
				followerIDs, data, err = twitterClient.QueryFollowerIDs(5000)
				if err!=nil {
					fmt.Printf("# ticker20min QueryFollowerIDs err=%v [%v]\n", err, data)
				} else {
					fmt.Printf("ticker20min QueryFollowerIDs count=%d\n", len(followerIDs.Ids))
					if logWantedFor("twitter") {
						for idx,id := range followerIDs.Ids {
							fmt.Printf("ticker20min %d followerIDs.Id=%v\n", idx+1, int64(id))
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

				fmt.Fprintf(w,"%s calleeLoginMap (%-11s) %d/%d %s\n",
					title, calleeID, len(calleeLoginSlice), maxLoginPer30min, calleeIP)
			}
		}
	}
	calleeLoginMutex.Unlock()
}

func cleanupClientRequestsMap(w io.Writer, min int, title string) {
	// cleanup clientRequestsMap so we don't hold on to memory after we don't have to
	//fmt.Fprintf(w,"%s clientRequestsMap len=%d\n", title, len(clientRequestsMap))
	var deleteID []string
	clientRequestsMutex.Lock()
	for calleeID,clientRequestsSlice := range clientRequestsMap {
		//fmt.Fprintf(w,"%s clientRequestsMap (%s) A len=%d\n", title, calleeID, len(clientRequestsSlice))
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
			deleteID = append(deleteID,calleeID)
		} else {
			clientRequestsMap[calleeID] = clientRequestsSlice
		}
	}
	for _,ID := range deleteID {
		delete(clientRequestsMap,ID)
	}
	if len(clientRequestsMap)>0 {
		fmt.Fprintf(w,"%s clientRequestsMap len=%d\n", title, len(clientRequestsMap))
		for calleeID,clientRequestsSlice := range clientRequestsMap {
			if len(clientRequestsSlice)>=min {
				fmt.Fprintf(w,"%s clientRequestsMap (%s) %d/%d\n",
					title, calleeID, len(clientRequestsSlice), maxClientRequestsPer30min)
			}
		}
	}
	clientRequestsMutex.Unlock()
}

// send url (pointing to update news) to all online callees
func broadcastNewsLink(date string, url string) {
	// let's loop through hubMap, so we see all connected callee users
	hubMapMutex.RLock()
	defer hubMapMutex.RUnlock()
	countAll := 0
	countSent := 0
	countSentNoErr := 0
	data := "news|"+date+"|"+url;
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
				fmt.Printf("# newsLink hub.CalleeClient==nil to=%s data=%s\n",calleeID,data)
			} else {
				// the callee in this hub is online
				// we don't need newsDateMutex bc no one else is using newsDateMap
				//newsDateMutex.RLock()
				lastNews := newsDateMap[calleeID]
				//newsDateMutex.RUnlock()
				if date <= lastNews {
					// this news-msg was sent to calleeID already
					//fmt.Printf("# newsLink date(%s) <= lastNews(%s) to=%s\n",date,lastNews,calleeID)
				} else {
					// send it now
					err := hub.CalleeClient.Write([]byte(data))
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
			fmt.Printf("# newsLink hub==nil to=%s data=%s\n",calleeID,data)
		}
	}
	if countSent>0 {
		fmt.Printf("newsLink sent=%d noerr=%d devices=%d data=%s\n",
			countSent, countSentNoErr, countAll, data)
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
							fmt.Printf("ticker3min outdated ID=%s ageSecs=%d > 1h (%s) deleting\n",
								idStr, ageSecs, notifTweet.Comment)
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
			if logWantedFor("missedcall") {
//				fmt.Printf("ticker3min delete (%s) from missedCallAllowedMap\n",ip)
			}
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

		if thirtySecStats {
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
			if logWantedFor("turn") {
				fmt.Printf("ticker30sec deleted %d entries from recentTurnCalleeIps (remain=%d)\n",
					deleted, len(recentTurnCalleeIps))
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
	fmt.Printf("ticker30sec ending\n")
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

