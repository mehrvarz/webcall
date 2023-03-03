// WebCall Copyright 2023 timur.mobi. All rights reserved.

package main

import (
	"context"
	"fmt"
	"time"
	"strings"
	"strconv"
	"errors"
	"sync"
	"io"
	"os"
	"net/http"
	"math/rand"
	"golang.org/x/net/html"
	"github.com/mattn/go-mastodon"
	"github.com/mehrvarz/webcall/skv"
	"golang.org/x/crypto/bcrypt"
	"encoding/gob"
	"bytes"
	bolt "go.etcd.io/bbolt"
)

var	ErrTotalPostMsgQuota = errors.New("TotalPostMsgQuota")
var	ErrUserPostMsgQuota = errors.New("PostMsgQuota per user")
var	ErrConfigFormat = errors.New("Error config format")
var	ErrAuthenticate = errors.New("Error Authenticate")
var	ErrStreamingUser = errors.New("Error StreamingUser")
var	ErrDb = errors.New("Error db")

const dbMastodon = "rtcmastodon.db"
const dbMid = "dbMid"          // a map of all active mid's
type MidEntry struct {         // key = mid
	MastodonIdCallee string
	Created int64
}

type PostMsgEvent struct {
	calleeID string
	timestamp time.Time
	msgID mastodon.ID
}

type MastodonMgr struct {
	c *mastodon.Client
	hostUrl string
	midMutex sync.RWMutex
	kvMastodon skv.KV
	postedMsgEventsSlice []*PostMsgEvent
	postedMsgEventsMutex sync.RWMutex
	running bool
	ctx context.Context
	cancel context.CancelFunc
}

func NewMastodonMgr() *MastodonMgr {
	return &MastodonMgr{
		//inviterMap:  make(map[string]*Inviter),
		//midMap:      make(map[string]*MidEntry),
	}
}

