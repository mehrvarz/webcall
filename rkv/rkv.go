// WebCall Copyright 2021 timur.mobi. All rights reserved.
package rkv

import (
	"bytes"
	"encoding/gob"
	"errors"
	"time"
	"fmt"
	"sync"
	"net/url"
	"net/http"
	"strings"
	"os"
	"github.com/fasthttp/websocket"
)

type KV interface {
	CreateBucket(bucketName string) error
	Get(bucketName string, key string, value interface{}) error
	Put(bucketName string, key string, value interface{}, waitConfirm bool) error
	Delete(bucketName string, key string) error
	Close() error
}

type RKV struct {
	Dbr int64
}

var (
	closeChan chan struct{}
	msgCounter int64 = 0
	idChanMap map[int64]chan bool
	idChanLock sync.RWMutex
	receivedResponseMap map[int64]Response
	receivedResponseLock sync.RWMutex
	connection *websocket.Conn
	myipaddr string
	wsMutex sync.Mutex
	connectionClosed AtomBool

	ErrNotFound = errors.New("rkv key not found")
	ErrBadValue = errors.New("rkv bad value")
	wsSendTimeoutDuration = 30 * time.Second
	ErrTimeout = errors.New("rkv timeout")
	ErrDisconnect = errors.New("rkv disconnect")
)

func DbOpen(path string, rtcdb string) (RKV, error) {
	fmt.Printf("rkv.Open(%s)...\n", path)
	if connection==nil {
		var err error
		connection,err = contact(rtcdb)
		if err!=nil {
			fmt.Printf("# rkv.Open() contact err=%v\n", err)
			return RKV{}, err
		}

		// use of myipaddr:
		// 1. in Open() it will be sent to rtcdb via Command.Key and ends up in KVStore.Host
		//    it will also be used as myipaddr in serveWs()
		// 2. in StoreCalleeInHubMap() it will be stored in globalhub.ServerIpAddr
		//    and this will also be in serveWs()
		myipaddr,err = GetOutboundIP()
		fmt.Printf("rkv.Open() myipaddr=(%s) err=%v\n",string(myipaddr),err)
	}

	idChanLock.Lock()
	msgCounter++
	myId := msgCounter
	myChan := make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	send(Command{MsgId:myId, Cmd:"Open", Arg:path, Key:myipaddr})

	//fmt.Printf("rkv.Open() waiting for remote reply (myId=%d)...\n",myId)
	select {
	case <-myChan:
		//fmt.Printf("rkv.Open() received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			fmt.Printf("rkv.Open(%s) rerr=%s\n",path,resp.Err)
			return RKV{},errors.New(resp.Err)
		}
		fmt.Printf("rkv.Open(%s) now using id %d\n",path,resp.KvStoreId)
		return RKV{Dbr:resp.KvStoreId}, nil
	case <-closeChan:
		//fmt.Printf("# rkv.Open() connection closed\n")
		return RKV{},ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.Open() timeout\n")
		return RKV{}, ErrTimeout
	}
}

