// WebCall Copyright 2021 timur.mobi. All rights reserved.
'use strict';
const avSelect = document.querySelector("select#avSelect");
const localVideoDiv = document.querySelector('div#localVideoDiv');
const localVideoFrame = document.querySelector('video#localVideoFrame');
const localVideoLabel = document.querySelector('div#localVideoLabel');
const remoteVideoDiv = document.querySelector('div#remoteVideoDiv');
const remoteVideoFrame = document.querySelector('video#remoteVideoFrame');
const remoteVideoLabel = document.querySelector('div#remoteVideoLabel');

const goOnlineButton = document.querySelector('button#onlineButton');
const goOfflineButton = document.querySelector('button#offlineButton');
const answerButton = document.querySelector('button#answerButton');
const rejectButton = document.querySelector('button#rejectButton');
const onlineIndicator = document.querySelector('img#onlineIndicator');
const isHiddenCheckbox = document.querySelector('input#isHidden');
const isHiddenlabel = document.querySelector('label#isHiddenlabel');
const autoanswerCheckbox = document.querySelector('input#autoanswer');
const autoanswerlabel = document.querySelector('label#autoanswerlabel');
const mainElement = document.getElementById('container');
const titleElement = document.getElementById('title');
const statusLine = document.getElementById('status');
const msgbox = document.querySelector('textarea#msgbox');
const timerElement = document.querySelector('div#timer');
const missedCallsElement = document.getElementById('missedCalls');
const missedCallsTitleElement = document.getElementById('missedCallsTitle');
const form = document.querySelector('form#password');
const formPw = document.querySelector('input#current-password');
const fullScreenOverlayElement = document.getElementById('fullScreenOverlay');
const iframeWindowElement = document.getElementById('iframeWindow');
const menuElement = document.getElementById('menu');
const menuDialogElement = document.getElementById('menuDialog');
const menuSettingsElement = document.getElementById('menuSettings');
const menuContactsElement = document.getElementById('menuContacts');
const menuExitElement = document.getElementById('menuExit');
const progressSendElement = document.getElementById('progressSend'); // switch on and off
const progressSendLabel = document.getElementById('progressSendLabel');
const progressSendBar = document.getElementById('fileProgressSend'); // actual progress bar
const downloadList = document.getElementById('download');
const progressRcvElement = document.getElementById('progressRcv'); // switch on and off
const progressRcvLabel = document.getElementById('progressRcvLabel');
const progressRcvBar = document.getElementById('fileProgressRcv'); // actual progress bar
const fileselectLabel = document.getElementById("fileselectlabel");
const bitrate = 280000;
const neverAudio = false;
const autoReconnectDelay = 30;
const version = "1.16.0";
const singlebutton = false;

var videoEnabled = false;
var ringtoneSound = null;
var ringtoneIsPlaying = false;
var busySignalSound = null;
var notificationSound = null;
var wsAddr = "";
var talkSecs = 0;
var outboundIP = "";
var serviceSecs = 0;
var remainingTalkSecs = 0;
var remainingServiceSecs = 0;
var wsConn = null;
var lastWsConn = null;
var localDescription = null;
var callerDescription = null;
var peerCon = null;
var localStream = null;
var remoteStream = null;
var dataChannel = null;
var rtcConnect = false
var rtcConnectStartDate = 0;
var mediaConnect = false;
var mediaConnectStartDate = 0;
var listOfClientIps = "";
var callerID = "";
var callerName = "";
var onnegotiationneededAllowed = false;
var lastResult;
var lastUserActionDate = 0;
var calleeID = "";
var calleeName = "";
var wsSecret = "";
var audioContext = null;
var audioStreamDest = null;
var autoPlaybackAudioBuffer = null;
var autoPlaybackAudioSource = null;
var autoPlaybackAudioSourceStarted;
var pickupAfterLocalStream = false;
var buttonBlinking = true;
var onGotStreamGoOnline = false;
var autoPlaybackFile = "";
var waitingCallerSlice = null;
var callsWhileInAbsenceSlice = null;
var hashcounter=0;
var pushRegistration=null;
var otherUA="";
var fileReceiveBuffer = [];
var fileReceivedSize = 0;
var fileName = "";
var fileSize = 0;
var fileReceiveStartDate=0;
var fileReceiveSinceStartSecs=0;
var fileSendAbort=false;
var fileReceiveAbort=false;

window.onload = function() {
	if(!navigator.mediaDevices) {
		console.warn("navigator.mediaDevices not available");
		goOnlineButton.disabled = true;
		goOfflineButton.disabled = true;
		alert("navigator.mediaDevices not available");
		return;
	}

	let id = getUrlParams("id");
	if(typeof id!=="undefined" && id!="") {
		calleeID = id;
	}
	if(!gentle) console.log("calleeID (%s)",calleeID);

	//console.log("document.cookie (%s)",document.cookie);
	if(calleeID=="") {
		// if callee was started without a calleeID, reload with calleeID from cookie
		if(document.cookie!="" && document.cookie.startsWith("webcallid=")) {
			let cookieName = document.cookie.substring(10);
			let idxAmpasent = cookieName.indexOf("&");
			if(idxAmpasent>0) {
				cookieName = cookieName.substring(0,idxAmpasent);
			}
			window.location.replace("/callee/"+cookieName);
			return;
		}
	}

	if(calleeID=="") {
		// TODO not really sure about this; it might be better to just tell the user about the wrong URL
		window.location.replace("register");
		return;
	}

	// if on start there is a fragment/hash ('#') in the URL, remove it
	if(location.hash.length > 0) {
		if(!gentle) console.log("location.hash.length=%d",location.hash.length);
		window.location.replace("/callee/"+calleeID);
		return;
	}

	window.onhashchange = function() {
		var newhashcounter;
		if(location.hash.length > 0) {
			newhashcounter = parseInt(location.hash.replace('#',''),10);
		} else {
			newhashcounter = 0;
		}
		if(hashcounter>0 && newhashcounter<hashcounter) {
			if(iframeWindowOpenFlag) {
				//if(!gentle) console.log("onhashchange iframeWindowClose");
				iframeWindowClose();
			} else if(menuDialogOpenFlag) {
				//if(!gentle) console.log("onhashchange menuDialogClose");
				menuDialogClose();
			}
		}
		hashcounter = newhashcounter;
		//console.log("onhashchange ",hashcounter);
	}

	document.onkeydown = function(evt) {
		//console.log('menuDialogOpen onkeydown event');
		evt = evt || window.event;
		var isEscape = false;
		if("key" in evt) {
			isEscape = (evt.key === "Escape" || evt.key === "Esc");
		} else {
			isEscape = (evt.keyCode === 27);
		}
		if(isEscape) {
			if(!gentle) console.log('callee esc key');
			if(iframeWindowOpenFlag || menuDialogOpenFlag) {
				historyBack();
			}	
		} else if(evt.key=="!") {
			menuDialogOpen();
		} else {
			//console.log('callee key',evt.key);
		}
	};

	localVideoFrame.onresize = function() {
		if(videoEnabled && localVideoFrame.videoWidth>10 && localVideoFrame.videoHeight>10) {
			if(!gentle) console.log('local video size changed',
				localVideoFrame.videoWidth, localVideoFrame.videoHeight);
		}
	}

	remoteVideoFrame.onresize = function() {
		if(videoEnabled && remoteVideoFrame.videoWidth>10 && remoteVideoFrame.videoHeight>10) {
			if(!gentle) console.log('remote video size changed',
				remoteVideoFrame.videoWidth, remoteVideoFrame.videoHeight);
		}
	}

	isHiddenCheckbox.addEventListener('change', function() {
		if(this.checked) {
			if(!gentle) console.log("isHiddenCheckbox checked");
			autoanswerCheckbox.checked = false;
		}
		// report new hidden state to server
		wsSend("calleeHidden|"+this.checked);
		setTimeout(historyBack,150);
	});
	autoanswerCheckbox.addEventListener('change', function() {
		if(this.checked) {
			if(!gentle) console.log("autoanswerCheckbox checked");
			isHiddenCheckbox.checked = false;
			// report new hidden state to server
			wsSend("calleeHidden|false");
		}
		setTimeout(historyBack,150);
	});

	checkServerMode(function(mode) {
		if(mode==0 || mode==1) {
			// normal mode
			console.log('onload load audio files');
			ringtoneSound = new Audio('1980-phone-ringing.mp3');
			busySignalSound = new Audio('busy-signal.mp3');
			notificationSound = new Audio("notification.mp3");

			ringtoneSound.onplaying = function() {
				ringtoneIsPlaying = true;
			};
			ringtoneSound.onpause = function() {
				ringtoneIsPlaying = false;
			};

			if(calleeID.startsWith("!")) {
				document.title = "WebCall Duo";
				if(titleElement) {
					titleElement.innerHTML = "WebCall Duo";
				}
				wsSecret = calleeID;
				start();
				return;
			}
			var calleeIdTitle = calleeID.charAt(0).toUpperCase() + calleeID.slice(1);
			document.title = "WebCall Callee "+calleeIdTitle;
			if(titleElement) {
				titleElement.innerHTML = "WebCall Callee "+calleeIdTitle;
			}

			calleeID = calleeID.toLowerCase();
			if(!gentle) console.log('onload calleeID lowercase (%s)',calleeID);
			if(mode==1) {
				if(!gentle) console.log('onload pw-entry not required with cookie');
				// we have a cockie, so no manual pw-entry is needed
				// but let's turn automatic online off, the user needs to interact before we can answer calls
				onGotStreamGoOnline = false;
				goOfflineButton.disabled = true;
				start();
				return;
			}
			if(wsSecret!="") {
				if(!gentle) console.log('onload pw-entry not required with wsSecret',wsSecret.length);
				// we have a pw, so manual pw-entry is not needed
				// but let's turn automatic go online off, the user needs to interact before we can answer calls
				onGotStreamGoOnline = false;
				goOfflineButton.disabled = true;
				start();
				return;
			}

			if(!gentle) console.log('onload pw-entry is needed');
			onGotStreamGoOnline = true;
			goOnlineButton.disabled = true;
			goOfflineButton.disabled = true;
			enablePasswordForm();
			return;
		}
		if(mode==2) {
			// server is in maintenance mode
			let mainParent = mainElement.parentNode;
			mainParent.removeChild(mainElement);
			var msgElement = document.createElement("div");
			msgElement.style = "margin-top:15%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-size:1.2em; line-height:1.5em;";
			msgElement.innerHTML = "<div>WebCall server is currently in maintenance mode.<br>Please try again a little later.</div>";
			mainParent.appendChild(msgElement);
			return;
		}
	});
}

