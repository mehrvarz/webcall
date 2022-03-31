// WebCall Copyright 2022 timur.mobi. All rights reserved.
//
// Method serve() is the Websocket handler for http-to-ws upgrade.
// Method receiveProcess() is the Websocket signaling handler.
// KeepAliveMgr takes care of keeping ws-clients connected.

package main

import (
	"bytes"
	"time"
	"strings"
	"fmt"
	"strconv"
	"errors"
	"encoding/json"
	"net/http"
	"sync/atomic"
	"sync"
	"github.com/mehrvarz/webcall/atombool"
	"github.com/lesismal/nbio/nbhttp/websocket"
)

const (
	pingPeriod = 60
	// we send a ping to the client when we didn't hear from it for pingPeriod secs
	// when we send a ping, we set the time for our next ping in pingPeriod secs after that
	// whenever we receive something from the client (data or a ping or a pong)
	// we reset the time for our next ping to be sent in pingPeriod secs after that moment
	// when pingPeriod expires, it means that we didn't hear from the client for pingPeriod secs
	// so we send our ping
	// and we set SetReadDeadline bc we expect to receive a pong in response within max 30s
	// if there is still no response from the client by then, we consider the client to be dead
	// in other words: we cap the connection if we don't hear from a client for pingPeriod + 30 secs

	// browser clients do not send pings, so it is only the server sending pings
	// new: android clients do not send pings anymore (for powermgmt reasons)
	// now outdated:
	//   android clients send pings to the server every 60 secs and we respond with pongs
	//   since the pingPeriod of android clients is shorter than that of this server,
	//   this server will in practice not send any pings to android clients
	//   say an android client sends a ping, the server sends a pong and shortly after the client reboots
	//   the server will wait for 90s without receiving anything from this client
	//   after 90s the server will send a ping to check the client
	//   after another 20s the server declares the client dead - 100s after the clients last ping
)

var keepAliveMgr *KeepAliveMgr
var ErrWriteNotConnected = errors.New("Write not connected")

