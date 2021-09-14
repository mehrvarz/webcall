// WebCall Copyright 2021 timur.mobi. All rights reserved.
// skv layer for local db
package main

import (
	"strings"
	"strconv"
	"fmt"
	"time"
	"math/rand"
	"github.com/mehrvarz/webcall/skv"
)

// GetOnlineCallee(ID) can tell us (with optional ejectOn1stFound yes/no):
// "is calleeID online?", "is calleeID hidden online?", "is calleeID hidden online for my callerIpAddr?"
func locGetOnlineCallee(calleeID string, ejectOn1stFound bool, reportHiddenCallee bool, callerIpAddr string, occupy bool, comment string) (string,*Hub,error) { // actual calleeID, hostingServerIp
	hubMapMutex.RLock()
	defer hubMapMutex.RUnlock()

	//fmt.Printf("GetLocalCallee %s (%s)\n",calleeID,comment)
	calleeIdPlusExcl := calleeID+"!"
	for key := range hubMap {
		if key!=calleeID && !strings.HasPrefix(key,calleeIdPlusExcl) {
			continue
		}
		// found a fitting calleeID
		//fmt.Printf("cmdDo GetOnlineCallee id=%s ejectOn1st=%v reportHiddenCallee=%v key=(%s)\n",
		//	calleeID, ejectOn1stFound, reportHiddenCallee, key)
		hub := hubMap[key]
		if hub.ConnectedCallerIp!="" && hub.ConnectedCallerIp!=callerIpAddr {
			if ejectOn1stFound {
				// found a fitting calleeID but this callee is busy (with someone else)
				return "", nil, nil
			}
			continue
		}

		if !hub.IsCalleeHidden {
			// found a fitting calleeID and it is free and not hidden
			//fmt.Printf("cmdDo GetOnlineCallee found callee %s is free + not hidden\n",key)
			if occupy && hub.ConnectedCallerIp=="" {
				hub.ConnectedCallerIp = "wait"
			}
			return key, hub, nil
		}

		if reportHiddenCallee {
			// found a fitting calleeID and while this callee is hidden, we are asked to report it anyway
			//fmt.Printf("cmdDo GetOnlineCallee found callee %s is free + hidden\n",key)
			if occupy && hub.ConnectedCallerIp=="" {
				hub.ConnectedCallerIp = "wait"
			}
			return key, hub, nil
		}

		if hub.IsUnHiddenForCallerAddr!="" && callerIpAddr == hub.IsUnHiddenForCallerAddr {
			// found a fitting calleeID which is hidden, but is visible for this caller
			//fmt.Printf("cmdDo GetOnlineCallee found callee %s free + hidden + visible to caller\n",key)
			if occupy && hub.ConnectedCallerIp=="" {
				hub.ConnectedCallerIp = "wait"
			}
			return key, hub, nil
		}

		// found a fitting calleeID but we are not supposed to report this callee
		//fmt.Printf("cmdDo GetOnlineCallee callee %s not supposed to be reported\n",key)
	}
	return "", nil, nil
}

func locStoreCallerIpInHubMap(calleeId string, callerIp string, skipConfirm bool) error {
	fmt.Printf("StoreCallerIpInHubMap calleeId=%s callerIp=%s\n", calleeId, callerIp)
	var err error = nil
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()
	hub := hubMap[calleeId]
	if hub==nil {
		err = skv.ErrNotFound
	} else {
		if hub.ConnectedCallerIp != callerIp {

			if callerIp == "" {
				ipAddr := hub.ConnectedCallerIp
				if portIdx := strings.Index(ipAddr, ":"); portIdx >= 0 {
					ipAddr = ipAddr[:portIdx]
				}
				// client is gone, but we prolong turn session time by x secs, to avoid turn-errors
				turnCaller,ok := recentTurnCallerIps[ipAddr]
				if ok {
					if turnCaller.CallerID == calleeId {
						fmt.Printf("StoreCallerIpInHubMap prolong turn for callerIp=%s\n", ipAddr)
						turnCaller.TimeStored = time.Now()
						recentTurnCallerIps[callerIp] = turnCaller
					} else {
						fmt.Printf("StoreCallerIpInHubMap cannot prolong turn for callerIp=%s A\n",
							ipAddr)
					}
				} else {
					fmt.Printf("StoreCallerIpInHubMap cannot prolong turn for callerIp=%s B\n",
						ipAddr)
				}
			}

			hub.ConnectedCallerIp = callerIp
			hubMap[calleeId] = hub
		}
	}
	return err
}