function videoOn() {
	// open local video-frame (it is not yet streaming, but locally visible)
	if(!gentle) console.log("videoOn");
	videoEnabled = true;
	// enable local video
	if(peerCon && rtcConnect && sendLocalStream && localStream.getTracks().length>=2 && !videoSendTrack) {
		if(localCandidateType=="relay" || remoteCandidateType=="relay") {
			if(!gentle) console.log('videoOn no addTrack video on relayed con (%s)(%s)',localCandidateType,remoteCandidateType);
		} else {
			if(!gentle) console.log('videoOn addTrack vid',localStream.getTracks()[1]);
			videoSendTrack = peerCon.addTrack(localStream.getTracks()[1],localStream);
		}
	}
	localVideoFrame.srcObject = localStream; // see gotStream()
	localVideoFrame.volume = 0; // avoid audio feedback
	localVideoFrame.load();
	localVideoFrame.play().catch(function(error) {});
	localVideoDiv.style.visibility = "visible";
	localVideoDiv.style.height = "";

	getStream().then(() => navigator.mediaDevices.enumerateDevices())
	.then((deviceInfos) => {
		gotDevices(deviceInfos);

		// now switch to the 1st video option
		let optionElements = Array.from(avSelect);
		if(optionElements.length>0) {
			if(!gentle) console.log("videoOn avSelect.selectedIndex count",optionElements.length);
			// pre-select the 1st video device
			for(let i=0; i<optionElements.length; i++) {
				if(optionElements[i].text.startsWith("Video")) {
					avSelect.selectedIndex = i;
					if(!gentle) console.log("videoOn avSelect.selectedIndex set",i);
					break;
				}
			}
			// activate the selected device
			onnegotiationneededAllowed=true;
			getStream();
		}
	});

	if(wsConn) {
		// TODO tmtmtm must implement this on server side
		wsSend("enableVideo|"+true); // enableVideoCheckbox.checked);
	}
}

function videoOff() {
	// hide/close localVideoFrame (not needed anymore)
	if(!gentle) console.log("videoOff");
	videoEnabled = false;

	localVideoDiv.style.visibility = "hidden";
	localVideoDiv.style.height = "0px";
	localVideoLabel.innerHTML = "remote cam not streaming";
	localVideoLabel.style.color = "#fff";
	if(localStream) {
		connectLocalVideo(true); // stop video track (peerCon.removeTrack(videoSendTrack))
	}

	if(!rtcConnect) {
		if(localStream) {
			if(peerCon && audioSendTrack) {
				if(!gentle) console.log("videoOff !rtcConnect peerCon.removeTrack(audioSendTrack)");
// TODO Failed to execute 'removeTrack' on 'RTCPeerConnection': 
// The sender was not created by this peer connection.
				peerCon.removeTrack(audioSendTrack);
				audioSendTrack = null;
			}

			if(!gentle) console.log("videoOff !rtcConnect localStream stop");
//			const audioTracks = localStream.getAudioTracks();
//			audioTracks[0].enabled = false; // mute mic
//			localStream.removeTrack(audioTracks[0]);
			localStream.getTracks().forEach(track => { track.stop(); });
			localStream = null;
		}
		if(!gentle) console.log("videoOff !rtcConnect shutdown localVideo");
		localVideoFrame.pause();
		localVideoFrame.currentTime = 0;
		localVideoFrame.srcObject = null;

		if(!gentle) console.log("videoOff !rtcConnect shutdown remoteVideo");
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
		remoteVideoDiv.style.visibility = "hidden";
		remoteVideoDiv.style.height = "0px";
		remoteVideoLabel.innerHTML = "remote cam not streaming";
		remoteVideoLabel.style.color = "#fff";
		remoteStream = null;
	}

	// now switch to the 1st audio option
	let optionElements = Array.from(avSelect);
	if(optionElements.length>0) {
		if(!gentle) console.log("videoOff avSelect.selectedIndex len",optionElements.length);
		// pre-select the 1st video device
		for(let i=0; i<optionElements.length; i++) {
			if(optionElements[i].text.startsWith("Audio")) {
				avSelect.selectedIndex = i;
				if(!gentle) console.log("videoOff avSelect.selectedIndex set",i);
				break;
			}
		}
		if(rtcConnect) {
			// activate the selected device
			if(!gentle) console.log("videoOff rtcConnect getStream()");
			onnegotiationneededAllowed=true;
			getStream();
		}
	}
/*
	if(wsConn) {
// TODO tmtmtm must implement this on server side
		wsSend("enableVideo|"+false); // enableVideoCheckbox.checked);
	}
*/
}

function checkServerMode(callback) {
	let api = apiPath+"/mode?id="+calleeID;
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(xhr.responseText.startsWith("maintenance")) {
			// maintenance mode
			callback(2);
			return;
		}
		// normal mode
		if(xhr.responseText.indexOf("|ok")>0) {
			// normal mode, cookie + pw are known
			callback(1);
			return;
		}
		// normal mode, cookie or pw are NOT know
		callback(0);
	}, function(errString,errcode) {
		console.log('xhr error',errString);
		callback(3);
	});
}

function getUrlParams(param) {
	if(window.location.search!="") {
		//console.log("getUrlParams search=%s",window.location.search);
		var query = window.location.search.substring(1);
		var parts = query.split("&");
		for (var i=0;i<parts.length;i++) {
			//console.log("getUrlParams part(%d)=%s",i,parts[i]);
			var seg = parts[i].split("=");
			if (seg[0] == param) {
				//console.log("getUrlParams found=(%s)",seg[1]);
				if(typeof seg[1]!=="undefined" && seg[1]!="" && seg[1]!="undefined") {
					return decodeURI(seg[1]);
				}
				return true;
			}
		}
	}
	let path = window.location.pathname;
	let lastSlash = path.lastIndexOf("/");
	let value = path.substring(lastSlash+1);
	if(!gentle) console.log("getUrlParams val=%s",value);
	return value;
}

function showPw() {
	if(formPw.type=="password") {
		formPw.type="text";
	} else {
		formPw.type="password";
	}
}

function enablePasswordForm() {
	console.log('enter password for calleeID',calleeID);
	showStatus("Login calleeID: "+calleeID,-1);
	document.getElementById("current-password").value = "";
	form.style.display = "block";
	document.getElementById("username").focus();
	console.log("form username",document.getElementById("username").value);
	goOfflineButton.disabled = true;
	missedCallsElement.style.display = "none";
	missedCallsTitleElement.style.display = "none";
	setTimeout(function() {
		formPw.focus();
		document.getElementById("username").value = calleeID;
	},800);
}

function clearForm() {
	document.getElementById("current-password").value = "";
	formPw.focus();
}

function submitFormDone(theForm) {
	console.log("submitFormDone",theForm);
	var valuePw = document.getElementById("current-password").value;
	if(valuePw.length < 6) {
		formPw.focus();
		showStatus("Password needs to be at least six characters long",-1);
		return;
	}
	wsSecret = valuePw;
	onGotStreamGoOnline = true;
	goOnlineButton.disabled = false;
	start();
	// -> getStream() -> getUserMedia(constraints) -> gotStream() -> goOnline() -> login()
}

function start() {
	// setup buttons, get audio input stream, then login
	if(!gentle) console.log('start callee with ID',calleeID);

	goOnlineButton.onclick = function() {
		lastUserActionDate = Date.now();
		goOnline();
	}
	goOfflineButton.onclick = function() {
		lastUserActionDate = Date.now();
		goOffline();
	};
	avSelect.onchange = getStream;
	if(calleeID.startsWith("!")) {
		// auto connect for duo user
		onGotStreamGoOnline = true;
	}
	try {
		getStream().then(() => navigator.mediaDevices.enumerateDevices()).then(gotDevices);
		//getStream() -> getUserMedia(constraints) -> gotStream() -> goOnline() -> login()
	} catch(ex) {
		console.log('ex while searching for audio devices',ex);
	}
}

