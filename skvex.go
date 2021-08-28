package main

import (
	"strings"
	"fmt"
	"math/rand"

	//"github.com/mehrvarz/webcall/skv"
	"github.com/mehrvarz/webcall/rkv"
)

/*
GetOnlineCallee(calleeID string, ejectOn1stFound bool, reportHiddenCallee bool, callerIpAddr string, 
	occupy bool, comment string) (string,*Hub,error)
//StoreCalleeInHubMap(key string, hub *Hub, multiCallees string, skipConfirm bool) (string,int64,error)
StoreCallerIpInHubMap(calleeId string, callerIp string, skipConfirm bool) error
SearchCallerIpInHubMap(ip string) (bool,error)
DeleteFromHubMap(id string) (int64,error)
PrintHubInfo() (string,error)
GetRandomCalleeID() (string,error)
GetOnlineCalleeCount(countCallers bool) (int64,int64,error)
SetCalleeHiddenState(calleeId string, hidden bool) (error)
SetUnHiddenForCaller(calleeId string, callerIp string) (error)
*/


// GetOnlineCallee(ID) can tell us (with optional ejectOn1stFound yes/no):
// "is calleeID online?", "is calleeID hidden online?", "is calleeID hidden online for my callerIpAddr?"
func GetOnlineCallee(calleeID string, ejectOn1stFound bool, reportHiddenCallee bool, callerIpAddr string, occupy bool, comment string) (string,*Hub,error) { // actual calleeID, hostingServerIp
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

/*
func StoreCalleeInHubMap(key string, hub *Hub, multiCallees string, skipConfirm bool) (string,int64,error) {
	//fmt.Printf("StoreCalleeInHubMap start key=%s\n",key)
	if hub.ServerIpAddr == "" {
		hub.ServerIpAddr = skv.MyOutBoundIpAddr
	}

	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()

	if strings.Index(multiCallees,"|"+key+"|")>=0 {
		newKey := key
		idx := 0
		for {
			_,ok := hubMap[newKey]
			//fmt.Printf("StoreCalleeInHubMap try key=%s ok=%v idx=%d\n",newKey,ok,idx)
			if !ok {
				break
			}
			idx++
			newKey = fmt.Sprintf("%s--%d",key,idx)
		}
		key = newKey
	}
	//fmt.Printf("StoreCalleeInHubMap final key=%s\n",key)
	hubMap[key] = hub
	return key, int64(len(hubMap)), nil
}
*/

func StoreCallerIpInHubMap(calleeId string, callerIp string, skipConfirm bool) error {
	fmt.Printf("skv.StoreCallerIpInHubMap calleeId=%s callerIp=%s\n", calleeId, callerIp)
	var err error = nil
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()
	hub := hubMap[calleeId]
	if hub==nil {
		err = rkv.ErrNotFound
	} else {
		hub.ConnectedCallerIp = callerIp
		hubMap[calleeId] = hub
	}
	return err
}

/*
func GetCallerIpInHubMap(calleeId string) (string,error) {
	fmt.Printf("skv.GetCallerIpInHubMap calleeId=%s\n", calleeId)
	var err error = nil
	callerIp := ""
	hubMapMutex.RLock()
	defer hubMapMutex.RUnlock()
	hub := hubMap[calleeId]
	if hub==nil {
		err = rkv.ErrNotFound
	} else {
		callerIp = hub.ConnectedCallerIp
	}
	return callerIp,err
}
*/

func SearchCallerIpInHubMap(ip string) (bool,string,error) {
	fmt.Printf("skv.SearchCallerIpInHubMap ip=%s\n",ip)
	foundIp := false
	foundCalleeId := ""
	hubMapMutex.RLock()
	defer hubMapMutex.RUnlock()
	for id := range hubMap {
		hub := hubMap[id]
		if strings.HasPrefix(hub.ConnectedCallerIp,ip) {
			foundIp = true
			foundCalleeId = hub.calleeID
			break
		}
	}
	return foundIp,foundCalleeId,nil
}

func DeleteFromHubMap(id string) (int64,error) {
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()
	delete(hubMap,id)
	//fmt.Printf("exitFunc delete(globalHubMap,%s) done %d\n",releasedCalleeID,len(globalHubMap))
	return int64(len(hubMap)),nil
}

// TODO do we want to keep offering this for everyone?
func PrintHubInfo() (string,error) {
	data := ""
/*
	globalHubMapLock.RLock()
	defer globalHubMapLock.RUnlock()
//	fmt.Fprintf(w, "<html><div>number of hubs %d</div>",len(globalHubMap))
	// TODO the printed order may change every time bc this is how go maps work
	// TODO return a dump of the complete globalHubMap
	for id,hub := range globalHubMap {
		fmt.Printf("<div>calleeId=%s server=%s client=%s</div>", id, hub.ServerIpAddr, hub.ConnectedCallerId)
		//hub.ClientsLock.RLock()
		//for cli := range hub.Clients {
		//	fmt.Printf("<div>callee=%v online=%v hidden=%v remoteAddr=%v ua=%s</div>",
		//		cli.IsCallee, cli.IsOnline, cli.IsHiddenCallee, cli.RemoteAddr, cli.UserAgent)
		//}
	}
*/
	return data, nil
}

func GetRandomCalleeID() (string,error) {
	hubMapMutex.RLock()
	defer hubMapMutex.RUnlock()

	newCalleeId := ""
	for {
		// use alphanum only for paying subscribers
		intID := uint64(rand.Int63n(int64(99999999999)))
		if(intID<uint64(1000000000)) {
			continue;
		}
		newCalleeId = fmt.Sprintf("%d",intID)
		hub := hubMap[newCalleeId]
		if hub!=nil {
			continue;
		}

/* TODO
		var dbEntry DbEntry
		//fmt.Printf("getRandomCalleeID %v check dbRegisteredIDs\n",newCalleeId)
		err := db.Get(dbRegisteredIDs,newCalleeId,&dbEntry)
		//fmt.Printf("getRandomCalleeID %v check dbRegisteredIDs err=%v\n",newCalleeId,err)
		if err==nil {
			// found in dbRegisteredIDs
			fmt.Printf("getRandomCalleeID %v already exists in dbRegisteredIDs\n",newCalleeId)
			continue;
		} else {
			err := db.Get(dbBlockedIDs,newCalleeId,&dbEntry)
			if err==nil {
				// found in dbBlockedIDs
				fmt.Printf("getRandomCalleeID %v already exists in dbBlockedIDs\n",newCalleeId)
				continue;
			}
		}
*/
		// not found anywhere - newCalleeID is accepted!
		//fmt.Printf("getRandomCalleeID %v is free\n",newCalleeId)
		return newCalleeId, nil
	}
}

// return the number of callees and callers currently online
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

func SetCalleeHiddenState(calleeId string, hidden bool) (error) {
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()
	hub := hubMap[calleeId]
	if hub==nil {
		return rkv.ErrNotFound
	}
	hub.IsCalleeHidden = hidden
	return nil
}

func SetUnHiddenForCaller(calleeId string, callerIp string) (error) {
	hubMapMutex.Lock()
	defer hubMapMutex.Unlock()
	hub := hubMap[calleeId]
	if hub==nil {
		return rkv.ErrNotFound
	}
	hub.IsUnHiddenForCallerAddr = callerIp
	return nil
}

