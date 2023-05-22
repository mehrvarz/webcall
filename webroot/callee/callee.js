// WebCall Copyright 2023 timur.mobi. All rights reserved.
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
const dialsoundsCheckbox = document.querySelector('input#dialsounds');
const dialsoundslabel = document.querySelector('label#dialsoundslabel');
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
const menuClearCookieElement = document.getElementById('menuClearcookie');
const menuClearCacheElement = document.getElementById('menuClearCache');
const menuExitElement = document.getElementById('menuExit');
const iconContactsElement = document.getElementById('iconContacts');
const idMappingElement = document.getElementById('idMapping');
const exclamationElement = document.getElementById('exclamation');
const ownlinkElement = document.getElementById('ownlink');
const autoReconnectDelay = 15;
const calleeMode = true;
const enterTextElement = document.getElementById('enterText');

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
var dataChannel = null;
var rtcConnect = false
var rtcConnectStartDate = 0;
var mediaConnectStartDate = 0;
var listOfClientIps = "";
var callerID = "";
var callerName = "";
var callerMsg = ""; // greeting msg
var lastResult;
var lastUserActionDate = 0;
var calleeName = "";
var mastodonID = "";
var wsSecret = "";
var audioContext = null;
var audioStreamDest = null;
var autoPlaybackAudioBuffer = null;
var autoPlaybackAudioSource = null;
var autoPlaybackAudioSourceStarted;
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
var minNewsDate=0;
var mid = "";
var altIdArray = [];
var newline = String.fromCharCode(13, 10);
var textmode="";
var	muteMicModified = false;
var textchatOKfromOtherSide = false;

window.onload = function() {
	console.log("callee.js onload...");
	
	if(!navigator.mediaDevices) {
		console.warn("navigator.mediaDevices not available");
		goOnlineButton.disabled = true;
		goOfflineButton.disabled = true;
		alert("navigator.mediaDevices not available");
		return;
	}

	fileSelectInit();
	window.onhashchange = hashchange;

	let dbg = getUrlParams("dbg");
	if(typeof dbg!=="undefined" && dbg!="" && dbg!="undefined") {
		gentle = false;
	}

	//console.log("callee.js onload getUrlParams('id') search="+window.location.search);
	let id = getUrlParams("id");
	if(typeof id!=="undefined" && id!="" && id!="undefined") {
		calleeID = cleanStringParameter(id,true,"id");
	}
	id = getUrlParams("mid");
	if(typeof id!=="undefined" && id!="" && id!="undefined") {
		mid = cleanStringParameter(id,true,"mid");
		// if given, send msg to caller (mastodon user) when this callee has logged in (see "login success")
	}
	gLog("onload calleeID="+calleeID+" mid="+mid);

	if(calleeID=="") {
		// if callee was started without a calleeID, reload with calleeID from cookie
		if(document.cookie!="" && document.cookie.startsWith("webcallid=")) {
			let cookieName = document.cookie.substring(10);
			let idxAmpasent = cookieName.indexOf("&");
			if(idxAmpasent>0) {
				cookieName = cookieName.substring(0,idxAmpasent);
			}
			cookieName = cleanStringParameter(cookieName,true);
			if(cookieName!="") {
				console.log("callee.js redirect to cookieName");
				window.location.replace("/callee/"+cookieName);
				return;
			}
		}

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

	// if set will auto-login as callee
	let auto = cleanStringParameter(getUrlParams("auto"),true,"auto");
	if(auto) {
		gLog("onload auto is set ("+auto+")");
		if(divspinnerframe) divspinnerframe.style.display = "block";
		// auto will cause onGotStreamGoOnline to be set below
	} else {
		gLog("onload auto is not set");
	}

	if(typeof Android !== "undefined" && Android !== null) {
		fullscreenLabel.style.display = "none";
		menuExitElement.style.display = "block";

		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			if(Android.getVersionName()>="1.1.0") {
				menuClearCacheElement.style.display = "block"; // calls clearcache()
			}
		}

		let element = document.getElementById("nativeMenu");
		if(element) element.style.display = "block";

		// change timur.mobi/webcall/ link to timur.mobi/webcall/update/
		element = document.getElementById("webcallhome");
		if(element) element.href = "https://timur.mobi/webcall/update/";
		// TODO ideally open 'webcallhome' url in an iframe
	}

	let ua = navigator.userAgent;
	if(ua.indexOf("iPhone")>=0 || ua.indexOf("iPad")>=0) {
		fullscreenLabel.style.display = "none";
	}

	try {
		minNewsDate = localStorage.getItem('newsdate');
	} catch(ex) {
		console.warn('access to localStorage failed',ex);
		minNewsDate=0
	}
	if(minNewsDate==null) minNewsDate=0;
	// we will show news from the server if the timestamp is newer than minNewsDate
	// when we show the news, we set localStorage.setItem('newsdate', Date.now()/1000) // ms since Jan 1, 1970
	// to only show the next news

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

	dialsoundsCheckbox.addEventListener('change', function() {
		if(this.checked) {
			gLog("dialsoundsCheckbox checked");
		} else {
			gLog("dialsoundsCheckbox checked off");
		}
		playDialSounds = this.checked;
		wsSend("dialsoundsmuted|"+!this.checked);
		setTimeout(function(){history.back();},150);
	});

	// mute mode handler
	if(!muteMicElement) {
		console.log("# no muteMicElement");
	} else {
		muteMicElement.addEventListener('change', function() {
			if(!localStream) {
				console.log("# no localStream on muteMic state change: "+this.checked);
			} else {
				const audioTracks = localStream.getAudioTracks();
				if(!audioTracks[0]) {
					console.log("# no audioTracks on muteMic state change: "+this.checked);
				} else {
					if(this.checked) {
						console.log("muteMic state change "+this.checked+": mic disable");
						audioTracks[0].enabled = false;
					} else {
						console.log("muteMic state change "+this.checked+": mic enable");
						audioTracks[0].enabled = true;
					}
				}
			}
		});
	}

	// requestFullscreen and exitFullscreen are not supported in iOS (will abort JS without err-msg)
	if(fullscreenCheckbox && fullscreenLabel.style.display!="none") {
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
				document.exitFullscreen().catch(err => {
					console.log('fullscreenCheckbox exitFullscreen err='+err.message);
				});
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
	}

	checkServerMode(function(mode) {
		if(mode==0 || mode==1) {
			// normal mode
			gLog("onload load audio files more="+mode);
			//var calleeIdTitle = calleeID.charAt(0).toUpperCase() + calleeID.slice(1);
			var calleeIdTitle = calleeID;
			document.title = "WebCall Callee "+calleeIdTitle;
			if(titleElement) {
				titleElement.innerHTML = "WebCall Callee "+calleeIdTitle;
			}

			calleeID = calleeID.toLowerCase();
			gLog('onload calleeID lowercase '+calleeID);
			if(mode==1 || mode==3 || wsSecret!="") {
				gLog('onload pw-entry not required with cookie/wsSecret '+mode);
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

			gLog('onload pw-entry is needed '+mode);
			if(divspinnerframe) divspinnerframe.style.display = "none";

			onGotStreamGoOnline = true;
			goOnlineButton.disabled = true;
			goOfflineButton.disabled = true;
			enablePasswordForm();
			return;
		}

		if(divspinnerframe) divspinnerframe.style.display = "none";

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
			// mode==3: login is not possible
			let mainParent = containerElement.parentNode;
			mainParent.removeChild(containerElement);
			var msgElement = document.createElement("div");
			msgElement.style = "margin-top:12%; padding:4%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-size:1.2em; line-height:1.5em;";
			msgElement.innerHTML = "<div>cannot login "+calleeID+"<br>stop other session and clear the login-cookie<br><br><a onclick='clearcookie2()'>clear login-cookie</a><br><br>you can run a 2nd callee session in a separate browser, or in incognito mode / private window</div>";
			mainParent.appendChild(msgElement);
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
		gLog('mode='+xhr.responseText);
		if(xhr.responseText.startsWith("maintenance")) {
			// maintenance mode
			callback(2);
			return;
		}
		if(xhr.responseText.startsWith("normal")) {
			// normal mode
			if(xhr.responseText.indexOf("|ok")>0) {
				// normal mode, cookie + pw are known
				callback(1);
				return;
			}
			// normal mode, cookie or pw are NOT know
			callback(0);
			return;
		}
		callback(3);
	}, function(errString,errcode) {
		console.log("# xhr error "+errString+" "+errcode);
		callback(3);
	});
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
	if(muteMicDiv) {
		muteMicDiv.style.display = "none";
	}
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
		var usernameForm = document.getElementById("username");
		if(usernameForm) {
			usernameForm.value = calleeID;
		}
	},800);
}

