// WebCall Copyright 2021 timur.mobi. All rights reserved.
package main

import (
	"bytes"
	"time"
	"strings"
	"fmt"
	"strconv"
	"errors"
	"encoding/json"
	"math/rand"
	"net/http"
	"sync/atomic"
	"github.com/mehrvarz/webcall/atombool"
	"github.com/lesismal/nbio/nbhttp/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 20 * time.Second // see: "<-pingTicker.C"

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 // see: c.conn.SetReadDeadline(time.Now().Add(pongWait))

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10 // =54 see: time.NewTicker(pingPeriod)
)

var ErrWriteNotConnected = errors.New("Write not connected")

type WsClient struct {
	hub *Hub
	wsConn *websocket.Conn
	authenticationShown bool // whether to show "pion auth for client (%v) SUCCESS"
	isCallee bool
	isOnline atombool.AtomBool	// connected to signaling server
	isConnectedToPeer atombool.AtomBool
	isHiddenCallee bool // if set, we don't report callee as online; see: getOnlinePort()
	unHiddenForCaller string
	RemoteAddr string // without port
	userAgent string
	calleeID string
	clearOnCloseDone bool
	connType string
	PremiumLevel int
	pingStart time.Time
	pingDone chan struct{}
}

func serveWs(w http.ResponseWriter, r *http.Request) {
	serve(w, r, false)
}

func serveWss(w http.ResponseWriter, r *http.Request) {
	serve(w, r, true)
}

