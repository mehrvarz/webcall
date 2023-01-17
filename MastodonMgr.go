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
//	"golang.org/x/crypto/bcrypt"
	"github.com/mattn/go-mastodon"
	"github.com/mehrvarz/webcall/skv"
)

// TODO must make sure we don't run into msg-send-quota (triggered by invalid user requests)
// so NO unnecessary sendmsgs !

type Inviter struct { // key = mastodon msgID
	MastodonUserId string
	MidString string      // enables clearMid(mid) before inviter is deleted
	// calleeID string ?
	// callerID string ?
	statusID1 mastodon.ID // for callee
	statusID2 mastodon.ID // for caller
	Expiration int64
}

type MidEntry struct { // key = mid
	mastodonIdCallee string
	mastodonIdCaller string
	msgID string
}

type MastodonMgr struct {
	c *mastodon.Client
	abortChan chan bool
	hostUrl string

	// a map of all active inviter requests
// TODO make inviterMap[] persistent, so we can restart the server at any time
	inviterMap map[string]*Inviter
	inviterMutex sync.RWMutex

	// a map of all active mid's
	midMap map[string]*MidEntry
	midMutex sync.RWMutex
}

func NewMastodonMgr() *MastodonMgr {
	return &MastodonMgr{
		inviterMap:  make(map[string]*Inviter),
		midMap:      make(map[string]*MidEntry),
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
			switch event := evt.(type) {          // the switch uses the type of the interface
			case *mastodon.NotificationEvent:
				fmt.Printf("mastodonhandler Notif-Type=(%v) Notif=(%v) Acct=(%v)\n",
					event.Notification.Type, event.Notification, event.Notification.Account.Acct)
				content := event.Notification.Status.Content
				fmt.Printf("mastodonhandler Content=(%v)\n",content)
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
/*
			default:
				fmt.Printf("mastodonhandler default\n")
*/
			}
		}
	}

	mMgr.abortChan = nil
	return
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
// TODO must be very carefully with this (ask user: are you sure?)
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
						// this is bad
						fmt.Printf("# mastodon wc-delete user-key=%s err=%v\n", dbUserKey, err)
