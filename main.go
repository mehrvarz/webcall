// WebCall Copyright 2021 timur.mobi. All rights reserved.
package main

import (
	"flag"
	"net/http"
	"fmt"
	"time"
	"os"
	"os/signal"
	"syscall"
	"sync"
	"strings"
	"strconv"
	"bufio"
	"runtime"
	"gopkg.in/ini.v1"
	"github.com/mehrvarz/webcall/skv"
	"github.com/mehrvarz/webcall/rkv"
	"github.com/lesismal/nbio/nbhttp"
	"github.com/lesismal/llib/std/crypto/tls"
	_ "net/http/pprof"
)

var	kvMain skv.KV
const dbMainName = "rtcsig.db"
const dbRegisteredIDs = "activeIDs" // internal name changed active -> registered
const dbBlockedIDs = "blockedIDs"
const dbUserBucket = "userData2"

var	kvCalls skv.KV
const dbCallsName = "rtccalls.db"
const dbWaitingCaller = "waitingCallers"
const dbMissedCalls = "missedCalls"
type CallerInfo struct { // for incoming calls
	AddrPort string // x.x.x.x:nnnn
	CallerName string
	CallTime int64
	CallerID string // the caller's calleeID for calling back
}

var	kvContacts skv.KV
const dbContactsName = "rtccontacts.db"
const dbContactsBucket = "contacts" // calleeID -> map[callerID]name

var	kvNotif skv.KV
const dbNotifName = "rtcnotif.db"
const dbSentNotifTweets = "sentNotifTweets"

var	kvHashedPw skv.KV
const dbHashedPwName = "rtchashedpw.db"
const dbHashedPwBucket = "hashedpwbucket"
type PwIdCombo struct {
	Pw string
	CalleeId string
	Created int64
	Expiration int64
}

var version = flag.Bool("version", false, "show version")
var	builddate string
var	codetag string
const configFileName = "config.ini"
const statsFileName = "stats.ini"
var hostname = ""
var httpPort = 0
var httpsPort = 0
var httpToHttps = false
var wsPort = 0
var wssPort = 0
var htmlPath = ""
var insecureSkipVerify = false
var runTurn = false
var turnIP = ""
var turnPort = 0
var turnRealm = ""
var turnDebugLevel = 0
var pprofPort = 0
var rtcdb = ""
var dbPath = ""
var maxRingSecs = 0
var maxTalkSecsIfNoP2p = 0

// twitter key for @WebCall user
var twitterKey = ""
var twitterSecret = ""

// web push keys for (TODO a copy of vapidPublicKey is also being used in settings.js)
var vapidPublicKey = ""
var vapidPrivateKey = ""
var adminEmail = ""

var readConfigLock sync.RWMutex
var wsUrl = ""
var wssUrl = ""

var	shutdownStarted rkv.AtomBool
var maintenanceMode = false
var allowNewAccounts = true
var disconnectCalleesWhenPeerConnected = false
var disconnectCallersWhenPeerConnected = true
var calleeClientVersion = ""

var hubMap map[string]*Hub
var hubMapMutex sync.RWMutex

var waitingCallerChanMap map[string]chan int // ip:port -> chan
var waitingCallerChanLock sync.RWMutex

var numberOfCallsToday = 0 // will be incremented by wshub.go processTimeValues()
var numberOfCallSecondsToday = 0
var numberOfCallsTodayMutex sync.RWMutex

var lastCurrentDayOfMonth = 0 // will be set by timer.go
var multiCallees = ""
var logevents = ""
var logeventMap map[string]bool
var logeventMutex sync.RWMutex
var calllog = ""
var httpRequestCountMutex sync.RWMutex
var httpRequestCount = 0
var httpResponseCount = 0
var httpResponseTime time.Duration
var wsAddr string
var wssAddr string
var svr *nbhttp.Server
var svrs *nbhttp.Server