function clearForm() {
	document.getElementById("current-password").value = "";
	formPw.focus();
}

function submitFormDone(idx) {
	console.log("submitFormDone() idx="+idx);
	if(idx==1) {
		var valuePw = cleanStringParameter(document.getElementById("current-password").value,true,"pw");
		if(valuePw.length < 6) {
			formPw.focus();
			showStatus("Password needs to be at least six characters long",-1);
			return;
		}
		wsSecret = valuePw;
		onGotStreamGoOnline = true;
		//console.log("callee submitFormDone: enable goonline");
		goOnlineButton.disabled = false;
		if(muteMicDiv) {
			muteMicDiv.style.display = "block";
		}
		start();
		// -> getStream() -> getUserMedia(constraints) -> gotStream() -> goOnline() -> login()
	} else if(idx==2) {
		// textchat msg to send to caller via dataChannel
		let text = cleanStringParameter(enterTextElement.value,false);
		console.log("submitText text="+text);
		dataChannel.send("msg|"+text);
		// add text to msgbox
		let msg = "> " + text;
		if(msgbox.value!="") { msg = newline + msg; }
		msgbox.value += msg;
		//console.log("msgbox "+msgbox.scrollTop+" "+msgbox.scrollHeight);
		msgbox.scrollTop = msgbox.scrollHeight-1;
		enterTextElement.value = "";
	}
}

function start() {
	// setup buttons, get audio input stream, then login
	gLog('start callee with ID='+calleeID);

	goOnlineButton.onclick = function(ev) {
		ev.stopPropagation();
		lastUserActionDate = Date.now();
		goOnline(true,"user button");
	}
	goOfflineButton.onclick = function(ev) {
		ev.stopPropagation();
		lastUserActionDate = Date.now();
		goOffline();
	};
	try {
		getStream().then(() => navigator.mediaDevices.enumerateDevices()).then(gotDevices);
		//getStream() -> getUserMedia(constraints) -> gotStream() -> goOnline() -> login()
	} catch(ex) {
		console.log("# ex while searching for audio devices "+ex.message);
		if(divspinnerframe) divspinnerframe.style.display = "none";
	}
}

function login(retryFlag) {
	gLog("login to signaling server..."+retryFlag+" "+calleeID+" "+wsSecret.length);
	let api = apiPath+"/login?id="+calleeID;
	// mid-parameter will make server send a msg to caller (mastodon user with id = tmpkeyMastodonCallerMap[mid])
	if(mid!="") {
		api += "&mid="+mid;
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
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		// processData
		let loginStatus = xhr.responseText;
		//console.log("login xhr loginStatus "+loginStatus);

		var parts = loginStatus.split("|");
		if(parts[0].indexOf("wsid=")>=0) {
			wsAddr = parts[0];
			// we're now a logged-in callee-user
			gLog('login wsAddr='+wsAddr);

			// hide the form
			form.style.display = "none";

			// show muteMic checkbox
			if(muteMicDiv) {
				muteMicDiv.style.display = "block";
			}

			menuClearCookieElement.style.display = "block";

			if(parts.length>=2) {
				talkSecs = parseInt(parts[1], 10);
			}
			if(parts.length>=3) {
				outboundIP = parts[2];
			}
			if(parts.length>=4) {
				serviceSecs = parseInt(parts[3], 10);
			}
			gLog('login outboundIP '+outboundIP);

			getSettings();
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
			if(parts.length>=6) {
				gLog('dialsounds muted parts[5]='+parts[5]);
				if(parts[5]=="true") {
					// dialSounds muted
					dialsoundsCheckbox.checked = false;
					playDialSounds = false;
				} else if(parts[5]=="false") {
					// dialSounds not muted
					dialsoundsCheckbox.checked = true;
					playDialSounds = true;
				}
			}
			gLog('dialsoundsCheckbox.checked '+dialsoundsCheckbox.checked);

			// login success -> send "init|"
			sendInit("xhr login success");
			gLog('login sendInit done');
			return;
		}

		if(divspinnerframe) divspinnerframe.style.display = "none";

		let mainLink = window.location.href;
		let idx = mainLink.indexOf("/calle");
		if(idx>0) {
			mainLink = mainLink.substring(0,idx); //+ "/webcall";
		}
		/*
		if(parts[0]=="noservice") {
			wsSecret = "";
			showStatus("Service error<br><a href='"+mainLink+"'>Main page</a>",-1);
			form.style.display = "none";
		} else
		*/
		if(parts[0]=="notregistered") {
			wsSecret = "";
			showStatus( "Unknown callee ID "+calleeID+"<br>"+
						"<a href='/callee/register'>Register a new ID</a>",-1);

			// clear "You receive calls made by this link"
			ownlinkElement.innerHTML = "";

			form.style.display = "none";
			offlineAction();
			goOnlineButton.disabled = true;

			// clear cookie
			console.log('clear cookie');
			if(document.cookie!="" && document.cookie.startsWith("webcallid=")) {
				let cookieName = document.cookie.substring(10);
				let idxAmpasent = cookieName.indexOf("&");
				if(idxAmpasent>0) {
					cookieName = cookieName.substring(0,idxAmpasent);
				}
				cookieName = cleanStringParameter(cookieName,true);
				console.log('clear cookieName',cookieName);
				if(cookieName!="") {
			        document.cookie = "webcallid=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
				}
			}
		} else if(parts[0]=="busy") {
			showStatus("User is busy",-1);
			form.style.display = "none";
		} else if(parts[0]=="error") {
			// parts[0] "error" = "wrong pw", "pw has less than 6 chars" or "empty pw"
			// offer pw entry again
			gLog('login error - try again');
			goOnlineButton.disabled = true;
			enablePasswordForm();
		} else if(parts[0]=="") {
			showStatus("No response from server",-1);
			goOfflineButton.disabled = true;
			form.style.display = "none";
		} else if(parts[0]=="wrongcookie") {
			window.location.reload();
		} else if(parts[0]=="fatal") {
			// loginStatus "fatal" = "already logged in" or "db.GetX err"
			// no use offering pw entry again at this point
			goOffline();
			if(parts.length>=2) {
				showStatus("Login "+parts[1]+" fail. Logged in from another device?",-1);
			} else {
				showStatus("Login fail. Logged in from another device?",-1);
			}
			form.style.display = "none";
		} else {
			goOffline();
			// loginStatus may be: "java.net.ConnectException: failed to connect to timur.mobi/66.228.46.43 (port 8443) from /:: (port 0): connect failed: ENETUNREACH (Network is unreachable)"
			showStatus("Status: "+loginStatus,-1);
			form.style.display = "none";
		}

	}, function(errString,err) {
		// errorFkt
		console.log("# xhr error "+errString+" "+err);
		if(err==502 || errString.startsWith("fetch")) {
			showStatus("No response from server",-1);
		} else {
			showStatus("XHR error "+err,3000);
		}

		if(divspinnerframe) divspinnerframe.style.display = "none";

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

function sendInit(comment) {
	console.log("sendInit() from: "+comment);
	wsSend("init|"+comment); // -> connectSignaling()
	// server will respond to this with "sessionId|(serverCodetag)"
	// when we receive "sessionId|", we call showOnlineReadyMsg() -> Android.calleeConnected()
}

function getSettings() {
	// main use: get the calleeName (nickname)
	// TODO why do we add arg id?
	let api = apiPath+"/getsettings?id="+calleeID;
	gLog('getsettings api '+api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(xhr.responseText!="") {
			if(xhr.responseText=="wrongcookie") {
			} else {
				let serverSettings = "";
				try {
					serverSettings = JSON.parse(xhr.responseText);
				} catch(ex) {
					console.log("# getSettings JSON.parse err "+ex);
					return;
				}
				if(typeof serverSettings.nickname!=="undefined") {
					calleeName = serverSettings.nickname;
					gLog("getsettings calleeName "+calleeName);
					mastodonID = serverSettings.mastodonID;
				}
			}
		}

		// fetch mappings
		api = apiPath+"/getmapping?id="+calleeID;
		if(!gentle) console.log('request getmapping api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			let altIDs = xhr.responseText;
			altIdArray = [];

			// parse altIDs, format: id,true,assign|id,true,assign|...
			let tok = altIDs.split("|");
			let count = tok.length;
			for(var i=0; i<tok.length; i++) {
				//console.log("tok["+i+"]="+tok[i]);
				if(tok[i]!="") {
					let tok2 = tok[i].split(",");
					let id = tok2[0].trim();
					if(id.indexOf(" ")>=0) {
						id = id.replace(" ","");
					}
					if(id.length>11) {
						id = id.substring(0,11);
					}
					altIdArray.push(id);
					//console.log("getsettings altIdArray.length",altIdArray.length);
				}
			}
			getSettingDone();

		}, function(errString,errcode) {
			console.log("# getsettings xhr error "+errString);
			getSettingDone();
		});
	}, function(errString,errcode) {
		console.log("# getsettings xhr error "+errString);
		getSettingDone();
	});
}