// TODO notify user by msg?
					} else {
						fmt.Printf("mastodon wc-delete user-key=%s done\n", dbUserKey)
					}

					err = kvMain.Delete(dbRegisteredIDs, mastodonUserId)
					if err!=nil {
						// this is bad
						fmt.Printf("# mastodon wc-delete user-id=%s err=%v\n", mastodonUserId, err)
// TODO notify user by msg?
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

					cookieValue := mastodonUserId
					pwIdCombo := PwIdCombo{}
					err = kvHashedPw.Put(dbHashedPwBucket, cookieValue, pwIdCombo, true)
					if err!=nil {
						fmt.Printf("# mastodon wc-delete (%s) fail dbHashedPwBucket\n",	mastodonUserId)
					} else {
						fmt.Printf("mastodon wc-delete kvHashedPw cookieValue=%s\n", cookieValue)
					}
				}
				// abort processMessage here
				return
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
		mMgr.inviterMutex.Lock()
		inviter,ok := mMgr.inviterMap[msgID]
		if !ok || inviter==nil {
			inviter = &Inviter{}
		}
		inviter.MastodonUserId = mastodonUserId
		inviter.Expiration = time.Now().Unix() + 60*60
		mMgr.inviterMap[msgID] = inviter
		mMgr.inviterMutex.Unlock()
		// mMgr.inviterMap[msgID] only becomes relevant if target user sends a confirm msg back

	} else {
		// this is a reply/confirm msg (or might be one)
		// reply/confirm msg (event.Notification.Status.InReplyToID == callerMastodonMsgId (of original msg)
		mMgr.inviterMutex.RLock()
		inviter,ok := mMgr.inviterMap[inReplyToID]
		mMgr.inviterMutex.RUnlock()
		if !ok || inviter==nil {
			// most likely mMgr.inviterMap[inReplyToID] has been outdated (or was for some reason not stored)
			// ignore / abort
			// don't send msg to mastodonUserId (don't run into msg-send-quota triggered by invalid user)
			fmt.Printf("# mastodon processMessage unknown Status.InReplyToID(%s) maybe outdated?\n",inReplyToID)
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

		if !mMgr.isValidCallee(calleeID) && mMgr.isValidCallee(callerID) {
// TODO also: if callerID is online callee and calleeID is not
			// inviter has no valid webcall account, but responder has
			// this is the one case where we turn things around
			// inviter becomes caller; responder becomes callee
			tmpID := mastodonCallerID
			mastodonCallerID = mastodonCalleeID
			mastodonCalleeID = tmpID

			tmpID = callerID
			callerID = callerID
			callerID = tmpID

			fmt.Printf("mastodon processMessage roles (special): inviter -> caller, responder -> callee\n")
		} else {
			fmt.Printf("mastodon processMessage roles (default): inviter -> callee, responder -> caller\n")
		}

		// the two roles have now been decided 
		// TODO not sure yet if callerID and calleeID need to be stored in inviter map

		// when we offer the callee role, we first check
		// - cookiename
		// then we offer choice:
		// - MastodonUserId
		// - enter WebCall calleeID
		// - create new persistent callee account
		// - one-off session

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

// TODO do we really want to send-msg calleeID in clear?
// TODO change to "To call @"+mastodonCalleeID+" click: "+mMgr.hostUrl+"/user/"+calleeID
			status,err := mMgr.postCallerMsgEx("@"+mastodonCallerID+" "+
//							"Click to call "+mMgr.hostUrl+"/user/"+calleeID)
							"To call "+mastodonCalleeID+" click: "+mMgr.hostUrl+"/user/"+calleeID)
			if err!=nil {
				// this is fatal
				fmt.Printf("# sendCallerMsg err=%v (to=%v)\n",err,mastodonCallerID)
			} else {
				fmt.Printf("sendCallerMsg done, status.ID=%v\n",status.ID)
				mMgr.inviterMutex.Lock()
				inviter.statusID2 = status.ID
				mMgr.inviterMap[msgID] = inviter
				mMgr.inviterMutex.Unlock()
			}
			// remove the inviter now
			//mMgr.clearInviter(msgID)

		} else if mMgr.isValidCallee(calleeID) {
			// calleeID is not currently online, but it is a valid/registered callee
			fmt.Printf("mastodon processMessage callee offline but valid, send /callee link to callee\n")

			// send a mastodon-msg to the callee and ask it to login to answer call or register a new calleeID
			// for secure register we generate a unique random 11-digit mID to refer to mastodonCalleeID 
			mMgr.midMutex.Lock()
			mID,err := mMgr.makeSecretID() //"xxxxxxxxxxx"
			if err!=nil {
				// this is fatal
				fmt.Printf("# mastodon processMessage makeSecretID fatal err=%v\n",err)
				mMgr.midMutex.Unlock()
				return
			}
			// mid -> mastodonCalleeID
			// this allows /callee/pickup to find mastodonCalleeID (a mastodon user id) via mID
			midEntry := &MidEntry{}
			midEntry.mastodonIdCallee = mastodonCalleeID
			midEntry.mastodonIdCaller = mastodonCallerID
			midEntry.msgID = msgID
			mMgr.midMap[mID] = midEntry
			mMgr.midMutex.Unlock()

			// store mid in inviter, so we can delete it later
			mMgr.inviterMutex.Lock()
			inviter,ok := mMgr.inviterMap[msgID]
			if !ok || inviter==nil {
				inviter = &Inviter{}
			}
			inviter.MidString = mID
			mMgr.inviterMap[msgID] = inviter
			mMgr.inviterMutex.Unlock()

			// send msg to mastodonCalleeID, with link to /callee/pickup
			sendmsg := "@"+mastodonCalleeID+" "+
				"User "+mastodonCallerID+" wants to give you a web telephony call.\n"+
				"Answer call: "+mMgr.hostUrl+"/callee/pickup?mid="+mID
			fmt.Printf("mastodon processMessage PostStatus (%s)\n",sendmsg)
			status,err := mMgr.postCallerMsgEx(sendmsg)
			if err!=nil {
				fmt.Printf("# mastodon processMessage postCallerMsgEx err=%v\n",err)
			} else {
				// at some point later we need to delete msg status.ID
				// note: deleting a (direct) mastodon msg does NOT delete it on the receiver/caller side
				mMgr.inviterMutex.Lock()
				inviter.statusID1 = status.ID
				mMgr.inviterMap[msgID] = inviter
				mMgr.inviterMutex.Unlock()
			}

		} else {
			// calleeID (for instance timurmobi@mastodon.social) does not exist
			// msg-receiver should register a WebCall callee account, so calls can be received
			fmt.Printf("mastodon processMessage callee is no webcall user, sending offerRegister\n")
			// NOTE: msg must end with a blank
			msg := "User "+mastodonCallerID+" wants to give you a WebCall. "

// TODO: we need to put instructions for new users on the mastodon @webcall homepage
// "if you receive call request from an account that you don't want to make phone calls with,
// you may want to consider to mute or block it

			// arg2 none-empty string: notify caller after callee-login
			// arg3 none-empty string: callerMsgID to notify after callee-login (not currently used)
			// arg4 none-empty string: msg will be put in front of "Answer call:"
			err := mMgr.offerRegisterLink(mastodonCalleeID,mastodonCallerID,msg,msgID)
			if err!=nil {
				fmt.Printf("# mastodon processMessage offerRegisterLink err=%v\n",err)
			}
		}

		// once callee has logged in, the caller link to send to the caller
	}
}

