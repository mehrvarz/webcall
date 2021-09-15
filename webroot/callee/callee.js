// WebCall Copyright 2021 timur.mobi. All rights reserved.
'use strict';
const audioSourceSelect = document.querySelector("select#audioSource");
const remoteAudio = document.querySelector('audio#remoteAudio');
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
//const postCallStatsElement = document.getElementById('postCallStats');
//const audioSinkSelect = document.querySelector("select#audioSink");
const bitrate = 280000;
const neverAudio = false;
const autoReconnectDelay = 30;
const version = "1.14.9";

var ringtoneSound = null;
var ringtoneIsPlaying = false;
var busySignalSound = null;
var notificationSound = null;
var wsAddr = "";
var talkSecs = 0;
var maxTalkSecs = 0;
var serviceSecs = 0;
var calleeType = false;
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
var rtcLink = "";
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
var pickupAfterMicStream = false;
var buttonBlinking = true;
var onGotStreamGoOnline = false;
var autoPlaybackFile = "";
var waitingCallerSlice = null;
var callsWhileInAbsenceSlice = null;
var hashcounter=0;
var pushRegistration=null;
var otherUA="";

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
	console.log("calleeID (%s)",calleeID);
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
		console.log("location.hash.length=%d",location.hash.length);
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
				console.log("onhashchange iframeWindowClose");
				iframeWindowClose();
			} else if(menuDialogOpenFlag) {
				console.log("onhashchange menuDialogClose");
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
			console.log('callee esc key');
			if(iframeWindowOpenFlag || menuDialogOpenFlag) {
				historyBack();
			}	
		} else if(evt.key=="!") {
			menuDialogOpen();
		} else {
			//console.log('callee key',evt.key);
		}
	};

	isHiddenCheckbox.addEventListener('change', function() {
		if(this.checked) {
			console.log("isHiddenCheckbox checked");
			autoanswerCheckbox.checked = false;
		}
		// report new hidden state to server
		wsSend("calleeHidden|"+this.checked);
	});
	autoanswerCheckbox.addEventListener('change', function() {
		if(this.checked) {
			console.log("autoanswerCheckbox checked");
			isHiddenCheckbox.checked = false;
			// report new hidden state to server
			wsSend("calleeHidden|false");
		}
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

			if(calleeID.startsWith("random")) {
				if(titleElement) {
					titleElement.innerHTML = "WebCall Roulette";
				}
				wsSecret = "notrequired";
				start();
				return;
			}
			if(calleeID.startsWith("!")) {
				if(titleElement) {
					titleElement.innerHTML = "WebCall Duo";
				}
				wsSecret = calleeID;
				start();
				return;
			}
			if(titleElement) {
				if(calleeID.match(/^[0-9]*$/) != null) {
					// calleeID is pure numeric - don't show
					titleElement.innerHTML = "WebCall Callee";
				} else {
					titleElement.innerHTML = "WebCall Callee "+calleeID;
				}
			}

			calleeID = calleeID.toLowerCase();
			console.log('onload calleeID lowercase (%s)',calleeID);
			if(mode==1) {
				console.log('onload pw-entry not required with cookie');
				// we have a cockie, so no manual pw-entry is needed
				// but let's turn automatic go online off, the user needs to interact before we can answer calls
				onGotStreamGoOnline = false;
				goOfflineButton.disabled = true;
				start();
				return;
			}
			if(wsSecret!="") {
				console.log('onload pw-entry not required with wsSecret',wsSecret.length);
				// we have a pw, so manual pw-entry is not needed
				// but let's turn automatic go online off, the user needs to interact before we can answer calls
				onGotStreamGoOnline = false;
				goOfflineButton.disabled = true;
				start();
				return;
			}

			console.log('onload pw-entry is needed');
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
		var query = window.location.search.substring(1);
		var parts = query.split("&");
		for (var i=0;i<parts.length;i++) {
			var seg = parts[i].split("=");
			if (seg[0] == param) {
				return seg[1];
			}
		}
	} else {
		let path = window.location.pathname;
		let lastSlash = path.lastIndexOf("/");
		return path.substring(lastSlash+1);
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
	audioSourceSelect.onchange = getStream;
	try {
		getStream().then(() => navigator.mediaDevices.enumerateDevices()).then(gotDevices);
		//getStream() -> getUserMedia(constraints) -> gotStream() -> goOnline() -> login()
	} catch(ex) {
		console.log('ex while searching for audio devices',ex);
	}
}

function login(retryFlag) {
	console.log("login to signaling server...", retryFlag, calleeID, wsSecret.length);
	calleeType = false;
	menuElement.style.display = "none";
	let api = apiPath+"/login?id="+calleeID;
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		let loginStatus = xhr.responseText;
		if(!gentle) console.log('loginStatus (%s)',loginStatus);
		var parts = loginStatus.split("|");
		if(parts.length>=1 && parts[0].indexOf("wsid=")>=0) {
			wsAddr = parts[0];
			// we're now a logged-in callee-user
			console.log('loginStatus wsAddr',wsAddr);
			console.log('login success');

			// hide the form
			form.style.display = "none";

			if(parts.length>=2) {
				talkSecs = parseInt(parts[1], 10);
			}
			if(parts.length>=3) {
				maxTalkSecs = parseInt(parts[2], 10); // 0 = nocheck
			}
			if(parts.length>=4) {
				serviceSecs = parseInt(parts[3], 10);
			}
			if(parts.length>=6) {
				let calleeLevel = parseInt(parts[5], 10);
				if(calleeLevel>0) {
					// TODO replace calleeType with calleeLevel everywhere
					calleeType = true;
					menuElement.style.display = "block";
				}
				// provides access to iframeWindowOpen()
				// offer checkbox: [] Hidden
			}
			if(!gentle) console.log('calleeType',calleeType);

			if(!calleeID.startsWith("random") && !calleeID.startsWith("!")) {
				let api = apiPath+"/getsettings?id="+calleeID;
				if(!gentle) console.log('login getsettings api',api);
				ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
					//if(!gentle) console.log('login getsettings xhr.responseText',xhr.responseText);
					if(xhr.responseText!="") {
						// json parse xhr.responseText
						let serverSettings = JSON.parse(xhr.responseText);
						if(typeof serverSettings.nickname!=="undefined") {
							calleeName = serverSettings.nickname;
							console.log('login calleeName',calleeName);
						}
					}
				}, function(errString,errcode) {
					console.log('login xhr error',errString);
				});
			}

			if(calleeType && !pushRegistration) {
				// NOTE: we retrieve the pushRegistration here under /callee/(calleeID),
				// so that the pushRegistration.scope will also be /callee/(calleeID)
				// therefore settings.js will later make use of the correct pushRegistration
				console.log("serviceWorker.register...");
				// TODO: ungoo-chromium logs this error: "Refused to create a worker from ...
				// ...because it violates the following Content Security Policy directive: "worker-src 'none'"
				// and this error cannot be catched by JS; the real problem appears to be
				// that ungoo-chromium does not support a serviceWorker for event 'push'
				let ret = navigator.serviceWorker.register('service-worker.js')
				.then(function(registration) {
					console.log("serviceWorker.register OK",registration);
				}, /*catch*/ function(error) {
					console.log("serviceWorker.register err",error);
				});

				console.log("serviceWorker.ready...",ret);
				// get access to the registration (and registration.pushManager) object
				navigator.serviceWorker.ready.then(function(registration) {
					// here we could print the ret promise
					console.log("serviceWorker.ready promise",ret);
					pushRegistration = registration;
					console.log("serviceWorker.ready got pushRegistration",pushRegistration);
				}).catch(err => {
					console.log("serviceWorker.ready err",err);
				});
			}
			if(parts.length>=7 && parts[6]=="true") {
				isHiddenCheckbox.checked = true;
				autoanswerCheckbox.checked = false;
				//autoanswerCheckbox.disabled = true;
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
			if(calleeID.startsWith("random") || calleeID.startsWith("!")) {
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
		if(calleeID.startsWith("random") || calleeID.startsWith("!")) {
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
				console.log('reconnecting to signaling server in %ds...', delay);
				showStatus("Reconnecting to signaling server...",-1);
				missedCallsElement.style.display = "none";
				missedCallsTitleElement.style.display = "none";
				delayedWsAutoReconnect(delay);
			},4000);
		} else {
			talkSecs=0;
			maxTalkSecs=0;
			serviceSecs=0;
			remainingTalkSecs=0;
			remainingServiceSecs=0;
			offlineAction();
		}
	}, "pw="+wsSecret);
}

