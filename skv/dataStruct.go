// WebCall Copyright 2021 timur.mobi. All rights reserved.
package skv

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

