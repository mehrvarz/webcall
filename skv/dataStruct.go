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
	Ip1 string
	UserAgent string
	CallCounter int // incremented by wsHub processTimeValues()
	ConnectedToPeerSecs int // incremented by wsHub processTimeValues()
	PermittedConnectedToPeerSecs int // for relayed connections, not for p2p peer.connections
	LocalP2pCounter int // incremented by wsHub processTimeValues()
	RemoteP2pCounter int // incremented by wsHub processTimeValues()
	PremiumLevel int // if > 0 enables hamburger menu
	Email2 string // tw_handle
	Str1 string // tw_user_id
	Str2 string // web push device 1 subscription
	Str2ua string // web push device 1 user agent
	Str3 string // web push device 2 subscription
	Str3ua string // web push device 2 user agent
	Int2 int // bit 0: hidden callee mode 0/1
	//OfflineMsg string // currently not used
}

