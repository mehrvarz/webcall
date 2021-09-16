// WebCall Copyright 2021 timur.mobi. All rights reserved.
'use strict';
const audioSelect = document.querySelector("select#audioSource");
const dialButton = document.querySelector('button#callButton');
const hangupButton = document.querySelector('button#hangupButton');
const calleeOnlineElement = document.getElementById("calleeOnline");
const remoteAudio = document.querySelector('audio#remoteAudio');
const bitrate = 280000;
const neverAudio = false;
const playDialSounds = true;

var connectingText = "Connecting...";
var singleButtonReadyText = "Click to make your order<br>Live operator";
var singleButtonBusyText = "All lines are busy.<br>Please try again a little later.";
var singleButtonConnectedText = "You are connected.<br>How can we help you?";
var ringingText = "Ringing... please be patient, answering a web call may take a bit longer than answering a regular phone call...";
var dtmfDialingSound = null;
var dialToneAfterDialingSound = null;
var busySignalSound = null;
var notificationSound = null;
var wsConn = null;
var peerCon = null;
var localDescription = null;
var localStream = null;
var remoteStream = null;
var hostDescription = null;
var dialing = false;
var rtcConnect = false;
var rtcConnectStartDate = 0;
var mediaConnect = false;
var mediaConnectStartDate = 0;
var dataChannel = null;
var doneHangup = false;
var dialAfterLocalStream = false;
var dialAfterCalleeOnline = false;
var onnegotiationneededAllowed = false;
var lastResult;
var candidateArray = [];
var candidateResultGenerated = true;
var candidateResultString = "";
var wsAddr = "";
var calleeID = "";
var sessionDuration = 0;
var dataChannelSendMsg = "";
var iframeParent;
var iframeParentArg="";
var codecPreferences;
var titleElement;
var statusLine;
var msgbox;
var timerElement;
var postCallStatsElement;
var calleeOfflineElement;
var onlineIndicator;
if(!singlebutton) {
	codecPreferences = document.querySelector('#codecPreferences');
	titleElement = document.getElementById('title');
	statusLine = document.getElementById('status');
	msgbox = document.querySelector('textarea#msgbox');
	timerElement = document.querySelector('div#timer');
	postCallStatsElement = document.getElementById('postCallStats');
	calleeOfflineElement = document.getElementById("calleeOffline");
	onlineIndicator = document.querySelector('img#onlineIndicator');
}
var callerId = ""; // calleeId of the caller
var callerName = ""; // callee name of the caller
var otherUA="";

