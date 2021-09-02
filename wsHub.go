// WebCall Copyright 2021 timur.mobi. All rights reserved.
package main

import (
	"fmt"
	"time"
	"sync"
	"os"
	"strings"
	"github.com/mehrvarz/webcall/skv"
	"github.com/mehrvarz/webcall/rkv"
)

type Hub struct {
	HubMutex sync.RWMutex

	WsClientID uint64 // set by the callee; will be handed over to the caller at /online
	calleeHostStr string // set by the callee; will be handed over to the caller at /online

	CalleeClient *WsClient
	calleeID string	// calleeID=="random" will change on "pickup"  this is the global id (unlike client.calleeID)
	CalleeLogin rkv.AtomBool // connected to signaling server

	CallerClient *WsClient
	callerID string // id of the caller (may not be avail)
	callerNickname string // nickname of the caller (may not be avail)

	registrationStartTime int64 // this is the callees registration starttime; may be 0 for testuser
	maxRingSecs int //durationSecs1 int // max wait secs till caller arrives
	maxTalkSecsIfNoP2p int // durationSecs2
	timer *time.Timer // expires when durationSecs ends; terminates session
	dontCancel bool // set to prevent timer from calling cancelFunc()
	lastCallStartTime int64
	LocalP2p bool
	RemoteP2p bool
	ConnectedToPeerSecs int
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

func newHub(calleeID string, maxRingSecs int, maxTalkSecsIfNoP2p int, startTime int64) *Hub {
	//fmt.Printf("newHub ID=%s startTime=%d\n", calleeID, startTime)
	return &Hub{
		registrationStartTime:  startTime,
		calleeID:               calleeID,
		maxRingSecs:            maxRingSecs,
		maxTalkSecsIfNoP2p:     maxTalkSecsIfNoP2p,
		dontCancel:             false,
		LocalP2p:               false,
		RemoteP2p:              false,
	}
}

func (h *Hub) setDeadline(secs int, comment string) {
	if h.timer!=nil {
		if logWantedFor("calldur") {
			fmt.Printf("setDeadline clear old timer; new secs=%d (%s)\n",secs,comment)
		}
		h.dontCancel = true
		h.timer.Stop()
		time.Sleep(100 * time.Millisecond)
		h.timer = nil
	}

	if(secs>0) {
		if logWantedFor("calldur") {
			fmt.Printf("setDeadline create %ds (%s)\n",secs,comment)
		}
		h.timer = time.NewTimer(time.Duration(secs) * time.Second)
		h.dontCancel = false
		go func() {
			timeStart := time.Now()
			<-h.timer.C
			// timer has ended
			if h.dontCancel {
				// timer was aborted
				fmt.Printf("setDeadline reached; cancel; no disconnect caller (secs=%d %v)\n",
					secs,timeStart.Format("2006-01-02 15:04:05"))
			} else {
				// timer valid: we need to disconnect the clients
				fmt.Printf("setDeadline reached; disconnect caller (secs=%d %v)\n",
					secs,timeStart.Format("2006-01-02 15:04:05"))
				if h.CallerClient!=nil {
					// if there is a caller (for instance during ringing), we only disconnect this caller
					h.CallerClient.Close("setDeadline "+comment)
					h.CallerClient.isConnectedToPeer.Set(false)
				} else {
					// otherwise we disconnect this callee
					h.doUnregister(h.CalleeClient,"setDeadline "+comment)
				}
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
	var dbEntry skv.DbEntry
	// TODO h.calleeID = "answie7!3766090173" does not work here
	// instead of the global ID we need to use the local ID (or cut off the '!')
	calleeId := h.calleeID
	if strings.HasPrefix(calleeId,"answie") {
		idxExclam := strings.Index(calleeId,"!")
		if idxExclam>=0 {
			calleeId = calleeId[:idxExclam]
		}
	}
	err := kvMain.Get(dbRegisteredIDs,calleeId,&dbEntry)
	if err!=nil {
		fmt.Printf("# processTimeValues (%s) failed on dbRegisteredIDs\n",calleeId)
		return false
	}

	var userKey string
	var dbUser skv.DbUser
	dbUserLoaded := false
	inServiceSecs := 0
	if h.registrationStartTime>0 {
		// h.registrationStartTime: the callees registration starttime
		// inServiceSecs: the age of the callee service time
		inServiceSecs = int(timeNow.Unix() - h.registrationStartTime)
		userKey = fmt.Sprintf("%s_%d",calleeId, h.registrationStartTime)
		//fmt.Printf("processTimeValues (%s) h.registrationStartTime=%d >0 userKey=(%s) get...\n",
		//	calleeId, h.registrationStartTime, userKey)
		err := kvMain.Get(dbUserBucket, userKey, &dbUser)
		if err!=nil {
			fmt.Printf("# hub processTimeValues error db=%s bucket=%s getX key=%v err=%v\n",
				dbMainName, dbUserBucket, userKey, err)
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

			//fmt.Printf("hub processTimeValues adding ConnectedToPeerSecs: %ds id=%s\n", secs, calleeId)
			dbUser.ConnectedToPeerSecs += secs

			if dbUserLoaded {
				dbUser.CallCounter++
				if h.CalleeClient != nil {
					// send post call "serviceData" msg to callee
					serviceDataString := fmt.Sprintf("%d|%d",
						dbUser.ConnectedToPeerSecs, inServiceSecs)
					//fmt.Printf("hub processTimeValues client serviceData (%s)\n",serviceDataString)
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

					logline := fmt.Sprintf("%s talkSecs:%d sum:%d servSecs:%d ip:%s\n",
						curDateTime,
						secs, dbUser.ConnectedToPeerSecs,
						inServiceSecs, remoteAddr)

					if _, err := fo.Write([]byte(logline)); err != nil {
						fmt.Printf("# hub processTimeValues failed to write (%s) err=%v\n",filename,err)
					}
				}
			}
		}

		h.lastCallStartTime = 0
	}
	if dbUserLoaded {
		if h.LocalP2p {
			dbUser.LocalP2pCounter++
			h.LocalP2p = false
		}
		if h.RemoteP2p {
			dbUser.RemoteP2pCounter++
			h.RemoteP2p = false
		}

		//fmt.Printf("hub processTimeValues store counter for key=(%v)\n",userKey)
		err := kvMain.Put(dbUserBucket, userKey, dbUser, false)
		if err!=nil {
			fmt.Printf("# hub processTimeValues error db=%s bucket=%s put key=%v err=%v\n",
				dbMainName, dbUserBucket, userKey, err)
		} else {
			//fmt.Printf("hub processTimeValues db=%s bucket=%s put key=%v OK\n",
			//	dbMainName, dbUserBucket, userKey)
		}
	}
	return deliveredServiceData
}

// doUnregister() disconnects the client; and if client==callee calls exitFunc to deactivate hub + wsClientID
// is used by /login, OnClose() and cmd "stop"
func (h *Hub) doUnregister(client *WsClient, comment string) {
	if client.isCallee && !client.storeOnCloseDone {
		if logWantedFor("hub") {
			fmt.Printf("hub client unregister (%s) isCallee=%v (%s)\n",
				client.hub.calleeID, client.isCallee, comment)
		}
		h.HubMutex.Lock()
		h.setDeadline(-1,"doUnregister "+comment)
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
		if h.CallerClient!=nil {
			h.CallerClient.Close("unregister "+comment)
			h.CallerClient.isConnectedToPeer.Set(false)
		}
		h.exitFunc(client,comment) // remove callee from local and global hubMap + del wsClientID from wsClientMap
	} else {
		client.peerConHasEnded() // flag caller as being not peer-connected + clear callerIp in global HubMap
	}

	if logWantedFor("hub") {
		fmt.Printf("hub client unregister done %s isCallee=%v %s\n",
			client.hub.calleeID, client.isCallee, comment)
	}
}