function getSettingDone() {
	//console.log("getSettingDone",wsConn);
	if(wsConn) {
		// "You receive calls made by this link"
		let calleeLink = window.location.href;
		let userLink = "";
		//console.log("getSettingDone calleeLink="+calleeLink);
		if(calleeLink.indexOf("callee/")>0) {
			userLink = calleeLink.replace("callee/","user/");
			//console.log("getSettingDone a userLink="+userLink);
		}
		let idxParameter = userLink.indexOf("?");
		if(idxParameter>=0) {
			userLink = userLink.substring(0,idxParameter);
		}
		idxParameter = userLink.indexOf("#");
		if(idxParameter>=0) {
			userLink = userLink.substring(0,idxParameter);
		}

		let links = "";
		links += "<div style='line-height:1.6em'>";
		links += "<div class='callListTitle'>You can receive calls made by these links:</div>";
		links += "<a target='_blank' href='"+userLink+"'>"+userLink+"</a><br>";

		if(mastodonID!="" && mastodonID!=calleeID) {
			let userLinkAlt = userLink.replace("/user/"+calleeID,"/user/"+mastodonID);
			links += "<a target='_blank' href='"+userLinkAlt+"'>"+userLinkAlt+"</a><br>";
		}

		// add active mapping entries
		console.log("getSettingDone altIdArray.length",altIdArray.length);
		if(altIdArray.length>0) {
			for(let i = 0; i < altIdArray.length; i++) {
				let userLinkMap = userLink.replace("/user/"+calleeID,"/user/"+altIdArray[i]);
				links += "<a target='_blank' href='"+userLinkMap+"'>"+userLinkMap+"</a><br>";
			}
		}

		links += "</div>";
		ownlinkElement.innerHTML = links;
	}
}

function offlineAction() {
	// make buttons reflect offline state
	gLog('offlineAction');
	goOnlineButton.disabled = false;
	goOfflineButton.disabled = true;
	onlineIndicator.src="";
	if(divspinnerframe) divspinnerframe.style.display = "none";
}

function gotStream2() {
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.calleeReady !== "undefined" && Android.calleeReady !== null) {
			// service v1.1.5
			// when service starts activity/callee.js for answering a waiting call, then...
			// 1. we don't do offlineAction()
			// 2. we need to trigger service processWebRtcMessages()
			if(Android.calleeReady()) {
				// processWebRtcMessages() now active (don't mute mic; don't change online/offline buttons)
				return;
			}
		}
	}

	if(pickupAfterLocalStream) {
		pickupAfterLocalStream = false;
		console.log('gotStream2 -> auto pickup2()');
		pickup2();
	} else {
		if(localStream && !videoEnabled && !rtcConnect) {
			// mute (disable) mic until a call
			console.log('gotStream2 mute (disable) mic (localStream) standby');
			localStream.getTracks().forEach(track => { track.stop(); });
			const audioTracks = localStream.getAudioTracks();
			localStream.removeTrack(audioTracks[0]);
			localStream = null;
		}
		if(onGotStreamGoOnline && !rtcConnect) {
			console.log('gotStream2 onGotStreamGoOnline goOnline');
			onGotStreamGoOnline = false;

			// goOnline() will not start if goOnlineButton is disabled
			offlineAction(); // enable goOnlineButton, disable goOfflineButton
			goOnline(true,"gotStream2");
		} else {
			console.log("gotStream2 standby");

			if(wsConn==null) {
				// we are offline
				goOnlineButton.disabled = false;
				goOfflineButton.disabled = true;
			} else {
				// we are online
				goOnlineButton.disabled = true;
				goOfflineButton.disabled = false;

				// send init to request list of missedCalls
				sendInit("gotStream2 standby");
			}
		}
	}
}

let wsAutoReconnecting = false;
function delayedWsAutoReconnect(reconPauseSecs) {
	// delayedWsAutoReconnect can only succeed if a previous login attemt was successful
	console.log("delayedWsAutoReconnect "+reconPauseSecs);
	if((remainingTalkSecs<0 || remainingServiceSecs<0) && !calleeID.startsWith("answie")) {
		offlineAction();
		wsAutoReconnecting = false;
		console.log("# give up reconnecting "+remainingTalkSecs+" "+remainingServiceSecs);
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
		console.log("delayedWsAutoReconnect action");
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

function showOnlineReadyMsg() {
	if(!wsConn) {
		console.log("# showOnlineReadyMsg not online");
		return;
	}

	console.log("showOnlineReadyMsg");
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.calleeConnected !== "undefined" && Android.calleeConnected !== null) {
			Android.calleeConnected();
			// service should now do 2 things:
			// 1. updateNotification("",awaitingCalls,false);
			// 2. Intent brintent = new Intent("webcall");
			//    brintent.putExtra("state", "connected");
			//    sendBroadcast(brintent);
		}
	}

	if(isHiddenCheckbox.checked) {
		showStatus("Your online status is hidden.<br>",2500);
	}
}

let tryingToOpenWebSocket = false;
let wsSendMessage = "";
function connectSignaling(message,comment) {
	console.log("connect to signaling server '"+comment+"' '"+message+"'");
    var wsUrl = wsAddr;

	tryingToOpenWebSocket = true;
	wsSendMessage = message;

	if(typeof Android !== "undefined" && Android !== null) {
		// wsUrl will only be used if service:wsClient==null
		// but on server triggered reconnect, service:wsClient will be set (and wsUrl will not be used)
		wsConn = Android.wsOpen(wsUrl);
		// if service is NOT yet connected:
		//  service -> wsCli=connectHost(wsUrl) -> onOpen() -> runJS("wsOnOpen()",null) -> wsSendMessage("init|!")
		// if service IS already connected:
		//  service -> if activityWasDiscarded -> wakeGoOnlineNoInit()
	} else {
		if(!window["WebSocket"]) {
			console.error('connectSig: no WebSocket support');
			showStatus("No WebSocket support");
			if(!mediaConnect) {
				onlineIndicator.src="";
			}
			return;
		}
	    console.log('connectSig: open ws connection... '+calleeID+' '+wsUrl);
		if(peerCon==null || peerCon.signalingState=="closed") {
		    console.log('connectSig: peercon is gone');
			newPeerCon();
		}

		wsConn = new WebSocket(wsUrl);
		wsConn.onopen = wsOnOpen;
		wsConn.onerror = wsOnError;
		wsConn.onclose = wsOnClose;
		wsConn.onmessage = wsOnMessage;
	}
}

function wsOnOpen() {
	// called by service connectHost(wsUrl) -> onOpen() -> runJS("wsOnOpen()",null)
	gLog("wsOnOpen calleeID="+calleeID);
	tryingToOpenWebSocket = false;
	wsAutoReconnecting = false;
	if(!mediaConnect) {
		onlineIndicator.src="green-gradient.svg";
	}

	if(divspinnerframe) divspinnerframe.style.display = "none";
	/*
	window.addEventListener("beforeunload", function () {
		// prevent "try reconnect in..." after "wsConn close" on unload
		// by turning our online-indication off
		console.log("callee beforeunload: enable goonline");
		goOnlineButton.disabled = false;
		// NOTE: this occurs when callee starts dialing a remote user from missedcalles
		// then both buttons are enabled - not good
	});
	*/
	if(wsSendMessage!="") {
		gLog("wsOnOpen wsSend("+wsSendMessage+")");
		wsSend(wsSendMessage);
		wsSendMessage = "";
	}
	isHiddenlabel.style.display = "block";
	autoanswerlabel.style.display = "block";
	dialsoundslabel.style.display = "block";
	menuSettingsElement.style.display = "block";
	iconContactsElement.style.display = "block";
	idMappingElement.style.display = "block";
	goOfflineButton.disabled = false;
}

