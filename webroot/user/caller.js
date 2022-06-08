// WebCall Copyright 2022 timur.mobi. All rights reserved.
'use strict';
const dialButton = document.querySelector('button#callButton');
const hangupButton = document.querySelector('button#hangupButton');
const calleeOnlineElement = document.getElementById("calleeOnline");
const enterIdElement = document.getElementById('enterId');
const enterIdVal = document.getElementById('enterIdVal');
const enterDomainVal = document.getElementById('enterDomainVal');
const divspinnerframe = document.querySelector('div#spinnerframe');
const bitrate = 280000;
const calleeMode = false;

var connectingText = "Connecting P2P...";
var singleButtonReadyText = "Click to make your order<br>Live operator";
var singleButtonBusyText = "All lines are busy.<br>Please try again a little later.";
var singleButtonConnectedText = "You are connected.<br>How can we help you?";
var ringingText = "Ringing... please be patient, answering a web call may take a bit longer than answering a regular phone call...";
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
var dialButtonAfterCalleeOnline = false;
var lastResult;
var candidateArray = [];
var candidateResultGenerated = true;
var candidateResultString = "";
var wsAddr = "";
var wsAddrTime;
var calleeID = ""; // who we are calling
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
var callerId = ""; // our id
var callerName = ""; // our name
var otherUA="";
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
gLog("caller client extMessage now listening");

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
		calleeID = id;
	}
	// if on start there is a fragment/hash ('#') in the URL, remove it
	if(location.hash.length > 0) {
		gLog("location.hash.length=%d",location.hash.length);
		window.location.replace("/user/"+calleeID);
		return;
	}
	// the following args may be used in confirmNotifyConnect()
	callerId = getUrlParams("callerId"); // our id
	if(typeof callerId=="undefined") {
		callerId = "";
	}
	callerName = getUrlParams("name");
	if(typeof callerName=="undefined") {
		callerName = "";
	}
	gLog("onload callerId=("+callerId+") callerName=("+callerName+")");

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

	if(window.self == window.top) {
		// not running in iframe mode
		gLog("onload setup onkeydownFunc");
		document.onkeydown = (evt) => onkeydownFunc(evt);
	} else {
		// running in iframe mode
		gLog("onload no onkeydownFunc in iframe mode");
	}

	if(calleeID=="") {
		// Dial ID
		gLog("onload no calleeID; switch to enterId");
		containerElement.style.display = "none";
		enterIdElement.style.display = "block";
		enterDomainVal.value = location.hostname;

		// if serverSettings.storeContacts=="true", turn element "dialIdAutoStore" on
		contactAutoStore = false;
		let api = apiPath+"/getsettings?id="+calleeID;
		if(!gentle) console.log('request getsettings api '+api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			var xhrresponse = xhr.responseText
			//if(!gentle) console.log('xhr.responseText '+xhrresponse);
			if(xhrresponse=="") {
				serverSettings = null;
				return;
			}
			var serverSettings = JSON.parse(xhrresponse);
			if(typeof serverSettings!=="undefined") {
				if(!gentle) console.log('serverSettings.storeContacts',serverSettings.storeContacts);
				if(serverSettings.storeContacts=="true") {
					contactAutoStore = true;
					var dialIdAutoStoreElement = document.getElementById("dialIdAutoStore");
					if(dialIdAutoStoreElement) {
						dialIdAutoStoreElement.style.display = "block";
					}
				}
			}
		}, function(errString,err) {
			console.log('xhr error',errString);
		});

		setTimeout(function() {
			enterIdVal.focus();
		},400);
		// will continue in submitForm()
		return;
	}

	onload2(true);
}

function onload2(checkFlag) {
	haveBeenWaitingForCalleeOnline=false;
	checkServerMode(function(mode) {
		if(mode==0) {
			// normal mode
			var calleeIdTitle = calleeID.charAt(0).toUpperCase() + calleeID.slice(1);

			document.title = "WebCall "+calleeIdTitle;
			if(titleElement) {
				titleElement.innerHTML = "WebCall "+calleeIdTitle;
			}

			gLog('start caller with calleeID',calleeID);
			if(calleeID.startsWith("#")) {
				// example: calleeID=="#007" -> ask server for callback to callerId
				let api = apiPath+"/action?id="+calleeID.substring(1)+"&callerId="+callerId+"&name="+callerName;
				xhrTimeout = 5*1000;
				ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
					history.back();
				}, errorAction2);
				return;
			}

			if(checkFlag) {
				// need to know if calleeID is online asap (will switch to callee-online-layout if it is)
				dialAfterCalleeOnline = false;
				checkCalleeOnline(true);
			}

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
					console.log(msg);
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
				};
			}

			calleeID = calleeID.toLowerCase();
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