function login(retryFlag) {
	if(!gentle) console.log("login to signaling server...", retryFlag, calleeID, wsSecret.length);
	menuElement.style.display = "none";
	let api = apiPath+"/login?id="+calleeID;
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		let loginStatus = xhr.responseText;
		if(!gentle) console.log('loginStatus (%s)',loginStatus);
		var parts = loginStatus.split("|");
		if(parts.length>=1 && parts[0].indexOf("wsid=")>=0) {
			wsAddr = parts[0];
			// we're now a logged-in callee-user
			menuElement.style.display = "block";
			if(!gentle) console.log('login success wsAddr',wsAddr);

			// hide the form
			form.style.display = "none";

			if(parts.length>=2) {
				talkSecs = parseInt(parts[1], 10);
			}
			if(parts.length>=3) {
				outboundIP = parts[2];
			}
			if(parts.length>=4) {
				serviceSecs = parseInt(parts[3], 10);
			}
			if(!gentle) console.log('outboundIP',outboundIP);

			if(!calleeID.startsWith("!")) {
				let api = apiPath+"/getsettings?id="+calleeID;
				if(!gentle) console.log('login getsettings api',api);
				ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
					//if(!gentle) console.log('login getsettings xhr.responseText',xhr.responseText);
					if(xhr.responseText!="") {
						// json parse xhr.responseText
						let serverSettings = JSON.parse(xhr.responseText);
						if(typeof serverSettings.nickname!=="undefined") {
							calleeName = serverSettings.nickname;
							if(!gentle) console.log('login calleeName',calleeName);
						}
					}
				}, function(errString,errcode) {
					console.log('login xhr error',errString);
				});
			}

			if(!pushRegistration) {
				// we retrieve the pushRegistration here under /callee/(calleeID),
				// so that the pushRegistration.scope will also be /callee/(calleeID)
				// so that settings.js will later make use of the correct pushRegistration
				if(!gentle) console.log("serviceWorker.register...");
				let ret = navigator.serviceWorker.register('service-worker.js');
				if(!gentle) console.log("/callee/serviceWorker.ready...",ret);
				// get access to the registration (and registration.pushManager) object
				navigator.serviceWorker.ready.then(function(registration) {
					if(!gentle) console.log("serviceWorker.ready promise",ret);
					pushRegistration = registration;
					if(!gentle) console.log("serviceWorker.ready got pushRegistration",pushRegistration);
				}).catch(err => {
					console.log("serviceWorker.ready err",err);
				});
			}
			if(parts.length>=5 && parts[4]=="true") {
				isHiddenCheckbox.checked = true;
				autoanswerCheckbox.checked = false;
			}
			if(!gentle) console.log('isHiddenCheckbox.checked',isHiddenCheckbox.checked);
			wsSend("init|!"); // -> connectSignaling()
			return;
		}

		let mainLink = window.location.href;
		let idx = mainLink.indexOf("/callee");
		if(idx>0) {
			mainLink = mainLink.substring(0,idx); //+ "/webcall";
		}
		if(loginStatus=="noservice") {
			wsSecret = "";
			showStatus("Service error<br><a href='"+mainLink+"'>Main page</a>",-1);
			form.style.display = "none";
		} else if(loginStatus=="notregistered") {
			wsSecret = "";
			showStatus("User ID unknown<br><a href='"+mainLink+"'>Main page</a>",-1);
			form.style.display = "none";
		} else if(loginStatus=="busy") {
			if(calleeID.startsWith("!")) {
				// become caller
				window.location.replace("/user/"+calleeID);
				return;
			}
			showStatus("User is busy<br><a href='"+mainLink+"'>Main page</a>",-1);
			form.style.display = "none";
		} else if(loginStatus=="error") {
			// loginStatus "error" = "wrong pw", "pw has less than 6 chars" or "empty pw"
			// offer pw entry again
			if(!gentle) console.log('login error - try again');
			goOnlineButton.disabled = true;
			enablePasswordForm();
		} else {
			// loginStatus "fatal" = "already logged in" or "db.GetX err"
			// no use offering pw entry again at this point
			goOffline();
			showStatus(	"Login failed. Already logged in from another device?<br>"+
						"<br>Try <a onclick='window.location.reload(false)'>Reload</a>"+
						" or go to the <a href='"+mainLink+"'>Main page</a>",-1);
			form.style.display = "none";
		}

	}, function(errString,err) {
		console.log('xhr error',errString);
		if(calleeID.startsWith("!")) {
			// go to main page // TODO best solution?
			window.location.replace("");
			return;
		}
		if(err==502 || errString.startsWith("fetch")) {
			showStatus("No response from signaling server",3000);
		} else {
			showStatus("XHR error "+err,3000);
		}
		waitingCallerSlice = null;
		callsWhileInAbsenceSlice = null;
		var waitingCallersElement = document.getElementById('waitingCallers');
		if(waitingCallersElement!=null) {
			waitingCallersElement.innerHTML = "";
		}
		var waitingCallersTitleElement = document.getElementById('waitingCallersTitle');
		if(waitingCallersTitleElement!=null) {
			waitingCallersTitleElement.style.display = "none";
		}
		if(retryFlag) {
			setTimeout(function() {
				let delay = autoReconnectDelay + Math.floor(Math.random() * 10) - 5;
				if(!gentle) console.log('reconnecting to signaling server in %ds...', delay);
				showStatus("Reconnecting to signaling server...",-1);
				missedCallsElement.style.display = "none";
				missedCallsTitleElement.style.display = "none";
				delayedWsAutoReconnect(delay);
			},4000);
		} else {
			talkSecs=0;
			serviceSecs=0;
			remainingTalkSecs=0;
			remainingServiceSecs=0;
			offlineAction();
		}
	}, "pw="+wsSecret);
}

function offlineAction() {
	// make buttons reflect offline state
	if(!gentle) console.log('offlineAction');
	goOnlineButton.disabled = false;
	goOfflineButton.disabled = true;
}

function gotStream2() {
	if(pickupAfterLocalStream) {
		pickupAfterLocalStream = false;
		if(!gentle) console.log('gotStream2 -> auto pickup2()');
		pickup2();
	} else {
		if(localStream && !videoEnabled && !rtcConnect) {
			// mute (disable) mic until a call comes in
			if(!gentle) console.log('gotStream2 disable localStream');
			localStream.getTracks().forEach(track => { track.stop(); });
			const audioTracks = localStream.getAudioTracks();
			localStream.removeTrack(audioTracks[0]);
			localStream = null;
		}
		if(onGotStreamGoOnline && !rtcConnect) {
			if(!gentle) console.log('gotStream2 onGotStreamGoOnline goOnline');
			goOnline();
		} else {
			//if(!gentle) console.log('gotStream2 !onGotStreamGoOnline !goOnline');
		}
	}
}

function showStatus(msg,timeoutMs) {
	let sleepMs = 3000;
	if(typeof timeoutMs!=="undefined") {
		sleepMs = timeoutMs;
	}
	statusLine.style.display = "none";
	statusLine.style.opacity = 0;
	statusLine.innerHTML = msg;
	statusLine.style.opacity = 1;
	statusLine.style.display = "block";
	if(msg!="" && sleepMs>=0) {
		setTimeout(function(oldMsg) {
			if(statusLine.innerHTML==oldMsg) {
				statusLine.style.opacity = 0;
			}
		},sleepMs,msg);
	}
}

let wsAutoReconnecting = false;
function delayedWsAutoReconnect(reconPauseSecs) {
	// delayedWsAutoReconnect can only succeed if a previous login attemt was successful
	if((remainingTalkSecs<0 || remainingServiceSecs<0) && !calleeID.startsWith("answie")) {
		offlineAction();
		wsAutoReconnecting = false;
		console.log('give up reconnecting',	remainingTalkSecs, remainingServiceSecs);
		let mainLink = window.location.href;
		let idx = mainLink.indexOf("user/callee");
		if(idx>0) {
			mainLink = mainLink.substring(0,idx);
		}
		showStatus("Cannot login to server<br><a href='"+mainLink+"'>Main page</a>",-1);
		return;
	}
	wsAutoReconnecting = true;
	let startPauseDate = Date.now();
	setTimeout(function() {
		showStatus("");
		// don't proceed if the user has clicked on anything; in particular goOnline
		if(startPauseDate < lastUserActionDate) {
			// lastUserActionDate is newer (happened later) than startPauseDate
			// lastUserActionDate is set by goOnline() and goOffline()
			// user has initiated goOnline or goOffline, so we stop AutoReconnect
			wsAutoReconnecting = false;
			// but if we have a connection now, we don't kill it
			if(!wsConn) {
				if(!gentle) console.log('delayedWsAutoReconnect aborted on user action',startPauseDate,lastUserActionDate);
				offlineAction();
			}
		} else if(!wsAutoReconnecting) {
			if(!gentle) console.log('delayedWsAutoReconnect aborted on !wsAutoReconnecting');
			wsAutoReconnecting = false;
			//offlineAction();
		} else if(remainingTalkSecs<0 && !calleeID.startsWith("answie")) {
			if(!gentle) console.log('delayedWsAutoReconnect aborted on no talk time');
			wsAutoReconnecting = false;
			offlineAction();
		} else if(remainingServiceSecs<0 && !calleeID.startsWith("answie")) {
			if(!gentle) console.log('delayedWsAutoReconnect aborted on no service time');
			wsAutoReconnecting = false;
			offlineAction();
		} else {
			if(!gentle) console.log('delayedWsAutoReconnect login...');
			login(true); // -> connectSignaling("init|")
		}
	},reconPauseSecs*1000);
}

function showOnlineReadyMsg(sessionIdPayload) {
	if(!wsConn) {
		console.log('showOnlineReadyMsg not online');
		return;
	}

	if(calleeID.startsWith("!")) {
		let callerURL = window.location.href;
		callerURL = callerURL.replace("/callee/","/user/");
		var msg = "";
		msg +=  'You will receive calls made by this link: <a href="'+callerURL+'" target="_blank">'+callerURL+'</a>';
		showStatus(msg,-1);
	} else {
		msgbox.style.display = "none";
		var calleeLink = window.location.href;
		calleeLink = calleeLink.replace("callee/","user/");
		let msg = "";
		msg += "You will receive calls made by this link:<br>"+
			"<a target='_blank' href='"+calleeLink+"'>"+calleeLink+"</a><br>";
		if(!gentle) console.log('showOnlineReadyMsg',version,sessionIdPayload,version<sessionIdPayload);
		if(sessionIdPayload!="" && version<sessionIdPayload) {
			msg += "Software update available. Reload to update.<br>";
		}
		showStatus(msg,-1);
	}
}

