// WebCall Copyright 2021 timur.mobi. All rights reserved.
package main

import (
	"fmt"
	"strconv"
	"strings"
	"net"
	"time"
	"sync"

	//"github.com/pion/turn/v2" // see: https://github.com/pion/turn/issues/206#issuecomment-907091251
	"github.com/mehrvarz/turn/v2" // this _is_ pion/turn but with a minor patch for FF on Android
	"github.com/pion/logging"
)

type TurnCaller struct {
	CallerID string
	TimeStored time.Time
}
var recentTurnCallerIps map[string]TurnCaller
var recentTurnCallerIpMutex sync.RWMutex

func runTurnServer() {
	if turnPort<=0 {
		return
	}

	recentTurnCallerIps = make(map[string]TurnCaller)

	if logWantedFor("turn") {
		fmt.Printf("start turn server on '%s' port=%d\n", turnIP, turnPort)
	}
	udpListener, err := net.ListenPacket("udp4", "0.0.0.0:"+strconv.Itoa(turnPort))
	if err != nil {
		fmt.Printf("# Failed to create TURN server listener: %s\n", err)
		return
	}

	readConfigLock.RLock()
	ourRealm := turnRealm
	readConfigLock.RUnlock()
	loggerFactory := logging.NewDefaultLoggerFactory()
	loggerFactory.DefaultLogLevel = logging.LogLevel(turnDebugLevel) // 3=info 4=LogLevelDebug

	_, err = turn.NewServer(turn.ServerConfig{
		Realm: ourRealm,
		AuthHandler: func(username string, realm string, srcAddr net.Addr) ([]byte, bool) {
			// AuthHandler callback is called everytime a caller tries to authenticate with the TURN server
			// - username is the "iceServers" username from Javascript
			// - srcAddr is ip:port of caller (we receive 2 calls: same caller ip, but two different ports)
			// note that for a relay connection to become available for both sides,
			// only ONE side needs to successfully authenticate
			// we will:
			// - return authKey,true if we find a ConnectedCallerIp in the global hub == srcAddr (without port)
			// - otherwise we return nil,false
			//if logWantedFor("turn") {
			//	fmt.Printf("turn auth username=(%s) srcAddr=(%v)\n", username, srcAddr)
			//}
			timeNow := time.Now()
			foundIp := false
			foundByMap := false
			foundCalleeId := ""
			// search for ipAddr without the port number
			// bc srcAddr is from the turn client and IpInHubMap is from the websocket client (different ports)
			ipAddr := srcAddr.String()
			if portIdx := strings.Index(ipAddr, ":"); portIdx >= 0 {
				ipAddr = ipAddr[:portIdx]
			}

			recentTurnCallerIpMutex.RLock()
			turnCaller, ok := recentTurnCallerIps[ipAddr]
			recentTurnCallerIpMutex.RUnlock()
			if ok {
				timeSinceLastFound := timeNow.Sub(turnCaller.TimeStored)
				if timeSinceLastFound.Seconds() <= 15 {
					// NOTE: turn connection will be valid for 15 seconds after callee goes offline
					// this way we prevent error msgs triggered by clients expecting turn con to be still valid
					// such as: "turn auth for %v FAIL not found"
					// such as: "...failed to handle Refresh-request from x.x.x.x:xxxx: no allocation found..."
					foundIp = true
					foundCalleeId = turnCaller.CallerID
					foundByMap = true
				} else {
					recentTurnCallerIpMutex.Lock()
					delete(recentTurnCallerIps,ipAddr)
					recentTurnCallerIpMutex.Unlock()
					// here we found an outdated entry; but we won't find all outdated entries this way
					// this is why in timer.go ticker30sec() we also look for outdated entries periodically
				}
			}
			if !foundIp {
				foundIp, foundCalleeId, err = SearchCallerIpInHubMap(ipAddr)
				if err != nil {
					fmt.Printf("# turn auth for %v FAIL err=%v\n", srcAddr.String(), err)
					return nil, false
				}
				if foundIp {
					if !foundByMap {
						recentTurnCallerIpMutex.Lock()
						recentTurnCallerIps[ipAddr] = TurnCaller{foundCalleeId,timeNow}
						//if logWantedFor("turn") {
						//	fmt.Printf("turn auth added (%s) to recentTurnCallerIps len=%d\n",
						//		srcAddr.String(), len(recentTurnCallerIps))
						//}
						recentTurnCallerIpMutex.Unlock()
					}
				}
			}
			if foundIp {
				if logWantedFor("turn") {
					recentTurnCallerIpMutex.RLock()
					fmt.Printf("turn auth for %v SUCCESS (by map %v) %d (%s)\n",
						srcAddr.String(), foundByMap, len(recentTurnCallerIps), foundCalleeId)
					recentTurnCallerIpMutex.RUnlock()
				}
				// NOTE: the same key strings are used in caller.js and callee.js
				// it doesn't matter what they are, but they must be the same
				authKey := turn.GenerateAuthKey("c807ec29df3c9ff", realm, "736518fb4232d44")
				return authKey, true
			}

			if logWantedFor("turn") {
				fmt.Printf("turn auth for %v FAIL not found\n", srcAddr.String())
			}
			return nil, false
		},
		// PacketConnConfigs is a list of UDP Listeners and the configuration around them
		PacketConnConfigs: []turn.PacketConnConfig{
			{
				PacketConn: udpListener,
				RelayAddressGenerator: &turn.RelayAddressGeneratorStatic{
					RelayAddress: net.ParseIP(turnIP),
					Address:      "0.0.0.0",
				},
			},
		},
		LoggerFactory: loggerFactory,
	})
	if err != nil {
		fmt.Printf("turn err %v ===========================\n", err)
		return
	}
}

