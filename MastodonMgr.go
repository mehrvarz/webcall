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
)

// TODO must make sure we don't run into msg-send-quota (triggered by invalid user requests)
// so NO unnecessary sendmsgs !

type Inviter struct { // key = mastodon msgID
	MastodonUserId string
	MidId string
	// calleeID string ?
	// callerID string ?
	statusID mastodon.ID
	statusID2 mastodon.ID
	Expiration int64
}

type MidKey struct { // key = midID
	mastodonIdCallee string
	mastodonIdCaller string
	msgID string
	statusID mastodon.ID
	statusID2 mastodon.ID
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
	midkeyMap map[string]*MidKey
	midkeyMutex sync.RWMutex
}

func NewMastodonMgr() *MastodonMgr {
	return &MastodonMgr{
		inviterMap:  make(map[string]*Inviter),
		midkeyMap:   make(map[string]*MidKey),
	}
}

func (mMgr *MastodonMgr) mastodonStart(config string) {
	// only start if not already running
	if mMgr.abortChan != nil {
		fmt.Printf("# mastodonStart already running\n")
		return
	}
	// config format: 'Server|ClientID|ClientSecret|username|password'
	tokSlice := strings.Split(config, "|")
	if len(tokSlice)!=5 {
		fmt.Printf("# mastodonStart config should have 5 tokens, has %d (%s)\n",len(tokSlice),config)
		return
	}

	mMgr.hostUrl = "https://"+hostname
	if httpsPort>0 {
		mMgr.hostUrl += ":"+strconv.FormatInt(int64(httpsPort),10)
	}

	mMgr.c = mastodon.NewClient(&mastodon.Config{
		Server:       tokSlice[0],
		ClientID:	  tokSlice[1],
		ClientSecret: tokSlice[2],
	})
	err := mMgr.c.Authenticate(context.Background(), tokSlice[3], tokSlice[4])
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
				mMgr.processMessage(command,event)

/*			case *mastodon.UpdateEvent:
				if event.Status.Content!="" {
					fmt.Printf("mastodonhandler UpdateEvent content=(%v)\n",event.Status.Content)
				} else {
					fmt.Printf("mastodonhandler UpdateEvent reblog=(%v)\n",event.Status.Reblog)
				}
*/
			case *mastodon.DeleteEvent:
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

// @webcall@mastodon.social !tm@mastodontech.de
func (mMgr *MastodonMgr) processMessage(msg string, event *mastodon.NotificationEvent) {
	msg = strings.TrimSpace(msg)

	mastodonUserId := event.Notification.Account.Acct
	if strings.Index(mastodonUserId,"@")<0 {
		// this notif was sent by a user on "our" instance
		mastodonUserId += "@mastodon.social"	// TODO hack
	}

	msgID := fmt.Sprint(event.Notification.Status.ID)
	if msgID == "<nil>" { msgID = "" }
	inReplyToID := fmt.Sprint(event.Notification.Status.InReplyToID)
	if inReplyToID == "<nil>" { inReplyToID = "" }
	tok := strings.Split(msg, " ")
	fmt.Printf("mastodon processMessage msg=(%v) msgId=%v InReplyToID=%v lenTok=%d\n",
		msg, msgID, inReplyToID, len(tok))

	if msgID=="" {
		// can't work without a msgID
		fmt.Printf("# mastodon processMessage empty event.Notification.Status.ID\n")
		return
	}
/*
	if inReplyToID=="" {
		// can't work without a msgID
		fmt.Printf("# mastodon processMessage empty event.Notification.Status.InReplyToID\n")
		return
	}
*/
	if inReplyToID=="" {
		// this is a request/invite msg (could also be any kind of msg)

		if len(tok)>0 {
			command := strings.ToLower(strings.TrimSpace(tok[0]))

			switch {
			case command=="wc-delete":
				// here we remove a mastodonUserId
// TODO must be very carefully with this (ask user: are you sure?)
				fmt.Printf("mastodon processMessage delete (%v)\n", mastodonUserId)

				var dbEntryRegistered DbEntry
				err := kvMain.Get(dbRegisteredIDs,mastodonUserId,&dbEntryRegistered)
				if err!=nil {
					fmt.Printf("# mastodon processMessage delete user=%s err=%v\n", mastodonUserId, err)
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
						fmt.Printf("# mastodon processMessage delete contacts of id=%s err=%v\n",
							mastodonUserId, err)
					}

					kv := kvMain.(skv.SKV)
					err = kv.Delete(dbUserBucket, dbUserKey)
					if err!=nil {
						// this is bad
						fmt.Printf("# mastodon processMessage delete user-key=%s err=%v\n", dbUserKey, err)
// TODO notify user by msg?
					} else {
						fmt.Printf("mastodon processMessage delete user-key=%s done\n", dbUserKey)
					}

					err = kvMain.Delete(dbRegisteredIDs, mastodonUserId)
					if err!=nil {
						// this is bad
						fmt.Printf("# mastodon processMessage delete user-id=%s err=%v\n", mastodonUserId, err)
// TODO notify user by msg?
					} else {
						fmt.Printf("mastodon processMessage delete user-id=%s done\n", mastodonUserId)
// TODO send msg telling user that their webcall account has been deleted
					}
				}
// TODO  this 'return' MUST abort processing, not sure it does
				return
			}
		}

// TODO verify: msg MUST contain a target user-id (NOT webcall) in 1st place - otherwise abort here!

		// we now assume this is a valid msg to webcall-invite another user (requesting a confirm msg)
		// this inviter stays active for up to 60min
		fmt.Printf("mastodon processMessage msgID=%v requesting call confirmation\n",msgID)
		mMgr.inviterMutex.Lock()
		inviter,ok := mMgr.inviterMap[msgID]
		if !ok || inviter==nil {
			inviter = &Inviter{}
		}
		inviter.MastodonUserId = mastodonUserId
		inviter.Expiration = time.Now().Add(1 * time.Hour).Unix()
		mMgr.inviterMap[msgID] = inviter
		mMgr.inviterMutex.Unlock()
		// mMgr.inviterMap[msgID] becomes relevant if target user sends a confirm msg back

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

		var mastodonCallerMsgId mastodon.ID = "" //dummy not used TODO remove

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

// TODO do we really want to send the calleeID in clear?
			status,err := mMgr.postCallerMsgEx("@"+mastodonCallerID+" "+
							"Click to call "+mMgr.hostUrl+"/user/"+calleeID)
			if err!=nil {
				// this is fatal
				fmt.Printf("# sendCallerMsg err=%v (to=%v)\n",err,mastodonCallerID)
			} else {
				fmt.Printf("sendCallerMsg done not deleting status.ID=%v\n",status.ID)
/* let this msg stand
				//fmt.Printf("sendCallerMsg done status.ID=%v\n",status.ID)
				mMgr.inviterMutex.Lock()
				inviter.statusID2 = status.ID
				mMgr.inviterMap[msgID] = inviter
				mMgr.inviterMutex.Unlock()
*/
			}
			// remove the inviter now
			mMgr.clearInviter(msgID)

		} else if mMgr.isValidCallee(calleeID) {
			// calleeID is not currently online, but it is a valid/registered callee
			fmt.Printf("mastodon processMessage callee offline but valid, send /callee link to callee\n")

			// send a mastodon-msg to the callee and ask it to login to answer call or register a new calleeID
			// for secure register we generate a unique random 11-digit mID to refer to mastodonCalleeID 
			mMgr.midkeyMutex.Lock()
			mID,err := mMgr.makeSecretID() //"xxxxxxxxxxx"
			if err!=nil {
				// this is fatal
				fmt.Printf("# mastodon processMessage makeSecretID fatal err=%v\n",err)
				mMgr.midkeyMutex.Unlock()
				return
			}
			// mid -> mastodonCalleeID
			// this allows /callee/pickup to find mastodonCalleeID (a mastodon user id) via mID
			midkey := &MidKey{}
			midkey.mastodonIdCallee = mastodonCalleeID
			midkey.mastodonIdCaller = mastodonCallerID
			midkey.msgID = msgID
			//midkey.mastodonIdCallerReplyId = mastodonCallerMsgId
			mMgr.midkeyMap[mID] = midkey
			mMgr.midkeyMutex.Unlock()

			// store mid in inviter, so we can delete it later
			mMgr.inviterMutex.Lock()
			inviter,ok := mMgr.inviterMap[msgID]
			if !ok || inviter==nil {
				inviter = &Inviter{}
			}
			inviter.MidId = mID
			mMgr.inviterMap[msgID] = inviter
			mMgr.inviterMutex.Unlock()

			// send msg to mastodonCalleeID, with link to /callee/pickup
			sendmsg := "@"+mastodonCalleeID+" "+
				mastodonCallerID+" wants to give you a web telephony call.\n"+
				"Answer call: "+mMgr.hostUrl+"/callee/pickup?mid="+mID
			fmt.Printf("mastodon processMessage PostStatus (%s)\n",sendmsg)
			status,err := mMgr.postCallerMsgEx(sendmsg)
			if err!=nil {
				fmt.Printf("# mastodon processMessage postCallerMsgEx err=%v\n",err)
			} else {
				// at some point later we need to delete msg status.ID
				// note: deleting a (direct) mastodon msg does NOT delete it on the receiver/caller side
/*
				mMgr.midkeyMutex.Lock()
				midkey.statusID = status.ID
				mMgr.midkeyMap[mID] = midkey
				mMgr.midkeyMutex.Unlock()
*/
				mMgr.inviterMutex.Lock()
				inviter.statusID = status.ID
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
			// arg4 none-empty string: there is no special msg (will only say: "Register your WebCall ID:")
// TODO must test arg4!=""
			err := mMgr.offerRegisterLink(mastodonCalleeID,mastodonCallerID,mastodonCallerMsgId,msg,msgID)
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
		if inviter!=nil && timeNowUnix - inviter.Expiration > 60*60 {
			// this invitation is older than 60min: delete it

			// DeleteStatus() previously sent msgs
			if inviter.statusID != "" {
				err := mMgr.c.DeleteStatus(context.Background(), inviter.statusID)
				if err!=nil {
					fmt.Printf("# calleeLoginSuccess DeleteStatus(statusID=%v)\n",inviter.statusID)
				}
			}
			if inviter.statusID2 != "" {
				err := mMgr.c.DeleteStatus(context.Background(), inviter.statusID2)
				if err!=nil {
					fmt.Printf("# calleeLoginSuccess DeleteStatus(statusID2=%v)\n",inviter.statusID2)
				}
			}
			// TODO remove remark: delete the inviter: mMgr.inviterMap[msgId]

			// delete the inviter itself below, outside of range loop
			deleteInviterArray = append(deleteInviterArray,mastodonMsgID)
		}
	}

	if len(deleteInviterArray)>0 {
		fmt.Printf("cleanupMastodonInviter delete %d/%d inviterMap entries\n",
			len(deleteInviterArray), len(mMgr.inviterMap))
		for _,mastodonMsgID := range deleteInviterArray {
			mid := mMgr.inviterMap[mastodonMsgID].MidId
			if mid!="" {
				mMgr.clearMid(mid,false) // will also DeleteStatus(midkey.statusID) but not inviter.status
			}
			fmt.Printf("cleanupMastodonInviter delete inviterMap msgId(%s)\n",mastodonMsgID)
			delete(mMgr.inviterMap,mastodonMsgID)
		}
	}
	mMgr.inviterMutex.Unlock()

	fmt.Printf("cleanupMastodonInviter done\n")
}

func (mMgr *MastodonMgr) offerRegisterLink(mastodonUserId string, mastodonCallerUserId string, mastodonSenderMsgID mastodon.ID, msg string, msgID string) error {
	// offer link to /pickup, where mastodonUserId can be registered
	// 1) is called in response to a call, we want to send a msg to caller after login
	// 2) is called in response to "register", we DONT want to send a msg to caller after login

	// first we need a unique mID (refering to mastodonUserId)
	mMgr.midkeyMutex.Lock()
	mID,err := mMgr.makeSecretID() //"xxxxxxxxxxx"
	if err!=nil {
		// this is fatal
		mMgr.midkeyMutex.Unlock()
		fmt.Printf("# offerRegisterLink register makeSecretID err=(%v)\n", err)
		return err
	}
	midkey,ok := mMgr.midkeyMap[mID]
	if !ok || midkey==nil {
		midkey = &MidKey{}
	}
	midkey.mastodonIdCallee = mastodonUserId
	midkey.mastodonIdCaller = mastodonCallerUserId
	midkey.msgID = msgID
	mMgr.midkeyMap[mID] = midkey
	mMgr.midkeyMutex.Unlock()

	// store mid in inviter, so we can delete it later
	mMgr.inviterMutex.Lock()
	inviter,ok := mMgr.inviterMap[msgID]
	if !ok || inviter==nil {
		inviter = &Inviter{}
	}
	inviter.MidId = mID
	mMgr.inviterMap[msgID] = inviter
	mMgr.inviterMutex.Unlock()

// TODO not sure about &register (as a result pickup.js never offers multipe choice)
// TODO add callerMastodonUserId as username to link (so caller.js can forward it to callee)
	sendmsg :="@"+mastodonUserId+" "+
				msg+"Answer call: "+mMgr.hostUrl+"/callee/pickup?mid="+mID //+"&register"
	fmt.Printf("offerRegisterLink PostStatus (%s)\n",sendmsg)
	status,err := mMgr.postCallerMsgEx(sendmsg)
	if err!=nil {
		// this is fatal
		fmt.Printf("# offerRegisterLink PostStatus err=%v (to=%v)\n",err,mastodonUserId)
		return err
	}

	// at some point later we need to delete (from mastodon) all direct messages
	fmt.Printf("offerRegisterLink PostStatus sent to=%v\n", mastodonUserId)
/*
	mMgr.midkeyMutex.Lock()
	midkey.statusID = status.ID
	mMgr.midkeyMap[mID] = midkey
	mMgr.midkeyMutex.Unlock()
*/
	mMgr.inviterMutex.Lock()
	inviter.statusID = status.ID
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

		midkey,ok := mMgr.midkeyMap[newSecretId]
		if ok && midkey!=nil && midkey.mastodonIdCallee != "" {
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
	// send message containing url="/user/"+urlID to tmpkeyMastodonCallerReplyMap[mid]
	callerMastodonUserId := ""
	mMgr.midkeyMutex.RLock()
	midkey,ok := mMgr.midkeyMap[mid]
	if ok && midkey!=nil {
		callerMastodonUserId = midkey.mastodonIdCaller
	}
	mMgr.midkeyMutex.RUnlock()

	fmt.Printf("mastodon sendCallerMsgToMid calleeID=%s mid=%s callerMastodonUserId=%s\n",
		calleeID, mid, callerMastodonUserId)
	// calleeID and callerMastodonUserId (if set) appear to be the same?

	if callerMastodonUserId!="" {
// TODO add callerMastodonUserId as username to link (so caller.js can forward it to callee)
		sendmsg :=	"@"+callerMastodonUserId+" Click to call: "+mMgr.hostUrl+"/user/"+calleeID
		status,err := mMgr.postCallerMsgEx(sendmsg)
		if err!=nil {
			// this is fatal
			fmt.Printf("# sendCallerMsgToMid err=%v (to=%v)\n",err,callerMastodonUserId)
			return
		}
		fmt.Printf("sendCallerMsgToMid to=%v done ID=%v\n",callerMastodonUserId, status.ID)
		if midkey!=nil {
/* let this msg stand
			mMgr.midkeyMutex.Lock()
			midkey.statusID2 = status.ID
			mMgr.midkeyMap[mid] = midkey
			mMgr.midkeyMutex.Unlock()
*/
		}
	} else {
		// TODO outdated? this can happen a lot; no need to log this every time
		//fmt.Printf("# mastodon sendCallerMsgToMid callerMastodonUserId empty, calleeID=%s mid=%s\n",calleeID,mid)
	}

// TODO we can remove the inviter now (but here we have no msgId)
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
			mMgr.midkeyMutex.Lock()
			midkey,ok := mMgr.midkeyMap[mid]
			if ok && midkey!=nil && midkey.mastodonIdCaller!="" && midkey.mastodonIdCallee!="" {
// TODO do we really want to send the calleeID in clear?
// TODO add callerMastodonUserId as username to link (so caller.js can forward/signal it to callee)
				status,err := mMgr.postCallerMsgEx("@"+midkey.mastodonIdCaller+" "+
					"Click to call "+mMgr.hostUrl+"/user/"+midkey.mastodonIdCallee)
				if err!=nil {
					// this is fatal
					fmt.Printf("# sendCallerMsg err=%v (to=%v)\n",err,midkey.mastodonIdCaller)
				} else {
					fmt.Printf("sendCallerMsg to=%v done ID=%v\n",midkey.mastodonIdCaller, status.ID)
/* let this msg stand
					midkey.statusID2 = status.ID
					mMgr.midkeyMap[mid] = midkey
*/
				}
// TODO we can remove the inviter now (but here we have no msgId, bc this is called by httpServer.go /midmsg)
			}
			mMgr.midkeyMutex.Unlock()
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
	// TODO at some point later we need to delete (from mastodon) all direct messages
	// note: deleting a (direct) mastodon msg does NOT delete it on the receiver/caller side
	return status,nil
}

// called from httpNotifyCallee.go
func (mMgr *MastodonMgr) postCallerMsg(sendmsg string) error {
	_,err := mMgr.postCallerMsgEx(sendmsg)
// TODO here we should also save status
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
			mMgr.midkeyMutex.RLock()
			midkey,ok := mMgr.midkeyMap[mid]
			if ok && midkey!=nil {
				calleeIdOnMastodon = midkey.mastodonIdCallee
			}
			mMgr.midkeyMutex.RUnlock()

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
// TODO this does not seem to work (was set to false for tm@mastodontech.de)
// but now it has worked
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
		mMgr.midkeyMutex.RLock()
		midkey,ok := mMgr.midkeyMap[mID]
		if ok && midkey!=nil {
			registerID = midkey.mastodonIdCallee
		}
		mMgr.midkeyMutex.RUnlock()
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
				err = kvMain.Put(dbRegisteredIDs, registerID,
						DbEntry{unixTime, remoteAddr, pw}, false)
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
		// TODO abort with log
	}
	if urlID=="" {
		// TODO abort with log
	}

	mMgr.midkeyMutex.RLock()
	midkey,ok := mMgr.midkeyMap[mid]
	if !ok || midkey==nil {
		mMgr.midkeyMutex.RUnlock()
		// TODO err log
		return
	}
	mastodonUserID := midkey.mastodonIdCallee
	mMgr.midkeyMutex.RUnlock()
	if mastodonUserID=="" {
		// TODO err log
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
			// TODO log SUSPICIOUS?
		}
		mapping[mastodonUserID] = MappingDataType{urlID,"none"}
		mappingMutex.Unlock()
	}

	// finally: tell caller that callee is now online and ready to receive the call
	// this will only send a msg ("Click to call") to caller, if tmpkeyMastodonCallerMap[mid] NOT empty string
	// (for instance: after command=="register" there is no caller to send a msg to)
	mMgr.sendCallerMsgToMid(mid,urlID)

	mMgr.clearMid(mid,true) // will also DeleteStatus(midkey.statusID and inviter.status)
}