function connectSignaling(message) {
	console.log('connect to signaling server');
	if(!window["WebSocket"]) {
		console.error('connectSignaling: no WebSocket support');
		showStatus("No WebSocket support");
		if(!mediaConnect) {
			onlineIndicator.src="";
		}
		return;
	}
	let tryingToOpenWebSocket = true;
    var wsUrl = wsAddr;
    if(!gentle) console.log('connectSignaling: open ws connection...',calleeID,wsUrl);
	wsConn = new WebSocket(wsUrl);
	wsConn.onopen = function () {
		if(!gentle) console.log('ws connection',calleeID,wsUrl);
		tryingToOpenWebSocket = false;
		wsAutoReconnecting = false;
		if(!mediaConnect) {
			onlineIndicator.src="green-gradient.svg";
		}
		window.addEventListener("beforeunload", function () {
			// prevent "try reconnect in..." after "wsConn close" on unload
			// by turining our online-indication off
			goOnlineButton.disabled = false;
		});
		if(message!="") {
			if(!gentle) console.log('ws connection send',message);
			wsSend(message);
		}
		// logged in callee (not a duo callee)
		isHiddenlabel.style.display = "block";
		autoanswerlabel.style.display = "block";
		menuSettingsElement.style.display = "block";
		menuContactsElement.style.display = "block";
		menuExitElement.style.display = "block";
		goOfflineButton.disabled = false;
	};
	wsConn.onerror = function(evt) {
		console.log("wsConn.onerror",calleeID,wsUrl);
		showStatus("Websocket error");
		if(!mediaConnect) {
			onlineIndicator.src="";
		}
	}
	wsConn.onclose = function(evt) {
		console.log("wsConn.onclose",calleeID,wsUrl);
		wsConn=null;
		buttonBlinking=false;
		onnegotiationneededAllowed = false;
		stopAllAudioEffects("wsConn.onclose");
		if(calleeID.startsWith("!")) {
			setTimeout(function() {
				// this delay prevents this msg from being shown on page reload
				showStatus("Lost signaling server");
			},500);
			return;
		}
		showStatus("disconnected from signaling server");
		if(!mediaConnect) {
			onlineIndicator.src="";
		}
		if(tryingToOpenWebSocket) {
			// onclose occured before a ws-connection could be established
			if(!gentle) console.log('wsConn.onclose failed to open');
		} else {
			if(!gentle) console.log('wsConn.onclose after being connected');
		}
		if(goOnlineButton.disabled) {
			// this is not a user-intended offline; we should be online
			let delay = autoReconnectDelay + Math.floor(Math.random() * 10) - 5;
			if(!gentle) console.log('reconnecting to signaling server in %ds...', delay);
			showStatus("Reconnecting to signaling server...",-1);
			missedCallsElement.style.display = "none";
			missedCallsTitleElement.style.display = "none";
			// if conditions are right after delay secs this will call login()
			delayedWsAutoReconnect(delay);
		}
	};
	wsConn.onmessage = function(evt) {
		var messages = evt.data.split('\n');
		for (var i = 0; i < messages.length; i++) {
			signalingCommand(messages[i]);
			if(!peerCon) {
				break;
			}
		}
	};
}

function signalingCommand(message) {
	let tok = message.split("|");
	let cmd = tok[0];
	let payload = "";
	if(tok.length>=2) {
		payload = tok[1];
	}
	if(!gentle) console.log('signaling cmd',cmd);

	if(cmd=="init") {

	} else if(cmd=="callerOffer" || cmd=="callerOfferUpd") {
		if(peerCon==null) {
			console.warn('callerOffer but no peerCon');
			return;
		}
		if(!rtcConnect) {
			listOfClientIps = "";
			callerID = "";
			callerName = "";
		}
		if(cmd=="callerOffer") {
			if(!gentle) console.log('callerOffer (incoming call)');
		} else { // "callerOfferUpd"
			if(!gentle) console.log('callerOfferUpd (in-call)');
		}
		callerDescription = JSON.parse(payload);
// failed to set RemoteDescription DOMException: Failed to execute 'setRemoteDescription' on 'RTCPeerConnection': 
// Failed to set remote answer sdp: Called in wrong state: stable
		peerCon.setRemoteDescription(callerDescription).then(() => {
			if(!gentle) console.log('callerOffer createAnswer');
// DOMException: Cannot create answer in stable
			peerCon.createAnswer().then((desc) => {
				localDescription = desc;
				if(!gentle) console.log('callerOffer in, calleeAnswer out');
				localDescription.sdp =
					maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
				localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
					'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
				peerCon.setLocalDescription(localDescription).then(() => {
					if(!gentle) console.log('calleeAnswer localDescription set -> signal');
					if(dataChannel && dataChannel.readyState=="open") {
						dataChannel.send("cmd|calleeAnswer|"+JSON.stringify(localDescription));
					} else {
						wsSend("calleeAnswer|"+JSON.stringify(localDescription));
					}
				}, err => console.error(`Failed to set local descr: ${err.toString()}`));
			}, err => {
				console.warn("failed to createAnswer",err)
				showStatus("Failed to createAnswer",8000);
			});
		}, err => {
			console.warn(`failed to set RemoteDescription`,err,callerDescription)
			showStatus("Failed to set RemoteDescription",8000);
		});
	} else if(cmd=="callerAnswer") {
		if(!peerCon) {
			console.warn('callerAnswer abort no peerCon');
			return;
		}
		callerDescription = JSON.parse(payload);

		if(!gentle) console.log("callerAnswer setLocalDescription");
// TODO tmtmtm
// callerAnswer setLocalDescription fail DOMException:
// Failed to execute 'setLocalDescription' on 'RTCPeerConnection':
// The SDP does not match the previously generated SDP for this type
		peerCon.setLocalDescription(localDescription).then(() => {
			if(!gentle) console.log('callerAnswer setRemoteDescription');
			peerCon.setRemoteDescription(callerDescription).then(() => {
				if(!gentle) console.log('callerAnswer setRemoteDescription done');
			}, err => {
				console.warn(`callerAnswer Failed to set RemoteDescription`,err)
				showStatus("Cannot set remoteDescr "+err);
			});
		}, err => {
			console.warn("callerAnswer setLocalDescription fail",err)
			showStatus("Cannot set localDescr"+err);
		});

	} else if(cmd=="callerInfo") {
		let idxColon = payload.indexOf(":");
		if(idxColon>=0) {
			callerID = payload.substring(0,idxColon);
			callerName = payload.substring(idxColon+1);
			if(!gentle) console.log('cmd callerInfo (%s) (%s)',callerID,callerName);
		} else {
			if(!gentle) console.log('cmd callerInfo payload=(%s)',payload);
		}

	} else if(cmd=="callerCandidate") {
		if(peerCon==null) {
			console.warn('callerCandidate but no peerCon');
			return;
		}
		var callerCandidate = JSON.parse(payload);
		if(callerCandidate.candidate=="") {
			if(!gentle) console.log('skip empty callerCandidate');
			return;
		}
		callerCandidate.usernameFragment = null;
		var addIceCallerCandidate = function(callerCandidate) {
			if(!peerCon) {
				console.warn('cmd callerCandidate abort no peerCon');
				return;
			}
			if(!peerCon.remoteDescription) {
				console.warn("cmd callerCandidate !peerCon.remoteDescription",payload);
				setTimeout(addIceCallerCandidate,100,callerCandidate);
				return;
			}
			let tok = callerCandidate.candidate.split(' ');
			if(tok.length<5) {
				console.warn("cmd callerCandidate format err",payload);
				return;
			}
			let address = tok[4];
			if(tok.length>=10 && tok[8]=="raddr" && tok[9]!="0.0.0.0") {
				address = tok[9];
			}
			if(address==null) {
				console.log("# cmd callerCandidate skip address = null");
				return;
			}
			if(address=="") {
				console.log("# cmd callerCandidate skip empty address");
				return;
			}

			if(!gentle) console.log("! peerCon.addIceCandidate accept address",
				address,callerCandidate.candidate);
			if(address.indexOf(":")>=0
					|| address==outboundIP 
					|| address.endsWith(".local")
					|| address.indexOf("10.1.")>=0) {
				// do not add to listOfClientIps
			} else {
				if(listOfClientIps.indexOf(address)<0) {
					if(listOfClientIps!="") {
						listOfClientIps += " ";
					}
					listOfClientIps += address;
				}
			}
			peerCon.addIceCandidate(callerCandidate).catch(e => {
				console.error("addIce callerCandidate",e,payload);
				showStatus("RTC error "+e);
			});
		}
		addIceCallerCandidate(callerCandidate);

	} else if(cmd=="cancel") {
		if(payload=="c") {
			// this is a remote cancel
			console.log('cmd cancel');
			answerButton.style.display = "none";
			rejectButton.style.display = "none";
			stopAllAudioEffects("incoming cancel");
			if(mediaConnect) {
				if(calleeID.startsWith("!")) {
					showStatus("Caller canceled call ("+
						localCandidateType+"/"+remoteCandidateType+")",8000);
				} else {
					// TODO if callerID and/or callerName are avail we would rather show them
					// instead of listOfClientIps
					showStatus("Caller canceled call ("+
						listOfClientIps+" "+localCandidateType+"/"+remoteCandidateType+")",8000);
				}
				busySignalSound.play().catch(function(error) { });
				setTimeout(function() {
					busySignalSound.pause();
					busySignalSound.currentTime = 0;
				},1000);
			} else {
				// caller has canceled the call before connect
				showStatus("Canceled");
			}
			stopAllAudioEffects();
			endWebRtcSession(false,true); // -> peerConCloseFunc
		} else {
			stopAllAudioEffects("ignore cancel");
		}
	} else if(cmd=="sessionId") {
		// callee has checked in
		showOnlineReadyMsg(payload);

	} else if(cmd=="sessionDuration") { // in call
		if(localCandidateType!="relay" && remoteCandidateType!="relay") {
			// do not show the timer
		} else if(mediaConnect) {
			var sessionDuration = parseInt(payload,10); // maxTalkSecsIfNoP2p
			if(sessionDuration>0 && !timerStartDate) {
				if(!gentle) console.log('sessionDuration',sessionDuration);
				startTimer(sessionDuration);
			}
		}

	} else if(cmd=="serviceData") { // post call
		//console.log('serviceData (%s) tok.length=%d',messages[i],tok.length);
		if(tok.length>=2) {
			talkSecs = parseInt(tok[1], 10);
			if(tok.length>=3) {
				serviceSecs = parseInt(tok[2], 10);
			}
		}

	} else if(cmd=="calleeInfo") {
		// TODO this is text-info to be shown
		// maybe the best way to present this, is to put it on top of the current statusMsg
		// or maybe just put a link there, saying "click here to see new info for you!"

	} else if(cmd=="waitingCallers") {
		waitingCallerSlice = null;
		if(payload.length>0) {
			waitingCallerSlice = JSON.parse(payload);
			//console.log('showWaitingCallers msg',waitingCallerSlice.length);
			if(waitingCallerSlice!=null && waitingCallerSlice.length>0) {
				// TODO would be good to use a different sound here
				notificationSound.play().catch(function(error) { });
			}
		}
		showWaitingCallers();

	} else if(cmd=="missedCalls") {
		if(!gentle) console.log('showCallsWhileInAbsence msg',payload.length);
		callsWhileInAbsenceSlice = null;
		if(payload.length>0) {
			callsWhileInAbsenceSlice = JSON.parse(payload);
		}
		showCallsWhileInAbsence();

	} else if(cmd=="ua") {
		otherUA = payload;
		if(!gentle) console.log("otherUA",otherUA);

	} else if(cmd=="rtcNegotiate") {
		// remote video track added by caller
		if(!gentle) console.log("rtcNegotiate");
		if(dataChannel && dataChannel.readyState=="open") {
			pickupAfterLocalStream = true;
			getStream(); // -> pickup2() -> "calleeDescriptionUpd"
		}
	} else if(cmd=="rtcVideoOff") {
		// remote video track removed by other side (hide remoteVideoFrame so that audio can still be received)
		if(!gentle) console.log("rtcVideoOff");
		//remoteVideoFrame.srcObject = null;
		remoteVideoDiv.style.visibility = "hidden";
		remoteVideoDiv.style.height = "0px";
		remoteVideoLabel.innerHTML = "remote cam not streaming";
		remoteVideoLabel.style.color = "#fff";

	} else if(cmd=="ping") {
	} else if(cmd=="calleeDescriptionUpd") {
	} else if(cmd=="rtcConnect") {
	} else if(cmd=="confirm") {
	} else if(cmd=="stop") {
	} else if(cmd=="pickup") {
	} else if(cmd=="calleeCandidate") {
	} else if(cmd=="calleeDescription") {
	} else {
		if(!gentle) console.warn('ignore incom cmd',cmd);
	}
}