function wsOnError(evt) {
	console.log("# wsOnError ",evt);
	wsOnError2(evt.data,evt.code);
}

function wsOnError2(str,code) {
	console.log("# wsOnError2 "+str+" code="+code);
	if(typeof str!=="undefined" && str!="" && str!="undefined") {
		showStatus("wsError "+str+" "+code,-1);
	} else if(typeof code!=="undefined" && code!=0) {
		showStatus("wsError code="+code,-1);
	} else {
		showStatus("wsError unknown",-1);
	}

	// for ff wake-from-sleep error (wss interrupted), code is not given here (but in wsOnClose())
	// TODO explain why the following is needed (and whether it is always true to assume wsConn=null on wsOnError()
	onlineIndicator.src="";
	wsConn=null;
}

function wsOnClose(evt) {
	// called by wsConn.onclose
	// evt.code = 1001 (manual reload)
	// evt.code = 1006 (unusual clientside error)
	let errCode = 0;
	if(typeof evt!=="undefined" && evt!=null && evt!="undefined") {
		errCode = evt.code;
	}
	console.log("wsOnClose ID="+calleeID+" code="+errCode,evt);
	wsOnClose2();
	if(tryingToOpenWebSocket) {
		// onclose occured while trying to establish a ws-connection (before this could be finished)
		gLog('wsOnClose failed to open');
	} else {
		// onclose occured while being ws-connected
		gLog('wsOnClose while connected');
	}

	if(goOnlineButton.disabled && errCode==1006 && !tryingToOpenWebSocket) {
		// callee on chrome needs this for reconnect after wake-from-sleep
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
	gLog("wsOnClose2 "+calleeID);
	wsConn=null;
	buttonBlinking=false; // will abort blinkButtonFunc()
	stopAllAudioEffects("wsOnClose");
	showStatus("disconnected from signaling server");
	onlineIndicator.src="";
	// clear "You receive calls made by this link"
	ownlinkElement.innerHTML = "";
}

function wsOnMessage(evt) {
	signalingCommand(evt.data,"wsOnMessage");
}

function wsOnMessage2(str, comment) {
	// WebCall service uses this to push msgs from WebCall server
	signalingCommand(str, comment);
}

function signalingCommand(message, comment) {
	//console.log("signalingCommand "+message+" comment="+comment);
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
			console.log('callerOffer (incoming call)');
			connectionstatechangeCounter=0;
		} else {
			console.log('callerOfferUpd (in-call)');
		}

		callerDescription = JSON.parse(payload);
		console.log('callerOffer setRemoteDescription '+callerDescription);
		peerCon.setRemoteDescription(callerDescription).then(() => {
			gLog('callerOffer createAnswer');
			peerCon.createAnswer().then((desc) => {
				localDescription = desc;
				console.log('callerOffer in, calleeAnswer out');
				localDescription.sdp =
					maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
				localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
					'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
				peerCon.setLocalDescription(localDescription).then(() => {
					if(isDataChlOpen()) {
						console.log('calleeAnswer localDescription set -> signal via dataChl');
						dataChannel.send("cmd|calleeAnswer|"+JSON.stringify(localDescription));
					} else {
						console.log('calleeAnswer localDescription set -> signal via wsSend');
						wsSend("calleeAnswer|"+JSON.stringify(localDescription));
					}
				}, err => console.error(`# Failed to set local descr: ${err.toString()}`));
			}, err => {
				console.warn("# failed to createAnswer "+err.message)
				showStatus("Failed to createAnswer",8000);
			});
		}, err => {
			console.warn('callerOffer failed to set RemoteDescription',err.message,callerDescription)
			showStatus("Failed to set RemoteDescription",8000);
		});

	} else if(cmd=="callerAnswer") {
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			console.log("# callerAnswer abort no peerCon");
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
		//gLog('cmd callerInfo payload=(%s)',payload);
		callerMsg = "";
		let idxSeparator = payload.indexOf("\t");
		if(idxSeparator<0) {
			// for backward compatibility only
			idxSeparator = payload.indexOf(":");
		}
		if(idxSeparator>=0) {
			callerID = payload.substring(0,idxSeparator);
			// callerID may have host attached: callerID@host
			// callerID apparently only used for getStatsCandidateTypes()
			callerName = payload.substring(idxSeparator+1);
			idxSeparator = callerName.indexOf("\t");
			if(idxSeparator>=0) {
				callerMsg = callerName.substring(idxSeparator+1);
				callerName = callerName.substring(0,idxSeparator);
			}
			gLog('cmd callerInfo ('+callerID+') ('+callerName+') ('+callerMsg+')');
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
			if(!peerCon || peerCon.iceConnectionState=="closed") {
				console.log("# cmd callerCandidate abort no peerCon");
				stopAllAudioEffects();
				// TODO do we really need this?
				endWebRtcSession(true,true,"callerCandidate no peercon / ice closed"); // -> peerConCloseFunc
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
			gLog("peerCon.addIceCandidate accept address="+address+" "+callerCandidate.candidate);
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
			//console.log('cmd cancel -> endWebRtcSession');
			endWebRtcSession(false,true,"incoming cancel"); // -> peerConCloseFunc
			//console.log('cmd cancel -> clearcache()');
			clearcache();
		} else {
			stopAllAudioEffects("ignore cmd cancel");
			// TODO no endWebRtcSession ? android service will not know that ringing has ended
		}

	} else if(cmd=="clearcache") {
		clearcache();

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
		// payload is server version
		gLog("cmd=='sessionId' -> showOnlineReadyMsg()");
		showOnlineReadyMsg();

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

	} else if(cmd=="waitingCallers") {
		waitingCallerSlice = null;
		if(payload.length>0) {
			waitingCallerSlice = JSON.parse(payload);
			//gLog('showWaitingCallers msg',waitingCallerSlice.length);
			if(waitingCallerSlice && waitingCallerSlice.length>0) {
				// would be nice to use a different sound here?
				if(notificationSound) {
					notificationSound.play().catch(function(error) { });
				}
			}
		}
		showWaitingCallers();

	} else if(cmd=="missedCalls") {
		//gLog('show missedCalls msg',payload.length);
		missedCallsSlice = null;
		if(payload.length>0) {
			missedCallsSlice = JSON.parse(payload);
		}
		showMissedCalls();

	} else if(cmd=="ua") {
		otherUA = payload;
		gLog("otherUA",otherUA);

	} else if(cmd=="textmode") {
		textmode = payload;
		gLog("textmode",textmode);

		if(textmode=="true") {
			if(muteMicElement && muteMicElement.checked==false) {
				muteMicElement.checked = true;
				// if we change the state of the muteMic checkbox here, we need to auto-change it back on hangup
				// only then do we ever auto-change the state of this checkbox
				muteMicModified = true;
			}
		}

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

				exclamationElement.onclick = function(ev) {
					ev.stopPropagation();
					if(typeof Android !== "undefined" && Android !== null) {
						openNews(newsUrl);
					} else {
						window.open(newsUrl, "_blank");
					}

					minNewsDate = Math.floor(Date.now()/1000);
					localStorage.setItem('newsdate', minNewsDate);

					exclamationElement.style.opacity = 0;
					setTimeout(function() {
						exclamationElement.style.display = "none";
					},1000);
				};
			} else {
				gLog("exclamationElement not defined");
			}
			minNewsDate = newsDateInt;
		} else {
			//gLog("news is old");
		}

	} else {
		console.log('# ignore cmd='+cmd+' payload='+payload);
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
			let callerName = waitingCallerSlice[i].CallerName;
			let callerNameShow = callerName;
			//gLog('waitingCallerSlice[i].Msg',waitingCallerSlice[i].Msg);
			if(waitingCallerSlice[i].Msg!="") {
				callerNameShow =
					"<a onclick='showMsg(\""+waitingCallerSlice[i].Msg+"\");return false;'>"+callerName+"</a>";
			}
			str += "<td>" + callerNameShow + "</td><td>"+
			    waitingCallerSlice[i].CallerID + "</td>"+
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
	gLog('pickupWaitingCaller',addrPort);
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
			gLog('showMissedCalls fkt missedCallsSlice == null');
			missedCallsElement.style.display = "none";
			missedCallsElement.innerHTML = "";
			if(missedCallsTitleElement) {
				missedCallsTitleElement.style.display = "none";
			}
			return;
		}

		if(iframeWindowOpenFlag) {
			// no need to render missedcalls if an iframe is open
			//gLog("skip rendering missedcalls");
		} else {
			// make remoteCallerIdMaxChar depend on window.innerWidth
			// for window.innerWidth = 360, remoteCallerIdMaxChar=21 is perfect
			let remoteCallerIdMaxChar = 13;
			if(window.innerWidth>360) {
				remoteCallerIdMaxChar += Math.floor((window.innerWidth-360)/22);
			}
			//console.log("window.innerWidth="+window.innerWidth+" remoteCallerIdMaxChar="+remoteCallerIdMaxChar);

			missedCallsElement.style.display = "block";
			let timeNowSecs = Math.floor((Date.now()+500)/1000);
			let mainLink = window.location.href;
			let idx = mainLink.indexOf("/callee");
			if(idx>0) {
				mainLink = mainLink.substring(0,idx) + "/user/";
			}
			let str = "<table style='width:100%; border-collapse:separate; line-height:1.6em; margin-left:-4px;'>"
			for(var i=0; i<missedCallsSlice.length; i++) {
				str += "<tr>"
				let waitingSecs = timeNowSecs - missedCallsSlice[i].CallTime;

				// split waitingTimeString by days, hours, min
				let waitingTimeString = ""+waitingSecs+"s";
				if(waitingSecs>50) {
					let waitingMins = Math.floor((waitingSecs+10)/60);
					if(waitingMins>=60) {
						let waitingHours = Math.floor(waitingMins/60);
						waitingMins -= waitingHours*60;
						if(waitingHours>=24) {
							let waitingDays = Math.floor(waitingHours/24);
							waitingHours -= waitingDays*24;
							waitingTimeString = ""+waitingDays+"d";
						} else {
							waitingTimeString = ""+waitingHours+"h";
						}
					} else {
						waitingTimeString = ""+waitingMins+"m";
					}
				}
				let callerIp = missedCallsSlice[i].AddrPort;
				let callerIpIdxPort = callerIp.indexOf(":");
				if(callerIpIdxPort>0) {
					callerIp = callerIp.substring(0,callerIpIdxPort);
				}
				let callerID = missedCallsSlice[i].CallerID;

				let callerName = missedCallsSlice[i].CallerName;
				if(callerName=="") {
					if(callerID==calleeID) {
						callerName="self";
					} else {
						callerName="unknown";
					}
				}
				// TODO if callerName=="" || callerName=="unknown" -> check contacts?

				let callerNameMarkup = callerName;
				let callerMsg = missedCallsSlice[i].Msg;
				if(callerMsg!="") {
					//gLog('### callerMsg='+callerMsg+' '+waitingTimeString+' '+
					//	timeNowSecs+' '+missedCallsSlice[i].CallTime);
					callerNameMarkup = "<a onclick='showMsg(\""+callerMsg+"\");return false;'>"+callerName+"</a>";
					//console.log("callerNameMarkup("+callerNameMarkup+")");
				}

				let remoteCaller = false;
				let remoteAddr = "";
				let callerIdNoHost = callerID;
				var parts = callerID.split("@");
				if(parts.length>=3) {
					remoteCaller = true;
					callerIdNoHost = parts[0];
					if(parts[1]!="") {
						callerIdNoHost += "@"+parts[1];
					}
					remoteAddr = parts[2];
					if(remoteAddr==location.host) {
						remoteCaller = false;
						callerID = callerIdNoHost;
					}
				}

				// TODO here we could check if callerID is (still) a valid calleeID (but better do this on server)

				let noLink = false;
				if(callerID=="") {
					// local user without ID (cannot be called back)
					noLink = true;
					if(callerIp=="")
						callerIdNoHost = "unknown";
					else
						callerIdNoHost = halfShowIpAddr(callerIp);
					callerID = callerIdNoHost;
				} else if(callerIdNoHost=="") {
					// remote user without ID (cannot be called back)
					noLink = true;
					if(callerIp=="")
						callerIdNoHost = "unknown";
					else
						callerIdNoHost = halfShowIpAddr(callerIp);
					callerID = callerIdNoHost + callerID;
				}

				let callerLink = "";
				if(!remoteCaller) {
					// the original caller is hosted on THIS server
					callerLink += mainLink + callerIdNoHost;
					// do NOT send callerId + callerName to callee on local server
					//callerLink += "?callerId="+calleeID + "&callerName="+calleeName;
					//if(!playDialSounds) callerLink += "&ds=false";
					//if(!playDialSounds) callerLink += "?ds=false";
					//console.log("local ("+callerIdNoHost+") ("+callerLink+")");

					if(noLink) {
						callerLink = callerIdNoHost;
					} else {
						callerLink = "<a onclick='openDialUrl(\""+callerLink+"\")'>"+callerIdNoHost+"</a>";
					}

				} else {
					// the original caller is hosted on a REMOTE server
					callerLink += mainLink + callerIdNoHost + "?callerId=select&targetHost="+remoteAddr +
						"&callerName="+calleeName + "&callerHost="+location.host;
					if(!playDialSounds) callerLink += "&ds=false";
					//console.log("remote ("+callerID+") ("+callerLink+")");

					let callerIdDisplay = callerID;
					//gLog("id="+id+" callerIdDisplay="+callerIdDisplay+" callerHost="+callerHost+
					//	" location.host="+location.host);
					if(callerIdDisplay.length > remoteCallerIdMaxChar+2) {
						callerIdDisplay = callerIdDisplay.substring(0,remoteCallerIdMaxChar)+"..";
						//gLog("callerIdDisplay="+callerIdDisplay+" "+callerIdDisplay.length);
					}

					if(noLink) {
						callerLink = callerIdDisplay;
					} else {
						callerLink = "<a onclick='openDialRemote(\""+callerLink+"\")'>"+callerIdDisplay+"</a>";
					}
				}

				str += "<td>" + callerNameMarkup + "</td>"+
					"<td>"+	callerLink + "</td>"+
					"<td align='right'>"+
					"<a onclick='deleteMissedCall(\""+
						missedCallsSlice[i].AddrPort+"_"+missedCallsSlice[i].CallTime+"\","+
						"\""+callerName+"\","+
						"\""+callerID+"\")'>"+
					waitingTimeString + "</a></td>";
			}
			str += "</table>"
			missedCallsElement.innerHTML = str;
			if(missedCallsTitleElement) {
				missedCallsTitleElement.style.display = "block";
			}
		}

		if(showCallsWhileInAbsenceCallingItself) {
			// already updating itself
		} else {
			showCallsWhileInAbsenceCallingItself = true;
			setTimeout(function() {
				showCallsWhileInAbsenceCallingItself = false;
				showMissedCalls();
			},15000);
		}
	}
}