func serve(w http.ResponseWriter, r *http.Request, tls bool) {
	if logWantedFor("wsverbose") {
		fmt.Printf("serve url=%s tls=%v\n", r.URL.String(), tls)
	}

	remoteAddr := r.RemoteAddr

	realIpFromRevProxy := r.Header.Get("X-Real-Ip")
	if realIpFromRevProxy!="" {
		remoteAddr = realIpFromRevProxy
	}

	idxPort := strings.Index(remoteAddr,":")
	if idxPort>=0 {
		remoteAddr = remoteAddr[:idxPort]
	}

	var wsClientID64 uint64 = 0
	var wsClientData wsClientDataType
	url_arg_array, ok := r.URL.Query()["wsid"]
	if ok && len(url_arg_array[0]) > 0 {
		wsClientIDstr := strings.ToLower(url_arg_array[0])
		wsClientID64, _ = strconv.ParseUint(wsClientIDstr, 10, 64)
		if wsClientID64<=0 {
			// not valid
			fmt.Printf("# serveWs upgrade error wsCliID=%d rip=%s url=%s\n",
				wsClientID64, remoteAddr, r.URL.String())
			return
		}
		var ok bool 
		wsClientMutex.RLock()
		wsClientData,ok = wsClientMap[wsClientID64]
		wsClientMutex.RUnlock()
		if !ok {
			fmt.Printf("# serveWs upgrade error wsCliID=%d does not exist rip=%s url=%s\n",
				wsClientID64, remoteAddr, r.URL.String())
			return
		}
	}

	calleeHostStr := ""
	url_arg_array, ok = r.URL.Query()["xhost"]
	if ok && len(url_arg_array[0]) > 0 {
		calleeHostStr = strings.ToLower(url_arg_array[0])
	} else {
		url_arg_array, ok := r.URL.Query()["host"]
		if ok && len(url_arg_array[0]) > 0 {
			calleeHostStr = strings.ToLower(url_arg_array[0])
		}
	}

	upgrader := websocket.NewUpgrader()
	//upgrader.EnableCompression = true
	upgrader.CheckOrigin = func(r *http.Request) bool {
		return true
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("# Upgrade err=%v\n", err)
		return
	}
	wsConn := conn.(*websocket.Conn)
	//wsConn.EnableWriteCompression(true)
	wsConn.SetReadDeadline(time.Time{})

	client := &WsClient{wsConn:wsConn}
	if tls {
		client.connType = "serveWss"
	} else {
		client.connType = "serveWs"
	}

	hub := wsClientData.hub // set by /login wsClientMap[wsClientID] = wsClientDataType{...}

	wsConn.OnMessage(func(c *websocket.Conn, messageType websocket.MessageType, data []byte) {
		switch messageType {
		case websocket.TextMessage:
			//fmt.Println("TextMessage:", messageType, string(data), len(data))
			client.receive(data)
		case websocket.BinaryMessage:
			fmt.Printf("# %s binary dataLen=%d\n", client.connType, len(data))
		}
	})
	wsConn.OnClose(func(c *websocket.Conn, err error) {
		client.isOnline.Set(false) // prevent doUnregister() from closing this already closed connection
		if logWantedFor("wsclose") {
			hub.HubMutex.RLock()
			if err!=nil {
				fmt.Printf("%s onclose %s isCallee=%v err=%v\n",
					client.connType, hub.calleeID, client.isCallee, err)
			} else {
				fmt.Printf("%s onclose %s isCallee=%v\n",
					client.connType, hub.calleeID, client.isCallee)
			}
			hub.HubMutex.RUnlock()
		}
		client.hub.doUnregister(client, "OnClose")
	})

	hub.HubMutex.Lock()
	client.hub = hub
	client.isOnline.Set(true)
	client.RemoteAddr = remoteAddr
	client.userAgent = r.UserAgent()
	client.authenticationShown = false // being used to make sure 'TURN auth SUCCESS' is only shown 1x per client
	client.calleeID = wsClientData.calleeID // this is the local ID

	client.PremiumLevel = wsClientData.dbUser.PremiumLevel
	if hub.CalleeClient==nil {
		// callee client (1st client)
		if logWantedFor("wsclient") {
			fmt.Printf("%s con callee id=%s wsCliID=%d rip=%s\n", client.connType,
				hub.calleeID, wsClientID64, client.RemoteAddr)
		}
		client.isCallee = true
		client.isHiddenCallee = wsClientData.dbUser.Int2&1!=0
		client.unHiddenForCaller = ""

		hub.WsClientID = wsClientID64
		hub.calleeHostStr = calleeHostStr
		hub.CalleeClient = client
		hub.ServiceStartTime = time.Now().Unix()
		hub.ConnectedToPeerSecs = 0
		if !strings.HasPrefix(hub.calleeID,"random") {
			// get values related to talk- and service-time for this callee from the db
			// so that 1s-ticker can calculate the live remaining time
			hub.ServiceStartTime = wsClientData.dbEntry.StartTime // race
			hub.ConnectedToPeerSecs = wsClientData.dbUser.ConnectedToPeerSecs
		}
		//fmt.Printf("%s talkSecs=%d startTime=%d serviceSecs=%d\n",
		//	client.connType, hub.ConnectedToPeerSecs, hub.ServiceStartTime, hub.ServiceDurationSecs)
	} else {
		// caller client (2nd client)
		if logWantedFor("wsclient") {
			fmt.Printf("%s con caller id=%s wsCliID=%d rip=%s\n",
				client.connType, hub.calleeID, wsClientID64, client.RemoteAddr)
		}

		hub.CallerClient = client
		err := StoreCallerIpInHubMap(hub.calleeID,wsConn.RemoteAddr().String(), false)
		if err!=nil {
			fmt.Printf("# %s StoreCallerIpInHubMap err=%v\n", client.connType, err)
		}

	}
	hub.HubMutex.Unlock()

	// send ping every pingPeriod secs
	client.setPingDeadline(pingPeriod,"start")
}

func (c *WsClient) receive(data []byte) error {
	n := len(data)
	c.setPingDeadline(pingPeriod,"receive")
	if n>0 {
		if logWantedFor("wsreceive") {
			max := n; if max>10 { max = 10 }
			fmt.Printf("%s received n=%d isCallee=%v calleeID=(%s) (%s)\n",
				c.connType, n, c.isCallee, c.hub.calleeID, data[:max])
		}
		c.receiveProcess(data)
	}
	return nil
}