function showWaitingCallers() {
	let waitingCallersElement = document.getElementById('waitingCallers');
	if(waitingCallersElement!=null) {
		let waitingCallersTitleElement = document.getElementById('waitingCallersTitle');
		if(waitingCallerSlice==null || waitingCallerSlice.length<=0) {
			waitingCallersElement.innerHTML = "";
			if(waitingCallersTitleElement!=null) {
				waitingCallersTitleElement.style.display = "none";
			}
			return;
		}

		if(!gentle) console.log('showWaitingCallers fkt waitingCallerSlice.length',waitingCallerSlice.length);
		let timeNowSecs = Math.floor((Date.now()+500)/1000);
		let str = "<table style='width:100%; border-collapse:separate; border-spacing:6px 2px; line-height:1.5em;'>"
		for(let i=0; i<waitingCallerSlice.length; i++) {
			str += "<tr>"
			let waitingSecs = timeNowSecs - waitingCallerSlice[i].CallTime;
			//if(!gentle) console.log('showWaitingCallers %d - %d = %d',
			//	timeNowSecs,waitingCallerSlice[i].CallTime, waitingSecs);
			let waitingTimeString = ""+waitingSecs+" sec";
			if(waitingSecs>50) {
				waitingTimeString = ""+Math.floor((waitingSecs+10)/60)+" min"
			}
			let callerIp = waitingCallerSlice[i].AddrPort;
			let callerIpIdxPort = callerIp.indexOf(":");
			if(callerIpIdxPort>0) {
				callerIp = callerIp.substring(0,callerIpIdxPort);
			}
			str += "<td>" + waitingCallerSlice[i].CallerName + "</td><td>"+
			    waitingCallerSlice[i].CallerID + "</td><td>"+
				halfShowIpAddr(callerIp) + "</td><td style='text-align:right;'>since "+
				waitingTimeString + "</td><td>"+
				"<a onclick='pickupWaitingCaller(\""+waitingCallerSlice[i].AddrPort+"\")'>"+
				"connect</a></td></tr>";
		}
		str += "</table>";
		//if(!gentle) console.log('**** waitingCallerSlice str',str);
		waitingCallersElement.innerHTML = str;
		if(waitingCallersTitleElement!=null) {
			waitingCallersTitleElement.style.display = "block";
		}

		setTimeout(function() {
			showWaitingCallers();
		},10000);
	}
}

function pickupWaitingCaller(addrPort) {
	console.log('pickupWaitingCaller',addrPort);
	wsSend("pickupWaitingCaller|"+addrPort);
}

// show missedCalls
var showCallsWhileInAbsenceCallingItself = false;
function showCallsWhileInAbsence() {
	if(wsConn==null) {
		// don't execute if client is disconnected 
		return;
	}
	if(missedCallsElement!=null) {
		if(callsWhileInAbsenceSlice==null || callsWhileInAbsenceSlice.length<=0) {
			if(!gentle) console.log('showWaitingCallers fkt callsWhileInAbsenceSlice == null');
			missedCallsElement.style.display = "none";
			missedCallsElement.innerHTML = "";
			if(missedCallsTitleElement!=null) {
				missedCallsTitleElement.style.display = "none";
			}
			return;
		}
		missedCallsElement.style.display = "block";
		//if(!gentle) console.log('showWaitingCallers fkt callsWhileInAbsenceSlice.length',
		//	callsWhileInAbsenceSlice.length);
		let timeNowSecs = Math.floor((Date.now()+500)/1000);
		let str = "<table style='width:100%; border-collapse:separate; border-spacing:6px 2px; line-height:1.5em;'>"
		for(var i=0; i<callsWhileInAbsenceSlice.length; i++) {
			str += "<tr>"
			let waitingSecs = timeNowSecs - callsWhileInAbsenceSlice[i].CallTime;

			// split waitingTimeString by days, hours, min
			let waitingTimeString = ""+waitingSecs+" sec";
			if(waitingSecs>50) {
				let waitingMins = Math.floor((waitingSecs+10)/60);
				if(waitingMins>=60) {
					let waitingHours = Math.floor(waitingMins/60);
					waitingMins -= waitingHours*60;
					if(waitingHours>=24) {
						let waitingDays = Math.floor(waitingHours/24);
						waitingHours -= waitingDays*24;
						if(waitingDays>=3) {
							waitingTimeString = ""+waitingDays+"d";
						} else {
							waitingTimeString = ""+waitingDays+"d "+waitingHours+"h";
						}
					} else {
						waitingTimeString = ""+waitingHours+"h "+waitingMins+"m";
					}
				} else {
					waitingTimeString = ""+waitingMins+" min";
				}
			}
			let callerIp = callsWhileInAbsenceSlice[i].AddrPort;
			let callerIpIdxPort = callerIp.indexOf(":");
			if(callerIpIdxPort>0) {
				callerIp = callerIp.substring(0,callerIpIdxPort);
			}
			let callerID = callsWhileInAbsenceSlice[i].CallerID;
			let callerLink = callerID;
			//if(!gentle) console.log('callerID.length=%d',callerID.length)
			if(callerID.length>=5) {
				// TODO here we could also verify if callerID is a valid calleeID
				//      and we could check if callerID is currently online
				callerLink = window.location.href;
				let idxCallee = callerLink.indexOf("/callee/");
				if(idxCallee>=0) {
					callerLink = callerLink.substring(0,idxCallee) + "/user/" + callerID;
					// here we hand over calleeID as URL args
					// caller.js will try to get nickname from server (using cookie)
					callerLink = callerLink+"?callerId="+calleeID+"&name="+calleeName;

					// open caller in iframe
					callerLink = "<a onclick='iframeWindowOpen(\""+callerLink+"\")'>"+callerID+"</a>";
				}
			}
			str += "<td>"+callsWhileInAbsenceSlice[i].CallerName + "</td><td>"+
			    callerLink + "</td><td>"+
				halfShowIpAddr(callerIp) + "</td><td style='text-align:right;'>"+
				waitingTimeString + " ago</td><td>"+
				"<a onclick='deleteCallWhileInAbsence(\""+
					callsWhileInAbsenceSlice[i].AddrPort+"_"+callsWhileInAbsenceSlice[i].CallTime+"\")'>"+
				"delete</a></td>";
		}
		str += "</table>"
		///if(!gentle) console.log('callsWhileInAbsenceSlice str',str);
		missedCallsElement.innerHTML = str;
		if(missedCallsTitleElement!=null) {
			missedCallsTitleElement.style.display = "block";
		}

		if(showCallsWhileInAbsenceCallingItself) {
			// already updating itself
			//if(!gentle) console.log('showCallsWhileInAbsence SKIP calling itself in 10s');
		} else {
			//console.log('showCallsWhileInAbsence calling itself in 10s');
			showCallsWhileInAbsenceCallingItself = true;
			setTimeout(function() {
				showCallsWhileInAbsenceCallingItself = false;
				showCallsWhileInAbsence();
			},10000);
		}
	}
}

