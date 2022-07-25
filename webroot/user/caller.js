// WebCall Copyright 2022 timur.mobi. All rights reserved.
'use strict';
const dialButton = document.querySelector('button#callButton');
const hangupButton = document.querySelector('button#hangupButton');
const calleeOnlineElement = document.getElementById("calleeOnline");
const enterIdElement = document.getElementById('enterId');
const enterIdValElement = document.getElementById('enterIdVal');
const enterIdClearElement = document.getElementById("enterIdClear");
const enterDomainValElement = document.getElementById('enterDomainVal');
const enterDomainClearElement = document.getElementById("enterDomainClear");
const divspinnerframe = document.querySelector('div#spinnerframe');
const numericIdLabel = document.querySelector('label#numericIdLabel');
const numericIdCheckbox = document.querySelector('input#numericId');
const calleeMode = false;
const msgBoxMaxLen = 137;

var bitrate = 320000;
var connectingText = "Connecting P2P...";
var singleButtonReadyText = "Click to make your order<br>Live operator";
var singleButtonBusyText = "All lines are busy.<br>Please try again a little later.";
var singleButtonConnectedText = "You are connected.<br>How can we help you?";
var notificationSound = null;
var dtmfDialingSound = null;
var busySignalSound = null;
var wsConn = null;
var peerCon = null;
var localDescription = null;
var localStream = null;
var remoteStream = null;
var rtcConnect = false;
var rtcConnectStartDate = 0;
var mediaConnectStartDate = 0;
var dataChannel = null;
var dialAfterLocalStream = false;
var dialAfterCalleeOnline = false;
var lastResult;
var candidateArray = [];
var candidateResultGenerated = true;
var candidateResultString = "";
var wsAddr = "";
var wsAddrTime;
// in caller.js 'calleeID' is the id being called
// note that the one making the call may also be a callee (is awaiting calls in parallel and has a cookie!)
var calleeID = "";    // id of the party being called
var callerId = "";    // this is the callers callback ID (from urlArg, cookie, or idSelect)
var callerIdArg = ""  // this is the callers callback ID (from urlArg only)
var cookieName = "";  // this is the callers nickname
var callerHost = "";  // this is the callers home webcall server
var callerName = "";  // this is the callers nickname
var contactName = ""; // this is the callees nickname (from caller contacts or from dial-id form)
var otherUA="";
var sessionDuration = 0;
var dataChannelSendMsg = "";
var iframeParent;
var iframeParentArg="";
var codecPreferences;
var titleElement;
var statusLine;
var msgbox;
var timerElement;
var calleeOfflineElement;
var onlineIndicator;
if(!singlebutton) {
	codecPreferences = document.querySelector('#codecPreferences');
	titleElement = document.getElementById('title');
	statusLine = document.getElementById('status');
	msgbox = document.querySelector('textarea#msgbox');
	timerElement = document.querySelector('div#timer');
	calleeOfflineElement = document.getElementById("calleeOffline");
	onlineIndicator = document.querySelector('img#onlineIndicator');
}
var microphoneIsNeeded = true;
var fileReceiveBuffer = [];
var fileReceivedSize = 0;
var fileName = "";
var fileSize = 0;
var fileReceiveStartDate=0;
var fileReceiveSinceStartSecs=0;
var fileSendAbort=false;
var fileReceiveAbort=false;
var goodbyMissedCall="";
var goodbyTextMsg=""
var goodbyDone = false;
var haveBeenWaitingForCalleeOnline=false;
var lastOnlineStatus = "";
var contactAutoStore = false;
var counter=0;
var altIdCount = 0;
var idSelectElement = null;

var extMessage = function(e) {
	// prevent an error on split() below when extensions emit unrelated, non-string 'message' events to the window
	if(typeof e.data !== 'string') {
		return;
	}
	var data = e.data.split(':')
	var action = data[0];
	var actionArg = data[1];
	gLog("client extMessage action",action,actionArg);
	if(action == "reqActiveNotification") {
		gLog("client extMessage reqActiveNotification",actionArg);
		if(iframeParentArg=="occured") {
			// onlineStatus has alrady arrived
			e.source.postMessage("activeNotification:"+actionArg);
		} else {
			// if callee=online, calleeOnlineStatus() will post msg "activeNotification:"+iframeParentArg
			iframeParent = e.source;
			iframeParentArg = actionArg;
		}
	}
}
window.addEventListener('message', extMessage, false); 
gLog("caller now listening for extMessage");

