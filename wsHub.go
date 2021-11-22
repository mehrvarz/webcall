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
	HubMutex sync.RWMutex

	WsClientID uint64 // set by the callee; will be handed over to the caller via /online
	calleeHostStr string // set by the callee; will be handed over to the caller via /online

	CalleeClient *WsClient
	GlobalCalleeID string	// this is the global id (unlike CalleeClient.calleeID)
	CalleeLogin atombool.AtomBool // connected to signaling server

	CallerClient *WsClient
	//callerID string // id of the caller (may not be avail)
	//callerNickname string // nickname of the caller (may not be avail)

	registrationStartTime int64 // this is the callees registration starttime; may be 0 for testuser
	maxRingSecs int //durationSecs1 int // max wait secs till caller arrives
	maxTalkSecsIfNoP2p int // durationSecs2
	timer *time.Timer // expires when durationSecs ends; terminates session
	dontCancel bool // set to prevent timer from calling cancelFunc() // TODO atomic?
	lastCallStartTime int64
	LocalP2p bool
	RemoteP2p bool
	ConnectedToPeerSecs int
	ServiceStartTime int64
	IsCalleeHidden bool
	IsUnHiddenForCallerAddr string
	ConnectedCallerIp string
	WsUrl string
	WssUrl string
	exitFunc func(*WsClient, string)
}

func newHub(calleeID string, maxRingSecs int, maxTalkSecsIfNoP2p int, startTime int64) *Hub {
	return &Hub{
		registrationStartTime:  startTime,
		GlobalCalleeID:         calleeID,
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
				fmt.Printf("setDeadline reached; disconnect caller (secs=%d %v)\n",
					secs,timeStart.Format("2006-01-02 15:04:05"))
				if h.CallerClient!=nil {
					// if there is a caller (for instance during ringing), we only disconnect this caller
					h.CallerClient.Close("setDeadline "+comment)
					h.CallerClient.isConnectedToPeer.Set(false)
				} else if h.CalleeClient!=nil {
					// otherwise we disconnect this callee
					//h.doUnregister(h.CalleeClient,"setDeadline "+comment)
					h.doBroadcast([]byte("cancel|deadline"))
					h.CalleeClient.peerConHasEnded("deadline")
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

func (h *Hub) processTimeValues() {
	if h.lastCallStartTime>0 {
		callDurationSecs := int(time.Now().Unix() - h.lastCallStartTime)
		if logWantedFor("hub") {
			fmt.Printf("hub processTimeValues %d\n", callDurationSecs)
		}
		if callDurationSecs>0 {
			numberOfCallsTodayMutex.Lock()
			numberOfCallsToday++
			numberOfCallSecondsToday += callDurationSecs
			numberOfCallsTodayMutex.Unlock()
		}
	}
}

// doUnregister() disconnects the client; and if client==callee, calls exitFunc to deactivate hub + wsClientID
func (h *Hub) doUnregister(client *WsClient, comment string) {
	if client.isCallee && !client.clearOnCloseDone {
		if logWantedFor("hub") {
			fmt.Printf("hub client unregister (%s) isCallee=%v (%s)\n",
				client.calleeID, client.isCallee, comment)
		}
		h.setDeadline(-1,"doUnregister "+comment)
		h.HubMutex.Lock()
		if h.lastCallStartTime>0 {
			h.processTimeValues()
			h.lastCallStartTime = 0
			h.LocalP2p = false
			h.RemoteP2p = false
		}
		h.HubMutex.Unlock()
		client.clearOnCloseDone = true
	}

	//fmt.Printf("hub client unreg cliInHub=%d isCallee=%v id=%s rip=%s\n",
	//	len(h.Clients), client.isCallee, client.hub.calleeID, client.remoteAddr)

	// NOTE if the client is still connected, calling Close() will cause nbio OnClose()
	client.Close("unregister "+comment)
	client.isConnectedToPeer.Set(false)

	if client.isCallee {
		if h.CallerClient!=nil {
			h.CallerClient.Close("unregister "+comment)
			h.CallerClient.isConnectedToPeer.Set(false)
		}
		// remove callee from hubMap; delete wsClientID from wsClientMap
		h.exitFunc(client,comment)
	} else {
		// clear caller peer-connection flag and callerIp in HubMap
		//client.peerConHasEnded("unregister "+comment)
	}

	if logWantedFor("hub") {
		fmt.Printf("hub client unregister done %s isCallee=%v %s\n",
			client.calleeID, client.isCallee, comment)
	}
}