type wsClientDataType struct {
	hub *Hub
	dbEntry skv.DbEntry
	dbUser skv.DbUser
	calleeID string
}
var wsClientMap map[uint64]wsClientDataType
var wsClientMutex sync.RWMutex

func main() {
	flag.Parse()
	if *version {
		if codetag!="" {
			fmt.Printf("version %s\n",codetag)
		}
		fmt.Printf("builddate %s\n",builddate)
		return
	}

	fmt.Printf("--------------- webcall startup ---------------\n")
	hubMap = make(map[string]*Hub) // calleeID -> *Hub
	waitingCallerChanMap = make(map[string]chan int)
	wsClientMap = make(map[uint64]wsClientDataType) // wsClientID -> wsClientData
	readConfig(true)

	var err error
	if rtcdb=="" {
		kvMain,err = skv.DbOpen(dbMainName,dbPath)
	} else {
		kvMain,err = rkv.DbOpen(dbMainName,rtcdb)
	}
	if err!=nil {
		fmt.Printf("# error dbName %s open %v\n",dbMainName,err)
		return
	}
	err = kvMain.CreateBucket(dbRegisteredIDs)
	if err!=nil {
		fmt.Printf("# error dbName %s create '%s' bucket err=%v\n",dbMainName,dbRegisteredIDs,err)
		kvMain.Close()
		return
	}
	err = kvMain.CreateBucket(dbBlockedIDs)
	if err!=nil {
		fmt.Printf("# error dbName %s create '%s' bucket err=%v\n",dbMainName,dbBlockedIDs,err)
		kvMain.Close()
		return
	}
	err = kvMain.CreateBucket(dbUserBucket)
	if err!=nil {
		fmt.Printf("# error dbName %s create '%s' bucket err=%v\n",dbMainName,dbUserBucket,err)
		kvMain.Close()
		return
	}
	if rtcdb=="" {
		kvCalls,err = skv.DbOpen(dbCallsName,dbPath)
	} else {
		kvCalls,err = rkv.DbOpen(dbCallsName,rtcdb)
	}
	if err!=nil {
		fmt.Printf("# error dbCallsName %s open %v\n",dbCallsName,err)
		return
	}
	err = kvCalls.CreateBucket(dbWaitingCaller)
	if err!=nil {
		fmt.Printf("# error db %s create '%s' bucket err=%v\n",dbCallsName,dbWaitingCaller,err)
		kvCalls.Close()
		return
	}
	err = kvCalls.CreateBucket(dbMissedCalls)
	if err!=nil {
		fmt.Printf("# error db %s create '%s' bucket err=%v\n",dbCallsName,dbMissedCalls,err)
		kvCalls.Close()
		return
	}
	if rtcdb=="" {
		kvNotif,err = skv.DbOpen(dbNotifName,dbPath)
	} else {
		kvNotif,err = rkv.DbOpen(dbNotifName,rtcdb)
	}
	if err!=nil {
		fmt.Printf("# error dbNotifName %s open %v\n",dbNotifName,err)
		return
	}
	err = kvNotif.CreateBucket(dbSentNotifTweets)
	if err!=nil {
		fmt.Printf("# error db %s create '%s' bucket err=%v\n",dbNotifName,dbSentNotifTweets,err)
		kvNotif.Close()
		return
	}
	if rtcdb=="" {
		kvHashedPw,err = skv.DbOpen(dbHashedPwName,dbPath)
	} else {
		kvHashedPw,err = rkv.DbOpen(dbHashedPwName,rtcdb)
	}
	if err!=nil {
		fmt.Printf("# error dbHashedPwName %s open %v\n",dbHashedPwName,err)
		return
	}
	err = kvHashedPw.CreateBucket(dbHashedPwBucket)
	if err!=nil {
		fmt.Printf("# error db %s create '%s' bucket err=%v\n",dbHashedPwName,dbHashedPwBucket,err)
		kvHashedPw.Close()
		return
	}
	if rtcdb=="" {
		kvContacts,err = skv.DbOpen(dbContactsName,dbPath)
	} else {
		kvContacts,err = rkv.DbOpen(dbContactsName,rtcdb)
	}
	if err!=nil {
		fmt.Printf("# error dbContactsName %s open %v\n",dbContactsName,err)
		return
	}
	err = kvContacts.CreateBucket(dbContactsBucket)
	if err!=nil {
		fmt.Printf("# error db %s create '%s' bucket err=%v\n",dbContactsName,dbContactsBucket,err)
		kvContacts.Close()
		return
	}

	readStatsFile()

	// websocket handler
	if wsPort > 0 {
		wsAddr = fmt.Sprintf(":%d", wsPort)
		mux := &http.ServeMux{}
		mux.HandleFunc("/ws", serveWs)
		svr = nbhttp.NewServer(nbhttp.Config{
			Network: "tcp",
			Addrs: []string{wsAddr},
			MaxLoad: 1000000,				// TODO make configurable?
			ReleaseWebsocketPayload: true,	// TODO make configurable?
			NPoller: runtime.NumCPU() * 4,	// TODO make configurable? user workers?
		}, mux, nil)
		err = svr.Start()
		if err != nil {
			fmt.Printf("# nbio.Start wsPort failed: %v\n", err)
			return
		}
		defer svr.Stop()
	}
	if wssPort>0 {
		cer, err := tls.LoadX509KeyPair("tls.pem", "tls.key")
		if err != nil {
			fmt.Printf("# tls.LoadX509KeyPair err=(%v)\n", err)
			os.Exit(-1)
		}
		tlsConfig := &tls.Config{
			Certificates: []tls.Certificate{cer},
			InsecureSkipVerify: insecureSkipVerify,
			// Causes servers to use Go's default ciphersuite preferences,
			// which are tuned to avoid attacks. Does nothing on clients.
			PreferServerCipherSuites: true,
			// Only use curves which have assembly implementations
			CurvePreferences: []tls.CurveID{
				tls.CurveP256,
				tls.X25519,
			},
			MinVersion: tls.VersionTLS12,
			CipherSuites: []uint16{
				tls.TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384,
				tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
				tls.TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305,
				tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305,
				tls.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256,
				tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
			},
		}
		tlsConfig.BuildNameToCertificate()
		//fmt.Printf("tlsConfig %v\n", tlsConfig)

		wssAddr = fmt.Sprintf(":%d", wssPort)
		mux := &http.ServeMux{}
		mux.HandleFunc("/ws", serveWss)
		svrs = nbhttp.NewServerTLS(nbhttp.Config{
			Network: "tcp",
			Addrs: []string{wssAddr},
			MaxLoad: 1000000,				// TODO make configurable?
			ReleaseWebsocketPayload: true,	// TODO make configurable?
			NPoller: runtime.NumCPU() * 4,	// TODO make configurable? user workers?
		}, mux, nil, tlsConfig)
		err = svrs.Start()
		if err != nil {
			fmt.Printf("# nbio.Start wssPort failed: %v\n", err)
			return
		}
		defer svrs.Stop()
	}

	go httpServer()
	go runTurnServer()
	go ticker30sec() // periodically log stats
	go ticker10sec() // periodically call readConfig()
	go ticker2sec()  // periodically check for remainingTalkSecs underruns
	//go udpHealthService(8111) // TODO make udpHealthPort configurable
	if pprofPort>0 {
		go func() {
			addr := fmt.Sprintf(":%d",pprofPort)
			fmt.Printf("starting pprofServer on %s\n",addr)
			pprofServer := &http.Server{Addr:addr}
			pprofServer.ListenAndServe()
		}()
	}

	time.Sleep(1 * time.Second)
	fmt.Printf("awaiting SIGTERM for shutdown...\n")
	sigc := make(chan os.Signal)
	signal.Notify(sigc, os.Interrupt, syscall.SIGTERM)
	<-sigc

	//////////////// shutdown //////////////////
	fmt.Printf("received os.Interrupt/SIGTERM signal: shutting down...\n")
	// shutdownStarted.Set(true) will end all timer routines
	// but it will not end our ListenAndServe() servers; this is why we call os.Exit() below
	shutdownStarted.Set(true)
	writeStatsFile()
	// wait for shutdownStarted to take effect; then close all db's
	time.Sleep(2 * time.Second)

	fmt.Printf("kvContacts.Close...\n")
	err = kvContacts.Close()
	if err!=nil {
		fmt.Printf("# error dbName %s close err=%v\n",dbContactsName,err)
	}
	fmt.Printf("kvHashedPw.Close...\n")
	err = kvHashedPw.Close()
	if err!=nil {
		fmt.Printf("# error dbName %s close err=%v\n",dbHashedPwName,err)
	}
	fmt.Printf("kvNotif.Close...\n")
	err = kvNotif.Close()
	if err!=nil {
		fmt.Printf("# error dbName %s close err=%v\n",dbNotifName,err)
	}
	fmt.Printf("kvCalls.Close...\n")
	err = kvCalls.Close()
	if err!=nil {
		fmt.Printf("# error dbName %s close err=%v\n",dbCallsName,err)
	}
	fmt.Printf("db.Close...\n")
	err = kvMain.Close()
	if err!=nil {
		fmt.Printf("# error dbName %s close err=%v\n",dbMainName,err)
	}
	if rtcdb!="" {
		err = rkv.Exit()
		if err!=nil {
			fmt.Printf("# error rkv.Exit err=%v\n",err)
		}
	}
	os.Exit(0)
}

