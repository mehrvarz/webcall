package main

import (
	"fmt"
	"time"
	"sync"
	"os"
	"strings"

	"github.com/mehrvarz/webcall/rkv"
)


type Hub struct {
	HubMutex sync.RWMutex	// TODO maybe I am not using this in all the places it is needed

	WsClientID uint64 // set by the callee; will be handed over to the caller at /online
	calleeHostStr string // set by the callee; will be handed over to the caller at /online

	CalleeClient *WsClient
	calleeID string	// calleeID=="random" will change on "pickup"  this is the global id (unlike client.calleeID)
	CalleeIp string // this is the remote client ip
	CalleeLogin rkv.AtomBool // connected to signaling server

	CallerClient *WsClient
	callerID string // id of the caller (may not be avail)
	callerNickname string // nickname of the caller (may not be avail)

	registrationStartTime int64 // this is the callees registration starttime; may be 0 for testuser
	durationSecs1 int // max wait secs till caller arrives
	durationSecs2 int // max talk time
	timer *time.Timer // expires when durationSecs ends; terminates session
	dontCancel bool // set to prevent timer from calling cancelFunc()
	lastCallStartTime int64
	LocalP2p bool
	RemoteP2p bool
	ConnectedToPeerSecs int
	PermittedConnectedToPeerSecs int
	ServiceDurationSecs int
	ServiceStartTime int64

	IsCalleeHidden bool
	IsUnHiddenForCallerAddr string
	ConnectedCallerIp string
	ClientIpAddr string
	ServerIpAddr string // GetOutboundIP() set by rkv.go StoreCalleeInHubMap()
	WsUrl string
	WssUrl string

	exitFunc func(*WsClient, string) // to cleanup the hub being killed
}

func newHub(calleeID string, durationSecs1 int, durationSecs2 int, startTime int64,
		exitFunc func(*WsClient,string)) *Hub {
	//fmt.Printf("newHub ID=%s startTime=%d\n", calleeID, startTime)
	return &Hub{
		registrationStartTime: startTime,
		calleeID:      calleeID,
		durationSecs1: durationSecs1,
		durationSecs2: durationSecs2,
		timer:         nil,
		dontCancel:    false,
		lastCallStartTime: 0,
		LocalP2p:      false,
		RemoteP2p:     false,
		CalleeIp:      "",
		CalleeClient:  nil,
		exitFunc:      exitFunc,
	}
}

// TODO not sure if the goroutine will be ended
func (h *Hub) setDeadline(secs int) {
	if h.timer!=nil {
		if logWantedFor("calldur") {
			fmt.Printf("setDeadline clear old timer\n")
		}
		h.dontCancel = true
		h.timer.Stop()
		time.Sleep(100 * time.Millisecond)
		h.timer = nil
	}

	if(secs>0) {
		if logWantedFor("calldur") {
			fmt.Printf("setDeadline create %ds\n",secs)
		}
		h.timer = time.NewTimer(time.Duration(secs) * time.Second)
		h.dontCancel = false
		go func() {
			timeStart := time.Now()
			<-h.timer.C
			if h.dontCancel {
				fmt.Printf("setDeadline reached; don't cancel (secs=%d %v)\n",
					secs,timeStart.Format("2006-01-02 15:04:05"))
			} else {
				fmt.Printf("setDeadline reached; do cancel (secs=%d %v)\n",
					secs,timeStart.Format("2006-01-02 15:04:05"))
				h.doExit()
			}
		}()
	}
}

func (h *Hub) doBroadcast(message []byte) {
	fmt.Printf("hub doBroadcast (%s)\n",message)
	if h.CallerClient!=nil {
		h.CallerClient.Write(message)
	}
	if h.CalleeClient!=nil {
		h.CalleeClient.Write(message)
	}
}

