// WebCall Copyright 2021 timur.mobi. All rights reserved.
package rkv

type Command struct {
	MsgId int64
	KvStoreId int64
	Cmd string
	Arg string
	Key string
	Value []byte
	Bool1 bool
	Bool2 bool
	Bool3 bool
}

type Response struct {
	MsgId int64
	KvStoreId int64
	Err string
	Data []byte
	Str1 string
	Int1 int64
	Int2 int64
}

type Hub struct {
	IsCalleeHidden bool
	IsUnHiddenForCallerAddr string
	ConnectedCallerIp string
	ClientIpAddr string
	ServerIpAddr string // GetOutboundIP() of rtcsig cli, set by rkv.go StoreCalleeInHubMap()
	WsUrl string
	WssUrl string
	WsClientID uint64 // needed for /online; unique only for the server at WsUrl/WssUrl
}