window.onload = function() {
	gLog("caller onload");
	if(!navigator.mediaDevices) {
		console.warn("navigator.mediaDevices not available");
		goOnlineButton.disabled = true;
		goOfflineButton.disabled = true;
		alert("navigator.mediaDevices not available");
		return;
	}

	window.onhashchange = hashchange;
	window.onbeforeunload = goodby;
	goodbyMissedCall = "";
	goodbyTextMsg = "";

	let id = getUrlParams("id");
	if(typeof id!=="undefined" && id!="") {
		calleeID = cleanStringParameter(id,true);
	}
	// if on start there is a fragment/hash ('#') in the URL, remove it
	if(location.hash.length > 0) {
		gLog("location.hash.length=%d",location.hash.length);
		window.location.replace("/user/"+calleeID);
		return;
	}

	let text = getUrlParams("readyText");
	if(typeof text!=="undefined" && text!="") {
		singleButtonReadyText = decodeURI(text);
		gLog("onload url arg readyText",singleButtonReadyText);
		dialButton.innerHTML = "<b>W E B C A L L</b><br>"+singleButtonReadyText;
	}
	text = getUrlParams("connectingText");
	if(typeof text!=="undefined" && text!="") {
		connectingText = decodeURI(text);
		gLog("onload url arg connectingText",connectingText);
	}
	text = getUrlParams("busyText");
	if(typeof text!=="undefined" && text!="") {
		singleButtonBusyText = decodeURI(text);
		gLog("onload url arg busyText",singleButtonBusyText);
	}
	text = getUrlParams("connectedText");
	if(typeof text!=="undefined" && text!="") {
		singleButtonConnectedText = decodeURI(text);
		gLog("onload url arg connectedText",singleButtonConnectedText);
	}
	// dialsounds
	playDialSounds = true;
	text = getUrlParams("ds");
	if(typeof text!=="undefined" && text!="") {
		if(text=="false") {
			playDialSounds = false;
		}
		gLog("dialsounds="+playDialSounds);
	}

	if(localVideoFrame)
		localVideoFrame.onresize = showVideoResolutionLocal;
	if(remoteVideoFrame)
		remoteVideoFrame.onresize = showVideoResolutionRemote;

	if(fullscreenCheckbox) {
		fullscreenCheckbox.addEventListener('change', function() {
			if(this.checked) {
				// user is requesting fullscreen mode
				if(!document.fullscreenElement) {
					// not yet in fullscreen mode
					if(mainElement.requestFullscreen) {
						// trigger fullscreen mode
						mainElement.requestFullscreen();
					}
				}
			} else {
				// user is requesting fullscreen exit
				document.exitFullscreen().catch(err => { });
			}
			setTimeout(function(){history.back();},150);
		});
	}

	document.addEventListener('fullscreenchange', (event) => {
		if(document.fullscreenElement) {
			// we have switched to fullscreen mode
			fullscreenCheckbox.checked = true;
		} else {
			// we have left fullscreen mode
			fullscreenCheckbox.checked = false;
		}
	});

	if(typeof numericIdCheckbox!=="undefined" && numericIdCheckbox!=null) {
		// numericIdCheckbox (activated for smartphones only) for switching input-type text/number
		let ua = navigator.userAgent;
		//console.log("navigator.userAgent=("+ua+")");
		if(ua.indexOf("Android")>=0 || ua.indexOf("iPhone")>=0 || ua.indexOf("iPad")>=0) {
			// enable and activate numericIdCheckbox
			//console.log("numericIdCheckbox enable");
			numericIdCheckbox.checked = true;
			enterIdValElement.setAttribute('type','number');
			enterIdValElement.focus();
			numericIdLabel.style.display = "block";

			numericIdCheckbox.addEventListener('change', function() {
				if(enterIdValElement.readOnly) {
					return;
				}
				if(this.checked) {
					gLog("numericIdCheckbox checked");
					enterIdValElement.setAttribute('type','number');
				} else {
					gLog("numericIdCheckbox unchecked");
					enterIdValElement.setAttribute('type','text');
				}
				enterIdValElement.focus();
			});
		} else {
			// disable numericId checkbox: default to text-id input
			numericIdLabel.style.display = "none";
		}
	}

	if(window.self == window.top) {
		// not running in iframe mode
		//gLog("onload setup onkeydownFunc");
		document.onkeydown = (evt) => onkeydownFunc(evt);
	} else {
		// running in iframe mode
		gLog("onload no onkeydownFunc in iframe mode");
	}

// TODO do checkServerMode() here

	callerId = "";
	let str = getUrlParams("callerId");
	if(typeof str!=="undefined" && str!="") {
		callerId = str;
	}
	callerIdArg = callerId;
	// callerId may change by cookieName and idSelect

	// showMissedCalls() hands over the default webcall nickname with this
	callerName = "";
	//console.log("callerName1="+callerName);
	str = getUrlParams("callerName");
	//console.log("callerName2 str="+str);
	if(typeof str!=="undefined" && str!==null && str!=="" && str!=="null") {
		// this urlArg has a low priority
		// will be overwritten by the contacts-entry for enterIdValElement.value (calleeID)
		//console.log("callerName3a="+str);
		callerName = cleanStringParameter(str,true,"c1");
		//console.log("callerName3b="+callerName);
	}

	callerHost = location.host;
	str = getUrlParams("callerHost");
	if(typeof str!=="undefined" && str!="") {
		// if this is coming from the android client, it will be correct data
		// if this comes directly from a 3rd party source, it may be false data
		//    in such a case the party being called will not be able to call back this caller
		//    however, if the callers cookie is found, we will set: callerHost = location.host;
		callerHost = str;
	}

	gLog("onload urlParam callerId=("+callerId+") callerHost=("+callerHost+") callerName=("+callerName+")");

	cookieName = "";
	if(document.cookie!="" && document.cookie.startsWith("webcallid=")) {
		// cookie webcallid exists
		cookieName = document.cookie.substring(10);
		let idxAmpasent = cookieName.indexOf("&");
		if(idxAmpasent>0) {
			cookieName = cookieName.substring(0,idxAmpasent);
		}
		gLog('onload cookieName='+cookieName);
	}

	contactAutoStore = false;
	if(cookieName!="") {
		// this req is running on behalf of a local callee (in an iframe, or in a 2nd tab) with a cookie
		// we overwrite callerId (and maybe callerName) from urlArgs with our own values
		gLog("onload use cookieName ("+cookieName+") as callerId");
// TODO not sure we should overwrite callerId this way
// we should do this only...
// - if callerId does not exit on this server (also have a look at callerHost)
// - if it is not one of cookieNames tmpId's
//		callerId = cookieName; // auto-fixing potentially wrong data from a link
		callerHost = location.host; // auto-fixing potentially wrong data from a link

		// use cookiename to fetch /getsettings
		let api = apiPath+"/getsettings?id="+cookieName;
		gLog('onload request getsettings api '+api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			var xhrresponse = xhr.responseText
			//gLog('xhr.responseText '+xhrresponse);
			if(xhrresponse=="") {
				serverSettings = null;
				return;
			}
			var serverSettings = JSON.parse(xhrresponse);
			if(typeof serverSettings!=="undefined") {
				gLog('serverSettings.storeContacts',serverSettings.storeContacts);
				if(serverSettings.storeContacts=="true") {
					contactAutoStore = true;
					// if callerIdArg=="select", we don't need dialIdAutoStoreElement
					// bc we offer a manual store-contact button in that case
					if(callerIdArg!="select") {
						var dialIdAutoStoreElement = document.getElementById("dialIdAutoStore");
						if(dialIdAutoStoreElement) {
							gLog('dialIdAutoStore on');
							dialIdAutoStoreElement.style.opacity = "0.8";
						}
					}
				}

				if(callerName=="") {
					//console.log("callerName = serverSettings.nickname "+serverSettings.nickname);
					callerName = serverSettings.nickname; // user can modify this in UI
				}
			}

			gLog("onload callerId=("+callerId+") callerName=("+callerName+") from /getsettings");

		}, function(errString,err) {
			console.log("# onload xhr error "+errString+" "+err);
		});
	}

	// show dial-id dialog
	// - if calleeID=="": called by dialpad icon from mainpage
	// - if callerIdArg=="select": called by android client as a 1st step before calling a remote host user
	gLog("onload show dial-id? calleeID="+calleeID+" callerIdArg="+callerIdArg);
	if(calleeID=="" || callerIdArg=="select") {
		containerElement.style.display = "none";
		enterIdElement.style.display = "block";

		// set target domain name with local hostname
		// note: location.hostname does not contain the :port, so we use location.host
		let targetHost = location.host;
		// andr activity hands over the target domain with this when sending callerIdArg='select'
		str = getUrlParams("targetHost");
		if(typeof str!=="undefined" && str!="") {
			targetHost = str;
		}
		enterDomainValElement.value = targetHost;
// TODO if enterDomainValElement.value != location.host -> make extra forms visible (event based)
// not just if(callerIdArg=="select")
// extra forms: "idSelect2" (only if altIdCount>1), "storeContactButton" and 2 missing name forms

		// if calleeID is not pure numeric, we first need to disable numericId checkbox
		if(isNaN(calleeID)) {
			gLog("onload isNaN("+calleeID+") true");
			numericIdCheckbox.checked = false;
			enterIdValElement.setAttribute('type','text');
		} else {
			gLog("onload isNaN("+calleeID+") false");
		}
		enterIdValElement.value = calleeID;

		//console.log("onload enterIdValElement.value="+enterIdValElement.value);
		if(targetHost!=location.host) {
			enterDomainValElement.readOnly = true;
			enterDomainClearElement.style.display = "none";
			enterDomainValElement.style.background = "#33b";
			enterDomainValElement.style.color = "#eee";
			//console.log("onload enterDomain readOnly");
		}
		if(calleeID!="") {
			enterIdValElement.readOnly = true;
			enterIdClearElement.style.display = "none";
			enterIdValElement.style.background = "#33b";
			enterIdValElement.style.color = "#eee";
			enterIdValElement.autoFocus = false;
			numericIdLabel.style.display = "none";
			//console.log("onload enterId readOnly");
		}

		gLog("onload enterId/dial-id dialog cookieName="+cookieName);
		if(callerIdArg=="select" && cookieName!="") {
			// callerId must urgently be set, bc it is currently set to "select"
			callerId = cookieName; // main callback id
			// this may be modified by /getcontact and manually by idSelect

			// when user operates idSelectElement, callerId may be changed
			idSelectElement = document.getElementById("idSelect2");
			// fetch mapping
			let api = apiPath+"/getmapping?id="+cookieName;
			gLog('onload request getmapping api',api);
			ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
				gLog('response getmapping api',xhr.responseText);
				if(xhr.responseText!="") {
					let idOption = document.createElement('option');
					idOption.text = cookieName + " (main id)";
					idOption.value = cookieName;
					idSelectElement.appendChild(idOption);
					altIdCount++;

					let altIDs = xhr.responseText;
					let tok = altIDs.split("|");
					for(var i=0; i<tok.length; i++) {
						//console.log("/getmapping tok["+i+"]="+tok[i]);
						if(tok[i]!="") {
							let tok2 = tok[i].split(",");
							let id = cleanStringParameter(tok2[0],true);
							let active = cleanStringParameter(tok2[1],true);
							let assign = cleanStringParameter(tok2[2],true);
							if(assign=="") {
								assign = "none";
							}
							//console.log("/getmapping assign=("+assign+")");
							let idOption = document.createElement('option');
							idOption.text = id + " ("+assign+")";
							idOption.value = id;
							idSelectElement.appendChild(idOption);
							altIdCount++;
						}
					}
// TODO not sure about '00000000000'
					let idOptionAnon = document.createElement('option');
					idOptionAnon.text = "00000000000 (incognito)";
					idOptionAnon.value = "";
					idSelectElement.appendChild(idOptionAnon);
					altIdCount++;
				}

				if(altIdCount>1) {
					// enable idSelectElement
					gLog("onload enable idSelect2LabelElement");
					let idSelect2LabelElement = document.getElementById("idSelect2Label");
					idSelect2LabelElement.style.display = "block";

					setTimeout(function() {
						gLog("onload idSelectElement.focus");
						idSelectElement.focus();
					},400);

					if(enterIdValElement.value!="" && cookieName!="") {
						// get preferred callerID and callerNickname from calleeID-contact
						let contactID = cleanStringParameter(enterIdValElement.value,true);
						if(cleanStringParameter(enterDomainValElement.value,true)!="") {
							contactID += "@"+cleanStringParameter(enterDomainValElement.value,true);
						}
						let api = apiPath+"/getcontact?id="+cookieName + "&contactID="+contactID;
						//console.log('request /getcontact api',api);
						ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
							var xhrresponse = xhr.responseText
							//console.log("/getcontact for calleeID="+calleeID+" xhrresponse="+xhrresponse);
							if(xhrresponse!="") {
								// format: name|prefCallbackID|myNickname
								let tok = xhrresponse.split("|");
								if(tok.length>0 && tok[0]!="") {
									contactName = cleanStringParameter(tok[0],true);
								}
								if(tok.length>1 && tok[1]!="") {
									let prefCallbackID = tok[1];
									//console.log("/getcontact prefCallbackID="+prefCallbackID);
									// we can now preselect idSelect with prefCallbackID
									const listArray = Array.from(idSelectElement.children);
									let i=0;
									listArray.forEach((item) => {
										if(item.text.startsWith(prefCallbackID)) {
											//console.log("/getcontact selectedIndex="+i+" +1");
											idSelectElement.selectedIndex = i;
											// this will set callerId based on id=cookieName in contacts
											callerId = prefCallbackID;
										}
										i++
									});
								}

								if(tok.length>2 && tok[2]!="") {
									//if(callerName=="") {
										callerName = tok[2];
										console.log("/getcontact set callerName="+callerName);
									//}
								}
								// we can now preset myNickname
								// set callerName = myNickname
							}
						}, errorAction);
					}

				} else {
					// no altIds found
					if(enterIdValElement.readOnly) {
						// we can auto-forward to submitForm()
						//submitForm(); // we are NOT allowed to do this
					}
				}
			}, function(errString,errcode) {
				// /getmapping has failed
				console.log("# onload ex "+errString+" "+errcode);
			});

			// enable storeContactButton (like dialIdAutoStore)
			var storeContactButtonElement = document.getElementById("storeContactButton");
			if(storeContactButtonElement) {
				gLog('storeContactButton on');
				storeContactButtonElement.style.opacity = "0.8";
				storeContactButtonElement.onclick = function() {
					// enable [Save Contact] button when enterIdValElement.value!=""
					// TODO: but only if enterDomainValElement.value != location.host ???
					// [Save Contact] we want to save the id of the user we are about to call:
					// local id:  enterIdValElement.value (if enterDomainValElement.value==location.host)
					// remote id: enterIdValElement.value@enterDomainValElement.value
					//		let calleeID = enterIdValElement.value@enterDomainValElement.value
					// form for contactName: ____________
					// form for callerName: ____________ (ourNickname)
					let contactID = cleanStringParameter(enterIdValElement.value,true) +
						"@" + cleanStringParameter(enterDomainValElement.value,true);
					//console.log("/setcontact contactID="+contactID);
					if(contactName=="") contactName="unknown";
					let compoundName = contactName+"|"+callerId+"|"+callerName;
					//console.log("/setcontact compoundName="+compoundName);
					let api = apiPath+"/setcontact?id="+cookieName +
						"&contactID="+contactID + "&name="+compoundName;
					ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
						console.log("/setcontact ("+contactID+") stored ("+xhr.responseText+")");
					}, function(errString,errcode) {
						console.log("# /setcontact ("+contactID+") ex "+errString+" "+errcode);
					});
				}
			}
		} else {
			if(calleeID=="") {
				setTimeout(function() {
					gLog("onload enterIdValElement.focus");
					enterIdValElement.focus();

					var rect1 = enterIdValElement.getBoundingClientRect();
					var rect2 = mainElement.getBoundingClientRect();
					console.log("showNumberForm pos",
						rect1.left, rect1.top, rect1.right, rect1.bottom,
						rect2.left, rect2.top, rect2.right, rect2.bottom);
				},400);
			}
		}

		// [Dial] button -> will continue in submitForm()
		return;
	}

	onload2();
}

function changeId(selectObject) {
	if(selectObject) {
		gLog("changeId selectObject="+selectObject);
		// selectObject is (only) set if user operates idSelect manually
		// parse for deviceId (selectObject.value in idSelect.options)
		for(var i = idSelectElement.options.length - 1; i >= 0; i--) {
			if(idSelectElement.options[i].value == selectObject.value) {
				// found selectObject
				callerId = cleanStringParameter(selectObject.value,true);
				gLog('changeId callerId='+callerId);
				break;
			}
		}
	} else {
		gLog("# changeId no selectObject");
	}
}

