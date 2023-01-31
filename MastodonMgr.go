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
	"net/http"
	"math/rand"
	"golang.org/x/net/html"
	"github.com/mattn/go-mastodon"
	"github.com/mehrvarz/webcall/skv"
	"encoding/gob"
	"bytes"
	bolt "go.etcd.io/bbolt"
)

type MastodonMgr struct {
	c *mastodon.Client
	abortChan chan bool
	hostUrl string
	inviterMutex sync.RWMutex
	midMutex sync.RWMutex
	kvMastodon skv.KV
}

const dbMastodon = "rtcmastodon.db"

const dbInviter = "dbInviter"  // a map of all active inviter requests
type Inviter struct {          // key = mastodon msgID
	MastodonUserId string
	MidString string           // enables clearMid(mid) before inviter is deleted
	CalleeID string
	CallerID string
	StatusID1 mastodon.ID      // for callee
	StatusID2 mastodon.ID      // for caller
	Created int64
}

const dbMid = "dbMid"          // a map of all active mid's
type MidEntry struct {         // key = mid
	MastodonIdCallee string
	MastodonIdCaller string
	MsgID string
}

const dbCid = "dbCid"          // a calleeID to msgID map (of invited callees)
type CidEntry struct {         // key = calleeID
	MsgID string
}


func NewMastodonMgr() *MastodonMgr {
	return &MastodonMgr{
		//inviterMap:  make(map[string]*Inviter),
		//midMap:      make(map[string]*MidEntry),
	}
}

func (mMgr *MastodonMgr) mastodonStart(config string) {
	// only start if not already running
	if mMgr.abortChan != nil {
		fmt.Printf("# mastodonStart already running\n")
		return
	}
	// config format: 'mastodon-domain|server-url|ClientID|ClientSecret|username|password'
	tokSlice := strings.Split(config, "|")
	if len(tokSlice)!=6 {
		fmt.Printf("# mastodonStart config should have 6 tokens, has %d (%s)\n",len(tokSlice),config)
		return
	}

	fmt.Printf("mastodonStart (%s) ...\n",tokSlice[0])

	// TODO better way?
	mMgr.hostUrl = "https://"+hostname
	if httpsPort>0 {
		mMgr.hostUrl += ":"+strconv.FormatInt(int64(httpsPort),10)
	}

	mMgr.c = mastodon.NewClient(&mastodon.Config{
		Server:       tokSlice[1],
		ClientID:     tokSlice[2],
		ClientSecret: tokSlice[3],
	})
	err := mMgr.c.Authenticate(context.Background(), tokSlice[4], tokSlice[5])
	if err != nil {
		fmt.Printf("# mastodonStart fail Authenticate (%v)\n",err)
		return
	}

	chl,err := mMgr.c.StreamingUser(context.Background())
	if err != nil {
		fmt.Printf("# mastodonStart fail StreamingUser (%v)\n",err)
		return
	}

	mMgr.kvMastodon,err = skv.DbOpen(dbMastodon,dbPath)
	if err!=nil {
		fmt.Printf("# error DbOpen %s path %s err=%v\n",dbMastodon,dbPath,err)
		return
	}
	err = mMgr.kvMastodon.CreateBucket(dbInviter)
	if err!=nil {
		fmt.Printf("# error db %s CreateBucket %s err=%v\n",dbMastodon,dbInviter,err)
		mMgr.kvMastodon.Close()
		return
	}
	err = mMgr.kvMastodon.CreateBucket(dbMid)
	if err!=nil {
		fmt.Printf("# error db %s CreateBucket %s err=%v\n",dbMastodon,dbMid,err)
		mMgr.kvMastodon.Close()
		return
	}
	err = mMgr.kvMastodon.CreateBucket(dbCid)
	if err!=nil {
		fmt.Printf("# error db %s CreateBucket %s err=%v\n",dbMastodon,dbCid,err)
		mMgr.kvMastodon.Close()
		return
	}

	mMgr.abortChan = make(chan bool)
	for {
		select {
		case <-context.Background().Done():
			fmt.Printf("mastodonhandler abort on context.Background\n")
			mMgr.abortChan = nil
			return
		case <-mMgr.abortChan:
			fmt.Printf("mastodonhandler abort on abortChan\n")
			mMgr.abortChan = nil
			return
		case evt := <-chl:
			//fmt.Println(evt)
			switch event := evt.(type) {
			case *mastodon.NotificationEvent:
				fmt.Printf("mastodonhandler Notif-Type=(%v) Acct=(%v)\n",
					event.Notification.Type, event.Notification.Account.Acct)
				content := event.Notification.Status.Content
				//fmt.Printf("mastodonhandler Content=(%v)\n",content)
// a sample html-notification with textMessage ' html002' towards the end:
//<p><span class="h-card"><a href="https://mastodon.social/@timurmobi" class="u-url mention" rel="nofollow noopener noreferrer" target="_blank">@<span>timurmobi</span></a></span> hello002</p>
				// to get the textMessage (here: ' html002') we first remove the <p> tag at start and end
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
						fmt.Printf("mastodonhandler ErrorToken re-loop\n")
						break loop
					}
				}
				fmt.Printf("mastodonhandler Notif-Type=(%v) done\n", event.Notification.Type)
				mMgr.processMessage(command,event,tokSlice[0])

/*			case *mastodon.UpdateEvent:
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
				fmt.Printf("mastodonhandler ErrorEvent %v\n",event.Error())

/*			default:
				fmt.Printf("mastodonhandler default\n")
*/
			}
		}
	}

	mMgr.abortChan = nil
	return
}