func contact(rtcdb string) (*websocket.Conn,error) {
	// open ws-connection to rkv server
	u := url.URL{Scheme:"ws", Host:rtcdb, Path:"/ws"}
	fmt.Printf("rkv.contact (%s)\n", u.String())
	d := websocket.DefaultDialer
	header := http.Header{}
	//header.Set("origin", domain)

	// connection *websocket.Conn
	connection, resp, err := d.Dial(u.String(), header)
	if err != nil {
		if resp!=nil {
			fmt.Printf("# rkv.contact err=%v status=%d\n", err, resp.StatusCode)
		} else {
			fmt.Printf("# rkv.contact err=%v\n", err)
		}
		return nil,err
	}

	idChanMap = make(map[int64]chan bool)
	receivedResponseMap = make(map[int64]Response)
	closeChan = make(chan struct{})

	go func() {
		defer func() {
			if !connectionClosed.Get() {
				// connected is not yet closed
				fmt.Printf("rkv.receive loop exit and close(closeChan)\n")
				connectionClosed.Set(true)
				close(closeChan)
			} else {
				// connected is already closed
				fmt.Printf("rkv.receive loop exit (closeChan already closed)\n")
			}
		}()
		//fmt.Printf("rkv.receive loop...\n")
		for {
			//fmt.Printf("rkv.receive loop wait...\n")
			_, msg, err := connection.ReadMessage()
			if err != nil {
				if connectionClosed.Get() && strings.Index(err.Error(),"closed network")>0 {
					// if connection is already closed, don't show "use of closed network connection"
					fmt.Printf("rkv.receive loop end (closeChan already closed)\n")
					return
				}
				fmt.Printf("# rkv.receive loop err=(%v) connectionClosed=%v\n", err, connectionClosed.Get())
				// if we see "websocket: close 1006 (abnormal closure)" it means that rtcdb is stopped
				// in this case we urgently need to restart rtcsig !!!
				// TODO this is an excellent opportunity for an admin email notification
				time.Sleep(1 * time.Second) // give rtcdb time to restart
				os.Exit(-1)
				return
			}
			// process response msg from rtcdb
			//fmt.Printf("rkv.receive receive msg len=%d\n", len(msg))
			d := gob.NewDecoder(bytes.NewReader(msg))
			var resp Response 
			d.Decode(&resp)
			//fmt.Printf("rkv.receive resp.MsgId=%d KvStore=%d err=%v\n",resp.MsgId, resp.KvStoreId, resp.Err)
			receivedResponseLock.Lock()
			receivedResponseMap[resp.MsgId] = resp
			receivedResponseLock.Unlock()
			//fmt.Printf("rkv.receive receivedResponseLock.Unlocked\n")
			idChanLock.Lock()
			myChan := idChanMap[resp.MsgId]
			delete(idChanMap,resp.MsgId)
			idChanLock.Unlock()
			//fmt.Printf("rkv.receive idChanLock.Unlocked\n")
			myChan <- true
			//fmt.Printf("rkv.receive myChan <- true done\n")
		}
		//fmt.Printf("# rkv.receive loop ended\n")
	}()

	return connection,nil
}

func send(msg Command) error {
	var sendMsgBuf bytes.Buffer
	if err := gob.NewEncoder(&sendMsgBuf).Encode(msg); err != nil {
		fmt.Printf("# rkv.%s() send encode err %v\n", msg.Cmd, err)
		return err
	}
	wsMutex.Lock()
	err := connection.WriteMessage(websocket.BinaryMessage, sendMsgBuf.Bytes())
	wsMutex.Unlock()
	if err != nil {
		fmt.Printf("# rkv.%s() send err=%v msgId=%d\n", msg.Cmd, err, msg.MsgId)
		return err
	}
	return nil
}

func (c RKV) CreateBucket(bucketName string) error {
	//fmt.Printf("rkv.CreateBucket...\n")
	idChanLock.Lock()
	msgCounter++
	myId := msgCounter
	myChan := make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	send(Command{MsgId:myId, KvStoreId:c.Dbr, Cmd:"CreateBucket", Arg:bucketName})

	//fmt.Printf("rkv.CreateBucket waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.CreateBucket received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("rkv.CreateBucket %s rerr=%v\n",bucketName,resp.Err)
			return errors.New(resp.Err)
		}
		//fmt.Printf("rkv.CreateBucket %s no rerr\n",bucketName)
		return nil
	case <-closeChan:
		//fmt.Printf("# rkv.CreateBucket connection closed\n")
		return ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.CreateBucket timeout\n")
		return ErrTimeout
	}
}

func (c RKV) Put(bucketName string, key string, value interface{}, skipConfirm bool) error {
	//fmt.Printf("rkv.Put bucketName=(%s) key=(%s) skipConfirm=%v\n",bucketName,key,skipConfirm)
	if value == nil {
		//fmt.Printf("# rkv.Put bucketName=(%s) key=(%s) ErrBadValue\n",bucketName,key)
		return ErrBadValue
	}
	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(value); err != nil {
		//fmt.Printf("# rkv.Put bucketName=(%s) key=(%s) err=%v\n",bucketName,key,err)
		return err
	}

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
	send(Command{MsgId:myId, KvStoreId:c.Dbr, Cmd:"Put", Arg:bucketName, Key:key, Value:buf.Bytes()})
	if skipConfirm {
		return nil
	}

	//fmt.Printf("rkv.Put waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.Put received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("# rkv.Put bucketName=(%s) key=(%s) rerr=%v \n", bucketName, key, resp.Err)
			return errors.New(resp.Err)
		}
		//fmt.Printf("rkv.Put bucketName=(%s) key=(%s) no rerr\n", bucketName, key)
		return nil
	case <-closeChan:
		//fmt.Printf("# rkv.Put connection closed\n")
		return ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.Put timeout\n")
		return ErrTimeout
	}
}