func getStats() string {
	// get number of total clients + number of active calls + number of active p2p/p2p-calls
	var numberOfOnlineCallees int64
	var numberOfOnlineCallers int64
	numberOfActivePureP2pCalls := 0
	hubMapMutex.RLock()
	for _,hub := range hubMap {
		numberOfOnlineCallees++
		hub.HubMutex.RLock()
		if hub.lastCallStartTime>0 && hub.CallerClient!=nil {
			numberOfOnlineCallers++
			if hub.LocalP2p && hub.RemoteP2p {
				numberOfActivePureP2pCalls++
			}
		}
		hub.HubMutex.RUnlock()
	}
	hubMapMutex.RUnlock()

	// this will show the total # of callees on all server instances
	var numberOfGlobalCallees int64
	var numberOfGlobalCallers int64
	if rtcdb=="" {
		numberOfGlobalCallees,numberOfGlobalCallers,_ = GetOnlineCalleeCount(true)
	} else {
		var err error
		numberOfGlobalCallees,numberOfGlobalCallers,err = rkv.GetOnlineCalleeCount(true)
		if err!=nil {
			fmt.Printf("# getStats GetOnlineCalleeCount err=%v\n", err)
		}
	}

	numberOfCallsTodayMutex.RLock()
	retStr := fmt.Sprintf("stats "+
		"loc:%d/%d/p%d "+
		"glob:%d/%d "+
		"callsToday:%d "+
		"callSecs:%d "+
		"gor:%d",
		numberOfOnlineCallees, numberOfOnlineCallers, numberOfActivePureP2pCalls,
		numberOfGlobalCallees, numberOfGlobalCallers,
		numberOfCallsToday,			// from hub.processTimeValues() only for this server instance
		numberOfCallSecondsToday,	// from hub.processTimeValues() only for this server instance
		runtime.NumGoroutine())
	numberOfCallsTodayMutex.RUnlock()
	return retStr
}

