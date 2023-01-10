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
)

type MastodonMgr struct {
	c *mastodon.Client
	abortChan chan bool
	hostUrl string

	// tmpkeyMastodonCalleeMap maps a secret/random key to the callees mastodon user-id
	tmpkeyMastodonCalleeMap map[string]string
	tmpkeyMastodonCalleeMutex sync.RWMutex

	// tmpkeyMastodonCallerReplyMap maps a secret/random key to the callers mastodon InReplyToID
	tmpkeyMastodonCallerReplyMap map[string]mastodon.ID
	tmpkeyMastodonCallerMap map[string]string
	tmpkeyMastodonCallerMutex sync.RWMutex
}

func NewMastodonMgr() *MastodonMgr {
	return &MastodonMgr{
		tmpkeyMastodonCalleeMap:      make(map[string]string),
		tmpkeyMastodonCallerReplyMap: make(map[string]mastodon.ID),
		tmpkeyMastodonCallerMap:      make(map[string]string),
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
							fmt.Printf("mastodonhandler TextToken=(%v)\n",textMessage) // ' test2'
							mMgr.processMessage(textMessage,event)
						}
					case html.ErrorToken:
						fmt.Printf("mastodonhandler ErrorToken re-loop\n")
						break loop
					}
				}
				fmt.Printf("mastodonhandler Notif-Type=(%v) done\n", event.Notification.Type)

			case *mastodon.UpdateEvent:
				if event.Status.Content!="" {
					fmt.Printf("mastodonhandler UpdateEvent content=(%v)\n",event.Status.Content)
				} else {
					fmt.Printf("mastodonhandler UpdateEvent reblog=(%v)\n",event.Status.Reblog)
				}

			case *mastodon.DeleteEvent:
				fmt.Printf("mastodonhandler DeleteEvent id=(%v)\n",event.ID)

			case *mastodon.ErrorEvent:
				fmt.Printf("mastodonhandler ErrorEvent %v\n",event.Error())

			default:
				fmt.Printf("mastodonhandler default\n")
			}
		}
	}

	mMgr.abortChan = nil
	return
}