func (c RKV) Get(bucketName string, key string, value interface{}) error {
	//fmt.Printf("rkv.Get bucketName=%s key=%s ...\n",bucketName,key)
	idChanLock.Lock()
	msgCounter++
	myId := msgCounter
	myChan := make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	send(Command{MsgId:myId, KvStoreId:c.Dbr, Cmd:"Get", Arg:bucketName, Key:key})

	//fmt.Printf("rkv.Get bucketName=%s key=%s waiting for remote reply %d...\n",bucketName,key,myId)
	select {
	case <-myChan:
		//fmt.Printf("rkv.Get received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		maxDispLen := len(key); if maxDispLen>24 { maxDispLen=24 }
		if resp.Err != "" {
			// this is not an error; the initiator may just check if key is free
			//fmt.Printf("rkv.Get bucketName=%s key=%s rerr=%v\n",bucketName,key[:maxDispLen],resp.Err)
			return errors.New(resp.Err)
		}
		//fmt.Printf("rkv.Get bucketName=%s key=%s no rerr\n",bucketName,key[:maxDispLen])
		// what kind of data is in resp.Data depends on the bucketName
		// decode resp.Data into value
		d := gob.NewDecoder(bytes.NewReader(resp.Data))
		return d.Decode(value)
	case <-closeChan:
		//fmt.Printf("# rkv.Get bucketName=%s key=%s connection closed\n",bucketName,key)
		return ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.Get bucketName=%s key=%s myId=%d timeout\n",bucketName,key,myId)
		return ErrTimeout
	}
}

func (c RKV) Delete(bucketName string, key string) error {
	idChanLock.Lock()
	msgCounter++
	myId := msgCounter
	myChan := make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	send(Command{MsgId:myId, KvStoreId:c.Dbr, Cmd:"Delete", Arg:bucketName, Key:key})

	//fmt.Printf("rkv.Delete waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.Delete received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("# rkv.Delete bucketName=%s key=%s rerr=%v\n",bucketName,key,resp.Err)
			return errors.New(resp.Err)
		}
		//fmt.Printf("rkv.Delete bucketName=%s key=%s no err\n",bucketName,key)
		return nil
	case <-closeChan:
		//fmt.Printf("# rkv.Delete connection closed\n")
		return ErrDisconnect
	case <-time.After(wsSendTimeoutDuration):
		//fmt.Printf("# rkv.Delete timeout\n")
		return ErrTimeout
	}
}

// Close closes the key-value store file.
func (c RKV) Close() error {
	//fmt.Printf("rkv.Close()\n", )
	idChanLock.Lock()
	msgCounter++
	myId := msgCounter
	myChan := make(chan bool)
	idChanMap[myId] = myChan
	idChanLock.Unlock()

	if connectionClosed.Get() {
		//fmt.Printf("rkv.Close connection already closed\n")
		return nil
	}

	send(Command{MsgId:myId, KvStoreId:c.Dbr, Cmd:"Close"})

	//fmt.Printf("rkv.Close waiting for remote reply...\n")
	select {
	case <-myChan:
		//fmt.Printf("rkv.Close received data\n")
		receivedResponseLock.Lock()
		resp := receivedResponseMap[myId]
		delete(receivedResponseMap,myId)
		receivedResponseLock.Unlock()
		if resp.Err != "" {
			//fmt.Printf("rkv.Close rerr=%v\n",resp.Err)
			return errors.New(resp.Err)
		}
		//fmt.Printf("rkv.Close no err\n")
		return nil
	case <-closeChan:
		//fmt.Printf("# rkv.Close connection closed\n")
		return ErrDisconnect
	case <-time.After(1 * time.Second):
		//fmt.Printf("# rkv.Close timeout\n")
		return ErrTimeout
	}
}

func Exit() error {
	if !connectionClosed.Get() {
		// connectionClosed.Set(true) prevents double close(closeChan) panic
		connectionClosed.Set(true)
		fmt.Printf("rkv.Exit closing websocket connection\n")
		wsMutex.Lock()
		err := connection.WriteMessage(websocket.CloseMessage,
				websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		wsMutex.Unlock()
		if err != nil {
			fmt.Printf("# rkv.Exit err=%v\n", err)
		}
		connection.Close()
		close(closeChan)
		return err
	}
	return nil
}