function onload2() {
	gLog("onload2");
	haveBeenWaitingForCalleeOnline=false;
	altIdCount = 0;
	checkServerMode(function(mode) {
		if(mode==0) {
			// normal mode
			gLog("onload2 normal mode");

// TODO do /getsettings here to get callerName

			// enable nickname form (if not calling answie or talkback)
			if(!calleeID.startsWith("answie") && !calleeID.startsWith("talkback")) {
				gLog("set nickname form with callerName="+callerName);
				let nicknameDivElement = document.getElementById("nicknameDiv");
				let nicknameElement = document.getElementById("nickname");
				nicknameElement.value = callerName;
				nicknameDivElement.style.display = "block";
				// callername will be fetched from form in checkCalleeOnline()
			}

			// enable randomized 123 codeDivElement if no cookie available (and if not answie or talkback)
			if(cookieName=="" && !calleeID.startsWith("answie") && !calleeID.startsWith("talkback")) {
				let codeDivElement = document.getElementById("codeDiv");
				let codeLabelElement = document.getElementById("codeLabel");
				let codeElement = document.getElementById("code");
				let codeString = ""+(Math.floor(Math.random() * 900) + 100);
				codeLabelElement.innerHTML = "Enter "+codeString+":";
				codeElement.value = "";

				let ua = navigator.userAgent;
				if(ua.indexOf("Android")>=0 || ua.indexOf("iPhone")>=0 || ua.indexOf("iPad")>=0) {
					// enable type="number" for code form
					gLog("showConfirmCodeForm type=number");
					codeElement.type = "number";
				}
				codeDivElement.style.display = "block";
				setTimeout(function() {
					gLog("showConfirmCodeForm code.focus()!");
					codeElement.focus();
					// unfortunately .focus() does NOT make the Android keyboard pop up
					// so we emulate a screen tap from Java code, based on the coordinates in this log statement
					// NOTE: DO NOT CHANGE THE console.log() BELOW !!!
					var rect1 = codeElement.getBoundingClientRect();
					var rect2 = mainElement.getBoundingClientRect();
					console.log("showNumberForm pos",
						rect1.left, rect1.top, rect1.right, rect1.bottom,
						rect2.left, rect2.top, rect2.right, rect2.bottom);
				},500);

				// disable call button for as long as code.value does not have the right value
				dialButton.disabled = true;

				let keyupEventFkt = function() {
					if(codeElement.value==codeString) {
						dialButton.disabled = false;
						// disable EventListener
						this.removeEventListener("keyup",keyupEventFkt);
						codeDivElement.style.display = "none";
					}
				}
				document.addEventListener("keyup", keyupEventFkt);
				//console.log("showConfirmCodeForm start");
				// checkCalleeOnline() will fetch callername from form
			}

			// if cookie webcallid is available, fetch mapping and offer idSelect
			if(cookieName!="") {
				idSelectElement = document.getElementById("idSelect");

				// fetch mapping
				let api = apiPath+"/getmapping?id="+cookieName;
				gLog('onload2 request getmapping api',api);
				ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
					gLog('response getmapping api',xhr.responseText);
					let preselectIndex = -1;
					if(xhr.responseText!="") {
						let idOption = document.createElement('option');
						idOption.text = cookieName + " (main id)";
						idOption.value = cookieName;
						idSelectElement.appendChild(idOption);
						altIdCount++;

						let altIDs = xhr.responseText;
						let tok = altIDs.split("|");
						for(var i=0; i<tok.length; i++) {
							//console.log("tok["+i+"]="+tok[i]);
							if(tok[i]!="") {
								let tok2 = tok[i].split(",");
								let id = cleanStringParameter(tok2[0],true);
								let active = cleanStringParameter(tok2[1],true);
								let assign = cleanStringParameter(tok2[2],true);
								if(assign=="") {
									assign = "none";
								}
								if(id==callerId) {
									preselectIndex = i;
									gLog('preselectIndex='+preselectIndex);
								}
								//console.log("assign=("+assign+")");
								let idOption = document.createElement('option');
								idOption.text = id + " ("+assign+")";
								idOption.value = id;
								idSelectElement.appendChild(idOption);
								altIdCount++;
							}
						}
						let idOptionAnon = document.createElement('option');
						idOptionAnon.text = "00000000000 (incognito)";
						idOptionAnon.value = "";
						idSelectElement.appendChild(idOptionAnon);
						altIdCount++;
					}

					if(altIdCount>1) {
						// enable idSelectElement
						idSelectElement.style.display = "block";
						if(preselectIndex>-1) {
							idSelectElement.selectedIndex = preselectIndex+1;
						}
					}

					if(preselectIndex<0) {
						// callerId was not fond in mapping
						callerId = cookieName;
					}

					onload3("1");
				}, function(errString,errcode) {
					// /getmapping has failed
					onload3("2 "+errString+" "+errcode);
				});
				return;
			}

			// cookie webcallid does not exist
			onload3("3");
			return;
		}
		if(mode==1) {
			// maintenance mode
			let mainParent = containerElement.parentNode;
			mainParent.removeChild(containerElement);
			var msgElement = document.createElement("div");
			msgElement.style = "margin-top:15%; display:flex; flex-direction:column; align-items:center; "+
							   "justify-content:center; text-align:center; font-size:1.2em; line-height:1.5em;";
			msgElement.innerHTML =
				"<div>WebCall server is currently in maintenance mode.<br>Please try again later.</div>";
			mainParent.appendChild(msgElement);
			return;
		}
	});
}

function onload3(comment) {
	gLog('onload3 '+comment);

	var calleeIdTitle = calleeID.charAt(0).toUpperCase() + calleeID.slice(1);
	document.title = "WebCall "+calleeIdTitle;
	if(titleElement) {
		titleElement.innerHTML = "WebCall "+calleeIdTitle;
	}

	if(calleeID.startsWith("#")) {
		// special case: action
		gLog('start action calleeID='+calleeID);
		let api = apiPath+"/action?id="+calleeID.substring(1)+"&callerId="+callerId;
		xhrTimeout = 5*1000;
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			gLog("xhr.resp="+xhr.responseText);
			if(xhr.responseText.startsWith("widget=")) {
				// switch widget: replace parent iframe src
				let url = xhr.responseText.substring(7) + "?callerId="+callerId+"&i="+counter;
				counter++;
				let iframeElement = parent.document.querySelector('iframe#child');
				gLog("widget("+url+") iframeElement="+iframeElement);
				if(parent!=null && iframeElement!=null) {
					iframeElement.src = url;
				}
			} else {
				history.back();
			}
		}, errorAction2);
		return;
	}

	calleeOnlineAction("init");

	if(dialButton) {
		if(singlebutton) {
			dialButton.innerHTML = "<b>W E B C A L L</b><br>"+singleButtonReadyText;
		} else {
			if(calleeID.match(/^[0-9]*$/) != null) {
				// calleeID is pure numeric - don't show
			} else {
				dialButton.innerHTML = "Call "+calleeIdTitle;
			}
		}

		dialButton.onclick = dialButtonClick;
	}
	if(hangupButton) {
		hangupButton.onclick = function() {
			dialButton.style.backgroundColor = "";
			hangupButton.style.backgroundColor = "";
			let msg = "Hanging up...";
			//console.log(msg);
			if(mediaConnect) {
				if(playDialSounds) {
					hangupWithBusySound(true,msg);
				} else {
					hangup(true,true,msg);
				}
			} else {
				if(playDialSounds) {
					stopAllAudioEffects();
				}
				hangup(true,true,msg);
			}
			// focus back to background, so that esc-key via onkeydown works
			hangupButton.blur();
		};
	}

	calleeID = calleeID.toLowerCase();
}

function dialButtonClick() {
	gLog("dialButtonClick");
	//gLog("dialButtonClick callerId="+callerId+" callerName="+callerName);
	showStatus(connectingText,-1);

	doneHangup = false;
	onIceCandidates = 0;
	rtcConnectStartDate = 0;
	mediaConnectStartDate = 0;
	connectionstatechangeCounter = 0;

	if(singlebutton) {
		// switch from dialButton to hangupButton "Connecting..."
		hangupButton.innerHTML = "Connecting...";
		dialButton.style.display = "none";
		hangupButton.style.display = "inline-block";
		// animate hangupButton background
		hangupButton.style.background = 'url("bg-anim.jpg"), linear-gradient(-45deg, #002c22, #102070, #2613c5, #1503ab)';
		hangupButton.style.backgroundSize = "400% 400%";
		hangupButton.style.animation = "gradientBG 30s ease infinite";
		//gLog("hangupButton.style",hangupButton.style);
	} else {
		if(dialButton.disabled) {
			// prevent multiple checkCalleeOnline()
			return;
		}
		dialButton.disabled = true;
		//hangupButton.disabled = false;
		msgbox.style.display = "none";
	}

	// focus back to background, so that esc-key via onkeydown works
	dialButton.blur();

	// -> checkCalleeOnline -> ajax -> calleeOnlineAction -> gotStream -> connectSignaling
	gLog("dialButtonClick set dialAfterCalleeOnline");
	dialAfterCalleeOnline = true;

//	let wsAddrAgeSecs = Math.floor((Date.now()-wsAddrTime)/1000);
//	if(wsAddr!="" && wsAddrAgeSecs<30) {
//		calleeOnlineAction("dialButton");
//	} else {
		checkCalleeOnline(true,"dialButtonClick");
//	}
}

function videoOn() {
	// enable local video
	gLog("videoOn");
	constraintString = defaultConstraintString;
	setVideoConstraintsGiven();
	localVideoShow();

	// add localStream video-track to peerCon
	if(peerCon && peerCon.iceConnectionState!="closed" && 
			rtcConnect && addLocalVideoEnabled && localStream.getTracks().length>=2 && !addedVideoTrack) {
		if(localCandidateType=="relay" || remoteCandidateType=="relay") {
			gLog('videoOn no addTrack vid on relayed con (%s)(%s)',localCandidateType,remoteCandidateType);
		} else {
			gLog('videoOn addTrack local video input',localStream.getTracks()[1]);
			addedVideoTrack = peerCon.addTrack(localStream.getTracks()[1],localStream);
		}
	}

	// activate localStream in localVideoFrame
	localVideoFrame.volume = 0; // avoid audio feedback / listening to own mic
	localVideoFrame.muted = 0;

	// switch avSelect.selectedIndex to 1st video option
	getStream().then(() => navigator.mediaDevices.enumerateDevices()).then((deviceInfos) => {
		gotDevices(deviceInfos);
		let optionElements = Array.from(avSelect);
		gLog("videoOn avSelect len",optionElements.length);
		if(optionElements.length>0) {
			// avSelect.selectedIndex <- 1st video device
			for(let i=0; i<optionElements.length; i++) {
				if(optionElements[i].text.startsWith("Video")) {
					gLog("videoOn avSelect idx",i);
					avSelect.selectedIndex = i;
					break;
				}
			}
		}

		if(videoEnabled) {
			// start localVideoFrame playback, setup the localVideo pane buttons
			vmonitor();
		}

		if(videoEnabled && mediaConnect && !addLocalVideoEnabled && vsendButton) {
			gLog('videoOn mediaConnect, blink vsendButton');
			vsendButton.classList.add('blink_me');
			setTimeout(function() { vsendButton.classList.remove('blink_me') },10000);
		}
	});
}

function videoOff() {
	// disable local video (but if rtcConnect, keep local mic on)
	gLog("videoOff");
	myUserMediaDeviceId = null;
	localVideoHide();
	if(localStream) {
		// stop streaming video track
		connectLocalVideo(true);
	}

	if(!rtcConnect) {
		if(localStream) {
			// remove audio track from peerCon (stop streaming local audio)
			if(peerCon && peerCon.iceConnectionState!="closed" && addedAudioTrack) {
				gLog("videoOff !rtcConnect peerCon.removeTrack(addedAudioTrack)");
				peerCon.removeTrack(addedAudioTrack);
				addedAudioTrack = null;
			}

			const audioTracks = localStream.getAudioTracks();
			gLog('videoOff removeTrack local mic audioTracks.length',audioTracks.length);
			if(audioTracks.length>0) {
				gLog('videoOff removeTrack local mic',audioTracks[0]);
				audioTracks[0].enabled = false;
				audioTracks[0].stop();
				localStream.removeTrack(audioTracks[0]);
			}

			const videoTracks = localStream.getVideoTracks();
			gLog('videoOff removeTrack local vid videoTracks.length',videoTracks.length);
			if(videoTracks.length>0) {
				gLog('videoOff removeTrack local vid',videoTracks[0]);
				videoTracks[0].enabled = false;
				videoTracks[0].stop();
				localStream.removeTrack(videoTracks[0]);
			}

			// stop all localStream tracks
			const allTracks = localStream.getTracks();
			gLog("videoOff !rtcConnect localStream stop len",allTracks.length);
			allTracks.forEach(track => {
				gLog('videoOff local track.stop()',track);
				track.stop(); 
			});
		}

		// fully deacticate localVideoFrame + localStream (mic)
		gLog("videoOff !rtcConnect shut localVideo");
		localVideoFrame.pause();
		localVideoFrame.currentTime = 0;
		localVideoFrame.srcObject = null;
		localStream = null;

		// hide and fully deacticate remoteVideoFrame + remoteStream
		gLog("videoOff !rtcConnect shut remoteVideo");
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
		remoteVideoHide();
		remoteStream = null;
	}

	// switch to the 1st/default audio device
	let optionElements = Array.from(avSelect);
	if(optionElements.length>0) {
		gLog("videoOff avSelect len",optionElements.length);
		// avSelect.selectedIndex <- 1st audio device
		for(let i=0; i<optionElements.length; i++) {
			if(optionElements[i].text.startsWith("Audio")) {
				gLog("videoOff avSelect idx",i);
				avSelect.selectedIndex = i;
				// TODO tmtmtm not sure this is really required
				//getStream(optionElements[i]);
				break;
			}
		}
		if(rtcConnect) {
			// if still peer connected, activate the selected audio device
			// TODO tmtmtm not sure this is really needed
			getStream();
		}
	}
}

