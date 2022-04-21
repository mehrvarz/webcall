// WebCall Copyright 2022 timur.mobi. All rights reserved.
'use strict';
const goOnlineButton = document.querySelector('button#onlineButton');
const goOfflineButton = document.querySelector('button#offlineButton');
const answerButton = document.querySelector('button#answerButton');
const rejectButton = document.querySelector('button#rejectButton');
const onlineIndicator = document.querySelector('img#onlineIndicator');
const isHiddenCheckbox = document.querySelector('input#isHidden');
const isHiddenlabel = document.querySelector('label#isHiddenlabel');
const autoanswerCheckbox = document.querySelector('input#autoanswer');
const autoanswerlabel = document.querySelector('label#autoanswerlabel');
const titleElement = document.getElementById('title');
const statusLine = document.getElementById('status');
const msgbox = document.querySelector('textarea#msgbox');
const divspinnerframe = document.querySelector('div#spinnerframe');
const timerElement = document.querySelector('div#timer');
const missedCallsElement = document.getElementById('missedCalls');
const missedCallsTitleElement = document.getElementById('missedCallsTitle');
const form = document.querySelector('form#password');
const formPw = document.querySelector('input#current-password');
const menuSettingsElement = document.getElementById('menuSettings');
//const menuContactsElement = document.getElementById('menuContacts');
const iconContactsElement = document.getElementById('iconContacts');
const dialIdElement = document.getElementById('dialId');
const exclamationElement = document.getElementById('exclamation');
const bitrate = 280000;
const autoReconnectDelay = 15;
const clientVersion = "2.0.10";
const singlebutton = false;
const calleeMode = true;

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
var mediaConnectStartDate = 0;
var listOfClientIps = "";
var callerID = "";
var callerName = "";
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
var buttonBlinking = false;
var onGotStreamGoOnline = false;
var autoPlaybackFile = "";
var waitingCallerSlice = null;
var missedCallsSlice = null;
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
var loginResponse=false;
var minNewsDate=0;

window.onload = function() {
	if(!navigator.mediaDevices) {
		console.warn("navigator.mediaDevices not available");
		goOnlineButton.disabled = true;
		goOfflineButton.disabled = true;
		alert("navigator.mediaDevices not available");
		return;
	}

	window.onhashchange = hashchange;

	let id = getUrlParams("id");
	if(typeof id!=="undefined" && id!="") {
		calleeID = id;
	}
	gLog("calleeID "+calleeID);

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
		// TODO: allow user to enter a username?
		showStatus("CalleeID missing in URL",-1);
		goOnlineButton.disabled = true;
		goOfflineButton.disabled = true;
		return;
	}

	// remote on start fragment/hash ('#') in URL
	if(location.hash.length > 0) {
		gLog("location.hash.length="+location.hash.length);
		window.location.replace("/callee/"+calleeID);
		return;
	}

	let auto = getUrlParams("auto");
	if(auto) {
        gLog("onload auto is set ("+auto+")");
		loginResponse=false;
		if(divspinnerframe) {
			divspinnerframe.style.display = "block";
		}
	} else {
        gLog("onload auto is not set");
	}

	if(typeof Android !== "undefined" && Android !== null) {
		fullscreenLabel.style.display = "none";
		let element = document.getElementById("nativeMenu");
		if(element) element.style.display = "block";
		element = document.getElementById("webcallhome");
		if(element) element.href = "https://timur.mobi/webcall/update/";
	}


	minNewsDate = localStorage.getItem('newsdate');
	if(minNewsDate==null) minNewsDate=0;
	// we show news from the server if they are newer than minNewsDate
	// when we show them, we set localStorage.setItem('newsdate', Date.now()/1000) // ms since Jan 1, 1970

	document.onkeydown = (evt) => onkeydownFunc(evt);

	localVideoFrame.onresize = showVideoResolutionLocal;
	remoteVideoFrame.onresize = showVideoResolutionRemote;

	isHiddenCheckbox.addEventListener('change', function() {
		if(this.checked) {
			gLog("isHiddenCheckbox checked");
			autoanswerCheckbox.checked = false;
		}
		wsSend("calleeHidden|"+this.checked);
		setTimeout(function(){history.back();},150);
	});

	autoanswerCheckbox.addEventListener('change', function() {
		if(this.checked) {
			gLog("autoanswerCheckbox checked");
			isHiddenCheckbox.checked = false;
			wsSend("calleeHidden|false");
		}
		setTimeout(function(){history.back();},150);
	});

	fullscreenCheckbox.addEventListener('change', function() {
		if(this.checked) {
			// user is requesting fullscreen mode
			if(!document.fullscreenElement) {
				// not yet in fullscreen-mode
				if(mainElement.requestFullscreen) {
					// switch to fullscreen mode
					mainElement.requestFullscreen();
				}
			}
		} else {
			// user is requesting fullscreen exit
			document.exitFullscreen().catch(err => { });
		}
		setTimeout(function(){history.back();},150);
	});
	document.addEventListener('fullscreenchange', (event) => {
		if(document.fullscreenElement) {
			fullscreenCheckbox.checked = true;
		} else {
			fullscreenCheckbox.checked = false;
		}
	});

	checkServerMode(function(mode) {
		if(mode==0 || mode==1) {
			// normal mode
			console.log('onload load audio files '+mode);
			ringtoneSound = new Audio('1980-phone-ringing.mp3');
			busySignalSound = new Audio('busy-signal.mp3');
			notificationSound = new Audio("notification.mp3");

			ringtoneSound.onplaying = function() {
				ringtoneIsPlaying = true;
			};
			ringtoneSound.onpause = function() {
				ringtoneIsPlaying = false;
			};

			var calleeIdTitle = calleeID.charAt(0).toUpperCase() + calleeID.slice(1);
			document.title = "WebCall Callee "+calleeIdTitle;
			if(titleElement) {
				titleElement.innerHTML = "WebCall Callee "+calleeIdTitle;
			}

			calleeID = calleeID.toLowerCase();
			gLog('onload calleeID lowercase '+calleeID);
			if(mode==1 || mode==3 || wsSecret!="") {
				gLog('onload pw-entry not required with cookie/wsSecret');
				// we have a cockie, so no manual pw-entry is needed
				// turn automatic online off, user needs to interact before we can answer calls
				onGotStreamGoOnline = false;

				if(!wsConn) {
					goOfflineButton.disabled = true; // can't go offline if not connected
				}
				if(auto) {
					// if loaded by android callee, set onGotStreamGoOnline=true to cause goOnline()
					onGotStreamGoOnline=true;
				}
				start();
				return;
			}

			// end spinner
			if(divspinnerframe) {
				divspinnerframe.style.display = "none";
			}

			gLog('onload pw-entry is needed '+mode);
			onGotStreamGoOnline = true;
			goOnlineButton.disabled = true;
			goOfflineButton.disabled = true;
			enablePasswordForm();
			return;
		}

		// end spinner
		if(divspinnerframe) {
			divspinnerframe.style.display = "none";
		}

		if(mode==2) {
			// mode==2: server is in maintenance mode
			let mainParent = containerElement.parentNode;
			mainParent.removeChild(containerElement);
			var msgElement = document.createElement("div");
			msgElement.style = "margin-top:15%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-size:1.2em; line-height:1.5em;";
			msgElement.innerHTML = "<div>WebCall server is currently in maintenance mode.<br>Please try again a little later.</div>";
			mainParent.appendChild(msgElement);
		}

		if(mode==3) {
			// mode==3: server is not accessible
		}
		return;
	});
}