function offlineAction() {
	// make buttons reflect offline state
	console.log('offlineAction');
	goOnlineButton.disabled = false;
	goOfflineButton.disabled = true;
}

var xhrTimeout = 30000;
function ajaxFetch(xhr, type, api, processData, errorFkt, postData) {
	xhr.onreadystatechange = function() {
		if(xhr.readyState == 4 && (xhr.status==200 || xhr.status==0)) {
			processData(xhr);
		} else if(xhr.readyState==4) {
			errorFkt("fetch error",xhr.status);
		}
	}
	xhr.timeout = xhrTimeout;
	xhr.ontimeout = function () {
		errorFkt("timeout",0);
	}
	xhr.onerror= function(e) {
		errorFkt("fetching",xhr.status);
	};
	if(!gentle) console.log('xhr send',api);
	xhr.open(type, api, true);
	xhr.setRequestHeader("Content-type", "text/plain; charset=utf-8");
	if(postData) {
		xhr.send(postData);
	} else {
		xhr.send();
	}
}

function getStream() {
	if(localStream) {
		localStream.getTracks().forEach(track => { track.stop(); });
		localStream = null;
	}
	let supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
	if(!gentle) console.log('getStream supportedConstraints',supportedConstraints);

	const audioSource = audioSourceSelect.value;
	const constraints = {
		audio: {
			deviceId: audioSource ? {exact: audioSource} : undefined,
			noiseSuppression: true,     // true by default
			echoCancellation: true,     // true by default?
			autoGainControl: false,     // false in ff, true in chrome
			//echoCancellationType: type, // chrome only: browser, system
		    //channelCount: 2,
		    //volume: 1.0,
		}
	};
	if(!gentle) console.log('getStream getUserMedia',constraints,audioSource);
	if(!neverAudio) {
		return navigator.mediaDevices.getUserMedia(constraints)
			.then(gotStream).catch(function(err) {
				console.error('no audio input device found', err);
				showStatus("No audio input device found<br>"+err,-1);
			});
	}
}

function gotDevices(deviceInfos) {
	for(const deviceInfo of deviceInfos) {
		const option = document.createElement('option');
		option.value = deviceInfo.deviceId;
		if(deviceInfo.kind === 'audioinput') {
			let deviceInfoLabel = deviceInfo.label;
			if(deviceInfoLabel=="Default") {
				deviceInfoLabel="Default Audio Input";
			}
			console.log('gotDevices (%s) (%s)', deviceInfoLabel, audioSourceSelect.length);
			option.text = deviceInfoLabel || `Microphone ${audioSourceSelect.length + 1}`;
			audioSourceSelect.appendChild(option);
		/*
		} else if (deviceInfo.kind === 'videoinput') {
		} else if (deviceInfo.kind === "audiooutput") {
			// looks like FF doesn't report these
			if(audioSinkSelect!=null) {
				option.text = deviceInfo.label || `Speaker ${audioSinkSelect.length + 1}`;
				audioSinkSelect.appendChild(option);
			}
		*/
		}
	}
}