function checkServerMode(callback) {
	let api = apiPath+"/mode";
	xhrTimeout = 30*1000;
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(xhr.responseText.startsWith("maintenance")) {
			callback(1);
			return;
		}
		// normal mode
		callback(0);
	}, function(errString,err) {
		console.log("# xhr error "+errString+" "+err);
		callback(2);
	});
}

function checkCalleeOnline(waitForCallee,comment) {
	callerName = cleanStringParameter(nickname.value,true);

	// Connecting P2P...
	//console.log("checkCalleeOnline callerId="+callerId+" callerName="+callerName);
	// check if calleeID is online (on behalf of callerId/callerName)
	let api = apiPath+"/online?id="+calleeID;
	if(callerId!=="" && callerId!=="undefined") {
		api += "&callerId="+callerId + "&name="+callerName;
	}
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			api = api + "&ver="+Android.getVersionName();
		}
		if(typeof Android.webviewVersion !== "undefined" && Android.webviewVersion !== null) {
			api = api + "_" + Android.webviewVersion() +"_"+ clientVersion;
		}
	} else {
		api = api + "&ver="+clientVersion;
	}
	gLog("checkCalleeOnline api="+api+" ("+comment+")");
	xhrTimeout = 30*1000;
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		calleeOnlineStatus(xhr.responseText,waitForCallee);
	}, errorAction);
}

function calleeOnlineStatus(onlineStatus,waitForCallee) {
	if(rtcConnect || dialing) {
		// TODO check if this is still required/meaningful
		gLog('calleeOnlineStatus abort',rtcConnect,dialing);
		return;
	}
	gLog('calleeOnlineStatus '+onlineStatus);
	// onlineStatus should be something like "127.0.0.1:8071?wsid=4054932942" (aka wsAddr)
	if(onlineStatus!="" && onlineStatus.indexOf("wsid=")>=0) {
		// callee is available/online
		lastOnlineStatus = onlineStatus;
		let tok = onlineStatus.split("|");
		wsAddr = tok[0];
		wsAddrTime = Date.now();

		if(singlebutton) {
			// enable parent iframe (height)
			if(iframeParent) {
				gLog('calleeOnlineStatus singlebutton iframeParent');
				iframeParent.postMessage("activeNotification:"+iframeParentArg);
			} else {
				// onlineStatus arrived before iframeParent was set (before action=="reqActiveNotification")
				iframeParentArg = "occured";
			}
		}
		calleeOnlineAction("calleeOnlineStatus");
		return;
	}

	// callee is not available
	// TODO here we could act on "busy" and "notavail"

	if(singlebutton) {
		// no free callee available (aka "all lines busy")
		gLog('singlebutton no free callee available');
		setTimeout(function() {
			hangupButton.style.backgroundColor = "";
			hangupButton.style.display = "none";
			dialButton.innerHTML = singleButtonBusyText;
			dialButton.style.backgroundColor = "";
			dialButton.style.display = "inline-block";
			setTimeout(function() {
				dialButton.innerHTML = "<b>W E B C A L L</b><br>"+singleButtonReadyText;
			},9000);
		},700);
		return;
	}

	dialButton.disabled = false;
	hangupButton.disabled = true;
	if(!localStream) {
		// we need to call mediaDevices.enumerateDevices() anyway
		loadJS("adapter-latest.js",function() {
			if(!navigator.mediaDevices) {
				console.warn("navigator.mediaDevices not available");
				// TODO no visible warning? also not in singlebutton mode? 
			} else {
				getStream().then(() => navigator.mediaDevices.enumerateDevices()).then(gotDevices);
				// -> getUserMedia -> gotStream -> checkCalleeOnline -> ajax -> calleeOnlineStatus
			}
		});
	}

	if(onlineStatus=="error") {
		showStatus("ID not found",-1)
		waitForCallee = false;
	}
	// switch to offline mode and (if waitForCallee is set) check if calleeID can be notified
	calleeOfflineAction(onlineStatus,waitForCallee);
}

function calleeOnlineAction(comment) {
	gLog('calleeOnlineAction='+comment+' dialAfterCalleeOnline='+dialAfterCalleeOnline);
	if(!notificationSound) {
		gLog('loading audio files');
		notificationSound = new Audio("notification.mp3");
// TODO why can I not do this?
//		if(playDialSounds) {
			dtmfDialingSound = new Audio('dtmf-dial.mp3');
			busySignalSound = new Audio('busy-signal.mp3');
//		}
	}

	if(haveBeenWaitingForCalleeOnline && notificationSound) {
		haveBeenWaitingForCalleeOnline = false;
		notificationSound.play().catch(function(error) { });
	}

	// switch to callee-is-online layout (call and hangupButton)
	calleeOnlineElement.style.display = "block";
	if(!singlebutton) {
		calleeOfflineElement.style.display = "none";
	}

	// now that we know callee is online, we load adapter-latest.js
	loadJS("adapter-latest.js",function(){
		gLog('adapter loaded');
		if(!navigator.mediaDevices) {
			console.warn("navigator.mediaDevices not available");
			if(calleeOnlineElement) {
				showStatus("navigator.mediaDevices not available",-1);
			} else {
				// TODO is this the correct action also for singlebutton?
				alert("navigator.mediaDevices not available");
			}
			return;
		}

		if(dialAfterCalleeOnline) {
			// autodial after detected callee is online
			// normally set by gotStream, if dialAfterLocalStream was set (by dialButton.onclick)
			dialAfterCalleeOnline = false;

			if(localStream) {
				connectSignaling("",dial); 
			} else {
				gLog('callee is online dialAfterLocalStream');
				dialAfterLocalStream = true;

				if(typeof Android !== "undefined" && Android !== null) {
					// not sure this is still needed
					Android.prepareDial();
				}

				getStream().then(() => navigator.mediaDevices.enumerateDevices()).then(gotDevices);
				// also: -> gotStream -> connectSignaling
			}
		} else {
			// no autodial after we detected callee is online

			if(typeof Android !== "undefined" && Android !== null) {
				// remote audio will be played back on earpiece (if available) instead of speakerphone
				Android.prepareDial();
			}

			getStream().then(() => navigator.mediaDevices.enumerateDevices()).then(gotDevices);

			// so we display a message to prepare the caller hitting the call button manually
			if(calleeID.startsWith("answie"))  {
				if(!singlebutton) {
					msgbox.style.display = "none";
				}
				showStatus("You are about to call a digital answering machine.",-1);
			} else if(calleeID.startsWith("talkback")) {
				if(!singlebutton) {
					msgbox.style.display = "none";
				}
				showStatus( "Talkback service let's you test your microphone audio quality. "+
							"The first six seconds of the call will be recorded (red led) "+
							"and then immediately played back to you (green led).",-1);
			} else {
				if(!singlebutton) {
					showStatus("Greeting message (optional):",-1)
					msgbox.style.display = "block";
					gLog('callerName='+callerName);
					let placeholderText = "";
					msgbox.onfocus = function() {
						placeholderText = msgbox.placeholder;
						msgbox.placeholder = "";
					};
					msgbox.onblur = function() {
						// caller leaving the msgbox
						if(placeholderText!="") {
							msgbox.placeholder = placeholderText;
						}
					};
				}
			}
		}
	});
}

var loadedJsMap = new Map();
var loadJsBusy = 0;
function loadJS(jsFile,callback) {
	// do not load same file more than once
	if(loadedJsMap.get(jsFile)) {
		callback();
		return;
	}
	if(loadJsBusy>0) {
		setTimeout(function() {
			loadJS(jsFile,callback);
		},100);
		return;
	}

	loadJsBusy++;
	gLog('loadJS jsFile='+jsFile);
	var script = document.createElement('script');
	script.setAttribute('src', jsFile);
	script.setAttribute('type', 'text/javascript');
	var loaded = false;
	var loadFunction = function () {
		if(!loaded) {
			loaded = true;
			loadedJsMap.set(jsFile,true);
			gLog('loadJS loaded '+jsFile);
			callback();
		}
		loadJsBusy--;
	};
	script.onload = loadFunction;
	script.onreadystatechange = loadFunction;
	document.getElementsByTagName("head")[0].appendChild(script);
}

function calleeOfflineAction(onlineStatus,waitForCallee) {
	if(!singlebutton) {
		// switch to callee-is-offline layout
		gLog('calleeOfflineAction !singlebutton callee is not avail '+waitForCallee);
		calleeOnlineElement.style.display = "none";
		calleeOfflineElement.style.display = "block";

		if(waitForCallee) {
			if(onlineStatus.startsWith("notavailtemp")) {
				// callee temporarily offline: have caller wait for callee
				var offlineFor = parseInt(onlineStatus.substring(12),10);
				showStatus("Trying to find "+calleeID+". This can take a while. Please wait...",-1);
				if(divspinnerframe) {
					divspinnerframe.style.display = "block";
				}
				let api = apiPath+"/online?id="+calleeID+"&wait=true&callerId="+callerId+
					"&name="+callerName+"&callerHost="+callerHost;
				xhrTimeout = 15*60*1000; // 15min
				if(offlineFor>0) {
					xhrTimeout = xhrTimeout - offlineFor*1000;
				}
				gLog("notifyCallee api="+api+" timeout="+xhrTimeout);
				// in case caller aborts:
				goodbyMissedCall = calleeID+"|"+callerName+"|"+callerId+
					"|"+Math.floor(Date.now()/1000)+
					"|"+cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen)+
					"|"+location.host;
				ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
					// end spinner
					if(divspinnerframe) {
						divspinnerframe.style.display = "none";
					}
					if(xhr.responseText!=null && xhr.responseText.indexOf("?wsid=")>0) {
						gLog('callee is now online. switching to call layout. '+xhr.responseText);
						goodbyMissedCall = "";
						lastOnlineStatus = xhr.responseText;
						let tok = xhr.responseText.split("|");
						wsAddr = tok[0];
						wsAddrTime = Date.now();
						// switch to callee-is-online layout
						calleeOnlineElement.style.display = "block";
						calleeOfflineElement.style.display = "none";

						showStatus("Enter text message before the call (optional):",-1);
						msgbox.style.display = "block";
						haveBeenWaitingForCalleeOnline=true; // will cause notificationSound to play

						if(!notificationSound) {
							gLog('load notificationSound');
							notificationSound = new Audio("notification.mp3");
						}
						gLog('play notificationSound');
						notificationSound.play().catch(function(error) { 
							gLog('# notificationSound err='+error);
						});
						return;
					}
					if(!goodbyDone) {
						gLog('online: callee could not be reached (%s)',xhr.responseText);
						showStatus("Unable to reach "+calleeID+".<br>Please try again later.",-1);
						//wsSend("missedcall|"+goodbyMissedCall); // this is not possible here

						let api = apiPath+"/missedCall?id="+goodbyMissedCall;
						goodbyMissedCall = "";
						ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
							gLog('/missedCall success');
						}, function(errString,err) {
							gLog('# /missedCall xhr error: '+errString+' '+err);
						});
					}
				}, function(errString,errcode) {
					// end spinner
					if(divspinnerframe) {
						divspinnerframe.style.display = "none";
					}
					// errcode 504 = timeout
					gLog('online: callee could not be reached. xhr err',errString,errcode);
					// TODO if xhr /online failed, does it make sense to try xhr /missedCall ?
					showStatus("Unable to reach "+calleeID+".<br>Please try again later.",-1);
					//wsSend("missedcall|"+goodbyMissedCall); // this is not possible here
					if(goodbyMissedCall!="") {
						let api = apiPath+"/missedCall?id="+goodbyMissedCall;
						ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
							gLog('/missedCall success');
						}, function(errString,err) {
							gLog('# /missedCall xhr error: '+errString+' '+err);
						});
						goodbyMissedCall = "";
					}
				});
				return;
			}

			// calleeID is currently offline - check if calleeID can be notified (via twitter msg)
			// TODO: this causes a missedCall entry, but without txtmsg (since we don't send it here)
			let api = apiPath+"/canbenotified?id="+calleeID + "&callerId="+callerId +
				"&name="+callerName + "&callerHost="+callerHost;
			gLog('canbenotified api',api);
			xhrTimeout = 30*1000;
			ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
				if(xhr.responseText.startsWith("ok")) {
					// calleeID can be notified (or is hidden)
					// if caller is willing to wait, caller can invoke confirmNotifyConnect() to enter own name
//					let calleeName = xhr.responseText.substring(3);
//					if(calleeName=="" || calleeName.length<3) {
//						calleeName = calleeID;
//					}
					var msg = "This user is currently not available.<br><br>"+
						"We can try to get this person on the phone. Can you wait a few minutes while we try to establish a connection?<br><br><a onclick='confirmNotifyConnect()'>Yes, please try</a>";
					if(window.self == window.top) {
						// not running in iframe mode: no -> jump on directory up
						msg += "<br><br><a href='..'>No, I have to go</a>";
					} else {
						// running in iframe mode: no -> history.back()
						msg += "<br><br><a onclick='history.back();'>No, I have to go</a>";
					}

					showStatus(msg,-1);
					goodbyMissedCall = calleeID+"|"+callerName+"|"+callerId+
						"|"+Math.floor(Date.now()/1000)+
						"|"+cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen)+
						"|"+location.host;
					// goodbyMissedCall will be cleared by a successful call
					// if it is still set in goodby(), we will ask server to store this as a missed call
					return;
				}
				// calleeID can NOT be notified
				showStatus(calleeID+" is not available at this time. Please try again a little later.",-1);
			}, // xhr error
				errorAction
				// TODO errorAction will switch back
				// if we don't want this we shd handle err like in notifyConnect()
			);
		}
	}

	gLog('calleeOfflineAction done');
}

