// WebCall Copyright 2022 timur.mobi. All rights reserved.
//
// wsHub is a holder for two ws-clients: callee and caller.

package main

import (
	"fmt"
	"time"
	"sync"
	"strings"
	"strconv"
	"github.com/mehrvarz/webcall/atombool"
)

type Hub struct {
	CalleeClient *WsClient
	CallerClient *WsClient
	timer *time.Timer // expires when durationSecs ends; terminates session
	timerCanceled chan struct{}
//	exitFunc func(*WsClient, string)
	exitFunc func(uint64, string)
	IsUnHiddenForCallerAddr string
	ConnectedCallerIp string // will be set on callerOffer
	WsUrl string
	WssUrl string
	calleeUserAgent string // http UA
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
	// will disconnect peercon after some time
	// by sending cancel to both clients and then by calling peerConHasEnded()
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
					h.HubMutex.RLock()
					if h.CalleeClient!=nil && h.CalleeClient.isConnectedToPeer.Get() {
						var message = []byte("cancel|c")
						// only cancel callee if canceling caller wasn't possible
						fmt.Printf("setDeadline (%s) send to callee (%s) %s\n",
							calleeID, message, h.CalleeClient.RemoteAddr)
						h.CalleeClient.Write(message)
					}
					h.HubMutex.RUnlock()

					// NOTE: peerConHasEnded may call us back / this is why we have set h.timer = nil first
					h.HubMutex.Lock()
					h.peerConHasEnded(fmt.Sprintf("deadline%d",secs)) // will set h.CallerClient=nil
					h.HubMutex.Unlock()
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
	// bad fktname! here we only send a message to BOTH clients
	// this fkt likes to be called with h.HubMutex (r)locked
	calleeID := ""
	if h.CalleeClient!=nil {
		calleeID = h.CalleeClient.calleeID
	}
	if h.CallerClient!=nil {
		if logWantedFor("______") { // was "deadline" had to be removed
			fmt.Printf("wshub (%s) doBroadcast caller (%s) %s\n", calleeID, message, h.CallerClient.RemoteAddr)
		}
		h.CallerClient.Write(message)
	}
	if h.CalleeClient!=nil {
		if logWantedFor("______") { // was "deadline" had to be removed
			fmt.Printf("wshub (%s) doBroadcast callee (%s) %s\n", calleeID, message, h.CalleeClient.RemoteAddr)
		}
		h.CalleeClient.Write(message)
	}
}