function showMsg(msg) {
	document.getElementById("showMsgInner").innerHTML = msg;
	menuDialogOpen(document.getElementById("showMsg"),true);
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

var myCallerAddrPortPlusCallTime = 0;
function deleteMissedCall(callerAddrPortPlusCallTime,name,id) {
	gLog("deleteMissedCall "+callerAddrPortPlusCallTime+" "+name+" "+id);
	myCallerAddrPortPlusCallTime = callerAddrPortPlusCallTime;

	let yesNoInner = "<div style='position:absolute; z-index:110; background:#45dd; color:#fff; padding:20px 20px; line-height:1.6em; border-radius:3px; cursor:pointer;'><div style='font-weight:600'>Delete missed call?</div><br>"+
	"Name:&nbsp;"+name+"<br>ID:&nbsp;"+id+"<br><br>"+
	"<a onclick='deleteMissedCallDo();history.back();'>Delete!</a> &nbsp; &nbsp; <a onclick='history.back();'>Cancel</a></div>";
	menuDialogOpen(dynDialog,true,yesNoInner);
}

function deleteMissedCallDo() {
	// will be called by deleteMissedCall()
	gLog('deleteMissedCallDo '+myCallerAddrPortPlusCallTime);
	wsSend("deleteMissedCall|"+myCallerAddrPortPlusCallTime);
}

function wsSend(message) {
	if(typeof Android !== "undefined" && Android !== null) {
		if(wsConn==null) {
			// currently not connected to webcall server
			console.log('wsSend with wsConn==null -> connectSignaling');
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
	buttonBlinking = false;
	pickupAfterLocalStream = true;
	getStream(); // -> pickup2()
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

	if(typeof Android !== "undefined" && Android !== null) {
		Android.callPickedUp();
	}

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
			if(!muteMicElement || muteMicElement.checked==false) {
				console.log("mute off: audioTracks[0].enabled");
				const audioTracks = localStream.getAudioTracks();
				audioTracks[0].enabled = true;
			} else {
				console.log("mute on: no audioTracks[0].enabled");
			}
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
				.then((results) => getStatsCandidateTypes(results,"Connected",""), // "Mic is open"
					err => console.log(err.message));

				let enableTextchat = function() {
					console.log("enable textchat");
					// hide chat-button
					chatButton.style.display = "none";
					// msgbox NOT editable
					msgbox.readOnly = true;
					// msgbox no placeholder
					msgbox.placeholder = "";
					// show msgbox and textbox
					msgbox.style.display = "block";
					textbox.style.display = "block"; // -> submitForm()

					setTimeout(function() {
						console.log("focus enterTextElement");
						enterTextElement.focus();
					},500);
				};

				if(textmode=="true") {
					// we open the textbox bc the caller requested textmode
					enableTextchat();
				} else if(chatButton) {
					// we show the chatButton, so callee can manually open the textbox
					chatButton.style.display = "block";
					chatButton.onclick = function() {
						if(textchatOKfromOtherSide) {
							enableTextchat();
						} else {
							chatButton.style.display = "none";
							showStatus("peer does not support textchat",4000);
						}
					}
				}
			}
		},200);
	},400);
}