function goodby() {
	gLog("goodby");
	if(goodbyMissedCall!="") {
		// goodbyMissedCall is used, when callee can not be reached (is offline)
		// in this case the server does NOT call peerConHasEnded(), so we call /missedCall from here
		// id=format: calleeID|callerName|callerID|ageSecs|msgbox
		// goodbyMissedCall arrives as urlID but is then tokenized
		if(wsConn!=null) {
			gLog('goodbyMissedCall wsSend='+goodbyMissedCall);
			wsSend("missedcall|"+goodbyMissedCall);
		} else {
			// tell server to store a missed call entry
			// doing sync xhr in goodby/beforeunload (see: last (7th) parameter = true)
			gLog('goodbyMissedCall syncxhr='+goodbyMissedCall);
			let api = apiPath+"/missedCall?id="+goodbyMissedCall;
			ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
				   gLog('goodby /missedCall sent to '+goodbyMissedCall);
			}, function(errString,err) {
				   gLog('# goodby xhr error '+errString);
			}, false, true);
		}
	} else if(goodbyTextMsg!="" && wsConn!=null) {
		// goodbyTextMsg is used, when callee is online (peerconnect), but does not pick up (no mediaconnect)
		// in this case server calls peerConHasEnded() for the callee, where addMissedCall() is generated
		if(wsConn!=null) {
			gLog('goodbyTextMsg wsSend='+goodbyTextMsg);
			wsSend("msg|"+goodbyTextMsg);
		} else {
			// sync xhr?
			// no solution for this yet
			gLog('goodbyTextMsg syncxhr not yet impl '+goodbyTextMsg);
		}
	}
	goodbyDone = true;

	if(wsConn!=null) {
		// only peerDisConnect() if this session has established a wsConn
		if(typeof Android !== "undefined" && Android !== null) {
			Android.peerDisConnect();
		}
	}
}

function confirmNotifyConnect() {
	gLog("callerName="+callerName+" callerId="+callerId+" callerHost="+callerHost);
	notifyConnect(callerName,callerId,location.host);
}

function submitForm(theForm) {
	// DialID: switch back to default container
	calleeID = cleanStringParameter(enterIdValElement.value,true); // remove all white spaces
	if(!calleeID.startsWith("#")) {
		if(calleeID.length>11) calleeID = calleeID.substring(0,11);
	}
	gLog("submitForm calleeID="+calleeID);
	// TODO ACHTUNG .host may have :443 set, while DomainVal may not
	gLog("submitForm targetDomain="+enterDomainValElement.value+" location.host="+location.host);
	if(cleanStringParameter(enterDomainValElement.value,true) != location.host) {
		// the callee to call is hosted on a different server
		// if we are running on Android, callUrl will be handled by onNewIntent() in the activity
		//   which will forward callUrl via iframeWindowOpen() to the remote host

		// if location.host is an internal ip-addr:port, which cannot be adressed over he internet
		// then sending callerHost=location.host is futile

		// below code tries to catch an window.open() error ("host not found")
		// and throw an alert() instead of relying on an ugly browser err-msg
		let randId = ""+Math.floor(Math.random()*1000000);
		if(callerId=="") {
			callerId = cookieName;
			// TODO what if user has deliberately set it to empty?
		}
// TODO callerName may be null
		let callUrl = "https://"+cleanStringParameter(enterDomainValElement.value,true)+"/user/"+calleeID+
			"?callerId="+callerId + "&callerName="+callerName + "&callerHost="+callerHost + "&i="+randId;
		if(playDialSounds==false) {
			callUrl += "&ds=false";
		}
		var openOK = false;
		try {
			//console.log("submitForm window.open "+callUrl);
			// in WebCallAndroid: callUrl being opened will trigger onNewIntent()
			openOK = window.open(callUrl, "");
		} catch(e) {
			// if we end here, the domain cannot be reached, so we don't do window.open()
			console.log("# submitForm window.open("+callUrl+") ex="+e);
			alert("Connection failed. Please check the server address.");
			//de-focus submit button
			document.activeElement.blur();
		} finally {
			if(!openOK) {
				// if we end here, the domain cannot be reached, so we don't do window.open()
				console.log("# submitForm !openOK window.open("+callUrl+")");
				alert("Connection failed. Please check the server address.");
				//de-focus submit button
				document.activeElement.blur();
			} else {
				// everything OK
				console.log("submitForm window.open("+callUrl+") no err");
				enterIdElement.style.display = "none";
				containerElement.style.display = "block";
				history.back();
				return;
			}
		}
	} else {
		// the callee to call is hosted on the same server
		enterIdElement.style.display = "none";
		containerElement.style.display = "block";
		onload2();
	}
}

function errorAction2(errString,err) {
	console.log("# xhr error "+errString+" "+err);
	// let user know via alert
	//alert("xhr error "+errString);
}

function notifyConnect(callerName,callerId,callerHost) {
	// nickname form was valid
	// the next xhr will freeze until hidden callee accepts the call
	showStatus("Trying to get "+calleeID+" on the phone. Please wait...",-1);
	if(divspinnerframe) {
		divspinnerframe.style.display = "block";
	}
	goodbyMissedCall = "";
	// notify calleeID (on behalf of callerId)
	let api = apiPath+"/notifyCallee?id="+calleeID +
		"&callerId="+callerId + "&name="+callerName + "&callerHost="+callerHost +
		"&msg="+cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen);
	xhrTimeout = 600*1000; // 10 min extended xhr timeout
	gLog("notifyCallee api="+api+" timeout="+xhrTimeout);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(divspinnerframe) {
			divspinnerframe.style.display = "none";
		}
		if(xhr.responseText=="ok") {
			gLog('callee is now online. switching to call layout.');
			// switch to callee-is-online layout
			calleeOnlineElement.style.display = "block";
			calleeOfflineElement.style.display = "none";
			// auto-click on call button
			dialButton.click();
			return;
		}
		gLog('notify: callee could not be reached (%s)',xhr.responseText);
		showStatus("Sorry! Unable to reach "+calleeID+".<br>Please try again a little later.",-1);
	}, function(errString,errcode) {
		if(divspinnerframe) {
			divspinnerframe.style.display = "none";
		}
		//errorAction(errString)
		gLog('notify: callee could not be reached. xhr err',errString,errcode);
		showStatus("Sorry! Unable to reach "+calleeID+".<br>Please try again a little later.",-1);
	});
}

function errorAction(errString,errcode) {
	console.log("# errorAction "+errString+" "+errcode);
	if(errString.startsWith("fetch")) {
		showStatus("No response from signaling server",-1);
	} else {
		showStatus("xhr error",-1);
	}
}

function gotStream2() {
	if(dialAfterLocalStream) { // set by dialButtonClick() -> dialAfterCalleeOnline
		gLog("gotStream2 dialAfter connectSignaling()");
		dialAfterLocalStream=false;
		connectSignaling("",dial);
	} else {
		// in caller we land here after audio/video was initialzed
		gLog("gotStream2 !dialAfter");

		if(videoEnabled) {
			gLog("gotStream2 videoEnabled: no mute mic until dial");
		} else if(!localStream) {
			gLog("# gotStream2 !localStream: no mute mic until dial");
		} else if(rtcConnect) {
			gLog("gotStream2 rtcConnect: no mute mic until dial");
		} else {
			gLog("gotStream2 mute mic until dial");

			// disable local mic until we start dialing
			localStream.getTracks().forEach(track => {
				gLog('gotStream2 local mic track.stop()',track);
				track.stop(); 
			});

			const audioTracks = localStream.getAudioTracks();
			gLog('gotStream2 removeTrack local mic audioTracks.length',audioTracks.length);
			if(audioTracks.length>0) {
				gLog('gotStream2 removeTrack local mic',audioTracks[0]);
				// TODO would it be enough to do this?
				//audioTracks[0].enabled = false;
				audioTracks[0].stop();
				localStream.removeTrack(audioTracks[0]);
			}

			const videoTracks = localStream.getVideoTracks();
			gLog('gotStream2 removeTrack local vid videoTracks.length',videoTracks.length);
			if(videoTracks.length>0) {
				gLog('videoOff removeTrack local vid',videoTracks[0]);
				// TODO would it be enough to do this?
				//videoTracks[0].enabled = false;
				videoTracks[0].stop();
				localStream.removeTrack(videoTracks[0]);
			}

			localStream = null;
		}
	}
}

function getStatsCandidateTypes(results,eventString1,eventString2) {
	let msg = getStatsCandidateTypesEx(results,eventString1,eventString2)
	wsSend("log|caller "+msg);

	if(eventString2!="") {
		msg += ". "+eventString2+".";
	}

	if(otherUA!="") {
		msg += "<div style='font-size:0.8em;margin-top:10px;color:#aac;'>UA: "+otherUA+"</div>";
	}
	showStatus(msg,-1);
}