func (c *WsClient) receiveProcess(message []byte) {
	// check message integrity: cmd's can not be longer than 32 chars
	checkLen := 32
	if len(message) < checkLen {
		checkLen = len(message)
	}
	idxPipe := bytes.Index(message[:checkLen], []byte("|"))
	if idxPipe<0 {
		// invalid -> ignore
		fmt.Printf("# serveWs no pipe char found; abort; checkLen=%d (%s)\n",
			checkLen,string(message[:checkLen]))
		return
	}
	tok := strings.Split(string(message),"|")
	if len(tok)!=2 {
		// invalid -> ignore
		fmt.Printf("# serveWs len(tok)=%d is !=2; abort; checkLen=%d idxPipe=%d (%s)\n",
			len(tok),checkLen,idxPipe,string(message[:checkLen]))
		return
	}

	cmd := tok[0]
	payload := tok[1]
	if cmd=="init" {
		if !c.isCallee {
			// only the callee can send "init|"
			fmt.Printf("# serveWs false double callee rip=%s #########\n",c.RemoteAddr)
			c.Write([]byte("cancel|busy"))
			return
		}
		c.hub.HubMutex.Lock()
		c.hub.CalleeLogin.Set(true)
		c.hub.HubMutex.Unlock()
		if logWantedFor("wscall") {
			fmt.Printf("%s connect %s callee=%v wsID=%d rip=%s\n",
				c.connType, c.hub.calleeID, c.isCallee, c.hub.WsClientID, c.RemoteAddr)
		}
		// deliver the callee client version number
		readConfigLock.RLock()
		calleeClientVersionTmp := calleeClientVersion
		readConfigLock.RUnlock()
		if c.Write([]byte("sessionId|"+calleeClientVersionTmp)) != nil {
			return
		}
		c.clearOnCloseDone = false
		// send list of waitingCaller and missedCalls to premium callee client
		//fmt.Printf("%s c.PremiumLevel=%d\n",c.connType,c.PremiumLevel)
		if c.PremiumLevel>=1 {
			var waitingCallerSlice []CallerInfo
			err := kvCalls.Get(dbWaitingCaller,c.calleeID,&waitingCallerSlice)
			if err!=nil {
				// can be ignored
				//fmt.Printf("# serveWs (id=%s) failed to read dbWaitingCaller err=%v\n", urlID, err)
			}
			// before we send waitingCallerSlice
			// we remove all entries that are older than 10min
			countOutdated:=0
			for idx := range waitingCallerSlice {
				if time.Now().Unix() - waitingCallerSlice[idx].CallTime > 10*60 {
					// remove outdated caller from waitingCallerSlice
					waitingCallerSlice = append(waitingCallerSlice[:idx],
						waitingCallerSlice[idx+1:]...)
					countOutdated++
				}
			}
			if countOutdated>0 {
				fmt.Printf("# %s (id=%s) deleted %d outdated from waitingCallerSlice\n",
					c.connType, c.calleeID, countOutdated)
				err = kvCalls.Put(dbWaitingCaller, c.calleeID, waitingCallerSlice, true) // skipConfirm
				if err!=nil {
					fmt.Printf("# %s (id=%s) failed to store dbWaitingCaller\n",c.connType,c.calleeID)
				}
			}
			var missedCallsSlice []CallerInfo
			err = kvCalls.Get(dbMissedCalls,c.calleeID,&missedCallsSlice)
			if err!=nil {
				// we can ignore this
				//fmt.Printf("# %s (id=%s) failed to read dbMissedCalls %v\n",
				//	c.connType, c.calleeID, err)
			}
			//fmt.Printf("%s waitingCallerToCallee\n",c.connType)
			waitingCallerToCallee(c.calleeID, waitingCallerSlice, missedCallsSlice, c)
		}
		return
	}

	if cmd=="callerDescription" {
		// caller starting a call - payload is JSON.stringify(localDescription)
		if logWantedFor("wscall") {
			fmt.Printf("%s callerDescription (call attempt) from %s to %s\n",
				c.connType,c.RemoteAddr,c.calleeID)
			//fmt.Printf("%s callerDescription payload=%s\n",c.connType,payload)
		}

		if c.hub.CalleeClient.Write(message) != nil {
			return
		}

		//if c.hub.callerID!="" && c.hub.callerNickname!="" {
		//	// send this directly to the callee
		//	sendCmd := "callerInfo|"+c.hub.callerID+":"+c.hub.callerNickname
		//	if c.hub.CalleeClient.Write([]byte(sendCmd)) != nil {
		//		return
		//	}
		//}

		// exchange useragent's
		if c.hub.CallerClient!=nil && c.hub.CalleeClient!=nil {
			if c.hub.CallerClient.Write([]byte("ua|"+c.hub.CalleeClient.userAgent)) != nil {
				return
			}
			if c.hub.CalleeClient.Write([]byte("ua|"+c.hub.CallerClient.userAgent)) != nil {
				return
			}
		}

		if c.hub.maxRingSecs>0 {
			// if after c.hub.maxRingSecs the callee has NOT picked up the call, callee will be disconnected
			c.hub.setDeadline(c.hub.maxRingSecs,"serveWs ringsecs")
		}
		return
	}

	if cmd=="rtcConnect" {
		return
	}

	if cmd=="cancel" {
		c.peerConHasEnded("cancel")
		return
	}

	if cmd=="calleeHidden" {
		fmt.Printf("%s calleeHidden from %s (%s)\n",c.connType,c.RemoteAddr,payload)
		if(payload=="true") {
			c.isHiddenCallee = true
			c.unHiddenForCaller = ""
		} else {
			c.isHiddenCallee = false
		}

		// forward state of c.isHiddenCallee to globalHubMap
		err := SetCalleeHiddenState(c.hub.calleeID, c.isHiddenCallee)
		if err != nil {
			fmt.Printf("# serveWs SetCalleeHiddenState id=%s %v err=%v\n",c.hub.calleeID,c.isHiddenCallee,err)
		}

		// store dbUser after set/clear isHiddenCallee in dbUser.Int2&1
		var dbUser DbUser
		//userKey := fmt.Sprintf("%s_%d",c.hub.calleeID,c.hub.registrationStartTime)
		userKey := c.hub.calleeID + "_" + strconv.FormatInt(int64(c.hub.registrationStartTime),10)

		err = kvMain.Get(dbUserBucket, userKey, &dbUser)
		if err!=nil {
			fmt.Printf("# serveWs calleeHidden db=%s bucket=%s getX key=%v err=%v\n",
				dbMainName, dbUserBucket, userKey, err)
		} else {
			if c.isHiddenCallee {
				dbUser.Int2 |= 1
			} else {
				dbUser.Int2 &= ^1
			}
			fmt.Printf("%s calleeHidden store dbUser calleeID=%s isHiddenCallee=%v (%d)\n",
				c.connType, c.hub.calleeID, c.isHiddenCallee, dbUser.Int2)
			err := kvMain.Put(dbUserBucket, userKey, dbUser, true) // skipConfirm
			if err!=nil {
				fmt.Printf("# serveWs calleeHidden db=%s bucket=%s put key=%v err=%v\n",
					dbMainName, dbUserBucket, userKey, err)
			} else {
				fmt.Printf("%s calleeHidden db=%s bucket=%s put key=%v OK\n",
					c.connType, dbMainName, dbUserBucket, userKey)

				// this was used for verification only
				//var dbUser2 DbUser
				//err := kvMain.Get(dbUserBucket, userKey, &dbUser2)
				//if err!=nil {
				//	fmt.Printf("# serveWs calleeHidden verify db=%s bucket=%s getX key=%v err=%v\n",
				//		dbMainName, dbUserBucket, userKey, err)
				//} else {
				//	fmt.Printf("serveWs calleeHidden verify userKey=%v isHiddenCallee=%v (%d %v)\n",
				//		userKey, c.isHiddenCallee, dbUser2.Int2, dbUser2.PremiumLevel)
				//}
			}
		}
		return
	}

	if cmd=="pickupWaitingCaller" {
		// for callee only
		// payload = ip:port
		callerAddrPort := payload
		fmt.Printf("%s pickupWaitingCaller from %s (%s)\n", c.connType, c.RemoteAddr, callerAddrPort)
		// this will end the standing xhr call by the caller in main.go
		waitingCallerChanMap[callerAddrPort] <- 1
		return
	}

	if cmd=="deleteCallWhileInAbsence" {
		// for callee only: payload = ip:port:callTime
		callerAddrPortPlusCallTime := payload
		fmt.Printf("%s deleteCallWhileInAbsence from %s callee=%s (payload=%s)\n",
			c.connType, c.RemoteAddr, c.hub.calleeID, callerAddrPortPlusCallTime)

		// remove this call from dbMissedCalls for c.hub.calleeID
		// first: load dbMissedCalls for c.hub.calleeID
		var callsWhileInAbsence []CallerInfo
		err := kvCalls.Get(dbMissedCalls,c.hub.calleeID,&callsWhileInAbsence)
		if err!=nil {
			fmt.Printf("# serveWs deleteCallWhileInAbsence (%s) failed to read dbMissedCalls\n",c.hub.calleeID)
		}
		if callsWhileInAbsence!=nil {
			//fmt.Printf("serveWs deleteCallWhileInAbsence (%s) found %d entries\n",
			//	c.hub.calleeID, len(callsWhileInAbsence))
			// search for callerIP:port + CallTime == callerAddrPortPlusCallTime
			for idx := range callsWhileInAbsence {
				//id := fmt.Sprintf("%s_%d",callsWhileInAbsence[idx].AddrPort,callsWhileInAbsence[idx].CallTime)
				id := callsWhileInAbsence[idx].AddrPort + "_" +
					 strconv.FormatInt(int64(callsWhileInAbsence[idx].CallTime),10)
				//fmt.Printf("deleteCallWhileInAbsence %s compare (%s==%s)\n", callerAddrPortPlusCallTime, id)
				if id == callerAddrPortPlusCallTime {
					//fmt.Printf("serveWs deleteCallWhileInAbsence idx=%d\n",idx)
					callsWhileInAbsence = append(callsWhileInAbsence[:idx], callsWhileInAbsence[idx+1:]...)
					// store modified dbMissedCalls for c.hub.calleeID
					err = kvCalls.Put(dbMissedCalls, c.hub.calleeID, callsWhileInAbsence, false)
					if err!=nil {
						fmt.Printf("# serveWs deleteCallWhileInAbsence (%s) fail store dbMissedCalls\n",
							c.hub.calleeID)
					}
					// send modified callsWhileInAbsence to callee
					json, err := json.Marshal(callsWhileInAbsence)
					if err != nil {
						fmt.Printf("# serveWs deleteCallWhileInAbsence (%s) failed json.Marshal\n",
							c.hub.calleeID)
					} else {
						//fmt.Printf("deleteCallWhileInAbsence send callsWhileInAbsence %s\n", c.hub.calleeID)
						c.hub.CalleeClient.Write([]byte("missedCalls|"+string(json)))
					}
					break
				}
			}
		}
		return
	}

	if cmd=="pickup" {
		// this is sent by the callee client
		if !c.isConnectedToPeer.Get() {
			fmt.Printf("# %s ignoring pickup while not peerConnected rip=%s\n", c.connType, c.RemoteAddr)
			return
		}

		//fmt.Printf("%s pickup online=%v peerCon=%v\n",
		//	c.connType, c.isOnline.Get(), c.isConnectedToPeer.Get())
		c.hub.lastCallStartTime = time.Now().Unix()

		if c.hub.CallerClient!=nil {
			// deliver "pickup" to the caller
			if logWantedFor("wscall") {
				fmt.Printf("%s forward pickup to caller %s\n", c.connType, c.hub.calleeID)
			}
			c.hub.CallerClient.Write(message)
		}

		// switching from maxRingSecs deadline to maxTalkSecsIfNoP2p deadline
		if (c.hub.LocalP2p && c.hub.RemoteP2p) || c.hub.maxTalkSecsIfNoP2p<=0 {
			// full p2p con: remove maxRingSecs deadline and do NOT replace it with any talktimer deadline
			//fmt.Printf("skip setDeadline maxTalkSecsIfNoP2p %v %v\n", c.hub.LocalP2p, c.hub.RemoteP2p)
			c.hub.setDeadline(0,"pickup")
		} else {
			// relayed con: clear maxRingSecs deadline and replace it with maxTalkSecsIfNoP2p deadline
			//fmt.Printf("%s setDeadline maxTalkSecsIfNoP2p %v %v\n", c.connType, c.hub.LocalP2p, c.hub.RemoteP2p)
			c.hub.setDeadline(c.hub.maxTalkSecsIfNoP2p,"pickup")

			// deliver max talktime to both clients
			//c.hub.doBroadcast([]byte("sessionDuration|"+fmt.Sprintf("%d",c.hub.maxTalkSecsIfNoP2p)))
			c.hub.doBroadcast([]byte("sessionDuration|"+strconv.FormatInt(int64(c.hub.maxTalkSecsIfNoP2p),10)))
		}
		return
	}

	if cmd=="check" {
		// send a payload back to client
		//fmt.Printf("wsSend confirm\n")
		sendCmd := "confirm|"+payload
		c.Write([]byte(sendCmd))
		return
	}

	if cmd=="heartbeat" {
		// client sends this only to see if it gets an error
		if logWantedFor("heartbeat") {
			fmt.Printf("received client heartbeat (%s)\n",c.hub.calleeID)
		}
		return
	}

	if cmd=="log" {
		fmt.Printf("%s log %s %s rip=%s\n", c.connType, payload, c.hub.calleeID, c.RemoteAddr)
		tok := strings.Split(payload, " ")
		if len(tok)>=3 {
			// callee Connected p2p/p2p port=10001 id=3949620073
			// TODO make extra sure this "log" payload is valid (not malformed)
			if strings.TrimSpace(tok[1])=="Connected" || strings.TrimSpace(tok[1])=="Incoming" ||
					strings.TrimSpace(tok[1])=="ConForce" { // test-caller-client
				tok2 := strings.Split(strings.TrimSpace(tok[2]), "/")
				if len(tok2)>=2 {
					//fmt.Printf("%s tok2[0]=%s tok2[1]=%s\n", c.connType, tok2[0], tok2[1])
					if tok2[0]=="p2p" {
						c.hub.LocalP2p = true
					}
					if tok2[1]=="p2p" {
						c.hub.RemoteP2p = true
					}
					c.isConnectedToPeer.Set(true)
					if !c.isCallee {
						// when the caller sends "log", the callee also becomes peerConnected
						c.hub.CalleeClient.isConnectedToPeer.Set(true)

						if strings.TrimSpace(tok[1])=="ConForce" {
							// test-caller sends this msg to callee, bc test-clients do not really connect p2p
							c.hub.CalleeClient.Write([]byte("callerConnect|"))

						} else if strings.TrimSpace(tok[1])=="Connected" {
							// caller is reporting peerCon: both peers are now directly connected
							readConfigLock.RLock()
							myDisconCalleeOnPeerConnected := disconCalleeOnPeerConnected
							myDisconCallerOnPeerConnected := disconCallerOnPeerConnected
							readConfigLock.RUnlock()
							if myDisconCalleeOnPeerConnected || myDisconCallerOnPeerConnected {
								time.Sleep(20 * time.Millisecond)
							}
							if myDisconCalleeOnPeerConnected {
								fmt.Printf("%s disconCalleeOnPeerConnected %s\n", c.connType, c.hub.calleeID)
								//c.hub.doUnregister(c,"disconCalleeOnPeerConnected")
								c.hub.CalleeClient.Close("disconCalleeOnPeerConnected")
							}
							if myDisconCallerOnPeerConnected {
								if c.hub.CallerClient != nil {
									fmt.Printf("%s disconCallerOnPeerConnected %s\n", c.connType, c.hub.calleeID)
									c.hub.CallerClient.Close("disconCallerOnPeerConnected")
								}
							}
						}
					}
				}
			}
		}
		//fmt.Printf("parsed p2p (%v/%v)\n", c.hub.LocalP2p, c.hub.RemoteP2p)
		return
	}

	if !c.isCallee {
		// client is caller
		if !c.hub.CalleeClient.isOnline.Get() {
			// but there is no callee
			fmt.Printf("# %s client %s without callee not allowed (%s)\n",
				c.connType, c.RemoteAddr, cmd)
			c.Write([]byte("cancel|busy"))
			return
		}
		if c.hub.CallerClient!=nil && c.hub.CallerClient!=c {
			// but there is already another caller-client
			fmt.Printf("# %s client %s is 2nd client not allowed\n",
				c.connType, c.RemoteAddr)
			c.Write([]byte("cancel|busy"))
			return
		}
	}

	if logWantedFor("wsreceive") {
		fmt.Printf("%s recv %s|%s callee=%v rip=%s\n",
			c.connType, cmd, payload, c.isCallee, c.RemoteAddr)
	}
	if len(payload)>0 {
		if c.isCallee {
			if c.hub.CallerClient!=nil {
				c.hub.CallerClient.Write(message)
			}
		} else {
			if c.hub.CalleeClient!=nil {
				c.hub.CalleeClient.Write(message)
			}
		}
	} else {
		//fmt.Printf("%s %s with no payload\n",c.connType,cmd)
	}
}