var locationGermanyForTime *time.Location = nil
func operationalNow() time.Time {
	if locationGermanyForTime == nil {
		// use german time
		loc, err := time.LoadLocation("Europe/Berlin")
		if err != nil {
			panic(err)
		}
		locationGermanyForTime = loc
	}

	// get the actual real time
	return time.Now().In(locationGermanyForTime)
}

func logWantedFor(topic string) bool {
	logeventMutex.RLock()
	if logeventMap[topic] {
		logeventMutex.RUnlock()
		return true
	}
	logeventMutex.RUnlock()
	return false
}

func readConfig(init bool) {
	//fmt.Printf("readConfig '%s' ...\n", configFileName)
	configIni, err := ini.Load(configFileName)
	if err != nil {
		configIni = nil
		// ignore the error and use default values for everything
	}

	readConfigLock.Lock()
	if init {
		hostname = readIniString(configIni, "hostname", hostname, "127.0.0.1")
		httpPort = readIniInt(configIni, "httpPort", httpPort, 8067, 1)
		httpsPort = readIniInt(configIni, "httpsPort", httpsPort, 0, 1)
		httpToHttps = readIniBoolean(configIni, "httpToHttps", httpToHttps, false)
		wsPort = readIniInt(configIni, "wsPort", wsPort, 8071, 1)
		wssPort = readIniInt(configIni, "wssPort", wssPort, 0, 1)
		htmlPath = readIniString(configIni, "htmlPath", htmlPath, "webroot")
		insecureSkipVerify = readIniBoolean(configIni, "insecureSkipVerify", insecureSkipVerify, false)
		runTurn = readIniBoolean(configIni, "runTurn", runTurn, false)
		turnIP = readIniString(configIni, "turnIP", turnIP, "")
		turnPort = readIniInt(configIni, "turnPort", turnPort, 3739, 1)
		turnRealm = readIniString(configIni, "turnRealm", turnRealm, "")
		pprofPort = readIniInt(configIni, "pprofPort", pprofPort, 0, 1) //8980

		rtcdb = readIniString(configIni, "rtcdb", rtcdb, "")
		if rtcdb!="" && strings.Index(rtcdb, ":") < 0 {
			rtcdb = rtcdb + ":8061"
		}

		dbPath = readIniString(configIni, "dbPath", dbPath, "db/")

		twitterKey = readIniString(configIni, "twitterKey", twitterKey, "")
		twitterSecret = readIniString(configIni, "twitterKey", twitterKey, "")

		vapidPublicKey = readIniString(configIni, "vapidPublicKey", vapidPublicKey, "")
		vapidPrivateKey = readIniString(configIni, "vapidPrivateKey", vapidPrivateKey, "")
	}

	maintenanceMode = readIniBoolean(configIni, "maintenanceMode", maintenanceMode, false)
	allowNewAccounts = readIniBoolean(configIni, "allowNewAccounts", allowNewAccounts, true)

	multiCallees = readIniString(configIni, "multiCallees", multiCallees, "")

	logevents = readIniString(configIni, "logevents", logevents, "")
	logeventSlice := strings.Split(logevents, ",")

	logeventMutex.Lock()
	logeventMap = make(map[string]bool)
	for _, s := range logeventSlice {
		logeventMap[strings.TrimSpace(s)] = true
	}
	logeventMutex.Unlock()

	disconnectCalleesWhenPeerConnected = readIniBoolean(configIni,
		"disconnectCalleesWhenPeerConnected", disconnectCalleesWhenPeerConnected, false)
	disconnectCallersWhenPeerConnected = readIniBoolean(configIni,
		"disconnectCallersWhenPeerConnected", disconnectCallersWhenPeerConnected, true)
	calleeClientVersion = readIniString(configIni, "calleeClientVersion", calleeClientVersion, "")

	maxRingSecs = readIniInt(configIni, "maxRingSecs", maxRingSecs, 300, 1)
	maxTalkSecsIfNoP2p = readIniInt(configIni, "maxTalkSecsIfNoP2p", maxTalkSecsIfNoP2p, 600, 1)

	wsUrl = readIniString(configIni, "wsUrl", wsUrl, "")
	wssUrl = readIniString(configIni, "wssUrl", wssUrl, "")

	turnDebugLevel = readIniInt(configIni, "turnDebugLevel", turnDebugLevel, 3, 1)
	adminEmail = readIniString(configIni, "adminEmail", adminEmail, "")
	calllog = readIniString(configIni, "calllog", calllog, "")

	readConfigLock.Unlock()
}