function dialButtonClick() {
	gLog("dialButtonClick");
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
		hangupButton.disabled = false;
		msgbox.style.display = "none";
	}

	// -> checkCalleeOnline -> ajax -> calleeOnlineAction -> gotStream -> connectSignaling
	gLog("dialButtonClick set dialAfterCalleeOnline");
	dialAfterCalleeOnline = true;

	let wsAddrAgeSecs = Math.floor((Date.now()-wsAddrTime)/1000);
	if(wsAddr!="" && wsAddrAgeSecs<30) {
		calleeOnlineAction("dialButton");
	} else {
		checkCalleeOnline(true);
	}
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
				// TODO would it be enough to do only this?
				audioTracks[0].enabled = false;
				audioTracks[0].stop();
				localStream.removeTrack(audioTracks[0]);
			}

			const videoTracks = localStream.getVideoTracks();
			gLog('videoOff removeTrack local vid videoTracks.length',videoTracks.length);
			if(videoTracks.length>0) {
				gLog('videoOff removeTrack local vid',videoTracks[0]);
				// TODO would it be enough to do only this?
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
//				getStream(optionElements[i]);
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
		console.log('# xhr error',errString);
		callback(2);
	});
}

function getUrlParams(param) {
	if(window.location.search!="") {
		// skip questionmark
		var query = window.location.search.substring(1);
		var parts = query.split("&");
		for (var i=0;i<parts.length;i++) {
			var seg = parts[i].split("=");
			if (seg[0] == param) {
				return decodeURI(seg[1]);
			}
		}
	}
	if(param=="id") {
		let path = window.location.pathname;
		let lastSlash = path.lastIndexOf("/");
		return path.substring(lastSlash+1);
	}
}

function checkCalleeOnline(waitForCallee) {
	let api = apiPath+"/online?id="+calleeID;
	if(callerId!=="" && callerId!=="undefined") {
		api += "&callerId="+callerId+"&name="+callerName;
	}
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			api = api + "&ver="+Android.getVersionName();
		}
		if(typeof Android.webviewVersion !== "undefined" && Android.webviewVersion !== null) {
			api = api + "_" + Android.webviewVersion();
		}
	} else {
		//api = api + "&ver="+clientVersion;
	}
	gLog('checkCalleeOnline api',api);
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
		showStatus("ID not found.",-1)
		waitForCallee = false;
	}
	// switch to offline mode and (if waitForCallee is set) check if calleeID can be notified
	calleeOfflineAction(onlineStatus,waitForCallee);
}