func (mMgr *MastodonMgr) cleanupMastodonInviter(w io.Writer) {
	// delete/outdate inviterMap[] entries in parallel based on inviter.Expiration
	// timer.go calls this func periodically every 20 min
	fmt.Printf("cleanupMastodonInviter...\n")
	timeNowUnix := time.Now().Unix()
	var deleteInviterArray []string

	mMgr.inviterMutex.Lock()
	for mastodonMsgID, inviter := range mMgr.inviterMap {
		if inviter==nil {
			continue
		}

		fmt.Printf("cleanupMastodonInviter timeNowUnix=%d - inviter.Expiration=%d = %d (>0 fire)\n",
			timeNowUnix, inviter.Expiration, timeNowUnix - inviter.Expiration)
		if inviter.Expiration <= 0 {
			continue
		}

		if timeNowUnix - inviter.Expiration >= 0 {
			// this invitation is older than it's Expiration time: delete it
			// DeleteStatus() previously sent msgs
			if inviter.statusID1 != "" {
				err := mMgr.c.DeleteStatus(context.Background(), inviter.statusID1)
				if err!=nil {
					fmt.Printf("# cleanupMastodonInviter DeleteStatus(ID1=%v) err=%v\n",inviter.statusID1,err)
				} else {
					fmt.Printf("cleanupMastodonInviter DeleteStatus(ID1=%v) done\n",inviter.statusID1)
				}
			}
			if inviter.statusID2 != "" {
				err := mMgr.c.DeleteStatus(context.Background(), inviter.statusID2)
				if err!=nil {
					fmt.Printf("# cleanupMastodonInviter DeleteStatus(ID2=%v) err=%v\n",inviter.statusID2, err)
				} else {
					fmt.Printf("cleanupMastodonInviter DeleteStatus(ID2=%v) done\n",inviter.statusID2)
				}
			}

			// delete the inviter itself below, outside of range loop
			deleteInviterArray = append(deleteInviterArray,mastodonMsgID)
		}
	}

	if len(deleteInviterArray)>0 {
		fmt.Printf("cleanupMastodonInviter delete %d/%d inviterMap entries\n",
			len(deleteInviterArray), len(mMgr.inviterMap))
		for _,mastodonMsgID := range deleteInviterArray {
			mid := mMgr.inviterMap[mastodonMsgID].MidString
			if mid!="" {
				mMgr.clearMid(mid)
			}
			fmt.Printf("cleanupMastodonInviter delete inviterMap msgId(%s)\n",mastodonMsgID)
			delete(mMgr.inviterMap,mastodonMsgID)
		}
	}
	mMgr.inviterMutex.Unlock()

	fmt.Printf("cleanupMastodonInviter done\n")
}