function hangup(mustDisconnect,dummy2,message) {
	showStatus("Hang up ("+message+")",4000);
	answerButton.style.display = "none";
	rejectButton.style.display = "none";

	msgbox.style.display = "none";
	msgbox.value = "";
	textbox.style.display = "none";
	textbox.value = "";
	chatButton.style.display = "none";

	buttonBlinking = false;
	if(textmode!="") {
		textmode = "";
	}
	if(muteMicModified) {
		muteMicElement.checked = false;
		muteMicModified = false;
	}

	remoteVideoFrame.srcObject = null;
	remoteVideoHide();
	pickupAfterLocalStream = false;

	// if mediaConnect -> play short busy tone
	if(!mediaConnect) {
		stopAllAudioEffects("hangup no mediaConnect");
	} else if(!playDialSounds) {
		stopAllAudioEffects("hangup no playDialSounds");
	} else if(!busySignalSound) {
		console.log('# hangup no busySignalSound');
	} else {
		gLog("hangup short busy sound");
		busySignalSound.play().catch(error => {
			console.log('# busySignal play',error.message);
		});

		setTimeout(function() {
			busySignalSound.pause();
			busySignalSound.currentTime = 0;
			stopAllAudioEffects("hangup mediaConnect busy");
		},1000);
	}

	connectLocalVideo(true); // force disconnect
	endWebRtcSession(mustDisconnect,true,"hangup "+message);
	vsendButton.classList.remove('blink_me')
}

function goOnline(sendInitFlag,comment) {
	showStatus("");
	if(goOnlineButton.disabled) {
		console.log('goOnline() goOnlineButton.disabled');
		return;
	}

	goOnlineButton.disabled = true;
	goOfflineButton.disabled = false;
	rtcConnectStartDate = 0;
	mediaConnectStartDate = 0;
	console.log('goOnline '+calleeID);
	addedAudioTrack = null;
	addedVideoTrack = null;

	if(typeof Android !== "undefined" && Android !== null && Android.isConnected()>0) {
		// if already connected do NOT show spinner (we are most likely called by wakeGoOnline())
	} else {
		gLog('goOnline spinner on');
		if(divspinnerframe) divspinnerframe.style.display = "block";
	}

	if(!ringtoneSound) {
		console.log('goOnline lazy load ringtoneSound');
		ringtoneSound = new Audio('1980-phone-ringing.mp3');
		if(ringtoneSound) {
			ringtoneSound.onplaying = function() {
				ringtoneIsPlaying = true;
			};
			ringtoneSound.onpause = function() {
				ringtoneIsPlaying = false;
			};
		}
	}

	if(!busySignalSound) {
		console.log('goOnline lazy load busySignalSound');
		busySignalSound = new Audio('busy-signal.mp3');
	}

	if(!notificationSound) {
		console.log('goOnline lazy load notificationSound');
		notificationSound = new Audio("notification.mp3");
	}

	// going online also means we need to be ready to receive peer connections
	newPeerCon();

	if(wsConn==null /*|| wsConn.readyState!=1*/) {
		console.log('goOnline no wsConn -> login()');
		login(false);
	} else {
		console.log('goOnline have wsConn');
		if(divspinnerframe) divspinnerframe.style.display = "none";
		menuClearCookieElement.style.display = "block";
		muteMicDiv.style.display = "block";
		//nonesense: fileselectLabel.style.display = "block";
		if(sendInitFlag) {
			gLog('goOnline have wsConn -> send init');
			sendInit("goOnline <- "+comment);
		}
	}
}