function calleeOnlineAction(from) {
	gLog('calleeOnlineAction from='+from+' dialAfterCalleeOnline='+dialAfterCalleeOnline);
	if(!notificationSound) {
		gLog('loading audio files');
		notificationSound = new Audio("notification.mp3");
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

		if(dialButtonAfterCalleeOnline) {
			dialButtonAfterCalleeOnline = false;
			dialButtonClick();

		} else if(dialAfterCalleeOnline) {
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
					showStatus( "Enter text message before the call (optional):",-1)
					msgbox.style.display = "block";
					gLog('callerName',callerName);
					/*
					if(typeof callerName!=="undefined" && callerName!="") {
						msgbox.value = "Hi, this is "+callerName;
					}
					*/
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
			gLog('loadJS loaded %s',jsFile);
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
				let api = apiPath+"/online?id="+calleeID+"&wait=true&callerId="+callerId+"&name="+callerName;
				xhrTimeout = 15*60*1000; // 15min
				if(offlineFor>0) {
					xhrTimeout = xhrTimeout - offlineFor*1000;
				}
				console.log("notifyCallee api="+api+" timeout="+xhrTimeout);
				// in case caller aborts:
				goodbyMissedCall = calleeID+"|"+callerName+"|"+callerId+
					"|"+Math.floor(Date.now()/1000)+"|"+msgbox.value.substring(0,300)
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
			let api = apiPath+"/canbenotified?id="+calleeID+"&callerId="+callerId+"&name="+callerName;
			gLog('canbenotified api',api);
			xhrTimeout = 30*1000;
			ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
				if(xhr.responseText.startsWith("ok")) {
					// calleeID can be notified (or is hidden)
					// if caller is willing to wait, caller can invoke confirmNotifyConnect() to enter own name
					calleeName = xhr.responseText.substring(3);
					if(calleeName=="" || calleeName.length<3) {
						calleeName = calleeID;
					}
					var msg = calleeName+" is currently not available.<br><br>"+
						"We can try to get "+calleeName+" on the phone. Can you wait a few minutes while we try to establish a connection?<br><br><a onclick='confirmNotifyConnect()'>Yes, please try</a>";
					if(window.self == window.top) {
						// not running in iframe mode: no -> jump on directory up
						msg += "<br><br><a href='..'>No, I have to go</a>";
					} else {
						// running in iframe mode: no -> history.back()
						msg += "<br><br><a onclick='history.back();'>No, I have to go</a>";
					}

					showStatus(msg,-1);
					goodbyMissedCall = calleeID+"|"+callerName+"|"+callerId+
						"|"+Math.floor(Date.now()/1000)+"|"+msgbox.value.substring(0,300)
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
	gLog('goodby');
	if(goodbyMissedCall!="") {
		// goodbyMissedCall is used, when callee can not be reached (is offline)
		// in this case the server does NOT call peerConHasEnded(), so we call /missedCall from here
		// id=format: calleeID|callerName|callerID|ageSecs|msgbox
		// goodbyMissedCall arrives as urlID but is then tokenized
// TODO check wsConn instead of wsAddr
		if(wsAddr!="") {
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
	} else if(goodbyTextMsg!="" && wsConn) {
		// goodbyTextMsg is used, when callee is online (peerconnect), but does not pick up (no mediaconnect)
		// in this case server calls peerConHasEnded() for the callee, where addMissedCall() is generated
// TODO check wsConn instead of wsAddr
//		if(wsAddr!="") {
		if(wsConn==null) {
			gLog('goodbyTextMsg wsSend='+goodbyTextMsg);
			wsSend("msg|"+goodbyTextMsg);
		} else {
			// sync xhr?
			// no solution for this yet
			gLog('goodbyTextMsg syncxhr not yet impl '+goodbyTextMsg);
		}
	}
	goodbyDone = true;

	if(typeof Android !== "undefined" && Android !== null) {
		Android.peerDisConnect();
	}
}

var calleeName = "";
var confirmValue = "";
var confirmWord = "123";
var confirmXhrNickname = false;
function confirmNotifyConnect() {
	// offer caller to enter a nickname + callerID and ask to enter confirmWord
	// using a form with two text fields
	confirmWord = ""+(Math.floor(Math.random() * 900) + 100);
	if(typeof callerName=="undefined") {
		callerName = "";
	}
	if(typeof callerId=="undefined") {
		callerId = "";
	}
	if(callerName=="" && callerId!="" && !confirmXhrNickname) {
		// try to get callerName from server based on (possibly existing) cookie
		confirmXhrNickname = true;
		let api = apiPath+"/getsettings"; //?id="+callerId;
		xhrTimeout = 3*1000;
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			if(xhr.responseText!="") {
				var obj = JSON.parse(xhr.responseText);
				if(typeof obj.nickname!=="undefined") {
					callerName = obj.nickname;
					gLog('callerName',callerName);
				}
			}
			confirmNotifyConnect();
		}, function(errString,err) {
			console.log('# xhr error',errString);
			confirmNotifyConnect();
		});
		return;
	}

	var msg = `About to get `+calleeName+` on the phone<br>
	<form action="javascript:;" onsubmit="confirmNotifyConnect2(this)" style="max-width:550px;" id="confirmNotify">

	<label for="nickname" style="display:inline-block; padding-bottom:4px;">Enter your nickname:</label><br>
	<input name="nickname" id="nickname" type="text" class="formtext" maxlength="25" value="`+callerName+`" autofocus required>
	<span onclick="clearForm(0)" style="margin-left:5px; user-select:none;">X</span><br>
	<br>
<!--
	<label for="callerID" style="display:inline-block; padding-bottom:4px;">Short text message (optional):</label><br>
	<input name="callerID" id="callerID" type="text" class="formtext" maxlength="25" value="`+callerId+`">
	<span onclick="clearForm(1)" style="margin-left:5px; user-select:none;">X</span><br>
	<br>
-->
	<label for="confirm" style="display:inline-block; padding-bottom:4px;">Enter '`+confirmWord+`' to continue:</label><br>
	<input name="confirm" id="confirm" type="text" class="formtext" maxlength="3" value="`+confirmValue+`">
	<span onclick="clearForm(2)" style="margin-left:5px; user-select:none;">X</span><br>

	<input type="submit" name="Submit" id="submit" value="Start" style="width:100px; margin-top:26px;">
	</form>
`;
	showStatus(msg,-1);

	setTimeout(function() {
		if(callerName!="" && confirmValue=="") {
			var formConfirm = document.querySelector('input#confirm');
			formConfirm.focus();
		} else {
			var formNickname = document.querySelector('input#nickname');
			formNickname.focus();
		}
	},500);
}

// not for singlebutton
function clearForm(idx) {
	if(idx==0) {
		var formNickname = document.querySelector('input#nickname');
		formNickname.value = "";
		formNickname.focus();
	} else if(idx==1) {
		var formCallerID = document.querySelector('input#callerID');
		formCallerID.value = "";
		formCallerID.focus();
	} else if(idx==2) {
		var formConfirm = document.querySelector('input#confirm');
		formConfirm.value = "";
		formConfirm.focus();
	} else if(idx==3) {
		enterIdVal.value = "";
		setTimeout(function() {
			enterIdVal.focus();
		},400);
	} else if(idx==4) {
		enterDomainVal.value = "";
		setTimeout(function() {
			enterDomainVal.focus();
		},400);
	}
}

function submitForm(theForm) {
	// DialID: switch back to default container
	enterIdElement.style.display = "none";
	containerElement.style.display = "block";
	calleeID = enterIdVal.value;
	calleeID = calleeID.replace(/ /g,''); // remove all white spaces
	if(!calleeID.startsWith("#")) {
		if(calleeID.length>11) calleeID = calleeID.substring(0,11);
	}
	gLog('submitForm set calleeID='+calleeID+" "+enterDomainVal.value);
	if(enterDomainVal.value!=location.hostname) {
		window.open("https://"+enterDomainVal.value+"/user/"+calleeID, ""); //"_blank"
		history.back();
	} else {
		dialButtonAfterCalleeOnline = true;
		onload2(true);
	}
}

function errorAction2(errString,err) {
	console.log('xhr error',errString);
	// let user know via alert
	//alert("xhr error "+errString);
}


function confirmNotifyConnect2() {
	// caller has entered nickname form - lets validate
	callerName = document.getElementById("nickname").value;
//	callerId = document.getElementById("callerID").value;
	var confirmForm = document.getElementById("confirm")
	if(confirmForm) {
		confirmValue = confirmForm.value;
	}
	//console.log("callerName="+callerName+" callerId="+callerId);
	console.log("confirmValue="+confirmValue+" confirmWord="+confirmWord);
	if(confirmValue != confirmWord) {
		confirmValue = "";
		confirmNotifyConnect();
		return;
	}
	// make sure callerName is not longer than 25 chars and is alphanumeric only (plus space)
	callerName = callerName.replace(/[^a-zA-Z0-9 ]/g, "");
	if(callerName.length>25) {
		callerName = callerName.substring(0,25);
	}
	//console.log("confirmNotifyConnect2 callerName="+callerName);
/*
	callerId = callerId.replace(/[^a-zA-Z0-9 ]/g, "");
	if(callerId.length>11) {
		callerId = callerId.substring(0,11);
	}
*/
	console.log("confirmNotifyConnect2 callerId="+callerId);

	// this short delay prevents "Form submission canceled because the form is not connected" in chrome 56+
	setTimeout(function() {
		notifyConnect(callerName,callerId);
	},200);
}

function notifyConnect(callerName,callerId) {
	// nickname form was valid
	// the next xhr will freeze until hidden callee accepts the call
	showStatus("Trying to get "+calleeID+" on the phone. Please wait...",-1);
	if(divspinnerframe) {
		divspinnerframe.style.display = "block";
	}
	goodbyMissedCall = "";
	let api = apiPath+"/notifyCallee?id="+calleeID+"&callerId="+callerId+"&name="+callerName;
	xhrTimeout = 600*1000; // 10 min extended xhr timeout
	console.log("notifyCallee api="+api+" timeout="+xhrTimeout);
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
	console.log('errorAction',errString,errcode);
	if(errString.startsWith("fetch")) {
		showStatus("No response from signaling server",-1);
	} else {
		showStatus("xhr error",-1);
	}
}

function gotStream2() {
	if(dialAfterLocalStream) {
		gLog("gotStream2 dialAfter connectSignaling()");
		dialAfterLocalStream=false;
		connectSignaling("",dial);
	} else {
		// in caller we land here after video was enabled
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
	wsUrl += "&callerId="+callerId+"&name="+callerName+"&ver="+clientVersion;
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
		console.error("wsConn.onerror: clear wsAddr");
		showStatus("connect error");
		wsAddr = "";
		hangupButton.disabled = true;
		dialButton.disabled = false;
	}
	wsConn.onclose = function (evt) {
		if(tryingToOpenWebSocket) {
			// onclose before a ws-connection could be established
			// likely wsAddr is outdated (may have been cleared by onerror already)
			console.log('wsConn.onclose: clear wsAddr='+wsAddr);
			wsAddr = "";
			tryingToOpenWebSocket = false;
			hangupButton.disabled = true;
			dialButton.disabled = false;
			// clearing wsAddr does not always have the desired effect (of resulting in no err on next try)
			// so retry with checkCalleeOnline(true) (since wsConn is closed, we don't need to hangup)
			//hangupWithBusySound(false,"connect error");
			checkCalleeOnline(true);
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
		if(contactAutoStore) {
			if(callerId!=="" && callerId!=="undefined") {
				let api = apiPath+"/setcontact?id="+callerId+"&contactID="+calleeID; //+"&name="+newName;
				if(!gentle) console.log('request api',api);
				ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
					console.log('xhr setcontact OK',xhr.responseText);
				}, errorAction2);
			}
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
				console.log("calleeOffer received no offer:",hostDescription.type);
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

		console.log('callee is answering call');
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
			console.log('full mediaConnect, getting stats...');
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
			console.log('callee hang up');
			showStatus("Callee ended call",8000);
			if(wsConn) {
				if(!mediaConnect) {
					// before wsConn.close(): send msgbox text to server
					let msgboxText = msgbox.value.substring(0,300);
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
		} else {
			console.log("ignore cancel",payload);
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
			dial2();
		},1500);

		let loop = 0;
		var playDialSound = function() {
			if(!wsConn || mediaConnect) {
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

	// we are doing 3 thing here:
	// 1a if no peercon (rtcConnect) after 20s and not hangup by the user, hang up the call now
	// 1b and if no onIceCandidates, show a warning (webrtc check)
	// 2  if peercon but no mediaConnect after 20s, show ringingText stats text (asking user to be patient)
	setTimeout(function(lastDialDate) {
		//console.log('dial2 20s timer '+dialDate+' '+lastDialDate+' '+doneHangup+' '+rtcConnect);
		if(dialDate==lastDialDate && !doneHangup) { // still the same call after 20s?
			console.log('dial2 20s timer '+dialDate+' '+lastDialDate+' '+doneHangup+' '+rtcConnect);
			if(!rtcConnect) {
				// no rtcConnect after 20s: give up dial-waiting
				console.log("dialing timeout, giving up on call "+candidateResultString+
					dialDate,lastDialDate);
				if(onIceCandidates==0 && !doneHangup) {
					console.warn('no ice candidates created');
					onIceCandidates = -1;
					notificationSound.play().catch(function(error) { });
					hangup(true,true,"Cannot make calls. "+
					   "Your browser engine does not generate WebRTC/ICE candidates.");
					return;
				}
				hangupWithBusySound(true,"Failed to connect "+candidateResultString);
			} else {
				if(!mediaConnect) {
					// rtcConnect but no mediaConnect after 20s: tell caller to be parient
					showStatus(ringingText,-1);
				}
			}
		}
	},20000,dialDate);


	addedAudioTrack = null;
	addedVideoTrack = null;
	onIceCandidates = 0;
	try {
		gLog("dial peerCon = new RTCPeerConnection");
		peerCon = new RTCPeerConnection(ICE_config);
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
			console.log('peerCon disconnected',rtcConnect,mediaConnect);
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

				// set goodbyTextMsg (including msgbox text) to be evaluated in goodby
//				goodbyTextMsg = calleeID+"|"+callerName+"|"+callerId+
//					"|"+Math.floor(Date.now()/1000)+"|"+msgbox.value.substring(0,300)
				goodbyTextMsg = msgbox.value.substring(0,300)
				gLog('set goodbyTextMsg',goodbyTextMsg);

				if(!singlebutton) {
					let msgboxText = msgbox.value.substring(0,300);
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
			let msgboxText = msgbox.value.substring(0,300);
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
			calleeOnlineStatus(lastOnlineStatus,false);
			dialButton.disabled = false;
		},3000);
	}
}