function halfShowIpAddr(ipAddr) {
	let idxFirstDot = ipAddr.indexOf(".");
	if(idxFirstDot>=0) {
		let idxSecondDot = ipAddr.substring(idxFirstDot+1).indexOf(".")
		//console.log('halfShowIpAddr idxSecondDot',idxSecondDot);
		if(idxSecondDot>=0) {
			return ipAddr.substring(0,idxFirstDot+1+idxSecondDot+1)+"x.x";
		}
	}
	return ipAddr
}

function deleteCallWhileInAbsence(callerAddrPortPlusCallTime) {
	console.log('deleteCallWhileInAbsence',callerAddrPortPlusCallTime);
	wsSend("deleteCallWhileInAbsence|"+callerAddrPortPlusCallTime);
}

function wsSend(message) {
	if(wsConn==null || wsConn.readyState!=1) {
		if(wsConn!=null) {
			if(wsConn.readyState==0) {
				console.log('wsSend (state 0 = connecting)');
				wsConn.close();
				wsConn=null;
				offlineAction();
			} else if(wsConn.readyState==2) {
				console.log('wsSend (state 2 = closing)');
				wsConn=null;
				offlineAction();
			} else if(wsConn.readyState==3) {
				console.log('wsSend (state 3 = closed)');
				wsConn=null;
				offlineAction();
			} else {
				console.log('wsSend ws state',wsConn.readyState);
			}
		}
		if(remainingTalkSecs>=0 || calleeID.startsWith("!") || calleeID.startsWith("answie")) {
			if(!gentle) console.log('wsSend connectSignaling',message);
			connectSignaling(message);
		} else {
			if(!gentle) console.warn('wsSend no connectSignaling',
				message,calleeID,remainingServiceSecs,remainingTalkSecs);
			wsAutoReconnecting = false;
			offlineAction();
		}
	} else {
		wsConn.send(message);
	}
}

function pickup() {
	console.log('pickup -> open mic');
	pickupAfterLocalStream = true;
	getStream(); // -> pickup2()
}

function pickup2() {
	console.log('pickup2');
	showStatus("");
	stopAllAudioEffects("pickup");
	if(!localStream) {
		console.warn('pickup2 no localStream');
		return;
	}

	onnegotiationneededAllowed = true;

	if(remoteStream) {
		if(!gentle) console.log('pickup2 peerCon start remoteVideoFrame');
		remoteVideoFrame.srcObject = remoteStream; // see 'peerCon.ontrack onunmute'
		remoteVideoFrame.load();
		remoteVideoFrame.play().catch(function(error) {});
/*
		if(videoEnabled) {
			remoteVideoDiv.style.visibility = "visible";
			remoteVideoDiv.style.height = "";
		}
	} else {
		if(!gentle) console.log('pickup2 no remoteStream');
		if(videoEnabled) {
			remoteVideoDiv.style.visibility = "hidden";
			remoteVideoDiv.style.height = "0px";
		}
*/
	}

	// before we send "pickup|!" to caller allow some time for onnegotiation to take place
	setTimeout(function() {
		if(!gentle) console.log('pickup2: after short delay send pickup to caller');
//		if(dataChannel!=null && dataChannel.readyState=="open") {
//			dataChannel.send("cmd|pickup|!");
//		} else {
			wsSend("pickup|!") // make caller unmute the remote (our) mic
//		}

		answerButton.disabled = true;
		onlineIndicator.src="red-gradient.svg";
		mediaConnect = true;
		mediaConnectStartDate = Date.now();

		if(dataChannel!=null && dataChannel.readyState=="open") {
			if(localCandidateType!="relay" && remoteCandidateType!="relay") {
				fileselectLabel.style.display = "inline-block";
			}
		}

		setTimeout(function() {
			console.log('full mediaConnect, blink localVideoLabel');

			if(videoEnabled && !sendLocalStream) {
				localVideoLabel.innerHTML = "--- local cam not streaming ---";
				localVideoLabel.classList.add('blink_me');
				setTimeout(function() {localVideoLabel.classList.remove('blink_me')},8000);
			}

			peerCon.getStats(null)
			.then((results) => getStatsCandidateTypes(results,"Connected","Mic is open"),
				err => console.log(err));
		},200);
	},400);
}

function hangup() {
	showStatus("Hang up",4000);
	console.log("hangup");
	answerButton.style.display = "none";
	rejectButton.style.display = "none";

	remoteVideoFrame.srcObject = null;
	remoteVideoDiv.style.visibility = "hidden";
	remoteVideoDiv.style.height = "0px";
	remoteVideoLabel.innerHTML = "remote cam not streaming";
	remoteVideoLabel.style.color = "#fff";

	// if mediaConnect -> play short busy tone 
	if(mediaConnect) {
		if(!gentle) console.log("hangup: mediaConnect -> short busy sound");
		busySignalSound.play().catch(function(error) { });
		setTimeout(function() {
			busySignalSound.pause();
			busySignalSound.currentTime = 0;
			stopAllAudioEffects();
		},1000);
	}

	connectLocalVideo(true); // stop streaming local video
	endWebRtcSession(true,true);

	if(localStream && !videoEnabled) {
		if(!gentle) console.log('videoOff clear localStream');
		const audioTracks = localStream.getAudioTracks();
		audioTracks[0].enabled = false; // mute mic
		localStream.getTracks().forEach(track => { track.stop(); });
		localStream.removeTrack(audioTracks[0]);
		localStream = null;
	}
}

function goOnline() {
	showStatus("");
	if(goOnlineButton.disabled) {
		console.warn('cannot goOnline while being online');
		return;
	}
	goOnlineButton.disabled = true;
	goOfflineButton.disabled = false;
	rtcConnectStartDate = 0;
	mediaConnectStartDate = 0;
	if(!gentle) console.log('goOnline',calleeID);
	var ICE_config = {
		"iceServers": [
			{	'urls': 'stun:'+window.location.hostname+':3739' },
			{	'urls': 'turn:'+window.location.hostname+':3739',
				'username': 'c807ec29df3c9ff',
				'credential': '736518fb4232d44'
			}
		]
	};
	//console.warn("RTCPeerConnection ICE_config",ICE_config);
	audioSendTrack = null;
	videoSendTrack = null;
	try {
		peerCon = new RTCPeerConnection(ICE_config);
	} catch(ex) {
		console.error("RTCPeerConnection",ex);
		showStatus("RTCPeerConnection error "+ex);
		offlineAction();
		return;
	};
	peerCon.onicecandidate = e => onIceCandidate(e);
	peerCon.onicecandidateerror = function(e) {
		if(e.errorCode==701) {
			// don't use "warn" on 701 chrome "701 STUN allocate request timed out"
			if(!gentle) console.log("onicecandidateerror", e.errorCode, e.errorText, e.url);
		} else {
			if(!gentle) console.warn("onicecandidateerror", e.errorCode, e.errorText, e.url);
			showStatus("iceCandidate error "+e.errorCode+" "+e.errorText,-1);
		}
	}
	peerCon.ontrack = ({track, streams}) => {
		if(!gentle) console.log('peerCon.ontrack',track, streams);

//		track.onunmute = () => {
//			if(remoteVideoFrame!=null && remoteVideoFrame.srcObject == streams[0]) {
//				if(!gentle) console.warn('peerCon.ontrack onunmute was already set');
//				return;
//			}
			if(!gentle) console.log('peerCon.ontrack onunmute set remoteVideoFrame.srcObject',streams[0]);
			remoteStream = streams[0];
//		};

		if(track.enabled && track.kind=="video") {
			// enable remote video
			remoteVideoFrame.srcObject = remoteStream; // see 'peerCon.ontrack onunmute'
			remoteVideoFrame.load();
			remoteVideoFrame.play().catch(function(error) {});
			remoteVideoDiv.style.visibility = "visible";
			remoteVideoDiv.style.height = "";

			remoteVideoLabel.innerHTML = "remote cam streaming";
			remoteVideoLabel.style.color = "#ff0";
		}
	};
	peerCon.onicegatheringstatechange = event => {
		let connection = event.target;
		if(!gentle) console.log("onicegatheringstatechange", connection.iceGatheringState);
	}
	peerCon.onnegotiationneeded = async () => {
		if(!peerCon) {
			if(!gentle) console.warn('onnegotiationneeded no peerCon');
			return;
		}
/* tmtmtm
		if(!onnegotiationneededAllowed) {
			// pickup2() enables, endWebRtcSession() and wsConn.onclose disable
			if(!gentle) console.warn('onnegotiationneeded not allowed');
			return;
		}
*/
		try {
			// this will trigger onIceCandidates and send hostCandidate's to the client
			console.log("onnegotiationneeded createOffer");
			localDescription = await peerCon.createOffer();
			localDescription.sdp = maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
			localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
				'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
			peerCon.setLocalDescription(localDescription).then(() => {
				if(!gentle) console.log('onnegotiationneeded localDescription set -> signal');
				if(dataChannel && dataChannel.readyState=="open") {
					dataChannel.send("cmd|calleeOffer|"+JSON.stringify(localDescription));
				} else {
					wsSend("calleeOffer|"+JSON.stringify(localDescription));
				}
			}, err => console.error(`Failed to set local descr: ${err.toString()}`));
		} catch(err) {
			console.error("onnegotiationneeded err",err);
		}
	};
	peerCon.onsignalingstatechange = event => {
		if(!gentle) console.log("signalingstatechange", peerCon.signalingState);
	}
	peerCon.oniceconnectionstatechange = event => {
		if(!gentle) console.log("oniceconnectionstatechange", peerCon.iceConnectionState);
	}
	peerCon.onconnectionstatechange = event => {
		if(peerCon==null) {
			return;
		}
		if(!gentle) console.log("onconnectionstatechange", peerCon.connectionState);
		if(peerCon.connectionState=="disconnected") {
			stopAllAudioEffects();
			endWebRtcSession(true,true); // -> peerConCloseFunc
		} else if(peerCon.connectionState=="connected") {
			if(rtcConnect) {
				return;
			}
			rtcConnect = true;
			goOfflineButton.disabled = true;
			rtcConnectStartDate = Date.now();
			mediaConnectStartDate = 0;
			if(!gentle) console.log("rtcConnect");
			wsSend("rtcConnect|")

			if(!dataChannel) {
				if(!gentle) console.log('goOnline have no dataChannel');
				createDataChannel();
			}


			if(ringtoneSound!=null) {
				allAudioEffectsStopped = false;
				var playRingtoneSound = function() {
					if(allAudioEffectsStopped) {
						if(!ringtoneSound.paused && ringtoneIsPlaying) {
							if(!gentle) console.log('playRingtoneSound ringtoneSound.pause');
							ringtoneSound.pause();
							ringtoneSound.currentTime = 0;
						} else {
							if(!gentle) console.log('playRingtoneSound NO ringtoneSound.pause',
								ringtoneSound.paused, ringtoneIsPlaying);
						}
						return;
					}
					ringtoneSound.onended = playRingtoneSound;

					if(ringtoneSound.paused && !ringtoneIsPlaying) {
						if(!gentle) console.log('ringtone play will be started...');
						ringtoneSound.play().catch(error => {
							if(!gentle) console.log('ringtone play',error);
						});
					} else {
						if(!gentle) console.log('ringtone play NOT started',
							ringtoneSound.paused,ringtoneIsPlaying);
					}
				}
				playRingtoneSound();
			}

			// blinking answer button
			buttonBlinking = true;
			let buttonBgHighlighted = false;
			let blinkButtonFunc = function() {
				if(!buttonBgHighlighted) {
					answerButton.style.background = "#b82a68";
					buttonBgHighlighted = true;
					setTimeout(blinkButtonFunc, 500);
				} else {
					answerButton.style.background = "#04c";
					buttonBgHighlighted = false;
					if(!buttonBlinking || wsConn==null) {
						if(!gentle) console.log("buttonBlinking stop");
						answerButton.style.background = "#04c";
						return;
					}
					if(!gentle) console.log("buttonBlinking...");
					setTimeout(blinkButtonFunc, 500);
				}
			}
			blinkButtonFunc();

			setTimeout(function() {
				if(!peerCon) {
					// calling peer has quickly aborted the call
					return;
				}
				// TODO if callerID and/or callerName are avail we would rather show them
				// instead of listOfClientIps
				console.log('accept incoming call?',listOfClientIps);
				peerCon.getStats(null)
				.then((results) => getStatsCandidateTypes(results,"Incoming", ""), err => console.log(err));

				answerButton.disabled = false;
				if(!calleeID.startsWith("!") && !calleeID.startsWith("answie")){
					// msgbox only if not duo or answie
					// no msgbox if it is empty
					if(msgbox.value!="") {
						msgbox.style.display = "block";
					}
				}

				goOnlineButton.style.display = "none";
				goOfflineButton.style.display = "none";
				answerButton.style.display = "inline-block";
				rejectButton.style.display = "inline-block";
				if(autoanswerCheckbox.checked) {
					setTimeout(function() {
						console.log("auto-answer call");
						buttonBlinking = false;
						pickup();
					},1000);
				}

				answerButton.onclick = function() {
					if(!gentle) console.log("answer button");
					buttonBlinking = false;
					pickup();
				}
				rejectButton.onclick = function() {
					if(!gentle) console.log("hangup button");
					buttonBlinking = false;
					hangup();
				}
			},400);
		}
	}

	if(!wsConn) {
		if(!gentle) console.log('goOnline have no wsConn');
		login(false);
	} else {
		if(!gentle) console.log('goOnline have wsConn send init');
		wsSend("init|!");
	}
}