function newPeerCon() {
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

		gLog('goOnline spinner off');
		if(divspinnerframe) divspinnerframe.style.display = "none";

		offlineAction();
		return;
	};

	peerCon.onicecandidate = e => onIceCandidate(e,"calleeCandidate");
	peerCon.onicecandidateerror = function(e) {
		// don't warn on 701 (chrome "701 STUN allocate request timed out")
		// 400 = bad request
		if(e.errorCode==701) {
			gLog("# peerCon onicecandidateerror " + e.errorCode+" "+e.errorText+" "+e.url,-1);
		} else {
			console.log("# peerCon onicecandidateerror " + e.errorCode+" "+e.errorText,-1);
		}
	}
	peerCon.ontrack = ({track, streams}) => peerConOntrack(track, streams);
	peerCon.onicegatheringstatechange = event => {
		let connection = event.target;
		gLog("peerCon onicegatheringstatechange "+connection.iceGatheringState);
	}
	peerCon.onnegotiationneeded = async () => {
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			console.log('# peerCon onnegotiationneeded deny: no peerCon');
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
		console.log("peerCon signalingstatechange "+peerCon.signalingState);
	}
	peerCon.oniceconnectionstatechange = event => {
		console.log("peerCon oniceconnectionstatechange", peerCon.iceConnectionState);
	}
	peerCon.onconnectionstatechange = event => {
		connectionstatechangeCounter++;
		console.log("peerCon connectionstatechange "+peerCon.connectionState);
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			hangup(true,true,"onconnectionstatechange no peercon");
			return;
		}
		if(peerCon.connectionState=="disconnected") {
			console.log("# peerCon disconnected "+rtcConnect+" "+mediaConnect);
			stopAllAudioEffects();
			endWebRtcSession(true,true,"peerCon disconnected"); // -> peerConCloseFunc

		} else if(peerCon.connectionState=="failed") {
			// "failed" could be an early caller hangup
			// this may come with a red "WebRTC: ICE failed, see about:webrtc for more details"
			// in which case the callee webrtc stack seems to be hosed, until the callee is reloaded
			// or until offline/online
			console.log("# peerCon failed "+rtcConnect+" "+mediaConnect);
			stopAllAudioEffects();
			endWebRtcSession(true,true,"peerCon failed"); // -> peerConCloseFunc

			newPeerCon();
			if(wsConn==null) {
				gLog('peerCon failed and have no wsConn -> login()');
				login(false);
			} else {
				// init already sent by endWebRtcSession() above
				//gLog('peerCon failed but have wsConn -> send init');
				//sendInit("after peerCon failed");
			}
		} else if(peerCon.connectionState=="connected") {
			peerConnected2();
		}
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
	console.log("peerConnected2 rtcConnect");
	// scroll to top
	window.scrollTo({ top: 0, behavior: 'smooth' });

	wsSend("rtcConnect|")

	if(!dataChannel) {
		gLog('peerConnected2 createDataChannel');
		createDataChannel();
	}

	let skipRinging = false;
	if(typeof Android !== "undefined" && Android !== null) {
		skipRinging = Android.rtcConnect(); // may auto-call pickup()
	}

	if(!skipRinging) {
		let doneRing = false;
		if(typeof Android !== "undefined" && Android !== null &&
		   typeof Android.ringStart !== "undefined" && Android.ringStart !== null) {
			// making sure the ringtone volume is the same in Android and JS
			console.log('peerConnected2 Android.ringStart()');
			doneRing = Android.ringStart();
		}

		if(!doneRing && ringtoneSound) {
			// browser must play ringtone
			console.log('peerConnected2 playRingtoneSound '+ringtoneSound.volume);
			allAudioEffectsStopped = false;
			var playRingtoneSound = function() {
				if(allAudioEffectsStopped) {
					if(!ringtoneSound.paused && ringtoneIsPlaying) {
						gLog('peerConnected2 playRingtoneSound ringtoneSound.pause');
						ringtoneSound.pause();
						ringtoneSound.currentTime = 0;
					} else {
						gLog('peerConnected2 playRingtoneSound NO ringtoneSound.pause',
							ringtoneSound.paused, ringtoneIsPlaying);
					}
					return;
				}
				ringtoneSound.onended = playRingtoneSound;

				if(ringtoneSound.paused && !ringtoneIsPlaying) {
					gLog('peerConnected2 ringtone play...');
					ringtoneSound.play().catch(error => {
						console.log('# ringtone play',error.message);
					});
				} else {
					gLog('peerConnected2 ringtone play NOT started',
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
					//gLog("peerConnected2 buttonBlinking stop");
					answerButton.style.background = "#04c";
					return;
				}
				gLog("peerConnected2 buttonBlinking...");
				setTimeout(blinkButtonFunc, 500);
			}
		}
		blinkButtonFunc();
	}

	setTimeout(function() {
		if(!peerCon || peerCon.iceConnectionState=="closed") {
			// caller early abort
			gLog('peerConnected2 caller early abort');
			//hangup(true,true,"caller early abort");
			stopAllAudioEffects();
			endWebRtcSession(true,true,"caller early abort"); // -> peerConCloseFunc
			return;
		}
		// instead of listOfClientIps
		gLog('peerConnected2 accept incoming call?',listOfClientIps);
		peerCon.getStats(null)
		.then((results) => getStatsCandidateTypes(results,"Incoming", ""),
			err => console.log(err.message)); // -> wsSend("log|callee Incoming p2p/p2p")

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
			var pickupFunc = function() {
				// may have received "onmessage disconnect (caller)" and/or "cmd cancel (server)" in the meantime
				if(!buttonBlinking) {
					return;
				}
				// only auto-pickup if iframeWindow (caller widget) is NOT active
				if(iframeWindowOpenFlag) {
					setTimeout(pickupFunc,1000);
					return;
				}
				console.log("auto-answer call");
				pickup();
			}
			setTimeout(pickupFunc,1000);
		}

		answerButton.onclick = function(ev) {
			ev.stopPropagation();
			gLog("peerConnected2 answer button");
			pickup();
		}
		rejectButton.onclick = function(ev) {
			ev.stopPropagation();
			gLog("peerConnected2 hangup button");
			hangup(true,true,"rejectButton");
		}
	},400);
}

function getStatsCandidateTypes(results,eventString1,eventString2) {
//	if(muteMicElement && muteMicElement.checked) {
//		eventString2 = ""; // do not show "Mic is open"
//	}

	let msg = getStatsCandidateTypesEx(results,eventString1,eventString2)
	//console.log("!!!! msg=("+msg+") callerName=("+callerName+") callerID=("+callerID+") callerMsg=("+callerMsg+")");
	wsSend("log|callee "+msg); // shows up in server log as: serveWss peer callee Incoming p2p/p2p

	if(textmode=="true") {
		msg = msg + " TextMode";
	}

	// we rather show callerID and/or callerName if they are avail, instead of listOfClientIps
	if(callerName!="" || callerID!="") {
		if(callerName=="" || callerName.toLowerCase()==callerID.toLowerCase()) {
			msg = callerID +" "+ msg;
		} else {
			msg = callerName +" "+ callerID +" "+ msg;
		}
	} else if(listOfClientIps!="") {
		msg += " "+listOfClientIps;
	}

	if(callerMsg!="") {
		msg += "<br>\""+callerMsg+"\""; // greeting msg
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
			// tell other side that we support textchat
			textchatOKfromOtherSide = false;
			dataChannel.send("textchatOK");
		};
		dataChannel.onclose = event => dataChannelOnclose(event);
		dataChannel.onerror = event => dataChannelOnerror(event);
		dataChannel.onmessage = event => dataChannelOnmessage(event);
	};
}

