// WebCall Copyright 2023 timur.mobi. All rights reserved.
package main

import (
	"net/http"
	"fmt"
	"time"
	"errors"
	"bytes"
	"strings"
	"io"
	"os"
	"encoding/gob"
	bolt "go.etcd.io/bbolt"
	"github.com/nxadm/tail" // https://pkg.go.dev/github.com/nxadm/tail
	"github.com/mehrvarz/webcall/skv"
	"github.com/mehrvarz/webcall/atombool"
)

func httpAdmin(kv skv.SKV, w http.ResponseWriter, r *http.Request, urlPath string, urlID string, remoteAddr string) bool {
	printFunc := func(w http.ResponseWriter, format string, a ...interface{}) {
		// printFunc writes to the console AND to the localhost http client
		fmt.Printf(format, a...)
		fmt.Fprintf(w, format, a...)
	}

	if urlPath=="/dumpuser" {
		printFunc(w,"/dumpuser\n")
		db := kv.Db
		nowTimeUnix := time.Now().Unix()
		err := db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(dbUserBucket))
			if b==nil {
				return errors.New("read bucket error")
			}
			c := b.Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				var dbUser DbUser
				d := gob.NewDecoder(bytes.NewReader(v))
				d.Decode(&dbUser)
				lastActivity := dbUser.LastLogoffTime;
				if dbUser.LastLoginTime > dbUser.LastLogoffTime {
					lastActivity = dbUser.LastLoginTime
				}
				secsSinceLastActivity := "-"
				if lastActivity > 0 {
					secsSinceLastActivity = fmt.Sprintf("%d",nowTimeUnix-lastActivity)
				}

				hasMastodonID := "-"
				mastodonSendTootOnCall := "-"
				askCallerBeforeNotify := "-"
				if dbUser.MastodonID!="" {
					hasMastodonID = "M"
					if dbUser.MastodonSendTootOnCall {
						mastodonSendTootOnCall = "N"
					}
					if dbUser.AskCallerBeforeNotify {
						askCallerBeforeNotify = "A"
					}
				}
				fmt.Fprintf(w, "%-40s %s%s%s %d %s %s %s\n",
					k,
					hasMastodonID, mastodonSendTootOnCall, askCallerBeforeNotify,
					dbUser.Int2,
					time.Unix(dbUser.LastLoginTime,0).Format("2006-01-02 15:04:05"),
					time.Unix(dbUser.LastLogoffTime,0).Format("2006-01-02 15:04:05"),
					secsSinceLastActivity)
			}
			return nil
		})
		if err!=nil {
			printFunc(w,"/dumpuser err=%v\n", err)
		} else {
			//fmt.Fprintf(w,"/dumpuser no err\n")
		}
		return true
	}

	if urlPath=="/dumpregistered" {
		// show the list of callee-IDs that have been registered and are not yet outdated

		showAll := false
		showOnline := false
		_, ok := r.URL.Query()["all"]
		if ok {
			showAll = true
			printFunc(w,"/dumpregistered showall\n")
		} else {
			_, ok := r.URL.Query()["online"]
			if ok {
				showOnline = true
				printFunc(w,"/dumpregistered showOnline\n")
			} else {
				printFunc(w,"/dumpregistered\n")
			}
		}

		countEntries:=0
		countEntriesOnline:=0
		countEntriesNotification:=0
		db := kv.Db
		nowTimeUnix := time.Now().Unix()
		err := db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(dbRegisteredIDs))
			c := b.Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				var dbEntry DbEntry
				d := gob.NewDecoder(bytes.NewReader(v))
				d.Decode(&dbEntry)

				dbUserKey := fmt.Sprintf("%s_%d", k, dbEntry.StartTime)
				var dbUser DbUser
				err := kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
				if err != nil {
					if /*strings.Index(err.Error(), "key not found")<0 ||*/ showAll {
						fmt.Fprintf(w,"%-40s %d=%s err=%s\n",
							k, dbEntry.StartTime,
							time.Unix(dbEntry.StartTime,0).Format("2006-01-02 15:04:05"), err)
					}
				} else {
					userId := string(k)

					countEntries++
					isOnline := "-"
					ejectOn1stFound := true
					reportBusyCallee := true
					reportHiddenCallee := true
					key, _, _, err := GetOnlineCallee(userId, ejectOn1stFound, reportBusyCallee,
						reportHiddenCallee, remoteAddr, "/login")
					if err != nil {
						isOnline = "E"
					} else if key != "" {
						isOnline = "O"
						countEntriesOnline++
					} else if(showOnline) {
						continue
					}

					mastodonId := "-"
					mastodonSendTootOnCall := "-"
					askCallerBeforeNotify := "-"
					if dbUser.MastodonID!="" {
						mastodonId = "M"
						if dbUser.MastodonID!=userId {
							userId = userId + " " + dbUser.MastodonID
						}
						if dbUser.MastodonSendTootOnCall {
							mastodonSendTootOnCall = "N"
							if dbUser.AskCallerBeforeNotify {
								askCallerBeforeNotify = "A"
							}
							countEntriesNotification++
						}
					}

					lastActivity := dbUser.LastLogoffTime;
					if dbUser.LastLoginTime > dbUser.LastLogoffTime {
						lastActivity = dbUser.LastLoginTime
					}
					var daysSinceLastActivity int64 = 0
					if lastActivity > 0 {
						daysSinceLastActivity = (nowTimeUnix-lastActivity)/int64(60*60*24)
					}
					daysAge := (nowTimeUnix-dbEntry.StartTime)/int64(60*60*24)
					var daysUsage int64 = 0
					if lastActivity > 0 {
						daysUsage = (lastActivity-dbEntry.StartTime)/int64(60*60*24)
					}

					// id 'NA' means: N=notifications on, A=AskUserDialog
					fmt.Fprintf(w, "%-40s %d %s%s%s%s %d %s %s %4d %3d %3d\n",
						userId,
						dbEntry.StartTime,
						isOnline, mastodonId, mastodonSendTootOnCall, askCallerBeforeNotify,
						dbUser.Int2,
						time.Unix(dbUser.LastLoginTime,0).Format("2006-01-02 15:04:05"),
						time.Unix(dbUser.LastLogoffTime,0).Format("2006-01-02 15:04:05"),
						daysAge, daysUsage, daysSinceLastActivity)
				}
			}
			return nil
		})
		if err!=nil {
			printFunc(w,"/dumpregistered err=%v\n", err)
		} else {
			//fmt.Fprintf(w,"/dumpregistered no err\n")
		}
		fmt.Fprintf(w,"/dumpregistered entries=%d online=%d entriesNotification=%d\n",
			countEntries,countEntriesOnline, countEntriesNotification)
		return true
	}

	if urlPath=="/dumpblocked" {
		// show the list of callee-IDs that are blocked (for various reasons)
		printFunc(w,"/dumpblocked dbName=%s bucketName=%s\n", dbMainName, dbBlockedIDs)
		db := kv.Db
		err := db.Update(func(tx *bolt.Tx) error {
			b := tx.Bucket([]byte(dbBlockedIDs))
			c := b.Cursor()
			for k, _ := c.First(); k != nil; k, _ = c.Next() {
				dbUserKey := string(k)
				// dbUserKey format: 'calleeID_unixtime'
				fmt.Fprintf(w,"blocked key=%s\n",dbUserKey)
			}
			return nil
		})
		if err!=nil {
			printFunc(w,"/dumpblocked err=%v\n", err)
		} else {
			//fmt.Fprintf(w,"/dumpblocked no err\n")
		}
		return true
	}

	if urlPath=="/dumpturn" {
		timeNow := time.Now()

		recentTurnCalleeIpMutex.Lock()
		for ipAddr := range recentTurnCalleeIps {
			turnCallee, ok := recentTurnCalleeIps[ipAddr]
			if ok {
				timeSinceCallerDisconnect := timeNow.Sub(turnCallee.TimeStored)
				printFunc(w,"/dumpturn calleeID=%s since caller disconnect %v\n",
					turnCallee.CalleeID, timeSinceCallerDisconnect.Seconds())
			}
		}
		recentTurnCalleeIpMutex.Unlock()
		return true
	}

	if urlPath=="/dumpping" {
		hubMapMutex.RLock()
		defer hubMapMutex.RUnlock()
		for calleeID := range hubMap {
			if hubMap[calleeID]!=nil && hubMap[calleeID].CalleeClient!=nil {
				fmt.Fprintf(w,"/dumpping %-25s pingSent/pongReceived pingReceived/pongSent %v/%v %v/%v\n",
					calleeID,
					hubMap[calleeID].CalleeClient.pingSent,
					hubMap[calleeID].CalleeClient.pongReceived,
					hubMap[calleeID].CalleeClient.pingReceived,
					hubMap[calleeID].CalleeClient.pongSent)
			}
		}
		return true
	}

	if urlPath=="/dumpHashedPw" {
		dbHashedPwLoop(w)
		return true
	}

	if urlPath=="/m-setup" {
		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["id"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /m-setup url arg 'id' not given\n")
			return true
		}
		id := url_arg_array[0]
		if mastodonMgr != nil {
			mastodonMgr.commandSetup(id,false)
		}
		return true
	}
	if urlPath=="/m-remove" {
		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["id"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /m-remove url arg 'id' not given\n")
			return true
		}
		id := url_arg_array[0]
		if mastodonMgr != nil {
			mastodonMgr.commandRemove(id,false)
		}
		return true
	}

	if urlPath=="/dumpPostedMsgs" {
		if mastodonMgr != nil {
			mastodonMgr.dumpPostedMsgEvents(w)
		}
		return true
	}

	if urlPath=="/delregisteredid" {
		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["time"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /delregisteredid url arg 'time' not given\n")
			return true
		}
		urlTime := url_arg_array[0]

		var dbEntry DbEntry
		err := kv.Get(dbRegisteredIDs,urlID,&dbEntry)
		if err!=nil {
			printFunc(w,"# /delregisteredid urlID not found\n")
			return true
		}

		dbTimeStr := fmt.Sprintf("%d",dbEntry.StartTime)
		if dbTimeStr!=urlTime {
			printFunc(w,"# /delregisteredid time=%s != from db.StartTime=%s\n", urlTime, dbTimeStr)
			return true
		}

		bucketName := dbRegisteredIDs
		fmt.Printf("/delregisteredid dbName=%s bucketName=%s\n", dbMainName, bucketName)
		err = kv.Delete(bucketName, urlID)
		if err!=nil {
			printFunc(w,"# /delregisteredid fail to delete blocked id=%s\n", urlID)
		} else {
			printFunc(w,"/delregisteredid deleted id=%s\n", urlID)
		}

		// TODO delete hashedPW ?
		return true
	}

	if urlPath=="/clearcache" {
		// c *WsClient => hub.CalleeClient => hubMap[calleeID].CalleeClient
		c := hubMap[urlID].CalleeClient
		if(c==nil) {
			fmt.Printf("# /clearcache (%s) unknown ID\n", urlID)
			return false;
		}
		//err := c.Write([]byte("sessionId|"+codetag))
		err := c.Write([]byte("cancel|c"))
		if err != nil {
			fmt.Printf("# /clearcache (%s) send err=%s\n", urlID, err.Error())
			return false
		}
		fmt.Printf("/clearcache (%s) sent OK\n", urlID)
		return true
	}

	/* developer tools below
	if urlPath=="/deluserid" {
		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["time"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /deluserid url arg 'time' not given\n")
			return true
		}
		urlTime := url_arg_array[0]
		urlTimei64, err := strconv.ParseInt(urlTime, 10, 64)
		if err!=nil {
			printFunc(w,"# /deluserid error converting arg 'time'=%d to int64 %v\n",urlTime,err)
			return true
		}
		userKey := fmt.Sprintf("%s_%d",urlID, urlTimei64)
		bucketName := dbUserBucket
		fmt.Printf("/deluserid dbName=%s bucketName=%s\n", dbMainName, bucketName)
		err = kv.Delete(dbUserBucket, userKey)
		if err!=nil {
			printFunc(w,"# /deluserid fail to delete user key=%v %v\n", userKey, err)
		} else {
			printFunc(w,"/deluserid deleted user key=%v\n", userKey)
		}

		// delete hashedPW
		err = kvHashedPw.(skv.SKV).Delete(dbHashedPwBucket, urlID)
		if err!=nil {
			fmt.Printf("# /deluserid delete dbHashedPwBucket urlID=%s err=%v\n", urlID, err)
		} else {
			// all is well
		}
		return true
	}

	if urlPath=="/delblockedid" {
		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["time"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /delblockedid url arg 'time' not given\n")
			return true
		}
		urlTime := url_arg_array[0]

		dbUserKey := fmt.Sprintf("%s_%s",urlID,urlTime)
		err := kv.Delete(dbBlockedIDs, dbUserKey)
		if err!=nil {
			printFunc(w,"# /delblockedid fail to delete key=%s\n", dbUserKey)
		} else {
			printFunc(w,"/delblockedid deleted key=%s\n", dbUserKey)
		}
		return true
	}

	if urlPath=="/makeregistered" {
		// show the list of callee-IDs that have been registered and are not yet outdated
		// ".../makeregistered?id=answie&days=xx&pw=123456"
		// get pw from url-arg
		url_arg_array, ok := r.URL.Query()["pw"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /makeregistered url arg 'pw' not given\n")
			return true
		}
		urlPw := url_arg_array[0]

		fmt.Printf("/makeregistered dbName=%s\n", dbMainName)
		unixTime := time.Now().Unix()
		dbUserKey := fmt.Sprintf("%s_%d",urlID, unixTime)
		dbUser := DbUser{Ip1:remoteAddr}
		err := kv.Put(dbUserBucket, dbUserKey, dbUser, false)
		if err!=nil {
			printFunc(w,"# /makeregistered db=%s bucket=%s put key=%s err=%v\n",
				dbMainName,dbUserBucket,urlID,err)
		} else {
			err = kv.Put(dbRegisteredIDs, urlID,
				DbEntry{unixTime, remoteAddr}, false)
			if err!=nil {
				printFunc(w,"# /makeregistered db=%s bucket=%s put key=%s err=%v\n",
					dbMainName,dbRegisteredIDs,urlID,err)
			} else {
				printFunc(w,"/makeregistered db=%s bucket=%s new id=%s created\n",
					dbMainName,dbRegisteredIDs,urlID)
				var pwIdCombo PwIdCombo
				err := createHashPw(urlID, urlPw, &pwIdCombo)
				if err!=nil {
					printFunc(w,"# /makeregistered createHashPw key=%s err=%v\n", urlID, err)
				}
			}
		}
		if err!=nil {
			printFunc(w,"# /makeregistered id=%s err=%v\n", urlID, err)
		} else {
			printFunc(w,"/makeregistered id=%s no err\n", urlID)
		}
		return true
	}

	if urlPath=="/editprem" {
		var dbEntry DbEntry
		err := kv.Get(dbRegisteredIDs,urlID,&dbEntry)
		if err!=nil {
			printFunc(w,"# /editprem urlID=(%s) not found\n",urlID)
			return true
		}

		// get time from url-arg
		url_arg_array, ok := r.URL.Query()["time"]
		if !ok || len(url_arg_array[0]) < 1 {
			printFunc(w,"# /editprem url arg 'time' not given\n")
			return true
		}
		urlTime := url_arg_array[0]
		dbTimeStr := fmt.Sprintf("%d",dbEntry.StartTime)
		if dbTimeStr!=urlTime {
			printFunc(w,"# /editprem time=%s != from db.StartTime=%s\n", urlTime, dbTimeStr)
			return true
		}

		dbUserKey := fmt.Sprintf("%s_%d",urlID, dbEntry.StartTime)
		var dbUser DbUser
		err = kv.Get(dbUserBucket, dbUserKey, &dbUser)
		if err!=nil {
			fmt.Printf("# /editprem (%s) failed on dbUserBucket\n",urlID)
			return true
		}

		err = kv.Put(dbUserBucket, dbUserKey, dbUser, false)
		if err!=nil {
			printFunc(w,"# /editprem error db=%s bucket=%s put key=%s err=%v\n",
				dbMainName,dbUserBucket,urlID,err)
		} else {
			printFunc(w,"/editprem db=%s bucket=%s new id=%s created\n",
				dbMainName,dbRegisteredIDs,urlID)
		}
		return true
	}

	if urlPath=="/pingMsg" {
		if mastodonMgr != nil {
			id := "timurmobi@mastodon.social"
			url_arg_array, ok := r.URL.Query()["arg"]
			sendmsg := "@"+id+" test"
			if ok && len(url_arg_array[0])>0 {
				sendmsg = "@"+id+" "+url_arg_array[0]
			}
			mastodonMgr.postMsgEx(sendmsg, id, 0, func(err error) {
				if err!=nil {
					fmt.Fprintf(w,"# /pingMsg post to=%v err=%v\n", id, err)
				} else {
					fmt.Fprintf(w,"/pingMsg post sent to=%v\n", id)
				}
			})
		}
		return true
	}
	*/

	return false
}

