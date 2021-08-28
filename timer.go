package main

import (
	"time"
	"strings"
	"fmt"
)


/* loop3min - periodically reading the db and free outdated/blocked id's
func loop3min() {
	// TODO use of shutdownStarted.Get() for routines with long sleeps is useless
	for !shutdownStarted.Get() {
		time.Sleep(2 * time.Second)

		if shutdownStarted.Get() {
			break
		}

		//fmt.Printf("loop3min done; sleep...\n")
		time.Sleep((3 * 60 - 2) * time.Second)
	}
	fmt.Printf("exit loop3min\n")
}
*/

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
		unixTime := timeNow.Unix()
		//fmt.Printf("ticker2sec %v %v\n",timeNow,unixTime)

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

		// interrupt calls with hub.doExit() if remainingTalkSecs is running < 0
		hubMapMutex.RLock()
		idx:=0
		for _,hub := range hubMap {
			hub.HubMutex.RLock()
			if strings.HasPrefix(hub.calleeID,"!") {
				hub.HubMutex.RUnlock()
				continue
			}
			callSecs := -1
			remainingServiceSecs := 0
			if hub.ServiceStartTime>0 {	// race
				// remainingServiceSecs decerements by the second bc unixTime grows by the second
				remainingServiceSecs =
					int(hub.ServiceStartTime + int64(hub.ServiceDurationSecs) - unixTime)
			}
			remainingTalkSecs := hub.PermittedConnectedToPeerSecs - hub.ConnectedToPeerSecs // race
			if hub.lastCallStartTime>0 {
				// the call has started; callSecs grows by the second
				callSecs = int(unixTime - hub.lastCallStartTime)
				if hub.PermittedConnectedToPeerSecs>0 && callSecs>=0 {
					// don't decrement remainingTalkSecs on pure p2p connections
					if !hub.LocalP2p || !hub.RemoteP2p {
						remainingTalkSecs -= callSecs
					}
				}
			}

			if remainingServiceSecs < remainingTalkSecs {
				remainingTalkSecs = remainingServiceSecs
			}

			//fmt.Printf("ticker2sec %d port=%d id=%s clients=%d callSecs=%d %v/%v serv=%d talk=%d\n",
			//	idx, hub.port, hub.calleeID, len(hub.Clients), callSecs, hub.LocalP2p, hub.RemoteP2p,
			//	remainingServiceSecs, remainingTalkSecs)
			if hub.lastCallStartTime>0 && remainingTalkSecs < 3600 { // 3600s = 60m
				// send events to callee
				// we don't want to send a "sessionDuration" every second
				// doing so in the beginning and once in the end should be enough
// TODO "callSecs>=0 && callSecs<5" doesn't work if wsConn is pure p2p and remainingServiceSecs goes below
				if remainingTalkSecs >= 0 && hub.CalleeClient!=nil && callSecs>=0 && callSecs<5 {
					if !hub.LocalP2p || !hub.RemoteP2p {
						hub.CalleeClient.Write([]byte("sessionDuration|"+fmt.Sprintf("%d",remainingTalkSecs)))
					}
				}
				if remainingTalkSecs<=0 && hub.lastCallStartTime>0 {
					// force disconnect
					// TODO dont disconnect roulette after 1s
					fmt.Printf("ticker2sec disconnect (%v/%v) %d %d %d %d\n",
						hub.LocalP2p, hub.RemoteP2p, remainingTalkSecs, hub.lastCallStartTime,
						hub.PermittedConnectedToPeerSecs, hub.ConnectedToPeerSecs)
					// die peer-verb nur dann trennen, wenn es keine reine p2p verb ist
					if !hub.LocalP2p || !hub.RemoteP2p {
						hub.CalleeClient.Write([]byte("cancel|c"))
					}

					// cancelFunc will end the ws-connection
					// cancelFunc will also end the peer-connection
					// but only if it is not full p2p and only after 20 secs due to:
					// "failed to handle CreatePermission-request from ...: no such user exists"
					// in order to not have to wait 20s, we send "cancel|c" to kill the p2p right away
					hub.doExit()
					// hub.lastCallStartTime will be cleared by processTimeValues()
					// so we will not do another cancelFunc
				}
			}
			hub.HubMutex.RUnlock()
			idx++
		}
		hubMapMutex.RUnlock()
	}
}