// @webcall@mastodon.social !tm@mastodontech.de
func (mMgr *MastodonMgr) processMessage(msg string, event *mastodon.NotificationEvent) {
	msg = strings.TrimSpace(msg)
	callerMastodonMsgId := event.Notification.Status.ID
	callerMastodonUserId := event.Notification.Account.Acct

	tok := strings.Split(msg, " ")
	fmt.Printf("mastodon processMessage msg=(%v) id=%v lenTok=%d\n",
		msg, callerMastodonMsgId, len(tok))

	if len(tok)>0 {
		command := strings.ToLower(strings.TrimSpace(tok[0]))
		switch {
		case command=="register":
			// msg-originator wants to register it's account as WebCall callee
			mastodonUserID := event.Notification.Account.Acct
			fmt.Printf("mastodon processMessage register (%v)\n", mastodonUserID)

			// check if mastodonUserID exist (otherwise the user will run into same issue with /registermid)
			var dbEntryRegistered DbEntry
			err := kvMain.Get(dbRegisteredIDs,mastodonUserID,&dbEntryRegistered)
			if err==nil {
				// mastodonUserID is already registered
				fmt.Printf("# mastodon processMessage (%s) fail 'already registered'\n", mastodonUserID)

				sendmsg :="@"+callerMastodonUserId+" Your account has already been registered"
// TODO add a callee link?
				fmt.Printf("mastodon processMessage PostStatus (%s)\n",sendmsg)
				status,err := mMgr.c.PostStatus(context.Background(), &mastodon.Toot{
					Status:			sendmsg,
					Visibility:		"direct",
				})
				if err!=nil {
					// TODO this is fatal
					fmt.Printf("# mastodon processMessage PostStatus err=%v (to=%v)\n",err,callerMastodonUserId)
				} else {
					fmt.Printf("mastodon processMessage PostStatus sent id=%v (to=%v)\n",
						status.ID, callerMastodonUserId)
					// TODO at some point later we need to delete (from mastodon) all direct messages
					// note: deleting a (direct) mastodon msg does NOT delete it on the receiver/caller side
				}
				return
			}

			err = mMgr.offerRegisterLink(mastodonUserID,callerMastodonUserId,"")
			if err!=nil {
				// TODO
			}

		case command=="delete":
			// TODO here we can remove a calleeID based on callerMastodonUserId

		case strings.HasPrefix(command, "!"):
			// if command starts with "!", the msg-originator wants to make a call
			calleeIdOnMastodon := command[1:] // skip "!"
			callerIdOnMastodon := event.Notification.Account.Acct
//			fmt.Printf("mastodon processMessage from=(%s) call calleeIdOnMastodon=(%v)\n",
//				callerIdOnMastodon, calleeIdOnMastodon)

			// server sends a mastodon-msg to callee, containing a links to /callee/pickup
            // if /callee/pickup detects a webcall-id from cookie, it forwards the user to /callee/(ID)
            // else it allows the user to login manually, create a new account, etc.

			calleeID := calleeIdOnMastodon
			mappingMutex.RLock()
			mappingData,ok := mapping[calleeIdOnMastodon]
			mappingMutex.RUnlock()
			if ok {
				// calleeIdOnMastodon is mapped (caller is using a temporary (mapped) calleeID)
				if mappingData.Assign!="" && mappingData.Assign!="none" {
					calleeID = mappingData.Assign
				}
			}

			hubMapMutex.RLock()
			hub := hubMap[calleeID]
			hubMapMutex.RUnlock()
			calleeIDonline := ""
			if hub != nil {
				// calleeID is online / logged in

				//if hub.ConnectedCallerIp!="" {
				//	calleeID is busy
				//}

				if hub.CalleeClient!=nil && hub.CalleeClient.mastodonAcceptTootCalls==false {
					// this user does not want calls from mastodon
					fmt.Printf("mastodon processMessage (%s) has active hub but not accepting toot-calls (%s)\n",
						calleeID, hub.ConnectedCallerIp)
					calleeIDonline = "nowebcall"
				} else {
					fmt.Printf("mastodon processMessage (%s) has an active hub (is online) (%s)\n",
						calleeID, hub.ConnectedCallerIp)
					calleeIDonline = calleeID // callee is using its mastodon user id as key
				}
			} else {
				// calleeID is NOT online
				fmt.Printf("mastodon processMessage (%s) has NO active hub (is not online)\n", calleeID)
			}

			fmt.Printf("mastodon processMessage from=%s callerMsgId=%s calling=(%v) calleeIDonline=(%s)\n",
				callerIdOnMastodon, callerMastodonMsgId, calleeIdOnMastodon, calleeIDonline)

			if calleeIDonline=="nowebcall" {
				// this webcall user disabled incoming calls from mastodon
				mMgr.sendCallerMsg(callerMastodonMsgId, callerIdOnMastodon,
					"User "+calleeIdOnMastodon+" does not accept WebCalls from Mastodon. Sorry!")

			} else if calleeIDonline!="" {
				// requested callee is online, we do NOT need to send them a mastodon msg
				// instead we immediately send a mastodon-msg back to the caller with the correct caller-URL

				// TODO these msgs do often not show up in the web client as notifications
				// and also not in webcall fetching the caller (@timurmobi)
				// (maybe bc of the 192.168. hostname?)
				// but they always show up here in MastodonMgr.go: "mastodonhandler UpdateEvent content=(<p>...)"
				mMgr.sendCallerMsg(callerMastodonMsgId, callerIdOnMastodon,
					"Click to call "+mMgr.hostUrl+"/user/"+calleeID)

			} else if mMgr.isValidCallee(calleeID) {
				// calleeID is not currently online, but it is a valid/registered callee

				// send a mastodon-msg to the callee and ask it to login to answer call or register a new calleeID
				// for secure register we generate a unique random 11-digit mID to refer to calleeIdOnMastodon 
				mMgr.tmpkeyMastodonCalleeMutex.Lock()
				mID,err := mMgr.makeSecretID() //"xxxxxxxxxxx"
				if err!=nil {
					// TODO this is fatal
					mMgr.tmpkeyMastodonCalleeMutex.Unlock()
					return
				}
				// mid -> calleeIdOnMastodon
				// this allows /callee/pickup to find calleeIdOnMastodon (a mastodon user id) via mID
				mMgr.tmpkeyMastodonCalleeMap[mID] = calleeIdOnMastodon
				mMgr.tmpkeyMastodonCalleeMutex.Unlock()

				// mid -> callerIdOnMastodon
				// this is used to send a mastodon-msg to the caller
				mMgr.tmpkeyMastodonCallerMutex.Lock()
				mMgr.tmpkeyMastodonCallerReplyMap[mID] = callerMastodonMsgId
				mMgr.tmpkeyMastodonCallerMap[mID] = callerMastodonUserId
				mMgr.tmpkeyMastodonCallerMutex.Unlock()

				// send msg to calleeIdOnMastodon, with link to /callee/pickup
// TODO "(callerIdOnMastodon) is trying to..." is missig @instance
				sendmsg := "@"+calleeIdOnMastodon+" "+
					callerIdOnMastodon+" wants to give you a web telephony call.\n"+
					"Answer call: "+mMgr.hostUrl+"/callee/pickup?mid="+mID
				fmt.Printf("mastodon processMessage PostStatus (%s)\n",sendmsg)
				status,err := mMgr.c.PostStatus(context.Background(), &mastodon.Toot{
					Status:			sendmsg,
					Visibility:		"direct",
				})
				if err!=nil {
					// TODO this is fatal
					fmt.Printf("# mastodon processMessage PostStatus err=%v\n",err)
				} else {
					fmt.Printf("mastodon processMessage PostStatus sent id=%v\n",status.ID)

					// TODO at some point later we need to delete (from mastodon) all direct messages
					// note: deleting a (direct) mastodon msg does NOT delete it on the receiver/caller side
				}
				// TODO at some point somewhere we need to remove the items from our two maps

			} else {
				// calleeID (for instance timurmobi@mastodon.social) does not exist
				// msg-receiver should register a WebCall callee account, so calls can be received
				msg := callerMastodonUserId+" wants to give you a WebCall. To answer:"
				err := mMgr.offerRegisterLink(calleeIdOnMastodon,callerMastodonUserId,msg)
				if err!=nil {
					// TODO
				}
			}
		}
	}
}

