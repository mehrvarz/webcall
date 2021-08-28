package rkv

import (
	"bytes"
	"encoding/gob"
	"errors"
	"time"
	"net"
	"sync/atomic"
)

// GetOnlineCallee(ID) can tell us (with optional ejectOn1stFound yes/no):
// "is calleeID online?", "is calleeID hidden online?", "is calleeID hidden online for my callerIpAddr?"
func GetOnlineCallee(calleeID string, ejectOn1stFound bool, reportHiddenCallee bool, callerIpAddr string, occupy bool, comment string) (string,*Hub,error) { // string=calleeID
	// TODO callerIpAddr = "127.0.0.1" not useful
	//fmt.Printf("rkv.GetOnlineCallee() calleeID=%s ejectOn1stFound=%v reportHiddenCallee=%v callerIpAddr=%s\n",
	//	calleeID,ejectOn1stFound,reportHiddenCallee,callerIpAddr)
	idChanLock.Lock()
	msgCounter++
	myId := msgCounter
	myChan := make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	send(Command{MsgId:myId, Cmd:"GetOnlineCallee",
		Arg:calleeID, Bool1:ejectOn1stFound, Bool2:reportHiddenCallee, Key:callerIpAddr, Bool3:occupy})
	// wait for remote response
	//fmt.Printf("rkv.SearchIp() waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.GetOnlineCallee received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("rkv.GetOnlineCallee calleeID=%s src=%s rerr=%v\n", calleeID, comment, resp.Err)
			return "",nil,errors.New(resp.Err)
		}
		id := resp.Str1
		d := gob.NewDecoder(bytes.NewReader(resp.Data))
		var hub Hub // see in rtcdb main.go: "serialize hub resp.Data"
		d.Decode(&hub)
		//fmt.Printf("rkv.GetOnlineCallee calleeID=%s src=%s id=(%s)\n", calleeID, comment, id)
		return id,&hub,nil
	case <-closeChan:
		//fmt.Printf("# rkv.GetOnlineCallee connection closed\n")
		return "",nil,ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.GetOnlineCallee timeout\n")
		return "",nil,ErrTimeout
	}
}

// this used to be called StoreIdInHubMap
func StoreCalleeInHubMap(id string, hub *Hub, multiCallees string, skipConfirm bool) (string,int64,error) {
	var myId int64 = 0
	var myChan chan bool
	if !skipConfirm {
		idChanLock.Lock()
		msgCounter++
		myId = msgCounter
		myChan = make(chan bool)
		idChanMap[myId] = myChan
		idChanLock.Unlock()
	}

	if hub.ServerIpAddr == "" {
		hub.ServerIpAddr = string(myipaddr)
	}
	//fmt.Printf("rkv.StoreCalleeInHubMap id=%s ServerIpAddr=(%s)\n",id,hub.ServerIpAddr)

	// serialze hub (via sendMsgBuf) into cmd.Value
	var sendMsgBuf bytes.Buffer
	if err := gob.NewEncoder(&sendMsgBuf).Encode(hub); err != nil {
		//fmt.Printf("# rkv.StoreCalleeInHubMap encode hub err %v\n", err)
		return "",0,err
	}
	send(Command{MsgId:myId, Cmd:"StoreCalleeInHubMap", Arg:id, Key:multiCallees, Value:sendMsgBuf.Bytes()})
	if skipConfirm {
		return id,0,nil
	}

	// wait for remote response
	//fmt.Printf("rkv.StoreCalleeInHubMap() waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.StoreCalleeInHubMap() received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("# rkv.StoreCalleeInHubMap id=%s rerr=%v\n",id, resp.Err)
			return "",0,errors.New(resp.Err)
		}
		//fmt.Printf("rkv.StoreCalleeInHubMap id=%s newid=%s no rerr\n",id, resp.Str1)
		id := resp.Str1 // is unique, may differ from calleeIUD
		// NOTE resp.Int1 contains len(globalHubMap)
		return id,resp.Int1,nil
	case <-closeChan:
		//fmt.Printf("# rkv.StoreCalleeInHubMap connection closed\n")
		return "",0,ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.StoreCalleeInHubMap timeout\n")
		return "",0,ErrTimeout
	}
}

func StoreCallerIpInHubMap(calleeId string, callerIp string, skipConfirm bool) error {
	var myId int64 = 0
	var myChan chan bool
	if !skipConfirm {
		idChanLock.Lock()
		msgCounter++
		myId = msgCounter
		myChan = make(chan bool)
		idChanMap[myId] = myChan
		idChanLock.Unlock()
	}

	send(Command{MsgId:myId, Cmd:"StoreCallerIpInHubMap", Arg:calleeId, Key:callerIp})
	if skipConfirm {
		return nil
	}

	// wait for remote response
	//fmt.Printf("rkv.StoreCallerIpInHubMap() waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.StoreCallerIpInHubMap() received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("# rkv.StoreCallerIpInHubMap id=%s ip=%s rerr=%v\n", calleeId, callerIp, resp.Err)
			return errors.New(resp.Err)
		}
		//fmt.Printf("rkv.StoreCallerIpInHubMap id=%s ip=%s no rerr\n", calleeId, callerIp, resp.Str1)
		return nil
	case <-closeChan:
		//fmt.Printf("# rkv.StoreCallerIpInHubMap connection closed\n")
		return ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.StoreCallerIpInHubMap timeout\n")
		return ErrTimeout
	}
}