function connectSignaling(message,openedFunc) {
	if(!window["WebSocket"]) {
		console.error('connectSignaling: no WebSocket support');
		showStatus("No WebSocket support");
		return;
	}
	if(wsAddr=="") {
		gLog('connectSignaling: no wsAddr for callee='+calleeID);
		return;
	}
	gLog('connectSignaling: open ws connection '+calleeID+' '+wsAddr);
	let tryingToOpenWebSocket = true;
    var wsUrl = wsAddr;
	wsUrl += "&callerId="+callerId + "&name="+callerName + "&callerHost="+callerHost;
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			wsUrl = wsUrl + "&ver="+Android.getVersionName();
		}
		if(typeof Android.webviewVersion !== "undefined" && Android.webviewVersion !== null) {
			wsUrl = wsUrl + "_" + Android.webviewVersion() +"_"+ clientVersion;
		}
	} else {
		wsUrl = wsUrl + "&ver="+clientVersion;
	}

	gLog('connectSignaling: wsUrl='+wsUrl);
	wsConn = new WebSocket(wsUrl);
	wsConn.onopen = function () {
		gLog('ws connection open '+calleeID);
		tryingToOpenWebSocket = false;
		if(message!="") {
			wsSend(message); // most likely "callerOffer" with localDescription
			gLog('ws message sent');
		}
		if(openedFunc) {
			openedFunc(); // dial()
		}
	};
	wsConn.onmessage = function (evt) {
		var messages = evt.data.split('\n');
		for (var i = 0; i < messages.length; i++) {
			signalingCommand(messages[i]);
			if(!peerCon || peerCon.iceConnectionState=="closed") {
				break;
			}
		}
	};
	wsConn.onerror = function(evt) {
		// this can be caused by a network problem
		// this can also mean that callee has gone offline recently and that wsAddr is now outdated
		// should this generate a /missedcall? no, bc we continue in onClose()
		if(evt && evt.data) {
			showStatus("connect error "+evt.data);
		} else {
			showStatus("connect error");
		}
		wsAddr = "";
		stopAllAudioEffects();
		hangupButton.disabled = true;
		dialButton.disabled = false;
	}
	wsConn.onclose = function (evt) {
		if(tryingToOpenWebSocket) {
			// onclose before a ws-connection could be established
			// likely wsAddr is outdated (may have been cleared by onerror already)
			gLog("wsConn.onclose: clear wsAddr="+wsAddr);
			wsAddr = "";
			tryingToOpenWebSocket = false;
			hangupButton.disabled = true;
			dialButton.disabled = false;
			// clearing wsAddr does not always have the desired effect (of resulting in no err on next try)
			// so retry with checkCalleeOnline(true) (since wsConn is closed, we don't need to hangup)
			//hangupWithBusySound(false,"connect error");
			checkCalleeOnline(true,"onclose");
		} else {
			// it is common for the signaling server to disconnect the caller early
			gLog('wsConn.onclose');
		}
		wsConn = null;
	};
}

function signalingCommand(message) {
	let tok = message.split("|");
	let cmd = tok[0];
	let payload = "";
	if(tok.length>=2) {
		payload = tok[1];
	}
	gLog('signaling cmd',cmd);

	if(cmd=="calleeAnswer") {
		// callee.js is responding to a callerOffer

		// contactAutoStore is only true if caller is logged in on the local server
		// if the caller is a remote user (calling someone on this server), contactAutoStore will be false
		if(cookieName!="" && contactAutoStore && callerId!=="") {
			// store the user being called (calleeID) into the contacts of the caller (cookieName)
// TODO get callerName from form and don't forget cleanStringParameter(,true)
			let compoundName = contactName+"|"+callerId+"|"+callerName;
			let api = apiPath+"/setcontact?id="+cookieName+"&contactID="+calleeID + "&name="+compoundName;
			gLog("request api="+api);
			ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
				gLog("xhr setcontact OK "+xhr.responseText);
			}, errorAction2);
		}

		if(!peerCon || peerCon.iceConnectionState=="closed") {
			console.warn('calleeAnswer abort no peerCon');
			return;
		}
		/*
		setTimeout(function() {
			// rtcConnect timeout check
			if(!doneHangup) {
				let warning = "";
				if(onIceCandidates<1 && connectionstatechangeCounter<1) {
					console.warn('no ice candidates, no connection state changes');
					warning = "WARNING: no ICE candidates, no connection state changes";
				} else if(onIceCandidates<1) {
					console.warn('no ice candidates');
					warning = "WARNING: no ICE candidates";
				} else if(connectionstatechangeCounter<1) {
					console.warn('no connection state changes');
					warning = "WARNING: no connection state changes";
				}
				if(warning!="") {
					stopAllAudioEffects();
					notificationSound.play().catch(function(error) { });
					showStatus(warning,-1);
				}
				if(!rtcConnect) {
					// check for no-webrtc patch
					// we could also check for no "peerCon connected" aka rtcConnect==false
					console.log('no rtcConnect timeout');
					hangup(true,false,"rtcConnect timeout "+warning); // will call checkCalleeOnline()
				}
			}
		},9000);
		*/
		let hostDescription = JSON.parse(payload);
		gLog("calleeAnswer setLocalDescription (onIceCandidates="+onIceCandidates+")");
		// setLocalDescription will cause "onsignalingstate have-local-offer"
		peerCon.setLocalDescription(localDescription).then(() => {
			gLog('calleeAnswer setRemoteDescription');
			peerCon.setRemoteDescription(hostDescription).then(() => {
				gLog('calleeAnswer setRemoteDescription done');
			}, err => {
				console.warn("calleeAnswer setRemoteDescription fail",err)
				showStatus("Cannot set remoteDescr "+err);
			});
		}, err => {
			console.warn("calleeAnswer setLocalDescription fail",err)
			showStatus("Cannot set localDescr"+err);
		});

	} else if(cmd=="calleeOffer") {
		// calleeOffer is being used when callee wants to deliver a config change
		let hostDescription = JSON.parse(payload);
		gLog('calleeOffer setRemoteDescription');

		peerCon.setRemoteDescription(hostDescription).then(() => {
			gLog('calleeOffer setRemoteDescription done');

			if(hostDescription.type == "offer") {
				gLog('calleeOffer received offer createAnswer');
				peerCon.createAnswer().then((desc) => {
					localDescription = desc;
					gLog('calleeOffer got localDescription');
					localDescription.sdp =
						maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
					localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
						'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
					peerCon.setLocalDescription(localDescription).then(() => {
						gLog('calleeOffer localDescription set -> signal');
						if(isDataChlOpen()) {
							dataChannel.send("cmd|callerAnswer|"+JSON.stringify(localDescription));
						} else {
							wsSend("callerAnswer|"+JSON.stringify(localDescription));
						}
					}, err => console.error(`Failed to set local descr: ${err.toString()}`));
				}, err => {
					console.warn("calleeOffer failed to createAnswer",err)
					showStatus("Failed to createAnswer",8000);
				});
			} else {
				gLog("calleeOffer received no offer:",hostDescription.type);
			}

		}, err => {
			console.warn("calleeOffer setRemoteDescription fail",err)
			showStatus("Cannot set remoteDescr "+err);
		});

	} else if(cmd=="calleeCandidate") {
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			console.warn('cmd calleeCandidate abort no peerCon');
			hangupWithBusySound(true,"calleeCandidate lost peerCon");
			return;
		}
		var calleeCandidate = JSON.parse(payload);

		// see: https://stackoverflow.com/questions/61292934/webrtc-operationerror-unknown-ufrag
		calleeCandidate.usernameFragment = null;

		var addIceCalleeCandidate = function(calleeCandidate) {
			if(calleeCandidate.candidate==null) {
				if(!gentle) console.warn('calleeCandidate.candidate==null');
				return
			}

			//gLog('calleeCandidate',calleeCandidate);

			let tok = calleeCandidate.candidate.split(' ');
			if(tok.length>=5) {
				let address = tok[4];
				if(tok.length>=10 && tok[8]=="raddr" && tok[9]!="0.0.0.0") {
					address = tok[9];
				}
				gLog('calleeCandidate addIce',address,calleeCandidate.candidate);
				// "Failed to execute 'addIceCandidate' on 'RTCPeerConnection'"
				// may happen if peerCon.setRemoteDescription is not finished yet
				if(!peerCon || peerCon.iceConnectionState=="closed") {
					console.warn('cmd calleeCandidate abort no peerCon');
					return;
				}
				if(!peerCon.remoteDescription) {
					// this happens bc setRemoteDescription may take a while
					gLog("cmd calleeCandidate !peerCon.remoteDescription",
						calleeCandidate.candidate);
					setTimeout(addIceCalleeCandidate,100,calleeCandidate);
					return;
				}
				if(!peerCon.remoteDescription.type) {
					gLog("cmd calleeCandidate !peerCon.remoteDescription.type",
						calleeCandidate.candidate);
					setTimeout(addIceCalleeCandidate,100,calleeCandidate);
					return;
				}
				peerCon.addIceCandidate(calleeCandidate).catch(e => {
					console.error("addIce calleeCandidate",e,payload);
					showStatus("RTC error "+e);
				});
			} else {
				if(calleeCandidate.candidate!="") {
					console.warn("cmd calleeCandidate format err",calleeCandidate.candidate);
				}
			}
		}
		addIceCalleeCandidate(calleeCandidate);

	} else if(cmd=="pickup") {
		if(!rtcConnect) {
			if(!gentle) console.warn('cmd pickup without rtcConnect; ignored');
			return
		}

		gLog("callee is answering call");
		if(!localStream) {
			console.warn("cmd pickup no localStream");
			// I see this when I quickly re-dial while busy signal of last call is still playing
			// TODO button may now continue to show "Connecting..."
			// but connection is still established (at least when calling answ)
			hangupWithBusySound(true,"pickup but no localStream");
			return;
		}

		if(!singlebutton) {
			// hide msgbox
			msgbox.style.display = "none";
		}

		if(typeof Android !== "undefined" && Android !== null) {
			// on smartphones this is supposed to disable speakerphone
			// remote audio will be played back on earpiece (if available) instead of speakerphone
			// will also disable screenorientlock
			Android.peerConnect();
		}

		var enableRemoteStream = function(calleeCandidate) {
			gLog('enableRemoteStream stopAllAudioEffects');
			stopAllAudioEffects();

			// on peer connect at least an audio stream should arrive
			let micStatus = "";
			if(singlebutton) {
				hangupButton.innerHTML = singleButtonConnectedText;
				hangupButton.style.boxShadow = "0px 0px 10px #f00";
				hangupButton.style.background = 'url("")'; 
				dialButton.style.backgroundColor = "";
				hangupButton.style.backgroundColor = "";
			} else {
				if(microphoneIsNeeded) {
					onlineIndicator.src="red-gradient.svg";
					micStatus = "Mic is open";
				} else {
					// mic NOT open
					dialButton.style.boxShadow = "";
					onlineIndicator.src="green-gradient.svg";
				}
			}

			if(remoteVideoFrame) {
				// enable (un-mute) remoteStream
				gLog('set remoteVideoFrame '+remoteStream);
				remoteVideoFrame.srcObject = remoteStream;
				remoteVideoFrame.play().catch(function(error) {	});
			}

			mediaConnect = true;
			if(localStream) {
				const audioTracks = localStream.getAudioTracks();
				audioTracks[0].enabled = true;
			}
			if(vsendButton) {
				vsendButton.style.display = "inline-block";
			}
			mediaConnectStartDate = Date.now();
			goodbyMissedCall = "";

			if(fileselectLabel && isDataChlOpen()) {
				if(isP2pCon()) {
					fileselectLabel.style.display = "block";
				}
			}

			// getting stats (p2p or relayed connection)
			gLog("full mediaConnect, getting stats...");
			peerCon.getStats(null)
				.then((results) => getStatsCandidateTypes(results,"Connected",micStatus),
				err => console.log(err));

			// in case local video is active, blink vsendButton
			if(videoEnabled && vsendButton && !addLocalVideoEnabled) {
				gLog('full mediaConnect, blink vsendButton');
				vsendButton.classList.add('blink_me');
				setTimeout(function() { vsendButton.classList.remove('blink_me') },10000);
			}
		}

		// we now wait up to 4x300ms for remoteStream before we continue with enableRemoteStream()
		// remoteStream will arrive via: peerCon.ontrack onunmute
		var waitLoopCount=0;
		let waitForRemoteStreamFunc = function() {
			if(!remoteStream) {
				waitLoopCount++;
				gLog('waitForRemoteStreamFunc '+remoteStream+" "+waitLoopCount);
				if(waitLoopCount<=4) {
					setTimeout(waitForRemoteStreamFunc, 300);
					return;
				}
			}
			gLog('waitForRemoteStreamFunc enableRemoteStream');
			enableRemoteStream();
		}
		waitForRemoteStreamFunc();

	} else if(cmd=="cancel") {
		if(payload!="c") {
			console.log("peer disconnect");
			//showStatus("peer disconnect",8000);
			setTimeout(function() {
				if(wsConn) {
					if(!mediaConnect) {
						// before wsConn.close(): send msgbox text to server
						let msgboxText = cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen);
						if(msgboxText!="") {
							wsSend("msg|"+msgboxText);
						}
					}
					// make sure server will generate a missed call
					wsSend("cancel|");
					wsConn.close();
					// wsConn=null prevents hangup() from generating a return cancel msg
					wsConn=null;
				}
				hangupWithBusySound(false,"Peer hang up");
			},250);
		} else {
			gLog("ignore cancel "+payload);
		}

	} else if(cmd=="sessionDuration") {
		// longest possible call duration
		sessionDuration = parseInt(payload);
		gLog('sessionDuration '+sessionDuration);
		if(sessionDuration>0 && mediaConnect && !isP2pCon() && !timerStartDate) {
			startTimer(sessionDuration);
		}
	} else if(cmd=="ua") {
		otherUA = payload;
		gLog("otherUA "+otherUA);

	} else if(cmd=="rtcVideoOff") {
		// remote video has ended
		gLog("rtcVideoOff");
		remoteVideoHide();

	} else if(cmd=="stopCamDelivery") {
		gLog("stopCamDelivery");
		connectLocalVideo(true);

	} else {
		gLog('# ignore incom cmd',cmd);
	}
}