func (mMgr *MastodonMgr) mastodonInit() {
	fmt.Print("mastodonInit Enter Mastodon target domain name: ")
	var domainname string
	_, err := fmt.Scanln(&domainname)
	if err != nil {
		fmt.Printf("# mastodonInit Scanln error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Mastodon domain name: %s\n", domainname)

	server := "https://"+domainname
	srv, err := mastodon.RegisterApp(context.Background(), &mastodon.AppConfig{
		Server:       server,
		ClientName:   "WebCall-Telephony",
		Scopes:       "read write", // follow push",
		RedirectURIs: "urn:ietf:wg:oauth:2.0:oob",
		Website:      "https://timur.mobi/webcall",
	})
	if err != nil {
		fmt.Printf("# mastodonInit Couldn't register app. Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Please autorize webcall to use your account.")
	fmt.Println("Open browser with this URL:")
	fmt.Printf("%s\n", srv.AuthURI)

	var client *mastodon.Client
	for {
		fmt.Print("Enter authorization code: ")
		var err error
		var codeStr string
		_, err = fmt.Scanln(&codeStr)
		if err != nil {
			fmt.Printf("# mastodonInit Scanln error: %v\n", err)
			os.Exit(1)
		}
		//fmt.Printf("number of items read: %d\n", n)
		fmt.Printf("authorization code: %s\n", codeStr)
		fmt.Printf("ClientID: %s\n", srv.ClientID)
		fmt.Printf("ClientSecret: %s\n", srv.ClientSecret)

		client = mastodon.NewClient(&mastodon.Config{
			Server:       server,
			ClientID:     srv.ClientID,
			ClientSecret: srv.ClientSecret,
		})

		err = client.AuthenticateToken(context.Background(), codeStr, "urn:ietf:wg:oauth:2.0:oob")
		if err != nil {
			fmt.Printf("# mastodonInit AuthenticateToken Error: %v\nTry again or press ^C.\n", err)
			fmt.Println("--------------------------------------------------------------")
		} else {
			break
		}
	}
	fmt.Printf("mastodonInit generated AccessToken=%s\n", client.Config.AccessToken)

	me, err := client.GetAccountCurrentUser(context.Background())
	if err != nil {
		fmt.Printf("# mastodonInit Couldn't get user. Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("mastodonInit account username=%s\n", me.Username)
	//fmt.Printf("me=%v\n", me)

	// generate + print config-key 'mastodonhandler'
	fmt.Printf("mastodonInit config.ini entry:\n")
	fmt.Printf("mastodonhandler = %s|%s|%s|%s|%s\n",
		domainname, client.Config.Server, client.Config.ClientID, client.Config.ClientSecret,
		client.Config.AccessToken)
}

func (mMgr *MastodonMgr) mastodonStart(config string) error {
	// only start if not already running
	if mMgr.running {
		fmt.Printf("# mastodonStart already running\n")
		return nil
	}
	// config format: 'mastodon-domain|server-url|ClientID|ClientSecret|username|password'
	tokSlice := strings.Split(config, "|")
	if len(tokSlice)!=5 {
		fmt.Printf("# mastodonStart config must have 5 tokens, has %d (%s)\n",len(tokSlice),config)
		return ErrConfigFormat
	}

	fmt.Printf("mastodonStart (%s) ...\n",tokSlice[0])

	// create mMgr.hostUrl
	// note hostname and httpsPort are init config-vars, they do not changed at runtime
	mMgr.hostUrl = "https://"+hostname
	if httpsPort>0 {
		mMgr.hostUrl += ":"+strconv.FormatInt(int64(httpsPort),10)
	}
	fmt.Printf("mastodonStart mMgr.hostUrl=(%s)\n",mMgr.hostUrl)

	fmt.Printf("mastodonStart mastodon.NewClient (%s) (%s) (%s) (%s)\n",
		tokSlice[1],tokSlice[2],tokSlice[3],tokSlice[4])
	mMgr.c = mastodon.NewClient(&mastodon.Config{
		Server:       tokSlice[1],
		ClientID:     tokSlice[2],
		ClientSecret: tokSlice[3],
		AccessToken:  tokSlice[4],
	})

//	fmt.Printf("mastodonStart c.Config.AccessToken1=(%s)\n",mMgr.c.Config.AccessToken)
	fmt.Printf("mastodonStart c.Config1=(%s)\n",mMgr.c.Config)

	mMgr.ctx, mMgr.cancel = context.WithCancel(context.Background())
/*
	err := mMgr.c.AuthenticateApp(mMgr.ctx)
	if err != nil {
		fmt.Printf("# mastodonStart fail Authenticate (%v)\n",err)
		return ErrAuthenticate
	}

	err := mMgr.c.Authenticate(context.Background(), tokSlice[5], tokSlice[6])
	if err != nil {
		fmt.Printf("# mastodonStart fail Authenticate (%v)\n",err)
		return ErrAuthenticate
	}

	err := mMgr.c.AuthenticateToken(context.Background(),mMgr.c.Config.AccessToken,"urn:ietf:wg:oauth:2.0:oob")
	if err != nil {
		fmt.Printf("# Error AuthenticateToken: %v\n", err)
		return ErrAuthenticate
	} 

	fmt.Printf("mastodonStart authenticated\n")
//	fmt.Printf("mastodonStart c.Config.AccessToken2=(%s)\n",mMgr.c.Config.AccessToken)
	fmt.Printf("mastodonStart c.Config2=(%s)\n",mMgr.c.Config)
//	mMgr.c.Config.AccessToken = tokSlice[4]
//	fmt.Printf("mastodonStart c.Config.AccessToken2=(%s)\n",mMgr.c.Config.AccessToken)
//	fmt.Printf("mastodonStart c.Config2b=(%s)\n",mMgr.c.Config)
*/
	chl,err := mMgr.c.StreamingUser(mMgr.ctx)
	if err != nil {
		fmt.Printf("# mastodonStart fail StreamingUser (%v)\n",err)
		return ErrStreamingUser
	}
	fmt.Printf("mastodonStart got StreamingUser\n")
//	fmt.Printf("mastodonStart c.Config.AccessToken3=(%s)\n",mMgr.c.Config.AccessToken)
	fmt.Printf("mastodonStart c.Config3=(%s)\n",mMgr.c.Config)

	mMgr.kvMastodon,err = skv.DbOpen(dbMastodon,dbPath)
	if err!=nil {
		fmt.Printf("# error DbOpen %s path %s err=%v\n",dbMastodon,dbPath,err)
		return ErrDb
	}
	err = mMgr.kvMastodon.CreateBucket(dbMid)
	if err!=nil {
		fmt.Printf("# error db %s CreateBucket %s err=%v\n",dbMastodon,dbMid,err)
		mMgr.kvMastodon.Close()
		return ErrDb
	}

	mMgr.postedMsgEventsSlice = nil //[]PostMsgEvent
	mMgr.running = true

	go func() {
		time.Sleep(5 * time.Second)
		fmt.Printf("mastodonStart reading StreamingUser...\n")
		for {
			select {
			case <-mMgr.ctx.Done():
				fmt.Printf("mastodonhandler abort on context.Done\n")
				mMgr.running = false
				return
			case evt := <-chl:
				//fmt.Println(evt)
				switch event := evt.(type) {
				case *mastodon.NotificationEvent:
					// direct msgs
					fmt.Printf("mastodonhandler Notif-Type=(%v) Acct=(%v)\n",
						event.Notification.Type, event.Notification.Account.Acct)
					content := event.Notification.Status.Content
					//fmt.Printf("mastodonhandler Content=(%v)\n",content)
					// sample html-notification with textMessage ' setup':
					//<p><span class="h-card"><a href="https://mastodon.social/@timurmobi" class="u-url mention" rel="nofollow noopener noreferrer" target="_blank">@<span>timurmobi</span></a></span> setup</p>
					// to get the textMessage we first remove the <p> tag at start and end
					// then we html-parse the remaining content and ignore all html-tages
					if strings.HasPrefix(content,"<p>") {
						content = content[3:]
						if strings.HasSuffix(content,"</p>") {
							content = content[0:len(content)-4]
						}
						fmt.Printf("mastodonhandler stripped p Content=(%v)\n",content)
					}

					command := ""
					htmlTokens := html.NewTokenizer(strings.NewReader(content))
					depth := 0
					loop:
					for {
						tt := htmlTokens.Next()
						switch tt {
						case html.StartTagToken:
							//t := htmlTokens.Token()
							//fmt.Println("StartTagToken",t.Data)
							depth++
						case html.EndTagToken:
							//t := htmlTokens.Token()
							//fmt.Println("EndTagToken",t.Data)
							depth--
						case html.TextToken:
							if depth==0 {
								t := htmlTokens.Token()
								textMessage := t.Data
								if textMessage!="" {
									fmt.Printf("mastodonhandler TextToken=(%v)\n",textMessage) // ' test2'
									command += textMessage + " "
								}
								break
							}
						case html.ErrorToken:
							//fmt.Printf("mastodonhandler ErrorToken re-loop\n")
							break loop
						}
					}
					//fmt.Printf("mastodonhandler Notif-Type=(%v) done\n", event.Notification.Type)
					mMgr.processMessage(command,event,tokSlice[0])

				/*case *mastodon.UpdateEvent:
					// none-direct msgs
					if event.Status.Content!="" {
						fmt.Printf("mastodonhandler UpdateEvent content=(%v)\n",event.Status.Content)
					} else {
						fmt.Printf("mastodonhandler UpdateEvent reblog=(%v)\n",event.Status.Reblog)
					}
				*/
				case *mastodon.DeleteEvent:
					// interesting: when an inviter deletes his 'please reply' msg
					// webcall gets a notification here (or maybe I misunderstood something)
					fmt.Printf("mastodonhandler DeleteEvent id=(%v)\n",event.ID)

				case *mastodon.ErrorEvent:
					fmt.Printf("# mastodonhandler ErrorEvent '%v'\n",event.Error())
					if !mMgr.running {
						break
					}
					if strings.Index(event.Error(),"404 Not Found")>=0 {
						// "bad request: 404 Not Found" 
						// iptables issue with fastly?
						// slow down
						time.Sleep(20 * time.Second)
					} else if strings.Index(event.Error(),"Invalid access token")>=0 {
						// "bad request: 401 Unauthorized: Error: Invalid access token"
						// slow down
						time.Sleep(3 * time.Second)
					} else if strings.Index(event.Error(),"403 Forbidden")>=0 {
						// slow down
						time.Sleep(20 * time.Second)
					} else if strings.Index(event.Error(),"unknown authority")>=0 {
						// "x509: certificate signed by unknown authority"
						// slow down
						time.Sleep(20 * time.Second)
					}
					if !mMgr.running {
						break
					}

					// "stream error: stream ID 1; INTERNAL_ERROR; received from peer"
					//   ???

				/*default:
					fmt.Printf("mastodonhandler default\n")
				*/
				}
			}
		}

		mMgr.running = false
	}()
	return nil
}

func (mMgr *MastodonMgr) dbSync() {
	// called by timer.go callBackupScript()
	if mMgr.kvMastodon!=nil {
		kv := mMgr.kvMastodon.(skv.SKV)
		if err := kv.Db.Sync(); err != nil {
			fmt.Printf("# mastodon dbSync error: %s\n", err)
		}
	}
}

func (mMgr *MastodonMgr) processMessage(msg string, event *mastodon.NotificationEvent, domainName string) {
	msg = strings.TrimSpace(msg)

	mastodonUserId := event.Notification.Account.Acct // from
	if strings.Index(mastodonUserId,"@")<0 {
		// this notif was sent by a user on "our" instance
		mastodonUserId += "@"+domainName
	}

	msgID := fmt.Sprint(event.Notification.Status.ID)
	if msgID=="" || msgID == "<nil>" {
		// can't work without a msgID
		fmt.Printf("# mastodon processMessage empty event.Notification.Status.ID\n")
		return
	}

	inReplyToID := fmt.Sprint(event.Notification.Status.InReplyToID)
	if inReplyToID == "<nil>" { inReplyToID = "" }

	tok := strings.Split(msg, " ")
	fmt.Printf("mastodon processMessage msg=(%v) msgId=%v InReplyToID=%v RecipientCount=%d lenTok=%d\n",
		msg, msgID, inReplyToID, -1, len(tok))

	if len(tok)>0 {
		command := strings.ToLower(strings.TrimSpace(tok[0]))
		switch {
		case command=="setup":
			fmt.Printf("mastodon command setup (%v)\n", mastodonUserId)
			mMgr.commandSetup(mastodonUserId,true)
			return

		case command=="remove":
			// here we delete the webcall id specified in mastodonUserId 
			fmt.Printf("mastodon command remove (%v)\n", mastodonUserId)
// TODO user needs to first enable command 'remove' in the web-app
			mMgr.commandRemove(mastodonUserId,true)
			return

		case command=="ping":
			// send pong msg back with 20s delay
			sendmsg :="@"+mastodonUserId+" pong"
			fmt.Printf("mastodon command ping post (%s)\n",sendmsg)
			mMgr.postMsgEx(sendmsg,mastodonUserId,20,func(err error) {
				if err!=nil {
					fmt.Printf("# mastodon command ping reply err=%v (to=%v)\n",err,mastodonUserId)
				} else {
					fmt.Printf("mastodon command ping reply to=%v\n", mastodonUserId)
				}
			})
			return
		}
	}
}

func (mMgr *MastodonMgr) commandSetup(mastodonUserId string, postback bool) {
	mappingMutex.RLock()
	mappingData,ok := mapping[mastodonUserId]
	mappingMutex.RUnlock()
	if ok {
		// if mastodonUserId is already an alt-ID, then sending a register-link is useless
		fmt.Printf("mastodon command setup (%s) already associated with (%s)\n",
			mastodonUserId,mappingData.CalleeId)
		if postback {
			sendmsg :="@"+mastodonUserId+" is already associated"
			fmt.Printf("mastodon command setup post (%s)\n",sendmsg)
			mMgr.postMsgEx(sendmsg, mastodonUserId, 0, func(err error) {
				if err!=nil {
					fmt.Printf("# mastodon command setup post err=%v (to=%v)\n",err,mastodonUserId)
				} else {
					fmt.Printf("mastodon command setup post sent to=%v\n", mastodonUserId)
				}
			})
		}
		return
	}

	// now check for main-id
	var dbEntry DbEntry
	var dbUser DbUser
	err := kvMain.Get(dbRegisteredIDs, mastodonUserId, &dbEntry)
	if err != nil {
		if strings.Index(err.Error(), "skv key not found") < 0 {
			// some other error
			fmt.Printf("# mastodon command setup get dbRegisteredID %s err=%v\n",mastodonUserId,err)
			return
		}
		// this is good: key not found
	} else {
		// dbRegisteredIDs key was found
		dbUserKey := fmt.Sprintf("%s_%d", mastodonUserId, dbEntry.StartTime)
		err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
		if err != nil {
			if strings.Index(err.Error(), "skv key not found") < 0 {
				// some other error
				fmt.Printf("# mastodon command setup get dbUserBucket %s err=%v\n",mastodonUserId,err)
				return
			}
			// TODO this is good? key not found
		} else {
			// key exists
			sendmsg :="@"+mastodonUserId+" user exists"
			fmt.Printf("mastodon command setup (%s)\n",sendmsg)
			if postback {
				mMgr.postMsgEx(sendmsg, mastodonUserId, 0, func(err error) {
					if err!=nil {
						fmt.Printf("# mastodon command setup2 post err=%v (to=%v)\n",err,mastodonUserId)
					} else {
						fmt.Printf("mastodon command setup2 post sent to=%v\n", mastodonUserId)
					}
				})
			}
			return
		}
	}

	// mastodonUserId is not yet being used

	// NOTE: msg1 must end with a blank
	msg1 := "Setup your WebCall ID: "
	// NOTE: msg2 must start with a blank
	msg2 := "" //" (active for 20 minutes)" // see "20*60" in cleanupMastodonMidMap()

	// arg2: no callerID to notify after callee-login
	// arg4: no msgID to notify after callee-login
	err = mMgr.offerRegisterLink(mastodonUserId, "", msg1, msg2, "", "/callee/mastodon/setup", postback)
	if err!=nil {
		fmt.Printf("# mastodon processMessage offerRegisterLink err=%v\n",err)
		// post msg telling user that request has failed
		// what makes responding here difficult is that offerRegisterLink() may fail on different things:
		//   create secret, error on kvMastodon.Put(dbMid/dbInviter/dbCid), error on postMsgEx()
		sendmsg :="@"+mastodonUserId+" sorry, I am not able to proceed with your request"
		mMgr.postMsgEx(sendmsg, mastodonUserId, 0, func(err error) {
			if err!=nil {
				fmt.Printf("# mastodon processMessage offerRegisterLink post (%s) failed %v\n",sendmsg,err)
			} else {
				fmt.Printf("mastodon processMessage offerRegisterLink posted (%s)\n",sendmsg)
			}
		})
	}
}

func (mMgr *MastodonMgr) commandRemove(mastodonUserId string, postback bool) {
	// first check mapping[]
	mappingMutex.RLock()
	mappingData,ok := mapping[mastodonUserId]
	mappingMutex.RUnlock()
	if ok {
		var err error
		fmt.Printf("mastodon command remove: found mapping %s->%s\n",
			mastodonUserId, mappingData.CalleeId)
		if mappingData.CalleeId!="" && mappingData.CalleeId!=mastodonUserId {
			// this is a calleeID with an (associated) alt-id
			mappingMutex.Lock()
			delete(mapping,mastodonUserId)
			mappingMutex.Unlock()

			// remove alt-id from mappingData.CalleeId
			err = mMgr.storeAltId(mappingData.CalleeId, "", "")

			if postback {
				sendmsg :="@"+mastodonUserId+" on your request your ID has been deactivated"
				if err!=nil {
					// post msg telling user that remove has failed
					sendmsg ="@"+mastodonUserId+" sorry, I am unable to proceed with your request"
				}
				mMgr.postMsgEx(sendmsg, mastodonUserId, 0, func(err error) {
					if err!=nil {
						fmt.Printf("# mastodon command remove: post (%s) failed (%v)\n",sendmsg,err)
					} else {
						fmt.Printf("mastodon command remove: (%s) posted\n",sendmsg)
					}
				})
			}

			// do NOT delete the user account of mappingData.CalleeId
			// end processMessage here
			return
		}
// TODO must check this
		// fall through
	}

	// now check for main-id
	var dbEntryRegistered DbEntry
	err := kvMain.Get(dbRegisteredIDs,mastodonUserId,&dbEntryRegistered)
	if err!=nil {
		if strings.Index(err.Error(),"key not found")>0 {
			fmt.Printf("# mastodon command remove user=%s err=%v\n", mastodonUserId, err)
		}
		// ignore! no need to notify user by msg (looks like an invalid request)
	} else {
		// mastodonUserId is a registered calleeID

		// if user is currently online / logged-in as callee
		hubMapMutex.RLock()
		hub := hubMap[mastodonUserId]
		hubMapMutex.RUnlock()
		if hub != nil {
			// disconnect online callee user
			hub.closeCallee("unregister") // -> hub.exitFunc()
			// new callee.js will delete cookie on "User ID unknown"
		}

		dbUserKey := fmt.Sprintf("%s_%d", mastodonUserId, dbEntryRegistered.StartTime)

		// delete/outdate mapped tmpIDs of outdated mastodonUserId
		errcode,altIDs := getMapping(mastodonUserId,"")
		if errcode==0 && altIDs!="" {
			tokenSlice := strings.Split(altIDs, "|")
			for _, tok := range tokenSlice {
				deleteMapping(mastodonUserId,tok,"")
			}
		}

		// also delete mastodonUserId's contacts
		err = kvContacts.Delete(dbContactsBucket, mastodonUserId)
		if err!=nil {
			fmt.Printf("# mastodon command remove contacts of id=%s err=%v\n",
				mastodonUserId, err)
			// not fatal
		}

		kv := kvMain.(skv.SKV)
		err = kv.Delete(dbUserBucket, dbUserKey)
		if err!=nil {
			// this is fatal
			fmt.Printf("# mastodon command remove user-key=%s err=%v\n", dbUserKey, err)
		} else {
			fmt.Printf("mastodon command remove user-key=%s done\n", dbUserKey)

			err = kvMain.Delete(dbRegisteredIDs, mastodonUserId)
			if err!=nil {
				// this is fatal
				fmt.Printf("# mastodon command remove user-id=%s err=%v\n", mastodonUserId, err)
			} else {
				fmt.Printf("mastodon command remove user-id=%s done\n", mastodonUserId)
			}
		}

		if err!=nil {
			if postback {
				// send msg telling user that remove has failed
				sendmsg :="@"+mastodonUserId+" sorry, I am not able to proceed with your request"
				mMgr.postMsgEx(sendmsg, mastodonUserId, 0, func(err error) {
					if err!=nil {
						fmt.Printf("# mastodon command remove: post (%s) failed (%v)\n",sendmsg,err)
					} else {
						fmt.Printf("mastodon command remove: posted (%s)\n",sendmsg)
					}
				})
			}
			return
		}

		// dbUser has been deactivated
// TODO NOTE: callee-user may still be online
		// send msg telling user that their webcall account has been deactivated
		if postback {
			sendmsg :="@"+mastodonUserId+" on your request your ID has been deleted"
			mMgr.postMsgEx(sendmsg, mastodonUserId, 0, func(err error) {
				if err!=nil {
					fmt.Printf("# mastodon command remove: post (%s) failed (%v)\n",sendmsg,err)
				} else {
					fmt.Printf("mastodon command remove: posted (%s)\n",sendmsg)
				}
			})
		}

		// also delete missed calls
		var missedCallsSlice []CallerInfo
		err = kvCalls.Put(dbMissedCalls, mastodonUserId, missedCallsSlice, false)
		if err!=nil {
			fmt.Printf("# mastodon command remove (%s) fail store dbMissedCalls\n", mastodonUserId)
			// not fatal
		}

		// also delete HashedPw
		err = kvHashedPw.Delete(dbHashedPwBucket, mastodonUserId)
		if err!=nil {
			fmt.Printf("# mastodon command remove (%s) fail delete hashedPw\n", mastodonUserId)
			// not fatal
		}
	}
	// end processMessage here
}

func (mMgr *MastodonMgr) offerRegisterLink(mastodonUserId string, mastodonCallerUserId string, msg1 string, msg2 string, msgID string, path string, postback bool) error {
	// offer link to /pickup, with which mastodonUserId can be registered
	// first we need a unique mID (refering to mastodonUserId)

//TODO we could check right here if mastodonUserId is already given
// like in httpGetMidUser()
//	hubMapMutex.RLock()
//	hub := hubMap[mastodonUserId]
//	hubMapMutex.RUnlock()
//	if hub!=nil {

	mMgr.midMutex.Lock()
	mID,err := mMgr.makeSecretID() //"xxxxxxxxxxx"
	if err!=nil {
		// this is fatal
		mMgr.midMutex.Unlock()
		fmt.Printf("# offerRegisterLink register makeSecretID err=(%v)\n", err)
		return err
	}
	midEntry := &MidEntry{}
	midEntry.MastodonIdCallee = mastodonUserId
	midEntry.Created = time.Now().Unix()

	if mMgr.kvMastodon==nil {
		fmt.Printf("# offerRegisterLink mMgr.kvMastodon==nil\n")
		return errors.New("no mMgr.kvMastodon")
	}
	err = mMgr.kvMastodon.Put(dbMid, mID, midEntry, false)
	if err != nil {
		fmt.Printf("# offerRegisterLink mID=%v failed to store midEntry\n", mID)
		return err
	}
	mMgr.midMutex.Unlock()

	sendmsg :="@"+mastodonUserId+" " + msg1 + mMgr.hostUrl + path + "?mid=" + mID + msg2
	fmt.Printf("offerRegisterLink PostStatus (%s)\n",sendmsg)
	if postback {
		mMgr.postMsgEx(sendmsg, mastodonUserId, 0, func(err error) {
			if err!=nil {
				fmt.Printf("# offerRegisterLink post err=%v (to=%v)\n",err,mastodonUserId)
// TODO unfortunately we can't inform the user of this problem
			} else {
				fmt.Printf("offerRegisterLink posted to=%v\n", mastodonUserId)
			}
		})
	}
	return nil
}

func (mMgr *MastodonMgr) makeSecretID() (string,error) {
	// called by offerRegisterLink()
	// mMgr.midMutex must be locked outside
	tries := 0
	for {
		tries++
		intID := uint64(rand.Int63n(int64(99999999999)))
		if(intID<uint64(10000000000)) {
			continue;
		}
		newSecretId := strconv.FormatInt(int64(intID),10)

		if mMgr.kvMastodon==nil {
			fmt.Printf("# offerRegisterLink mMgr.kvMastodon==nil\n")
			return "",errors.New("no mMgr.kvMastodon")
		}
		midEntry := &MidEntry{}
		err := mMgr.kvMastodon.Get(dbMid, newSecretId, midEntry)
		if err == nil {
			// already taken
			continue;
		}

		if tries>=10 {
			fmt.Printf("# secretID (%s) tries=%d\n", newSecretId, tries)
			return "",errors.New("failed to create unique newSecretId")
		}
		return newSecretId,nil
	}
}

func (mMgr *MastodonMgr) postMsgEx(sendmsg string, onBehalfOfUser string, delaySecs int, callback func(error)) error {
	fmt.Printf("postMsgEx PostStatus (%s)\n",sendmsg)
	mMgr.cleanupPostedMsgEvents(nil)

// TODO move constants 100 and 5 (per 30m) to top
	// rate limit total number of posted msgs (100 per 30min)
	msgsPostedTotalInLast30Min := len(mMgr.postedMsgEventsSlice)
	if msgsPostedTotalInLast30Min >= 100 {
		fmt.Printf("# postMsgEx # of msgs posted in the last 30min %d >= 100\n",
			msgsPostedTotalInLast30Min)
		if callback!=nil { callback(ErrTotalPostMsgQuota) }
		return ErrTotalPostMsgQuota
	}

	// rate limit # of msgs posted onBehalfOfUser (5 per 30min)
	mMgr.postedMsgEventsMutex.RLock()
	msgsPostedInLast30Min := 0
	for _,postedMsgEvent := range mMgr.postedMsgEventsSlice {
		if postedMsgEvent.calleeID == onBehalfOfUser {
			msgsPostedInLast30Min++
		}
	}
	mMgr.postedMsgEventsMutex.RUnlock()
	if msgsPostedInLast30Min >= 5 {
		fmt.Printf("# postMsgEx # of msgs posted for %s in the last 30min %d >= 5\n",
			onBehalfOfUser, msgsPostedInLast30Min)
		if callback!=nil { callback(ErrUserPostMsgQuota) }
		return ErrUserPostMsgQuota
	}

	mMgr.postedMsgEventsMutex.Lock()
	postMsgEvent := PostMsgEvent{onBehalfOfUser,time.Now(),""}
	mMgr.postedMsgEventsSlice = append(mMgr.postedMsgEventsSlice,&postMsgEvent)
	mMgr.postedMsgEventsMutex.Unlock()

	go func() {
		if delaySecs>0 {
			time.Sleep(time.Duration(delaySecs) * time.Second)
		}
		// NOTE PostStatus() stalls until msg is sent, which can take a random amount of time (say 27s)
		status,err := mMgr.c.PostStatus(mMgr.ctx, &mastodon.Toot{
			Status:			sendmsg,
			Visibility:		"direct",
		})
		if err!=nil {
			fmt.Printf("# postMsgEx PostStatus err=%v\n",err)
		} else {
			fmt.Printf("postMsgEx PostStatus sent id=%v (last 30min: total=%d, for%s=%d)\n",
				status.ID, msgsPostedTotalInLast30Min, onBehalfOfUser, msgsPostedInLast30Min)
			postMsgEvent.msgID = status.ID
		}
		if callback!=nil { callback(err) }
	}()
	return nil
}

func (mMgr *MastodonMgr) httpGetMidUser(w http.ResponseWriter, r *http.Request, cookie *http.Cookie, remoteAddr string) {
	// /getmiduser
	fmt.Printf("httpGetMidUser...\n")

	url_arg_array, ok := r.URL.Query()["mid"]
	if !ok {
		fmt.Printf("# httpGetMidUser fail URL.Query mid\n")
		return
	}
	if len(url_arg_array[0]) < 1 {
		fmt.Printf("# httpGetMidUser len(url_arg_array[0])<1 (%v)\n",url_arg_array)
		return
	}
	mid := url_arg_array[0]
	fmt.Printf("httpGetMidUser mid=%s\n",mid)
	if(mid=="") {
		// no mid given
		fmt.Printf("# httpGetMidUser no mid=%v ip=%v\n",mid,remoteAddr)
		return
	}
	//fmt.Printf("httpGetMidUser mid=%s ip=%v\n",mid,remoteAddr)

	cid := ""
	url_arg_array, ok = r.URL.Query()["cid"]
	if ok && len(url_arg_array[0]) >= 1 {
		cid = url_arg_array[0]
	}
	fmt.Printf("httpGetMidUser mid=%s cid=%s ip=%v\n",mid,cid,remoteAddr)

	calleeIdOnMastodon := ""

	midEntry := &MidEntry{}
	err := mMgr.kvMastodon.Get(dbMid, mid, midEntry)
	if err != nil {
		fmt.Printf("! httpGetMidUser invalid or outdated mid=%s err=%v\n",mid,err)
		return
	}
	calleeIdOnMastodon = midEntry.MastodonIdCallee
	fmt.Printf("httpGetMidUser get midEntry mid=%s calleeIdOnMastodon=%s ok\n",mid,calleeIdOnMastodon)

	isValidCalleeID := "false"
	isOnlineCalleeID := "false"
	wsCliMastodonID := ""
	calleeID := ""
	if(calleeIdOnMastodon=="") {
		// given mid is invalid
		fmt.Printf("! httpGetMidUser invalid or outdated mid=%s calleeIdOnMastodon=%v ip=%v\n",
			mid,calleeIdOnMastodon,remoteAddr)
		return
	}

	// calleeIdOnMastodon is set, therefor: mid is valid
	// let's see if calleeIdOnMastodon is mapped to a 11-digit calleeID
	fmt.Printf("httpGetMidUser mid=%s calleeIdOnMastodon=%v ip=%v\n",
		mid, calleeIdOnMastodon, remoteAddr)
	calleeID = calleeIdOnMastodon
	mappingMutex.RLock()
	mappingData,ok := mapping[calleeIdOnMastodon]
	mappingMutex.RUnlock()
	if ok {
		fmt.Printf("httpGetMidUser calleeIdOnMastodon=%v is mapped %s\n",calleeIdOnMastodon,mappingData.CalleeId)
		isValidCalleeID = "true"
		if mappingData.CalleeId!="" {
			// calleeIdOnMastodon is mapped to a 11-digit calleeID
			calleeID = mappingData.CalleeId
			fmt.Printf("httpGetMidUser mapped calleeID=%s calleeIdOnMastodon=%v ip=%v\n",
				calleeID,calleeIdOnMastodon,remoteAddr)
		}
	}

	// lets see if calleeID is online (or at least a valid account)
	hubMapMutex.RLock()
	hub := hubMap[calleeID]
	hubMapMutex.RUnlock()
	if hub!=nil {
		// calleeID is online (so it is valid)
		isOnlineCalleeID = "true"
		isValidCalleeID = "true"
		if hub.CalleeClient!=nil {
			// hub.CalleeClient.mastodonID is set by registerID in /registermid (httpRegisterMid())
			wsCliMastodonID = hub.CalleeClient.mastodonID
		}
	} else {
		// no hub currently exists: calleeID is NOT online: check if calleeID is a valid account
		if isValidCalleeID!="true" {
			dbUser := mMgr.isValidCallee(calleeID)
			if dbUser!=nil {
				// calleeID is NOT online, but account is valid
				isValidCalleeID = "true"
				wsCliMastodonID = dbUser.MastodonID
			}
		}
	}

	cMastodonID := ""
	cMastodonIDOnline := ""
	if cid!="" {
		cdbUser := mMgr.isValidCallee(cid)
		if cdbUser!=nil {
			// cid account is valid
			cMastodonID = cdbUser.MastodonID

			hubMapMutex.RLock()
			hub := hubMap[cMastodonID]
			hubMapMutex.RUnlock()
			if hub!=nil {
				cMastodonIDOnline = "true"
			}
		}
	}

	// NOTE: calleeID may be same as calleeIdOnMastodon, or may be a 11-digit ID
	// NOTE: wsCliMastodonID may be calleeIdOnMastodon or empty string
	codedString := calleeIdOnMastodon+"|"+isValidCalleeID+"|"+isOnlineCalleeID+"|"+
		calleeID+"|"+wsCliMastodonID+"||"+cMastodonID+"|"+cMastodonIDOnline
	fmt.Printf("httpGetMidUser codedString=%v\n",codedString)
	fmt.Fprintf(w,codedString)
	return
}

func (mMgr *MastodonMgr) isValidCallee(calleeID string) *DbUser {
	var dbEntry DbEntry

	mappingMutex.RLock()
	mappingData,ok := mapping[calleeID]
	mappingMutex.RUnlock()
	if ok && mappingData.CalleeId != "" {
		// calleeID found in mapping[] and mappingData.CalleeId is set
		// this means: calleeID is a mastodon or a mapping ID, and mappingData.CalleeId the 11-digit ID
		fmt.Printf("isValidCallee(%s) used for mapping\n",calleeID)
		var dbUser = &DbUser{}
		dbUser.MastodonID = calleeID
		return dbUser
	}
	fmt.Printf("isValidCallee(%s) NOT used for mapping\n",calleeID)

	err := kvMain.Get(dbRegisteredIDs, calleeID, &dbEntry)
	if err != nil {
		if strings.Index(err.Error(),"key not found")>0 {
			// this is not an error
			fmt.Printf("isValidCallee(%s) NOT used as main id\n",calleeID)
		} else {
			fmt.Printf("# isValidCallee(%s) dbEntry err=%v\n",calleeID,err)
		}
	} else {
		dbUserKey := fmt.Sprintf("%s_%d", calleeID, dbEntry.StartTime)
		var dbUser DbUser
		err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
		if err != nil {
			// no error: account does not (yet) exist or was deleted
			//fmt.Printf("# isValidCallee(%s) dbUser err=%v\n",calleeID,err)
		} else {
			// calleeID has a valid account
			return &dbUser
		}
	}
	return nil
}

func (mMgr *MastodonMgr) storeAltId(calleeID string, mastodonUserID string, remoteAddr string) error {
	// set mastodonUserID as alt-id for calleeID (11-digit)
	// - store mastodonUserID in dbUser and in mapping[]
	// - so 11-digit ID does not need to be entered again next time a mastodon call request comes in
	// called by httpStoreAltID(), sendCallerLink(), command=="remove" (with mastodonUserID=="")
	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs,calleeID,&dbEntry)
	if err!=nil {
		// calleeID was not yet registered
		fmt.Printf("# storeAltId numeric(%s) fail db=%s bucket=%s not yet registered\n",
			calleeID, dbMainName, dbRegisteredIDs)
		return err
	}
	dbUserKey := fmt.Sprintf("%s_%d",calleeID, dbEntry.StartTime)
	var dbUser DbUser
	err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
	if err!=nil {
		fmt.Printf("# storeAltId numeric(%s) fail on dbUserBucket ip=%s\n", calleeID, remoteAddr)
		return err
	}

	if mastodonUserID=="" {
		// remove AltId: only clear dbUser.MastodonID
		dbUser.MastodonID = mastodonUserID
		dbUser.MastodonSendTootOnCall = false
		dbUser.AskCallerBeforeNotify = false

	} else {
		// create AltId
		if dbUser.MastodonID!="" && dbUser.MastodonID!=mastodonUserID {
			// SUSPICIOUS?
			fmt.Printf("! storeAltId numeric(%s) dbUser.MastodonID=%s != mastodonUserID=%s\n",
				calleeID, dbUser.MastodonID, mastodonUserID)
		}

		dbUser.MastodonID = mastodonUserID
		dbUser.MastodonSendTootOnCall = true
		dbUser.AskCallerBeforeNotify = false

		// if mapping[mastodonUserID] != calleeID, set it
		oldCalleeID := ""
		mappingMutex.Lock()
		mappingData,ok := mapping[mastodonUserID]
		if ok {
			oldCalleeID = mappingData.CalleeId
		}
		mapping[mastodonUserID] = MappingDataType{calleeID,"none"}
		mappingMutex.Unlock()

		if oldCalleeID!="" && oldCalleeID!=calleeID {
			// this happens if CalleeId=mastodonID and calleeID=11-digits
			// ! storeAltId mapping[webcall@mastodon.social] != calleeID=19325349797
			fmt.Printf("! storeAltId mapping[%s]=%s != calleeID=%s (add)\n",
				mastodonUserID, oldCalleeID, calleeID)
			// IMPORTANT: in dbUser of oldCalleeID: clear mastodonID
			mMgr.storeAltId(oldCalleeID,"",remoteAddr)
		}
	}
	err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
	if err!=nil {
		// fatal very bad
		fmt.Printf("# storeAltId numeric(%s) error db=%s bucket=%s put err=%v\n",
			calleeID,dbMainName,dbRegisteredIDs,err)
		return err
	}

	fmt.Printf("storeAltId numeric(%s) stored mastodonUserID=%s\n",
		calleeID, mastodonUserID)
	return nil
}

func (mMgr *MastodonMgr) httpStoreAltID(w http.ResponseWriter, r *http.Request, urlPath string, remoteAddr string, startRequestTime time.Time) {
	// called by http /storealtid/
	mID := urlPath[12:] // length if '/storealtid/'
	argIdx := strings.Index(mID,"?")
	if argIdx>=0 {
		mID = mID[0:argIdx]
	}
	if mID=="" {
		fmt.Printf("# /storealtid fail no mID urlPath=(%s) %s ua=%s\n",
			urlPath, remoteAddr, r.UserAgent())
		return
	}

	calleeID := ""
	url_arg_array, ok := r.URL.Query()["id"]
	if ok && len(url_arg_array[0]) >= 1 {
		calleeID = url_arg_array[0]
	}
	if calleeID=="" {
		fmt.Printf("# /storealtid fail no calleeID mID=(%s) %s ua=%s\n",
			mID, remoteAddr, r.UserAgent())
		return
	}

	midEntry := &MidEntry{}
	err := mMgr.kvMastodon.Get(dbMid, mID, midEntry)
	if err != nil {
		// mid is not valid
		fmt.Printf("# /storealtid get midEntry mid=%s is not valid\n",mID)
		return
	}
	mastodonUserID := midEntry.MastodonIdCallee
	if mastodonUserID=="" {
		fmt.Printf("# /storealtid fail no mastodonUserID mID=(%s) %s ua=%s\n",
			mID, remoteAddr, r.UserAgent())
		return
	}

	var dbEntry DbEntry
	var dbUser DbUser
	existingID := false
	pwIdCombo := &PwIdCombo{}
	err = kvMain.Get(dbRegisteredIDs,calleeID,&dbEntry)
	if err!=nil {
		// calleeID was not yet registered
		fmt.Printf("! storeAltId numeric(%s) fail db=%s bucket=%s not yet registered\n",
			calleeID, dbMainName, dbRegisteredIDs)
	} else {
		dbUserKey := fmt.Sprintf("%s_%d",calleeID, dbEntry.StartTime)
		err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
		if err!=nil {
			// calleeID not a valid account
			fmt.Printf("# storeAltId numeric(%s) fail on dbUserBucket ip=%s\n", calleeID, remoteAddr)
		} else {
			err = kvHashedPw.Get(dbHashedPwBucket, calleeID, pwIdCombo)
			if err!=nil {
				fmt.Printf("# storeAltId (%s) fail get kvHashedPw err=%v\n", calleeID, err)
			} else {
				existingID = true
				fmt.Printf("storeAltId (%s) got kvHashedPw OK\n", calleeID)
			}
		}
	}

	if existingID {
		postBuf := make([]byte, 128)
		length,_ := io.ReadFull(r.Body, postBuf)
		if length>0 {
			pw := ""
			pwData := string(postBuf[:length])
			pwData = strings.ToLower(pwData)
			pwData = strings.TrimSpace(pwData)
			pwData = strings.TrimRight(pwData,"\r\n")
			pwData = strings.TrimRight(pwData,"\n")
			if strings.HasPrefix(pwData,"pw=") {
				pw = pwData[3:]
			}
			// deny if pw is too short or not valid
			if len(pw)<6 {
				fmt.Printf("# /storealtid (%s) fail pw too short\n",calleeID)
				time.Sleep(1 * time.Second)
				fmt.Fprintf(w, "pw too short")
				return
			}

			fmt.Printf("/storealtid (%s) mid=%s mastoId=%s pw=%s ip=%s ua=%s\n",
				calleeID, mID, mastodonUserID, pw, remoteAddr, r.UserAgent())

			// verify pw for calleeID
			err := bcrypt.CompareHashAndPassword([]byte(pwIdCombo.Pw), []byte(pw))
			if err != nil {
				fmt.Printf("# /storealtid (%s) wrong pw\n",calleeID)
				time.Sleep(1 * time.Second)
				fmt.Fprintf(w, "wrong pw")
				return
			}
			err = mMgr.storeAltId(calleeID, mastodonUserID, remoteAddr)
			if err!=nil {
				// fatal
				fmt.Printf("# /storealtid (%s) storeAltId err=%v\n",calleeID,err)
				fmt.Fprintf(w, "cannot store")
				return
			}
			// success
			fmt.Fprintf(w, "OK")

			// deactivate mid
			err = mMgr.kvMastodon.Delete(dbMid, mID)
			if err!=nil {
				// this is bad, but we can continue
				fmt.Printf("# /storealtid delete dbMid mid=%s err=%v\n", mID, err)
			}
			return
		}
	}
	fmt.Fprintf(w, "error")
}

func (mMgr *MastodonMgr) httpRegisterMid(w http.ResponseWriter, r *http.Request, urlPath string, remoteAddr string, startRequestTime time.Time) {
	// will register midEntry.MastodonIdCallee as new main-id

	if allowNewAccounts {
		mID := urlPath[13:] // length if '/registermid/'
		argIdx := strings.Index(mID,"&")	// TODO why not "?"
		if argIdx>=0 {
			mID = mID[0:argIdx]
		}
		if mID=="" {
			fmt.Printf("# /registermid fail no mID urlPath=(%s) %s ua=%s\n",
				urlPath, remoteAddr, r.UserAgent())
			return
		}

		clientVersion := ""
		url_arg_array, ok := r.URL.Query()["ver"]
		if ok && len(url_arg_array[0]) >= 1 {
			clientVersion = url_arg_array[0]
		}

		fmt.Printf("/registermid (mid=%s) ip=%s v=%s ua=%s\n",
			mID, remoteAddr, clientVersion, r.UserAgent())
		registerID := ""

		midEntry := &MidEntry{}
		err := mMgr.kvMastodon.Get(dbMid, mID, midEntry)
		if err != nil {
			// mid is not valid
			fmt.Printf("# /registermid get midEntry mid=%s is not valid\n",mID)
			return
		}

		// now that we have midEntry, we can deactivate mid
		err = mMgr.kvMastodon.Delete(dbMid, mID)
		if err!=nil {
			// this is bad, but we can continue
			fmt.Printf("# /registermid delete dbMid mid=%s err=%v\n", mID, err)
		}

		registerID = midEntry.MastodonIdCallee
		if registerID=="" {
			fmt.Printf("# /registermid fail no registerID mID=(%s) %s v=%s ua=%s\n",
				mID, remoteAddr, clientVersion, r.UserAgent())
			return
		}

		postBuf := make([]byte, 128)
		length,_ := io.ReadFull(r.Body, postBuf)
		if length>0 {
			pw := ""
			pwData := string(postBuf[:length])
			pwData = strings.ToLower(pwData)
			pwData = strings.TrimSpace(pwData)
			pwData = strings.TrimRight(pwData,"\r\n")
			pwData = strings.TrimRight(pwData,"\n")
			if strings.HasPrefix(pwData,"pw=") {
				pw = pwData[3:]
			}
			// deny if pw is too short or not valid
			if len(pw)<6 {
				fmt.Printf("# /registermid (%s) fail pw too short\n",registerID)
				fmt.Fprintf(w, "too short")
				return
			}
			//fmt.Printf("register pw=%s(%d)\n",pw,len(pw))

			// we need to check if registerID is already a valid(registered) account
			var dbEntryRegistered DbEntry
			err := kvMain.Get(dbRegisteredIDs,registerID,&dbEntryRegistered)
			if err==nil {
				dbUserKey := fmt.Sprintf("%s_%d", registerID, dbEntryRegistered.StartTime)
				var dbUser DbUser
				err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
				if err == nil {
					// registerID is already registered
					fmt.Printf("# /registermid (%s) fail db=%s bucket=%s get 'already registered'\n",
						registerID, dbMainName, dbRegisteredIDs)
					fmt.Fprintf(w, "was already registered")
					return
				}
			}

			// registerID needs to fail if already registered or used as mapping[]
			mappingMutex.RLock()
			mappingData,ok := mapping[registerID]
			mappingMutex.RUnlock()
			if ok {
				// registerID is mapped
				calleeID := ""
				if mappingData.CalleeId!="" {
					calleeID = mappingData.CalleeId
				}
				fmt.Printf("# /registermid (%s) fail already used for mapping (%s)\n", registerID, calleeID)
				fmt.Fprintf(w, "already used for mapping")
				return
			}

			unixTime := startRequestTime.Unix()
			dbUserKey := fmt.Sprintf("%s_%d",registerID, unixTime)
			dbUser := DbUser{Ip1:remoteAddr, UserAgent:r.UserAgent()}
			dbUser.StoreContacts = true
			dbUser.StoreMissedCalls = true
			dbUser.MastodonID = registerID // wsClient.go uses this to set client.mastodonID
			dbUser.MastodonSendTootOnCall = true
			dbUser.AskCallerBeforeNotify = true
			err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
			if err!=nil {
				fmt.Printf("# /registermid (%s) error db=%s bucket=%s put err=%v\n",
					registerID, dbMainName, dbUserBucket, err)
				fmt.Fprintf(w,"cannot register user")
			} else {
				err = kvMain.Put(dbRegisteredIDs, registerID,
						DbEntry{unixTime, remoteAddr}, false)
				if err!=nil {
					fmt.Printf("# /registermid (%s) error db=%s bucket=%s put err=%v\n",
						registerID,dbMainName,dbRegisteredIDs,err)
					fmt.Fprintf(w,"cannot register ID")
					// TODO this is bad / fatal: got to role back kvMain.Put((dbUser...) from above
				} else {
					//fmt.Printf("/registermid (%s) db=%s bucket=%s stored OK\n",
					//	registerID, dbMainName, dbRegisteredIDs)
					// registerID is now available for use

					var pwIdCombo PwIdCombo
					err,cookieValue := createCookie(w, registerID, pw, &pwIdCombo)
					if err!=nil {
						fmt.Printf("/registermid (%s) create cookie error cookie=%s err=%v\n",
							registerID, cookieValue, err)
						// not fatal, but user needs to enter pw again now
					}

					// preload contacts with 2 Answie accounts
					var idNameMap map[string]string // callerID -> name
					err = kvContacts.Get(dbContactsBucket, registerID, &idNameMap)
					if err!=nil {
						idNameMap = make(map[string]string)
					}
					idNameMap["answie"] = "Answie Spoken"
					idNameMap["answie7"] = "Answie Jazz"
					err = kvContacts.Put(dbContactsBucket, registerID, idNameMap, false)
					if err!=nil {
						fmt.Printf("# /registermid (%s) kvContacts.Put err=%v\n", registerID, err)
					} else {
						//fmt.Printf("/registermid (%s) kvContacts.Put OK\n", registerID)
					}

					fmt.Fprintf(w, "OK")
				}
			}
		}
	} else {
		fmt.Printf("# /registermid newAccounts not allowed urlPath=(%s) %s ua=%s\n",
			urlPath, remoteAddr, r.UserAgent())
	}
	return
}

func (mMgr *MastodonMgr) cleanupMastodonMidMap(w io.Writer) {
	// called from timer.go
	fmt.Printf("cleanupMastodonMidMap...\n")
	timeNowUnix := time.Now().Unix()
	var deleteMidArray []string

	if mMgr.kvMastodon==nil {
		return
	}

	mMgr.midMutex.Lock()
	defer mMgr.midMutex.Unlock()

	kv := mMgr.kvMastodon.(skv.SKV)
	db := kv.Db
	skv.DbMutex.Lock()
	err := db.Update(func(tx *bolt.Tx) error {
		//fmt.Printf("ticker3min release outdated entries from db=%s bucket=%s\n",
		//	dbNotifName, dbSentNotifTweets)
		b := tx.Bucket([]byte(dbMid))
		if b==nil {
			fmt.Printf("# cleanupMastodonMidMap bucket=(%s) no tx\n",dbMid)
			return nil
		}
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			mID := string(k) // mID
			d := gob.NewDecoder(bytes.NewReader(v))
			var midEntry MidEntry
			d.Decode(&midEntry)

			fmt.Printf("cleanupMastodonMidMap timeNowUnix=%d - midEntry.Created=%d = %d (>=3600 fire)\n",
				timeNowUnix, midEntry.Created, timeNowUnix-midEntry.Created)

			if timeNowUnix - midEntry.Created >= 20*60 {
				deleteMidArray = append(deleteMidArray,mID)
			}
		}
		return nil
	})
	skv.DbMutex.Unlock()

	if err!=nil {
		// this is bad
		fmt.Printf("# cleanupMastodonMidMap delete=%d err=%v\n", len(deleteMidArray), err)
	} else if len(deleteMidArray)>0 {
		fmt.Printf("cleanupMastodonMidMap delete=%d (no err)\n", len(deleteMidArray))
	}

	if len(deleteMidArray)>0 {
		fmt.Printf("cleanupMastodonMidMap delete %d dbMid entries\n", len(deleteMidArray))
		for _,mid := range deleteMidArray {
			if mid!="" {
				fmt.Printf("cleanupMastodonMidMap kv.Delete(dbMid,%s)\n",mid)
				err = kv.Delete(dbMid, mid)
				if err!=nil {
					// this is bad
					fmt.Printf("# cleanupMastodonMidMap delete dbMid mid=%s err=%v\n", mid, err)
				}
			} else {
				fmt.Printf("! cleanupMastodonMidMap mid empty\n")
			}
		}
	}
	fmt.Printf("cleanupMastodonMidMap done\n")
}

func (mMgr *MastodonMgr) dumpPostedMsgEvents(w io.Writer) {
	fmt.Printf("dumpPostedMsgEvents\n")
	fmt.Fprintf(w,"dumpPostedMsgEvents\n")
	mMgr.postedMsgEventsMutex.RLock()
	for idx,postedMsgEvent := range mMgr.postedMsgEventsSlice {
		fmt.Fprintf(w,"postedMsg %d %v calleeID=%s msgID=%v\n",
			idx, postedMsgEvent.timestamp, postedMsgEvent.calleeID, postedMsgEvent.msgID)
	}
	mMgr.postedMsgEventsMutex.RUnlock()
}

func (mMgr *MastodonMgr) cleanupPostedMsgEvents(w io.Writer) {
	// delete the oldest entries (at the beginning of the slice) if they are 30min old or older
	//fmt.Printf("cleanupPostedMsgEvents\n")
	mMgr.postedMsgEventsMutex.Lock()
	for len(mMgr.postedMsgEventsSlice)>0 {
		if time.Now().Sub(mMgr.postedMsgEventsSlice[0].timestamp) < 30 * time.Minute {
			// the oldest remaining entry is less than 30min old: end cleanupPostedMsgEvents
			break
		}
		postedMsgEvent := mMgr.postedMsgEventsSlice[0]
		fmt.Printf("cleanupPostedMsgEvents calleeID=%s msgID=%s\n",
			postedMsgEvent.calleeID, postedMsgEvent.msgID)

		if postedMsgEvent.msgID!="" {
			// delete postedMsgEvent.msgID
			err := mMgr.c.DeleteStatus(mMgr.ctx, postedMsgEvent.msgID)
			if err!=nil {
				fmt.Printf("# cleanupPostedMsgEvents DeleteStatus (%v) err=%v\n",
					postedMsgEvent.msgID, err)
			} else {
				fmt.Printf("cleanupPostedMsgEvents DeleteStatus (%v) OK\n",
					postedMsgEvent.msgID)
			}
		}

		if len(mMgr.postedMsgEventsSlice)>1 {
			mMgr.postedMsgEventsSlice = mMgr.postedMsgEventsSlice[1:]
		} else {
			mMgr.postedMsgEventsSlice = nil
			// no more entries left: end cleanupPostedMsgEvents
			break
		}
	}
	mMgr.postedMsgEventsMutex.Unlock()
}

func (mMgr *MastodonMgr) mastodonStop() {
	fmt.Printf("mastodonStop\n")

	if mMgr==nil {
		// NewMastodonMgr() not executed?
		fmt.Printf("# mastodonStop abort on mMgr==nil\n")
		return
	}
	if mMgr.kvMastodon==nil {
		fmt.Printf("# mastodonStop mMgr.kvMastodon==nil before mMgr.kvMastodon.Close()\n")
	} else {
		fmt.Printf("mastodonStop mMgr.kvMastodon.Close...\n")
		err := mMgr.kvMastodon.Close()
		if err!=nil {
			fmt.Printf("# mastodonStop error dbName %s close err=%v\n",dbMastodon,err)
		} else {
			fmt.Printf("mastodonStop mMgr.kvMastodon.Close done\n")
		}
	}

	mMgr.running = false
	fmt.Printf("mastodonStop context.cancel()...\n")
	mMgr.cancel()
	fmt.Printf("mastodonStop done\n")
	return
}