func (mMgr *MastodonMgr) offerRegisterLink(mastodonUserId string, mastodonCallerUserId string, msg string, msgID string) error {
	// offer link to /pickup, where mastodonUserId can be registered
	// 1) is called in response to a call, we want to send a msg to caller after login
	// 2) is called in response to "register", we DONT want to send a msg to caller after login

	// first we need a unique mID (refering to mastodonUserId)
	mMgr.midMutex.Lock()
	mID,err := mMgr.makeSecretID() //"xxxxxxxxxxx"
	if err!=nil {
		// this is fatal
		mMgr.midMutex.Unlock()
		fmt.Printf("# offerRegisterLink register makeSecretID err=(%v)\n", err)
		return err
	}
	midEntry,ok := mMgr.midMap[mID]
	if !ok || midEntry==nil {
		midEntry = &MidEntry{}
	}
	midEntry.mastodonIdCallee = mastodonUserId
	midEntry.mastodonIdCaller = mastodonCallerUserId
	midEntry.msgID = msgID
	mMgr.midMap[mID] = midEntry
	mMgr.midMutex.Unlock()

	// store mid in inviter, so we can delete it later
	mMgr.inviterMutex.Lock()
	inviter,ok := mMgr.inviterMap[msgID]
	if !ok || inviter==nil {
		inviter = &Inviter{}
	}
	inviter.MidString = mID
	mMgr.inviterMap[msgID] = inviter
	mMgr.inviterMutex.Unlock()

// TODO add callerMastodonUserId as username to link (so caller.js can forward it to callee)
	sendmsg :="@"+mastodonUserId+" "+msg+"Answer call: "+mMgr.hostUrl+"/callee/pickup?mid="+mID
	fmt.Printf("offerRegisterLink PostStatus (%s)\n",sendmsg)
	status,err := mMgr.postCallerMsgEx(sendmsg)
	if err!=nil {
		// this is fatal
		fmt.Printf("# offerRegisterLink PostStatus err=%v (to=%v)\n",err,mastodonUserId)
		return err
	}

	// at some point later we need to delete (from mastodon) all direct messages
	fmt.Printf("offerRegisterLink PostStatus sent to=%v\n", mastodonUserId)
	mMgr.inviterMutex.Lock()
	inviter.statusID1 = status.ID
	mMgr.inviterMap[msgID] = inviter
	mMgr.inviterMutex.Unlock()
	return nil
}

