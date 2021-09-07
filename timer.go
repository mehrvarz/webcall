package main

import (
	"time"
	"fmt"
	"bytes"
	"encoding/gob"
	"github.com/mehrvarz/webcall/skv"
	bolt "go.etcd.io/bbolt"
)

func ticker3min() {
	threeMinTicker := time.NewTicker(180*time.Second)
	defer threeMinTicker.Stop()
	for {
		<-threeMinTicker.C
		if shutdownStarted.Get() {
			break
		}

/*
		if backupScript!="" {
			if timeNow.Sub(lastBackupTime) >= time.Duration(betweenBackupsMinutes) * time.Minute {
				if _, err := os.Stat(backupScript); err == nil {
					if callBackupScript(backupScript) == nil {
						lastBackupTime = timeNow
					}
				}
			}
		}
*/
		readConfigLock.RLock()
		myrtcdb := rtcdb
		readConfigLock.RUnlock()
		if myrtcdb=="" {
			// delete all notification tweets that are older than 1h
			var kv skv.SKV
			var err error
			fmt.Printf("ticker3min open file=(%s)\n",dbNotifName)
			kv,err = skv.DbOpen(dbNotifName,dbPath)
			if err!=nil || kv.Db==nil {
				fmt.Printf("# ticker3min fail to open db=(%s) err=%v\n",dbNotifName,err)
				continue
			}
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
			kv.Db.Close()
		}
	}
	//fmt.Printf("threeMinTicker ending\n")
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
		timeNow := time.Now()

		// detect new day
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