func (h *Hub) processTimeValues(comment string) {
	if h.lastCallStartTime>0 {
		h.CallDurationSecs = time.Now().Unix() - h.lastCallStartTime
		if logWantedFor("hub") {
			fmt.Printf("wshub (%s) timeValues %s sec=%d %d %d\n", h.CalleeClient.calleeID, comment,
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

func (h *Hub) peerConHasEnded(cause string) {
	// the peerConnection has ended, either bc one side has sent "cancel"
	// or bc callee has unregistered or got ws-disconnected
	// peerConHasEnded() MUST be called with locking in place

	if h.CalleeClient==nil {
		//fmt.Printf("# peerConHasEnded but h.CalleeClient==nil\n")
		return
	}

	if h.CalleeClient.isConnectedToPeer.Get() {
		fmt.Printf("%s (%s) peerConHasEnded peercon=%v media=%v (%s)\n",
			h.CalleeClient.connType, h.CalleeClient.calleeID,
			h.CalleeClient.isConnectedToPeer.Get(), h.CalleeClient.isMediaConnectedToPeer.Get(), cause)
	}

	if h.lastCallStartTime>0 {
		h.processTimeValues("peerConHasEnded") // will set c.hub.CallDurationSecs
		h.lastCallStartTime = 0
	}

	// prepare for next session
	h.CalleeClient.calleeInitReceived.Set(false)

	if h.CalleeClient.isConnectedToPeer.Get() {
		// we are disconnecting a peer connect
		localPeerCon := "?"
		remotePeerCon := "?"
		localPeerCon = "p2p"
		if !h.LocalP2p { localPeerCon = "relay" }
		remotePeerCon = "p2p"
		if !h.RemoteP2p { remotePeerCon = "relay" }

		h.CalleeClient.isConnectedToPeer.Set(false)
		h.CalleeClient.isMediaConnectedToPeer.Set(false)
		// now clear these two flags also on the other side
		if h.CallerClient!=nil {
			h.CallerClient.isConnectedToPeer.Set(false)
			h.CallerClient.isMediaConnectedToPeer.Set(false)
		}

		calleeRemoteAddr := ""
		callerRemoteAddr := ""
		callerID := ""
		callerName := ""
		//callerHost := ""
		h.CalleeClient.calleeInitReceived.Set(false) // accepting new init from callee now
		calleeRemoteAddr = h.CalleeClient.RemoteAddrNoPort
		if h.CallerClient!=nil  {
			callerRemoteAddr = h.CallerClient.RemoteAddrNoPort
			callerID = h.CallerClient.callerID
			callerName = h.CallerClient.callerName
			//callerHost = c.hub.CallerClient.callerHost

			// clear recentTurnCalleeIps[ipNoPort] entry (if this was a relay session)
			recentTurnCalleeIpMutex.Lock()
			delete(recentTurnCalleeIps,h.CallerClient.RemoteAddrNoPort)
			recentTurnCalleeIpMutex.Unlock()
		}

		fmt.Printf("%s (%s) PEER DISCON📴 %ds %s/%s %s <- %s (%s) %s\n",
			h.CalleeClient.connType, h.CalleeClient.calleeID, //peerType,
			h.CallDurationSecs, localPeerCon, remotePeerCon,
			calleeRemoteAddr, callerRemoteAddr, callerID, cause)

		// add an entry to missed calls, but only if hub.CallDurationSecs<=0
		// if caller cancels via hangup button, then this is the only addMissedCall() and contains msgtext
		// this is NOT a missed call if callee denies the call
		if h.CallDurationSecs<=0 && !strings.HasPrefix(cause,"callee") {
			// add missed call if dbUser.StoreMissedCalls is set
			userKey := h.CalleeClient.calleeID + "_" + strconv.FormatInt(int64(h.registrationStartTime),10)
			var dbUser DbUser
			err := kvMain.Get(dbUserBucket, userKey, &dbUser)
			if err!=nil {
				fmt.Printf("# %s (%s) failed to get dbUser err=%v\n",
					h.CalleeClient.connType, h.CalleeClient.calleeID,err)
			} else if dbUser.StoreMissedCalls {
				//fmt.Printf("%s (%s) store missedCall msg=(%s)\n", c.connType, c.calleeID, c.callerTextMsg)
				addMissedCall(h.CalleeClient.calleeID, CallerInfo{callerRemoteAddr, callerName, time.Now().Unix(),
					callerID, h.CalleeClient.callerTextMsg }, cause)
			}
		}

		err := StoreCallerIpInHubMap(h.CalleeClient.globalCalleeID, "", false)
		if err!=nil {
			// err "key not found": callee has already signed off - can be ignored
			//if strings.Index(err.Error(),"key not found")<0 {
				fmt.Printf("# %s (%s) peerConHasEnded clr callerIp %s err=%v\n",
					h.CalleeClient.connType, h.CalleeClient.calleeID, h.CalleeClient.globalCalleeID, err)
			//}
		}
	}

	h.setDeadline(0,cause)	// may call peerConHasEnded again (we made sure this is no problem)
}

func (h *Hub) closeCaller(cause string) {
	h.HubMutex.Lock()
	if h.CallerClient!=nil {
		h.CallerClient.Close(cause)
		// this will prevent NO PEERCON after hangup or after calls shorter than 10s
		h.CallerClient = nil
	}
	h.HubMutex.Unlock()
}

func (h *Hub) closePeerCon(cause string) {
	h.HubMutex.Lock()
	h.peerConHasEnded(cause)
	h.HubMutex.Unlock()

	h.closeCaller(cause)
}

func (h *Hub) closeCallee(cause string) {
	comment := "closeCallee <- "+cause
	h.HubMutex.Lock()
	if h.CalleeClient!=nil {
		if logWantedFor("wsclose") {
			fmt.Printf("wshub (%s) closeCallee peercon=%v clr=%v (%s)\n", h.CalleeClient.calleeID, 
				h.CalleeClient.isConnectedToPeer.Get(), h.CalleeClient.clearOnCloseDone, comment)
		}

		// NOTE: delete(hubMap,id) might have been executed, caused by timeout22s

		if !h.CalleeClient.clearOnCloseDone {
			if h.lastCallStartTime>0 {
				h.processTimeValues(comment)
				h.lastCallStartTime = 0
				h.LocalP2p = false
				h.RemoteP2p = false
			}

			if h.CalleeClient.isConnectedToPeer.Get() {
				h.peerConHasEnded(comment) // will set h.CallerClient=nil
			}
			h.setDeadline(0,comment)
			h.CalleeClient.clearOnCloseDone = true
		}

		h.CalleeClient.Close(comment)

		keepAliveMgr.Delete(h.CalleeClient.wsConn)
		h.CalleeClient.wsConn.SetReadDeadline(time.Time{})

		h.CalleeClient.isConnectedToPeer.Set(false)
		h.CalleeClient.isMediaConnectedToPeer.Set(false)
		h.CalleeClient.pickupSent.Set(false)

		h.CalleeClient = nil
		h.HubMutex.Unlock()

		// remove callee from hubMap; delete wsClientID from wsClientMap
		h.exitFunc(h.WsClientID,comment) // comment may be 'timeout22'
	} else {
		h.HubMutex.Unlock()
	}
	h.closeCaller(comment)
}

