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
	"github.com/mehrvarz/webcall/skv"
	"github.com/mehrvarz/webcall/rkv"
	"github.com/lesismal/nbio/nbhttp/websocket"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 20 * time.Second // see: "<-pingTicker.C"

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 //* time.Second	// see: c.conn.SetReadDeadline(time.Now().Add(pongWait))

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10 // =54 see: time.NewTicker(pingPeriod)
)

var ErrWriteNotConnected = errors.New("Write not connected")

type WsClient struct {
	hub *Hub
	wsConn *websocket.Conn
	authenticationShown bool // whether to show "pion auth for client (%v) SUCCESS"
	isCallee bool
	isOnline rkv.AtomBool	// connected to signaling server
	isConnectedToPeer rkv.AtomBool
	isHiddenCallee bool // if set, we don't report callee as online; see: getOnlinePort()
	unHiddenForCaller string
	RemoteAddr string // without port
	userAgent string
	calleeID string // local ID
	storeOnCloseDone bool
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

		if hub.maxRingSecs<=0 {
			hub.setDeadline(0,"serveWs ringsecs") // unlimited ringtime
		} else {
			hub.setDeadline(hub.maxRingSecs,"serveWs ringsecs") // limited ringtime
		}
	} else {
		// caller client (2nd client)
		if logWantedFor("wsclient") {
			fmt.Printf("%s con caller id=%s wsCliID=%d rip=%s\n",
				client.connType, hub.calleeID, wsClientID64, client.RemoteAddr)
		}

		hub.CallerClient = client
		hub.ConnectedCallerIp = wsConn.RemoteAddr().String()
		if rtcdb!="" {
			err := rkv.StoreCallerIpInHubMap(hub.calleeID,wsConn.RemoteAddr().String(), false)
			if err!=nil {
				fmt.Printf("# %s rkv.StoreCallerIpInHubMap err=%v\n", client.connType, err)
			}
		}
	}
	hub.HubMutex.Unlock()

	// send a ping every pingPeriod secs
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
	// check message integrity
	// cmd's can not be longer than 32 chars (f.i. "12345#deleteCallWhileInAbsence" has 30)
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

	// even if a "|" pipe char was found in the expected position
	// we still need to be suspicious with the data inside message
	//fmt.Printf("serveWs found pipe at %d checkLen=%d idxPipe=%d (%s)\n",
	//	len(tok),checkLen,idxPipe,string(message[:checkLen]))

	cmd := tok[0]
	payload := tok[1]
	//max := len(payload); if max>20 { max = 20 }
	//fmt.Printf("%s receive (%s)(%s) led=%d\n",c.connType,cmd,payload[:max],len(payload))

	if cmd=="init" {
		if !c.isCallee {
			// abbruch: only the callee can send "init|"
			fmt.Printf("# serveWs false double callee rip=%s #########\n",c.RemoteAddr)
			// make sure this 2nd callee gets canceled
			c.Write([]byte("cancel|busy"))
			return
		}

		c.hub.HubMutex.Lock()
		c.hub.CalleeLogin.Set(true)
		c.hub.HubMutex.Unlock()

		// beim betrieb hinter rtcrp ist c.conn.RemoteAddr() die addr des rtcrp
		// must use r.Header.Get("X-Real-IP") if available
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
		c.storeOnCloseDone = false

		// send list of waitingCaller and missedCalls to premium callee client
		//fmt.Printf("%s c.PremiumLevel=%d\n",c.connType,c.PremiumLevel)
		if c.PremiumLevel>=1 {
			var waitingCallerSlice []CallerInfo
			err := kvCalls.Get(dbWaitingCaller,c.calleeID,&waitingCallerSlice)
			if err!=nil {
				// we can ignore this
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

	} else if cmd=="callerDescription" {
		// caller starting a call - payload is JSON.stringify(localDescription)
		if logWantedFor("wscall") {
			fmt.Printf("%s callerDescription (call attempt) from %s to %s\n",
				c.connType,c.RemoteAddr,c.calleeID)
			//fmt.Printf("%s callerDescription payload=%s\n",c.connType,payload)
		}

		if c.hub.callerID!="" && c.hub.callerNickname!="" {
			// send callerNickname so that it arrives AFTER "callerDescription" itself
			go func() {
				time.Sleep(200 * time.Millisecond)
				sendCmd := "callerInfo|"+c.hub.callerID+":"+c.hub.callerNickname
				// send this directly to the callee (the other side)
				if c.hub.CalleeClient.Write([]byte(sendCmd)) != nil {
					return
				}
			}()
		}
		c.hub.CalleeClient.Write(message)

		// exchange each others useragent
		//fmt.Printf("%s send callee ua to caller (%s)\n",c.connType,c.hub.CalleeClient.userAgent)
		c.hub.CallerClient.Write([]byte("ua|"+c.hub.CalleeClient.userAgent))
		//fmt.Printf("%s send caller ua to callee (%s)\n",c.connType,c.hub.CallerClient.userAgent)
		c.hub.CalleeClient.Write([]byte("ua|"+c.hub.CallerClient.userAgent))
		return

	} else if cmd=="rtcConnect" {
		return

	} else if cmd=="cancel" {
		c.peerConHasEnded()
		return

	} else if cmd=="calleeHidden" {
		// for premium callee only
		fmt.Printf("%s calleeHidden from %s (%s)\n",c.connType,c.RemoteAddr,payload)
		if(payload=="true") {
			c.isHiddenCallee = true
			c.unHiddenForCaller = ""
		} else {
			c.isHiddenCallee = false
		}

		// forward state of c.isHiddenCallee to globalHubMap
		c.hub.HubMutex.Lock()
		c.hub.IsCalleeHidden = c.isHiddenCallee
		c.hub.HubMutex.Unlock()
		var err error
		if rtcdb=="" {
			err = SetCalleeHiddenState(c.hub.calleeID, c.isHiddenCallee)
		} else {
			err = rkv.SetCalleeHiddenState(c.hub.calleeID, c.isHiddenCallee)
		}
		if err != nil {
			fmt.Printf("# serveWs SetCalleeHiddenState id=%s %v err=%v\n",c.hub.calleeID,c.isHiddenCallee,err)
		}

		// store dbUser after set/clear isHiddenCallee in dbUser.Int2&1
		var dbUser skv.DbUser
		userKey := fmt.Sprintf("%s_%d",c.hub.calleeID,c.hub.registrationStartTime)
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

				// this is for verification only
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

	} else if cmd=="pickupWaitingCaller" {
		// for callee only
		// payload = ip:port
		callerAddrPort := payload
		fmt.Printf("%s pickupWaitingCaller from %s (%s)\n", c.connType, c.RemoteAddr, callerAddrPort)
		// this will end the standing xhr call by the caller in main.go
		waitingCallerChanMap[callerAddrPort] <- 1
		return

	} else if cmd=="deleteCallWhileInAbsence" {
		// for callee only
		// payload = ip:port:callTime
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
				id := fmt.Sprintf("%s_%d",callsWhileInAbsence[idx].AddrPort,callsWhileInAbsence[idx].CallTime)
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

	} else if cmd=="pickup" {
		// this is sent by the callee client
		if !c.isConnectedToPeer.Get() {
			fmt.Printf("# %s ignoring pickup while not peerConnected rip=%s\n", c.connType, c.RemoteAddr)
			return
		}

		//fmt.Printf("%s pickup online=%v peerCon=%v\n",
		//	c.connType, c.isOnline.Get(), c.isConnectedToPeer.Get())
		c.hub.lastCallStartTime = time.Now().Unix()

		// switching from the 1st deadline (offline/ringing duration) 
		// to the 2nd deadline (online duration / talk time)
		if c.hub.LocalP2p && c.hub.RemoteP2p {
			// unlimited talk time
			c.hub.setDeadline(0,"pickup")
			//fmt.Printf("skip setDeadline maxTalkSecsIfNoP2p %v %v\n", c.hub.LocalP2p, c.hub.RemoteP2p)
		} else {
			fmt.Printf("%s setDeadline maxTalkSecsIfNoP2p %v %v\n",
				c.connType, c.hub.LocalP2p, c.hub.RemoteP2p)
			c.hub.setDeadline(c.hub.maxTalkSecsIfNoP2p,"pickup")
			// deliver max talktime; but it must arrive after "pickup"
			go func(duration int) {
				time.Sleep(200 * time.Millisecond)
				c.hub.doBroadcast([]byte("sessionDuration|"+fmt.Sprintf("%d",duration)))
			}(c.hub.maxTalkSecsIfNoP2p)
		}

		// deliver "pickup" to the caller
		if logWantedFor("wscall") {
			fmt.Printf("%s forward pickup to caller %s\n", c.connType, c.hub.calleeID)
		}
		c.hub.CallerClient.Write(message)

		// callee has become peer connected
		readConfigLock.RLock()
		if disconnectCalleesWhenPeerConnected {
			readConfigLock.RUnlock()
			time.Sleep(20 * time.Millisecond)
			fmt.Printf("%s disconnectCalleesWhenPeerConnected %s\n",
				c.connType, c.hub.calleeID)
			c.hub.doUnregister(c,"disconnectCalleesWhenPeerConnected")
		} else {
			readConfigLock.RUnlock()
		}
		return

	} else if cmd=="check" {
		// send a msg back to the requesting client
		//fmt.Printf("wsSend confirm\n")
		sendCmd := "confirm|"+payload
		c.Write([]byte(sendCmd))
		return

	} else if cmd=="heartbeat" {
		// clients send this only to see if they get an error
		if logWantedFor("heartbeat") {
			fmt.Printf("received client heartbeat (%s)\n",c.hub.calleeID)
		}
		return

	} else if cmd=="log" {
		fmt.Printf("%s log %s %s rip=%s\n", c.connType, payload, c.hub.calleeID, c.RemoteAddr)
		// parse fpr p2p
		tok := strings.Split(payload, " ")
		if len(tok)>=3 {
			// callee Connected p2p/p2p port=10001 id=3949620073
			// TODO make sure this "log" parsing will not crash on malformed payload
			if strings.TrimSpace(tok[1])=="Connected" || strings.TrimSpace(tok[1])=="Incoming" ||
					strings.TrimSpace(tok[1])=="ConForce" { // test-caller-client command to fake p2p-connect
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
							// caller sends this msg to callee, bc the test-clients do not really connect p2p
							c.hub.CalleeClient.Write([]byte("callerConnect|"))

						} else if strings.TrimSpace(tok[1])=="Connected" {
							// this is the caller reporting peerCon
							readConfigLock.RLock()
							if disconnectCallersWhenPeerConnected {
								if logWantedFor("wscall") {
									fmt.Printf("%s caller %s peer con -> ws-disconnect\n",
										c.connType, c.hub.calleeID)
								}
								c.hub.doUnregister(c,"force caller discon")
							}
							readConfigLock.RUnlock()
						}
					}
				}
			}
		} else {
			//fmt.Printf("_log len(tok)=%d\n", len(tok))
		}

		//fmt.Printf("parsed p2p (%v/%v)\n", c.hub.LocalP2p, c.hub.RemoteP2p)
		return

	} else {
		if !c.isCallee {
			// a caller client
			if !c.hub.CalleeClient.isOnline.Get() {
				// this is a client; but there is no other callee -> abort
				fmt.Printf("# %s client %s without callee not allowed (%s) ######\n",
					c.connType, c.RemoteAddr, cmd)
				// make sure this client gets canceled
				c.Write([]byte("cancel|busy"))
				return
			}
			if c.hub.CallerClient!=c {
				// this is a caller client; but there is already another caller-client (now two) -> abort
				// TODO this does not prevent two clients (without an callee)
				fmt.Printf("# %s client %s is 2nd client not allowed ######\n", c.connType, c.RemoteAddr)
				c.Write([]byte("cancel|busy"))
				return
			}
		}

		if logWantedFor("wsreceive") {
			fmt.Printf("recv %s|%s callee=%v rip=%s\n",
				cmd, payload, c.isCallee, c.RemoteAddr)
		}
	}

	if len(payload)>0 {
		//fmt.Printf("serveWs %s payload len=%d\n",cmd,len(message))
		// TODO can we trust the content of message
		if c.isCallee {
			c.hub.CallerClient.Write(message)
		} else {
			c.hub.CalleeClient.Write(message)
		}
	} else {
		//fmt.Printf("serveWs %s with no payload\n",cmd)
	}

	//fmt.Printf("# %s %s unhandled cmd (%s)\n", c.connType, c.hub.calleeID, cmd)
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