function wsSend(message) {
	if(wsConn==null || wsConn.readyState!=1) {
		gLog('wsSend connectSignaling() '+message);
		connectSignaling(message,null);
	} else {
		wsConn.send(message);
	}
}

let dialDate;
function dial() {
	if(!localStream) {
		console.warn('dial abort no localStream');
		showStatus("Dialup canceled");
		hangupWithBusySound(true,"dial no localStream");
		return;
	}

	gLog('dial');
	otherUA = "";
	dialing = true;

	if(playDialSounds) {
		// postpone dialing, so we can start dialsound before
		setTimeout(function() {
			if(doneHangup) {
				gLog('abort post playDialSound dial2()');
			} else {
				gLog('post playDialSound dial2()...');
				dial2();
			}
		},1500);

		let loop = 0;
		var playDialSound = function() {
			if(!wsConn || mediaConnect || dtmfDialingSound==null) {
				gLog('playDialSound abort');
				return;
			}
			gLog('DialSound play()');
			if(loop>0) {
				dtmfDialingSound.currentTime = 2;
			}
			loop++;
			dtmfDialingSound.play().catch(function(error) {
				gLog('# DialSound err='+error);
			});
			dtmfDialingSound.onended = playDialSound;
		}
		playDialSound();

	} else {
		dial2();
	}
}

function dial2() {
	if(fileselectLabel) {
		fileselectLabel.style.display = "none";
		progressSendElement.style.display = "none";
		progressRcvElement.style.display = "none";
	}

	if(singlebutton) {
		dialButton.style.boxShadow = "";
	} else {
		onlineIndicator.src="";
	}
	doneHangup = false;
	candidateResultGenerated = false;
	candidateArray = [];
	candidateResultString = "";
	dialDate = Date.now();
	gLog('dial2 dialDate='+dialDate);

	// show connectingText with additional dots - in case we don't get a quick peerConnect
	// when this msg shows up, either peerCon is really slow, or there is a webrtc problem
	// if peerConnect is quick (as in most cases), we will see "ringing..." instead (with rtcConnect set)
	setTimeout(function(lastDialDate) {
		if(dialDate==lastDialDate && !doneHangup && !rtcConnect) { // still the same call after 3s?
			showStatus(connectingText+"...",-1);
		}
	},3000,dialDate);

	addedAudioTrack = null;
	addedVideoTrack = null;
	onIceCandidates = 0;
	try {
		gLog("dial peerCon = new RTCPeerConnection");
		peerCon = new RTCPeerConnection(ICE_config);
		hangupButton.disabled = false;
	} catch(ex) {
		console.error("RTCPeerConnection "+ex.message);
		var statusMsg = "RTCPeerConnection "+ex.message;
		if(typeof Android !== "undefined" && Android !== null) {
			statusMsg += " <a href='https://timur.mobi/webcall/android/#webview'>More info</a>";
		}
		showStatus(statusMsg);

		stopAllAudioEffects();
		hangup(true,false,"WebRTC error");
		// now both buttons (Call/Hangup) are deactivated
		return;
	};
	peerCon.onicecandidate = e => onIceCandidate(e,"callerCandidate");
	peerCon.onicecandidateerror = function(e) {
		// don't warn on 701 (chrome "701 STUN allocate request timed out")
		// 400 = bad request
		if(e.errorCode==701 || e.errorCode==400) {
			gLog("# peerCon onicecandidateerror", e.errorCode, e.errorText, e.url);
		} else {
			if(!gentle) console.warn("peerCon onicecandidateerror", e.errorCode, e.errorText, e.url);
			showStatus("iceCandidate error "+e.errorCode+" "+e.errorText,-1);
		}
	}
	peerCon.ontrack = ({track, streams}) => peerConOntrack(track, streams);
	peerCon.onnegotiationneeded = async () => {
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			gLog('# peerCon onnegotiationneeded !peerCon');
			return;
		}
		try {
			// note: this will trigger onIceCandidates and send calleeCandidate's to the client
			gLog("peerCon onnegotiationneeded createOffer");
			localDescription = await peerCon.createOffer();
			localDescription.sdp = maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
			localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
				'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');

			peerCon.setLocalDescription(localDescription).then(() => {
				if(doneHangup) {
					gLog('peerCon onnegotiationneeded deny send: doneHangup');
				} else if(!rtcConnect && !dialing) {
					console.log('# onnegotiationneeded deny send: !rtcConnect && !dialing');
				} else if(isDataChlOpen()) {
					gLog('peerCon onnegotiationneeded send callerOfferUpd via dc');
					dataChannel.send("cmd|callerOfferUpd|"+JSON.stringify(localDescription));
				} else {
					gLog('peerCon onnegotiationneeded send callerOffer via ws');
					wsSend("callerOffer|"+JSON.stringify(localDescription));
				}
			}, err => console.error(`Failed to set local descr: ${err.toString()}`));
		} catch(err) {
			console.error("peerCon onnegotiationneeded err",err);
		}
	};
	peerCon.onicegatheringstatechange = event => {
		let connection = event.target;
		gLog("peerCon onicegatheringstatechange "+connection.iceGatheringState);
		if(connection.iceGatheringState=="complete") {
			gLog("peerCon onIceCandidates="+onIceCandidates);
		}
	}
	peerCon.onsignalingstatechange = event => {
		gLog("peerCon onsignalingstate "+peerCon.signalingState);
	}
	peerCon.oniceconnectionstatechange = event => {
		gLog("peerCon oniceconnectionstate "+peerCon.iceConnectionState);
	}
	peerCon.onconnectionstatechange = event => {
		connectionstatechangeCounter++;
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			gLog("peerCon onconnectionstatechange !peerCon "+peerCon.connectionState);
			hangupWithBusySound(true,"Peer disconnected");
			return;
		}
		gLog("peerCon onconnectionstatechange "+peerCon.connectionState);
		if(peerCon.connectionState=="disconnected") {
			gLog("peerCon disconnected",rtcConnect,mediaConnect);
			if(typeof Android !== "undefined" && Android !== null) {
				Android.peerDisConnect();
			}
			hangupWithBusySound(true,"Peer disconnected");
			return;
		}
		if(peerCon.connectionState=="failed") {
// TODO in some situation this strikes multiple times; but there is no point playing busySound multpl times
			hangupWithBusySound(true,"Peer connection failed "+candidateResultString);
			return;
		}

		if(peerCon.connectionState=="connecting") {
			// if we see this despite being mediaConnect already, it is caused by createDataChannel
			//if(!mediaConnect) {
			//	showStatus(connectingText,-1);
			//}
		} else if(peerCon.connectionState=="connected") {
			// if we see this despite being mediaConnect already, it is caused by createDataChannel
			gLog('peerCon connected');
			if(!rtcConnect && !mediaConnect) {
				// the caller got peer-connected to the callee; callee now starts ringing
				rtcConnect = true;
				rtcConnectStartDate = Date.now();
				mediaConnectStartDate = 0;

				if(!singlebutton) {
					// set goodbyTextMsg (including msgbox text) to be evaluated in goodby
//					goodbyTextMsg = calleeID+"|"+callerName+"|"+callerId+
//						"|"+Math.floor(Date.now()/1000)+"|"+msgbox.value.substring(0,300)
					goodbyTextMsg = cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen)
					gLog('set goodbyTextMsg='+goodbyTextMsg);

					let msgboxText = cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen);
					if(msgboxText!="") {
						if(dataChannel) {
							if(dataChannel.readyState=="open") {
								gLog('send msgbox',msgboxText);
								dataChannel.send("msg|"+msgboxText);
							} else {
								dataChannelSendMsg = msgboxText;
							}
						} else {
							console.warn('no dataChannel, cannot send msgbox (%s)'+msgboxText);
						}
					}
				}
			}
			dialing = false;
			showStatus("Ringing...",-1);
		}
	}
	if(!localStream) {
		showStatus("Dialup canceled");
		return;
	}
	// add selected local audioTrack (audio input / mic) to peerCon
	const audioTracks = localStream.getAudioTracks();
	if(audioTracks.length>0) {
		if(mediaConnect) {
			audioTracks[0].enabled = true; // unmute
			gLog('peerCon addTrack local audio input',audioTracks[0]);
		} else {
			audioTracks[0].enabled = false; // mute
			gLog('peerCon addTrack local mute audio input',audioTracks[0]);
		}
		addedAudioTrack = peerCon.addTrack(audioTracks[0],localStream);
	}

	createDataChannel();

	gLog('dial peerCon.createOffer');
	peerCon.createOffer().then((desc) => {
		localDescription = desc;
		localDescription.sdp = maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
		localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
			'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
		// this localDescription will be sent with upcoming calleeAnswer in response to upcoming callerOffer

		// -> onsignalingstate have-local-offer
		// -> onnegotiationneeded send callerOffer via ws
		// -> signaling cmd calleeAnswer -> calleeAnswer setLocalDescription -> calleeAnswer setRemoteDescription
		// -> onconnectionstate connected
		// -> signaling cmd calleeOffer -> calleeOffer setRemoteDescription -> onsignalingstate have-remote-offer
		// -> calleeOffer received offer createAnswer
	}, err => console.warn(`dial createOffer failed: ${error.toString()}`));
}

function createDataChannel() {
	gLog('createDataChannel...');
	dataChannel = peerCon.createDataChannel("datachannel");
	dataChannel.onopen = event => {
		gLog("dataChannel.onopen");
		if(dataChannelSendMsg!="") {
			dataChannel.send("msg|"+dataChannelSendMsg);
			dataChannelSendMsg = "";
		}
	};
	dataChannel.onclose = event => dataChannelOnclose(event);
	dataChannel.onerror = event => dataChannelOnerror(event);
	dataChannel.onmessage = event => dataChannelOnmessage(event);
}

