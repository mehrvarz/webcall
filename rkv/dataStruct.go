package rkv

// command is same as in rkv.go
type Command struct {
	MsgId int64
	KvStoreId int64
	Cmd string
	Arg string // filename for Open(), otherwise always bucketName
	Key string
	Value []byte
	Bool1 bool
	Bool2 bool
	Bool3 bool
}

// response is same as in rkv.go
type Response struct {
	MsgId int64
	KvStoreId int64 // only used for Open()
	Err string
	Data []byte // only used by Get, GetX
	Str1 string
	Int1 int64
	Int2 int64
}

type DbEntry struct { // ~40 bytes
	StartTime int64   // 8 bytes
	DurationSecs int  // 4 bytes "ServiceSecs" contract duration
	Ip string         // ~16 bytes
	Password string   // ~10 bytes
}

type NotifTweet struct { // key = TweetID string
	TweetTime int64
	Comment string
}

type DbUser struct {
	Name string // nickname
	PremiumLevel int
	PermittedConnectedToPeerSecs int // while using the relay (not for pure p2p peer.connections)
	Ip1 string // currently not used
	Ip2 string // currently not used
	Ip3 string // currently not used
	UserAgent string // currently not used
	UserAgent2 string // currently not used
	UserAgent3 string // currently not used
	PrevId string // currently not used
	CallCounter int // only used for dumpuser
	ConnectedToPeerSecs int
	LocalP2pCounter int
	RemoteP2pCounter int
	PhotoUrl string // currently not used
	OfflineMsg string // currently not used
	City string // currently not used
	Email1 string // currently not used
	Email2 string // tw_handle
	Str1 string // tw_user_id
	Str2 string // web push device 1 subscription
	Str2ua string // web push device 1 user agent
	Str3 string // web push device 2 subscription
	Str3ua string // web push device 2 user agent
	Int1 int // TODO: max number of parallel callees
	Int2 int // bit 0: hidden callee mode 0/1
	Int3 int // currently not used
	Flt1 float64 // currently not used
	Flt2 float64 // currently not used
	Flt3 float64 // currently not used
}

type Hub struct { // same as in rtcdb skv.dataStruct.go
	IsCalleeHidden bool
	IsUnHiddenForCallerAddr string
	ConnectedCallerIp string
	ClientIpAddr string
	ServerIpAddr string // GetOutboundIP() of rtcsig cli, set by rkv.go StoreCalleeInHubMap()
	WsUrl string
	WssUrl string
	WsClientID uint64 // needed for /online; unique only for the server at WsUrl/WssUrl
}