/*
func GetCallerIpInHubMap(calleeId string) (string,error) {
	var myId int64 = 0
	var myChan chan bool
	idChanLock.Lock()
	msgCounter++
	myId = msgCounter
	myChan = make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	send(Command{MsgId:myId, Cmd:"GetCallerIpInHubMap", Arg:calleeId})

	// wait for remote response
	//fmt.Printf("rkv.GetCallerIpInHubMap() waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.GetCallerIpInHubMap() received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("# rkv.GetCallerIpInHubMap id=%s ip=%s rerr=%v\n", calleeId, callerIp, resp.Err)
			return "",errors.New(resp.Err)
		}
		//fmt.Printf("rkv.GetCallerIpInHubMap id=%s ip=%s no rerr\n", calleeId, callerIp, resp.Str1)
		return resp.Str1,nil
	case <-closeChan:
		//fmt.Printf("# rkv.GetCallerIpInHubMap connection closed\n")
		return "",ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.GetCallerIpInHubMap timeout\n")
		return "",ErrTimeout
	}
}
*/

func SearchCallerIpInHubMap(ip string) (bool,string,error) {
	// search for globalHubMap[].ClientIpAddr == ip as required for pion auth
	//fmt.Printf("rkv.SearchCallerIpInHubMap ip=%s\n",ip)
	idChanLock.Lock()
	msgCounter++
	myId := msgCounter
	myChan := make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	send(Command{MsgId:myId, Cmd:"SearchCallerIpInHubMap", Arg:ip})

	// wait for remote response
	//fmt.Printf("rkv.SearchCallerIpInHubMap() waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.SearchCallerIpInHubMap() received response\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("rkv.SearchCallerIpInHubMap ip=%s rerr=%v\n",ip,resp.Err)
			return false,"",errors.New(resp.Err)
		}
		if resp.Int1==1 {
			//fmt.Printf("rkv.SearchCallerIpInHubMap ip=%s ret=true no rerr\n",ip)
			return true,resp.Str1,nil
		}
		//fmt.Printf("rkv.SearchCallerIpInHubMap ip=%s ret=false no rerr\n",ip)
		return false,"",nil
	case <-closeChan:
		//fmt.Printf("# rkv.SearchCallerIpInHubMap connection closed\n")
		return false,"",ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.SearchCallerIpInHubMap timeout\n")
		return false,"",ErrTimeout
	}
}

func DeleteFromHubMap(id string) (int64,error) {
	//fmt.Printf("rkv.DeleteFromHubMap key=%s\n",id)
	idChanLock.Lock()
	msgCounter++
	myId := msgCounter
	myChan := make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	send(Command{MsgId:myId, Cmd:"DeleteFromHubMap", Arg:id})

	// wait for remote response
	//fmt.Printf("rkv.DeleteFromHubMap waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.DeleteFromHubMap received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("rkv.DeleteFromHubMap id=%s rerr=%v\n", id, resp.Err)
			return resp.Int1,errors.New(resp.Err)
		}
		//fmt.Printf("rkv.DeleteFromHubMap id=%s hublen=%d no rerr\n", id, resp.Int1)
		return resp.Int1,nil
	case <-closeChan:
		//fmt.Printf("# rkv.DeleteFromHubMap connection closed\n")
		return 0,ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.DeleteFromHubMap timeout\n")
		return 0,ErrTimeout
	}
}

func GetRandomCalleeID() (string,error) {
	//fmt.Printf("rkv.GetRandomCalleeID\n")
	idChanLock.Lock()
	msgCounter++
	myId := msgCounter
	myChan := make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	send(Command{MsgId:myId, Cmd:"GetRandomCalleeID"})

	// wait for remote response
	//fmt.Printf("rkv.GetRandomCalleeID waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.GetRandomCalleeID received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("rkv.GetRandomCalleeID rerr=%v\n",resp.Err)
			return "",errors.New(resp.Err)
		}
		//fmt.Printf("rkv.GetRandomCalleeID newid=%s no rerr\n",resp.Str1)
		return resp.Str1,nil
	case <-closeChan:
		//fmt.Printf("# rkv.GetRandomCalleeID connection closed\n")
		return "",ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.GetRandomCalleeID timeout\n")
		return "",ErrTimeout
	}
}