function videoOn() {
	// open local video-frame (it is not yet streaming, but locally visible)
	gLog("videoOn");
	constraintString = defaultConstraintString;
	setVideoConstraintsGiven();
	localVideoShow();

	// enable local video
	if(peerCon && peerCon.iceConnectionState!="closed" &&
			rtcConnect && addLocalVideoEnabled && localStream.getTracks().length>=2 && !addedVideoTrack) {
		if(localCandidateType=="relay" || remoteCandidateType=="relay") {
			gLog('videoOn no addTrack video on relayed con '+localCandidateType+' '+remoteCandidateType);
		} else {
			gLog('videoOn addTrack vid '+localStream.getTracks()[1]);
			addedVideoTrack = peerCon.addTrack(localStream.getTracks()[1],localStream);
		}
	}

	localVideoFrame.volume = 0; // avoid audio feedback / listening to own mic
	localVideoFrame.muted = 0;

	// start localVideoFrame playback, setup the localVideo pane buttons
	vmonitor();

	// switch avSelect.selectedIndex to 1st video option
	getStream().then(() => navigator.mediaDevices.enumerateDevices())
	.then((deviceInfos) => {
		gotDevices(deviceInfos);

		if(videoEnabled) {
			// switch to the 1st video option
			let optionElements = Array.from(avSelect);
			if(optionElements.length>0) {
				gLog("videoOn avSelect.selectedIndex count "+optionElements.length);
				for(let i=0; i<optionElements.length; i++) {
					if(optionElements[i].text.startsWith("Video")) {
						gLog("videoOn avSelect.selectedIndex set "+i);
						avSelect.selectedIndex = i;
						getStream(optionElements[i]);
						break;
					}
				}
			}

			if(videoEnabled && mediaConnect && !addLocalVideoEnabled && vsendButton) {
				gLog('videoOn mediaConnect, blink vsendButton');
				vsendButton.classList.add('blink_me');
				setTimeout(function() { vsendButton.classList.remove('blink_me') },10000);
			}
		}
	});
}

function videoOff() {
	// hide/close localVideoFrame (not needed anymore)
	gLog("videoOff");
	myUserMediaDeviceId = null;
	localVideoHide();
	if(localStream) {
		connectLocalVideo(true);
	}

	if(!rtcConnect) {
		if(localStream) {
			if(peerCon && peerCon.iceConnectionState!="closed" && addedAudioTrack) {
				gLog("videoOff !rtcConnect peerCon.removeTrack(addedAudioTrack)");
				peerCon.removeTrack(addedAudioTrack);
				addedAudioTrack = null;
			}

			gLog("videoOff !rtcConnect localStream stop");
			localStream.getTracks().forEach(track => { track.stop(); });
			localStream = null;
		}
		gLog("videoOff !rtcConnect shut localVideo");
		localVideoFrame.pause();
		localVideoFrame.currentTime = 0;
		localVideoFrame.srcObject = null;

		gLog("videoOff !rtcConnect shut remoteVideo");
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
		remoteVideoHide();
		remoteStream = null;

		if(dataChannel) {
			gLog("videoOff !rtcConnect dataChannel still set "+dataChannel.readyState);
		}
	}

	// switch to the 1st audio option
	let optionElements = Array.from(avSelect);
	if(optionElements.length>0) {
		gLog("videoOff avSelect len "+optionElements.length);
		for(let i=0; i<optionElements.length; i++) {
			if(optionElements[i].text.startsWith("Audio")) {
				gLog("videoOff avSelect idx "+i);
				avSelect.selectedIndex = i;
				getStream(optionElements[i]);
				break;
			}
		}
		if(rtcConnect) {
			// activate selected device
			gLog("videoOff rtcConnect getStream()");
			getStream();
		}
	}
}

function checkServerMode(callback) {
	if(typeof Android !== "undefined" && Android !== null) {
		// in android mode if already connected return mode==1
		if(Android.isConnected()>0) {
			callback(1);
			return;
		}
	}
	
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
		//gLog("getUrlParams search=%s",window.location.search);
		var query = window.location.search.substring(1);
		var parts = query.split("&");
		for (var i=0;i<parts.length;i++) {
			//gLog("getUrlParams part(%d)=%s",i,parts[i]);
			var seg = parts[i].split("=");
			if (seg[0] == param) {
				//gLog("getUrlParams found=(%s)",seg[1]);
				if(typeof seg[1]!=="undefined" && seg[1]!="" && seg[1]!="undefined") {
					return decodeURI(seg[1]);
				}
				return true;
			}
		}
	}
	if(param=="id") {
		let path = window.location.pathname;
		let lastSlash = path.lastIndexOf("/");
		let value = path.substring(lastSlash+1);
		gLog("getUrlParams id val="+value);
		return value;
	}
	return false;
}

function showPw() {
	if(formPw.type=="password") {
		formPw.type="text";
	} else {
		formPw.type="password";
	}
}

function enablePasswordForm() {
	gLog('enter password for calleeID='+calleeID);
	showStatus("Login calleeID: "+calleeID,-1);
	document.getElementById("current-password").value = "";
	form.style.display = "block";
	document.getElementById("username").focus();
	//gLog("form username "+document.getElementById("username").value);
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
	gLog('start callee with ID='+calleeID);

	goOnlineButton.onclick = function() {
		lastUserActionDate = Date.now();
		goOnline();
	}
	goOfflineButton.onclick = function() {
		lastUserActionDate = Date.now();
		goOffline();
	};
	try {
		getStream().then(() => navigator.mediaDevices.enumerateDevices()).then(gotDevices);
		//getStream() -> getUserMedia(constraints) -> gotStream() -> goOnline() -> login()
	} catch(ex) {
		console.log('ex while searching for audio devices',ex.message);
		// end spinner
		if(divspinnerframe) {
			divspinnerframe.style.display = "none";
		}
	}
}

function login(retryFlag) {
	gLog("login to signaling server..."+retryFlag+" "+calleeID+" "+wsSecret.length);
	let api = apiPath+"/login?id="+calleeID;
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			api = api + "&ver="+Android.getVersionName();
		}
		if(typeof Android.webviewVersion !== "undefined" && Android.webviewVersion !== null) {
			api = api + "_" + Android.webviewVersion();
		}
	} else {
		api = api + "&ver="+clientVersion;
	}
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		// processData
		let loginStatus = xhr.responseText;
		//gLog('loginStatus '+loginStatus);

		// end spinner
		loginResponse=true;
		if(divspinnerframe) {
			divspinnerframe.style.display = "none";
		}

		var parts = loginStatus.split("|");
		if(parts.length>=1 && parts[0].indexOf("wsid=")>=0) {
			wsAddr = parts[0];
			// we're now a logged-in callee-user
			gLog('login wsAddr='+wsAddr);

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
			gLog('outboundIP '+outboundIP);

			let api = apiPath+"/getsettings?id="+calleeID;
			gLog('login getsettings api '+api);
			ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
				if(xhr.responseText!="") {
					let serverSettings = JSON.parse(xhr.responseText);
					if(typeof serverSettings.nickname!=="undefined") {
						calleeName = serverSettings.nickname;
						gLog('login calleeName '+calleeName);
					}
				}
			}, function(errString,errcode) {
				console.log('login xhr error',errString);
			});