var extMessage = function(e) {
	//if(e.origin != 'http://origin-domain.com') {
	//	return
	//}
	var data = e.data.split(':')
	var action = data[0];
	var actionArg = data[1];
	console.log("client extMessage action",action,actionArg);
	if(action == "reqActiveNotification") {
		if(!gentle) console.log("client extMessage reqActiveNotification",actionArg);
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
console.log("caller client extMessage now listening");

window.onload = function() {
	//if(!gentle) console.log("onload");
	let id = getUrlParams("id");
	if(typeof id!=="undefined" && id!="") {
		calleeID = id;
	}
	if(calleeID=="") {
		if(!gentle) console.log("onload no calleeID abort");
		//window.location.reload(); //replace("/webcall");
		//window.location = window.location.href + "../..";
		let mainElement = document.getElementById('container')
		let mainParent = mainElement.parentNode;
		mainParent.removeChild(mainElement);
		var msgElement = document.createElement("div");
		msgElement.style = "margin-top:15%; display:flex; flex-direction:column; align-items:center; "+
						   "justify-content:center; text-align:center; font-size:1.2em; line-height:1.5em;";
		msgElement.innerHTML =
			"<div>Callee ID missing in link<br><br><a href='..'>Main page</a></div>";
		mainParent.appendChild(msgElement);
		return;
	}
	// the following args may be used in confirmNotifyConnect()
	callerId = getUrlParams("callerId");
	callerName = getUrlParams("name");
	if(!gentle) console.log("onload callerId=(%s) callerName=(%s)",callerId,callerName);

	let text = getUrlParams("readyText");
	if(typeof text!=="undefined" && text!="") {
		singleButtonReadyText = decodeURI(text);
		if(!gentle) console.log("onload url arg readyText",singleButtonReadyText);
		dialButton.innerHTML = "<b>W E B C A L L</b><br>"+singleButtonReadyText;
	}
	text = getUrlParams("connectingText");
	if(typeof text!=="undefined" && text!="") {
		connectingText = decodeURI(text);
		if(!gentle) console.log("onload url arg connectingText",connectingText);
	}
	text = getUrlParams("busyText");
	if(typeof text!=="undefined" && text!="") {
		singleButtonBusyText = decodeURI(text);
		if(!gentle) console.log("onload url arg busyText",singleButtonBusyText);
	}
	text = getUrlParams("connectedText");
	if(typeof text!=="undefined" && text!="") {
		singleButtonConnectedText = decodeURI(text);
		if(!gentle) console.log("onload url arg connectedText",singleButtonConnectedText);
	}

	checkServerMode(function(mode) {
		if(mode==0) {
			// normal mode
			if(calleeID.startsWith("random")) {
				document.title = "WebCall Roulette";
				if(titleElement) {
					titleElement.innerHTML = "WebCall Roulette";
				}
			} else if(calleeID.startsWith("!")) {
				document.title = "WebCall Duo";
				if(titleElement) {
					titleElement.innerHTML = "WebCall Duo";
				}
			} else {
				document.title = "WebCall "+calleeID;
				if(titleElement) {
					titleElement.innerHTML = "WebCall "+calleeID;
				}
			}

			if(!gentle) console.log('start caller with calleeID',calleeID);
			audioSelect.onchange = getStream;

			// we need to know if calleeID is online asap (will switch to callee-online-layout if it is)
			dialAfterCalleeOnline = false;
			checkCalleeOnline();

			if(dialButton!=null) {
				if(!calleeID.startsWith("random") && !calleeID.startsWith("!")) {

					if(singlebutton) {
						dialButton.innerHTML = "<b>W E B C A L L</b><br>"+singleButtonReadyText;
					} else {
						if(calleeID.match(/^[0-9]*$/) != null) {
							// calleeID is pure numeric - don't show
						} else {
							dialButton.innerHTML = "Call "+calleeID;
						}
					}
				}

				dialButton.onclick = function() {
					console.log("connecting...");
					showStatus(connectingText,-1);

					rtcConnectStartDate = 0;
					mediaConnectStartDate = 0;

					if(singlebutton) {
						// switch from dialButton to hangupButton "Connecting..."
						//hangupButton.style.backgroundColor = "#d33"; // color from button:active
						hangupButton.innerHTML = connectingText;
						dialButton.style.display = "none";
						hangupButton.style.display = "inline-block";
						// animate hangupButton background
						hangupButton.style.background = 'url("bg-anim.jpg"), linear-gradient(-45deg, #002c22, #102070, #2613c5, #1503ab)';
						hangupButton.style.backgroundSize = "400% 400%";
						hangupButton.style.animation = "gradientBG 30s ease infinite";
						//console.log("hangupButton.style",hangupButton.style);
					} else {
						dialButton.disabled = true;
						hangupButton.disabled = false;
						audioSelect.disabled = true;
						msgbox.style.display = "none";
					}

					// -> checkCalleeOnline -> ajax -> calleeOnlineAction -> gotStream -> connectSignaling
					dialAfterCalleeOnline = true;
					checkCalleeOnline();
				};
			}
			if(hangupButton!=null) {
				hangupButton.onclick = function() {
					dialButton.style.backgroundColor = "";
					hangupButton.style.backgroundColor = "";
					let msg = "Hang up";
					console.log(msg);
					if(mediaConnect) {
						hangupWithBusySound(true,msg);
					} else {
						stopAllAudioEffects();
						hangup(true,msg);
					}
				};
			}

			calleeID = calleeID.toLowerCase();
			return;
		}
		if(mode==1) {
			// maintenance mode
			let mainElement = document.getElementById('container')
			let mainParent = mainElement.parentNode;
			mainParent.removeChild(mainElement);
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
		console.log('xhr error',errString);
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

function checkCalleeOnline() {
	let api = apiPath+"/online?id="+calleeID;
	if(!gentle) console.log('checkCalleeOnline api',api);
	xhrTimeout = 30*1000;
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		calleeOnlineStatus(xhr.responseText);
		//setTimeout(checkCalleeOnline,30000);
	}, errorAction
		// errorAction will switch back; if we don't want this we should handle err like in notifyConnect()
	);
}

function calleeOnlineStatus(onlineStatus) {
	if(rtcConnect || dialing) {
		// TODO check if this is still required/meaningful
		return;
	}
	if(!gentle) console.log('calleeOnlineStatus',onlineStatus);
	// wsAddr should be something like "127.0.0.1:8071?wsid=4054932942"
	if(onlineStatus!="" && onlineStatus.indexOf("wsid=")>=0) {
		// callee is available
		wsAddr = onlineStatus;
		if(singlebutton) {
			// enable parent iframe (height)
			if(iframeParent) {
				console.log('calleeOnlineStatus singlebutton iframeParent');
				iframeParent.postMessage("activeNotification:"+iframeParentArg);
			} else {
				// onlineStatus arrived before iframeParent was set (before action=="reqActiveNotification")
				iframeParentArg = "occured";
			}
		}
		calleeOnlineAction("checkCalleeOnline");
		return;
	}
	// callee is not available
	// TODO here we could act upon "busy" and "notavail"

	if(singlebutton) {
		// no free callee available (aka "all lines busy")
		console.log('singlebutton no free callee available');
		setTimeout(function() {
			hangupButton.style.backgroundColor = "";
			hangupButton.style.display = "none";
			dialButton.innerHTML = singleButtonBusyText;
			dialButton.style.backgroundColor = "";
			dialButton.style.display = "inline-block";
			//calleeOnlineElement.style.display = "block";
			setTimeout(function() {
				//console.log('singlebutton back to singleButtonReadyText');
				dialButton.innerHTML = "<b>W E B C A L L</b><br>"+singleButtonReadyText;
				// this is a long pause
			},9000);
		},700);
		return;
	}

	dialButton.disabled = false;
	hangupButton.disabled = true;
	audioSelect.disabled = false;
	if(!calleeID.startsWith("random") && !calleeID.startsWith("answie") && !neverAudio) {
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
	}

	// calleeOfflineAction: check if calleeID can be notified - random become callee
	calleeOfflineAction();
}

function calleeOnlineAction(from) {
	if(!gentle) console.log('calleeOnlineAction from/dialAfterCalleeOnline',from,dialAfterCalleeOnline);
	if(!busySignalSound) {
		if(!gentle) console.log('loading audio files');
		busySignalSound = new Audio('busy-signal.mp3');
		notificationSound = new Audio("notification.mp3");
		if(playDialSounds) {
			dtmfDialingSound = new Audio('dialtone-plus-dtmf-dialing.mp3');
			dialToneAfterDialingSound = new Audio('dial-tone-after-dialing.mp3');
		}
	}

	// switch to callee-is-online layout
	calleeOnlineElement.style.display = "block";
	if(!singlebutton) {
		calleeOfflineElement.style.display = "none";
	}

	// now that we know callee is online, we lazy load adapter-latest.js
	loadJS("adapter-latest.js",function(){
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

		if(calleeID.startsWith("random")) {
			// random callers don't manually click call button - they autoconnect
			console.log('calleeOnlineAction autodial enumerateDevices');
			navigator.mediaDevices.enumerateDevices().then(gotDevices);
			if(!gentle) console.log('calleeOnlineAction autodial dialAfterCalleeOnline');
			dialAfterCalleeOnline = true;
		}
		if(dialAfterCalleeOnline) {
			// autodial after detected callee is online
			// normally set by gotStream, if dialAfterLocalStream was set (by dialButton.onclick)
			dialAfterCalleeOnline = false;
			if(localStream || neverAudio) {
				connectSignaling("",dial);
			} else {
				console.log('calleeOnlineAction dialAfterLocalStream');
				dialAfterLocalStream = true;
				getStream().then(() => navigator.mediaDevices.enumerateDevices()).then(gotDevices);
				// also -> gotStream -> connectSignalling
			}
		} else {
			// no autodial after we detected callee is online
			getStream().then(() => navigator.mediaDevices.enumerateDevices()).then(gotDevices);

			// so we display a message to prepare the caller hitting the call button manually
			if(calleeID.startsWith("answie"))  {
				if(!singlebutton) {
					msgbox.style.display = "none";
				}
				showStatus("You are about to call a WebCall answering machine.",-1);
			} else if(calleeID.startsWith("!")) {
				showStatus("Hit the Call button to establish a telephony connection.",-1);
			} else {
				if(!singlebutton) {
					showStatus( "Before you hit the Call button, you can enter a name "+
								"or a topic for the convenience of the callee. Thank you.",-1)
					msgbox.style.display = "block";
					console.log('callerName',callerName);
					if(typeof callerName!=="undefined" && callerName!="") {
						msgbox.value = "Hi, this is "+callerName;
					}
					let placeholderText = "";
					msgbox.onfocus = function() {
						placeholderText = msgbox.placeholder;
						msgbox.placeholder = "";
					};
					msgbox.onblur = function() {
						// caller leaving the msgbox
						msgbox.placeholder = placeholderText;
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
		//if(!gentle) console.log('loadJS %s was already loaded',jsFile);
		callback();
		return;
	}
	if(loadJsBusy>0) {
		setTimeout(function() {
			//if(!gentle) console.log('loadJS %s retry',jsFile);
			loadJS(jsFile,callback);
		},100);
		return;
	}

	loadJsBusy++;
	if(!gentle) console.log('loadJS %s ...',jsFile);
	var script = document.createElement('script');
	script.setAttribute('src', jsFile);
	script.setAttribute('type', 'text/javascript');
	var loaded = false;
	var loadFunction = function () {
		if(!loaded) {
			loaded = true;
			loadedJsMap.set(jsFile,true);
			if(!gentle) console.log('loadJS loaded %s',jsFile);
			callback();
		}
		loadJsBusy--;
	};
	script.onload = loadFunction;
	script.onreadystatechange = loadFunction;
	document.getElementsByTagName("head")[0].appendChild(script);
}

function calleeOfflineAction() {
	if(calleeID.startsWith("random")) {
		window.location.replace("/callee/"+calleeID);
		return;
	}

	if(!singlebutton) {
		// switch to callee-is-offline layout
		if(!gentle) console.log('calleeOfflineAction !singlebutton callee-is-offline');
		calleeOnlineElement.style.display = "none";
		calleeOfflineElement.style.display = "block";

		// calleeID is currently offline - check if calleeID can be notified (via twitter msg)
		let api = apiPath+"/canbenotified?id="+calleeID;
		if(!gentle) console.log('canbenotified api',api);
		xhrTimeout = 30*1000;
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			if(xhr.responseText.startsWith("ok")) {
				// calleeID can be notified (via twitter)
				// if caller is willing to wait, caller can invoke confirmNotifyConnect() to enter own name
				calleeName = xhr.responseText.substring(3);
				if(typeof callerName=="undefined") {
					callerName = "";
				}
				if(calleeName=="" || calleeName.length<3) {
					calleeName = calleeID;
				}
				var msg = calleeName+" is currently not online.<br><br>"+
					"We can try to get "+calleeName+" on the phone. Can you wait a few minutes while we try to establish a connection?<br><br><a onclick='confirmNotifyConnect()'>Yes, please try</a><br><br><a href='..'>No, I have to go</a>";
				showStatus(msg,-1);
				return;
			}
			// calleeID can NOT be notified
			var msg = calleeID+" is not online at this time. Please try again a little later.";
			showStatus(msg,-1);
		}, // xhr error
			errorAction
		// TODO errorAction will switch back; if we don't want this we should handle err like in notifyConnect()
		);
	}

	if(!gentle) console.log('calleeOfflineAction done');
}

// not for singlebutton
var calleeName = "";
var confirmValue = "";
var confirmWord = "123";
var confirmXhrNickname = false;
function confirmNotifyConnect() {
	// offer caller to enter own name and ask to confirm with a specific word ("yes")
	// using a form with two text fields
	//console.log('confirmNotifyConnect callerName',callerName);

	// TODO change confirmWord randomly

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
					console.log('callerName',callerName);
				}
			}
			confirmNotifyConnect();
		}, function(errString,err) {
			console.log('xhr error',errString);
			confirmNotifyConnect();
		});
		return;
	}

	var msg = `
	About to get `+calleeName+` on the phone.<br>
	<form action="javascript:;" onsubmit="confirmNotifyConnect2(this)" style="max-width:550px;" id="confirmNotify">

	<label for="nickname" style="display:inline-block; padding-bottom:4px;">Please enter your first name:</label><br>
	<input name="nickname" id="nickname" type="text" class="formtext" maxlength="25" value="`+callerName+`" autofocus required>
	<span onclick="clearForm(0)" style="margin-left:5px; user-select:none;">X</span><br>
	<br>

	<label for="callerID" style="display:inline-block; padding-bottom:4px;">Please enter your WebCall ID (optional):</label><br>
	<input name="callerID" id="callerID" type="text" class="formtext" maxlength="25" value="`+callerId+`">
	<span onclick="clearForm(1)" style="margin-left:5px; user-select:none;">X</span><br>
	<br>

	<label for="confirm" style="display:inline-block; padding-bottom:4px;">Please enter '`+confirmWord+`' to continue:</label><br>
	<input name="confirm" id="confirm" type="text" class="formtext" maxlength="3" value="`+confirmValue+`">
	<span onclick="clearForm(2)" style="margin-left:5px; user-select:none;">X</span><br>

	<input type="submit" name="Submit" id="submit" value="Start" style="width:100px; margin-top:26px;">
	</form>
`;
	showStatus(msg,-1);

	setTimeout(function() {
		var formNickname = document.querySelector('input#nickname');
		formNickname.focus();
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
	} else {
		var formConfirm = document.querySelector('input#confirm');
		formConfirm.value = "";
		formConfirm.focus();
	}
}

// not for singlebutton
function confirmNotifyConnect2() {
	callerName = document.getElementById("nickname").value;
	callerId = document.getElementById("callerID").value;
	confirmValue = document.getElementById("confirm").value;
	// if confirmValue == confirmWord -> notifyConnect()
	//                           else -> confirmNotifyConnect()
	if(confirmValue != confirmWord) {
		confirmNotifyConnect();
		return;
	}
	// make sure callerName is not longer than 25 chars and is alphanumeric only (plus space)
	callerName = callerName.replace(/[^a-zA-Z0-9 ]/g, "");
	if(callerName.length>25) {
		callerName = callerName.substring(0,25);
	}
	callerId = callerId.replace(/[^a-zA-Z0-9 ]/g, "");
	if(callerId.length>10) {
		callerId = callerName.substring(0,10);
	}
	notifyConnect(callerName,callerId);
}

// not for singlebutton
function notifyConnect(callerName,callerId) {
	showStatus("Trying to get "+calleeID+" on the phone now. Please wait...<br><br><img src='preloader-circles.svg' style='width:95%;max-height:450px;margin-top:-20%;'>",-1);

	// extend xhr timeout
	xhrTimeout = 600*1000; // 10 min
	let api = apiPath+"/notifyCallee?id="+calleeID+"&callerName="+callerName+"&callerId="+callerId;
	if(!gentle) console.log('notifyCallee api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(xhr.responseText=="ok") {
			if(!gentle) console.log('callee is now online. switching to call layout.');
			// switch to callee-is-online layout
			calleeOnlineElement.style.display = "block";
			calleeOfflineElement.style.display = "none";
			// auto-click on call button
			dialButton.click();
			return;
		}
		if(!gentle) console.log('callee could not be reached');
		showStatus("Sorry! I was not able to reach "+calleeID+".<br>Please try again a little later.",-1);
	}, function(errString,errcode) {
		//errorAction(errString)
		if(!gentle) console.log('callee could not be reached. xhr err',errString,errcode);
		showStatus("Sorry! I was not able to reach "+calleeID+".<br>Please try again a little later.",-1);
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

var xhrTimeout = 30000;
function ajaxFetch(xhr, type, api, processData, errorFkt) {
	xhr.onreadystatechange = function() {
		if(xhr.readyState == 4 && (xhr.status==200 || xhr.status==0)) {
			processData(xhr);
		} else if(xhr.readyState==4) {
			errorFkt("fetch error",xhr.status);
		}
	}
	//if(!gentle) console.log('ajaxFetch xhrTimeout',xhrTimeout);
	xhr.timeout = xhrTimeout;
	xhr.ontimeout = function () {
		errorFkt("timeout",0);
	}
	xhr.onerror= function(e) {
		errorFkt("fetching",xhr.status);
	};
	//if(!gentle) console.log('xhr send',api);
	xhr.open(type, api, true);
	xhr.setRequestHeader("Content-type", "text/plain; charset=utf-8");
	xhr.send();
}

function getStream() {
	if(neverAudio) {
		if(dialAfterLocalStream) {
			dialAfterLocalStream=false;
			console.log("getStream -> dialAfterCalleeOnline");
			//dialAfterCalleeOnline = true;
			//checkCalleeOnline();
			gotStream(); // pretend
		}
		return
	}

	if(localStream) {
		localStream.getTracks().forEach(track => { track.stop(); });
	}

	let supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
	if(!gentle) console.log('getStream supportedConstraints',supportedConstraints);

	const audioSource = audioSelect.value;
	const constraints = {
		audio: {
			deviceId: audioSource ? {exact: audioSource} : undefined,
			noiseSuppression: true,  // true by default
			echoCancellation: true,  // true by default
			autoGainControl: false,
		}
	};
	if(!gentle) console.log('getStream getUserMedia',constraints,audioSource);
	return navigator.mediaDevices.getUserMedia(constraints)
		.then(gotStream)
		.catch(function(err) {
			// "Permissions policy violation: microphone is not allowed in this document"
			// "DOMException: Permission denied"
			// this happens for example if caller.js is invoked from a http:// context
			// in singlebutton mode the button gets stuck in "Connecting..." state
			// so we hide the buttons here
			// TODO but we still need to message the client (via alert()?)
			dialButton.style.display = "none";
			hangupButton.style.display = "none";
			console.error('no audio input device found', err);
			if(singlebutton) {
				alert("No audio input device found\n"+err);
			} else {
				showStatus("No audio input device found<br>"+err,-1);
			}
		});
}

function gotDevices(deviceInfos) {
	if(!gentle) console.log('gotDevices',deviceInfos);
	for(const deviceInfo of deviceInfos) {
		const option = document.createElement('option');
		option.value = deviceInfo.deviceId;
		if(deviceInfo.kind === 'audioinput') {
			let deviceInfoLabel = deviceInfo.label;
			if(!gentle) console.log('gotDevices deviceInfoLabel',deviceInfoLabel);
			if(deviceInfoLabel=="Default") {
				deviceInfoLabel="Default Audio Input";
			}
			option.text = deviceInfoLabel || `Microphone ${audioSelect.length + 1}`;
			var exists=false
			var length = audioSelect.options.length;
			for(var i = length-1; i >= 0; i--) {
				if(audioSelect.options[i].text == option.text) {
					exists=true; // don't add again
					break;
				}
			}
			if(!exists) {
				audioSelect.appendChild(option);
			}
			//console.log('audioinput',option);
		} else if (deviceInfo.kind === 'videoinput') {
			// ignore
		} else if (deviceInfo.kind === "audioouput") {
			// ignore
		}
	}
}

function gotStream(stream) {
	if(!gentle) console.log('gotStream -> set localStream',
		stream.getAudioTracks()[0].label);
	localStream = stream;
	audioSelect.selectedIndex = [...audioSelect.options].
		findIndex(option => option.text === stream.getAudioTracks()[0].label);
//	if(audioSelect.selectedIndex<0) {
//		audioSelect.selectedIndex = 0; // TODO this doesn't seem to work
//	}
	if(!gentle) {
		console.log('gotStream selectedIndex',audioSelect.selectedIndex);
		stream.getTracks().forEach(function(track) {
			console.log("gotStream track.getSettings",track.getSettings());
	    })
	}

	if(dialAfterLocalStream) {
		console.log("gotStream dialAfterLocalStream");
		dialAfterLocalStream=false;
		if(calleeID.startsWith("answie")) {
			// disable local mic for answie client
			localStream.getTracks().forEach(track => { track.stop(); });
		}
		//dialAfterCalleeOnline = true;
		//checkCalleeOnline();
		connectSignaling("",dial);
	} else if(localStream) {
		// disable local mic until we start dialing
		localStream.getTracks().forEach(track => { track.stop(); });
		const audioTracks = localStream.getAudioTracks();
		localStream.removeTrack(audioTracks[0]);
		localStream = null;
	}
}

let rtcLink="";
let localCandidateType = "";
let remoteCandidateType = "";
function getStatsCandidateTypes(results,eventString1,eventString2) {
	if(!gentle) console.log('getStatsCandidateTypes');
	rtcLink = "unknown";
	let localCandidateId = "";
	let remoteCandidateId = "";
	localCandidateType = "";
	remoteCandidateType = "";
	results.forEach(res => {
		if(res.type=="candidate-pair") {
			if(/*res.nominated && res.writable && res.state=="succeeded" &&*/ res.selected) {
				localCandidateId = res.localCandidateId;
				remoteCandidateId = res.remoteCandidateId;
				if(!gentle)
					console.log("getStatsCandidateTypes 1st",
						localCandidateId,remoteCandidateId);
			}
		}
	});
	if(!gentle)
		console.log("getStatsCandidateTypes candidateId's A",
			localCandidateId,remoteCandidateId);
	if(localCandidateId=="" || remoteCandidateId=="") {
		// for chrome
		results.forEach(res => {
			if(res.type=="transport" && res.selectedCandidatePairId!="") {
				let selectedCandidatePairId = res.selectedCandidatePairId;
				if(!gentle)
					console.log('getStatsCandidateTypes PairId',selectedCandidatePairId);
				results.forEach(res => {
					if(res.id==selectedCandidatePairId) {
						localCandidateId = res.localCandidateId;
						remoteCandidateId = res.remoteCandidateId
						if(!gentle)
							console.log("getStatsCandidateTypes 2nd",
								localCandidateId,remoteCandidateId);
					}
				});
			}
		});
	}

	if(!gentle)
		console.log("getStatsCandidateTypes candidateId's B",
			localCandidateId,remoteCandidateId);
	if(localCandidateId!="") {
		results.forEach(res => {
			if(res.id==localCandidateId) {
				Object.keys(res).forEach(k => {
					if(k=="candidateType") {
						localCandidateType = res[k];
					}
				});
			} else if(res.id==remoteCandidateId) {
				Object.keys(res).forEach(k => {
					if(k=="candidateType") {
						remoteCandidateType = res[k];
					}
				});
			}
		});
	}

	let localType = "";
	if(localCandidateType=="") {
		localType = "unknw";
	} else if(localCandidateType=="relay") {
		localType = "relay";
	} else {
		localType = "p2p";
	}
	let remoteType = "";
	if(remoteCandidateType=="") {
		remoteType = "unknw";
	} else if(remoteCandidateType=="relay") {
		remoteType = "relay";
	} else {
		remoteType = "p2p";
	}
	rtcLink = localType+"/"+remoteType;

	console.log('getStatsCandidateTypes',rtcLink);
	var url = (window.location != window.parent.location)
		    ? document.referrer : document.location.href;
	let msg = eventString1+" "+rtcLink;
	wsSend("log|caller "+msg);

	if(eventString2!="") {
		msg += ". "+eventString2+".";
	}

	if(otherUA!="" && !calleeID.startsWith("answie")) {
		msg += "<div style='font-size:0.8em;margin-top:10px;color:#aac;'>"+otherUA+"</div>";
	}
	showStatus(msg,-1);
}

var statsPostCallString = "";
var statsPostCallDurationMS = 0;
function getStatsPostCall(results) {
	if(!gentle) console.log('getStatsPostCall start');
	// RTCInboundRTPAudioStream "inbound-rtp" https://www.w3.org/TR/webrtc-stats/#dom-rtcinboundrtpstreamstats
	// RTCOutboundRTPAudioStream "outbound-rtp" https://www.w3.org/TR/webrtc-stats/#dom-rtcoutboundrtpstreamstats
	// RTCAudioReceiverStats "receiver" 
	let timeNowMs = Date.now(),
		durationRtcMS = timeNowMs - rtcConnectStartDate,
		bytesReceived = 0,
		bytesSent = 0,
		packetsReceived = 0,
		packetsSent = 0,
		packetsLost = 0,
		jitter = 0,
		jitterBufferDelay = 0,
		retransmittedPacketsSent = 0,
		roundTripTime = 0;

	statsPostCallDurationMS = timeNowMs - mediaConnectStartDate;
	if(mediaConnectStartDate==0) {
		statsPostCallDurationMS = 0;
	}
	if(rtcConnectStartDate==0) {
		if(!gentle) console.log('getStatsPostCall rtcConnectStartDate==0');
		durationRtcMS = 0;
	}
		
	results.forEach(res => {
		if(res.type=="inbound-rtp") {
			bytesReceived = res.bytesReceived;
			packetsReceived = res.packetsReceived;
			packetsLost = res.packetsLost;
			jitter = res.jitter;
			jitterBufferDelay = res.jitterBufferDelay;
			//console.log("getStatsPostCall inbound-rtp",res);
		} else if(res.type=="outbound-rtp") {
			bytesSent = res.bytesSent;
			packetsSent = res.packetsSent;
			retransmittedPacketsSent = res.retransmittedPacketsSent;
			//console.log("getStatsPostCall outbound-rtp",res);
		} else if(res.type=="remote-inbound-rtp") {
			roundTripTime = res.roundTripTime;
			//console.log("getStatsPostCall remote-inbound-rtp",res);
		} else if(res.type=="remote-outbound-rtp") {
			//console.log("getStatsPostCall remote-outbound-rtp",res);
		} else {
			//if(!gentle) console.log("getStatsPostCall type",res.type);
		}
	});
	let durationSecs = Math.floor((statsPostCallDurationMS+500)/1000);
	if(isNaN(durationSecs)) { durationSecs = 0; }
	let durationRtcSecs = Math.floor((durationRtcMS+500)/1000);
	//if(!gentle) console.log("getStatsPostCall durationMS",statsPostCallDurationMS,durationSecs,durationRtcSecs);

	let bitsReceivedPerSec = 0;
	if(statsPostCallDurationMS>0) {
		bitsReceivedPerSec = Math.floor(bytesReceived*8000/statsPostCallDurationMS);
	}
	if(isNaN(bitsReceivedPerSec)) { bitsReceivedPerSec = 0; }
	//if(!gentle) console.log("getStatsPostCall bitsReceivedPerSec",bitsReceivedPerSec);

	let bitsSentPerSec = 0;
	if(durationRtcMS>0) {
		bitsSentPerSec = Math.floor(bytesSent*8000/durationRtcMS);
	}
	//if(!gentle) console.log("getStatsPostCall bitsSentPerSec",bitsSentPerSec);

	statsPostCallString =
		"call duration: "+durationSecs+"s\n"+
		"sent bytes: "+bytesSent+"\n"+
		"sent bitrate: "+bitsSentPerSec+" bps\n"+
		"sent packets: "+packetsSent+"\n"+
		"packetsLost: "+packetsLost+"\n"+
		"jitter: "+jitter+"\n"+
		"jitterBufferDelay: "+jitterBufferDelay+"\n"+
		"received bytes: "+bytesReceived+"\n"+
		"received bitrate: "+bitsReceivedPerSec+" bps\n"+
		"received packets: "+packetsReceived+"\n"+
		"retransmittedPacketsSent: "+retransmittedPacketsSent+"\n"+
		"roundTripTime: "+roundTripTime+"\n"+
		"connection: "+rtcLink+"\n";
	console.log("statsPostCall",statsPostCallString);
}

function showStatsPostCall() {
	let myStatsPostCallString = statsPostCallString.replaceAll("\n","<br>");
	if(!singlebutton) {
		postCallStatsElement.style.display = "none";
	}
	showStatus(myStatsPostCallString,-1);
	statsPostCallString = "";
}

function connectSignaling(message,openedFunc) {
	if(!window["WebSocket"]) {
		console.error('connectSignaling: no WebSocket support');
		showStatus("No WebSocket support");
		return;
	}
	if(!gentle) console.log('connectSignaling: open ws connection',calleeID);
	let tryingToOpenWebSocket = true;
    var wsUrl = wsAddr;
	wsConn = new WebSocket(wsUrl);
	wsConn.onopen = function () {
		if(!gentle) console.log('ws connection open',calleeID);
		tryingToOpenWebSocket = false;
		if(message!="") {
			wsSend(message); // most likely "callerDescription"
			console.log('ws message sent');
		}
		if(openedFunc) {
			openedFunc();
		}
	};
	wsConn.onmessage = function (evt) {
		var messages = evt.data.split('\n');
		for (var i = 0; i < messages.length; i++) {
			let tok = messages[i].split("|");
			if(tok.length==2) {
				let cmd = tok[0];
				let payload = tok[1];

				if(cmd=="calleeDescription") {
					if(!peerCon) {
						console.warn('calleeDescription abort no peerCon');
						continue;
					}
					hostDescription = JSON.parse(payload);

					console.log("cmd calleeDescription setLocalDescription");
					peerCon.setLocalDescription(localDescription).then(() => {
						console.log('cmd hostDescription setRemoteDescription');
						peerCon.setRemoteDescription(hostDescription).then(() => {
							console.log('cmd hostDescription setRemoteDescription done');
						}, err => {
							console.warn(`hostDescription Failed to set RemoteDescription`,err)
							showStatus("Cannot set remoteDescr "+err);
						});
					}, err => {
						console.warn("hostDescription setLocalDescription fail",err)
						showStatus("Cannot set localDescr"+err);
					});

				} else if(cmd=="calleeDescriptionUpd") {
					hostDescription = JSON.parse(payload);
					console.log('cmd calleeDescriptionUpd setRemoteDescription');
					peerCon.setRemoteDescription(hostDescription).then(() => {
						console.log('cmd calleeDescriptionUpd setRemoteDescription done');

						if(hostDescription.type == "offer") {
							console.log('cmd calleeDescriptionUpd received offer createAnswer');
							peerCon.createAnswer().then((desc) => {
								localDescription = desc;
								console.log('calleeDescriptionUpd got localDescription');
								localDescription.sdp =
									maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
								localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
									'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
								peerCon.setLocalDescription(localDescription).then(() => {
									console.log('calleeDescriptionUpd localDescription set -> signal');
									wsSend("callerDescriptionUpd|"+JSON.stringify(localDescription));
								}, err => console.error(`Failed to set local descr: ${err.toString()}`));
							}, err => {
								console.warn(`Failed to createAnswer`,err)
								showStatus("Failed to createAnswer",8000);
							});
						} else {
							console.log('cmd calleeDescriptionUpd received no offer');
						}

					}, err => {
						console.warn(`calleeDescriptionUpd failed to setRemoteDescription`,err)
						showStatus("Cannot set remoteDescr "+err);
					});

				} else if(cmd=="calleeCandidate") {
					if(!peerCon) {
						console.warn('cmd calleeCandidate abort no peerCon');
						hangupWithBusySound(true,"calleeCandidate lost peerCon");
						break;
					}
					var calleeCandidate = JSON.parse(payload);
					// fix for: AddIceCandidate fail OperationError: Unknown ufrag
					// see: https://stackoverflow.com/questions/61292934/webrtc-operationerror-unknown-ufrag
					calleeCandidate.usernameFragment = null;

					var addIceCalleeCandidate = function(calleeCandidate) {
						if(calleeCandidate.candidate==null) {
							if(!gentle) console.warn('calleeCandidate.candidate==null');
							return
						}

						if(!gentle) console.log('calleeCandidate.candidate',calleeCandidate.candidate);
						if(!gentle) console.log('calleeCandidate',calleeCandidate);

						let tok = calleeCandidate.candidate.split(' ');
						if(tok.length>=5) {
							//console.log('addIceCandidate calleeCandidate',calleeCandidate);
							let address = tok[4];
							if(tok.length>=10 && tok[8]=="raddr" && tok[9]!="0.0.0.0") {
								address = tok[9];
							}
							if(!gentle)
								console.log('cmd calleeCandidate addIce',address,calleeCandidate.candidate);
							// "Failed to execute 'addIceCandidate' on 'RTCPeerConnection'"
							// may happen if peerCon.setRemoteDescription is not finished yet
							if(!peerCon) {
								console.warn('cmd calleeCandidate abort no peerCon');
								return;
							}
							if(!peerCon.remoteDescription) {
								// this happens bc setRemoteDescription may take a while
								console.log("cmd calleeCandidate !peerCon.remoteDescription",
									calleeCandidate.candidate);
								setTimeout(addIceCalleeCandidate,100,calleeCandidate);
								return;
							}
							if(!peerCon.remoteDescription.type) {
								console.log("cmd calleeCandidate !peerCon.remoteDescription.type",
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
					console.log('cmd pickup');
					if(rtcConnect) {
						console.log('callee is answering our call');
						stopAllAudioEffects();

						if(!singlebutton) {
							msgbox.style.display = "none";
						}

						if(!localStream && !neverAudio) {
							console.warn("cmd pickup no localStream");
							// I see this when I quickly re-dial while busy signal of last call is still playing
							// TODO button may now continue to show "Connecting..."
							// but connection is still established (at least when calling answie)
							//tmtmtm test:
							hangupWithBusySound(true,"pickup with no localStream");
							return;
						}
						if(!remoteStream) {
							hangupWithBusySound(true,"pickup with no remoteStream");
							return;
						}

						let micStatus = "";
						if(singlebutton) {
							hangupButton.innerHTML = singleButtonConnectedText;
							hangupButton.style.boxShadow = "0px 0px 10px #f00";
							hangupButton.style.background = 'url("")'; 
							dialButton.style.backgroundColor = "";
							hangupButton.style.backgroundColor = "";
						} else {
							if(!calleeID.startsWith("answie") && !neverAudio) {
								onlineIndicator.src="red-gradient.svg";
								micStatus = "Mic is open";
							} else {
								// when calling answie, we don't open the local mic
								dialButton.style.boxShadow = "";
								onlineIndicator.src="green-gradient.svg";
								//msgbox.style.display = "none";
							}
						}

						// enable (un-mute) remote audio
						console.log('set remoteAudio',remoteStream);
						remoteAudio.srcObject = remoteStream; // see 'peerCon.ontrack onunmute'
						remoteAudio.load();
						remoteAudio.play().catch(function(error) {});
						mediaConnect = true;
						mediaConnectStartDate = Date.now();

						// getting stats on p2p or relayed connection
						console.log('full mediaConnect, getting stats...');
						peerCon.getStats(null)
							.then((results) => getStatsCandidateTypes(results,"Connected",micStatus),
							err => console.log(err));

						onnegotiationneededAllowed = true;
					} else {
						if(!gentle) console.warn('cmd pickup without rtcConnect; ignored');
					}

				} else if(cmd=="cancel") {
					if(payload!="c") {
						// this is coming from the callee
						console.log('callee hang up');
						showStatus("Callee ended call",8000);
						if(wsConn!=null) {
							wsConn.close();
							// wsConn=null prevents hangup() from generating a return cancel msg
							wsConn=null;
						}
						hangupWithBusySound(false,"Peer hang up");
					} else {
						console.log("ignore cancel",payload);
					}

				} else if(cmd=="sessionDuration") {
					// the longest possible duration
					sessionDuration = parseInt(payload);
					if(!gentle) console.log('sessionDuration',sessionDuration,mediaConnect,timerStartDate);
					if(localCandidateType!="relay" && remoteCandidateType!="relay") {
						// no timer
					} else if(mediaConnect) {
						if(!timerStartDate) {
							if(sessionDuration>0 && !calleeID.startsWith("answie")) {
								startTimer(sessionDuration);
							}
						}
					}
				} else if(cmd=="ua") {
					otherUA = payload;
					console.log("otherUA",otherUA);

				} else if(cmd=="callerDescription" || cmd=="callerCandidate" || "callerInfo" ||
						cmd=="stop" || cmd=="ping" || cmd=="rtcConnect" || cmd=="callerDescriptionUpd") {
					// skip noise
				} else {
					console.warn('ignore incom cmd',cmd);
				}
			} else {
				console.warn('ws message len/tok.length',messages[i].length,tok.length);
			}
		}
	};
	wsConn.onerror = function(evt) {
		console.error("wsConn.onerror");
		showStatus("Websocket error");
	}
	wsConn.onclose = function (evt) {
		if(tryingToOpenWebSocket) {
			// onclose before a ws-connection could be established
			tryingToOpenWebSocket = false;
			console.log('ws close: failed to open');
			showStatus("No signaling server");
			hangupWithBusySound(false,"Busy")
		} else {
			// onclose after a ws-connection has been established
			// most likey the callee is busy
			console.log('ws close: disconnect');
			//if(mediaConnect) {
			//	showStatus("Signaling server disconnected");
			//}
		}
		wsConn=null;
	};
}

function wsSend(message) {
	if(wsConn==null || wsConn.readyState!=1) {
		connectSignaling(message,null);
	} else {
		wsConn.send(message);
	}
}

let timerStartDate=0;
let timerIntervalID=0;
let countDownSecs;
function startTimer(startDuration) {
	if(!timerStartDate && startDuration>0) {
		if(!gentle) console.log('startTimer',startDuration);
		timerElement.style.opacity = "0.5";
		timerStartDate = Date.now();
		updateClock(startDuration);
		timerIntervalID = setInterval(updateClock, 999, startDuration);
	}
}
function stopTimer() {
	timerStartDate = null
	if(timerIntervalID && timerIntervalID>0) {
		if(!gentle) console.log('stopTimer');
		clearInterval(timerIntervalID);
		timerIntervalID=0;
		timerElement.style.opacity = "0";
		return;
	}
	//console.log('stopTimer no timer defined');
}
function updateClock(startDuration) {
	let sinceStartSecs = Math.floor((Date.now() - timerStartDate + 500)/1000);
	countDownSecs = startDuration - sinceStartSecs;
	if(countDownSecs<=0) {
		countDownSecs=0;
	}
	if(countDownSecs==60 || countDownSecs==30 || countDownSecs==15) {
		notificationSound.play().catch(function(error) { });
	}
	if(timerElement!=null) {
		let timerMin = Math.floor(countDownSecs/60);
		let timerSec = countDownSecs - timerMin*60;
		let timerSecStr = ""+timerSec;
		if(timerSec<10) {
			timerSecStr = "0"+timerSecStr;
		}
		timerElement.innerHTML = ""+timerMin+":"+timerSecStr;
	}
	if(countDownSecs<=0) {
		if(!gentle) console.log('updateClock countDownSecs<=0 stopTimer',countDownSecs);
		stopTimer();
	}
}

function showStatus(msg,timeoutMs) {
	//if(!gentle) console.log('showStatus(%s)',msg);
	if(!singlebutton) {
		let sleepMs = 2500;
		if(typeof timeoutMs!=="undefined") {
			sleepMs = timeoutMs;
		}
		statusLine.style.display = "none";
		statusLine.innerHTML = msg;
		statusLine.style.opacity = 1.0;
		statusLine.style.display = "block";
		if(msg!="" && sleepMs>=0) {
			setTimeout(function(oldMsg) {
				if(statusLine.innerHTML==oldMsg) {
					statusLine.style.opacity = 0;
				}
			},sleepMs,msg);
		}
	}
}

let dialDate;
function dial() {
	if(!localStream && !neverAudio) {
		console.log('abort dial localStream not set');
		showStatus("abort no localStream");
		// tmtmtm test:
		hangupWithBusySound(true,"pickup with no localStream");
		return;
	}
	showStatus(connectingText,-1);
	otherUA = "";
	dialing = true;
	rtcConnect = false;
	mediaConnect = false;
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
	console.log('start dialing');
	setTimeout(function(lastDialDate) {
		if(dialDate==lastDialDate) {
			if(!rtcConnect) {
				if(!doneHangup) {
					// no rtcConnect after 20s: give up dial-waiting
					console.log("dialing timeout, giving up on call",candidateResultString);
					hangupWithBusySound(true,"Failed to connect "+candidateResultString);
				}
			} else {
				//console.log("dialing timeout reached after rtcConnect, ignore");
				if(!mediaConnect) {
					showStatus(ringingText,-1);
				}
			}
		}
	},20000,dialDate);

	var ICE_config= {
		"iceServers": [
			{	'urls': 'stun:'+window.location.hostname+':3739' },
			{	'urls': 'turn:'+window.location.hostname+':3739',
				'username': 'c807ec29df3c9ff',
				'credential': '736518fb4232d44'
			}
		]
	};
	//console.warn("ICE_config",ICE_config);
	try {
		peerCon = new RTCPeerConnection(ICE_config);
	} catch(ex) {
		console.error("RTCPeerConnection",ex);
		showStatus("Dialing error");
		return
	};
	peerCon.onicecandidate = e => onIceCandidate(e);
	peerCon.onicecandidateerror = function(e) {
		if(!gentle) console.warn("onicecandidateerror", e.errorCode, e.errorText, e.url);
		// for instance: "Unauthorized turn:..."
		// or            "701 STUN host lookup received error."
	}
	peerCon.ontrack = ({track, streams}) => {
		// once media for a remote track arrives, connect it to the remoteAudio element
		console.log('peerCon.ontrack');
		track.onunmute = () => {
			// TODO remoteAudio undefined
			if(remoteAudio.srcObject == streams[0]) {
				console.warn('peerCon.ontrack onunmute was already set');
				return;
			}
			if(!gentle) console.log('peerCon.ontrack onunmute set remoteAudio.srcObject',streams[0]);
			//remoteAudio.srcObject = streams[0];
			//remoteAudio.load();
			//remoteAudio.play().catch(function(error) {});
			remoteStream = streams[0];
		};
	};

	peerCon.onnegotiationneeded = async () => {
		if(!peerCon) {
			if(!gentle) console.log('onnegotiationneeded no peerCon');
			return;
		}
		if(!onnegotiationneededAllowed) {
			if(!gentle) console.log('onnegotiationneeded not allowed');
			return;
		}
		if(!gentle) console.log('onnegotiationneeded');
		try {
			// note: this will trigger onIceCandidates and send calleeCandidate's to the client
			console.log("onnegotiationneeded createOffer");
			localDescription = await peerCon.createOffer();
			localDescription.sdp = maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
			localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
				'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
			peerCon.setLocalDescription(localDescription).then(() => {
				console.log('onnegotiationneeded localDescription set -> signal');
				wsSend("callerDescriptionUpd|"+JSON.stringify(localDescription));
			}, err => console.error(`Failed to set local descr: ${err.toString()}`));
		} catch(err) {
			console.error("onnegotiationneeded err",err);
		}
	};

	/* TODO
	peerCon.processSdp = function(sdp) {
		return sdp; // return unchanged SDP
	};
	peerCon.optionalArgument = {}; // ignore all DTLS/ipv6 parameters
	*/

	peerCon.onicegatheringstatechange = event => {
		let connection = event.target;
		console.log("onicegatheringstatechange", connection.iceGatheringState);
	}
	peerCon.onsignalingstatechange = event => {
		if(!gentle) console.log("onsignalingstate", peerCon.signalingState);
	}
	peerCon.oniceconnectionstatechange = event => {
		if(!gentle) console.log("oniceconnectionstate", peerCon.iceConnectionState);
	}
	peerCon.onconnectionstatechange = event => {
		if(!peerCon) {
			hangupWithBusySound(true,"Peer disconnected");
			return;
		}
		console.log("onconnectionstate", peerCon.connectionState);
		if(peerCon.connectionState=="disconnected") {
			hangupWithBusySound(true,"Peer disconnected");
			return;
		} else if(peerCon.connectionState=="failed") {
			hangupWithBusySound(true,"Peer connection failed "+candidateResultString);
			return;
		} else if(peerCon.connectionState=="connecting") {
			// if we see this despite being mediaConnect already, it is caused by createDataChannel
			if(!mediaConnect) {
				showStatus(connectingText,-1);
			}
		} else if(peerCon.connectionState=="connected") {
			// if we see this despite being mediaConnect already, it is caused by createDataChannel
			console.log('connected r/m',rtcConnect,mediaConnect);
			if(!rtcConnect && !mediaConnect) {
				// the caller got peer-connected to the callee; callee now starts ringing
				stopAllAudioEffects();
				rtcConnect = true;
				rtcConnectStartDate = Date.now();
				mediaConnectStartDate = 0;

				//peerCon.getStats(null)
				//	.then((results) => getStatsCandidateTypes(results,"Establishing call",""),
				//	err => console.log(err));

				if(!singlebutton) {
					let msgboxText = msgbox.value.substring(0,300);
					console.log('msgboxText',msgboxText);
					if(msgboxText!="") {
						if(dataChannel) {
							if(dataChannel.readyState=="open") {
								console.log('send msgbox',msgboxText);
								dataChannel.send("msg|"+msgboxText);
							} else {
								dataChannelSendMsg = msgboxText;
							}
						} else {
							console.warn('no dataChannel, cannot send msgbox (%s)'+msgboxText);
						}
					}
				}

				if(!mediaConnect) {
					// now we need the callee to cmd="pickup" for mediaConnect to become true
					// play never ending dialTone; until interrupted by pickup or hangup
					if(playDialSounds) {
						var playDialToneAfterDialingSound = function() {
							// abort if wsCon lost
							if(wsConn==null) {
								console.log('abort DialSounds on wsConn==null');
								hangupWithBusySound(false,"Hang up");
								return;
							}
							if(!gentle) console.log('dialToneAfterDialingSound.play()');
							dialToneAfterDialingSound.play().catch(function(error) { });
							dialToneAfterDialingSound.onended = playDialToneAfterDialingSound;
						}
						playDialToneAfterDialingSound();
					}
				}
			}
			dialing = false;
		}
	}
	if(!localStream && !neverAudio) {
		console.log('dial abort localStream not set');
		showStatus("abort no localStream");
		return;
	}

	if(localStream) {
		// add selected local audioTrack (audio input / mic) to peerCon
		// TODO: an exception here leaves the callee hub "connected"
		const audioTracks = localStream.getAudioTracks();
		audioTracks[0].enabled = true; // unmute
		if(!gentle) console.log('dial addTrack',audioTracks[0],localStream);
		peerCon.addTrack(audioTracks[0],localStream);
	}

	createDataChannel();

	console.log('dial peerCon.createOffer');
	peerCon.createOffer().then((desc) => {
		localDescription = desc;
		localDescription.sdp = maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
		localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
			'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
		console.log('got localDescription');
		/*
		if(singlebutton) {
			// switch from dialButton to hangupButton "Connecting..."
			dialButton.style.display = "none";
			hangupButton.style.backgroundColor = "#d33"; // color from button:active
			hangupButton.innerHTML = connectingText;
			hangupButton.style.display = "inline-block";
		} else {
			dialButton.disabled = true;
			hangupButton.disabled = false;
			audioSelect.disabled = true;
		}
		*/
		if(playDialSounds) {
			dtmfDialingSound.play().catch(function(error) {
				console.warn('ex dtmfDialingSound.play',error) });
		}
		setTimeout(function() {
			// we do this delay only to hear the dial tone
			// this check is important bc the caller may have disconnected already
			if(wsConn!=null) {
				console.log('signal callerDescription (outgoing call)');
				wsSend("callerDescription|"+JSON.stringify(localDescription));
			}
		},1500);
	}, err => console.warn(`dial createOffer failed: ${error.toString()}`));
}

function createDataChannel() {
	if(!gentle) console.log('createDataChannel...');
	dataChannel = peerCon.createDataChannel("datachannel");
	dataChannel.onopen = event => {
		if(!gentle)
			console.log("dataChannel.onopen",
				dataChannel.ordered, dataChannel.binaryType,
				dataChannel.reliable, dataChannel.sctp);
		dataChannel.send("ping");
		if(dataChannelSendMsg!="") {
			dataChannel.send("msg|"+dataChannelSendMsg);
			dataChannelSendMsg = "";
		}
	};
	dataChannel.onclose = event => {
		if(!gentle) console.log("dataChannel.onclose");
	}
	dataChannel.onerror = event => {
		if(rtcConnect) {
			console.log("dataChannel.onerror",event);
		}
	}
	dataChannel.onmessage = event => {
		if(!gentle) console.debug("dataChannel.onmessage",event.data);
		if(event.data && event.data.startsWith("disconnect")) {
			console.log("dataChannel.close on 'disconnect'");
			dataChannel.close();
			hangupWithBusySound(false,"Peer hang up");
		}
	}
}

function onIceCandidate(event) {
	var callerCandidate = event.candidate;
	if(callerCandidate==null) {
		// ICE gathering has finished
		if(!gentle) console.log('onIce: end of callerCandidates');
	} else {
		//if(!gentle) console.log("onIce",callerCandidate.candidate);
		//console.log('onIce callerCandidate.address',callerCandidate.address);
		/*if(callerCandidate.address==null) {
			//console.warn('onIce skip callerCandidate.address==null');
		} else*/ if(wsConn==null || wsConn.readyState!=1) {
			console.warn('onIce callerCandidate (%s): wsConn==null (%d) || readyState!=1 (%d)',
				callerCandidate.address, wsConn, readyState);
		} else {
			if(!gentle) console.log('onIce callerCandidate', callerCandidate.address);
			wsSend("callerCandidate|"+JSON.stringify(callerCandidate));
		}
	}
}

function stopAllAudioEffects() {
	if(dtmfDialingSound!=null) {
		dtmfDialingSound.pause();
		dtmfDialingSound.currentTime = 0;
	}
	if(dialToneAfterDialingSound!=null) {
		dialToneAfterDialingSound.pause();
		dialToneAfterDialingSound.currentTime = 0;
	}
	if(busySignalSound!=null) {
		busySignalSound.pause();
		busySignalSound.currentTime = 0;
	}
}

function hangup(mustDisconnectCallee,message) {
	dialing = false;
	remoteStream = null;
	if(doneHangup) {
		return;
	}

	if(!gentle) console.log('hangup '+message, mustDisconnectCallee);
	if(message!="") {
		showStatus(message);
	}

	doneHangup = true;
	mediaConnect = false;
	if(singlebutton) {
		dialButton.style.boxShadow = "";
	} else {
		onlineIndicator.src="";
	}
	rtcConnect = false;
	stopTimer();
	onnegotiationneededAllowed = false;

	setTimeout(function() {
		// TODO not sure about this
		if(!singlebutton) {
			// show msgbox
			msgbox.placeholder = "";
			msgbox.style.display = "block";
		}
		calleeOnlineAction("post-hangup");
	},2000);

	if(localStream!=null) {
		const audioTracks = localStream.getAudioTracks();
		audioTracks[0].enabled = false; // mute mic
		localStream.getTracks().forEach(track => { track.stop(); });
		localStream.removeTrack(audioTracks[0]);
		localStream = null;
	}

	console.log('hangup remoteAudio.pause()');
	remoteAudio.pause();
	remoteAudio.currentTime = 0;
	remoteAudio.srcObject = null;
	localDescription = null;
	if(singlebutton) {
		hangupButton.style.display = "none";
		hangupButton.innerHTML = "Hang up";
		hangupButton.style.boxShadow = "";
		// TODO a transition would be nice
		setTimeout(function() {
			dialButton.innerHTML = "<b>W E B C A L L</b><br>"+singleButtonReadyText;
			dialButton.style.display = "inline-block";
		// 2500ms is about the time it takes for the busy tone to end
		},2500);
	} else {
		hangupButton.disabled = true;
		dialButton.disabled = false;
		onlineIndicator.src="";
	}
	audioSelect.disabled = false;

	if(mustDisconnectCallee) {
		if(wsConn!=null && wsConn.readyState==1) {
			// in case we are still ws-connected (if hangup occurs while still "ringing")
			console.log('hangup wsSend(cancel)');
			wsSend("cancel|c");
		}
	}

	if(peerCon!=null) {
		let peerConCloseFunc = function() {
			const senders = peerCon.getSenders();
			if(senders) {
				try {
					senders.forEach((sender) => { peerCon.removeTrack(sender) })
				} catch(ex) {
					console.warn('hangup removeTrack',ex);
				}
			}
			if(mustDisconnectCallee && (wsConn==null || wsConn.readyState!=1)) {
				// give cmd:hangup some time to be delivered
				setTimeout(function() {
					if(peerCon!=null) {
						if(dataChannel && dataChannel.readyState=="open") {
							console.log('hangup dataChannel.close 1');
							dataChannel.close();
						}
						console.log('hangup peerCon.close 1');
						peerCon.close();
						peerCon = null;
					}
				},300);

			} else if(dataChannel && dataChannel.readyState=="open") {
				console.log('hangup dataChannel.close 2');
				dataChannel.close();
				// in case we get no dataChannel.onclose
				setTimeout(function() {
					if(peerCon!=null) {
						console.log('hangup peerCon.close 2');
						peerCon.close();
						peerCon = null;
					}
				},1500);
			} else {
				console.log('hangup peerCon.close 3',calleeID);
				peerCon.close();
				peerCon = null;
			}
		};
		if(calleeID.startsWith("random") || calleeID.startsWith("answie") || singlebutton) {
			// no StatsPostCall for you
			peerConCloseFunc();
		} else {
			peerCon.getStats(null).then((results) => { 
				getStatsPostCall(results);
				if(statsPostCallString!="" && statsPostCallDurationMS>0) {
					// enable info.svg button onclick -> showStatsPostCall()
					postCallStatsElement.style.display = "inline-block";
				}
				peerConCloseFunc();
			}, err => {
				console.log(err); 
				peerConCloseFunc();
			});
		}
	}
	if(wsConn!=null) {
		wsConn.close();
		wsConn=null;
	}
	console.log('hangup end',calleeID);
}

function hangupWithBusySound(mustDisconnectCallee,message) {
	dialing = false;
	stopAllAudioEffects();
	if(peerCon!=null) {
		console.log(`hangupWithBusySound`);
		busySignalSound.play().catch(function(error) { });
		setTimeout(function() {
			if(!gentle) console.log(`hangupWithBusySound stopAllAudioEffects`);
			stopAllAudioEffects();
		},2500);
	} else {
		console.log(`hangupWithBusySound no peerCon`);
	}
	hangup(mustDisconnectCallee,message);
}