func (mMgr *MastodonMgr) dbSync() {
	kv := mMgr.kvMastodon.(skv.SKV)
	if err := kv.Db.Sync(); err != nil {
		fmt.Printf("# mastodon dbSync error: %s\n", err)
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
	if msgID == "<nil>" { msgID = "" }

	inReplyToID := fmt.Sprint(event.Notification.Status.InReplyToID)
	if inReplyToID == "<nil>" { inReplyToID = "" }

	tok := strings.Split(msg, " ")
	fmt.Printf("mastodon processMessage msg=(%v) msgId=%v InReplyToID=%v RecipientCount=%d lenTok=%d\n",
		msg, msgID, inReplyToID, -1, len(tok))

	if msgID=="" {
		// can't work without a msgID
		fmt.Printf("# mastodon processMessage empty event.Notification.Status.ID\n")
		return
	}

	if inReplyToID=="" {
		// this is a request/invite msg (could also be any kind of msg)

		if len(tok)>0 {
			command := strings.ToLower(strings.TrimSpace(tok[0]))

			switch {
			case command=="wc-delete":
				// here we remove a mastodonUserId
// TODO wc-delete apparently does not delete missed calls
				fmt.Printf("mastodon wc-delete (%v)\n", mastodonUserId)

				var dbEntryRegistered DbEntry
				err := kvMain.Get(dbRegisteredIDs,mastodonUserId,&dbEntryRegistered)
				if err!=nil {
					fmt.Printf("# mastodon wc-delete user=%s err=%v\n", mastodonUserId, err)
					// no need to notify user by msg (looks like an invalid request - ignore)
				} else {
					// mastodonUserId is a registered calleeID

					// if user is currently online / logged-in as callee
					hubMapMutex.RLock()
					hub := hubMap[mastodonUserId]
					hubMapMutex.RUnlock()
					if hub != nil {
						// kick callee user out
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
						fmt.Printf("# mastodon wc-delete contacts of id=%s err=%v\n",
							mastodonUserId, err)
					}

					kv := kvMain.(skv.SKV)
					err = kv.Delete(dbUserBucket, dbUserKey)
					if err!=nil {
						// this is bad / fatal
						fmt.Printf("# mastodon wc-delete user-key=%s err=%v\n", dbUserKey, err)
// TODO send msg telling user that wc-delete failed=
					} else {
						fmt.Printf("mastodon wc-delete user-key=%s done\n", dbUserKey)
					}

					err = kvMain.Delete(dbRegisteredIDs, mastodonUserId)
					if err!=nil {
						// this is bad / fatal
						fmt.Printf("# mastodon wc-delete user-id=%s err=%v\n", mastodonUserId, err)
// TODO send msg telling user that wc-delete failed=
					} else {
						fmt.Printf("mastodon wc-delete user-id=%s done\n", mastodonUserId)
// TODO send msg telling user that their webcall account has been deleted
					}

					var missedCallsSlice []CallerInfo
					err = kvCalls.Put(dbMissedCalls, mastodonUserId, missedCallsSlice, false)
					if err!=nil {
						fmt.Printf("# mastodon wc-delete (%s) fail store dbMissedCalls\n",
							mastodonUserId)
					}

					pwIdCombo := PwIdCombo{}
					err = kvHashedPw.Put(dbHashedPwBucket, mastodonUserId, pwIdCombo, true)
					if err!=nil {
						fmt.Printf("# mastodon wc-delete (%s) fail dbHashedPwBucket\n",	mastodonUserId)
					} else {
						fmt.Printf("mastodon wc-delete kvHashedPw mastodonUserId=%s\n", mastodonUserId)
					}
				}
				// abort processMessage here
				return

/* outcommented bc we have no inviter
			case command=="wc-register":
				fmt.Printf("mastodon wc-register (%v)\n", mastodonUserId)
				// NOTE: msg must end with a blank
				msg := "WebCall Register: "

				// arg2: no callerID to notify after callee-login
				// arg3 none-empty string: the message
				// arg4 none-empty string: callerMsgID to notify after callee-login
				err := mMgr.offerRegisterLink(mastodonUserId, "", msg, msgID, nil)
				if err!=nil {
					fmt.Printf("# mastodon processMessage offerRegisterLink err=%v\n",err)
					// TODO fatal
					return
				}
				return
*/
			}
		}

// TODO msg MUST contain a target user-id (NOT webcall) - otherwise abort here!
// in other words: if webcall is the only recipient, this is not valid
// looks like we need to parse html in Content for "<span>timurmobi</span>":
//     <span class="h-card"><a href="https://mastodon.social/@timurmobi" class="u-url mention" rel="nofollow noopener noreferrer" target="_blank">@<span>timurmobi</span></a></span>
// or parse html in Content for "<span>webcall</span>":
//     <span class="h-card"><a href="https://mastodon.social/@webcall" class="u-url mention" rel="nofollow noopener noreferrer" target="_blank">@<span>webcall</span></a></span>
/*
		if webcall is the only recipient {
			fmt.Printf("# mastodon processMessage: webcall is the only recipient\n")
			return
		}
*/
		// we now assume this is a valid msg to webcall-invite another user (requesting a confirm msg)
		// this inviter stays active for up to 60min
		fmt.Printf("mastodon processMessage msgID=%v requesting call confirmation\n",msgID)

		inviter := &Inviter{}
		inviter.MastodonUserId = mastodonUserId
		inviter.Created = time.Now().Unix()
		err := mMgr.kvMastodon.Put(dbInviter, msgID, inviter, false)
		if err != nil {
			fmt.Printf("# mastodon processMessage msgID=%v failed to store dbInviter\n", msgID)
			return
		}
		// mMgr.kvMastodon.Get(dbInviter, msgID, ...) only becomes relevant if target user sends confirm msg back

	} else {
		// this is a reply/confirm msg (or might be one)
		// reply/confirm msg (event.Notification.Status.InReplyToID == callerMastodonMsgId (of original msg)
		var inviter = &Inviter{}
		err := mMgr.kvMastodon.Get(dbInviter, inReplyToID, inviter)
		if err!=nil {
			// abort (not fatal): mMgr.inviterMap[inReplyToID] has been outdated
			// don't send msg to mastodonUserId (don't run into msg-send-quota triggered by invalid user)
			fmt.Printf("# mastodon processMessage unknown InReplyToID(%s) outdated? err=%v\n",inReplyToID,err)
			return
		}

		// now we sort out who becomes the callee and who becomes the caller
		// if inviter.mastodonUserId a valid webcall account -> offer callee role to inviter
		// if mastodonUserId is a valid webcall account -> offer callee role to callee
		// else -> offer callee role to inviter
		// by default: inviter -> callee; responder -> caller
		mastodonCalleeID := inviter.MastodonUserId
		calleeID := mastodonCalleeID
		mappingMutex.RLock()
		mappingData,ok := mapping[mastodonCalleeID]
		mappingMutex.RUnlock()
		if ok {
			// calleeID is mapped (caller is using a temporary (mapped) calleeID)
			if mappingData.Assign!="" && mappingData.Assign!="none" {
				calleeID = mappingData.Assign
			}
		}

		mastodonCallerID := mastodonUserId
		callerID := mastodonCallerID
		mappingMutex.RLock()
		mappingData,ok = mapping[mastodonCalleeID]
		mappingMutex.RUnlock()
		if ok {
			// calleeID is mapped (caller is using a temporary (mapped) calleeID)
			if mappingData.Assign!="" && mappingData.Assign!="none" {
				callerID = mappingData.Assign
			}
		}

		if mMgr.isValidCallee(callerID)!=nil && mMgr.isValidCallee(calleeID)==nil {
// TODO also: if callerID is online and calleeID is not online
			// inviter has no valid webcall account, but responder has
			// this is the one case where we turn things around
			// inviter becomes caller; responder becomes callee

			// swap mastodonCalleeID and mastodonCallerID
			tmpID := mastodonCallerID
			mastodonCallerID = mastodonCalleeID
			mastodonCalleeID = tmpID

			// swap calleeID and callerID
			tmpID = callerID
			callerID = calleeID
			calleeID = tmpID

			fmt.Printf("mastodon processMessage roles (special): inviter -> caller, responder -> callee\n")
		} else {
			fmt.Printf("mastodon processMessage roles (default): inviter -> callee, responder -> caller\n")
		}

		inviter.CalleeID = calleeID
		inviter.CallerID = callerID

		// the two roles have now been decided

		// find out if calleeID is online right now 
		hubMapMutex.RLock()
		hub := hubMap[calleeID]
		hubMapMutex.RUnlock()
		calleeIDonline := ""
		if hub != nil {
			// calleeID is online / logged in
			//if hub.ConnectedCallerIp!="" {
			//	calleeID is busy
			//}
			fmt.Printf("mastodon processMessage callee(%s) has an active hub (is online) (%s)\n",
				calleeID, hub.ConnectedCallerIp)
			calleeIDonline = calleeID // callee is using its mastodon user id as key
		} else {
			// calleeID is NOT online
			fmt.Printf("mastodon processMessage callee(%s) has NO active hub (is not online)\n", calleeID)
		}
		// if calleeID is offline, calleeIDonline is empty
		// if calleeID is online, calleeIDonline contains calleeID

		fmt.Printf("mastodon processMessage calleeID=%s(m=%s,onl=%s) callerID=(%v)\n",
			calleeID, mastodonCalleeID, calleeIDonline, callerID)

		if calleeIDonline!="" {
			// callee is online, NO need to send a mastodon msg to callee
			// instead we immediately send a mastodon-msg to the caller
			fmt.Printf("mastodon processMessage callee online, send /user link to caller\n")

// TODO caller-link: do we really want to send-msg calleeID in clear?
			status,err := mMgr.postCallerMsgEx("@"+mastodonCallerID+" "+
							"To call "+mastodonCalleeID+" click: "+mMgr.hostUrl+"/user/"+calleeID)
			if err!=nil {
				fmt.Printf("# sendCallerMsg err=%v (to=%v)\n",err,mastodonCallerID)
				// TODO fatal
				return
			}
			fmt.Printf("sendCallerMsg done, status.ID=%v\n",status.ID)
			inviter.StatusID2 = status.ID
			err = mMgr.kvMastodon.Put(dbInviter, inReplyToID, inviter, false)
			if err!=nil {
				fmt.Printf("# mastodon processMessage msgID=%v failed to store dbInviter\n", inReplyToID)
				// TODO fatal
				return
			}

			err = mMgr.kvMastodon.Put(dbCid, inviter.CalleeID, &CidEntry{inReplyToID}, false)
			if err!=nil {
				fmt.Printf("# mastodon processMessage calleeID=%v failed to store dbCid\n", calleeID)
				// TODO fatal
				return
			}
			return
		}

		if mMgr.isValidCallee(calleeID)!=nil {
			// calleeID is not currently online, but it is a valid/registered callee
			// send a mastodon-msg to the callee and ask it to login to answer call or register a new calleeID
			fmt.Printf("mastodon processMessage callee offline but valid, send /callee link to callee\n")

			// for secure register we generate a unique random 11-digit mID to refer to mastodonCalleeID 
			mMgr.midMutex.Lock()
			mID,err := mMgr.makeSecretID() //"xxxxxxxxxxx"
			if err!=nil {
				fmt.Printf("# mastodon processMessage makeSecretID fatal err=%v\n",err)
				mMgr.midMutex.Unlock()
				// TODO fatal
				return
			}
			// mid -> mastodonCalleeID
			// this allows /callee/pickup to find mastodonCalleeID (a mastodon user id) via mID
			midEntry := &MidEntry{mastodonCalleeID,mastodonCallerID,inReplyToID}
			err = mMgr.kvMastodon.Put(dbMid, mID, midEntry, false)
			mMgr.midMutex.Unlock()
			if err!=nil {
				fmt.Printf("# mastodon processMessage store midEntry [mID=%s] err=%v\n",mID,err)
				// TODO fatal
				return
			}
			fmt.Printf("mastodon processMessage stored midEntry [mID=%s]\n",mID)

			// store mid in inviter, so we can delete it later
			inviter.MidString = mID
			err = mMgr.kvMastodon.Put(dbInviter, inReplyToID, inviter, false)
			if err!=nil {
				fmt.Printf("# mastodon processMessage msgID=%v failed to store dbInviter\n", inReplyToID)
				// TODO fatal
				return
			}
			fmt.Printf("mastodon processMessage stored dbInviter with key msgID=%v \n", inReplyToID)

			// send msg to mastodonCalleeID, with link to /callee/pickup
			sendmsg := "@"+mastodonCalleeID+" "+
				"User "+mastodonCallerID+" wants to give you a web telephony call.\n"+
				"To answer: "+mMgr.hostUrl+"/callee/pickup?mid="+mID
			fmt.Printf("mastodon processMessage PostStatus (%s)\n",sendmsg)
			status,err := mMgr.postCallerMsgEx(sendmsg)
			if err!=nil {
				fmt.Printf("# mastodon processMessage postCallerMsgEx err=%v\n",err)
				// TODO fatal
				return
			}
			// at some point later we need to delete msg status.ID
			// note: deleting a (direct) mastodon msg does NOT delete it on the receiver/caller side
			inviter.StatusID1 = status.ID
			err = mMgr.kvMastodon.Put(dbInviter, inReplyToID, inviter, false)
			if err!=nil {
				fmt.Printf("# mastodon processMessage msgID=%v failed to store inviter\n", inReplyToID)
				// TODO fatal
				return
			}
			fmt.Printf("mastodon processMessage msgID=%v stored inviter with status.ID=%v\n",
				inReplyToID, status.ID)

			err = mMgr.kvMastodon.Put(dbCid, inviter.CalleeID, &CidEntry{inReplyToID}, false)
			if err!=nil {
				fmt.Printf("# mastodon processMessage calleeID=%v failed to store dbCid\n", calleeID)
				// TODO fatal
				return
			}
			return
		}

		// calleeID (for instance: timurmobi@mastodon.social) does not yet exist
		// receiver of msg should register a WebCall callee account, so it can receive calls
		fmt.Printf("mastodon processMessage callee is no webcall user yet, sending offerRegister\n")
		// NOTE: msg must end with a blank
		msg := "User "+mastodonCallerID+" wants to give you a WebCall.\nTo answer: "

// TODO: we need to put instructions for new users on the mastodon @webcall homepage
// "if you receive call requests from accounts that you don't want to make phone calls with,
// you can mute or block these acconts in Mastodon

		// NOTE: if msg can't be posted, inviter will not be stored
		// arg2 none-empty string: callerID to notify after callee-login
		// arg3 none-empty string: the message
		// arg4 none-empty string: callerMsgID to notify after callee-login
		err = mMgr.offerRegisterLink(mastodonCalleeID,mastodonCallerID,msg,inReplyToID,inviter)
		if err!=nil {
			fmt.Printf("# mastodon processMessage offerRegisterLink err=%v\n",err)
			// TODO fatal
			return
		}
	}
}

func (mMgr *MastodonMgr) cleanupMastodonInviter(w io.Writer) {
	// delete/outdate inviterMap[] entries in parallel based on age of inviter.Created
	// timer.go calls this func periodically every 20 min
	fmt.Printf("cleanupMastodonInviter...\n")
	timeNowUnix := time.Now().Unix()
	var deleteInviterArray []string

	if mMgr.kvMastodon==nil {
		return
	}

	mMgr.inviterMutex.Lock()
	defer mMgr.inviterMutex.Unlock()

	kv := mMgr.kvMastodon.(skv.SKV)
	db := kv.Db
	skv.DbMutex.Lock()
	err := db.Update(func(tx *bolt.Tx) error {
		//fmt.Printf("ticker3min release outdated entries from db=%s bucket=%s\n",
		//	dbNotifName, dbSentNotifTweets)
		b := tx.Bucket([]byte(dbInviter))
		if b==nil {
			fmt.Printf("# ticker3min bucket=(%s) no tx\n",dbInviter)
			return nil
		}
		c := b.Cursor()
		for k, v := c.First(); k != nil; k, v = c.Next() {
			mastodonMsgID := string(k) // msgID
			d := gob.NewDecoder(bytes.NewReader(v))
			var inviter Inviter
			d.Decode(&inviter)

			fmt.Printf("cleanupMastodonInviter timeNowUnix=%d - inviter.Created=%d = %d (>=3600 fire)\n",
				timeNowUnix, inviter.Created, timeNowUnix-inviter.Created)
			if timeNowUnix - inviter.Created >= 60*60 {
				// this invitation is now outdated: delete it
				// DeleteStatus() previously sent msgs
				if inviter.StatusID1 != "" {
					err := mMgr.c.DeleteStatus(context.Background(), inviter.StatusID1)
					if err!=nil {
						fmt.Printf("# cleanupMastodonInviter DeleteStatus ID1 (%v) err=%v\n",
							inviter.StatusID1,err)
					} else {
						fmt.Printf("cleanupMastodonInviter DeleteStatus ID1 (%v) done\n",inviter.StatusID1)
					}
				}
				if inviter.StatusID2 != "" {
					err := mMgr.c.DeleteStatus(context.Background(), inviter.StatusID2)
					if err!=nil {
						fmt.Printf("# cleanupMastodonInviter DeleteStatus ID2 (%v) err=%v\n",
							inviter.StatusID2, err)
					} else {
						fmt.Printf("cleanupMastodonInviter DeleteStatus ID2 (%v) done\n",inviter.StatusID2)
					}
				}

				// delete the inviter itself below, outside of range loop
				deleteInviterArray = append(deleteInviterArray,mastodonMsgID)
			}
		}
		return nil
	})
	skv.DbMutex.Unlock()
	if err!=nil {
		// this is bad
		fmt.Printf("# cleanupMastodonInviter delete=%d err=%v\n", len(deleteInviterArray), err)
	} else if len(deleteInviterArray)>0 {
		fmt.Printf("cleanupMastodonInviter delete=%d (no err)\n", len(deleteInviterArray))
	}

	if len(deleteInviterArray)>0 {
		fmt.Printf("cleanupMastodonInviter delete %d inviterMap entries\n", len(deleteInviterArray))
		for _,mastodonMsgID := range deleteInviterArray {
			inviter := &Inviter{}
			err := mMgr.kvMastodon.Get(dbInviter, mastodonMsgID, inviter)
			mid := inviter.MidString

			if mid!="" {
				mMgr.clearMid(mid,"")
			} else {
				fmt.Printf("! cleanupMastodonInviter not calling clearMid() mid=%s mastodonMsgID=%s\n",
					mid, mastodonMsgID)
			}
			fmt.Printf("cleanupMastodonInviter delete inviterMap msgId(%s) mid=%s\n",mastodonMsgID,mid)
			err = kv.Delete(dbInviter, mastodonMsgID)
			if err!=nil {
				// this is bad
				fmt.Printf("# cleanupMastodonInviter delete dbInviter msg-id=%s err=%v\n", mastodonMsgID, err)
			}

			err = kv.Delete(dbCid, inviter.CalleeID)
			if err!=nil {
				// this is bad
				fmt.Printf("# cleanupMastodonInviter delete dbCid CalleeID=%s err=%v\n", inviter.CalleeID, err)
			}
		}
	}
	fmt.Printf("cleanupMastodonInviter done\n")
}

func (mMgr *MastodonMgr) offerRegisterLink(mastodonUserId string, mastodonCallerUserId string, msg string, msgID string, inviter *Inviter) error {
	// offer link to /pickup, with which mastodonUserId can be registered
	// first we need a unique mID (refering to mastodonUserId)
	mMgr.midMutex.Lock()
	mID,err := mMgr.makeSecretID() //"xxxxxxxxxxx"
	if err!=nil {
		// this is fatal
		mMgr.midMutex.Unlock()
		fmt.Printf("# offerRegisterLink register makeSecretID err=(%v)\n", err)
		// TODO fatal
		return err
	}
	midEntry := &MidEntry{}
	midEntry.MastodonIdCallee = mastodonUserId
	if mastodonCallerUserId!="" {
		midEntry.MastodonIdCaller = mastodonCallerUserId
	}
	midEntry.MsgID = msgID
	err = mMgr.kvMastodon.Put(dbMid, mID, midEntry, false)
	if err != nil {
		fmt.Printf("# mastodon processMessage mID=%v failed to store midEntry\n", mID)
		// TODO fatal
		return err
	}
	mMgr.midMutex.Unlock()

	sendmsg :="@"+mastodonUserId+" "+msg+" "+mMgr.hostUrl+"/callee/pickup?mid="+mID
	fmt.Printf("offerRegisterLink PostStatus (%s)\n",sendmsg)
	status,err := mMgr.postCallerMsgEx(sendmsg)
	if err!=nil {
		fmt.Printf("# offerRegisterLink PostStatus err=%v (to=%v)\n",err,mastodonUserId)
		// TODO fatal
		return err
	}
	fmt.Printf("offerRegisterLink PostStatus sent to=%v\n", mastodonUserId)

	// store mid in inviter, so we can delete it later
	inviter.MidString = mID
	inviter.StatusID1 = status.ID
	err = mMgr.kvMastodon.Put(dbInviter, msgID, inviter, false)
	if err != nil {
		fmt.Printf("# mastodon processMessage msgID=%v failed to store inviter\n", msgID)
		// TODO fatal
		return err
	}
	fmt.Printf("mastodon processMessage msgID=%v stored inviter with status.ID=%v\n", msgID, status.ID)

	err = mMgr.kvMastodon.Put(dbCid, inviter.CalleeID, &CidEntry{msgID}, false)
	if err!=nil {
		fmt.Printf("# mastodon processMessage calleeID=%v failed to store dbCid\n", inviter.CalleeID)
		// TODO fatal
		return err
	}
	return nil
}

func (mMgr *MastodonMgr) makeSecretID() (string,error) {
	// mMgr.midMutex must be locked outside
	tries := 0
	for {
		tries++
		intID := uint64(rand.Int63n(int64(99999999999)))
		if(intID<uint64(10000000000)) {
			continue;
		}
		newSecretId := strconv.FormatInt(int64(intID),10)

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

func (mMgr *MastodonMgr) sendCallerMsgToMid(mid string, calleeID string) error {
	// only used internally
	// send message with link containing "/user/"+urlID to tmpkeyMastodonCallerReplyMap[mid]
	callerMastodonUserId := ""

	midEntry := &MidEntry{}
	err := mMgr.kvMastodon.Get(dbMid, mid, midEntry)
	if err != nil {
		// can be ignored
	} else {
		callerMastodonUserId = midEntry.MastodonIdCaller
	}

	fmt.Printf("mastodon sendCallerMsgToMid calleeID=%s mid=%s callerMastodonUserId=%s\n",
		calleeID, mid, callerMastodonUserId)
	// calleeID and callerMastodonUserId (if set) appear to be the same?

	if callerMastodonUserId!="" {
// TODO do we really want to post calleeID in clear?
		sendmsg :=	"@"+callerMastodonUserId+" Click to call: "+mMgr.hostUrl+"/user/"+calleeID
		status,err := mMgr.postCallerMsgEx(sendmsg)
		if err!=nil {
			// this is fatal
			fmt.Printf("# sendCallerMsgToMid err=%v (to=%v)\n",err,callerMastodonUserId)
			return err
		}
		fmt.Printf("sendCallerMsgToMid to=%v done ID=%v\n",callerMastodonUserId, status.ID)
		if midEntry!=nil {
			if midEntry.MsgID!="" {
				fmt.Printf("sendCallerMsgToMid midEntry.MsgID=%v\n",midEntry.MsgID)
				mMgr.inviterMutex.Lock()
				inviter := &Inviter{}
				err = mMgr.kvMastodon.Get(dbInviter, midEntry.MsgID, inviter)
				if err != nil {
					// TODO fatal
					mMgr.inviterMutex.Unlock()
					fmt.Printf("# mastodon processMessage msgID=%v failed to load dbInviter\n", midEntry.MsgID)
					return err
				}
				inviter.StatusID2 = status.ID
				err = mMgr.kvMastodon.Put(dbInviter, midEntry.MsgID, inviter, false)
				mMgr.inviterMutex.Unlock()
				if err != nil {
					fmt.Printf("# mastodon processMessage msgID=%v failed to store dbInviter\n", midEntry.MsgID)
					return err
				}
			} else {
				fmt.Printf("! sendCallerMsgToMid statusID2=%v msgID=%s\n", status.ID, midEntry.MsgID)
			}
		} else {
			fmt.Printf("! sendCallerMsgToMid statusID2=%v midEntry=nil\n", status.ID)
		}
	} else {
		// outdated, can happen a lot; do we need to log this every time?
		fmt.Printf("! mastodon sendCallerMsgToMid callerMastodonUserId empty, calleeID=%s mid=%s\n",calleeID,mid)
	}
	return nil
}

func (mMgr *MastodonMgr) postCallerMsgEx(sendmsg string) (*mastodon.Status,error) {
	fmt.Printf("postCallerMsgEx PostStatus (%s)\n",sendmsg)
	status,err := mMgr.c.PostStatus(context.Background(), &mastodon.Toot{
		Status:			sendmsg,
		Visibility:		"direct",
	})
	if err!=nil {
		fmt.Println("# postCallerMsgEx PostStatus err=",err)
		return nil,err
	}
	fmt.Println("postCallerMsgEx PostStatus sent id=",status.ID)
	return status,nil
}

// called from httpNotifyCallee.go
func (mMgr *MastodonMgr) postCallerMsg(sendmsg string) error {
	_,err := mMgr.postCallerMsgEx(sendmsg)
// TODO here we should also save status.ID
	return err
}

func (mMgr *MastodonMgr) httpGetMidUser(w http.ResponseWriter, r *http.Request, cookie *http.Cookie, remoteAddr string) {
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
	if(mid=="") {
		// no mid given
		fmt.Printf("# httpGetMidUser no mid=%v ip=%v\n",mid,remoteAddr)
		return
	}

	cid := ""
	url_arg_array, ok = r.URL.Query()["cid"]
	if ok && len(url_arg_array[0]) >= 1 {
		cid = url_arg_array[0]
	}

	fmt.Printf("httpGetMidUser mid=%v cid=%s ip=%v\n",mid,cid,remoteAddr)
	calleeIdOnMastodon := ""
	callerIdOnMastodon := ""

	midEntry := &MidEntry{}
	err := mMgr.kvMastodon.Get(dbMid, mid, midEntry)
	if err != nil {
		fmt.Printf("! httpGetMidUser invalid or outdated mid=%s err=%v\n",mid,err)
		return
	}

	fmt.Printf("httpGetMidUser get midEntry mid=%s ok\n",mid)
	calleeIdOnMastodon = midEntry.MastodonIdCallee
	callerIdOnMastodon = midEntry.MastodonIdCaller

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
		mid,calleeIdOnMastodon,remoteAddr)
	calleeID = calleeIdOnMastodon
	mappingMutex.RLock()
	mappingData,ok := mapping[calleeIdOnMastodon]
	mappingMutex.RUnlock()
	if ok && mappingData.Assign!="" && mappingData.Assign!="none" {
		// calleeIdOnMastodon is mapped to a 11-digit calleeID
		calleeID = mappingData.Assign
		fmt.Printf("httpGetMidUser mapped calleeID=%s calleeIdOnMastodon=%v ip=%v\n",
			calleeID,calleeIdOnMastodon,remoteAddr)
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
		dbUser := mMgr.isValidCallee(calleeID)
		if dbUser!=nil {
			// calleeID is NOT online, but account is valid
			isValidCalleeID = "true"
			wsCliMastodonID = dbUser.MastodonID
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
		calleeID+"|"+wsCliMastodonID+"|"+callerIdOnMastodon+"|"+cMastodonID+"|"+cMastodonIDOnline
	fmt.Printf("httpGetMidUser codedString=%v\n",codedString)
	fmt.Fprintf(w,codedString)
	return
}

func (mMgr *MastodonMgr) httpGetOnline(w http.ResponseWriter, r *http.Request, urlPath string, remoteAddr string) {
	url_arg_array, ok := r.URL.Query()["id"]
	if ok && len(url_arg_array[0]) >= 1 {
		id := url_arg_array[0]
		if id=="" {
			fmt.Printf("# /getOnline no id given\n")
			return
		}
		url_arg_array, ok := r.URL.Query()["mid"]
		if ok && len(url_arg_array[0]) >= 1 {
			mid := url_arg_array[0]
			if mid=="" {
				fmt.Printf("# /getOnline no mid given (id=%s)\n",id)
				return
			}

			// check mid is valid
			midEntry := &MidEntry{}
			err := mMgr.kvMastodon.Get(dbMid, mid, midEntry)
			if err != nil {
				// mid is not valid
				fmt.Printf("# /getOnline get midEntry mid=%s is not valid (id=%s)\n",mid,id)
				return
			}

			hubMapMutex.RLock()
			hub := hubMap[id]
			hubMapMutex.RUnlock()
			if hub != nil {
				fmt.Printf("/getOnline id=%s is online\n",id)
				fmt.Fprintf(w,"true")
				return
			}
			fmt.Printf("/getOnline id=%s is NOT online\n",id)
			return
		}
	}
	fmt.Printf("# /getOnline fail\n")
}

func (mMgr *MastodonMgr) isValidCallee(calleeID string) *DbUser {
	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs, calleeID, &dbEntry)
	if err != nil {
		// this is not necessarily fatal
		fmt.Printf("! isValidCallee(%s) dbEntry err=%v\n",calleeID,err)
	} else {
		dbUserKey := fmt.Sprintf("%s_%d", calleeID, dbEntry.StartTime)
		var dbUser DbUser
		err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
		if err != nil {
			fmt.Printf("# isValidCallee(%s) dbUser err=%v\n",calleeID,err)
		} else {
			// calleeID has a valid account
			return &dbUser
		}
	}
	return nil
}

func (mMgr *MastodonMgr) httpRegisterMid(w http.ResponseWriter, r *http.Request, urlPath string, remoteAddr string, startRequestTime time.Time) {
	if allowNewAccounts {
		mID := urlPath[13:] // length if '/registermid/'
		argIdx := strings.Index(mID,"&")
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

		fmt.Printf("/register (mid=%s) ip=%s v=%s ua=%s\n",
			mID, remoteAddr, clientVersion, r.UserAgent())
		registerID := ""

		midEntry := &MidEntry{}
		err := mMgr.kvMastodon.Get(dbMid, mID, midEntry)
		if err != nil {
			// mid is not valid
			fmt.Printf("# /getOnline get midEntry mid=%s is not valid\n",mID)
			return
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
				fmt.Printf("/registermid (%s) fail pw too short\n",registerID)
				fmt.Fprintf(w, "too short")
				return
			}
			//fmt.Printf("register pw=%s(%d)\n",pw,len(pw))

			// this can be a fake request
			// we need to verify if registerID is a valid(registered) account
			var dbEntryRegistered DbEntry
			err := kvMain.Get(dbRegisteredIDs,registerID,&dbEntryRegistered)
			if err==nil {
				// registerID is already registered
				fmt.Printf("# /registermid (%s) fail db=%s bucket=%s get 'already registered'\n",
					registerID, dbMainName, dbRegisteredIDs)
				fmt.Fprintf(w, "was already registered")
				return
			}

			unixTime := startRequestTime.Unix()
			dbUserKey := fmt.Sprintf("%s_%d",registerID, unixTime)
			dbUser := DbUser{Ip1:remoteAddr, UserAgent:r.UserAgent()}
			dbUser.StoreContacts = true
			dbUser.StoreMissedCalls = true
			dbUser.MastodonID = registerID // wsClient.go uses this to set client.mastodonID
			dbUser.MastodonSendTootOnCall = true
			dbUser.MastodonAcceptTootCalls = true
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

func (mMgr *MastodonMgr) sendCallerLink(mid string, calleeID string, remoteAddr string) {
	// called by httpLogin() on successful login with mid-parameter
	// called by pickup.js (via /midcalleelogin) if mid-callee is already online
	// send the callerlink '/user/(calleeID)' to mid-caller
	// do NOT send more than once (ensured by clearMid(mid))

	if calleeID=="" {
		fmt.Printf("# sendCallerLink abort empty calleeID (mid=%s)\n", mid)
		return
	}

	if mid=="" {
		fmt.Printf("# sendCallerLink abort empty mid (calleeID=%s)\n", calleeID)
		return
	}
	midEntry := &MidEntry{}
	err := mMgr.kvMastodon.Get(dbMid, mid, midEntry)
	if err != nil {
		// we may not want to log this as error, bc mid can be outdated and this may happen often
		fmt.Printf("! sendCallerLink no midEntry for mid=%s (calleeID=%s) err=%v\n", mid, calleeID, err)
		return
	}
	mastodonUserID := midEntry.MastodonIdCallee

	if mastodonUserID=="" {
		// invalid mastodonUserID
		fmt.Printf("! sendCallerLink no mastodonUserID from midEntry calleeID=%s mid=%s\n", calleeID, mid)
		return
	}

	// only the 1st valid call to sendCallerLink will get processed
	// (we want to send the caller-link only once)

	fmt.Printf("sendCallerLink calleeID=%s mid=%s mastodonUserID=%s\n",calleeID,mid,mastodonUserID)
	if isOnlyNumericString(calleeID) {
		// if calleeID is 11-digit
		// - store mastodonUserID in dbUser and in mapping[]
		// - so 11-digit ID does not need to be entered again next time a mastodon call request comes in
		var dbEntry DbEntry
		err := kvMain.Get(dbRegisteredIDs,calleeID,&dbEntry)
		if err!=nil {
			// calleeID was not yet registered
			fmt.Printf("# sendCallerLink numeric(%s) fail db=%s bucket=%s not yet registered\n",
				calleeID, dbMainName, dbRegisteredIDs)
		} else {
			dbUserKey := fmt.Sprintf("%s_%d",calleeID, dbEntry.StartTime)
			var dbUser DbUser
			err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
			if err!=nil {
				fmt.Printf("# sendCallerLink numeric(%s) fail on dbUserBucket ip=%s\n", calleeID, remoteAddr)
			} else {
				if dbUser.MastodonID != "" && dbUser.MastodonID != mastodonUserID {
					// SUSPICIOUS?
					fmt.Printf("! sendCallerLink numeric(%s) dbUser.MastodonID=%s != mastodonUserID=%s\n",
						calleeID, dbUser.MastodonID, mastodonUserID)
				}

				dbUser.MastodonID = mastodonUserID
				dbUser.MastodonSendTootOnCall = true
				dbUser.MastodonAcceptTootCalls = true
				err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
				if err!=nil {
					fmt.Printf("# sendCallerLink numeric(%s) error db=%s bucket=%s put err=%v\n",
						calleeID,dbMainName,dbRegisteredIDs,err)
				} else {
					fmt.Printf("sendCallerLink numeric(%s) stored mastodonUserID=%s\n",
						calleeID, mastodonUserID)
				}
			}
		}

		// if mapping[mastodonUserID] != calleeID, set it
		mappingMutex.Lock()
		mappingData,ok := mapping[mastodonUserID]
		if ok && mappingData.CalleeId != calleeID {
			// this happens if CalleeId=mastodonID and calleeID=11-digits
			// ! sendCallerLink mapping[webcall@mastodon.social] != calleeID=19325349797
			fmt.Printf("! sendCallerLink mapping[%s]=%s != calleeID=%s (add)\n",
				mastodonUserID, mappingData.CalleeId, calleeID)
		}
		mapping[mastodonUserID] = MappingDataType{calleeID,"none"}
		mappingMutex.Unlock()
	}

	// finally: tell caller that callee is now online and ready to receive the call
	// this will only send a msg ("Click to call") to caller, if tmpkeyMastodonCallerMap[mid] NOT empty string
	// (for instance: after command=="register" there is no caller to send a msg to)
	err = mMgr.sendCallerMsgToMid(mid,calleeID)
	if err==nil {
// callee is now logged-in, but caller has just now received the call-link
// if we want to send the caller a mid-link (so the calleeID does not get logged), we should not clearMid here
//	fmt.Printf("sendCallerLink clearMid(%s)\n", mid)
		mMgr.clearMid(mid,remoteAddr)

		mMgr.kvMastodon.Delete(dbCid, calleeID)
	}
}

func (mMgr *MastodonMgr) clearMid(mid string, remoteAddr string) {
	if mid=="" {
		fmt.Printf("# clearMid(%s) ip=\n",mid,remoteAddr)
		return
	}

	fmt.Printf("clearMid(%s)...\n",mid)
	// delete /pickup msg and clear field inviter.statusID1
	midEntry := &MidEntry{}
	err := mMgr.kvMastodon.Get(dbMid, mid, midEntry)
	if err != nil {
		fmt.Printf("! clearMid(%s) get midMap[mid] fail err=%v ip=%s\n",mid,err,remoteAddr)
	} else if midEntry.MsgID=="" {
		fmt.Printf("! clearMid(%s) midMap[mid].msgID is empty ip=%s\n",mid,remoteAddr)
	} else {
		fmt.Printf("clearMid(%s) got midMap[mid].msgID=%s, get inviter...\n",mid,midEntry.MsgID)
		inviter := &Inviter{}
		err := mMgr.kvMastodon.Get(dbInviter, midEntry.MsgID, inviter)
		if err != nil {
			fmt.Printf("! clearMid(%s) mMgr.kvMastodon.Get midEntry.MsgID=%s is invalid err=%v ip=%s\n",
				mid,midEntry.MsgID,err,remoteAddr)
		} else {
			if inviter.StatusID1 == "" {
				fmt.Printf("! clearMid(%s) inviterMap[midEntry.MsgID=%s].StatusID1 is empty ip=%s\n",
					mid,midEntry.MsgID,remoteAddr)
			} else {
				fmt.Printf("clearMid(%s) delete inviterMap[midEntry.MsgID=%s].StatusID1 ip=%s\n",
					mid,midEntry.MsgID, remoteAddr)
// TODO: # clearMid DeleteStatus ID1 (109749542658645300) err=bad request: 404 Not Found: Record not found
				err := mMgr.c.DeleteStatus(context.Background(), inviter.StatusID1)
				if err!=nil {
					fmt.Printf("# clearMid DeleteStatus ID1 (%v) err=%v ip=%s\n",inviter.StatusID1,err,remoteAddr)
				} else {
					fmt.Printf("clearMid DeleteStatus ID1 (%v) done\n",inviter.StatusID1)
				}

				inviter.StatusID1 = ""
				err = mMgr.kvMastodon.Put(dbInviter, midEntry.MsgID, inviter, false)
				if err != nil {
					fmt.Printf("# mastodon processMessage msgID=%v failed to store dbInviter ip=%s\n",
						midEntry.MsgID, remoteAddr)
					return
				}
			}
		}
	}

	// now we can discard mid
	fmt.Printf("clearMid(%s) delete midMap\n",mid)
	err = mMgr.kvMastodon.Delete(dbMid, mid)
	if err!=nil {
		fmt.Printf("# clearMid(%s) delete midMap err=%v ip=%s\n",mid,err,remoteAddr)
	}
}

func (mMgr *MastodonMgr) isCallerWaitingForCallee(calleeID string) (string,string,error) {
/*
	// loop dbInviter
	// search for inviter.CalleeID == calleeID, return key = msgId
	fmt.Printf("isCallerWaitingForCallee(%s)\n",calleeID)
	msgId := ""
	mid := ""
	kv := mMgr.kvMastodon.(skv.SKV)
	db := kv.Db
	skv.DbMutex.Lock()
	err := db.Update(func(tx *bolt.Tx) error {
		b := tx.Bucket([]byte(dbInviter))
		if b==nil {
			fmt.Printf("# isCallerWaitingForCallee tx.Bucket==nil\n")
		} else {
			c := b.Cursor()
			for k, v := c.First(); k != nil; k, v = c.Next() {
				var inviter Inviter
				d := gob.NewDecoder(bytes.NewReader(v))
				d.Decode(&inviter)

// TODO what if there are multiple invitations for a single callee?
				if inviter.CalleeID == calleeID {
					msgId = string(k)
					mid = inviter.MidString
					break
				}
			}
			fmt.Printf("isCallerWaitingForCallee loop end, msgId=(%s) mid=%s\n",msgId,mid)
		}
		return nil
	})
	skv.DbMutex.Unlock()

	if err!=nil {
		// this is bad
		fmt.Printf("# isCallerWaitingForCallee done userID=(%s) msgId=(%s) mid=%s err=%v\n",
			calleeID, msgId, mid, err)
		return mid,msgId,err
	}
	fmt.Printf("isCallerWaitingForCallee done userID=(%s) msgId=(%s) mid=%s\n", calleeID, msgId, mid)
	return mid,msgId,nil
*/
	if mMgr==nil {
		return "","",nil
	}
	var cidEntry = CidEntry{}
	err := mMgr.kvMastodon.Get(dbCid, calleeID, &cidEntry)
	if err!=nil {
		// ignore err if key not found
		if strings.Index(err.Error(),"key not found")<0 {
			fmt.Printf("# mastodon processMessage calleeID=%s failed to get dbCid err=%v\n", calleeID, err)
		}
		return "","",err
	}
	//fmt.Printf("isCallerWaitingForCallee userID=(%s) cidEntry=(%v) err=%v\n", calleeID, cidEntry, err)
	mid := ""
	msgId := ""
	if cidEntry.MsgID!="" {
		msgId = cidEntry.MsgID
		var inviter = &Inviter{}
		err := mMgr.kvMastodon.Get(dbInviter, msgId, inviter)
		if err!=nil {
			// ignore err if key not found
			if strings.Index(err.Error(),"key not found")<0 {
				fmt.Printf("# mastodon processMessage msgId=%s failed to get dbInviter err=%v\n", msgId, err)
			}
		} else {
			mid = inviter.MidString
			fmt.Printf("isCallerWaitingForCallee done userID=(%s) msgId=(%s) mid=%s\n", calleeID, msgId, mid)
		}
	}
	return mid,msgId,nil
}

func (mMgr *MastodonMgr) mastodonStop() {
	fmt.Printf("mastodonStop\n")

	//fmt.Printf("mMgr.kvMastodon.Close...\n")
	err := mMgr.kvMastodon.Close()
	if err!=nil {
		fmt.Printf("# error dbName %s close err=%v\n",dbMastodon,err)
	}

	mMgr.abortChan <- true
	return
}

/*
func (mMgr *MastodonMgr) sendCallerMsgCalleeIsOnline(w http.ResponseWriter, r *http.Request, calleeID string, cookie *http.Cookie, remoteAddr string) {
	// called by httpServer.go /midmsg
	// send a msg to tmpkeyMastodonCallerReplyMap[mid] with tmpkeyMastodonCalleeMap[mid]:
	// get mid from urlarg tmtmtm
	url_arg_array, ok := r.URL.Query()["mid"]
	fmt.Printf("mastodon sendCallerMsgCalleeIsOnline url_arg_array=%v ok=%v\n",url_arg_array, ok)
	if ok && len(url_arg_array[0]) >= 1 {
		mid := url_arg_array[0]
		if(mid=="") {
			fmt.Printf("# mastodon sendCallerMsgCalleeIsOnline mid=%v\n",mid)
		} else {
			mMgr.midMutex.Lock()
			midEntry := &MidEntry{}
			err := mMgr.kvMastodon.Get(dbMid, mid, midEntry)
			if err != nil {
				// TODO log err
				fmt.Printf("# mastodon sendCallerMsgCalleeIsOnline get midEntry mid=%v err=%v\n",mid,err)
			} else if midEntry.MastodonIdCaller!="" && midEntry.MastodonIdCallee!="" {

// TODO do we really want to send-msg calleeID in clear?
				status,err := mMgr.postCallerMsgEx("@"+midEntry.MastodonIdCaller+" "+
					"Click to call "+mMgr.hostUrl+"/user/"+midEntry.MastodonIdCallee)
				if err!=nil {
					// this is fatal
					fmt.Printf("# sendCallerMsg err=%v (to=%v)\n",err,midEntry.MastodonIdCaller)
				} else {
					fmt.Printf("sendCallerMsg to=%v done ID=%v\n",midEntry.MastodonIdCaller, status.ID)
					if midEntry.MsgID!="" {
						fmt.Printf("sendCallerMsg midEntry.MsgID=%v\n",midEntry.MsgID)
// TODO not sure we can have nested inviterMutex.Lock inside midMutex.Lock()
						mMgr.inviterMutex.Lock()
						inviter := &Inviter{}
						err = mMgr.kvMastodon.Get(dbInviter, midEntry.MsgID, inviter)
						if err != nil {
							// can be ignored
// TODO but it is odd !!
						}
						inviter.StatusID2 = status.ID
						err = mMgr.kvMastodon.Put(dbInviter, midEntry.MsgID, inviter, false)
						mMgr.inviterMutex.Unlock()
						if err != nil {
							fmt.Printf("# mastodon processMessage msgID=%v failed to store dbInviter\n",
								midEntry.MsgID)
							return
						}

					} else {
						fmt.Printf("# sendCallerMsg statusID2=%v msgID=%s\n",status.ID,midEntry.MsgID)
					}
				}
			}
			mMgr.midMutex.Unlock()
		}
	}
}
*/