function getStatsCandidateTypes(results,eventString1,eventString2) {
	let msg = getStatsCandidateTypesEx(results,eventString1,eventString2)
	wsSend("log|callee "+msg);

	if(calleeID.startsWith("!")) {
		let showMsg = msg;
		if(eventString2!="") {
			showMsg += ". "+eventString2+".";
		}
		showStatus(showMsg,-1);
	}

	// we rather show callerID and/or callerName if they are avail, instead of listOfClientIps
	if(callerName!="" || callerID!="") {
		if(callerName.toLowerCase()==callerID.toLowerCase()) {
			msg += " "+callerName;
		} else {
			msg += " "+callerName+" "+callerID;
		}
	} else if(listOfClientIps!="") {
		msg += " "+listOfClientIps;
	}
	if(!calleeID.startsWith("!")) {
		let showMsg = msg;
		if(eventString2!="") {
			showMsg += ". "+eventString2+".";
		}
		if(otherUA!="") {
			showMsg += "<div style='font-size:0.8em;margin-top:8px;color:#aac;'>"+otherUA+"</div>";
		}
		showStatus(showMsg,-1);
	}
}

function createDataChannel() {
	if(!gentle) console.log('createDataChannel...');
	peerCon.ondatachannel = event => {
		dataChannel = event.channel;
		dataChannel.onopen = event => {
			if(!gentle) console.log("dataChannel.onopen", dataChannel.protocol,
				dataChannel.ordered, dataChannel.binaryType, dataChannel.reliable);
		};
		dataChannel.onclose = event => {
			if(!gentle) console.log("dataChannel.onclose");
		}
		dataChannel.onerror = event => {
			if(rtcConnect) {
				console.warn("dataChannel.onerror",event);
				showStatus("dataChannel error "+event.error,-1);	// .message ?
			}
			progressSendElement.style.display = "none";
			if(mediaConnect && dataChannel!=null && dataChannel.readyState=="open") {
				if(localCandidateType!="relay" && remoteCandidateType!="relay") {
					fileselectLabel.style.display = "inline-block";
				}
			}
		}
		dataChannel.onmessage = event => {
			if(typeof event.data === "string") {
				if(!gentle) console.log("dataChannel.onmessage");
				if(event.data) {
					if(event.data=="ping") {
						if(dataChannel && dataChannel.readyState=="open") {
							dataChannel.send(event.data+" response");
						}
					} else if(event.data.startsWith("disconnect")) {
						console.log("dataChannel.onmessage on 'disconnect'");
						dataChannel.close();
						dataChannel = null;
						stopAllAudioEffects("dataChannel disconnect");
						hangup();
					} else if(event.data.startsWith("msg|")) {
						// sanitize incoming data
						let cleanString = event.data.substring(4).replace(/<(?:.|\n)*?>/gm, "...");
						if(cleanString!="") {
							console.log("dataChannel.onmessage msg",cleanString);
							if(msgbox) {
								let curDate = new Date().toString();
								// cut off trailing " (Central European Summer Time)" from date
								let bracketIdx = curDate.indexOf(" (");
								if(bracketIdx>0) {
									curDate = curDate.substring(0,bracketIdx);
								}
								let msg = "--- "+curDate+" ---\n" + cleanString + "\n";
								msgbox.value = msg;
							}
						}
					} else if(event.data.startsWith("cmd|")) {
						let subCmd = event.data.substring(4);
						if(!gentle) console.log("dataChannel.onmessage signaling");
						signalingCommand(subCmd);
					} else if(event.data.startsWith("file|")) {
						var fileDescr = event.data.substring(5);

						if(fileDescr=="end-send") {
							if(!gentle) console.log("file transmit aborted by sender");
							progressRcvElement.style.display = "none";
							if(fileReceivedSize < fileSize) {
								showStatus("file transmit aborted by sender");
							}
							fileReceivedSize = 0;
							fileReceiveBuffer = [];
							return;
						}
						if(fileDescr=="end-rcv") {
							if(!gentle) console.log("file send aborted by peer");
							showStatus("file send aborted by peer");
							fileSendAbort = true;
							progressSendElement.style.display = "none";
							if(mediaConnect && dataChannel!=null && dataChannel.readyState=="open") {
								if(localCandidateType!="relay" && remoteCandidateType!="relay") {
									fileselectLabel.style.display = "inline-block";
								}
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
						fileReceivedSize = 0;
						fileReceiveBuffer = [];
						fileReceiveStartDate = Date.now();
						fileReceiveSinceStartSecs=0;
					}
				}
			} else {
				if(fileReceiveAbort) {
					if(!gentle) console.log("file receive abort");
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
				//if(!gentle) console.log("binary chunk", chunkSize, fileReceivedSize, fileSize);
				if(fileReceivedSize === fileSize) {
					if(!gentle) console.log("file receive complete");
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
	};
}

var allAudioEffectsStopped = false;
function stopAllAudioEffects(comment) {
	if(!gentle) console.log('stopAllAudioEffects',comment);
	allAudioEffectsStopped = true;
	try {
		if(!ringtoneSound.paused && ringtoneIsPlaying) {
			if(!gentle) console.log('stopAllAudioEffects ringtoneSound.pause');
			ringtoneSound.pause();
			ringtoneSound.currentTime = 0;
		} else {
			if(!gentle) console.log('stopAllAudioEffects NO ringtoneSound.pause',
				ringtoneSound.paused, ringtoneIsPlaying);
		}

		busySignalSound.pause();
		busySignalSound.currentTime = 0;
	} catch(ex) {
		console.log('ex stopAllAudioEffects',ex);
	}
	if(!gentle) console.log('stopAllAudioEffects done');
}

var goOnlinePending = false;
function endWebRtcSession(disconnectCaller,goOnlineAfter) {
	console.log('endWebRtcSession',disconnectCaller,goOnlineAfter);
	if(remoteVideoFrame!=null) {
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
		remoteStream = null;
	}
	buttonBlinking = false;
	if(msgbox) {
		msgbox.value = "";
	}
	stopTimer();
	onnegotiationneededAllowed = false;
	if(autoPlaybackAudioSource) {
		autoPlaybackAudioSource.disconnect();
		if(autoPlaybackAudioSourceStarted) {
			if(!gentle) console.log("endWebRtcSession autoPlayback stop",autoPlaybackFile);
			autoPlaybackAudioSource.stop();
			autoPlaybackAudioSourceStarted = false;
		}
		autoPlaybackAudioSource = null;
	}

	if(peerCon) {
		let peerConCloseFunc = function() {
			// rtcConnect && peerCon may be cleared by now
			if(disconnectCaller) {
				if(!gentle) console.log('endWebRtcSession disconnectCaller');
				if(wsConn) {
					if(!gentle) console.log('endWebRtcSession wsSend(cancel)');
					wsSend("cancel|disconnect"); // important
				}
				if(dataChannel && dataChannel.readyState=="open") {
					if(!gentle) console.log('endWebRtcSession dataChannel.send(disconnect)');
					dataChannel.send("disconnect");
				} else {
					if(!gentle) console.log('endWebRtcSession cannot send disconnect to peer');
				}
			}
			if(dataChannel) {
				if(!gentle) console.log('endWebRtcSession dataChannel.close');
				dataChannel.close();
				dataChannel = null;
			}
			if(peerCon) {
				if(!gentle) console.log('endWebRtcSession peerConCloseFunc remove sender tracks');
				const senders = peerCon.getSenders();
				if(senders) {
					try {
						senders.forEach((sender) => { peerCon.removeTrack(sender); })
					} catch(ex) {
						console.warn('endWebRtcSession removeTrack',ex);
					}
				}
				if(!gentle) console.log('endWebRtcSession peerCon.close');
				peerCon.close();
				peerCon = null;
				if(!gentle) console.log('endWebRtcSession peerCon cleared');
			}
		};

		if(rtcConnect && peerCon) {
			if(!gentle) console.log('endWebRtcSession getStatsPostCall');
			peerCon.getStats(null).then((results) => { 
				getStatsPostCall(results);
				peerConCloseFunc();
			}, err => {
				console.log(err); 
				peerConCloseFunc();
			});
		} else {
			peerConCloseFunc();
		}
	} else {
		//showStatus("endWebRtcSession already peerDisconnected");
	}

	if(wsConn)
		onlineIndicator.src="green-gradient.svg";
	else
		onlineIndicator.src="";

	answerButton.style.display = "none";
	rejectButton.style.display = "none";

	if(calleeID.startsWith("!")) {
		// go to main page
		window.location.replace("");
		return
	}

	mediaConnect = false;
	rtcConnect = false;
	goOfflineButton.disabled = false;
	goOnlineButton.style.display = "inline-block";
	goOfflineButton.style.display = "inline-block";
	fileselectLabel.style.display = "none";
	progressSendElement.style.display = "none";
	progressRcvElement.style.display = "none";

	// goOnlinePending flag prevents secondary calls to goOnline
	if(goOnlineAfter && !goOnlinePending) {
		// we call goOnline bc we always need a fresh new peerCon
		// however, bc we keep our wsConn as is, no new login will be executed
		// so no new ws-hib will be created on the server side
		goOnlinePending = true;
		if(!gentle) console.log('endWebRtcSession delayed auto goOnline()...');
		setTimeout(function() {
			if(!gentle) console.log('endWebRtcSession auto goOnline()');
			goOnlinePending = false;
			goOnlineButton.disabled = false;
			// get peerCon ready for the next incoming call
			// bc we are most likely still connected, goOnline() will just send "init"
			goOnline();
		},500);
	} else {
		offlineAction();
	}
}

function goOffline() {
	wsAutoReconnecting = false;
	goOfflineButton.disabled = true;
	goOnlineButton.disabled = false;
	console.log('goOffline',calleeID);
	showStatus("");
	stopAllAudioEffects("goOffline");
	waitingCallerSlice = null;

	isHiddenlabel.style.display = "none";
	autoanswerlabel.style.display = "none";
	var waitingCallersLine = document.getElementById('waitingCallers');
	if(waitingCallersLine!=null) {
		waitingCallersLine.innerHTML = "";
	}
	var waitingCallersTitleElement = document.getElementById('waitingCallersTitle');
	if(waitingCallersTitleElement!=null) {
		waitingCallersTitleElement.style.display = "none";
	}
	if(missedCallsElement!=null) {
		missedCallsElement.style.display = "none";
	}
	if(missedCallsTitleElement!=null) {
		missedCallsTitleElement.style.display = "none";
	}
	if(calleeID.startsWith("!")) {
		// go to main page
		window.location.replace("");
		return;
	}

	if(wsConn!=null) {
		// callee going offline
		console.log('wsConn.close()');
		wsConn.close();
		wsConn=null;
		if(!mediaConnect) {
			onlineIndicator.src="";
		}
		goOnlineButton.disabled = false;
	} else {
		if(!mediaConnect) {
			onlineIndicator.src="";
		}
		goOnlineButton.disabled = false;
	}
}

function onIceCandidate(event) {
	var calleeCandidate = event.candidate;
	if(calleeCandidate==null) {
		// ICE gathering has finished
		if(!gentle) console.log('onIce: end of calleeCandidates');
	} else if(calleeCandidate.address==null) {
	} else if(dataChannel && dataChannel.readyState=="open") {
		dataChannel.send("cmd|calleeCandidate|"+JSON.stringify(calleeCandidate));
	} else if(wsConn==null) {
		if(!gentle) console.log('onIce callerCandidate: wsConn==null', callerCandidate.address);
	} else if(wsConn.readyState!=1) {
		if(!gentle) console.log('onIce callerCandidate: readyState!=1',	callerCandidate.address, wsConn.readyState);
	} else {
		if(!gentle) console.log('onIce calleeCandidate for signaling', calleeCandidate);
		wsSend("calleeCandidate|"+JSON.stringify(calleeCandidate));
	}
}

var menuDialogOpenFlag = false;
function menuDialogOpen() {
	if(menuDialogOpenFlag) {
		if(!gentle) console.log('# menuDialogOpen menuDialogOpenFlag');
		return;
	}
	//if(!gentle) console.log('menuDialogOpen');
	menuDialogOpenFlag = true;

	hashcounter++;
	location.hash = hashcounter;

	fullScreenOverlayElement.style.display = "block";
	fullScreenOverlayElement.onclick = function() {
		//if(!gentle) console.log('menuDialogOpen fullScreenOverlay click');
		historyBack();
	}
	mainElement.style.filter = "blur(0.8px) brightness(60%)";
	if(wsConn && navigator.cookieEnabled && getCookieSupport()!=null) {
		// cookies avail, "Settings" and "Exit" allowed
		//if(!gentle) console.log('menuSettingsElement on (cookies enabled)');
		if(menuContactsElement) {
			menuContactsElement.style.display = "block";
		}
		if(menuSettingsElement) {
			menuSettingsElement.style.display = "block";
		}
		if(menuExit) {
			menuExit.style.display = "block";
		}
	} else {
		//if(!gentle) console.log('menuSettingsElement off (cookies disabled)');
		if(menuContactsElement) {
			menuContactsElement.style.display = "none";
		}
		if(menuSettingsElement) {
			menuSettingsElement.style.display = "none";
		}
		if(menuExit) {
			menuExit.style.display = "none";
		}
	}

	// position menuDialog at mouse coordinate
    var e = window.event;
    var posX = e.clientX/8 - 50;
	if(posX<0) posX=0;
    var posY = e.clientY;
	if(posY>50) posY-=50;
	//if(!gentle) console.log('menuDialogOpen x/y',posX,posY);
	menuDialogElement.style.left = posX+"px";
	menuDialogElement.style.top = posY+"px";
	menuDialogElement.style.display = "block";
}

function getCookieSupport() {
	// returns: null = no cookies; false = only session cookies; true = all cookies allowed
    var persist= true;
    do {
        var c= 'gCStest='+Math.floor(Math.random()*100000000);
        document.cookie= persist? c+';SameSite=Strict;Secure;expires=Tue, 01-Jan-2030 00:00:00 GMT' : c;
        if (document.cookie.indexOf(c)!==-1) {
            document.cookie= c+';SameSite=Strict;Secure;expires=Sat, 01-Jan-2000 00:00:00 GMT';
            return persist;
        }
    } while (!(persist= !persist));
    return null;
}

var counter=0;
function openContacts() {
	let url = "/callee/contacts?callerId="+calleeID+"&name="+calleeName+"&i="+counter++;
	if(!gentle) console.log('openContacts',url);
	iframeWindowOpen(url);
}

function openSettings() {
	let url = "/callee/settings?id="+calleeID+"&i="+counter++;
	if(!gentle) console.log('openSettings',url);
	iframeWindowOpen(url);
}

function exit() {
	console.log("exit (id=%s)",calleeID);
	mainElement.style.filter = "blur(0.8px) brightness(60%)";
	goOffline();

	if(iframeWindowOpenFlag || menuDialogOpenFlag) {
		console.log("exit historyBack");
		historyBack();
	}

	setTimeout(function() {
		// ask server to delete cookie
		let api = apiPath+"/logout?id="+calleeID;
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			let logoutStatus = xhr.responseText;
			if(!gentle) console.log('exit logoutStatus (%s)',logoutStatus);
		}, function(errString,err) {
			console.log('exit xhr error',errString);
		});

		if(pushRegistration) {
			console.log('exit delete serviceWorker');
			pushRegistration.unregister();
			pushRegistration = null;
		}

		setTimeout(function() {
			console.log("exit reload");
			window.location.reload(false);
		},1000);
	},1000);
}