func GetOnlineCalleeCount(countCallers bool) (int64,int64,error) {
	// return the number of callees currently online
	//fmt.Printf("rkv.GetOnlineCalleeCount\n")
	idChanLock.Lock()
	msgCounter++
	myId := msgCounter
	myChan := make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	send(Command{MsgId:myId, Cmd:"GetOnlineCalleeCount", Bool1:countCallers})
	// wait for remote response
	//fmt.Printf("rkv.GetOnlineCalleeCount waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.GetRandomCalleeID received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("rkv.GetRandomCalleeID rerr=%v\n",resp.Err)
			return 0,0,errors.New(resp.Err)
		}
		// outremarked bc it happens too often
		//fmt.Printf("rkv.GetOnlineCalleeCount %d no rerr\n",resp.Int1)
		return resp.Int1,resp.Int2,nil
	case <-closeChan:
		//fmt.Printf("# rkv.GetOnlineCalleeCount connection closed\n")
		return 0,0,ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.GetOnlineCalleeCount timeout\n")
		return 0,0,ErrTimeout
	}
}

func SetCalleeHiddenState(calleeId string, hidden bool) (error) {
	//fmt.Printf("rkv.SetCalleeHiddenState calleeId=%s %v\n",calleeId,hidden)
	idChanLock.Lock()
	msgCounter++
	myId := msgCounter
	myChan := make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	send(Command{MsgId:myId, Cmd:"SetCalleeHiddenState", Arg:calleeId, Bool1:hidden})

	// wait for remote response
	//fmt.Printf("rkv.SetCalleeHiddenState waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.SetCalleeHiddenState received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("rkv.SetCalleeHiddenState id=%s rerr=%v\n", calleeId, resp.Err)
			return errors.New(resp.Err)
		}
		//fmt.Printf("rkv.SetCalleeHiddenState id=%s no rerr\n", calleeId)
		return nil
	case <-closeChan:
		//fmt.Printf("# rkv.SetCalleeHiddenState connection closed\n")
		return ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.SetCalleeHiddenState timeout\n")
		return ErrTimeout
	}
}

func SetUnHiddenForCaller(calleeId string, callerIp string) (error) {
	//fmt.Printf("rkv.SetUnHiddenForCaller calleeId=%s callerIp=%s\n",calleeId,callerIp)
	idChanLock.Lock()
	msgCounter++
	myId := msgCounter
	myChan := make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	send(Command{MsgId:myId, Cmd:"SetUnHiddenForCaller", Arg:calleeId, Key:callerIp})

	// wait for remote response
	//fmt.Printf("rkv.SetUnHiddenForCaller() waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.SetUnHiddenForCaller() received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("rkv.SetUnHiddenForCaller calleeId=%s callerIp=%s rerr=%v\n",calleeId,callerIp,resp.Err)
			return errors.New(resp.Err)
		}
		//fmt.Printf("rkv.SetUnHiddenForCaller calleeId=%s callerIp=%s no rerr\n",calleeId,callerIp)
		return nil
	case <-closeChan:
		//fmt.Printf("# rkv.SetUnHiddenForCaller connection closed\n")
		return ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.SetUnHiddenForCaller timeout\n")
		return ErrTimeout
	}
}

func PrintHubInfo() (string,error) {
	// TODO do we want to keep offering this for everyone?
	data := ""
/*
	globalHubMapLock.RLock()
	defer globalHubMapLock.RUnlock()
//	fmt.Fprintf(w, "<html><div>number of hubs %d</div>",len(globalHubMap))
	// TODO the printed order may change every time bc this is how go maps work
	// TODO return a dump of the complete globalHubMap
	for id,hub := range globalHubMap {
		fmt.Printf("<div>calleeId=%s server=%s client=%s</div>", id, hub.ServerIpAddr, hub.ConnectedCallerId)
//		hub.ClientsLock.RLock()
//		for cli := range hub.Clients {
//			fmt.Printf("<div>callee=%v online=%v hidden=%v remoteAddr=%v ua=%s</div>",
//				cli.IsCallee, cli.IsOnline, cli.IsHiddenCallee, cli.RemoteAddr, cli.UserAgent)
//		}
	}
*/
	return data,nil
}

/*
func (c RKV) Dumpuser(bucketName string) error {
	send(Command{MsgId:0, KvStoreId:c.KvStore.Dbr, Arg:bucketName, Cmd:"Dumpuser"})
	return nil
}
*/

// Get preferred outbound ip of this machine
func GetOutboundIP() (string,error) {
	conn, err := net.Dial("udp", "1.0.0.1:80")
	if err != nil {
		return "",err
	}
	defer conn.Close()
	localAddr := conn.LocalAddr().(*net.UDPAddr)
	var localIp string = localAddr.IP.String()
	//fmt.Printf("rkv.GetOutboundIP localAddr=%v (%s)\n",localAddr,localIp)
	return localIp,nil
}

// atomic bool
type AtomBool struct {flag int32}

func (b *AtomBool) Set(value bool) {
	var i int32 = 0
	if value {i = 1}
	atomic.StoreInt32(&(b.flag), int32(i))
}

func (b *AtomBool) Get() bool {
	return atomic.LoadInt32(&(b.flag)) != 0
}