func (mMgr *MastodonMgr) makeSecretID() (string,error) {
	// tmpkeyMastodonMutex must be locked outside
	tries := 0
	for {
		tries++
		intID := uint64(rand.Int63n(int64(99999999999)))
		if(intID<uint64(10000000000)) {
			continue;
		}
		newSecretId := strconv.FormatInt(int64(intID),10)

		midEntry,ok := mMgr.midMap[newSecretId]
		if ok && midEntry!=nil && midEntry.mastodonIdCallee != "" {
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

func (mMgr *MastodonMgr) sendCallerMsgToMid(mid string, calleeID string) {
	// send message with link containing "/user/"+urlID to tmpkeyMastodonCallerReplyMap[mid]
	callerMastodonUserId := ""
	mMgr.midMutex.RLock()
	midEntry,ok := mMgr.midMap[mid]
	if ok && midEntry!=nil {
		callerMastodonUserId = midEntry.mastodonIdCaller
	}
	mMgr.midMutex.RUnlock()

	fmt.Printf("mastodon sendCallerMsgToMid calleeID=%s mid=%s callerMastodonUserId=%s\n",
		calleeID, mid, callerMastodonUserId)
	// calleeID and callerMastodonUserId (if set) appear to be the same?

	if callerMastodonUserId!="" {
// TODO do we really want to send-msg calleeID in clear?
// TODO add callerMastodonUserId as username to link (so caller.js can forward it to callee)
		sendmsg :=	"@"+callerMastodonUserId+" Click to call: "+mMgr.hostUrl+"/user/"+calleeID
		status,err := mMgr.postCallerMsgEx(sendmsg)
		if err!=nil {
			// this is fatal
			fmt.Printf("# sendCallerMsgToMid err=%v (to=%v)\n",err,callerMastodonUserId)
			return
		}
		fmt.Printf("sendCallerMsgToMid to=%v done ID=%v\n",callerMastodonUserId, status.ID)
		if midEntry!=nil {
			if midEntry.msgID!="" {
				fmt.Printf("sendCallerMsgToMid midEntry.msgID=%v\n",midEntry.msgID)
				mMgr.inviterMutex.Lock()
				inviter,ok := mMgr.inviterMap[midEntry.msgID]
				if ok && inviter!=nil {
					fmt.Printf("sendCallerMsgToMid statusID2=%v msgID=%s\n", status.ID, midEntry.msgID)
					inviter.statusID2 = status.ID
					mMgr.inviterMap[midEntry.msgID] = inviter
				}
				mMgr.inviterMutex.Unlock()
			} else {
				fmt.Printf("! sendCallerMsgToMid statusID2=%v msgID=%s\n", status.ID, midEntry.msgID)
			}
		} else {
			fmt.Printf("! sendCallerMsgToMid statusID2=%v midEntry=nil\n", status.ID)
		}
	} else {
		// TODO outdated? this can happen a lot; no need to log this every time
		//fmt.Printf("# mastodon sendCallerMsgToMid callerMastodonUserId empty, calleeID=%s mid=%s\n",calleeID,mid)
	}
}

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
			midEntry,ok := mMgr.midMap[mid]
			if ok && midEntry!=nil && midEntry.mastodonIdCaller!="" && midEntry.mastodonIdCallee!="" {
// TODO do we really want to send-msg calleeID in clear?
// TODO add callerMastodonUserId as username to link (so caller.js can forward/signal it to callee)
				status,err := mMgr.postCallerMsgEx("@"+midEntry.mastodonIdCaller+" "+
					"Click to call "+mMgr.hostUrl+"/user/"+midEntry.mastodonIdCallee)
				if err!=nil {
					// this is fatal
					fmt.Printf("# sendCallerMsg err=%v (to=%v)\n",err,midEntry.mastodonIdCaller)
				} else {
					fmt.Printf("sendCallerMsg to=%v done ID=%v\n",midEntry.mastodonIdCaller, status.ID)
					if midEntry.msgID!="" {
						fmt.Printf("sendCallerMsg midEntry.msgID=%v\n",midEntry.msgID)
						mMgr.inviterMutex.Lock()
						inviter,ok := mMgr.inviterMap[midEntry.msgID]
						if ok && inviter!=nil {
							fmt.Printf("sendCallerMsg statusID2=%v msgID=%s\n",status.ID,midEntry.msgID)
							inviter.statusID2 = status.ID
							mMgr.inviterMap[midEntry.msgID] = inviter
						}
						mMgr.inviterMutex.Unlock()
					} else {
						fmt.Printf("# sendCallerMsg statusID2=%v msgID=%s\n",status.ID,midEntry.msgID)
					}
				}
			}
			mMgr.midMutex.Unlock()
		}
	}
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
	fmt.Printf("/getMidUser url_arg_array=%v ok=%v\n",url_arg_array, ok)
	if ok && len(url_arg_array[0]) >= 1 {
		mid := url_arg_array[0]
		if(mid=="") {
			// no mid given
			fmt.Printf("# /getMidUser no mid=%v ip=%v\n",mid,remoteAddr)
		} else {
			calleeIdOnMastodon := ""
			mMgr.midMutex.RLock()
			midEntry,ok := mMgr.midMap[mid]
			if ok && midEntry!=nil {
				calleeIdOnMastodon = midEntry.mastodonIdCallee
			}
			mMgr.midMutex.RUnlock()

			isValidCalleeID := "false"
			isOnlineCalleeID := "false"
			if(calleeIdOnMastodon=="") {
				// invalid mid
				fmt.Printf("# /getMidUser invalid mid=%s calleeIdOnMastodon=%v ip=%v\n",
					mid,calleeIdOnMastodon,remoteAddr)
			} else {
				// valid mid + calleeIdOnMastodon
				// calleeIdOnMastodon (eg "tm@mastodontech.de") may already be in use
				// httpRegisterMid() below will detect this
				// TODO but we should act now, to prevent registration-offer

				fmt.Printf("/getMidUser mid=%s calleeIdOnMastodon=%v ip=%v\n",mid,calleeIdOnMastodon,remoteAddr)
				calleeID := calleeIdOnMastodon
				mappingMutex.RLock()
				mappingData,ok := mapping[calleeIdOnMastodon]
				mappingMutex.RUnlock()
				if ok {
					// calleeIdOnMastodon is mapped (caller is using a temporary (mapped) calleeID)
					if mappingData.Assign!="" && mappingData.Assign!="none" {
						calleeID = mappingData.Assign
						fmt.Printf("/getMidUser mapped calleeID=%s calleeIdOnMastodon=%v ip=%v\n",
							calleeID,calleeIdOnMastodon,remoteAddr)
					}
				}

				hubMapMutex.RLock()
				hub := hubMap[calleeID]
				hubMapMutex.RUnlock()
				if hub!=nil {
					isOnlineCalleeID = "true"
					isValidCalleeID = "true"
				} else {
					// user is NOT online: check if account valid
					if mMgr.isValidCallee(calleeID) {
						isValidCalleeID = "true"
					}
				}

				codedString := calleeIdOnMastodon+"|"+isValidCalleeID+"|"+isOnlineCalleeID 
				fmt.Printf("/getMidUser codedString=%v\n",codedString)
				fmt.Fprintf(w,codedString)
				return
			}
		}
	}

	return
}