function gotStream(stream) {
	if(!gentle) console.log('gotStream -> set localStream',stream);
	if(stream && audioSourceSelect!=null) {
		audioSourceSelect.selectedIndex = [...audioSourceSelect.options].
			findIndex(option => option.text === stream.getAudioTracks()[0].label);
		if(audioSourceSelect.selectedIndex<0) {
			audioSourceSelect.selectedIndex = 0;
		}
		console.log('gotStream audioSourceSelect index',audioSourceSelect.selectedIndex);
	}

//	if(stream && audioSinkSelect!=null) {
//		audioSinkSelect.selectedIndex = [...audioSinkSelect.options].
//			findIndex(option => option.text === stream.getAudioTracks()[0].label);
//		console.log('gotStream audioSinkSelect index',audioSinkSelect.selectedIndex);
//	}

	localStream = stream;

	if(!gentle) {
		stream.getTracks().forEach(function(track) {
	        console.log("gotStream track.getSettings",track.getSettings());
	    })
	}

	if(pickupAfterMicStream) {
		pickupAfterMicStream = false;
		if(!gentle) console.log('gotStream -> auto pickup2()');
		pickup2();
	} else {
		if(localStream) {
			// disable mic until a call comes in
			if(!gentle) console.log('gotStream disable localStream');
			localStream.getTracks().forEach(track => { track.stop(); });
			const audioTracks = localStream.getAudioTracks();
			localStream.removeTrack(audioTracks[0]);
			localStream = null;
		}
		if(onGotStreamGoOnline) {
			if(!gentle) console.log('gotStream onGotStreamGoOnline goOnline');
			goOnline();
		} else {
			if(!gentle) console.log('gotStream !onGotStreamGoOnline !goOnline');
		}
	}
}

function showStatus(msg,timeoutMs) {
	let sleepMs = 2500;
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
				console.log('delayedWsAutoReconnect aborted on user action',startPauseDate,lastUserActionDate);
				offlineAction();
			}
		} else if(!wsAutoReconnecting) {
			console.log('delayedWsAutoReconnect aborted on !wsAutoReconnecting');
			wsAutoReconnecting = false;
			offlineAction();
		} else if(remainingTalkSecs<0 && !calleeID.startsWith("answie")) {
			console.log('delayedWsAutoReconnect aborted on no talk time');
			wsAutoReconnecting = false;
			offlineAction();
		} else if(remainingServiceSecs<0 && !calleeID.startsWith("answie")) {
			console.log('delayedWsAutoReconnect aborted on no service time');
			wsAutoReconnecting = false;
			offlineAction();
		} else {
			console.log('delayedWsAutoReconnect login...');
			login(true); // -> connectSignaling("init|")
		}
	},reconPauseSecs*1000);
}