func locSearchCallerIpInHubMap(ip string) (bool,string,error) {
	fmt.Printf("SearchCallerIpInHubMap ip=%s\n",ip)
	hubMapMutex.RLock()
	defer hubMapMutex.RUnlock()
	for id := range hubMap {
		hub := hubMap[id]
		if strings.HasPrefix(hub.ConnectedCallerIp,ip) {
			return true,hub.calleeID,nil
		}
	}
	return false,"",nil
}

func locDeleteFromHubMap(id string) (int64,error) {
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()
	delete(hubMap,id)
	//fmt.Printf("exitFunc delete(globalHubMap,%s) done %d\n",releasedCalleeID,len(globalHubMap))
	return int64(len(hubMap)),nil
}

func locStoreCalleeInHubMap(key string, hub *Hub, multiCallees string, remoteAddrWithPort string, wsClientID uint64, skipConfirm bool) (string,int64,error) {
	//fmt.Printf("StoreCalleeInHubMap start key=%s\n",key)
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()

	if strings.Index(multiCallees,"|"+key+"|")>=0 {
		newKey := ""
		for i:=0; i<100; i++ {
			var idExt uint64 = uint64(rand.Int63n(int64(99999999999)))
			if(idExt < uint64(10000000000)) {
				continue
			}
			newKey = key + "!" + strconv.FormatInt(int64(idExt),10)
			_,ok := hubMap[newKey]
			//fmt.Printf("StoreCalleeInHubMap try key=%s ok=%v idx=%d\n",newKey,ok,idx)
			if !ok {
				// newKey does not exist yet - found a free slot: exit loop
				break
			}
			// newKey exists - must continue to search for a free slot
			//if i>=98 {
			//	fmt.Printf("StoreCalleeInHubMap %d tries\n",i)
			//}
		}
		key = newKey
	}
	//fmt.Printf("StoreCalleeInHubMap final key=%s\n",key)
	hubMap[key] = hub
	return key, int64(len(hubMap)), nil
}

func locGetRandomCalleeID() (string,error) {
	hubMapMutex.RLock()
	defer hubMapMutex.RUnlock()

	newCalleeId := ""
	for {
		intID := uint64(rand.Int63n(int64(99999999999)))
		if(intID<uint64(10000000000)) {
			continue;
		}
		//newCalleeId = fmt.Sprintf("%d",intID)
		newCalleeId = strconv.FormatInt(int64(intID),10)
		hub := hubMap[newCalleeId]
		if hub!=nil {
			continue;
		}

		var dbEntry DbEntry
		err := kvMain.Get(dbRegisteredIDs,newCalleeId,&dbEntry)
		if err==nil {
			// found in dbRegisteredIDs
			fmt.Printf("# getRandomCalleeID %v exists already in dbRegisteredIDs\n",newCalleeId)
			continue;
		}
		err = kvMain.Get(dbBlockedIDs,newCalleeId,&dbEntry)
		if err==nil {
			// found in dbBlockedIDs
			fmt.Printf("# getRandomCalleeID %v exists already in dbBlockedIDs\n",newCalleeId)
			continue;
		}
		// not found anywhere - newCalleeID is accepted!
		//fmt.Printf("getRandomCalleeID %v is free\n",newCalleeId)
		return newCalleeId, nil
	}
}

func locSetCalleeHiddenState(calleeId string, hidden bool) (error) {
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()
	hub := hubMap[calleeId]
	if hub==nil {
		return skv.ErrNotFound
	}
	hub.IsCalleeHidden = hidden
	return nil
}

func locSetUnHiddenForCaller(calleeId string, callerIp string) (error) {
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()
	hub := hubMap[calleeId]
	if hub==nil {
		return skv.ErrNotFound
	}
	hub.IsUnHiddenForCallerAddr = callerIp
	return nil
}

/*
// return the number of callees (and callers) currently online
func GetOnlineCalleeCount(countCallers bool) (int64,int64,error) {
	hubMapMutex.RLock()
	defer hubMapMutex.RUnlock()
	var callers int64
	if countCallers {
		for id := range hubMap {
			if hubMap[id].ConnectedCallerIp != "" {
				callers++
			}
		}
	}
	return int64(len(hubMap)), callers, nil
}
*/