func (mMgr *MastodonMgr) isValidCallee(calleeID string) bool {
	var dbEntry DbEntry
	err := kvMain.Get(dbRegisteredIDs, calleeID, &dbEntry)
	if err != nil {
		// this is not necessarily fatal
		fmt.Printf("isValidCallee(%s) dbEntry err=%v\n",calleeID,err)
	} else {
		dbUserKey := fmt.Sprintf("%s_%d", calleeID, dbEntry.StartTime)
		var dbUser DbUser
		err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
		if err != nil {
			fmt.Printf("# isValidCallee(%s) dbUser err=%v\n",calleeID,err)
		} else {
			// calleeID exists as a valid account
			return true
		}
	}
	return false
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
		mMgr.midMutex.RLock()
		midEntry,ok := mMgr.midMap[mID]
		if ok && midEntry!=nil {
			registerID = midEntry.mastodonIdCallee
		}
		mMgr.midMutex.RUnlock()
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
			dbUser.MastodonID = registerID
			dbUser.MastodonSendTootOnCall = true
			dbUser.MastodonAcceptTootCalls = true
			err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
			if err!=nil {
				fmt.Printf("# /registermid (%s) error db=%s bucket=%s put err=%v\n",
					registerID, dbMainName, dbUserBucket, err)
				fmt.Fprintf(w,"cannot register user")
			} else {
/*
				storePw := pw
				hash, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.MinCost)
				if err != nil {
					fmt.Printf("# /login bcrypt err=%v\n", err)
					// cont to use unencrypt pw
				} else {
					fmt.Printf("/login bcrypt store (%v)\n", string(hash))
					storePw = string(hash)
				}
*/
				err = kvMain.Put(dbRegisteredIDs, registerID,
						DbEntry{unixTime, remoteAddr, ""}, false)
				if err!=nil {
					fmt.Printf("# /registermid (%s) error db=%s bucket=%s put err=%v\n",
						registerID,dbMainName,dbRegisteredIDs,err)
					fmt.Fprintf(w,"cannot register ID")
					// TODO this is bad! got to role back kvMain.Put((dbUser...) from above
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

func (mMgr *MastodonMgr) calleeLoginSuccess(mid string, urlID string, remoteAddr string) {
	// called by httpLogin() on successful login with mid-parameter
	if mid=="" {
		fmt.Printf("# calleeLoginSuccess abort urlID=%s mid=%s\n", urlID, mid)
		return
	}
	if urlID=="" {
		fmt.Printf("# calleeLoginSuccess abort urlID=%s mid=%s\n", urlID, mid)
		return
	}

	mMgr.midMutex.RLock()
	midEntry,ok := mMgr.midMap[mid]
	if !ok || midEntry==nil {
		mMgr.midMutex.RUnlock()
		// we should not log this as error bc midMap[mid] can be outdated and this is fine
		//fmt.Printf("# calleeLoginSuccess no midEntry for mid urlID=%s mid=%s\n", urlID, mid)
		return
	}
	mastodonUserID := midEntry.mastodonIdCallee
	mMgr.midMutex.RUnlock()
	if mastodonUserID=="" {
		fmt.Printf("# calleeLoginSuccess no mastodonUserID from midEntry urlID=%s mid=%s\n", urlID, mid)
		return
	}

	fmt.Printf("calleeLoginSuccess urlID=%s mid=%s mastodonUserID=%s\n",urlID,mid,mastodonUserID)
	if isOnlyNumericString(urlID) {
		// if urlID/calleeID is 11-digit
		// store mastodonUserID in dbUser and in mapping[]
		// so 11-digit ID does not need to be entered again next time a mastodon call request comes in
		var dbEntry DbEntry
		err := kvMain.Get(dbRegisteredIDs,urlID,&dbEntry)
		if err!=nil {
			// urlID was not yet registered
			fmt.Printf("# calleeLoginSuccess numeric(%s) fail db=%s bucket=%s not yet registered\n",
				urlID, dbMainName, dbRegisteredIDs)
		} else {
			dbUserKey := fmt.Sprintf("%s_%d",urlID, dbEntry.StartTime)
			var dbUser DbUser
			err = kvMain.Get(dbUserBucket, dbUserKey, &dbUser)
			if err!=nil {
				fmt.Printf("# calleeLoginSuccess numeric(%s) fail on dbUserBucket %s\n", urlID, remoteAddr)
			} else {
				if dbUser.MastodonID != "" && dbUser.MastodonID != mastodonUserID {
					// SUSPICIOUS?
					fmt.Printf("! calleeLoginSuccess numeric(%s) dbUser.MastodonID=%s != mastodonUserID=%s\n",
						urlID, dbUser.MastodonID, mastodonUserID)
				}

				dbUser.MastodonID = mastodonUserID
				dbUser.MastodonSendTootOnCall = true
				dbUser.MastodonAcceptTootCalls = true
				err = kvMain.Put(dbUserBucket, dbUserKey, dbUser, false)
				if err!=nil {
					fmt.Printf("# calleeLoginSuccess numeric(%s) error db=%s bucket=%s put err=%v\n",
						urlID,dbMainName,dbRegisteredIDs,err)
				} else {
					fmt.Printf("calleeLoginSuccess numeric(%s) stored mastodonUserID=%s\n",
						urlID, mastodonUserID)
				}
			}
		}

		// store the mastodonUserID in mapping[], pointing to 11-digit urlID
		mappingMutex.Lock()
		mappingData,ok := mapping[mastodonUserID]
		if ok && mappingData.CalleeId != urlID {
			// TODO SUSPICIOUS?
			fmt.Printf("! calleeLoginSuccess CalleeId=%s != urlID=%s\n", mappingData.CalleeId, urlID)
		}
		mapping[mastodonUserID] = MappingDataType{urlID,"none"}
		mappingMutex.Unlock()
	}

	// finally: tell caller that callee is now online and ready to receive the call
	// this will only send a msg ("Click to call") to caller, if tmpkeyMastodonCallerMap[mid] NOT empty string
	// (for instance: after command=="register" there is no caller to send a msg to)
	mMgr.sendCallerMsgToMid(mid,urlID)

// callee is now logged-in, but caller has just now received his call-link
// if we want to send the caller a mid-link (so the calleeID does not get logged), we should not clearMid here
	fmt.Printf("calleeLoginSuccess clearMid(%s)\n", mid)
	mMgr.clearMid(mid)
}

func (mMgr *MastodonMgr) clearMid(mid string) {
	if mid=="" {
		fmt.Printf("# clearMid(%s)\n",mid)
		return
	}
	mMgr.midMutex.RLock()
	midEntry,ok := mMgr.midMap[mid]
	mMgr.midMutex.RUnlock()
	if !ok || midEntry==nil {
		fmt.Printf("clearMid(%s) no midEntry (likely already delete)\n",mid)
		return
	}

	// now we can discard mid
	fmt.Printf("clearMid(%s) delete midMap\n",mid)
	mMgr.midMutex.Lock()
	delete(mMgr.midMap,mid)
	mMgr.midMutex.Unlock()
}

/*
func (mMgr *MastodonMgr) clearInviter(msgId string) {
	fmt.Printf("clearInviter msgID=%s\n",msgId)
	if msgId != "" {
		mMgr.inviterMutex.Lock()
		inviter,ok := mMgr.inviterMap[msgId]
		if ok && inviter!=nil {
			// DeleteStatus() previously sent msgs
			if inviter.statusID1 != "" {
				err := mMgr.c.DeleteStatus(context.Background(), inviter.statusID1)
				if err!=nil {
					fmt.Printf("# clearInviter DeleteStatus(statusID1=%v) err=%v\n",inviter.statusID1, err)
				} else {
					fmt.Printf("clearInviter DeleteStatus(statusID1=%v) done\n",inviter.statusID1)
				}
			}
// delete ID2 and inviterMap[msgId] only from timer->cleanupMastodonInviter()
// but not from clearInviter() / sendMsgToCaller / calleeLoginSuccess()
//			if inviter.statusID2 != "" {
//				err := mMgr.c.DeleteStatus(context.Background(), inviter.statusID2)
//				if err!=nil {
//					fmt.Printf("# clearInviter DeleteStatus(statusID2=%v) err=%v\n",inviter.statusID2, err)
//				} else {
//					fmt.Printf("clearInviter DeleteStatus(statusID=%v) done\n",inviter.statusID2)
//				}
//			}
//			// delete inviter
//			delete(mMgr.inviterMap,msgId)
//			fmt.Printf("clearInviter msgID=%s done\n",msgId)
		}
		mMgr.inviterMutex.Unlock()
	}
}
*/

func (mMgr *MastodonMgr) mastodonStop() {
	fmt.Printf("mastodonStop\n")
	mMgr.abortChan <- true
	return
}