/*
			if(!pushRegistration) {
				// we retrieve the pushRegistration here under /callee/(calleeID),
				// so that the pushRegistration.scope will also be /callee/(calleeID)
				// so that settings.js will later make use of the correct pushRegistration
				gLog("serviceWorker.register...");
				navigator.serviceWorker.register('service-worker.js');
				// get access to the registration (and registration.pushManager) object
				navigator.serviceWorker.ready.then(function(registration) {
					pushRegistration = registration;
					gLog("serviceWorker.ready "+pushRegistration);
				}).catch(err => {
					// this means that push events won't work
					// no need to abort login process
					console.log("serviceWorker.ready err",err.message);
				});
			}
*/
			if(parts.length>=5 && parts[4]=="true") {
				isHiddenCheckbox.checked = true;
				autoanswerCheckbox.checked = false;
			}
			gLog('isHiddenCheckbox.checked '+isHiddenCheckbox.checked);
			wsSend("init|!"); // -> connectSignaling()
			return;
		}

		let mainLink = window.location.href;
		let idx = mainLink.indexOf("/calle");
		if(idx>0) {
			mainLink = mainLink.substring(0,idx); //+ "/webcall";
		}
/*
		if(loginStatus=="noservice") {
			wsSecret = "";
			showStatus("Service error<br><a href='"+mainLink+"'>Main page</a>",-1);
			form.style.display = "none";
		} else
*/
		if(loginStatus=="notregistered") {
			wsSecret = "";
			showStatus("User ID unknown<br>",-1);
			form.style.display = "none";
		} else if(loginStatus=="busy") {
			showStatus("User is busy",-1);
			form.style.display = "none";
		} else if(loginStatus=="error") {
			// loginStatus "error" = "wrong pw", "pw has less than 6 chars" or "empty pw"
			// offer pw entry again
			gLog('login error - try again');
			goOnlineButton.disabled = true;
			enablePasswordForm();
		} else if(loginStatus=="") {
			showStatus("No response from server",-1);
			form.style.display = "none";
		} else if(loginStatus=="fatal") {
			// loginStatus "fatal" = "already logged in" or "db.GetX err"
			// no use offering pw entry again at this point
			goOffline();
			showStatus(	"Login failed. Already logged in from another device?",-1);
			form.style.display = "none";
		} else {
			goOffline();
			showStatus("Status: "+loginStatus,-1);
			form.style.display = "none";
		}

	}, function(errString,err) {
		// errorFkt
		console.log('xhr error '+errString+" "+err);
		if(err==502 || errString.startsWith("fetch")) {
			showStatus("No response from server",-1);
		} else {
			showStatus("XHR error "+err,3000);
		}

		// end spinner
		if(divspinnerframe) {
			divspinnerframe.style.display = "none";
		}

		waitingCallerSlice = null;
		missedCallsSlice = null;
		var waitingCallersElement = document.getElementById('waitingCallers');
		if(waitingCallersElement) {
			waitingCallersElement.innerHTML = "";
		}
		var waitingCallersTitleElement = document.getElementById('waitingCallersTitle');
		if(waitingCallersTitleElement) {
			waitingCallersTitleElement.style.display = "none";
		}
		if(retryFlag) {
			setTimeout(function() {
				let delay = autoReconnectDelay + Math.floor(Math.random() * 10) - 5;
				gLog('reconnecting in '+delay);
				showStatus("Reconnecting...",-1);
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
	gLog('offlineAction');
	goOnlineButton.disabled = false;
	goOfflineButton.disabled = true;
	if(!mediaConnect) {
		onlineIndicator.src="";
	}
}

function gotStream2() {
	if(pickupAfterLocalStream) {
		pickupAfterLocalStream = false;
		gLog('gotStream2 -> auto pickup2()');
		pickup2();
	} else {
		if(localStream && !videoEnabled && !rtcConnect) {
			// mute (disable) mic until a call
			gLog('gotStream2 disable localStream');
			localStream.getTracks().forEach(track => { track.stop(); });
			const audioTracks = localStream.getAudioTracks();
			localStream.removeTrack(audioTracks[0]);
			localStream = null;
		}
		if(onGotStreamGoOnline && !rtcConnect) {
			gLog('gotStream2 onGotStreamGoOnline goOnline');
			goOnline();
		}
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
			// lastUserActionDate set by goOnline() and goOffline() is newer (happened later) than startPauseDate
			// user has initiated goOnline or goOffline, so we stop AutoReconnect
			wsAutoReconnecting = false;
			// but if we have a connection now, we don't kill it
			if(!wsConn) {
				gLog('delayedWsAutoReconnect aborted on user action '+
					startPauseDate+' '+lastUserActionDate);
				offlineAction();
			}
		} else if(!wsAutoReconnecting) {
			gLog('delayedWsAutoReconnect aborted on !wsAutoReconnecting');
			wsAutoReconnecting = false;
			//offlineAction();
		} else if(remainingTalkSecs<0 && !calleeID.startsWith("answie")) {
			gLog('delayedWsAutoReconnect aborted on no talk time');
			wsAutoReconnecting = false;
			offlineAction();
		} else if(remainingServiceSecs<0 && !calleeID.startsWith("answie")) {
			gLog('delayedWsAutoReconnect aborted on no service time');
			wsAutoReconnecting = false;
			offlineAction();
		} else {
			gLog('delayedWsAutoReconnect login...');
			login(true); // -> connectSignaling("init|")
		}
	},reconPauseSecs*1000);
}

function showOnlineReadyMsg(sessionIdPayload) {
	// sessionIdPayload may contain a string with the client version number
	if(!wsConn) {
		console.log('showOnlineReadyMsg not online');
		return;
	}

	msgbox.style.display = "none";

	let msg1 = "";
	if(isHiddenCheckbox.checked) {
		msg1 =  "Your online status is hidden. "+
				"Go to Menu to turn this off.<br>"
	}
//	gLog('showOnlineReadyMsg', clientVersion, sessionIdPayload);
//	if(sessionIdPayload!="" && clientVersion<sessionIdPayload) {
//		msg1 += "Software update available. Reload to update.<br>";
//	}

	let calleeLink = window.location.href;
	let userLink = calleeLink.replace("callee/","user/");
	let idxParameter = userLink.indexOf("?");
	if(idxParameter>=0) {
		userLink = userLink.substring(0,idxParameter);
	}
	idxParameter = userLink.indexOf("#");
	if(idxParameter>=0) {
		userLink = userLink.substring(0,idxParameter);
	}
	//userLink = userLink.replace("calle2/","user/");
	let msg2 = "You will receive calls made by this link:<br>"+
		"<a target='_blank' href='"+userLink+"'>"+userLink+"</a><br>";

	if(msg1!="") {
		// show 2 msgs after another
		showStatus(msg1,2500);
		setTimeout(function() {
			showStatus(msg2,-1);
		},2800);
	} else {
		// show 1 msg
		showStatus(msg2,-1);
	}
}

let tryingToOpenWebSocket = false;
let wsSendMessage = "";
function connectSignaling(message,comment) {
	console.log('connect to signaling server '+comment);
    var wsUrl = wsAddr;

	tryingToOpenWebSocket = true;
	wsSendMessage = message;

	if(typeof Android !== "undefined" && Android !== null) {
		// wsUrl will only be used if service:wsClient==null
		// but on server triggered reconnect, service:wsClient will be set (and wsUrl will not be used)
		wsConn = Android.wsOpen(wsUrl);
		// service -> wsCli=connectHost(wsUrl) -> onOpen() -> runJS("wsOnOpen()",null) -> wsSendMessage ("init|!")
		//gLog("connectSig "+wsUrl);
	} else {
		if(!window["WebSocket"]) {
			console.error('connectSig: no WebSocket support');
			showStatus("No WebSocket support");
			if(!mediaConnect) {
				onlineIndicator.src="";
			}
			return;
		}
	    gLog('connectSig: open ws connection... '+calleeID+' '+wsUrl);
		wsConn = new WebSocket(wsUrl);
		wsConn.onopen = wsOnOpen;
		wsConn.onerror = wsOnError;
		wsConn.onclose = wsOnClose;
		wsConn.onmessage = wsOnMessage;
	}
}

function wsOnOpen() {
	// called by service connectHost(wsUrl) -> onOpen() -> runJS("wsOnOpen()",null)
	gLog('wsOnOpen '+calleeID);
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
	if(wsSendMessage!="") {
		gLog('ws connection send '+wsSendMessage);
		wsSend(wsSendMessage);
		wsSendMessage = "";
	}
	isHiddenlabel.style.display = "block";
	autoanswerlabel.style.display = "block";
	menuSettingsElement.style.display = "block";
	iconContactsElement.style.display = "block";
	dialIdElement.style.display = "block";
	goOfflineButton.disabled = false;
}

function wsOnError(evt) {
	wsOnError2(evt.data);
}

function wsOnError2(str) {
	//console.log("wsOnError2 "+str);
	if(str!="") {
		showStatus(str,-1);
	}
	onlineIndicator.src="";
	wsConn=null;
}

function wsOnClose(evt) {
	// called by wsConn.onclose
	console.log("wsOnClose "+calleeID);
	wsOnClose2();
	if(tryingToOpenWebSocket) {
		// onclose occured while trying to establish a ws-connection (before this could be finished)
		gLog('wsOnClose failed to open');
	} else {
		// onclose occured while being ws-connected
		gLog('wsOnClose while connected');
	}
	if(goOnlineButton.disabled && evt) {
		// this is not a user-intended offline; we should be online
		let delay = autoReconnectDelay + Math.floor(Math.random() * 10) - 5;
		gLog('reconnecting to signaling server in sec '+delay);
		showStatus("Reconnecting to signaling server...",-1);
		missedCallsElement.style.display = "none";
		missedCallsTitleElement.style.display = "none";
		// if conditions are right after delay secs this will call login()
		delayedWsAutoReconnect(delay);
	}
}

function wsOnClose2() {
	// called by wsOnClose() or from android service
	console.log("wsOnClose2 "+calleeID);
	wsConn=null;
	buttonBlinking=false;
	stopAllAudioEffects("wsOnClose");
	showStatus("disconnected from signaling server");
	if(!mediaConnect) {
		onlineIndicator.src="";
	}
}

function wsOnMessage(evt) {
	wsOnMessage2(evt.data);
}

function wsOnMessage2(str) {
	// WebCall service uses this to push in msgs from WebCall server
	signalingCommand(str);
}

function signalingCommand(message) {
	//console.log('signalingCommand '+message);
	let tok = message.split("|");
	let cmd = tok[0];
	let payload = "";
	if(tok.length>=2) {
		payload = tok[1];
	}
	//gLog('signaling cmd '+cmd);
	//gLog('signaling payload '+payload);

	if(cmd=="init") {

	} else if(cmd=="dummy") {
		gLog('dummy '+payload);

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
			gLog('callerOffer (incoming call)');
			connectionstatechangeCounter=0;
		} else {
			gLog('callerOfferUpd (in-call)');
		}

		callerDescription = JSON.parse(payload);
		gLog('callerOffer setRemoteDescription '+callerDescription);
		peerCon.setRemoteDescription(callerDescription).then(() => {
			gLog('callerOffer createAnswer');
			peerCon.createAnswer().then((desc) => {
				localDescription = desc;
				gLog('callerOffer in, calleeAnswer out');
				localDescription.sdp =
					maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
				localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
					'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
				peerCon.setLocalDescription(localDescription).then(() => {
					gLog('calleeAnswer localDescription set -> signal');
					if(isDataChlOpen()) {
						dataChannel.send("cmd|calleeAnswer|"+JSON.stringify(localDescription));
					} else {
						wsSend("calleeAnswer|"+JSON.stringify(localDescription));
					}
				}, err => console.error(`Failed to set local descr: ${err.toString()}`));
			}, err => {
				console.warn("failed to createAnswer "+err.message)
				showStatus("Failed to createAnswer",8000);
			});
		}, err => {
			console.warn('callerOffer failed to set RemoteDescription',err.message,callerDescription)
			showStatus("Failed to set RemoteDescription",8000);
		});
	} else if(cmd=="callerAnswer") {
		if(!peerCon) {
			console.warn('callerAnswer abort no peerCon');
			return;
		}
		callerDescription = JSON.parse(payload);

		gLog("callerAnswer setLocalDescription");
		peerCon.setLocalDescription(localDescription).then(() => {
			gLog('callerAnswer setRemoteDescription');
			peerCon.setRemoteDescription(callerDescription).then(() => {
				gLog('callerAnswer setRemoteDescription done');
			}, err => {
				console.warn(`callerAnswer Failed to set RemoteDescription`,err.message)
				showStatus("Cannot set remoteDescr "+err.message);
			});
		}, err => {
			console.warn("callerAnswer setLocalDescription fail",err.message)
			showStatus("Cannot set localDescr"+err.message);
		});

	} else if(cmd=="callerInfo") {
		let idxColon = payload.indexOf(":");
		if(idxColon>=0) {
			callerID = payload.substring(0,idxColon);
			callerName = payload.substring(idxColon+1);
			gLog('cmd callerInfo ('+callerID+') ('+callerName+')');
			// callerID + callerName will be displayed via getStatsCandidateTypes()
		} else {
			gLog('cmd callerInfo payload=(%s)',payload);
		}

	} else if(cmd=="callerCandidate") {
		if(peerCon==null) {
			console.warn('callerCandidate but no peerCon');
			return;
		}
		var callerCandidate = JSON.parse(payload);
		if(callerCandidate.candidate=="") {
			gLog('skip empty callerCandidate');
			return;
		}
		callerCandidate.usernameFragment = null;
		let addIceReloopCounter=0;
		var addIceCallerCandidate = function(callerCandidate) {
			if(!peerCon) {
				console.warn('cmd callerCandidate abort no peerCon');
				return;
			}
			if(!peerCon.remoteDescription) {
				addIceReloopCounter++;
				if(addIceReloopCounter<6) {
					console.warn("cmd callerCandidate !peerCon.remoteDescription "+addIceReloopCounter);
					setTimeout(addIceCallerCandidate,500,callerCandidate);
				} else {
					console.warn("abort cmd callerCandidate !peerCon.remoteDescription");
				}
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

// peerCon.addIceCandidate accept address 192.168.3.209...
// candidate:169636353 1 udp 2122260223 192.168.3.209 40205 typ host generation 0 ufrag /RrR network-id 1
// candidate:1151307505 1 tcp 1518280447 192.168.3.209 9 typ host tcptype active generation 0 ufrag /RrR network-id 1
// candidate:2337567925 1 udp 1686052607 37.201.195.49 47218 typ srflx raddr 192.168.3.209 rport 19890 generation 0 ufrag /RrR network-id 1 L1451
// candidate:240334351 1 udp 41885439 66.228.46.43 50178 typ relay raddr 37.201.195.49 rport 47218 generation 0 ufrag /RrR network-id 1
			gLog("peerCon.addIceCandidate accept address", address, callerCandidate.candidate);
//			gLog("peerCon.addIceCandidate accept address="+address);
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
				console.error("addIce callerCandidate",e.message,payload);
				showStatus("RTC error "+e.message);
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
				// TODO if callerID and/or callerName are avail we would rather show them
				// instead of listOfClientIps
				//showStatus("Caller canceled call ("+
				//	listOfClientIps+" "+localCandidateType+"/"+remoteCandidateType+")",8000);
				//busySignalSound.play().catch(function(error) { });
				//setTimeout(function() {
				//	busySignalSound.pause();
				//	busySignalSound.currentTime = 0;
				//},1000);
			} else {
				// caller canceled call before connect
				//showStatus("Canceled");
			}
			stopAllAudioEffects("incoming cancel2");
			endWebRtcSession(false,true); // -> peerConCloseFunc
		} else {
			stopAllAudioEffects("ignore cancel");
			// TODO no endWebRtcSession ? android service will not know that ringing has ended
		}

	} else if(cmd=="status") {
		// this is currently used to make Android users aware of new releases and Websocket communication issues
		//gLog('status='+payload);
		if(typeof Android !== "undefined" && Android !== null) {
			if(payload!="") {
				setTimeout(function() {
					showStatus(payload,-1);
				},1000);
			}
		}

	} else if(cmd=="sessionId") {
		// callee has checked in
		showOnlineReadyMsg(payload);

	} else if(cmd=="sessionDuration") { // in call
		if(isP2pCon()) {
			// do not show the timer
		} else if(mediaConnect) {
			var sessionDuration = parseInt(payload,10); // maxTalkSecsIfNoP2p
			if(sessionDuration>0 && !timerStartDate) {
				gLog('sessionDuration '+sessionDuration);
				startTimer(sessionDuration);
			}
		}

	} else if(cmd=="serviceData") { // post call
		//gLog('serviceData (%s) tok.length=%d',messages[i],tok.length);
		if(tok.length>=2) {
			talkSecs = parseInt(tok[1], 10);
			if(tok.length>=3) {
				serviceSecs = parseInt(tok[2], 10);
			}
		}

//	} else if(cmd=="calleeInfo") {
//		// this is text-info to be shown (not yet implemented)
//		// maybe the best way to present this, is to put it on top of the current statusMsg
//		// or maybe just put a link there, saying "click here to see new info for you!"

	} else if(cmd=="waitingCallers") {
		waitingCallerSlice = null;
		if(payload.length>0) {
			waitingCallerSlice = JSON.parse(payload);
			//gLog('showWaitingCallers msg',waitingCallerSlice.length);
			if(waitingCallerSlice && waitingCallerSlice.length>0) {
				// TODO would be nice to use a different sound here
				notificationSound.play().catch(function(error) { });
			}
		}
		showWaitingCallers();

	} else if(cmd=="missedCalls") {
		//gLog('showmissedCalls msg',payload.length);
		missedCallsSlice = null;
		if(payload.length>0) {
			missedCallsSlice = JSON.parse(payload);
		}
		showMissedCalls();

	} else if(cmd=="ua") {
		otherUA = payload;
		gLog("otherUA",otherUA);

	} else if(cmd=="rtcNegotiate") {
		// remote video track added by caller
		gLog("rtcNegotiate");
		if(isDataChlOpen()) {
			pickupAfterLocalStream = true;
			getStream(); // -> pickup2() -> "calleeDescriptionUpd"
		}

	} else if(cmd=="rtcVideoOff") {
		// remote video track removed by other side (hide remoteVideoFrame so that audio can still be received)
		gLog("rtcVideoOff");
		remoteVideoHide();

	} else if(cmd=="stopCamDelivery") {
		gLog("stopCamDelivery");
		connectLocalVideo(true);

	} else if(cmd=="news") {
		let newsDate = payload;
		let newsUrl = tok[2];
		let newsDateInt = parseInt(newsDate);
		if(newsDateInt >= minNewsDate) {
			gLog("news="+newsDate+"("+newsDateInt+">"+minNewsDate+")|"+newsUrl);
			if(exclamationElement!=null) {
				exclamationElement.style.display = "block";
				exclamationElement.style.opacity = 1;
				exclamationElement.onclick = function() {

					if(typeof Android !== "undefined" && Android !== null) {
						Android.browse(newsUrl);
					} else {
						// open iframe for newsUrl
						//iframeWindowOpen(newsUrl,"max-width:640px;");
						window.open(newsUrl, "_blank");
					}

					minNewsDate = Math.floor(Date.now()/1000);
					localStorage.setItem('newsdate', minNewsDate);

					let expireInSecs = 5*60;
					gLog("exclamationElement expire in "+expireInSecs);
					setTimeout(function(oldMinNewsDate) {
						gLog("exclamationElement expire "+oldMinNewsDate+" "+minNewsDate);
						if(oldMinNewsDate==minNewsDate) {
							// did NOT receive a new news notification
							exclamationElement.style.opacity = 0;
							setTimeout(function() {
								exclamationElement.style.display = "none";
							},1000);
						}
					},expireInSecs*1000,minNewsDate);
				};
			} else {
				gLog("exclamationElement not defined");
			}
			minNewsDate = newsDateInt;
		} else {
			//gLog("news is old");
		}

	} else {
		gLog('# ignore incom cmd',cmd);
	}
}