function showOnlineReadyMsg(sessionIdPayload) {
	if(!wsConn) {
		console.log('showOnlineReadyMsg not online');
		return;
	}

	if(calleeID.startsWith("random")) {
		showStatus( "You will be connected to the next available caller. Max wait time 30 minutes. Max talk time 15 min (if relayed). Note: Using a laptop or a webcam microphone often leads to poor audio on the other side. A headset eliminates the risk of feedback noises, echos and sound cancellation effects.",-1);
	} else if(calleeID.startsWith("!")) {
		let callerURL = window.location.href;
		callerURL = callerURL.replace("/callee/","/user/");
		var msg = "";
		msg += 'You will receive calls made by this link: <a href="'+callerURL+'" target="_blank">'+callerURL+'</a><br><br>Pass it on! Max wait time 30 min. Max talk time 15 min (if relayed). You must keep this tab open to receive call.<br><br>Note: Using a laptop or a webcam microphone often leads to poor audio on the other side. A headset eliminates the risk of feedback noises, echos and sound cancellation effects.';
		showStatus(msg,-1);
	} else {
		msgbox.style.display = "none";
		var calleeLink = window.location.href;
		calleeLink = calleeLink.replace("callee/","user/");
		let msg = "";
		msg += "You will receive calls made by this link:<br>"+
			"<a target='_blank' href='"+calleeLink+"'>"+calleeLink+"</a><br>";
		if(sessionIdPayload!="" && sessionIdPayload > version) {
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
		if(!calleeID.startsWith("random") && !calleeID.startsWith("!")) {
			if(calleeType) {
				isHiddenlabel.style.display = "block";
				autoanswerlabel.style.display = "block";
			}
		}
		goOfflineButton.disabled = false;
		// start background wsSend loop until !rtcConnect and while wsConn!=null
		//setTimeout(wsHeartbeat, wsHeartbeatPauseSecs*1000);
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
		if(calleeID.startsWith("random") || calleeID.startsWith("!")) {
			setTimeout(function() {
				// this delay prevents this msg from being shown on page reload
				showStatus("Lost signaling server");
			},500);
			return;
		}
		showStatus("Disconnected from signaling server");
		if(!mediaConnect) {
			onlineIndicator.src="";
		}
		if(tryingToOpenWebSocket) {
			// onclose occured before a ws-connection could be established
			console.log('wsConn.onclose failed to open');
		} else {
			console.log('wsConn.onclose after being connected');
		}
		if(goOnlineButton.disabled) {
			// this is not a user-intended offline; we should be online
			let delay = autoReconnectDelay + Math.floor(Math.random() * 10) - 5;
			console.log('reconnecting to signaling server in %ds...', delay);
			showStatus("Reconnecting to signaling server...",-1);
			//notificationSound.play().catch(function(error) { });
			missedCallsElement.style.display = "none";
			missedCallsTitleElement.style.display = "none";
			// if conditions are right after delay secs this will call login()
			delayedWsAutoReconnect(delay);
		}
	};
	wsConn.onmessage = function(evt) {
		var messages = evt.data.split('\n');
		for (var i = 0; i < messages.length; i++) {
			let tok = messages[i].split("|");
			if(tok.length>=2) {
				let cmd = tok[0];
				let payload = tok[1];
				if(cmd=="init") {
					console.log('cmd init');
				} else if(cmd=="callerDescription") {
					if(peerCon==null) {
						console.warn('callerDescription but peerCon==null');
						continue;
					}
					if(!rtcConnect) {
						listOfClientIps = "";
						callerID = "";
						callerName = "";
					}
					console.log('cmd callerDescription');
					// "Uncaught SyntaxError: Unexpected end of JSON input"
					callerDescription = JSON.parse(payload);
					console.log('cmd callerDescription (incoming call)');
					//postCallStatsElement.style.display = "none";
					peerCon.setRemoteDescription(callerDescription).then(() => {
						console.log('callerDescription createAnswer');
						peerCon.createAnswer().then((desc) => {
							localDescription = desc;
							console.log('callerDescription got localDescription');
							localDescription.sdp =
								maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
							localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
								'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
							peerCon.setLocalDescription(localDescription).then(() => {
								console.log('callerDescription localDescription set -> signal');
								wsSend("calleeDescription|"+JSON.stringify(localDescription));
							}, err => console.error(`Failed to set local descr: ${err.toString()}`));
						}, err => {
							// DOMException: Cannot create answer in stable
							console.warn("Failed to createAnswer",err)
							showStatus("Failed to createAnswer",8000);
						});
					}, err => {
						console.warn(`Failed to set RemoteDescription`,err,callerDescription)
						showStatus("Failed to set RemoteDescription",8000);
					});

				} else if(cmd=="callerInfo") {
					let idxColon = payload.indexOf(":");
					if(idxColon>=0) {
						callerID = payload.substring(0,idxColon);
						callerName = payload.substring(idxColon+1);
						console.log('cmd callerInfo (%s) (%s)',callerID,callerName);
					} else {
						console.log('cmd callerInfo payload=(%s)',payload);
					}

				} else if(cmd=="callerDescriptionUpd") {
					if(peerCon==null) {
						console.warn('callerDescription but peerCon==null');
						continue;
					}
					if(!rtcConnect) {
						listOfClientIps = "";
						//callerID = "";
						//callerName = "";
					}
					callerDescription = JSON.parse(payload);
					console.log('cmd callerDescriptionUpd');
					peerCon.setRemoteDescription(callerDescription).then(() => {
						if(callerDescription.type == "offer") {
							console.log('callerDescriptionUpd received offer createAnswer');
							peerCon.createAnswer().then((desc) => {
								localDescription = desc;
								console.log('callerDescriptionUpd got localDescription');
								localDescription.sdp =
									maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
								localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
									'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
								peerCon.setLocalDescription(localDescription).then(() => {
									console.log('callerDescriptionUpd localDescription set -> signal');
									wsSend("calleeDescriptionUpd|"+JSON.stringify(localDescription));
								}, err => console.error(`Failed to set local descr: ${err.toString()}`));
							}, err => {
								// DOMException: Cannot create answer in stable
								console.warn(`Failed to createAnswer`,err)
								showStatus("Failed to createAnswer",8000);
							});
						} else {
							console.log('callerDescriptionUpd received no offer',callerDescription.type);
						}
					}, err => {
						console.warn(`Failed to set RemoteDescription`,err,callerDescription)
						showStatus("Failed to set RemoteDescription",8000);
					});

				} else if(cmd=="callerCandidate") {
					if(peerCon==null) {
						console.warn('callerCandidate but peerCon==null');
						continue;
					}
					var callerCandidate = JSON.parse(payload);
					if(callerCandidate.candidate=="") {
						console.log('skip empty callerCandidate');
						continue;
					}
					callerCandidate.usernameFragment = null;
					var addIceCallerCandidate = function(callerCandidate) {
						if(!peerCon) {
							console.warn('# cmd callerCandidate abort no peerCon');
							return;
						}
						if(!peerCon.remoteDescription) {
							console.warn("# cmd callerCandidate !peerCon.remoteDescription",payload);
							setTimeout(addIceCallerCandidate,100,callerCandidate);
							return;
						}
						let tok = callerCandidate.candidate.split(' ');
						if(tok.length<5) {
							console.warn("# cmd callerCandidate format err",payload);
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
						if(address=="" 
								//|| address=="66.228.46.43"  // TODO use outboundIP?
								//|| address.indexOf(":")>=0
								//|| address.endsWith(".local")
								//|| address.indexOf("10.1.")>=0
							) {
							console.log("# cmd callerCandidate skip address",address,callerCandidate.candidate);
							return;
						}

						if(!gentle) console.log("! peerCon.addIceCandidate accept address",
							address,callerCandidate.candidate);
						if(listOfClientIps.indexOf(address)<0) {
							if(listOfClientIps!="") {
								listOfClientIps += " ";
							}
							listOfClientIps += address;
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
							if(calleeID.startsWith("random") || calleeID.startsWith("!")) {
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
					console.log('cmd sessionId curVers/newVers',version,payload);
					showOnlineReadyMsg(payload);

				} else if(cmd=="sessionDuration") { // in call
					if(localCandidateType!="relay" && remoteCandidateType!="relay") {
						// do not show the timer
					} else if(mediaConnect) {
						var sessionDuration = parseInt(payload,10); // maxTalkSecsIfNoP2p
						if(sessionDuration>0 && !timerStartDate) {
							console.log('sessionDuration',sessionDuration);
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
					console.log('showCallsWhileInAbsence msg',payload.length);
					callsWhileInAbsenceSlice = null;
					if(payload.length>0) {
						callsWhileInAbsenceSlice = JSON.parse(payload);
					}
					showCallsWhileInAbsence();

				} else if(cmd=="ua") {
					otherUA = payload;
					console.log("otherUA",otherUA);

				} else if(cmd=="ping") {
				} else if(cmd=="calleeDescriptionUpd") {
				} else if(cmd=="rtcConnect") {
				} else if(cmd=="confirm") {
				} else if(cmd=="stop") {
				} else if(cmd=="pickup") {
				} else if(cmd=="calleeCandidate") {
				} else if(cmd=="calleeDescription") {
				} else {
					console.warn('ignore incom cmd',cmd);
				}
			} else {
				console.warn('ws message len/tok.length',messages[i].length,tok.length);
			}
		}
	};
}

function showWaitingCallers() {
	let waitingCallersElement = document.getElementById('waitingCallers');
	if(waitingCallersElement!=null) {
		let waitingCallersTitleElement = document.getElementById('waitingCallersTitle');
		if(waitingCallerSlice==null || waitingCallerSlice.length<=0) {
			//console.log('showWaitingCallers fkt waitingCallerSlice == null');
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
			//if(!gentle) console.log('showWaitingCallers %d - %d = %d',
			//	timeNowSecs,callsWhileInAbsenceSlice[i].CallTime, waitingSecs);

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
					//console.log('callerLink',callerLink);
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
	//console.log('halfShowIpAddr',ipAddr);
	let idxFirstDot = ipAddr.indexOf(".");
	//console.log('halfShowIpAddr idxFirstDot',idxFirstDot);
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
		if(remainingTalkSecs>=0 || calleeID.startsWith("random") ||
				calleeID.startsWith("!") || calleeID.startsWith("answie")) {
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

let timerStartDate;
let timerIntervalID=0;
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
}
function updateClock(startDuration) {
	let sinceStartSecs = Math.floor((Date.now() - timerStartDate + 500)/1000);
	let countDownSecs = startDuration - sinceStartSecs;
	if(countDownSecs<=0) {
		countDownSecs=0;
	}
	if(countDownSecs==120 || countDownSecs==60 || countDownSecs==30 || countDownSecs==15) {
		notificationSound.play().catch(function(error) { });
	}
	let timerMin = Math.floor(countDownSecs/60);
	let timerSec = countDownSecs - timerMin*60;
	let timerSecStr = ""+timerSec;
	if(timerSec<10) {
		timerSecStr = "0"+timerSecStr;
	}
	timerElement.innerHTML = ""+timerMin+":"+timerSecStr;
	if(countDownSecs<=0) {
		if(!gentle) console.log('updateClock countDownSecs<=0 stopTimer',countDownSecs);
		stopTimer();
	}
}

function pickup() {
	console.log('pickup -> open mic');
	pickupAfterMicStream = true;
	getStream(); // -> pickup2()
}
function pickup2() {
	console.log('pickup2');
	showStatus("");
	stopAllAudioEffects("pickup");
	if(!localStream) { // from gotStream(stream)
		console.warn('pickup2 no localStream');
		return;
	}

	//console.log('pickup2 remoteAudio.play()');
	remoteAudio.srcObject = remoteStream; // see 'peerCon.ontrack onunmute'
	remoteAudio.load();
	remoteAudio.play().catch(function(error) {});

	const audioTracks = localStream.getAudioTracks();
	audioTracks[0].enabled = true;
	if(!gentle) console.log('pickup2 peerCon addTrack mic',audioTracks.length,audioTracks,localStream);
	peerCon.addTrack(audioTracks[0],localStream);

	setTimeout(function() {
		// caller may need a bit of time to receive peerCon.ontrack
		if(!gentle) console.log('pickup2: after short delay send pickup to caller');
		wsSend("pickup|!") // make caller unmute the remote (our) mic
		answerButton.disabled = true;
		onlineIndicator.src="red-gradient.svg";
		onnegotiationneededAllowed = true;
		mediaConnect = true;
		mediaConnectStartDate = Date.now();

		setTimeout(function() {
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

	// if mediaConnect -> play short busy tone 
	if(mediaConnect) {
		console.log("hangup: mediaConnect -> short busy sound");
		busySignalSound.play().catch(function(error) { });
		setTimeout(function() {
			busySignalSound.pause();
			busySignalSound.currentTime = 0;
			stopAllAudioEffects();
		},1000);
	}

	endWebRtcSession(true,true); // -> peerConCloseFunc
	//if(!gentle) console.log("hangup done");
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
	//console.warn("ICE_config",ICE_config);
	try {
		peerCon = new RTCPeerConnection(ICE_config);
	} catch(ex) {
		console.error("RTCPeerConnection",ex);
		showStatus("RTCPeerConnection error "+ex);
		offlineAction();
		return
	};
	peerCon.onicecandidate = e => onIceCandidate(e);
	peerCon.onicecandidateerror = function(e) {
		if(!gentle) console.warn("onicecandidateerror", e.errorCode, e.errorText, e.url);
		// chrome warn "701 STUN allocate request timed out" apparently related to pion turn not supporting ipv6
	}
	peerCon.ontrack = ({track, streams}) => {
		track.onunmute = () => {
			if(remoteAudio.srcObject == streams[0]) {
				if(!gentle) console.warn('peerCon.ontrack onunmute was already set');
				return;
			}
			if(!gentle)
				console.log('peerCon.ontrack onunmute set remoteAudio.srcObject',streams[0]);
			//remoteAudio.srcObject = streams[0];
			remoteStream = streams[0];
		};
	};
	peerCon.onicegatheringstatechange = event => {
		let connection = event.target;
		console.log("onicegatheringstatechange", connection.iceGatheringState);
	}
	peerCon.onnegotiationneeded = async () => {
		if(!peerCon) {
			if(!gentle) console.warn('onnegotiationneeded no peerCon');
			return;
		}
		if(!onnegotiationneededAllowed) {
			if(!gentle) console.warn('onnegotiationneeded not allowed');
			return;
		}
		try {
			// this will trigger onIceCandidates and send hostCandidate's to the client
			console.log("onnegotiationneeded createOffer");
			localDescription = await peerCon.createOffer();
			localDescription.sdp = maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
			localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
				'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
			peerCon.setLocalDescription(localDescription).then(() => {
				console.log('onnegotiationneeded localDescription set -> signal');
				wsSend("calleeDescriptionUpd|"+JSON.stringify(localDescription));
			}, err => console.error(`Failed to set local descr: ${err.toString()}`));
		} catch(err) {
			console.error("onnegotiationneeded err",err);
		}
	};
	peerCon.onsignalingstatechange = event => {
		console.log("signalingstatechange", peerCon.signalingState);
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
			if(!gentle) console.log("rtcConnect",rtcConnectStartDate);
			wsSend("rtcConnect|")

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
							if(!gentle) console.log('ringtone play ex',ex);
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
						console.log("buttonBlinking stop");
						answerButton.style.background = "#04c";
						return;
					}
					console.log("buttonBlinking...");
					setTimeout(blinkButtonFunc, 500);
				}
			}
			blinkButtonFunc();

			setTimeout(function() {
				if(!peerCon) {
					// looks like calling peer has quickly aborted the call
					return;
				}
				// TODO if callerID and/or callerName are avail we would rather show them
				// instead of listOfClientIps
				console.log('accept incoming call?',listOfClientIps);
				peerCon.getStats(null)
				.then((results) => getStatsCandidateTypes(results,"Incoming", ""), err => console.log(err));

				if(!calleeID.startsWith("random") /*&& !calleeID.startsWith("!")*/) {
					// no answerButton random
					answerButton.disabled = false;
				}
				if(!calleeID.startsWith("random") && !calleeID.startsWith("!") && !calleeID.startsWith("answie")){
					// msgbox only if not random, duo or answie
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
					console.log("answer button");
					buttonBlinking = false;
					pickup();
				}
				rejectButton.onclick = function() {
					console.log("hangup button");
					buttonBlinking = false;
					hangup();
				}
			},400);
		}
	}
	if(!dataChannel) {
		if(!gentle) console.log('goOnline have no dataChannel');
		createDataChannel();
	}
	if(!wsConn) {
		if(!gentle) console.log('goOnline have no wsConn');
		login(false);
	} else {
		if(!gentle) console.log('goOnline have wsConn send init');
		wsSend("init|!");
	}
}


var localCandidateType = "";
var remoteCandidateType = "";
function getStatsCandidateTypes(results,eventString1,eventString2) {
	console.log('getStatsCandidateTypes start');
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
				if(!gentle) console.log("getStatsCandidateTypes 1st",localCandidateId,remoteCandidateId);
			}
		}
	});
	if(!gentle) console.log("getStatsCandidateTypes candidateId's A",localCandidateId,remoteCandidateId);
	if(localCandidateId=="" || remoteCandidateId=="") {
		// for callee on chrome
		results.forEach(res => {
			if(res.type=="transport" && res.selectedCandidatePairId!="") {
				let selectedCandidatePairId = res.selectedCandidatePairId;
				if(!gentle) console.log('getStatsCandidateTypes PairId',selectedCandidatePairId);
				results.forEach(res => {
					if(res.id==selectedCandidatePairId) {
						localCandidateId = res.localCandidateId;
						remoteCandidateId = res.remoteCandidateId
						if(!gentle)
							console.log("getStatsCandidateTypes 2nd",localCandidateId,remoteCandidateId);
					}
				});
			}
		});
	}

	if(!gentle) console.log("getStatsCandidateTypes candidateId's B",localCandidateId,remoteCandidateId);
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

	let localPeerConType = "";
	if(localCandidateType=="") {
		localPeerConType = "unknw";
	} else if(localCandidateType=="relay") {
		localPeerConType = "relay";
	} else {
		localPeerConType = "p2p";
	}
	let remotePeerConType = "";
	if(remoteCandidateType=="") {
		remotePeerConType = "unknw";
	} else if(remoteCandidateType=="relay") {
		remotePeerConType = "relay";
	} else {
		remotePeerConType = "p2p";
	}
	rtcLink = localPeerConType+"/"+remotePeerConType;

	console.log('getStatsCandidateTypes',rtcLink,localCandidateType,remoteCandidateType);
	let msg = eventString1+" "+rtcLink;
	if(calleeID.startsWith("random") || calleeID.startsWith("!")) {
		let showMsg = msg;
		if(eventString2!="") {
			showMsg += ". "+eventString2+".";
		}
		showStatus(showMsg,-1);
	}
	wsSend("log|callee "+msg);

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
	if(!calleeID.startsWith("random") && !calleeID.startsWith("!")) {
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

var statsPostCallString = "";
var statsPostCallDurationMS = 0;
function getStatsPostCall(results) {
	if(!gentle) console.log('getStatsPostCall start');
	// RTCInboundRTPAudioStream "inbound-rtp" https://www.w3.org/TR/webrtc-stats/#dom-rtcinboundrtpstreamstats
	// RTCOutboundRTPAudioStream "outbound-rtp" https://www.w3.org/TR/webrtc-stats/#dom-rtcoutboundrtpstreamstats
	// RTCAudioReceiverStats "receiver" 
	let timeNow = Date.now(),
		durationRtcMS = timeNow - rtcConnectStartDate,
		bytesReceived = 0,
		bytesSent = 0,
		packetsReceived = 0,
		packetsSent = 0,
		packetsLost = 0,
		jitter = 0,
		jitterBufferDelay = 0,
		retransmittedPacketsSent = 0,
		roundTripTime = 0;

	statsPostCallDurationMS = timeNow - mediaConnectStartDate;
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
			jitterBufferDelay = res.jitterBufferDelay; // FF: undefined
			//console.log("getStatsPostCall inbound-rtp",res);
		} else if(res.type=="outbound-rtp") {
			bytesSent = res.bytesSent;
			packetsSent = res.packetsSent;
			retransmittedPacketsSent = res.retransmittedPacketsSent; // FF: undefined
			//console.log("getStatsPostCall outbound-rtp",res);
		} else if(res.type=="remote-inbound-rtp") {
			roundTripTime = res.roundTripTime; // FF: undefined
			//console.log("getStatsPostCall remote-inbound-rtp",res);
		} else if(res.type=="remote-outbound-rtp") {
			//console.log("getStatsPostCall remote-outbound-rtp",res);
		} else {
			//if(!gentle) console.log("getStatsPostCall type",res.type);
		}
	});
	let durationSecs = Math.floor((statsPostCallDurationMS+500)/1000);
	//if(!gentle) console.log("getStatsPostCall durationMS",statsPostCallDurationMS,durationSecs);
	let bitsReceivedPerSec = 0;
	if(statsPostCallDurationMS>0) {
		bitsReceivedPerSec = Math.floor(bytesReceived*8000/statsPostCallDurationMS);
	}
	//if(!gentle) console.log("getStatsPostCall bitsReceivedPerSec",bitsReceivedPerSec);
	let bitsSentPerSec = 0;
	if(durationRtcMS>0) {
		bitsSentPerSec = Math.floor(bytesSent*8000/durationRtcMS);
	}
	if(!gentle) console.log("getStatsPostCall bitsSentPerSec",bitsSentPerSec,durationRtcMS);
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
	var myStatsPostCallString = statsPostCallString.replaceAll("\n","<br>");
	if(myStatsPostCallString=="") {
		myStatsPostCallString = "No call stats available";
	}
	return myStatsPostCallString;
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
			// this next line should not be necessary
			// it will also be executed on peerCon.onconnectionstatechange "disconnected"
			// but at least in chrome this does speed up caller disconnect detection a lot
			//stopAllAudioEffects();
			endWebRtcSession(true,true); // -> peerConCloseFunc
		}
		dataChannel.onerror = event => {
			if(rtcConnect) {
				console.warn("dataChannel.onerror",event);
			}
		}
		dataChannel.onmessage = event => {
			if(!gentle) console.log("dataChannel.onmessage",event.data);
			if(event.data=="ping") {
				if(dataChannel && dataChannel.readyState=="open") {
					dataChannel.send(event.data+" response");
				}
			} else if(event.data.startsWith("disconnect")) {
				console.log("dataChannel.onmessage on 'disconnect'");
				dataChannel.close();
				dataChannel = null;
				// TODO may need forced hangup
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
			}
		}
	};
}

var allAudioEffectsStopped = false;
function stopAllAudioEffects(comment) {
	if(!gentle) console.log('stopAllAudioEffects',comment);
	allAudioEffectsStopped = true; // halt the ringtone loop
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
	// endWebRtcSession may be called twice in near parallel
	console.log('endWebRtcSession',disconnectCaller,goOnlineAfter);
	remoteAudio.pause();
	remoteAudio.currentTime = 0;
	remoteAudio.srcObject = null;
	remoteStream = null;
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
	if(localStream!=null) {
		console.log('endWebRtcSession localStream=null',localStream);
		const audioTracks = localStream.getAudioTracks();
		audioTracks[0].enabled = false; // mute mic
		localStream.getTracks().forEach(track => { track.stop(); });
		localStream.removeTrack(audioTracks[0]);
		localStream = null;
	}
	if(peerCon) {
		let peerConCloseFunc = function() {
			// rtcConnect && peerCon may be cleared by now
			if(disconnectCaller) {
				console.log('endWebRtcSession disconnectCaller');
				if(wsConn) {
					console.log('endWebRtcSession wsSend(cancel)');
					wsSend("cancel|disconnect"); // important
				}
				if(dataChannel) {
					if(dataChannel.readyState=="open") {
						console.log('endWebRtcSession dataChannel.send(disconnect)');
						dataChannel.send("disconnect");
					}
				} else {
					console.log('endWebRtcSession cannot send disconnect to peer');
				}
			}
			if(dataChannel) {
				console.log('endWebRtcSession dataChannel.close');
				dataChannel.close();
				dataChannel = null;
			}
			if(peerCon) {
				console.log('endWebRtcSession peerConCloseFunc remove sender tracks');
				const senders = peerCon.getSenders();
				if(senders) {
					try {
						senders.forEach((sender) => { peerCon.removeTrack(sender); })
					} catch(ex) {
						console.warn('endWebRtcSession removeTrack',ex);
					}
				}
				peerCon.close();
				peerCon=null;
			}
		};

		if(rtcConnect && peerCon) {
			console.log('endWebRtcSession getStatsPostCall');
			// this is causing an async delay
			peerCon.getStats(null).then((results) => { 
				getStatsPostCall(results);
				if(statsPostCallString!="" && statsPostCallDurationMS>0) {
					// enable info.svg button onclick -> showStatsPostCall()
					//postCallStatsElement.style.display = "inline-block";
				}
				peerConCloseFunc();
			}, err => {
				console.log(err); 
				peerConCloseFunc();
			});
		} else {
			peerConCloseFunc();
		}
	} else {
		showStatus("endWebRtcSession already peerDisconnected");
	}

	if(wsConn)
		onlineIndicator.src="green-gradient.svg";
	else
		onlineIndicator.src="";

	answerButton.style.display = "none";
	rejectButton.style.display = "none";

	if(calleeID.startsWith("random") || calleeID.startsWith("!")) {
		// go to main page // TODO best solution?
		window.location.replace("");
		return
	}

	mediaConnect = false;
	rtcConnect = false;
	goOfflineButton.disabled = false;
	goOnlineButton.style.display = "inline-block";
	goOfflineButton.style.display = "inline-block";

	// goOnlinePending flag prevents secondary calls to goOnline
	if(goOnlineAfter && !goOnlinePending) {
		// we call goOnline bc we always need a fresh new peerCon
		// however, bc we keep our wsConn as is, no new login will be executed
		// so no new ws-hib will be created on the server side
		goOnlinePending = true;
		console.log('endWebRtcSession delayed auto goOnline()...');
		setTimeout(function() {
			console.log('endWebRtcSession auto goOnline()');
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

	//menuElement.style.display = "none";
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
	//var missedCallsElement = document.getElementById('missedCalls');
	if(missedCallsElement!=null) {
		//missedCallsElement.innerHTML = "";
		missedCallsElement.style.display = "none";
	}
	//var missedCallsTitleElement = document.getElementById('missedCallsTitle');
	if(missedCallsTitleElement!=null) {
		missedCallsTitleElement.style.display = "none";
	}
	if(calleeID.startsWith("random") || calleeID.startsWith("!")) {
		// go to main page // TODO is this correct?
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
	// else if(calleeCandidate.address==null) {
		//console.warn('onIce skip calleeCandidate.address==null');
	} else if(wsConn==null || wsConn.readyState!=1) {
		console.warn('onIce wsConn==null || readyState!=1', calleeCandidate.address);
	} else {
		if(!gentle) console.log('onIce calleeCandidate for signaling', calleeCandidate);
		wsSend("calleeCandidate|"+JSON.stringify(calleeCandidate));
	}
}

function historyBack() {
	history.back(); // will call closeResults()
}

var menuDialogOpenFlag = false;
function menuDialogOpen() {
	if(!calleeType) {
		console.log('menuDialogOpen !calleeType');
		return;
	}
	if(menuDialogOpenFlag) {
		console.log('menuDialogOpen menuDialogOpenFlag');
		return;
	}
	console.log('menuDialogOpen');
	menuDialogOpenFlag = true;

	hashcounter++;
	location.hash = hashcounter;

	// fullScreenOverlayElement disables all other buttons and enables abort by click outside
	fullScreenOverlayElement.style.display = "block";
	fullScreenOverlayElement.onclick = function() {
		console.log('fullScreenOverlay click');
		historyBack();
	}
	mainElement.style.filter = "blur(0.8px) brightness(60%)";
	// hide "Settings" and "Exit" if cookies are not allowed
	var menuSettingsElement = document.getElementById('menuSettings');
	var menuExitElement = document.getElementById('menuExit');
	if(navigator.cookieEnabled && getCookieSupport()!=null) {
		// cookies can be used
		console.log('menuSettingsElement on (cookies enabled)');
		if(menuSettingsElement) {
			menuSettingsElement.style.display = "block";
		}
		if(menuExit) {
			menuExit.style.display = "block";
		}
	} else {
		// cookies can NOT be used
		console.log('menuSettingsElement off (cookies disabled)');
		if(menuSettingsElement) {
			menuSettingsElement.style.display = "none";
		}
		if(menuExit) {
			menuExit.style.display = "none";
		}
	}
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

function menuDialogClose() {
	console.log('menuDialogClose');
	menuDialogElement.style.display = "none";
	mainElement.style.filter = "";
	fullScreenOverlayElement.style.display = "none";
	fullScreenOverlayElement.onclick = null;
	menuDialogOpenFlag = false;
}

var iframeWindowOpenFlag = false;
function iframeWindowOpen(url,addStyleString) {
	if(!calleeType) {
		console.log('iframeWindowOpen !calleeType');
		return;
	}
	if(iframeWindowOpenFlag) {
		console.log('iframeWindowOpen iframeWindowOpenFlag');
		return;
	}
	if(menuDialogOpenFlag) {
		menuDialogClose();
	} else {
		hashcounter++;
		location.hash = hashcounter;
	}

	// fullScreenOverlayElement disables all other buttons and enables abort by click outside
	fullScreenOverlayElement.style.display = "block";
	fullScreenOverlayElement.onclick = function() {
		historyBack();
	}

	mainElement.style.filter = "blur(0.8px) brightness(60%)";

	console.log('iframeWindowOpen', url);
	iframeWindowOpenFlag = true;
	let styleString = "width:100%; max-width:450px; position:absolute; left:3.5%; top:1%; padding:10px; z-index:200;";
	if(url.startsWith("string:")) {
		if(addStyleString) {
			styleString += addStyleString;
		}
		iframeWindowElement.style = styleString;
		iframeWindowElement.innerHTML = url.substring(7);
	} else {
		iframeWindowElement.style = styleString;
		iframeWindowElement.innerHTML = "<iframe src='"+url+"' scrolling='no' frameborder='no' width='100%' height='800px' allow='microphone' onload='this.contentWindow.focus()'></iframe>";
		// NOTE: this.contentWindow.focus() is needed for onkeydown events to arrive in the iframe
	}
}

function iframeWindowClose() {
	console.log('iframeWindowClose');
	mainElement.style.filter="";
	iframeWindowElement.innerHTML = "";
	iframeWindowElement.style.display = "none";
	fullScreenOverlayElement.style.display = "none";
	fullScreenOverlayElement.onclick = null;
	iframeWindowOpenFlag = false;
}

var counter=0;
function openContacts() {
	let url = "/callee/contacts?callerId="+calleeID+"&name="+calleeName+"&i="+counter++;
	console.log('openContacts',url);
	iframeWindowOpen(url);
}

function openSettings() {
	let url = "/callee/settings?id="+calleeID+"&i="+counter++;
	console.log('openSettings',url);
	iframeWindowOpen(url);
}

function openPostCallStats() {
	let str = "string:<h2>Call Statistics</h2>"+showStatsPostCall();
	console.log('openPostCallStats');
	iframeWindowOpen(str,"background:#33ad; color:#eee; min-height:480px; padding:20px; max-width:400px; left:5.0%; top:3%; font-size:1.1em; line-height:1.4em;");
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