func readStatsFile() {
	statsIni, err := ini.Load(statsFileName)
	if err != nil {
		//fmt.Printf("# cannot read ini file '%s', err=%v\n", statsFileName, err)
		return
	}

	iniKeyword := "numberOfCallsToday"
	iniValue,ok := readIniEntry(statsIni,iniKeyword)
	if ok {
		if iniValue=="" {
			numberOfCallsToday = 0
		} else {
			i64, err := strconv.ParseInt(iniValue, 10, 64)
			if err!=nil {
				fmt.Printf("# stats val %s: %s=%v err=%v\n",
					statsFileName, iniKeyword, iniValue, err)
			} else {
				//fmt.Printf("stats val %s: %s (%v) %v\n", statsFileName, iniKeyword, iniValue, i64)
				numberOfCallsToday = int(i64)
			}
		}
	}

	iniKeyword = "numberOfCallSecondsToday"
	iniValue,ok = readIniEntry(statsIni,iniKeyword)
	if ok {
		if iniValue=="" {
			numberOfCallsToday = 0
		} else {
			i64, err := strconv.ParseInt(iniValue, 10, 64)
			if err!=nil {
				fmt.Printf("# stats val %s: %s=%v err=%v\n",
					statsFileName, iniKeyword, iniValue, err)
			} else {
				//fmt.Printf("stats val %s: %s (%v) %v\n", statsFileName, iniKeyword, iniValue, i64)
				numberOfCallSecondsToday = int(i64)
			}
		}
	}

	iniKeyword = "lastCurrentDayOfMonth"
	iniValue,ok = readIniEntry(statsIni,iniKeyword)
	if ok {
		if iniValue=="" {
			lastCurrentDayOfMonth = 0
		} else {
			i64, err := strconv.ParseInt(iniValue, 10, 64)
			if err!=nil {
				fmt.Printf("# stats val %s: %s=%v err=%v\n",
					statsFileName, iniKeyword, iniValue, err)
			} else {
				//fmt.Printf("stats val %s: %s (%v) %v\n", statsFileName, iniKeyword, iniValue, i64)
				lastCurrentDayOfMonth = int(i64)
			}
		}
	}
}

