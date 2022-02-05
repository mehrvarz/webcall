// WebCall Copyright 2021 timur.mobi. All rights reserved.
//
// wsHub is a holder for two ws-clients: callee and caller.

package main

import (
	"fmt"
	"time"
	"sync"
	"github.com/mehrvarz/webcall/atombool"
)

type Hub struct {
	CalleeClient *WsClient
	CallerClient *WsClient
	timer *time.Timer // expires when durationSecs ends; terminates session
	exitFunc func(*WsClient, string)
	IsUnHiddenForCallerAddr string
	ConnectedCallerIp string
	WsUrl string
	WssUrl string
	calleeUserAgent string // http UA
	HubMutex sync.RWMutex
	CalleeLogin atombool.AtomBool // callee is connected to signaling server
	WsClientID uint64 // set by the callee; will be handed over to the caller via /online
	registrationStartTime int64 // this is the callees registration starttime; may be 0 for testuser
	lastCallStartTime int64
	ServiceStartTime int64
	ConnectedToPeerSecs int64 // total secs
	CallDurationSecs int64 // single call secs
	maxRingSecs int //durationSecs1 int // max wait secs till caller arrives
	maxTalkSecsIfNoP2p int // durationSecs2
	dontCancel bool // set to prevent timer from calling cancelFunc() // TODO atomic?
	IsCalleeHidden bool
	LocalP2p bool
	RemoteP2p bool
	//callerID string // id of the caller (may not be avail)
	//callerNickname string // nickname of the caller (may not be avail)
}

func newHub(maxRingSecs int, maxTalkSecsIfNoP2p int, startTime int64) *Hub {
	return &Hub{
		maxRingSecs:            maxRingSecs,
		maxTalkSecsIfNoP2p:     maxTalkSecsIfNoP2p,
		registrationStartTime:  startTime,
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
			h.timer = nil
			if h.dontCancel {
				// timer was aborted
				//fmt.Printf("setDeadline reached; cancel; no disconnect caller (secs=%d %v)\n",
				//	secs,timeStart.Format("2006-01-02 15:04:05"))
			} else {
				// timer valid: we need to disconnect the clients
				fmt.Printf("setDeadline reached; end session now (secs=%d %v)\n",
					secs,timeStart.Format("2006-01-02 15:04:05"))
//				if h.CallerClient!=nil {
//					// if there is a caller (for instance during ringing), we only disconnect this caller
//					h.CallerClient.Close("setDeadline "+comment)
//					h.CallerClient.isConnectedToPeer.Set(false)
//				} else
				if h.CalleeClient!=nil {
					// otherwise we disconnect this callee
					//h.doUnregister(h.CalleeClient,"setDeadline "+comment)
					h.doBroadcast([]byte("cancel|c"))
					h.CalleeClient.peerConHasEnded("deadline")

					if(h.CallerClient!=nil) {
						// deleting recentTurnCallerIps entry, so it does not exist on quick reconnect
						recentTurnCallerIpMutex.Lock()
						delete(recentTurnCallerIps,h.CallerClient.RemoteAddrNoPort)
						recentTurnCallerIpMutex.Unlock()
					}
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

func (h *Hub) processTimeValues(comment string) {
	if h.lastCallStartTime>0 {
		h.CallDurationSecs = time.Now().Unix() - h.lastCallStartTime
		if logWantedFor("hub") {
			fmt.Printf("hub (%s) timeValues %s sec=%d %d %d\n", h.CalleeClient.calleeID, comment,
				h.CallDurationSecs, time.Now().Unix(), h.lastCallStartTime)
		}
		if h.CallDurationSecs>0 {
			numberOfCallsTodayMutex.Lock()
			numberOfCallsToday++
			numberOfCallSecondsToday += h.CallDurationSecs
			numberOfCallsTodayMutex.Unlock()
		}
	}
}

// doUnregister() disconnects the client; and if client==callee, calls exitFunc to deactivate hub + wsClientID
func (h *Hub) doUnregister(client *WsClient, comment string) {
	if client.isCallee {
		if logWantedFor("hub") {
			fmt.Printf("hub (%s) unregister callee peercon=%v clr=%v (%s)\n",
				client.calleeID, client.isConnectedToPeer.Get(), client.clearOnCloseDone, comment)
		}

		if !client.clearOnCloseDone {
			h.setDeadline(-1,"doUnregister "+comment)
			h.HubMutex.Lock()
			if h.lastCallStartTime>0 {
				h.processTimeValues("doUnregister")
				h.lastCallStartTime = 0
				h.LocalP2p = false
				h.RemoteP2p = false
			}
			h.HubMutex.Unlock()
			client.clearOnCloseDone = true
		}

		client.Close("unregister "+comment)
		client.isConnectedToPeer.Set(false)

		if h.CallerClient!=nil {
			h.CallerClient.Close("unregister "+comment)
			h.CallerClient.isConnectedToPeer.Set(false)
			h.CallerClient = nil
		}
		// remove callee from hubMap; delete wsClientID from wsClientMap
		h.exitFunc(client,comment)
		h.CalleeClient = nil
	} else {
		if logWantedFor("hub") {
			fmt.Printf("hub (%s) unregister caller peercon=%v (%s)\n",
				client.calleeID, client.isConnectedToPeer.Get(), comment)
		}

		client.Close("unregister "+comment)

		//client.isConnectedToPeer.Set(false)	// caller may still be peer-connected to callee

//TODO if there is no peer-con then this may be required (at least clearing CallerIp)
//		if(client.isConnectedToPeer.Get()) {
//			client.peerConHasEnded("unregister "+comment)
//		}
	}
}