func (mMgr *MastodonMgr) clearMid(mid string, deleteInviter bool) {
	if mid=="" {
		fmt.Printf("# clearMid(%s) deleteInviter=%v\n",mid,deleteInviter)
		return
	}
	mMgr.midkeyMutex.RLock()
	midkey,ok := mMgr.midkeyMap[mid]
	mMgr.midkeyMutex.RUnlock()
	if !ok || midkey==nil {
		// TODO err log
		fmt.Printf("# clearMid(%s) no midkey\n",mid)
		return
	}

	fmt.Printf("clearMid(%s) deleteInviter=%v\n",mid,deleteInviter)
	if midkey.statusID != "" {
		err := mMgr.c.DeleteStatus(context.Background(), midkey.statusID)
		if err!=nil {
			fmt.Printf("# clearMid() DeleteStatus(statusID=%v)\n",midkey.statusID)
		}
	}
	if midkey.statusID2 != "" {
		err := mMgr.c.DeleteStatus(context.Background(), midkey.statusID2)
		if err!=nil {
			fmt.Printf("# clearMid() DeleteStatus(statusID2=%v)\n",midkey.statusID2)
		}
	}

	if deleteInviter {
		mMgr.clearInviter(midkey.msgID)
	}

	// now we can discard mid
	fmt.Printf("clearMid(%s) delete midkeyMap\n",mid)
	mMgr.midkeyMutex.Lock()
	delete(mMgr.midkeyMap,mid)
	mMgr.midkeyMutex.Unlock()
}

func (mMgr *MastodonMgr) clearInviter(msgId string) {
	fmt.Printf("clearInviter msgID=%s\n",msgId)
	if msgId != "" {
		mMgr.inviterMutex.Lock()
		inviter,ok := mMgr.inviterMap[msgId]
		if ok && inviter!=nil {
			// DeleteStatus() previously sent msgs
			if inviter.statusID != "" {
				err := mMgr.c.DeleteStatus(context.Background(), inviter.statusID)
				if err!=nil {
					fmt.Printf("# clearInviter DeleteStatus(statusID=%v)\n",inviter.statusID)
				}
			}
			if inviter.statusID2 != "" {
				err := mMgr.c.DeleteStatus(context.Background(), inviter.statusID2)
				if err!=nil {
					fmt.Printf("# clearInviter DeleteStatus(statusID2=%v)\n",inviter.statusID2)
				}
			}
			// delete inviter
			delete(mMgr.inviterMap,msgId)
			fmt.Printf("clearInviter msgID=%s done\n",msgId)
		}
		mMgr.inviterMutex.Unlock()
	}
}

func (mMgr *MastodonMgr) mastodonStop() {
	fmt.Printf("mastodonStop\n")
	mMgr.abortChan <- true
	return
}