func writeStatsFile() {
	filename := statsFileName
	os.Remove(filename)
	file,err := os.OpenFile(filename,os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		fmt.Printf("# error creating statsFile (%s) err=%v\n", filename, err)
		return
	}
	fwr := bufio.NewWriter(file)
	defer func() {
		if fwr!=nil {
			fwr.Flush()
		}
		if file!=nil {
			if err := file.Close(); err != nil {
				fmt.Printf("# error closing statsFile (%s) err=%s\n",filename,err)
			}
		}
	}()

	numberOfCallsTodayMutex.RLock()
	data := fmt.Sprintf("numberOfCallsToday = %d\n"+
						"numberOfCallSecondsToday = %d\n"+
						"lastCurrentDayOfMonth = %d\n",
		numberOfCallsToday, numberOfCallSecondsToday, lastCurrentDayOfMonth)
	numberOfCallsTodayMutex.RUnlock()
	wrlen,err := fwr.WriteString(data)
	if err != nil {
		fmt.Printf("# error writing statsFile (%s) data err=%s\n", filename, err)
		return
	}
	if wrlen != len(data) {
		fmt.Printf("# error writing statsFile (%s) dlen=%d wrlen=%d\n",
			filename, len(data), wrlen)
		return
	}
	fmt.Printf("writing statsFile (%s) dlen=%d wrlen=%d\n",
		filename, len(data), wrlen)
	fwr.Flush()
}

