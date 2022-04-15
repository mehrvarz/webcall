// WebCall Copyright 2022 timur.mobi. All rights reserved.
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
	timerCanceled chan struct{}
	exitFunc func(*WsClient, string)
	IsUnHiddenForCallerAddr string
	ConnectedCallerIp string
	WsUrl string
	WssUrl string
	calleeUserAgent string // http UA
	HubMutex sync.RWMutex
	CalleeLogin atombool.AtomBool // CalleeClient is connected to signaling server and has sent "init"
	WsClientID uint64 // set by the callee; will be handed over to the caller via /online
	registrationStartTime int64 // this is the callees registration starttime; may be 0 for testuser
	lastCallStartTime int64
	ServiceStartTime int64
	ConnectedToPeerSecs int64 // total secs
	CallDurationSecs int64 // single call secs
	maxRingSecs int //durationSecs1 int // max wait secs till caller arrives
	maxTalkSecsIfNoP2p int // durationSecs2
	IsCalleeHidden bool
	LocalP2p bool
	RemoteP2p bool
}

func newHub(maxRingSecs int, maxTalkSecsIfNoP2p int, startTime int64) *Hub {
	return &Hub{
		maxRingSecs:            maxRingSecs,
		maxTalkSecsIfNoP2p:     maxTalkSecsIfNoP2p,
		registrationStartTime:  startTime,
		LocalP2p:               false,
		RemoteP2p:              false,
	}
}

func (h *Hub) setDeadline(secs int, comment string) {
	if h.timer!=nil {
		// TODO this does not release <-h.timer.C
		if logWantedFor("calldur") {
			fmt.Printf("setDeadline clear old timer; new secs=%d (%s)\n",secs,comment)
		}
		h.timerCanceled <- struct{}{}
		if h.timer!=nil {
			if !h.timer.Stop() {
				if(secs>0) {
					// before we overwrite h.timer (with a NewTimer below), let timerCanceled strike
					time.Sleep(10 * time.Millisecond)
				}
			}
			h.timer=nil	// will be done below anyway, so just to be sure
		}
	}

	if(secs>0) {
		if logWantedFor("calldur") {
			fmt.Printf("setDeadline create %ds (%s)\n",secs,comment)
		}
		h.timer = time.NewTimer(time.Duration(secs) * time.Second)
		h.timerCanceled = make(chan struct{})
		go func() {
			timeStart := time.Now()
			select {
			case <-h.timer.C:
				// do something for timeout, like change state
				// timer valid: we need to disconnect the (relayed) clients (if still connected)
				if h.CalleeClient!=nil {
					// otherwise we disconnect this callee
					if h.CalleeClient.isConnectedToPeer.Get() {
						fmt.Printf("setDeadline (%s) reached; end session now (secs=%d %v)\n",
							h.CalleeClient.calleeID, secs, timeStart.Format("2006-01-02 15:04:05"))
						//h.doUnregister(h.CalleeClient,"setDeadline "+comment)
						h.doBroadcast([]byte("cancel|c"))
						h.CalleeClient.peerConHasEnded("deadline")
						if(h.CallerClient!=nil) {
							// deleting recentTurnCalleeIps entry, so it does not exist on quick reconnect
							recentTurnCalleeIpMutex.Lock()
							delete(recentTurnCalleeIps,h.CallerClient.RemoteAddrNoPort)
							recentTurnCalleeIpMutex.Unlock()
						}
					}
				}
			case <-h.timerCanceled:
				if logWantedFor("calldur") {
					fmt.Printf("setDeadline (%s) aborted; no disconnect caller (secs=%d %v)\n",
						h.CalleeClient.calleeID, secs, timeStart.Format("2006-01-02 15:04:05"))
				}
			}
			h.timer = nil
		}()
	}
}

func (h *Hub) doBroadcast(message []byte) {
	calleeID := ""
	if h.CalleeClient!=nil {
		calleeID = h.CalleeClient.calleeID
	}
	if h.CallerClient!=nil {
		fmt.Printf("hub (%s) doBroadcast caller (%s)\n", calleeID, message)
		h.CallerClient.Write(message)
	}
	if h.CalleeClient!=nil {
		fmt.Printf("hub (%s) doBroadcast callee (%s)\n", calleeID, message)
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
		client.pickupSent.Set(false)

		if h.CallerClient!=nil {
			h.CallerClient.Close("unregister "+comment)
			h.CallerClient.isConnectedToPeer.Set(false)
			h.CallerClient = nil
		}
		// remove callee from hubMap; delete wsClientID from wsClientMap
		h.exitFunc(client,comment)
		h.CalleeClient = nil

		if h.timer!=nil {
			if logWantedFor("calldur") {
				fmt.Printf("doUnregister clear old timer\n")
			}
			h.timerCanceled <- struct{}{}
			if !h.timer.Stop() {
				time.Sleep(10 * time.Millisecond)
			}
			h.timer=nil
		}
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

