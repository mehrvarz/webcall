// WebCall Copyright 2021 timur.mobi. All rights reserved.
package main

type DbEntry struct { // ~34 bytes
	StartTime int64   //   8 bytes
	Ip string         // ~16 bytes
	Password string   // ~10 bytes
}

type DbUser struct {
	Name string             // nickname, if given
	Ip1 string              // used for httpRegister
	UserAgent string        // used for httpRegister
	CallCounter int         // incremented by wsHub processTimeValues()
	ConnectedToPeerSecs int // incremented by wsHub processTimeValues()
	LocalP2pCounter int     // incremented by wsHub processTimeValues()
	RemoteP2pCounter int    // incremented by wsHub processTimeValues()
	PremiumLevel int        // if > 0: enables hamburger menu
	Email2 string           // now used as tw_handle
	Str1 string             // now used as tw_user_id
	Str2 string             // web push device 1 subscription
	Str2ua string           // web push device 1 user agent
	Str3 string             // web push device 2 subscription
	Str3ua string           // web push device 2 user agent
	Int2 int                // bit 0: hidden callee mode 0/1
}

type NotifTweet struct { // key = TweetID string
	TweetTime int64
	Comment string
}