function dataChannelOnmessage(event) {
	if(typeof event.data === "string") {
		//console.log("dataChannel.onmessage "+event.data);
		if(event.data) {
			if(event.data.startsWith("disconnect")) {
				gLog("dataChannel.onmessage '"+event.data+"'");
				dataChannel.close();
				dataChannel = null;
				hangupWithBusySound(true,"disconnect via dataChannel");
			} else if(event.data.startsWith("textchatOK")) {
				textchatOKfromOtherSide = true;
			} else if(event.data.startsWith("msg|")) {
				// textchat msg from caller via dataChannel
				// sanitize incoming data
				//let cleanString = event.data.substring(4).replace(/<(?:.|\n)*?>/gm, "...");
				let cleanString = cleanStringParameter(event.data.substring(4),false);
				if(cleanString!="") {
					//gLog("dataChannel.onmessage msg",cleanString);
					if(msgbox) {
						chatButton.style.display = "none";
						msgbox.style.display = "block";
						msgbox.readOnly = true;
						msgbox.placeholder = "";
						textbox.style.display = "block"; // -> submitForm()
						let msg = "< " + cleanString;
						if(msgbox.value!="") { msg = newline + msg; }
						msgbox.value += msg;
						//console.log("msgbox "+msgbox.scrollTop+" "+msgbox.scrollHeight);
						msgbox.scrollTop = msgbox.scrollHeight-1;
						beep();
					}
				}
			} else if(event.data.startsWith("cmd|")) {
				let subCmd = event.data.substring(4);
				signalingCommand(subCmd,"dataChl");
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
		if(fileReceivedSize === fileSize) {
			gLog("file receive complete");
			const receivedBlob = new Blob(fileReceiveBuffer);
			fileReceiveBuffer = [];
			progressRcvElement.style.display = "none";

			let randId = ""+Math.floor(Math.random()*100000000);
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
			aDeleteElement.onclick = function(ev){
				ev.stopPropagation();
				downloadList.removeChild(aDivElement);
			}
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
	if(typeof Android !== "undefined" && Android !== null &&
	   typeof Android.ringStop !== "undefined" && Android.ringStop !== null) {
		if(Android.ringStop())
			return;
	}
	try {
		if(ringtoneSound!=null && !ringtoneSound.paused && ringtoneIsPlaying) {
			gLog('stopAllAudioEffects ringtoneSound.pause');
			ringtoneSound.pause();
			ringtoneSound.currentTime = 0;
		}

		if(playDialSounds && busySignalSound) {
			busySignalSound.pause();
			busySignalSound.currentTime = 0;
		}
	} catch(ex) {
		console.log('# ex stopAllAudioEffects '+ex.message);
	}
}

var goOnlinePending = false;
function endWebRtcSession(disconnectCaller,goOnlineAfter,comment) {
	console.log('endWebRtcSession discCaller='+disconnectCaller+" onlAfter="+goOnlineAfter+" ("+comment+")");
	pickupAfterLocalStream = false;
	if(remoteVideoFrame) {
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
		remoteVideoHide();
		remoteStream = null;
	}
	buttonBlinking = false;

	msgbox.style.display = "none";
	msgbox.value = "";
	textbox.style.display = "none";
	textbox.value = "";
	chatButton.style.display = "none";

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
				if(isDataChlOpen()) {
					// caller is still peerConnected: let the caller know we will now disconnect
					console.log('endWebRtcSession dataChannel.send(disconnect)');
					dataChannel.send("disconnect");
					if(wsConn) {
						// also tell the server about it
						console.log('endWebRtcSession wsSend(cancel)');
						wsSend("cancel|disconnect"); // very important (if caller is not ws-disconnected)
					}
				} else {
					// caller is NOT peerConnected anymore: tell server the peer-session is over
					console.log('endWebRtcSession dataChannel already closed');
					if(wsConn) {
						console.log('endWebRtcSession wsSend(cancel)');
						wsSend("cancel|disconnectByCaller"); // very important (if caller is not ws-disconnected)
					}
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

		if(rtcConnect && peerCon && peerCon.iceConnectionState!="closed") {
			gLog('endWebRtcSession getStatsPostCall');
			peerCon.getStats(null).then((results) => {
				getStatsPostCall(results);
				peerConCloseFunc();
			}, err => {
				console.log(err.message);
				peerConCloseFunc();
			});
		} else if(peerCon && peerCon.iceConnectionState!="closed") {
			peerConCloseFunc();
		}
	}

	if(localStream && !videoEnabled) {
		gLog('endWebRtcSession clear localStream');
		const audioTracks = localStream.getAudioTracks();
		audioTracks[0].enabled = false; // mute mic
		localStream.getTracks().forEach(track => { track.stop(); });
		localStream.removeTrack(audioTracks[0]);
		localStream = null;
	}

	if(typeof Android !== "undefined" && Android !== null) {
		Android.peerDisConnect();
	}

	if(wsConn) {
		onlineIndicator.src="green-gradient.svg";
	} else {
		onlineIndicator.src="";
	}

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

	if(goOnlineAfter && !goOnlinePending) {
		// "goOnline()" is not the best fkt-name in this context
		// main thing here is that we call goOnline() to create a fresh newPeerCon() -> new RTCPeerConnection()
		// for the next incoming call
		// but bc we keep our wsConn alive, no new login is needed
		// (no new ws-hub will be created on the server side)
		// goOnlinePending flag prevents secondary calls to goOnline
		goOnlinePending = true;
		gLog('endWebRtcSession delayed auto goOnline()...');
		// TODO why exactly is this delay needed in goOnlineAfter?
		setTimeout(function() {
			gLog('endWebRtcSession auto goOnline()');
			goOnlinePending = false;
			//console.log("callee endWebRtcSession auto goOnline(): enable goonline");
			goOnlineButton.disabled = false;
			// get peerCon ready for the next incoming call
			// bc we are most likely still connected, goOnline() will just send "init"
			goOnline(true,"endWebRtcSession");
		},500);
	} else {
		offlineAction();
	}
}

function goOffline() {
	wsAutoReconnecting = false;
	offlineAction();
	gLog("goOffline "+calleeID);
	showStatus("");
	ownlinkElement.innerHTML = "";
	stopAllAudioEffects("goOffline");
	waitingCallerSlice = null;
	muteMicDiv.style.display = "none";

	isHiddenlabel.style.display = "none";
	autoanswerlabel.style.display = "none";
	dialsoundslabel.style.display = "none";
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
		gLog('wsClose');
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

	if(divspinnerframe) divspinnerframe.style.display = "none";
}

function getCookieSupport() {
	// returns: null = no cookies; false = only session cookies; true = all cookies allowed
    var persist= true;
    do {
        var c= 'gCStest='+Math.floor(Math.random()*100000000);
        document.cookie= persist? c+';SameSite=Strict;Secure;expires=Tue, 01-Jan-2030 00:00:00 GMT' : c;
        if(document.cookie.indexOf(c)!==-1) {
            document.cookie= c+';SameSite=Strict;Secure;expires=Sat, 01-Jan-2000 00:00:00 GMT';
            return persist;
        }
    } while(!(persist= !persist));
    return null;
}

function openNews(newsUrl) {
	// also called directly from WebCall for Android service
	// here we set horiCenterBound=true
	// we also set dontIframeOnload=true so that height:100% determines the iframe height
	// also: dontIframeOnload=true may be required if newsUrl points to a different domain
	// to avoid DOMException in iframeOnload()
	let randId = ""+Math.floor(Math.random()*100000000);
	if(newsUrl.indexOf("?")>=0)
		newsUrl += "&i="+randId;
	else
		newsUrl += "?i="+randId;
	console.log("openNews "+newsUrl);
	iframeWindowOpen(newsUrl,true,"max-width:800px;height:100%;",true);
}

var counter=0;
function openContacts() {
	let url = "/callee/contacts/?ds="+playDialSounds;
	gLog("openContacts "+url);
	iframeWindowOpen(url,false,"height:95vh;",true);
}

function openDialId(userId) {
	let url = "/user/";
	if(userId) {
		url = "/user/"+userId;
	}
	gLog('openDialId url='+url);
	// 4th parameter 'dontIframeOnload':
	// iframeOnload() for dial-id takes scrollHeight from caller html min-height
	iframeWindowOpen(url,false,"height:460px;max-width:480px;",true);
}

function openDialRemote(url) {
	gLog('openDialUrl',url);
	// 4th parameter 'dontIframeOnload':
	// iframeOnload() for dial-id takes scrollHeight from caller html min-height
	iframeWindowOpen(url,false,"height:460px;max-width:480px;",true);
}

function openDialUrl(url) {
	gLog('openDialUrl',url);
	// 4th parameter 'dontIframeOnload':
	// iframeOnload() for dial-id takes scrollHeight from caller html min-height
	iframeWindowOpen(url,false);
}

function openIdMapping() {
	let url = "/callee/mapping/"; //?ds="+playDialSounds;
	gLog('openIdMapping',url);
	// id manager does not need 600px width
	iframeWindowOpen(url,false,"height:460px;max-width:500px;",true);
}

function openSettings() {
	let url = "/callee/settings/?id="+calleeID+"&ver="+clientVersion;
	gLog('openSettings='+url);
	iframeWindowOpen(url,false,"max-width:440px;");
	// when iframe closes, client.js:iframeWindowClose() will call getSettings()
}

function clearcache() {
	// will only be enabled if Android.getVersionName() >= "1.0.8"
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.reload !== "undefined" && Android.reload !== null) {
			let wasConnected = wsConn!=null;
			Android.wsClose();
			console.log("clearcache android wsClearCache(true,"+wasConnected+")");
			Android.wsClearCache(true, wasConnected); // autoreload, autoreconnect
		} else {
			console.log("clearcache android reload undefined");
		}
	}
}

function exit() {
	gLog("exit");
	if(typeof Android !== "undefined" && Android !== null) {
		history.back();
		// wait for pulldown menu to close
		setTimeout(function() {
			// ask yes/no
			let yesNoInner = "<div style='position:absolute; z-index:110; background:#45dd; color:#fff; padding:20px 20px; line-height:1.6em; border-radius:3px; cursor:pointer; min-width:240px; top:40px; left:50%; transform:translate(-50%,0%);'><div style='font-weight:600;'>Exit?</div><br>"+
			"WebCall will shut down. You will need to restart the app to receive calls.<br><br>"+
			"<a onclick='Android.wsExit();history.back();'>Exit!</a> &nbsp; &nbsp; <a onclick='history.back();'>Cancel</a></div>";
			menuDialogOpen(dynDialog,false,yesNoInner);
		},300);
	} else {
		// this is not used: exit() is currently only available in Android mode
		history.back();
	}
}

function wakeGoOnline() {
	gLog("wakeGoOnline start");
	connectSignaling('','wakeGoOnline'); // only get wsConn from service (from Android.wsOpen())
	wsOnOpen(); // green led
	goOnlineButton.disabled = false; // prevent goOnline() abort
	goOnline(true,"wakeGoOnline");   // newPeerCon() + wsSend("init|!")
	gLog("wakeGoOnline done");
}

function wakeGoOnlineNoInit() {
	gLog("wakeGoOnlineNoInit start");
	connectSignaling('','wakeGoOnlineNoInit'); // only get wsConn from service (from Android.wsOpen())
	wsOnOpen(); // green led
	goOnlineButton.disabled = false; // prevent goOnline() abort
	goOnline(false,"wakeGoOnline");  // newPeerCon() but do NOT wsSend("init|!")
	gLog("wakeGoOnlineNoInit done");
}

function clearcookie2() {
	console.log("clearcookie2 id=("+calleeID+")");
	containerElement.style.filter = "blur(0.8px) brightness(60%)";
	goOffline();
	if(iframeWindowOpenFlag) {
		gLog("clearcookie2 history.back");
		history.back();
	}
	clearcookie();
}