func (h *Hub) processTimeValues() bool {
	// store time data and broadcast serviceData summary to clients
	//fmt.Printf("hub processTimeValues\n")
	deliveredServiceData := false
	timeNow := time.Now()

	// we need dbEntry.DurationSecs
	var dbEntry rkv.DbEntry
// TODO h.calleeID = "answie7!3766090173" does not work here
// instead of the global ID we need to use the local ID (or cut off the '!')
	calleeId := h.calleeID
	if strings.HasPrefix(calleeId,"answie") {
		idxExclam := strings.Index(calleeId,"!")
		if idxExclam>=0 {
			calleeId = calleeId[:idxExclam]
		}
	}
	err := db.Get(dbRegisteredIDs,calleeId,&dbEntry)
	if err!=nil {
		fmt.Printf("# processTimeValues (%s) failed on dbRegisteredIDs\n",calleeId)
		// TODO an dieser stelle extrem doof
		return false
	}

	var userKey string
	var dbUser rkv.DbUser
	dbUserLoaded := false
	serviceSecs := 0
	if h.registrationStartTime>0 {
		// h.registrationStartTime: the callees registration starttime
		// serviceSecs: the age of the callee service time
		serviceSecs = int(timeNow.Unix() - h.registrationStartTime)
		userKey = fmt.Sprintf("%s_%d",calleeId, h.registrationStartTime)
		//fmt.Printf("processTimeValues (%s) h.registrationStartTime=%d >0 userKey=(%s) get...\n",
		//	calleeId, h.registrationStartTime, userKey)
		err := db.Get(dbUserBucket, userKey, &dbUser)
		if err!=nil {
			fmt.Printf("# hub processTimeValues error db=%s bucket=%s getX key=%v err=%v\n",
				dbName, dbUserBucket, userKey, err)
			// TODO an dieser stelle extrem doof
		} else {
			dbUserLoaded = true
		}
	} else {
		//fmt.Printf("processTimeValues (%s) h.registrationStartTime=%d\n",calleeId,h.registrationStartTime)
	}

	if h.lastCallStartTime>0 {
		secs := int(time.Now().Unix() - h.lastCallStartTime)
		if secs>0 {
			// secs: the duration of the call that just ended

			numberOfCallsTodayMutex.Lock()
			numberOfCallsToday++
			numberOfCallSecondsToday += secs
			numberOfCallsTodayMutex.Unlock()

/*
			// update the total call seconds (DurationSecs), but only if connection was NOT pure p2p
			if !h.LocalP2p || !h.RemoteP2p {
				if dbUser.PremiumLevel>0 {
					fmt.Printf("hub processTimeValues relayed, adding ConnectedToPeerSecs: %ds id=%s ip=%s\n",
						secs, calleeId, remoteAddr)
					dbUser.ConnectedToPeerSecs += secs
				} else {
					fmt.Printf("hub processTimeValues relayed but no paying dbUser: %ds id=%s ip=%s\n",
						secs, calleeId, remoteAddr)
				}
			} else {
				fmt.Printf("hub processTimeValues p2p = not adding: %ds id=%s ip=%s\n",secs,calleeId,remoteAddr)
			}
*/
			//fmt.Printf("hub processTimeValues adding ConnectedToPeerSecs: %ds id=%s\n", secs, calleeId)
			dbUser.ConnectedToPeerSecs += secs

			if dbUserLoaded {
				dbUser.CallCounter++
				// send "serviceData" msg to callee
				serviceDataString := fmt.Sprintf("%d|%d|%d|%d",
					dbUser.ConnectedToPeerSecs,
					dbUser.PermittedConnectedToPeerSecs,
					serviceSecs,
					dbEntry.DurationSecs)
				//fmt.Printf("hub processTimeValues client serviceData (%s)\n",serviceDataString)

				if h.CalleeClient != nil {
					h.CalleeClient.Write([]byte("serviceData|"+serviceDataString))
					deliveredServiceData = true
				}
			}

			readConfigLock.RLock()
			myCalllog := calllog
			readConfigLock.RUnlock()
			if myCalllog!="" && !strings.HasPrefix(calleeId,"answie") {
				// calllog: append a call record in ./calllog/(calleeId).log
				filename := "./"+myCalllog+"/"+calleeId+".log"
				fo, err := os.OpenFile(filename, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
				if err != nil {
					fmt.Printf("# hub processTimeValues failed to open (%s)\n",filename)
				} else {
					// close fo on return
					defer func() {
						if err := fo.Close(); err != nil {
							fmt.Printf("# hub processTimeValues failed to close (%s) err=%v\n",filename,err)
						}
					}()

					curDateTime := operationalNow().Format("2006-01-02 15:04:05")
					remoteAddr := ""
					if h.CallerClient != nil {
						remoteAddr = h.CallerClient.RemoteAddr
					}

					logline := fmt.Sprintf("%s talkSecs:%d sum:%d max:%d servSecs:%d max:%d ip:%s\n",
						curDateTime,
						secs, dbUser.ConnectedToPeerSecs, dbUser.PermittedConnectedToPeerSecs,
						serviceSecs, dbEntry.DurationSecs,
						remoteAddr)

					if _, err := fo.Write([]byte(logline)); err != nil {
						fmt.Printf("# hub processTimeValues failed to write (%s) err=%v\n",filename,err)
					}
				}
			}
		}

		h.lastCallStartTime = 0
	}
	if dbUserLoaded {
		/* this is already stored on event in client.go
		fmt.Printf("hub processTimeValues store dbUser isHiddenCallee=%v\n",h.CalleeClient.isHiddenCallee)
		if h.CalleeClient.isHiddenCallee {
			dbUser.Int2 |= 1
		} else {
			dbUser.Int2 &= 1
		}
		*/
		if h.LocalP2p {
			dbUser.LocalP2pCounter++
			h.LocalP2p = false
		}
		if h.RemoteP2p {
			dbUser.RemoteP2pCounter++
			h.RemoteP2p = false
		}
		if h.CalleeIp!="" {
			if dbUser.Ip1!=h.CalleeIp && dbUser.Ip2!=h.CalleeIp && dbUser.Ip3!=h.CalleeIp {
				if dbUser.Ip1=="" {
					dbUser.Ip1 = h.CalleeIp
				} else if dbUser.Ip2=="" {
					dbUser.Ip2 = h.CalleeIp
				} else if dbUser.Ip3=="" {
					dbUser.Ip3 = h.CalleeIp
				}
			}
			h.CalleeIp=""
		}
		// TODO UserAgent2 string
		// TODO UserAgent3 string

		//fmt.Printf("hub processTimeValues store counter for key=(%v)\n",userKey)
		err := db.Put(dbUserBucket, userKey, dbUser, false)
		if err!=nil {
			fmt.Printf("# hub processTimeValues error db=%s bucket=%s put key=%v err=%v\n",
				dbName, dbUserBucket, userKey, err)
		} else {
			//fmt.Printf("hub processTimeValues db=%s bucket=%s put key=%v OK\n", dbName, dbUserBucket, userKey)
		}
	}
	return deliveredServiceData
}

// doExit() is used by setDeadline and 2s-ticker
// disconnects both clients and calls exitFunc to deactivate hub + wsClientID
func (h *Hub) doExit() {
	fmt.Printf("hub exit via deadline or 2s-ticker (%s)\n",h.calleeID)
/*
	if(h.processTimeValues()) {
		// let serviceData be delivered before kill()
		fmt.Printf("hub exit via deadline/cancelFunc delay kill\n")
		time.Sleep(200 * time.Millisecond)
	}
	if h==nil {
		fmt.Printf("# hub exit but h==nil (%s)\n",h.calleeID)
	} else {
		fmt.Printf("hub exit (%s)\n",h.calleeID)
		if h.CallerClient != nil {
			h.CallerClient.Close("hub exit")
		}
		if h.CalleeClient != nil {
			h.CalleeClient.Close("hub exit")
		}
		// TODO does this clean up everything?
		fmt.Printf("hub exit -> exitFunc\n")
		h.exitFunc(h.CalleeClient)
	}
*/
	// we can achieve the same thing if we call doUnregister() with the callee client
	h.doUnregister(h.CalleeClient,"doExit")
}

// doUnregister() is used by /login, OnClose() and cmd "stop"
// disconnects the client; and if client==callee then call exitFunc to deactivate hub + wsClientID
func (h *Hub) doUnregister(client *WsClient, comment string) {
	if client.isCallee && !client.storeOnCloseDone {
		if logWantedFor("hub") {
			fmt.Printf("hub client unregister (%s) isCallee=%v (%s)\n",
				client.hub.calleeID, client.isCallee, comment)
		}
		h.HubMutex.Lock()
		h.setDeadline(-1)
		if h.lastCallStartTime>0 {
			// store info about the call into dbUserBucket
			if h.processTimeValues() {
				if client.isCallee {
					if logWantedFor("hub") {
						fmt.Printf("hub client unregister delay exitFunc\n")
					}
					// let serviceData be delivered before exitFunc()
					//time.Sleep(100 * time.Millisecond)
				}
			} else {
				if logWantedFor("hub") {
					fmt.Printf("hub client unregister processTimeValues returns false\n")
				}
			}
			h.lastCallStartTime = 0
		} else {
			if logWantedFor("hub") {
				fmt.Printf("hub client unregister h.lastCallStartTime not set\n")
			}
		}
		h.HubMutex.Unlock()
		client.storeOnCloseDone = true
	}

	//fmt.Printf("hub client unreg cliInHub=%d isCallee=%v id=%s rip=%s\n",
	//	len(h.Clients), client.isCallee, client.hub.calleeID, client.remoteAddr)

	// NOTE if the client is indeed still connected, calling Close() will cause nbio OnClose() to be called
	// in which case doUnregister() will be called again (reentrant)
	client.Close("unregister "+comment)
	client.isConnectedToPeer.Set(false)

	if client.isCallee {
		h.exitFunc(client,comment) // remove callee from local and global hubMap + del wsClientID from wsClientMap
	} else {
		client.peerConHasEnded() // flag caller as being not peer-connected + clear callerIp in global HubMap
	}

	if logWantedFor("hub") {
		fmt.Printf("hub client unregister done %s isCallee=%v %s\n",
			client.hub.calleeID, client.isCallee, comment)
	}
}