type WsClient struct {
	hub *Hub
	wsConn *websocket.Conn
	isOnline atombool.AtomBool	// connected to signaling server
	isConnectedToPeer atombool.AtomBool
	RemoteAddr string // with port
	RemoteAddrNoPort string // no port
	userAgent string // ws UA
	calleeID string
	globalCalleeID string // unique calleeID for multiCallees as key for hubMap[]
	connType string
	callerID string
	callerName string
	clientVersion string
	pingSent uint64
	pongReceived uint64
	pongSent uint64
	pingReceived uint64
	authenticationShown bool // whether to show "pion auth for client (%v) SUCCESS"
	isCallee bool
	clearOnCloseDone bool
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

	if keepAliveMgr==nil {
		keepAliveMgr = NewKeepAliveMgr()
		go keepAliveMgr.Run()
	}

	remoteAddr := r.RemoteAddr
	realIpFromRevProxy := r.Header.Get("X-Real-Ip")
	if realIpFromRevProxy!="" {
		remoteAddr = realIpFromRevProxy
	}

	remoteAddrNoPort := remoteAddr
	idxPort := strings.Index(remoteAddrNoPort,":")
	if idxPort>=0 {
		remoteAddrNoPort = remoteAddrNoPort[:idxPort]
	}

	var wsClientID64 uint64 = 0
	var wsClientData wsClientDataType
	url_arg_array, ok := r.URL.Query()["wsid"]
	if !ok || len(url_arg_array[0]) <= 0{
		return
	}
	wsClientIDstr := strings.ToLower(url_arg_array[0])
	wsClientID64, _ = strconv.ParseUint(wsClientIDstr, 10, 64)
	if wsClientID64<=0 {
		// not valid
		fmt.Printf("# serveWs invalid wsClientIDstr=%s rip=%s url=%s\n",
			wsClientIDstr, remoteAddr, r.URL.String())
		return
	}
	wsClientMutex.Lock()
	wsClientData,ok = wsClientMap[wsClientID64]
	if(ok) {
		// ensure wsClientMap[wsClientID64] will not be removed
		wsClientData.removeFlag = false
		wsClientMap[wsClientID64] = wsClientData
	}
	wsClientMutex.Unlock()
	if !ok {
		// this callee has just exited
		fmt.Printf("serveWs ws=%d does not exist rip=%s url=%s\n",
			wsClientID64, remoteAddr, r.URL.String())
		// TODO why does r.URL start with //
		// url=//timur.mobi:8443/ws?wsid=47639023704
		return
	}

	callerID := ""
	url_arg_array, ok = r.URL.Query()["callerId"]
	if ok && len(url_arg_array[0]) > 0 {
		callerID = strings.ToLower(url_arg_array[0])
	}

	callerName := ""
	url_arg_array, ok = r.URL.Query()["name"]
	if ok && len(url_arg_array[0]) > 0 {
		callerName = url_arg_array[0]
	}
	//fmt.Printf("serve callerID=%s callerName=%s (%v)\n", callerID, callerName, r.URL.Query())

	upgrader := websocket.NewUpgrader()
	//upgrader.EnableCompression = true // TODO
	upgrader.CheckOrigin = func(r *http.Request) bool {
		return true
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("# Upgrade err=%v\n", err)
		return
	}
	wsConn := conn.(*websocket.Conn)
	//wsConn.EnableWriteCompression(true) // TODO

	// the only time browser clients can be expected to send anything, is after we sent a ping
	// this is why we set NO read deadline here; we do it when we send a ping
	wsConn.SetReadDeadline(time.Time{})

	client := &WsClient{wsConn:wsConn}
	client.calleeID = wsClientData.calleeID // this is the local ID
	client.globalCalleeID = wsClientData.globalID
	client.clientVersion = wsClientData.clientVersion
	client.callerID = callerID
	client.callerName = callerName
	if tls {
		client.connType = "serveWss"
	} else {
		client.connType = "serveWs"
	}

	keepAliveMgr.Add(wsConn)
	// set the time for sending the next ping
	keepAliveMgr.SetPingDeadline(wsConn, pingPeriod, client) // now + pingPeriod secs


	hub := wsClientData.hub // set by /login wsClientMap[wsClientID] = wsClientDataType{...}

	upgrader.OnMessage(func(wsConn *websocket.Conn, messageType websocket.MessageType, data []byte) {
		// clear read deadline for now; we set it again when we send the next ping
		wsConn.SetReadDeadline(time.Time{})
		// set the time for sending the next ping
		// so whenever client sends some data, we postpone our next ping by pingPeriod secs
		keepAliveMgr.SetPingDeadline(wsConn, pingPeriod, client) // now + pingPeriod secs

		switch messageType {
		case websocket.TextMessage:
			//fmt.Println("TextMessage:", messageType, string(data), len(data))
			n := len(data)
			if n>0 {
				if logWantedFor("wsreceive") {
					max := n; if max>10 { max = 10 }
					fmt.Printf("%s (%s) received n=%d isCallee=%v (%s)\n",
						client.connType, client.calleeID, n, client.isCallee, data[:max])
				}
				client.receiveProcess(data)
			}
		case websocket.BinaryMessage:
			fmt.Printf("# %s binary dataLen=%d\n", client.connType, len(data))
		}
	})

	upgrader.SetPongHandler(func(wsConn *websocket.Conn, s string) {
		// we received a pong from the client
		if logWantedFor("gotpong") {
			fmt.Printf("gotPong (%s)\n",client.calleeID)
		}
		// clear read deadline for now; we set it again when we send the next ping
		wsConn.SetReadDeadline(time.Time{})
		// set the time for sending the next ping: now + pingPeriod secs
		keepAliveMgr.SetPingDeadline(wsConn, pingPeriod, client) // now + pingPeriod secs
		client.pongReceived++
	})

	upgrader.SetPingHandler(func(wsConn *websocket.Conn, s string) {
		// we received a ping from the client
		if logWantedFor("gotping") {
			fmt.Printf("gotPing (%s)\n",client.calleeID)
		}
		client.pingReceived++
		// clear read deadline for now; we set it again when we send the next ping
		wsConn.SetReadDeadline(time.Time{})
		// set the time for sending the next ping: now + pingPeriod secs
		keepAliveMgr.SetPingDeadline(wsConn, pingPeriod, client) // now + pingPeriod secs
		// send the pong
		wsConn.WriteMessage(websocket.PongMessage, nil)
		atomic.AddInt64(&pongSentCounter, 1)
		client.pongSent++
	})

	wsConn.OnClose(func(c *websocket.Conn, err error) {
		keepAliveMgr.Delete(c)
		client.isOnline.Set(false) // prevents doUnregister() from closing this already closed connection
		if logWantedFor("wsclose") {
			if err!=nil {
				fmt.Printf("%s (%s) onclose isCallee=%v err=%v\n",
					client.connType, client.calleeID, client.isCallee, err)
			} else {
				fmt.Printf("%s (%s) onclose isCallee=%v noerr\n",
					client.connType, client.calleeID, client.isCallee)
			}
		}
		if err!=nil {
			client.hub.doUnregister(client, "OnClose "+err.Error())
		} else {
			client.hub.doUnregister(client, "OnClose")
		}
	})

	hub.HubMutex.Lock()
	client.hub = hub
	client.isOnline.Set(true)
	client.RemoteAddr = remoteAddr
	client.RemoteAddrNoPort = remoteAddrNoPort
	client.userAgent = r.UserAgent()
	client.authenticationShown = false // being used to make sure 'TURN auth SUCCESS' is only shown 1x per client

	if hub.CalleeClient==nil {
		// callee client (1st client)
		if logWantedFor("wsclient") {
			fmt.Printf("%s (%s) con callee ws=%d rip=%s\n", client.connType,
				client.calleeID, wsClientID64, client.RemoteAddr)
		}
		client.isCallee = true
		hub.IsCalleeHidden = wsClientData.dbUser.Int2&1!=0
		hub.IsUnHiddenForCallerAddr = ""

		hub.WsClientID = wsClientID64
		hub.CalleeClient = client
		hub.CallerClient = nil
		hub.ServiceStartTime = time.Now().Unix()
		hub.ConnectedToPeerSecs = 0
		if !strings.HasPrefix(client.calleeID,"random") {
			// get values related to talk- and service-time for this callee from the db
			// so that 1s-ticker can calculate the live remaining time
			hub.ServiceStartTime = wsClientData.dbEntry.StartTime // race?
			hub.ConnectedToPeerSecs = int64(wsClientData.dbUser.ConnectedToPeerSecs)
		}
		hub.CallDurationSecs = 0
		//fmt.Printf("%s talkSecs=%d startTime=%d serviceSecs=%d\n",
		//	client.connType, hub.ConnectedToPeerSecs, hub.ServiceStartTime, hub.ServiceDurationSecs)
	} else if hub.CallerClient==nil {
		// caller client (2nd client)
		if logWantedFor("wsclient") {
			fmt.Printf("%s (%s) con caller ws=%d rip=%s\n",
				client.connType, client.calleeID, wsClientID64, client.RemoteAddr)
		}

		hub.CallDurationSecs = 0

		hub.CallerClient = client

		go func() {
			// incoming caller will get killed if there is no peerConnect after 10 sec
			// (it can take up to 6-8 seconds in some cases for a devices to get fully out of deep sleep)
			time.Sleep(10 * time.Second)
			if hub!=nil && hub.CalleeClient!=nil && !hub.CalleeClient.isConnectedToPeer.Get() {
				if hub.CallerClient!=nil {
					hub.CallerClient = nil
					fmt.Printf("%s (%s) rel caller ws=%d rip=%s\n",
						client.connType, client.calleeID, wsClientID64, client.RemoteAddr)
				}
			}
		}()

	} else {
		// this code should never be reached; 2nd caller should receive "busy" from /online
		fmt.Printf("# %s (%s/%s) CallerClient already set ws=%d rip=%s\n",
			client.connType, client.calleeID, client.globalCalleeID, wsClientID64, client.RemoteAddr)
		//fmt.Printf("# %s existing CallerClient rip=%s ua=%s\n",
		//	client.connType, hub.CallerClient.RemoteAddr, hub.CallerClient.userAgent)
		time.Sleep(500 * time.Millisecond)
		wsConn.WriteMessage(websocket.CloseMessage, nil)
		wsConn.Close()
	}
	hub.HubMutex.Unlock()
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
		//fmt.Printf("# serveWs no pipe char found; abort; checkLen=%d (%s)\n",
		//	checkLen,string(message[:checkLen]))
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
			fmt.Printf("%s init %s callee=%v wsID=%d rip=%s\n",
			c.connType, c.calleeID, c.isCallee, c.hub.WsClientID, c.RemoteAddr)
		}
		// deliver the callee client version number
		readConfigLock.RLock()
		calleeClientVersionTmp := calleeClientVersion
		readConfigLock.RUnlock()
		if c.Write([]byte("sessionId|"+calleeClientVersionTmp)) != nil {
			return
		}
		c.clearOnCloseDone = false
		// send list of waitingCaller and missedCalls to callee client
		var waitingCallerSlice []CallerInfo
		err := kvCalls.Get(dbWaitingCaller,c.calleeID,&waitingCallerSlice)
		if err!=nil {
			// can be ignored
			//fmt.Printf("# serveWs (%s) failed to read dbWaitingCaller err=%v\n", urlID, err)
		}
		// before we send waitingCallerSlice
		// we remove all entries that are older than 10min
		countOutdated:=0
		for idx := range waitingCallerSlice {
			//fmt.Printf("%s (idx=%d of %d)\n", c.connType,idx,len(waitingCallerSlice))
			if idx >= len(waitingCallerSlice) {
				break
			}
			if time.Now().Unix() - waitingCallerSlice[idx].CallTime > 10*60 {
				// remove outdated caller from waitingCallerSlice
				waitingCallerSlice = append(waitingCallerSlice[:idx],
					waitingCallerSlice[idx+1:]...)
				countOutdated++
			}
		}
		if countOutdated>0 {
			fmt.Printf("%s (%s) deleted %d outdated from waitingCallerSlice\n",
				c.connType, c.calleeID, countOutdated)
			err = kvCalls.Put(dbWaitingCaller, c.calleeID, waitingCallerSlice, true) // skipConfirm
			if err!=nil {
				fmt.Printf("# %s (%s) failed to store dbWaitingCaller\n",c.connType,c.calleeID)
			}
		}

		// read dbUser for StoreMissedCalls flag
		var missedCallsSlice []CallerInfo
		userKey := c.calleeID + "_" + strconv.FormatInt(int64(c.hub.registrationStartTime),10)
		var dbUser DbUser
		err = kvMain.Get(dbUserBucket, userKey, &dbUser)
		if err!=nil {
			fmt.Printf("# %s (%s) failed to get dbUser\n",c.connType,c.calleeID)
		} else if(dbUser.StoreMissedCalls) {
			err = kvCalls.Get(dbMissedCalls,c.calleeID,&missedCallsSlice)
			if err!=nil {
				missedCallsSlice = nil
			}
		}

		if len(waitingCallerSlice)>0 || len(missedCallsSlice)>0 {
			//fmt.Printf("%s waitingCallerToCallee (%s) %d %d\n",c.connType,c.calleeID,
			//	len(waitingCallerSlice),len(missedCallsSlice))
			// -> httpServer hubclient.Write()
			waitingCallerToCallee(c.calleeID, waitingCallerSlice, missedCallsSlice, c)
		}

		if c.clientVersion < "0.9.80" {
			//fmt.Printf("%s (%s) clientVersion=%s\n",c.connType,c.calleeID,c.clientVersion)
			// NOTE: msg MUST NOT contain apostroph (') characters
			msg := "WebCall for Android <a href=\"/webcall/update\">v0.9.80 available.</a>"
			fmt.Printf("%s (%s) send status|%s\n",c.connType,c.calleeID,msg)
			c.Write([]byte("status|"+msg))
		}

		return
	}

	if cmd=="dummy" {
		fmt.Printf("%s (%s) dummy %s ip=%s ua=%s\n",
			c.connType, c.calleeID, payload, c.RemoteAddr, c.userAgent)
		return
	}

	if cmd=="callerOffer" {
		// caller starting a call - payload is JSON.stringify(localDescription)
		if logWantedFor("wscall") {
			fmt.Printf("%s callerOffer (call attempt) from %s to %s/%s\n",
				c.connType, c.RemoteAddr, c.calleeID, c.globalCalleeID)
			//fmt.Printf("%s callerOffer payload=%s\n",c.connType,payload)
		}

		if c.hub.CalleeClient.Write(message) != nil {
			return
		}

		if c.hub.CallerClient.callerID!="" || c.hub.CallerClient.callerName!="" {
			// send this directly to the callee: see callee.js if(cmd=="callerInfo")
			sendCmd := "callerInfo|"+c.hub.CallerClient.callerID+":"+c.hub.CallerClient.callerName
			if c.hub.CalleeClient.Write([]byte(sendCmd)) != nil {
				return
			}
		}

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
			// if callee does NOT pickup the call after c.hub.maxRingSecs, callee will be disconnected
			c.hub.setDeadline(c.hub.maxRingSecs,"serveWs ringsecs")
		}

		// this is needed here for turn AuthHandler
		err := StoreCallerIpInHubMap(c.globalCalleeID, c.RemoteAddr, false)
		if err!=nil {
			fmt.Printf("# %s (%s) callerOffer StoreCallerIp rip=%s err=%v\n",
				c.connType, c.globalCalleeID, c.RemoteAddr, err)
		} else {
			fmt.Printf("%s (%s) callerOffer StoreCallerIp rip=%s\n",
				c.connType, c.globalCalleeID, c.RemoteAddr)
		}

		return
	}

	if cmd=="rtcConnect" {
		return
	}

	if cmd=="cancel" {
		//fmt.Printf("%s (%s) cmd=cancel payload=%s rip=%s\n",c.connType,c.calleeID,payload,c.RemoteAddr)
		c.peerConHasEnded("cancel")
		return
	}

	if cmd=="calleeHidden" {
		//fmt.Printf("%s cmd=calleeHidden from %s (%s)\n",c.connType,c.RemoteAddr,payload)
		if(payload=="true") {
			c.hub.IsCalleeHidden = true
		} else {
			c.hub.IsCalleeHidden = false
		}
		c.hub.IsUnHiddenForCallerAddr = ""

		// forward state of c.isHiddenCallee to globalHubMap
		err := SetCalleeHiddenState(c.calleeID, c.hub.IsCalleeHidden)
		if err != nil {
			fmt.Printf("# serveWs SetCalleeHiddenState id=%s %v err=%v\n",c.calleeID,c.hub.IsCalleeHidden,err)
		}

		// read dbUser for IsCalleeHidden flag
		// store dbUser after set/clear IsCalleeHidden in dbUser.Int2&1
		userKey := c.calleeID + "_" + strconv.FormatInt(int64(c.hub.registrationStartTime),10)
		var dbUser DbUser
		err = kvMain.Get(dbUserBucket, userKey, &dbUser)
		if err!=nil {
			fmt.Printf("# serveWs cmd=calleeHidden db=%s bucket=%s getX key=%v err=%v\n",
				dbMainName, dbUserBucket, userKey, err)
		} else {
			if c.hub.IsCalleeHidden {
				dbUser.Int2 |= 1
			} else {
				dbUser.Int2 &= ^1
			}
			fmt.Printf("%s callee=%s set hidden=%v\n", c.connType, c.calleeID, c.hub.IsCalleeHidden)
			err := kvMain.Put(dbUserBucket, userKey, dbUser, true) // skipConfirm
			if err!=nil {
				fmt.Printf("# serveWs calleeHidden db=%s bucket=%s put key=%v err=%v\n",
					dbMainName, dbUserBucket, userKey, err)
			} else {
				//fmt.Printf("%s calleeHidden db=%s bucket=%s put key=%v OK\n",
				//	c.connType, dbMainName, dbUserBucket, userKey)

				// this was used for verification only
				//var dbUser2 DbUser
				//err := kvMain.Get(dbUserBucket, userKey, &dbUser2)
				//if err!=nil {
				//	fmt.Printf("# serveWs calleeHidden verify db=%s bucket=%s getX key=%v err=%v\n",
				//		dbMainName, dbUserBucket, userKey, err)
				//} else {
				//	fmt.Printf("serveWs calleeHidden verify userKey=%v isHiddenCallee=%v (%d)\n",
				//		userKey, c.hub.IsCalleeHidden, dbUser2.Int2)
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
		// this will end the frozen xhr call by the caller in httpNotifyCallee.go (see: case <-c)
		waitingCallerChanMap[callerAddrPort] <- 1
		return
	}

	if cmd=="deleteMissedCall" {
		// for callee only: payload = ip:port:callTime
		callerAddrPortPlusCallTime := payload
		//fmt.Printf("%s deleteMissedCall from %s callee=%s (payload=%s)\n",
		//	c.connType, c.RemoteAddr, c.calleeID, callerAddrPortPlusCallTime)

		// remove this call from dbMissedCalls for c.calleeID
		// first: load dbMissedCalls for c.calleeID
		var missedCallsSlice []CallerInfo
		userKey := c.calleeID + "_" + strconv.FormatInt(int64(c.hub.registrationStartTime),10)
		var dbUser DbUser
		err := kvMain.Get(dbUserBucket, userKey, &dbUser)
		if err!=nil {
			fmt.Printf("# %s (%s) failed to get dbUser\n",c.connType,c.calleeID)
		} else if(dbUser.StoreMissedCalls) {
			err = kvCalls.Get(dbMissedCalls,c.calleeID,&missedCallsSlice)
			if err!=nil {
				missedCallsSlice = nil
				fmt.Printf("# serveWs deleteMissedCall (%s) failed to read dbMissedCalls\n",c.calleeID)
			}
		}
		if missedCallsSlice!=nil {
			//fmt.Printf("serveWs deleteMissedCall (%s) found %d entries\n",
			//	c.calleeID, len(missedCallsSlice))
			// search for callerIP:port + CallTime == callerAddrPortPlusCallTime
			for idx := range missedCallsSlice {
				//id := fmt.Sprintf("%s_%d",missedCallsSlice[idx].AddrPort,missedCallsSlice[idx].CallTime)
				id := missedCallsSlice[idx].AddrPort + "_" +
					 strconv.FormatInt(int64(missedCallsSlice[idx].CallTime),10)
				//fmt.Printf("deleteMissedCall %s compare (%s==%s)\n", callerAddrPortPlusCallTime, id)
				if id == callerAddrPortPlusCallTime {
					//fmt.Printf("serveWs deleteMissedCall idx=%d\n",idx)
					missedCallsSlice = append(missedCallsSlice[:idx], missedCallsSlice[idx+1:]...)
					// store modified dbMissedCalls for c.calleeID
					err := kvCalls.Put(dbMissedCalls, c.calleeID, missedCallsSlice, false)
					if err!=nil {
						fmt.Printf("# serveWs deleteMissedCall (%s) fail store dbMissedCalls\n", c.calleeID)
					}
					// send modified missedCallsSlice to callee
					json, err := json.Marshal(missedCallsSlice)
					if err != nil {
						fmt.Printf("# serveWs deleteMissedCall (%s) failed json.Marshal\n", c.calleeID)
					} else {
						//fmt.Printf("deleteMissedCall send missedCallsSlice %s\n", c.calleeID)
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

		c.hub.lastCallStartTime = time.Now().Unix()
		if logWantedFor("hub") {
			fmt.Printf("%s (%s) pickup online=%v peerCon=%v starttime=%d\n",
				c.connType, c.calleeID, c.isOnline.Get(), c.isConnectedToPeer.Get(), c.hub.lastCallStartTime)
		}

		if c.hub.CallerClient!=nil {
			// deliver "pickup" to the caller
			if logWantedFor("wscall") {
				fmt.Printf("%s forward pickup to caller %s\n", c.connType, c.calleeID)
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

	if cmd=="heartbeat" {
		// ignore: clients may send this to check the connection to the server
		return
	}

	if cmd=="check" {
		// clients may send this to check communication with the server
		// server sends payload back to client
		c.Write([]byte("confirm|"+payload))
		return
	}

	if cmd=="log" {
		if c==nil {
			fmt.Printf("# peer c==nil\n")
		} else if c.hub==nil {
			fmt.Printf("# %s (%s) peer c.hub==nil ver=%s\n", c.connType, c.calleeID, c.clientVersion)
		} else if c.hub.CallerClient==nil {
			fmt.Printf("# %s (%s) peer %s c.hub.CallerClient==nil ver=%s\n",
				c.connType, c.calleeID, payload, c.clientVersion)
		} else {
			fmt.Printf("%s (%s) peer %s (%s:%s) ver=%s\n", c.connType, c.calleeID, payload,
				c.hub.CallerClient.callerID, c.hub.CallerClient.callerName, c.clientVersion)
			// callerID + callerName are forward to callee via "callerInfo|" on receipt of "callerOffer"
		}
		tok := strings.Split(payload, " ")
		if len(tok)>=3 {
			// callee Connected p2p/p2p port=10001 id=3949620073
			// TODO make extra sure this "log" payload is not malformed
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
							// test-caller sends this msg to callee, test-clients do not really connect p2p
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
								fmt.Printf("%s disconnect callee %s rip=%s\n",
									c.connType, c.calleeID, c.RemoteAddr)
								c.hub.CalleeClient.Close("disconCalleeOnPeerConnected")
							}
							if myDisconCallerOnPeerConnected {
								if c.hub.CallerClient != nil {
									fmt.Printf("%s (%s) caller disconnect rip=%s\n",
										c.connType, c.calleeID, c.RemoteAddr)
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
		//	c.connType, b[:max], c.calleeID, c.isCallee, c.isConnectedToPeer.Get())
		return ErrWriteNotConnected
	}
	if logWantedFor("wswrite") {
		fmt.Printf("%s Write (%s) to %s callee=%v peerCon=%v\n",
			c.connType, b[:max], c.calleeID, c.isCallee, c.isConnectedToPeer.Get())
	}

	c.wsConn.WriteMessage(websocket.TextMessage, b)
	return nil
}

func (c *WsClient) peerConHasEnded(comment string) {
	// the peerConnection has ended, either bc one side has sent cmd "cancel"
	// or bc callee has unregistered
	c.hub.setDeadline(0,comment)
	if c.isConnectedToPeer.Get() {
		c.hub.HubMutex.Lock()
		if c.hub.lastCallStartTime>0 {
			c.hub.processTimeValues("peerConHasEnded") // set c.hub.CallDurationSecs
			c.hub.lastCallStartTime = 0
		}
		c.hub.HubMutex.Unlock()

		fmt.Printf("%s (%s) peer Disconnect secs=%d rip=%s (%s)\n",
			c.connType, c.calleeID, c.hub.CallDurationSecs, c.RemoteAddr, comment)

		err := StoreCallerIpInHubMap(c.globalCalleeID, "", false)
		if err!=nil {
			// err "key not found": callee has already signed off - can be ignored
			if strings.Index(err.Error(),"key not found")<0 {
				fmt.Printf("# %s peerConHasEnded %s clear callerIpInHub err=%v\n", c.connType, c.calleeID, err)
			}
		}

		// add an entry to missed calls, but only if there was no mediaConnect
		if(c.hub.CallDurationSecs<=0) {
			var missedCallsSlice []CallerInfo
			userKey := c.calleeID + "_" + strconv.FormatInt(int64(c.hub.registrationStartTime),10)
			var dbUser DbUser
			err := kvMain.Get(dbUserBucket, userKey, &dbUser)
			if err!=nil {
				fmt.Printf("# %s (%s) failed to get dbUser\n",c.connType,c.calleeID)
			} else if(dbUser.StoreMissedCalls) {
				err = kvCalls.Get(dbMissedCalls,c.calleeID,&missedCallsSlice)
				if err!=nil {
					if strings.Index(err.Error(),"key not found")<0 {
						fmt.Printf("# %s (%s) failed to get missedCalls rip=%s\n",
							c.connType, c.calleeID, c.RemoteAddr)
					}
					missedCallsSlice = nil
				}
			}
			if missedCallsSlice!=nil {
				// make sure we only keep up to 10 missed calls
				if len(missedCallsSlice)>=10 {
					missedCallsSlice = missedCallsSlice[1:]
				}
				caller := CallerInfo{c.RemoteAddr, c.hub.CallerClient.callerName,
					time.Now().Unix(), c.hub.CallerClient.callerID}
				missedCallsSlice = append(missedCallsSlice, caller)
				err = kvCalls.Put(dbMissedCalls, c.calleeID, missedCallsSlice, true) // skipConfirm
				if err!=nil {
					fmt.Printf("# %s (%s) failed to store dbMissedCalls err=%v\n",
						c.connType, c.calleeID, err, c.RemoteAddr)
				}
			}
		}

		c.isConnectedToPeer.Set(false)
		if c.isCallee {
			if c.hub.CallerClient!=nil {
				c.hub.CallerClient.isConnectedToPeer.Set(false)
				c.hub.CallerClient = nil
			}
		} else {
			if c.hub.CalleeClient!=nil {
				c.hub.CalleeClient.isConnectedToPeer.Set(false)
			}
		}
	}
}

func (c *WsClient) Close(reason string) {
	if c.isOnline.Get() {
		if logWantedFor("wsclose") {
			fmt.Printf("wsclient Close %s callee=%v %s\n", c.calleeID, c.isCallee, reason)
		}
		c.wsConn.WriteMessage(websocket.CloseMessage, nil)
		c.wsConn.Close()
	}
}

func (c *WsClient) SendPing(maxWaitMS int) {
	if logWantedFor("sendping") {
		fmt.Printf("sendPing %s %s\n",c.wsConn.RemoteAddr().String(), c.calleeID)
	}

	// set the time for sending the next ping in pingPeriod secs from now
	keepAliveMgr.SetPingDeadline(c.wsConn, pingPeriod, c)

	// we expect a pong (or anything) from the client within max 20 secs from now
	if maxWaitMS<0 {
		maxWaitMS = 20000
	}
	c.wsConn.SetReadDeadline(time.Now().Add(time.Duration(maxWaitMS)*time.Millisecond))

	c.wsConn.WriteMessage(websocket.PingMessage, nil)
	c.pingSent++
}


// KeepAliveMgr done with kind support from lesismal of github.com/lesismal/nbio
// Keeping many idle clients alive: https://github.com/lesismal/nbio/issues/92 
type KeepAliveMgr struct {
	mux       sync.RWMutex
	clients   map[*websocket.Conn]struct{}
}

func NewKeepAliveMgr() *KeepAliveMgr {
	return &KeepAliveMgr{
		clients: make(map[*websocket.Conn]struct{}),
	}
}

type KeepAliveSessionData struct {
	pingSendTime time.Time
	client *WsClient
}

func (kaMgr *KeepAliveMgr) SetPingDeadline(wsConn *websocket.Conn, secs int, client *WsClient) {
	// set the absolute time for sending the next ping
	wsConn.SetSession(&KeepAliveSessionData{
		time.Now().Add(time.Duration(secs)*time.Second), client})
}

func (kaMgr *KeepAliveMgr) Add(c *websocket.Conn) {
	kaMgr.mux.Lock()
	defer kaMgr.mux.Unlock()
	kaMgr.clients[c] = struct{}{}
}

func (kaMgr *KeepAliveMgr) Delete(c *websocket.Conn) {
	kaMgr.mux.Lock()
	defer kaMgr.mux.Unlock()
	delete(kaMgr.clients,c)
}

func (kaMgr *KeepAliveMgr) Run() {
	ticker := time.NewTicker(2*time.Second)
	defer ticker.Stop()
	for {
		<-ticker.C
		if shutdownStarted.Get() {
			break
		}
		kaMgr.mux.RLock()
		myClients := make([]*websocket.Conn, len(kaMgr.clients))
		i:=0
		for wsConn := range kaMgr.clients {
			myClients[i] = wsConn
			i++
		}
		kaMgr.mux.RUnlock()

		var nPing int64 = 0
		timeNow := time.Now()
		for _,wsConn := range myClients {
			keepAliveSessionData := wsConn.Session().(*KeepAliveSessionData)
			if keepAliveSessionData!=nil {
				if timeNow.After(keepAliveSessionData.pingSendTime) {
					keepAliveSessionData.client.SendPing(-1)
					nPing++
				}
			}
		}
		atomic.AddInt64(&pingSentCounter, nPing)
	}
}

