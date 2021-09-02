package main

import (
	"time"
	"fmt"
)

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