func (c *WsClient) peerConHasEnded() {
	// the peerConnection has ended either bc the callee has unregistered
	// or bc the callee has sent cmd "cancel|..."
	if c.isConnectedToPeer.Get() {
		fmt.Printf("%s peerConHasEnded %s rip=%s\n", c.connType, c.hub.calleeID, c.RemoteAddr)
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

		// clear the callerIp from globhub.ConnectedCallerIp
		// so this callee can be called again
		c.hub.HubMutex.Lock()
		c.hub.ConnectedCallerIp = ""
		if c.hub.lastCallStartTime>0 {
			c.hub.processTimeValues()
			c.hub.lastCallStartTime = 0
		}
		c.hub.HubMutex.Unlock()
		if rtcdb!="" {
			err := rkv.StoreCallerIpInHubMap(c.hub.calleeID,"", false)
			if err!=nil {
				// err "rtcdb key not found" means that callee has already signed off - can be ignored
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
		}
	}
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
					// sometimes getting "write: broken pipe"
					// TODO hangup (unregister?) on error
					// TODO count these errors (either total or per minute)
					return
				}
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

		// NOTE when calling c.wsConn.Close(), nbio will call OnClose(), which will call doUnregister()
		// however OnClose() will 1st call c.isOnline.Set(false) so that when doUnregister() calls this Close()
		// c.wsConn.Close() will NOT be called again
		//if logWantedFor("wsclose") {
		//	fmt.Printf("wsclient wsConn.Close %s callee=%v %s\n",
		//		c.hub.calleeID, c.isCallee, reason)
		//}
		c.wsConn.Close()
		if logWantedFor("wsclose") {
			fmt.Printf("wsclient wsConn.Close done %s callee=%v\n", c.hub.calleeID, c.isCallee)
		}
	}
}

