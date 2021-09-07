package main

import (
	"time"
	"fmt"
	"bytes"
	"encoding/gob"
	"os"
	"os/exec"
	"github.com/mehrvarz/webcall/skv"
	bolt "go.etcd.io/bbolt"
)

func ticker3min() {
	threeMinTicker := time.NewTicker(180*time.Second)
	defer threeMinTicker.Stop()
	lastBackupTime := time.Now()
	for {
		<-threeMinTicker.C
		if shutdownStarted.Get() {
			break
		}

		readConfigLock.RLock()
		myrtcdb := rtcdb
		readConfigLock.RUnlock()

		if myrtcdb!="" {
			// delete all twitter notification tweets that are older than 1h
			readConfigLock.RLock()
			mytwitterKey := twitterKey
			mytwitterSecret := twitterSecret
			readConfigLock.RUnlock()
			if mytwitterKey!="" && mytwitterSecret!="" {
				kv := kvNotif.(skv.SKV)
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
						var notifTweet skv.NotifTweet
						d.Decode(&notifTweet)
						ageSecs := unixNow - notifTweet.TweetTime
						if ageSecs >= 60*60 {
							fmt.Printf("ticker3min outdated ID=%s ageSecs=%d > 1h (%s) deleting\n",
								idStr, ageSecs, notifTweet.Comment)

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
							} else {
								fmt.Printf("ticker3min DeleteTweet %s OK\n", idStr)
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
						fmt.Printf("ticker3min db=%s bucket=%s deleted %d entries\n",
							dbNotifName, dbSentNotifTweets, deleteCount)
					}
					return nil
				})
			}

			// call backupScript
			readConfigLock.RLock()
			mybackupScript := backupScript
			readConfigLock.RUnlock()
			if mybackupScript!="" {
				timeNow := time.Now()
				if timeNow.Sub(lastBackupTime) >= time.Duration(backupPauseMinutes) * time.Minute {
					if _, err := os.Stat(backupScript); err == nil {
						if callBackupScript(backupScript) == nil {
							lastBackupTime = timeNow
						}
					}
				}
			}
		}
	}
}

func callBackupScript(scriptName string) error {
	skv.DbMutex.Lock()
	defer skv.DbMutex.Unlock()

	fmt.Printf("callBackupScript sync db's %s\n",scriptName)

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


// ticker30sec: logs stats, cleanup recentTurnCallerIps
func ticker30sec() {
	thirtySecTicker := time.NewTicker(30*time.Second)
	defer thirtySecTicker.Stop()
	for {
		<-thirtySecTicker.C
		if shutdownStarted.Get() {
			break
		}

		fmt.Printf("%s\n",getStats())

		// cleanup recentTurnCallerIps
		timeNow := time.Now()
		deleted := 0
		recentTurnCallerIpMutex.Lock()
		//fmt.Printf("ticker30sec recentTurnCallerIps cleanup elementCount=%d\n",len(recentTurnCallerIps))
		for ipAddr := range recentTurnCallerIps {
			turnCaller, ok := recentTurnCallerIps[ipAddr]
			if ok {
				timeSinceLastFound := timeNow.Sub(turnCaller.TimeStored)
				if timeSinceLastFound.Seconds() > 5 {
					delete(recentTurnCallerIps,ipAddr)
					deleted++
				}
			}
		}
		if deleted>0 {
			if logWantedFor("turn") {
				fmt.Printf("ticker30sec deleted %d entries from recentTurnCallerIps (remain=%d)\n",
					deleted, len(recentTurnCallerIps))
			}
		}
		recentTurnCallerIpMutex.Unlock()
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

// 2s-ticker: watchdog for remainingTalkSecs underrun
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
			writeStatsFile()
		}
	}
}