func (mMgr *MastodonMgr) offerRegisterLink(calleeMastodonUserID string, callerMastodonUserId string, msg string) error {
	// offer link to pickup, where calleeMastodonUserID can be registered
	// first we need a unique mID (refering to calleeMastodonUserID)
	mMgr.tmpkeyMastodonCalleeMutex.Lock()
	mID,err := mMgr.makeSecretID() //"xxxxxxxxxxx"
	if err!=nil {
		// TODO this is fatal (and we are not yet notifying the mastodon user)
		mMgr.tmpkeyMastodonCalleeMutex.Unlock()
		fmt.Printf("# offerRegisterLink register makeSecretID err=(%v)\n", err)
		return err
	}
	// mid -> calleeIdOnMastodon
	// this allows /callee/pickup to find calleeMastodonUserID via mID
	mMgr.tmpkeyMastodonCalleeMap[mID] = calleeMastodonUserID
	mMgr.tmpkeyMastodonCalleeMutex.Unlock()

// "Register WebCall ID" is not enough; this new callee needs context as to why he should register
// bc X is trying to call him!
	sendmsg :="@"+callerMastodonUserId+" "+msg+" Register your WebCall ID: "+mMgr.hostUrl+"/callee/pickup?mid="+mID+"&register"
	fmt.Printf("offerRegisterLink PostStatus (%s)\n",sendmsg)
	status,err := mMgr.c.PostStatus(context.Background(), &mastodon.Toot{
		Status:			sendmsg,
		Visibility:		"direct",
	})
	if err!=nil {
		// TODO this is fatal
		fmt.Printf("# offerRegisterLink PostStatus err=%v (to=%v)\n",err,callerMastodonUserId)
		return err
	}
	fmt.Printf("offerRegisterLink PostStatus sent id=%v (to=%v)\n",
		status.ID, callerMastodonUserId)
	// TODO at some point later we need to delete (from mastodon) all direct messages
	// note: deleting a (direct) mastodon msg does NOT delete it on the receiver/caller side

	// TODO at some point we must delete mMgr.tmpkeyMastodonCalleeMap[mID]
	// even if the user never calls the provided link
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
		oldMastodonID := mMgr.tmpkeyMastodonCalleeMap[newSecretId]
		if oldMastodonID!="" {
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
	mMgr.tmpkeyMastodonCallerMutex.RLock()
	//inReplyToID := mMgr.tmpkeyMastodonCallerReplyMap[mid]
	callerMastodonUserId := mMgr.tmpkeyMastodonCallerMap[mid]
	mMgr.tmpkeyMastodonCallerMutex.RUnlock()

	//if inReplyToID!="" {
	if callerMastodonUserId!="" {
		sendmsg :=	"@"+callerMastodonUserId+" Click to call: "+mMgr.hostUrl+"/user/"+calleeID
		status,err := mMgr.c.PostStatus(context.Background(), &mastodon.Toot{
			Status:			sendmsg,
			//InReplyToID:	inReplyToID,
			Visibility:		"direct",
		})
		if err!=nil {
			fmt.Printf("# mastodon sendCallerMsgToMid PostStatus err=%v\n",err)
		} else {
			fmt.Printf("mastodon sendCallerMsgToMid PostStatus sent id=%v\n",status.ID)
		}
		delete(mMgr.tmpkeyMastodonCallerReplyMap,mid)
	} else {
// TODO this can happen a lot; no need to log this every time
//		fmt.Printf("# mastodon sendCallerMsgToMid callerMastodonUserId empty, calleeID=%s mid=%s\n",calleeID,mid)
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
			callerIdOnMastodon := mMgr.tmpkeyMastodonCallerMap[mid]
			callerMastodonMsgId := mMgr.tmpkeyMastodonCallerReplyMap[mid]	// currently not used
			if callerIdOnMastodon!="" {
				calleeIdOnMastodon := mMgr.tmpkeyMastodonCalleeMap[mid]
				if calleeIdOnMastodon!="" {
					mMgr.sendCallerMsg(callerMastodonMsgId, callerIdOnMastodon,
						"Click to call "+mMgr.hostUrl+"/user/"+calleeIdOnMastodon)
				}
			}
		}
	}
}