function showWaitingCallers() {
	let waitingCallersElement = document.getElementById('waitingCallers');
	if(waitingCallersElement) {
		let waitingCallersTitleElement = document.getElementById('waitingCallersTitle');
		if(waitingCallerSlice==null || waitingCallerSlice.length<=0) {
			waitingCallersElement.innerHTML = "";
			if(waitingCallersTitleElement) {
				waitingCallersTitleElement.style.display = "none";
			}
			return;
		}

		gLog('showWaitingCallers fkt waitingCallerSlice.length',waitingCallerSlice.length);
		let timeNowSecs = Math.floor((Date.now()+500)/1000);
		let str = "<table style='width:100%; border-collapse:separate; border-spacing:6px 2px; line-height:1.5em;'>"
		for(let i=0; i<waitingCallerSlice.length; i++) {
			str += "<tr>"
			let waitingSecs = timeNowSecs - waitingCallerSlice[i].CallTime;
			let waitingTimeString = ""+waitingSecs+" sec";
			if(waitingSecs>50) {
				waitingTimeString = ""+Math.floor((waitingSecs+10)/60)+" min"
			}
//			let callerIp = waitingCallerSlice[i].AddrPort;
//			let callerIpIdxPort = callerIp.indexOf(":");
//			if(callerIpIdxPort>0) {
//				callerIp = callerIp.substring(0,callerIpIdxPort);
//			}
			str += "<td>" + waitingCallerSlice[i].CallerName + "</td><td>"+
			    waitingCallerSlice[i].CallerID + "</td>"+
//				"<td>"+halfShowIpAddr(callerIp) + "</td>"+
				"<td style='text-align:right;'>since "+
				waitingTimeString + "</td><td>"+
				"<a onclick='pickupWaitingCaller(\""+waitingCallerSlice[i].AddrPort+"\")'>"+
				"accept</a></td></tr>";
		}
		str += "</table>";
		waitingCallersElement.innerHTML = str;
		if(waitingCallersTitleElement) {
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

var showCallsWhileInAbsenceCallingItself = false;
function showMissedCalls() {
	if(wsConn==null) {
		// don't execute if client is disconnected
		return;
	}
	if(missedCallsElement) {
		if(missedCallsSlice==null || missedCallsSlice.length<=0) {
			gLog('showWaitingCallers fkt missedCallsSlice == null');
			missedCallsElement.style.display = "none";
			missedCallsElement.innerHTML = "";
			if(missedCallsTitleElement) {
				missedCallsTitleElement.style.display = "none";
			}
			return;
		}
		missedCallsElement.style.display = "block";
		let timeNowSecs = Math.floor((Date.now()+500)/1000);
		let str = "<table style='width:100%; max-width:400px; _background:#4007; border-collapse:separate; _border-spacing:6px 2px; line-height:1.6em;'>"
		for(var i=0; i<missedCallsSlice.length; i++) {
			str += "<tr>"
			let waitingSecs = timeNowSecs - missedCallsSlice[i].CallTime;

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
			let callerIp = missedCallsSlice[i].AddrPort;
			let callerIpIdxPort = callerIp.indexOf(":");
			if(callerIpIdxPort>0) {
				callerIp = callerIp.substring(0,callerIpIdxPort);
			}
			let callerID = missedCallsSlice[i].CallerID;
			let callerLink = callerID;
			let callerName = missedCallsSlice[i].CallerName;
			if(callerName=="") callerName="unknown";
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
				str += "<td>"+callerName + "</td><td>"+
					callerLink + "</td><td style='text-align:right;'>"+
					waitingTimeString + "</td><td>"+
					"<a onclick='deleteMissedCall(\""+
						missedCallsSlice[i].AddrPort+"_"+missedCallsSlice[i].CallTime+"\")'>"+
					"X</a></td>";
			} else {
				str += "<td>"+callerName + "</td><td>"+
					halfShowIpAddr(callerIp) + "</td><td style='text-align:right;'>"+
					waitingTimeString + "</td><td>"+
					"<a onclick='deleteMissedCall(\""+
						missedCallsSlice[i].AddrPort+"_"+missedCallsSlice[i].CallTime+"\")'>"+
					"X</a></td>";
			}
		}
		str += "</table>"
		missedCallsElement.innerHTML = str;
		if(missedCallsTitleElement) {
			missedCallsTitleElement.style.display = "block";
		}

		if(showCallsWhileInAbsenceCallingItself) {
			// already updating itself
		} else {
			showCallsWhileInAbsenceCallingItself = true;
			setTimeout(function() {
				showCallsWhileInAbsenceCallingItself = false;
				showMissedCalls();
			},10000);
		}
	}
}

function halfShowIpAddr(ipAddr) {
	let idxFirstDot = ipAddr.indexOf(".");
	if(idxFirstDot>=0) {
		let idxSecondDot = ipAddr.substring(idxFirstDot+1).indexOf(".")
		if(idxSecondDot>=0) {
			return ipAddr.substring(0,idxFirstDot+1+idxSecondDot+1)+"x.x";
		}
	}
	return ipAddr
}

function deleteMissedCall(callerAddrPortPlusCallTime) {
	gLog('deleteMissedCall',callerAddrPortPlusCallTime);
	wsSend("deleteMissedCall|"+callerAddrPortPlusCallTime);
}

function wsSend(message) {
	if(typeof Android !== "undefined" && Android !== null) {
		if(wsConn==null) {
			// currently not connected to webcall server
			connectSignaling(message,"andr wsConn==null");
			// service -> connectHost(wsUrl) -> onOpen() -> runJS("wsOnOpen()",null) -> wsSendMessage(message)
		} else {
			Android.wsSend(message);
		}
		return;
	}
	if(wsConn==null || wsConn.readyState!=1) {
		// currently not connected to webcall server
		if(wsConn) {
			if(wsConn.readyState==0) {
				gLog('wsSend (state 0 = connecting) '+message);
				wsConn.close();
				wsConn=null;
				offlineAction();
			} else if(wsConn.readyState==2) {
				gLog('wsSend (state 2 = closing)');
				wsConn=null;
				offlineAction();
			} else if(wsConn.readyState==3) {
				gLog('wsSend (state 3 = closed)');
				wsConn=null;
				offlineAction();
			} else {
				gLog('wsSend ws state',wsConn.readyState);
			}
		}
		if(remainingTalkSecs>=0 || calleeID.startsWith("answie")) {
			gLog('wsSend connectSignaling',message);
			connectSignaling(message,"js wsSend not con");
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

	if(typeof Android !== "undefined" && Android !== null) {
		Android.callPickedUp();
	}
}

function pickup2() {
	gLog('pickup2');
	showStatus("");
	stopAllAudioEffects("pickup2");

	if(!localStream) {
		console.warn('pickup2 no localStream');
		return;
	}

	answerButton.disabled = true;

	if(remoteStream) {
		gLog('pickup2 peerCon start remoteVideoFrame');
		remoteVideoFrame.srcObject = remoteStream;
		remoteVideoFrame.play().catch(function(error) {	});
	}

	// before we send "pickup|!" to caller allow some time for onnegotiation to take place
	setTimeout(function() {
		gLog('pickup2: after short delay send pickup to caller');
		wsSend("pickup|!"); // make caller unmute our mic on their side

		onlineIndicator.src="red-gradient.svg";
		mediaConnect = true;
		if(vsendButton) {
			vsendButton.style.display = "inline-block";
		}
		if(localStream) {
			const audioTracks = localStream.getAudioTracks();
			audioTracks[0].enabled = true;
		}
		mediaConnectStartDate = Date.now();
		if(typeof Android !== "undefined" && Android !== null) {
			Android.peerConnect();
		}

		if(!isDataChlOpen()) {
			gLog('do not enable fileselectLabel: !isDataChlOpen');
		} else if(!isP2pCon()) {
			gLog('do not enable fileselectLabel: !isP2pCon()');
		} else {
			gLog('enable fileselectLabel');
			fileselectLabel.style.display = "block";
		}

		setTimeout(function() {
			if(videoEnabled && !addLocalVideoEnabled) {
				gLog('full mediaConnect, blink vsendButton');
				vsendButton.classList.add('blink_me');
				setTimeout(function() { vsendButton.classList.remove('blink_me') },10000);
			}

			if(peerCon) {
				// send "log|connected" to server
				peerCon.getStats(null)
				.then((results) => getStatsCandidateTypes(results,"Connected","Mic is open"),
					err => console.log(err.message));
			}
		},200);
	},400);
}

function hangup(dummy,dummy2,message) {
	showStatus("Hang up",4000);
	console.log("hangup");
	answerButton.style.display = "none";
	rejectButton.style.display = "none";

	remoteVideoFrame.srcObject = null;
	remoteVideoHide();

	// if mediaConnect -> play short busy tone
	if(mediaConnect) {
		gLog("hangup short busy sound");
		busySignalSound.play().catch(function(error) { });
		setTimeout(function() {
			busySignalSound.pause();
			busySignalSound.currentTime = 0;
			stopAllAudioEffects("hangup mediaConnect busy");
		},1000);
	} else {
		stopAllAudioEffects("hangup no mediaConnect");
	}

	connectLocalVideo(true); // force disconnect
	endWebRtcSession(true,true);
	vsendButton.classList.remove('blink_me')

	if(localStream && !videoEnabled) {
		gLog('videoOff clear localStream');
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
		gLog('goOnline() goOnlineButton.disabled');
		return;
	}

	goOnlineButton.disabled = true;
	goOfflineButton.disabled = false;
	rtcConnectStartDate = 0;
	mediaConnectStartDate = 0;
	gLog('goOnline '+calleeID);
	addedAudioTrack = null;
	addedVideoTrack = null;
	if(divspinnerframe) {
		if(typeof Android !== "undefined" && Android !== null && Android.isConnected()>0) {
			// if already connected don't show spinner (we are most likely called by wakeGoOnline())
		} else {
			setTimeout(function() {
				if(!loginResponse) {
					//gLog('goOnline no loginResponse enable spinner');
					divspinnerframe.style.display = "block";
				}
			},200);
		}
	}
	try {
		peerCon = new RTCPeerConnection(ICE_config);
		console.log("new RTCPeerConnection ready");
	} catch(ex) {
		console.error("RTCPeerConnection "+ex.message);
		var statusMsg = "RTCPeerConnection "+ex.message;
		if(typeof Android !== "undefined" && Android !== null) {
			statusMsg += " <a href='https://timur.mobi/webcall/android/#webview'>More info</a>";
		}
		showStatus(statusMsg);

		// end spinner
		if(divspinnerframe) {
			loginResponse=true; // prevent delayed spinner
			divspinnerframe.style.display = "none";
		}
		offlineAction();

		//wsSend("dummy|RTCPeerCon fail");
		return;
	};

	peerCon.onicecandidate = e => onIceCandidate(e,"calleeCandidate");
	peerCon.onicecandidateerror = function(e) {
		// don't warn on 701 (chrome "701 STUN allocate request timed out")
		// 400 = bad request
		if(e.errorCode==701) {
			gLog("# peerCon onicecandidateerror", e.errorCode, e.errorText, e.url);
		} else {
			if(!gentle) console.warn("onicecandidateerror", e.errorCode, e.errorText, e.url);
			showStatus("peerCon iceCandidate error "+e.errorCode+" "+e.errorText,-1);
		}
	}
	peerCon.ontrack = ({track, streams}) => peerConOntrack(track, streams);
	peerCon.onicegatheringstatechange = event => {
		let connection = event.target;
		gLog("peerCon onicegatheringstatechange "+connection.iceGatheringState);
	}
	peerCon.onnegotiationneeded = async () => {
		if(!peerCon) {
			gLog('peerCon onnegotiationneeded deny: no peerCon');
			return;
		}
		if(!rtcConnect) {
			gLog('peerCon onnegotiationneeded deny: no rtcConnect');
			return;
		}
		try {
			// this will trigger onIceCandidates and send hostCandidate's to the client
			gLog("peerCon onnegotiationneeded createOffer");
			localDescription = await peerCon.createOffer();
			localDescription.sdp = maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
			localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
				'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
			peerCon.setLocalDescription(localDescription).then(() => {
				gLog('peerCon onnegotiationneeded localDescription -> signal');
				if(isDataChlOpen()) {
					dataChannel.send("cmd|calleeOffer|"+JSON.stringify(localDescription));
				} else {
					wsSend("calleeOffer|"+JSON.stringify(localDescription));
				}
			}, err => console.error(`Failed to set local descr: ${err.toString()}`));
		} catch(err) {
			console.error("peerCon onnegotiationneeded err",err.message);
		}
	};
	peerCon.onsignalingstatechange = event => {
		gLog("peerCon signalingstatechange "+peerCon.signalingState);
	}
	peerCon.oniceconnectionstatechange = event => {
		gLog("peerCon oniceconnectionstatechange", peerCon.iceConnectionState);
	}
	peerCon.onconnectionstatechange = event => {
		connectionstatechangeCounter++;
		gLog("peerCon connectionstatechange "+peerCon.connectionState);
		if(!peerCon) {
			hangup(true,true,"onconnectionstatechange no peercon");
			return;
		}
		if(peerCon.connectionState=="disconnected" || peerCon.connectionState=="failed") {
			console.log('peerCon disconnected '+rtcConnect+" "+mediaConnect);
			stopAllAudioEffects();
			endWebRtcSession(true,true); // -> peerConCloseFunc
		} else if(peerCon.connectionState=="connected") {
			peerConnected2();
		}
	}

	if(!wsConn) {
		gLog('goOnline have no wsConn');
		login(false);
	} else {
		gLog('goOnline have wsConn send init');
		//setTimeout(function() {
			wsSend("init|!");
		//},500);
	}
}

function peerConnected2() {
	// called when peerCon.connectionState=="connected"
	if(rtcConnect) {
		gLog("peerConnected2 already rtcConnect abort");
		return;
	}
	rtcConnect = true;
	goOfflineButton.disabled = true;
	rtcConnectStartDate = Date.now();
	mediaConnectStartDate = 0;
	gLog("peerConnected2 rtcConnect");

	if(typeof Android !== "undefined" && Android !== null) {
		Android.rtcConnect();
	}

	wsSend("rtcConnect|")

	if(!dataChannel) {
		gLog('peerConnected2 createDataChannel');
		createDataChannel();
	}

	if(ringtoneSound) {
		allAudioEffectsStopped = false;
		var playRingtoneSound = function() {
			if(allAudioEffectsStopped) {
				if(!ringtoneSound.paused && ringtoneIsPlaying) {
					gLog('playRingtoneSound ringtoneSound.pause');
					ringtoneSound.pause();
					ringtoneSound.currentTime = 0;
				} else {
					gLog('playRingtoneSound NO ringtoneSound.pause',
						ringtoneSound.paused, ringtoneIsPlaying);
				}
				return;
			}
			ringtoneSound.onended = playRingtoneSound;

			if(ringtoneSound.paused && !ringtoneIsPlaying) {
				gLog('ringtone play...');
				ringtoneSound.play().catch(error => {
					gLog('ringtone play',error.message);
				});
			} else {
				gLog('ringtone play NOT started',
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
				//gLog("buttonBlinking stop");
				answerButton.style.background = "#04c";
				return;
			}
			gLog("buttonBlinking...");
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
		gLog('accept incoming call?',listOfClientIps);
		peerCon.getStats(null)
		.then((results) => getStatsCandidateTypes(results,"Incoming", ""), err => console.log(err.message)); // -> wsSend("log|callee Incoming p2p/p2p")

		answerButton.disabled = false;
		// only show msgbox if not empty
		if(msgbox.value!="" && !calleeID.startsWith("answie")) {
			msgbox.style.display = "block";
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
			gLog("answer button");
			buttonBlinking = false;
			pickup();
		}
		rejectButton.onclick = function() {
			gLog("hangup button");
			buttonBlinking = false;
			hangup(true,true,"rejectButton");
		}
	},400);
}

function getStatsCandidateTypes(results,eventString1,eventString2) {
	let msg = getStatsCandidateTypesEx(results,eventString1,eventString2)
	wsSend("log|callee "+msg); // shows up in server log as: serveWss peer callee Incoming p2p/p2p

	// we rather show callerID and/or callerName if they are avail, instead of listOfClientIps
	if(callerName!="" || callerID!="") {
		if(callerName=="") {
			msg += " "+callerID;
		} else if(callerName.toLowerCase()==callerID.toLowerCase()) {
			msg += " "+callerName;
		} else {
			msg += " "+callerID+" "+callerName;
		}
	} else if(listOfClientIps!="") {
		msg += " "+listOfClientIps;
	}

	let showMsg = msg;
	if(eventString2!="") {
		showMsg += ". "+eventString2+".";
	}
	if(otherUA!="") {
		showMsg += "<div style='font-size:0.8em;margin-top:8px;color:#aac;'>"+otherUA+"</div>";
	}
	showStatus(showMsg,-1);
}

function createDataChannel() {
	gLog('createDataChannel...');
	peerCon.ondatachannel = event => {
		dataChannel = event.channel;
		dataChannel.onopen = event => {
			gLog("dataChannel.onopen");
		};
		dataChannel.onclose = event => dataChannelOnclose(event);
		dataChannel.onerror = event => dataChannelOnerror(event);
		dataChannel.onmessage = event => dataChannelOnmessage(event);
	};
}

function dataChannelOnmessage(event) {
	if(typeof event.data === "string") {
		gLog("dataChannel.onmessage");
		if(event.data) {
			if(event.data.startsWith("disconnect")) {
				gLog("dataChannel.onmessage on '"+event.data+"'");
				dataChannel.close();
				dataChannel = null;
				hangupWithBusySound(false,"dataChannel.close");
			} else if(event.data.startsWith("msg|")) {
				// sanitize incoming data
				let cleanString = event.data.substring(4).replace(/<(?:.|\n)*?>/gm, "...");
				if(cleanString!="") {
					//gLog("dataChannel.onmessage msg",cleanString);
					if(msgbox) {
						let curDate = new Date().toString();
						// cut off trailing "GMT... (Central European Summer Time)"
						let bracketIdx = curDate.indexOf(" GMT");
						if(bracketIdx>=0) {
							curDate = curDate.substring(0,bracketIdx);
						}
						let msg = "["+curDate+"]\n" + cleanString + "\n";
						msgbox.value = msg;
					}
				}
			} else if(event.data.startsWith("cmd|")) {
				let subCmd = event.data.substring(4);
				signalingCommand(subCmd);
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
		//gLog("binary chunk", chunkSize, fileReceivedSize, fileSize);
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

var allAudioEffectsStopped = false;
function stopAllAudioEffects(comment) {
	if(typeof comment!=="undefined") {
		gLog("stopAllAudioEffects ("+comment+")");
	}
	allAudioEffectsStopped = true;
	try {
		if(!ringtoneSound.paused && ringtoneIsPlaying) {
			gLog('stopAllAudioEffects ringtoneSound.pause');
			ringtoneSound.pause();
			ringtoneSound.currentTime = 0;
		} else {
			gLog('stopAllAudioEffects NO ringtoneSound.pause',
				ringtoneSound.paused, ringtoneIsPlaying);
		}

		busySignalSound.pause();
		busySignalSound.currentTime = 0;
	} catch(ex) {
		console.log('ex stopAllAudioEffects '+ex.message);
	}
	//gLog('stopAllAudioEffects done');
}

var goOnlinePending = false;
function endWebRtcSession(disconnectCaller,goOnlineAfter) {
	gLog('endWebRtcSession start '+disconnectCaller+" "+goOnlineAfter);
	if(remoteVideoFrame) {
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
		remoteVideoHide();
		remoteStream = null;
	}
	buttonBlinking = false;
	if(msgbox) {
		msgbox.value = "";
	}
	stopTimer();
	if(autoPlaybackAudioSource) {
		autoPlaybackAudioSource.disconnect();
		if(autoPlaybackAudioSourceStarted) {
			gLog("endWebRtcSession autoPlayback stop "+autoPlaybackFile);
			autoPlaybackAudioSource.stop();
			autoPlaybackAudioSourceStarted = false;
		}
		autoPlaybackAudioSource = null;
	}

	if(peerCon && peerCon.iceConnectionState!="closed") {
		let peerConCloseFunc = function() {
			// rtcConnect && peerCon may be cleared by now
			if(disconnectCaller) {
				gLog('endWebRtcSession disconnectCaller');
				if(wsConn) {
					gLog('endWebRtcSession wsSend(cancel)');
					wsSend("cancel|disconnect"); // important
				}
				if(isDataChlOpen()) {
					gLog('endWebRtcSession dataChannel.send(disconnect)');
					dataChannel.send("disconnect");
				} else {
					gLog('endWebRtcSession cannot send disconnect to peer');
				}
			}
			if(dataChannel) {
				gLog('endWebRtcSession dataChannel.close');
				dataChannel.close();
				dataChannel = null;
			}
			if(peerCon && peerCon.iceConnectionState!="closed") {
				gLog('endWebRtcSession peerConCloseFunc remove sender tracks');
				const senders = peerCon.getSenders();
				if(senders) {
					try {
						senders.forEach((sender) => { peerCon.removeTrack(sender); })
					} catch(ex) {
						console.warn('endWebRtcSession removeTrack',ex.message);
					}
				}
				gLog('endWebRtcSession peerCon.close');
				peerCon.close();
				gLog('endWebRtcSession peerCon cleared');
			}
		};

		if(rtcConnect && peerCon) {
			gLog('endWebRtcSession getStatsPostCall');
			peerCon.getStats(null).then((results) => {
				getStatsPostCall(results);
				peerConCloseFunc();
			}, err => {
				console.log(err.message);
				peerConCloseFunc();
			});
		} else {
			peerConCloseFunc();
		}
	}

	if(typeof Android !== "undefined" && Android !== null) {
		Android.peerDisConnect();
	}

	if(wsConn)
		onlineIndicator.src="green-gradient.svg";
	else
		onlineIndicator.src="";

	answerButton.style.display = "none";
	rejectButton.style.display = "none";

	mediaConnect = false;
	rtcConnect = false;
	if(vsendButton) {
		vsendButton.style.display = "none";
	}
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
		gLog('endWebRtcSession delayed auto goOnline()...');
		setTimeout(function() {
			gLog('endWebRtcSession auto goOnline()');
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
	if(waitingCallersLine) {
		waitingCallersLine.innerHTML = "";
	}
	var waitingCallersTitleElement = document.getElementById('waitingCallersTitle');
	if(waitingCallersTitleElement) {
		waitingCallersTitleElement.style.display = "none";
	}
	if(missedCallsElement) {
		missedCallsElement.style.display = "none";
	}
	if(missedCallsTitleElement) {
		missedCallsTitleElement.style.display = "none";
	}

	if(wsConn) {
		// callee going offline
		console.log('wsClose');
		if(typeof Android !== "undefined" && Android !== null) {
			Android.wsClose();
		} else {
			wsConn.close();
		}
		wsConn=null;
		if(!mediaConnect) {
			onlineIndicator.src="";
		}
		goOnlineButton.disabled = false;
	} else {
		if(typeof Android !== "undefined" && Android !== null) {
			Android.wsClose();
		}

		if(!mediaConnect) {
			onlineIndicator.src="";
		}
		goOnlineButton.disabled = false;
	}
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
	gLog('openContacts',url);
	iframeWindowOpen(url);
}

function openDialId(userId) {
	let url = "/user/?callerId="+calleeID+"&name="+calleeName+"&i="+counter++;
	if(userId) {
		url = "/user/"+userId+"?callerId="+calleeID+"&name="+calleeName+"&i="+counter++;
	}
	gLog('openDialId',url);
	iframeWindowOpen(url);
// TODO when iframe is closed, we still need to call peerDisConnect()
// to clear peerConnectFlag.set(0), so that the proximity sensor will get turned off
}

function openSettings() {
	let url = "/callee/settings?id="+calleeID+"&i="+counter++;
	gLog('openSettings',url);
	iframeWindowOpen(url);
}

function exit() {
	gLog("exit (id=%s)",calleeID);

	if(typeof Android !== "undefined" && Android !== null) {
		Android.wsExit();
		return;
	}

	containerElement.style.filter = "blur(0.8px) brightness(60%)";
	goOffline();

	if(iframeWindowOpenFlag || menuDialogOpenElement) {
		gLog("exit history.back");
		history.back();
	}

	setTimeout(function() {
		// ask server to delete cookie
		let api = apiPath+"/logout?id="+calleeID;
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			let logoutStatus = xhr.responseText;
			gLog('exit logoutStatus (%s)',logoutStatus);
		}, function(errString,err) {
			console.log('exit xhr error',errString);
		});
/*
		if(pushRegistration) {
			gLog('exit delete serviceWorker');
			pushRegistration.unregister();
			pushRegistration = null;
		}
*/
		setTimeout(function() {
			gLog("exit reload");
			window.location.reload(false);
		},1000);
	},1000);
}

function wakeGoOnline() {
	gLog("wakeGoOnline start");
	connectSignaling('',''); // only get wsConn from service (from Android.wsOpen())
	wsOnOpen(); // green led
	goOnlineButton.disabled = false; // prevent goOnline() abort
	goOnline(); // wsSend("init|!")
	showOnlineReadyMsg('');
	gLog("wakeGoOnline done");
}