func (c *WsClient) Write(b []byte) error {
	max := len(b); if max>22 { max = 22 }
	if !c.isOnline.Get() {
		//fmt.Printf("# %s Write (%s) to %s callee=%v peerCon=%v NOT ONLINE\n",
		//	c.connType, b[:max], c.hub.calleeID, c.isCallee, c.isConnectedToPeer.Get())
		return ErrWriteNotConnected
	}
	if logWantedFor("wswrite") {
		fmt.Printf("%s Write (%s) to %s callee=%v peerCon=%v\n",
			c.connType, b[:max], c.hub.calleeID, c.isCallee, c.isConnectedToPeer.Get())
	}

	// TODO SetWriteDeadline ?
	c.wsConn.WriteMessage(websocket.TextMessage, b)

	// we sent data to the client, so no need to send a ping now; next ping in pingPeriod (in 54 see)
	max = len(b); if max>10 { max=10 }
	c.setPingDeadline(pingPeriod,"sentdata ("+string(b[:max])+")")
	return nil
}

func (c *WsClient) peerConHasEnded(comment string) {
	// the peerConnection has ended, either bc one side has sent cmd "cancel|..."
	// or bc one side has unregistered
	c.hub.setDeadline(0,comment)
	if c.isConnectedToPeer.Get() {
		fmt.Printf("%s peerConHasEnded %s rip=%s (%s)\n", c.connType, c.hub.calleeID, c.RemoteAddr, comment)
		c.isConnectedToPeer.Set(false)
		if c.isCallee {
			if c.hub.CallerClient!=nil {
				c.hub.CallerClient.isConnectedToPeer.Set(false)
			}
		} else {
			if c.hub.CalleeClient!=nil {
				c.hub.CalleeClient.isConnectedToPeer.Set(false)
			}
		}
	}

	// clear callerIp from hub.ConnectedCallerIp
	c.hub.HubMutex.Lock()
	if c.hub.lastCallStartTime>0 {
		c.hub.processTimeValues()
		c.hub.lastCallStartTime = 0
	}
	c.hub.HubMutex.Unlock()
	err := StoreCallerIpInHubMap(c.hub.calleeID, "", false)
	if err!=nil {
		// err "key not found" means: callee has already signed off - can be ignored
		if strings.Index(err.Error(),"key not found")<0 {
			fmt.Printf("# %s peerConHasEnded %s clear callerIpInHub err=%v\n",
				c.connType, c.hub.calleeID, err)
		}
	} else {
		if logWantedFor("hub") {
			fmt.Printf("%s peerConHasEnded %s clear callerIpInHub no err\n",
				c.connType, c.hub.calleeID)
		}
	}

	// TODO: why not: c.hub.CallerClient=nil
	// TODO: why not: c.hub.CallerClient.RemoteAddr = ""
	// TODO: why not: c.hub.CallerClient.isOnline.Put(false)
}