func (mMgr *MastodonMgr) sendCallerMsg(mastodonSenderMsgID mastodon.ID, callerIdOnMastodon string, msg string) {
	// send message containing url="/user/"+urlID  InReply to mastodonSenderMsgID
	fmt.Printf("mastodon sendCallerMsg msg=%v\n",msg)
	status,err := mMgr.c.PostStatus(context.Background(), &mastodon.Toot{
		Status:			"@"+callerIdOnMastodon+" "+msg,
//		InReplyToID:	mastodonSenderMsgID,
		Visibility:		"direct", //"private",
	})
	if err!=nil {
		fmt.Printf("# mastodon sendCallerMsg PostStatus err=%v\n",err)
	} else {
		fmt.Printf("mastodon sendCallerMsg PostStatus sent id=%v\n",status.ID)
	}
}

func (mMgr *MastodonMgr) postCallerMsg(sendmsg string) error {
	fmt.Printf("postCallerMsg PostStatus (%s)\n",sendmsg)
	status,err := mMgr.c.PostStatus(context.Background(), &mastodon.Toot{
		Status:			sendmsg,
		Visibility:		"direct",
	})
	if err!=nil {
		fmt.Println("# postCallerMsg PostStatus err=",err)
		return err
	}
	fmt.Println("postCallerMsg PostStatus sent id=",status.ID)
	// TODO at some point later we need to delete (from mastodon) all direct messages
	// note: deleting a (direct) mastodon msg does NOT delete it on the receiver/caller side
	return nil
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
			calleeIdOnMastodon := mMgr.tmpkeyMastodonCalleeMap[mid]
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
		registerID := mMgr.tmpkeyMastodonCalleeMap[mID]
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
	mastodonUserID := mMgr.tmpkeyMastodonCalleeMap[mid]
	if mastodonUserID=="" {
		// TODO abort with log
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
	mMgr.sendCallerMsgToMid(mid,urlID)

	// now we can discard mid
	mMgr.tmpkeyMastodonCallerMutex.Lock()
	delete(mMgr.tmpkeyMastodonCalleeMap,mid)
	delete(mMgr.tmpkeyMastodonCallerReplyMap,mid) // may not exist
	mMgr.tmpkeyMastodonCallerMutex.Unlock()
}

func (mMgr *MastodonMgr) mastodonStop() {
	fmt.Printf("mastodonStop\n")
	mMgr.abortChan <- true
	return
}