// see adminLogPath1 + adminLogPath2 in httpServer.go
var	adminlogBusy atombool.AtomBool
var t *tail.Tail

func adminlog(w http.ResponseWriter, r *http.Request, logfile string, filter string) {
	// logfile like: "/var/log/syslog"
	if adminlogBusy.Get() {
		t.Stop()
		t.Cleanup()
		fmt.Printf("/adminlog force end\n")
		adminlogBusy.Set(false)
	}

	file, err := os.Open(logfile)
	if err != nil {
		fmt.Printf("# /adminlog file %s open err=%v\n",logfile,err)
		return
	}
	fstat, err := file.Stat()
	if err != nil {
		fmt.Printf("# /adminlog file %s stat err=%v\n",logfile,err)
		return
	}

	var seekBack int64 = 128*1024
	var seekInfo tail.SeekInfo
	if seekBack > fstat.Size() {
		// maybe log client ip and ua?
		fmt.Printf("/adminlog start (%s) (%s) seek=0/%d\n",logfile,filter,fstat.Size())
		seekInfo = tail.SeekInfo{0,io.SeekStart}
	} else {
		// maybe log client ip and ua?
		fmt.Printf("/adminlog start (%s) (%s) seek=%d/%d\n",logfile,filter,-seekBack,fstat.Size())
		seekInfo = tail.SeekInfo{-seekBack,io.SeekEnd}
	}
	file.Close()
	t, err = tail.TailFile(logfile, tail.Config{Follow: true, ReOpen: true, Location: &seekInfo })
	if err!=nil {
		fmt.Printf("# /adminlog tail err=%v\n",err)
		return
	}
	adminlogBusy.Set(true)
	linesTotal := 0
	lines := 0
	flush := 0
	noflush := 0
	inARowLines := 0
	ticker100ms := time.NewTicker(100*time.Millisecond)
	defer ticker100ms.Stop()
	//fmt.Fprintf(os.Stderr,"/adminlog start loop...\n")
	for {
		select {
		case notifChan := <-t.Lines:
			if notifChan==nil {
				// this happens when we force-stop via reload/newstart
				//adminlogBusy.Set(false)
				return
			}
			linesTotal++
			line := *notifChan
			text := strings.Replace(line.Text, "  ", " ", -1)
			//fmt.Fprintf(os.Stderr,"/adminlog (%s)\n",line)
			if text=="" ||
			   strings.Index(text,"TLS handshake error")>=0 ||
			   strings.Index(text,"csp-report")>=0 {
				// found one of these? skip line
				//fmt.Fprintf(os.Stderr,"!skip1:%s\n",text)
			} else if strings.Index(text,filter)<0 {
				// not found filter? skip line
				//fmt.Fprintf(os.Stderr,"!skip2:%s\n",text)
			} else {
				//fmt.Fprintf(os.Stderr,"!use:%s\n",text)
				// filter out columns
				toks := strings.Split(text, " ")
				if len(toks)>5 {
					// we only use toks[2] = hh:mm:ss and everything starting with toks[5]
					// we do not use:
					//   toks[0] = month, toks[1] = dayOfMonth, toks[3] = servername, toks[4] = process name
					idx := strings.Index(text,toks[5])
					if idx>0 {
						logline := toks[2]+" "+text[idx:]
						fmt.Fprintf(w,"%s\n",logline)
						lines++
						inARowLines++
					}
				}
			}

		case <-ticker100ms.C:
			if inARowLines>=1 {
				if f, ok := w.(http.Flusher); ok {
					f.Flush()
					flush++
				} else {
					//noflush++
				}
				inARowLines = 0
			} else {
				noflush++
			}

		case <-r.Context().Done():
			t.Stop()
			t.Cleanup()
			fmt.Printf("/adminlog end %d/%d %d/%d\n",lines,linesTotal,flush,noflush)
			adminlogBusy.Set(false)
			return
		}
	}
}