func (c *WsClient) setPingDeadline(secs int, comment string) {
	if logWantedFor("ping") {
		fmt.Printf("ping set secs %d (%s)\n",secs,comment)
	}
	timeNow := time.Now()
	if c.pingDone!=nil {
		if secs>0 {
			lastTimerRunningMS := timeNow.Sub(c.pingStart).Milliseconds()
			if lastTimerRunningMS < 3000 {
				if logWantedFor("ping") {
					fmt.Printf("ping ignore new %d\n",lastTimerRunningMS)
				}
				return
			}
		}
	}
	if secs==0 || !c.isOnline.Get() {
		if c.pingDone!=nil {
			if logWantedFor("ping") {
				fmt.Printf("ping close old\n")
			}
			close(c.pingDone)
			c.pingDone=nil
		}
		return
	}
	pingDur := secs + rand.Intn(4)
	if logWantedFor("ping") {
		fmt.Printf("pingDur %d secs\n", pingDur)
	}
	c.pingStart = timeNow
	if c.pingDone==nil {
		c.pingDone = make(chan struct{})
	}
	go func() {
		select {
		case <-time.After(time.Duration(pingDur) * time.Second):
			if c.isOnline.Get() {
				c.wsConn.SetWriteDeadline(time.Now().Add(writeWait))
				err := c.wsConn.WriteMessage(websocket.PingMessage, nil)
				if err != nil {
					if strings.Index(err.Error(),"broken pipe")<0 && strings.Index(err.Error(),"EOF")<0 {
						fmt.Printf("# setPingDeadline ping sent err=%v (%s)\n", err, comment)
					}
					return
				}
				atomic.AddInt64(&pingSentCounter, 1)
				c.setPingDeadline(secs,"restart")
			}
		case <-c.pingDone:
			if logWantedFor("ping") {
				fmt.Println("ping done release")
			}
		}
	}()
}

func (c *WsClient) Close(reason string) {
	// close this client
	c.setPingDeadline(0,"Close "+reason)
	if c.isOnline.Get() {
		if logWantedFor("wsclose") {
			fmt.Printf("wsclient Close %s callee=%v %s\n",
				c.hub.calleeID, c.isCallee, reason)
		}
		c.wsConn.WriteMessage(websocket.CloseMessage, nil)
		c.wsConn.Close()
		if logWantedFor("wsclose") {
			fmt.Printf("wsclient wsConn.Close done %s callee=%v\n", c.hub.calleeID, c.isCallee)
		}
	}
}