function dataChannelOnmessage(event) {
	if(doneHangup) {
		gLog("dataChannel.onmessage ignored on doneHangup");
		return;
	}
	if(typeof event.data === "string") {
		gLog("dataChannel.onmessage");
		if(event.data) {
			if(event.data.startsWith("disconnect")) {
				gLog("dataChannel.close on 'disconnect'");
				dataChannel.close();
				dataChannel = null;
				hangupWithBusySound(false,"");
			} else if(event.data.startsWith("cmd|")) {
				let subCmd = event.data.substring(4);
				gLog("subCmd="+subCmd);
				if(subCmd.startsWith("ledred")) {
					if(onlineIndicator) {
						onlineIndicator.src="red-gradient.svg";
					}
					microphoneIsNeeded = true;

					// unmute micro
					if(localStream) {
						const audioTracks = localStream.getAudioTracks();
						audioTracks[0].enabled = true;
						// localStream.getTracks().forEach(track => { ??? });
					}
				} else if(subCmd.startsWith("ledgreen")) {
					if(onlineIndicator) {
						onlineIndicator.src="green-gradient.svg";
					}
					microphoneIsNeeded = false;

					// mute mic
					if(localStream) {
						const audioTracks = localStream.getAudioTracks();
						audioTracks[0].enabled = false;
					}
				} else {
					signalingCommand(subCmd);
				}
			} else if(event.data.startsWith("file|")) {
				var fileDescr = event.data.substring(5);

				if(fileDescr=="end-send") {
					gLog("file transmit aborted by sender");
					progressRcvElement.style.display = "none";
					if(fileReceivedSize < fileSize) {
						showStatus("file transmit aborted by sender");
					}
					fileReceivedSize = 0;
					fileReceiveBuffer = [];
					return;
				}
				if(fileDescr=="end-rcv") {
					gLog("file send aborted by receiver");
					showStatus("file send aborted by receiver");
					fileSendAbort = true;
					progressSendElement.style.display = "none";
					if(fileselectLabel && mediaConnect && isDataChlOpen() && isP2pCon()) {
						fileselectLabel.style.display = "block";
					}
					return;
				}

				showStatus("",-1);
				fileReceiveAbort = false;
				// parse: "file|"+file.name+","+file.size+","+file.type+","+file.lastModified);
				let tok = fileDescr.split(",");
				fileName = tok[0];
				fileSize = 0;
				if(tok.length>=2) {
					fileSize = parseInt(tok[1]);
					progressRcvBar.max = fileSize;
					progressRcvElement.style.display = "block";
				}
				gLog("file receive",fileName,fileSize);
				fileReceivedSize = 0;
				fileReceiveBuffer = [];
				fileReceiveStartDate = Date.now();
				fileReceiveSinceStartSecs=0;
			}
		}
	} else {
		if(fileReceiveAbort) {
			gLog("file receive abort");
			fileReceivedSize = 0;
			fileReceiveBuffer = [];
			return;
		}

		fileReceiveBuffer.push(event.data);
		var chunkSize = event.data.size; // ff
		if(isNaN(chunkSize)) {
			chunkSize = event.data.byteLength; // chrome
		}

		fileReceivedSize += chunkSize;
		progressRcvBar.value = fileReceivedSize;
		let sinceStartSecs = Math.floor((Date.now() - fileReceiveStartDate + 500)/1000);
		if(sinceStartSecs!=fileReceiveSinceStartSecs && sinceStartSecs!=0) {
			let kbytesPerSec = Math.floor(fileReceivedSize/1000/sinceStartSecs);
			progressRcvLabel.innerHTML = "receiving '"+fileName.substring(0,22)+"' "+kbytesPerSec+" KB/s";
			fileReceiveSinceStartSecs = sinceStartSecs;
		}
		if(fileReceivedSize === fileSize) {
			gLog("file receive complete");
			const receivedBlob = new Blob(fileReceiveBuffer);
			fileReceiveBuffer = [];
			progressRcvElement.style.display = "none";

			let randId = ""+Math.random()*100000000;
			var aDivElement = document.createElement("div");
			aDivElement.id = randId;
			downloadList.appendChild(aDivElement);

			var aElement = document.createElement("a");
			aElement.href = URL.createObjectURL(receivedBlob);
			aElement.download = fileName;
			let kbytes = Math.floor(fileReceivedSize/1000);
			aElement.textContent = `received '${fileName.substring(0,25)}' ${kbytes} KB`;
			aDivElement.appendChild(aElement);

			var aDeleteElement = document.createElement("a");
			aDeleteElement.style = "margin-left:10px;";
			aDeleteElement.onclick = function(){ downloadList.removeChild(aDivElement); }
			aDeleteElement.textContent = `[x]`;
			aDivElement.appendChild(aDeleteElement);
		}
	}
}

function stopAllAudioEffects() {
	if(playDialSounds) {
		gLog('stopAllAudioEffects DialSound stop');
		if(dtmfDialingSound) {
			dtmfDialingSound.currentTime = 100000;
		}
		if(busySignalSound) {
			busySignalSound.pause();
			busySignalSound.currentTime = 0;
		}
	}
}

function hangup(mustDisconnectCallee,mustcheckCalleeOnline,message) {
	gLog('hangup');
	dialing = false;
	connectLocalVideo(true); // forceOff
	if(fileselectLabel) {
		fileselectLabel.style.display = "none";
		progressSendElement.style.display = "none";
		progressRcvElement.style.display = "none";
	}

	if(doneHangup) {
		gLog('hangup abort on doneHangup');
		return;
	}
	doneHangup = true;

	gLog('hangup msg='+message+' '+mustDisconnectCallee);
	if(message!="") {
		showStatus(message);
	}

	if(singlebutton) {
		dialButton.style.boxShadow = "";
	} else {
		onlineIndicator.src="";
	}
	stopTimer();

	localDescription = null;
	if(singlebutton) {
		hangupButton.style.display = "none";
		hangupButton.innerHTML = "Hang up";
		hangupButton.style.boxShadow = "";
		setTimeout(function() {
			dialButton.innerHTML = "<b>W E B C A L L</b><br>"+singleButtonReadyText;
			dialButton.style.display = "inline-block";
		},2500); // till busy tone ends
	} else {
		hangupButton.disabled = true;
		//dialButton.disabled = false;
		onlineIndicator.src="";
	}

	if(wsConn && wsConn.readyState==1) {
		gLog('mustDisconnect='+mustDisconnectCallee+' readyState='+wsConn.readyState+" mediaCon="+mediaConnect);
		if(!mediaConnect) {
			let msgboxText = cleanStringParameter(msgbox.value,false).substring(0,msgBoxMaxLen);
			//gLog('msgboxText=('+msgboxText+')');
			if(msgboxText!="") {
				gLog('msg=('+msgboxText+')');
				wsSend("msg|"+msgboxText);
			}
		}
		if(mustDisconnectCallee) {
			// if hangup occurs while still ringing, send cancel
			// before that: send msgbox text to server
			gLog('hangup wsSend(cancel)');
			wsSend("cancel|c");
		}
	}
	if(wsConn) {
		wsConn.close();
		wsConn=null;
	}

	if(!singlebutton) {
		msgbox.value = "";
	}
	if(remoteVideoFrame) {
		gLog('hangup shutdown remoteAV');
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
		remoteVideoHide();
	}
	remoteStream = null;

	if(peerCon && peerCon.iceConnectionState!="closed") {
		if(addedAudioTrack) {
			gLog("hangup peerCon.removeTrack(addedAudioTrack)");
			peerCon.removeTrack(addedAudioTrack);
			addedAudioTrack = null;
		} else {
			gLog("hangup no addedAudioTrack for peerCon.removeTrack()");
		}
	}

	if(videoEnabled) {
		gLog("hangup no shutdown localAV bc videoEnabled",videoEnabled);
	} else {
		gLog("hangup shutdown localAV");
		if(localStream) {
			// stop all localStream tracks
			localStream.getTracks().forEach(track => {
				gLog('hangup stop localStream track.stop()',track);
				track.stop(); 
			});

			// remove local mic from localStream
			const audioTracks = localStream.getAudioTracks();
			gLog('hangup remove local mic audioTracks.length',audioTracks.length);
			if(audioTracks.length>0) {
				gLog('hangup remove local mic removeTrack',audioTracks[0]);
				audioTracks[0].stop();
				localStream.removeTrack(audioTracks[0]);
			}

			// remove local vid from localStream
			const videoTracks = localStream.getVideoTracks();
			gLog('hangup remove local vid videoTracks.length '+videoTracks.length);
			if(videoTracks.length>0) {
				gLog('hangup remove local vid removeTrack',videoTracks[0]);
				videoTracks[0].stop();
				localStream.removeTrack(videoTracks[0]);
			}
		}
		localVideoFrame.pause();
		localVideoFrame.currentTime = 0;
		localVideoFrame.srcObject = null;
		localStream = null;
	}

	mediaConnect = false;
	rtcConnect = false;
	if(vsendButton) {
		vsendButton.style.display = "none";
	}
	vmonitor();
	if(vsendButton)
		vsendButton.classList.remove('blink_me')

	if(peerCon && peerCon.iceConnectionState!="closed") {
		gLog('hangup peerCon');
		let peerConCloseFunc = function() {
			gLog('hangup peerConCloseFunc');
			if(mustDisconnectCallee) {
				let closePeerCon = function() {
					if(peerCon && peerCon.iceConnectionState!="closed") {
						const senders = peerCon.getSenders();
						if(senders) {
							gLog('hangup peerCon.removeTrack senders '+senders.length);
							try {
								senders.forEach((sender) => { peerCon.removeTrack(sender); })
							} catch(ex) {
								console.warn('hangup peerCon.removeTrack sender',ex);
							}
						}

						const receivers = peerCon.getReceivers();
						if(receivers) {
							gLog('hangup peerCon.receivers len='+receivers.length);
							try {
								receivers.forEach((receiver) => { receiver.track.stop(); });
							} catch(ex) {
								console.warn('hangup receiver.track.stop()',ex);
							}
						}

						const transceivers = peerCon.getTransceivers();
						if(transceivers) {
							gLog('hangup peerCon.transceivers len='+transceivers.length);
							try {
								transceivers.forEach((transceiver) => { transceiver.stop(); })
							} catch(ex) {
								console.warn('hangup peerCon.transceiver stop ex',ex);
							}
						}

						gLog('hangup peerCon.close');
						peerCon.close();
					}
				}

				if(isDataChlOpen()) {
					gLog('hangup dataChannel send disconnect');
					dataChannel.send("disconnect");
					// give dataChannel disconnect some time to deliver
					setTimeout(function() {
						if(isDataChlOpen()) {
							gLog('hangup dataChannel.close');
							dataChannel.close();
							dataChannel = null;
						}
						closePeerCon();
					},500);
				} else {
					gLog('hangup dataChannel not open');
					// most likely hangup came very early; unfortunately now we cannot disconnect callee
					closePeerCon();
				}
			} else {
				if(isDataChlOpen()) {
					gLog('hangup dataChannel.close');
					dataChannel.close();
					dataChannel = null;
				}

				// TODO peerCon.getSenders().forEach( peerCon.removeTrack(sender) ) etc like above?

				gLog('hangup peerCon.close 2 '+calleeID);
				peerCon.close();
				gLog('hangup peerCon.signalingState '+peerCon.signalingState);
			}

			if(typeof Android !== "undefined" && Android !== null) {
				Android.peerDisConnect();
			}
		}

		if(singlebutton) {
			peerConCloseFunc();
		} else {
			peerCon.getStats(null).then((results) => { 
				getStatsPostCall(results);
				peerConCloseFunc();
			}, err => {
				console.log(err); 
				peerConCloseFunc();
			});
		}
	}

	if(mustcheckCalleeOnline && !singlebutton) {
		// it can take up to 3s for our call to get fully ended and cleared on server and callee side
		setTimeout(function() {
			gLog('hangup -> calleeOnlineStatus');
			// show msgbox etc.
			//calleeOnlineStatus(lastOnlineStatus,false);
			checkCalleeOnline(false,"hangup");
			dialButton.disabled = false;
		},3000);
	}
}

function clearForm(idx) {
	if(idx==3) {
		enterIdValElement.value = "";
		setTimeout(function() {
			   enterIdValElement.focus();
		},400);
	} else if(idx==4) {
		enterDomainValElement.value = "";
		setTimeout(function() {
			   enterDomainValElement.focus();
		},400);
	}
}

