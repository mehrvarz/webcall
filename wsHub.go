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
	lastNews string
	HubMutex sync.RWMutex
	CalleeLogin atombool.AtomBool // CalleeClient is connected to signaling server and has sent "init"
	WsClientID uint64 // set by the callee; will be handed over to the caller via /online
	registrationStartTime int64 // this is the callees registration starttime; may be 0 for testuser
	lastCallStartTime int64
	lastCallerContactTime int64
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
		if logWantedFor("deadline") {
			fmt.Printf("setDeadline (%s) cancel running timer; new secs=%d (%s)\n",
				h.CalleeClient.calleeID, secs, comment)
		}
		// cancel running timer early (trigger h.timer.C below)
		h.timerCanceled <- struct{}{}
		// let running timer be canceled before we (might) set a new one
		time.Sleep(10 * time.Millisecond)
	}

	if(secs>0) {
		if logWantedFor("deadline") {
			fmt.Printf("setDeadline (%s) create %ds (%s)\n", h.CalleeClient.calleeID, secs, comment)
		}
		h.timer = time.NewTimer(time.Duration(secs) * time.Second)
		h.timerCanceled = make(chan struct{})
		go func() {
			timeStart := time.Now()
			select {
			case <-h.timer.C:
				// timer event: we need to disconnect the (relayed) clients (if still connected)
				h.timer = nil
				if h.CalleeClient!=nil && h.CalleeClient.isConnectedToPeer.Get() {
					fmt.Printf("setDeadline (%s) reached; quit session now (secs=%d %v)\n",
						h.CalleeClient.calleeID, secs, timeStart.Format("2006-01-02 15:04:05"))
					calleeID := ""
					if h.CalleeClient!=nil {
						calleeID = h.CalleeClient.calleeID
					}
					if h.CallerClient!=nil {
						var message = []byte("cancel|s")
						fmt.Printf("setDeadline (%s) send to caller (%s) %s\n",
							calleeID, message, h.CallerClient.RemoteAddr)
						h.CallerClient.Write(message)
						// in response, caller will send msgboxText to server and will hangup
					}

					// we wait for msg|... (to set callerTextMsg)
					time.Sleep(1 * time.Second)
					if h.CalleeClient!=nil && h.CalleeClient.isConnectedToPeer.Get() {
						var message = []byte("cancel|c")
						// only cancel callee if canceling caller wasn't possible
						fmt.Printf("setDeadline (%s) send to callee (%s) %s\n",
							calleeID, message, h.CalleeClient.RemoteAddr)
						h.CalleeClient.Write(message)

						// NOTE: peerConHasEnded() may call us back / this is why we set h.timer = nil first
						h.CalleeClient.peerConHasEnded(fmt.Sprintf("deadline%d",secs))
					}
				}
			case <-h.timerCanceled:
				if logWantedFor("deadline") {
					fmt.Printf("setDeadline (%s) timerCanceled (secs=%d %v)\n",
						h.CalleeClient.calleeID, secs, timeStart.Format("2006-01-02 15:04:05"))
				}
				if h.timer!=nil {
					h.timer.Stop()
				}
				h.timer = nil
			}
		}()
	}
}

func (h *Hub) doBroadcast(message []byte) {
	// likes to be called with h.HubMutex (r)locked
	calleeID := ""
	if h.CalleeClient!=nil {
		calleeID = h.CalleeClient.calleeID
	}
	if h.CallerClient!=nil {
		if logWantedFor("deadline") {
			fmt.Printf("hub (%s) doBroadcast caller (%s) %s\n", calleeID, message, h.CallerClient.RemoteAddr)
		}
		h.CallerClient.Write(message)
	}
	if h.CalleeClient!=nil {
		if logWantedFor("deadline") {
			fmt.Printf("hub (%s) doBroadcast callee (%s) %s\n", calleeID, message, h.CalleeClient.RemoteAddr)
		}
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

		// NOTE: delete(hubMap,id) might have been executed, caused by timeout22s

		if !client.clearOnCloseDone {
			h.setDeadline(0,"doUnregister "+comment)
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
		client.isMediaConnectedToPeer.Set(false)
		client.pickupSent.Set(false)

		// remove callee from hubMap; delete wsClientID from wsClientMap
		h.exitFunc(client,comment)

		h.HubMutex.Lock()
		if h.CallerClient!=nil {
			h.CallerClient.Close("unregister "+comment)
			h.CallerClient.isConnectedToPeer.Set(false)
			h.CallerClient.isMediaConnectedToPeer.Set(false)
			h.CallerClient = nil
		}
		h.CalleeClient = nil
		h.HubMutex.Unlock()
/*
		if h.timer!=nil {
			if logWantedFor("deadline") {
				fmt.Printf("doUnregister clear old timer\n")
			}
			h.timerCanceled <- struct{}{}
			if !h.timer.Stop() {
				time.Sleep(10 * time.Millisecond)
			}
			h.timer=nil
		}
*/
//		setDeadline(0,"doUnregister")
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

