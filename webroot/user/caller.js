// WebCall Copyright 2021 timur.mobi. All rights reserved.
'use strict';
const dialButton = document.querySelector('button#callButton');
const hangupButton = document.querySelector('button#hangupButton');
const calleeOnlineElement = document.getElementById("calleeOnline");

const avSelect = document.querySelector("select#avSelect");
const localVideoDiv = document.querySelector('div#localVideoDiv');
const localVideoFrame = document.querySelector('video#localVideoFrame');
const localVideoLabel = document.querySelector('div#localVideoLabel');
const remoteVideoDiv = document.querySelector('div#remoteVideoDiv');
const remoteVideoFrame = document.querySelector('video#remoteVideoFrame');
const remoteVideoLabel = document.querySelector('div#remoteVideoLabel');
const enableVideoLabel = document.querySelector('label#enableVideoLabel');
const enableVideoCheckbox = document.querySelector('input#enableVideoCheckbox');

const iframeWindowElement = document.getElementById('iframeWindow');
const mainElement = document.getElementById('container');
const menuElement = document.getElementById('menu');
const menuDialogElement = document.getElementById('menuDialog');
const fullScreenOverlayElement = document.getElementById('fullScreenOverlay');
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
var callerId = ""; // calleeId of the caller
var callerName = ""; // callee name of the caller
var otherUA="";
var microphoneIsNeeded = true;
var fileReceiveBuffer = [];
var fileReceivedSize = 0;
var fileName = "";
var fileSize = 0;
var hashcounter=0;
var fileReceiveStartDate=0;
var fileReceiveSinceStartSecs=0;
var fileSendAbort=false;
var fileReceiveAbort=false;

var extMessage = function(e) {
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
	let id = getUrlParams("id");
	if(typeof id!=="undefined" && id!="") {
		calleeID = id;
	}
	if(calleeID=="") {
		if(!gentle) console.log("onload no calleeID abort");
		let myMainElement = document.getElementById('container')
		let mainParent = myMainElement.parentNode;
		mainParent.removeChild(myMainElement);
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

	// if on start there is a fragment/hash ('#') in the URL, remove it
	if(location.hash.length > 0) {
		console.log("location.hash.length=%d",location.hash.length);
		window.location.replace("/user/"+calleeID);
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
				if(!gentle) console.log("onhashchange iframeWindowClose");
				iframeWindowClose();
			} else if(menuDialogOpenFlag) {
				if(!gentle) console.log("onhashchange menuDialogClose");
				menuDialogClose();
			}
		}
		hashcounter = newhashcounter;
		//console.log("onhashchange ",hashcounter);
	}

	localVideoFrame.onresize = function() {
		if(!gentle) console.log('local video size changed',localVideoFrame.videoWidth, localVideoFrame.videoHeight);
	}

	remoteVideoFrame.onresize = function() {
		if(!gentle) console.log('remote video size changed',remoteVideoFrame.videoWidth, remoteVideoFrame.videoHeight);
	}

	enableVideoCheckbox.addEventListener('change', function() {
		if(this.checked) {
			if(!gentle) console.log("enableVideoCheckbox checked");
			if(localStream) {
				// enable local stream
				if(peerCon && sendLocalStream && localStream.getTracks().length>=2 && !videoSendTrack) {
					if(localCandidateType=="relay" || remoteCandidateType=="relay") {
						if(!gentle) console.log('enableVideoCheckbox checked no addTrack vid on relayed con (%s)(%s)',localCandidateType,remoteCandidateType);
					} else {
						if(!gentle) console.log('enableVideoCheckbox checked addTrack vid',localStream.getTracks()[1]);
						videoSendTrack = peerCon.addTrack(localStream.getTracks()[1],localStream);
					}
				}
				localVideoFrame.srcObject = localStream; // see gotStream()
				localVideoFrame.volume = 0; // avoid audio feedback
				localVideoFrame.load();
				localVideoFrame.play().catch(function(error) {});
			}
			localVideoDiv.style.display = "block";

			if(remoteStream) {
				// enable local video
				remoteVideoFrame.srcObject = remoteStream; // see 'peerCon.ontrack onunmute'

				remoteVideoFrame.load();
				remoteVideoFrame.play().catch(function(error) {});
			}
			remoteVideoDiv.style.display = "block";

			getStream().then(() => navigator.mediaDevices.enumerateDevices()) //.then(gotDevices);
			.then((deviceInfos) => {
				gotDevices(deviceInfos);

				// now switch to the 1st video option
				let optionElements = Array.from(avSelect);
				if(optionElements.length>0) {
					if(!gentle) console.log("enableVideoCheckbox set avSelect.selectedIndex",optionElements.length -1);
					// pre-select the 1st video device
					for(let i=0; i<optionElements.length; i++) {
						if(optionElements[i].text.startsWith("Video")) {
							avSelect.selectedIndex = i;
							break;
						}
					}
					// activate the selected device
					getStream();
				}
			});
		} else {
			// disable local video
			if(!gentle) console.log("enableVideoCheckbox unchecked");

			// disable local video
			if(localStream) {
				if(localStream.getAudioTracks().length>0) {
					// preserve audio
					localVideoDiv.style.visibility = "hidden";
				} else {
					// disable audio + video
					localVideoDiv.style.display = "none";
				}
				connectLocalVideo(true); // stop video track
			} else {	
				localVideoDiv.style.display = "none";
			}

			// disable remote video
			if(remoteStream) {
				if(remoteStream.getAudioTracks().length>0) {
					// preserve audio
					remoteVideoDiv.style.visibility = "hidden";
				} else {
					// disable audio + video
					remoteVideoDiv.style.display = "none";
				}

				if(videoSendTrack) {
					if(!gentle) console.log("enableVideoCheckbox unchecked peerCon.removeTrack(videoSendTrack)");
					peerCon.removeTrack(videoSendTrack); // videoSendTrack is from peerCon.addTrack(videotrack)
					videoSendTrack = null;
				} else {
					if(!gentle) console.log("enableVideoCheckbox unchecked peerCon.removeTrack(videoSendTrack) (no videoSendTrack)");
				}
			} else {
				if(!gentle) console.log("enableVideoCheckbox unchecked remove video Track (no remoteStream)");
				remoteVideoDiv.style.display = "none";
			}

			// now switch to the 1st audio option
			let optionElements = Array.from(avSelect);
			if(optionElements.length>0) {
				if(!gentle) console.log("enableVideoCheckbox unchecked avSelect.selectedIndex",optionElements.length);
				// pre-select the 1st video device
				for(let i=0; i<optionElements.length; i++) {
					if(optionElements[i].text.startsWith("Audio")) {
						avSelect.selectedIndex = i;
						break;
					}
				}
				// activate the selected device
				getStream();
			}

// TODO "remote cam streaming" -> "remote cam not streaming"

// TODO need to make sure the last frame on callee-side (now frozen) disappears
		}
		setTimeout(historyBack,150);
	});

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

	checkServerMode(function(mode) {
		if(mode==0) {
			// normal mode
			var calleeIdTitle = calleeID.charAt(0).toUpperCase() + calleeID.slice(1);
			if(calleeID.startsWith("!")) {
				calleeIdTitle = "Duo"
			}

			document.title = "WebCall "+calleeIdTitle;
			if(titleElement) {
				titleElement.innerHTML = "WebCall "+calleeIdTitle;
			}

			if(!gentle) console.log('start caller with calleeID',calleeID);
			avSelect.onchange = getStream;

			// we need to know if calleeID is online asap (will switch to callee-online-layout if it is)
			dialAfterCalleeOnline = false;
			checkCalleeOnline();

			if(dialButton!=null) {
				if(!calleeID.startsWith("!")) {
					if(singlebutton) {
						dialButton.innerHTML = "<b>W E B C A L L</b><br>"+singleButtonReadyText;
					} else {
						if(calleeID.match(/^[0-9]*$/) != null) {
							// calleeID is pure numeric - don't show
						} else {
							dialButton.innerHTML = "Call "+calleeIdTitle;
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
						//avSelect.disabled = true;
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
			let myMainElement = document.getElementById('container')
			let mainParent = myMainElement.parentNode;
			mainParent.removeChild(myMainElement);
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
	}, errorAction
		// errorAction will switch back; if we don't want this we should handle err like in notifyConnect()
	);
}

function calleeOnlineStatus(onlineStatus) {
	if(rtcConnect || dialing) {
		// TODO check if this is still required/meaningful
		console.log('calleeOnlineStatus abort',rtcConnect,dialing);
		return;
	}
	if(!gentle) console.log('calleeOnlineStatus',onlineStatus);
	// wsAddr should be something like "127.0.0.1:8071?wsid=4054932942"
	if(onlineStatus!="" && onlineStatus.indexOf("wsid=")>=0) {
		// callee is available/online
		let tok = onlineStatus.split("|");
		wsAddr = tok[0];
		var calleeVideo = false;
		for(var i=1; i<tok.length; i++) {
			let tok2 = tok[i].split("=");
			if(tok2.length>1) {
				var cmd = tok2[0];
				var val = tok2[1];
				console.log('calleeOnlineStatus cmd=%s val=%s',cmd,val);
				if(cmd=="video") {
					if(val=="true" || val=="on") {
						calleeVideo = true;
					}
				}
			}
		}
		if(calleeVideo) {
			// enable video checkbox in popup menuDialog
			enableVideoLabel.style.display = "block";
		} else {
			enableVideoLabel.style.display = "none";
			enableVideoCheckbox.checked = false;
		}

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
	// TODO here we could act on "busy" and "notavail"

	if(singlebutton) {
		// no free callee available (aka "all lines busy")
		console.log('singlebutton no free callee available');
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
	//avSelect.disabled = false;
	if(!neverAudio) {
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
				showStatus("You are about to call a digital answering machine.",-1);
			} else if(calleeID.startsWith("talkback")) {
				if(!singlebutton) {
					msgbox.style.display = "none";
				}
				showStatus( "Talkback service let's you test your microphone audio quality. "+
							"The first six seconds of the call will be recorded (red led) "+
							"and then immediately played back to you (green led).",-1);
			} else if(calleeID.startsWith("!")) {
				showStatus("Hit the Call button to establish a telephony connection.",-1);
			} else {
				if(!singlebutton) {
					showStatus( "Before you hit the Call button, you can enter a name "+
								"or a topic for the convenience of the callee.",-1)
					msgbox.style.display = "block";
					if(!gentle) console.log('callerName',callerName);
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

var calleeName = "";
var confirmValue = "";
var confirmWord = "123";
var confirmXhrNickname = false;
function confirmNotifyConnect() {
	// offer caller to enter own name and ask to confirm with a specific word ("yes")
	// using a form with two text fields

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

function gotStream2() {
	if(dialAfterLocalStream) {
		if(!gentle) console.log("gotStream dialAfterLocalStream");
		dialAfterLocalStream=false;
		connectSignaling("",dial);
	} else {
		if(!enableVideoCheckbox.checked && localStream) {
			// disable local mic until we start dialing
			localStream.getTracks().forEach(track => { track.stop(); });
			const audioTracks = localStream.getAudioTracks();
			localStream.removeTrack(audioTracks[0]);
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
			signallingCommand(messages[i]);
			if(!peerCon) {
				break;
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
			console.log('wsConn.onclose: failed to open');
			showStatus("No signaling server");
			hangupWithBusySound(false,"Busy")
		} else {
			// onclose after a ws-connection has been established
			// most likey the callee is busy
			console.log('wsConn.onclose');
		}
		wsConn=null;
	};
}

function signallingCommand(message) {
	let tok = message.split("|");
	let cmd = tok[0];
	let payload = "";
	if(tok.length>=2) {
		payload = tok[1];
	}

	if(cmd=="calleeDescription") {
		if(!peerCon) {
			console.warn('calleeDescription abort no peerCon');
			return;
		}
		hostDescription = JSON.parse(payload);

		if(!gentle) console.log("cmd calleeDescription setLocalDescription");
		peerCon.setLocalDescription(localDescription).then(() => {
			if(!gentle) console.log('cmd hostDescription setRemoteDescription');
			peerCon.setRemoteDescription(hostDescription).then(() => {
				if(!gentle) console.log('cmd hostDescription setRemoteDescription done');
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
			if(!gentle) console.log('cmd calleeDescriptionUpd setRemoteDescription done');

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
// TODO err: "Failed to set local descr: OperationError: Failed to execute 'setLocalDescription' 
// on 'RTCPeerConnection': Failed to set local answer sdp: Called in wrong state: stable"
						if(!gentle) console.log('calleeDescriptionUpd localDescription set -> signal');
						if(dataChannel && dataChannel.readyState=="open") {
							dataChannel.send("cmd|callerDescriptionUpd|"+JSON.stringify(localDescription));
						} else {
							wsSend("callerDescriptionUpd|"+JSON.stringify(localDescription));
						}
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
			return;
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
		if(!rtcConnect) {
			if(!gentle) console.warn('cmd pickup without rtcConnect; ignored');
			return
		}

		var enableRemoteStream = function(calleeCandidate) {
			let micStatus = "";
			if(singlebutton) {
				hangupButton.innerHTML = singleButtonConnectedText;
				hangupButton.style.boxShadow = "0px 0px 10px #f00";
				hangupButton.style.background = 'url("")'; 
				dialButton.style.backgroundColor = "";
				hangupButton.style.backgroundColor = "";
			} else {
				if(microphoneIsNeeded && !neverAudio) {
					onlineIndicator.src="red-gradient.svg";
					micStatus = "Mic is open";
				} else {
					// mic not open
					dialButton.style.boxShadow = "";
					onlineIndicator.src="green-gradient.svg";
				}
			}

			// enable (un-mute) remoteStream
			if(!gentle) console.log('set remoteVideoFrame',remoteStream);
			remoteVideoFrame.srcObject = remoteStream; // see 'peerCon.ontrack onunmute'
			remoteVideoFrame.load();
			remoteVideoFrame.play().catch(function(error) {});
			if(enableVideoCheckbox.checked) {
				remoteVideoDiv.style.display = "block";
			}
			mediaConnect = true;
			mediaConnectStartDate = Date.now();

			if(fileselectLabel!=null && dataChannel!=null && dataChannel.readyState=="open") {
				if(localCandidateType!="relay" && remoteCandidateType!="relay") {
					fileselectLabel.style.display = "inline-block";
				}
			}

			// getting stats on p2p or relayed connection
			console.log('full mediaConnect, getting stats...');
			peerCon.getStats(null)
				.then((results) => getStatsCandidateTypes(results,"Connected",micStatus),
				err => console.log(err));

			onnegotiationneededAllowed = true;
		}

		console.log('callee is answering our call');
		stopAllAudioEffects();

		if(!singlebutton) {
			msgbox.style.display = "none";
		}

		if(!localStream && !neverAudio) {
			console.warn("cmd pickup no localStream");
			// I see this when I quickly re-dial while busy signal of last call is still playing
			// TODO button may now continue to show "Connecting..."
			// but connection is still established (at least when calling answ)
			hangupWithBusySound(true,"pickup but no localStream");
			return;
		}

		// we now wait up to 6x300ms for remoteStream before we continue with enableRemoteStream()
		// remoteStream will arrive via: peerCon.ontrack onunmute
		var waitLoopCount=0;
		let waitForRemoteStreamFunc = function() {
			if(!gentle) console.log('waitForRemoteStreamFunc',remoteStream!=null,waitLoopCount);
			if(!remoteStream) {
				waitLoopCount++;
				if(waitLoopCount<=4) {
					setTimeout(waitForRemoteStreamFunc, 300);
					return;
				}
			}
			if(!gentle) console.log('waitForRemoteStreamFunc enableRemoteStream');
			enableRemoteStream();
		}
		waitForRemoteStreamFunc();

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
				if(sessionDuration>0) {
					startTimer(sessionDuration);
				}
			}
		}
	} else if(cmd=="ua") {
		otherUA = payload;
		console.log("otherUA",otherUA);

	} else if(cmd=="enableVideo") {
		if(payload=="false") {
			enableVideoLabel.style.display = "none";
		} else {
			enableVideoLabel.style.display = "block";
		}

	} else if(cmd=="callerDescription" || cmd=="callerCandidate" || "callerInfo" ||
			cmd=="stop" || cmd=="ping" || cmd=="rtcConnect" || cmd=="callerDescriptionUpd") {
		// ignore without log

	} else {
		// ignore with log
		console.warn('ignore incom cmd',cmd);
	}
}

var sendLocalStream = false;
function connectLocalVideo(forceOff) {
	// invoked by onclick id="localVideoConnect"

	// TODO: if already connected:
	//   disconnect
	//   localVideoConnect.innerHTML = "connect";
	//   return

	if(!sendLocalStream && !forceOff) {
		// send LocalVideo to other peer
		if(dataChannel && dataChannel.readyState=="open") {
			console.log("connectLocalVideo() request rtcNegotiate via dataChannel");
			// make callee execute connectLocalVideo() -> pickup() -> gotStream() -> "calleeDescriptionUpd"
			dataChannel.send("cmd|rtcNegotiate");
			sendLocalStream = true;

//			const audioTracks = localStream.getAudioTracks();
//			audioTracks[0].enabled = true; // unmute
//			peerCon.addTrack(audioTracks[0],localStream);

			if(enableVideoCheckbox.checked && sendLocalStream) {
				if(localCandidateType=="relay" || remoteCandidateType=="relay") {
					if(!gentle) console.log('connectLocalVideo() peerCon no addTrack video on relayed con (%s)(%s)',localCandidateType,remoteCandidateType);
				} else if(localStream.getTracks().length>=2) {
					if(!gentle) console.log('connectLocalVideo() addTrack vid',localStream.getTracks()[1]);
					videoSendTrack = peerCon.addTrack(localStream.getTracks()[1],localStream);
				} else {
					if(!gentle) console.log('connectLocalVideo() no addTrack vid no vid track',localStream.getTracks().length);
				}
			}

// TODO tmtmtm do this when local video is actually streaming
			localVideoLabel.innerHTML = "local cam streaming";
			localVideoLabel.style.color = "#ff0";
		} else {
			console.log("######## connectLocalVideo() no dataChannel");
		}
	} else {
		sendLocalStream = false;

		if(!localStream) {
			console.log("connectLocalVideo() disconnect (!localStream)");
		} else if(videoSendTrack) {
			console.log("connectLocalVideo() disconnect (stop video track)");
			peerCon.removeTrack(videoSendTrack);
			videoSendTrack = null;
			// connection needs to be negotiated again!
		} else {
			console.log("connectLocalVideo() disconnect (do nothing)",localStream.getTracks().length);
		}

		localVideoLabel.innerHTML = "local cam not streaming";
		localVideoLabel.style.color = "#fff";
	}

	// TODO once connection has been established:
	//   localVideoConnect.innerHTML = "disconnect";
}

function wsSend(message) {
	if(wsConn==null || wsConn.readyState!=1) {
		connectSignaling(message,null);
	} else {
		wsConn.send(message);
	}
}

function showStatus(msg,timeoutMs) {
	//if(!gentle) console.log('showStatus(%s)',msg);
	if(!singlebutton) {
		let sleepMs = 3000;
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
		hangupWithBusySound(true,"pickup with no localStream");
		return;
	}
	showStatus(connectingText,-1);
	otherUA = "";
	dialing = true;
	rtcConnect = false;
	mediaConnect = false;
	if(fileselectLabel!=null) {
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
// TODO if track (MediaStreamTrack) kind=="video" enabled==true -> "remote cam streaming"
		if(track.enabled && track.kind=="video") {
			remoteVideoLabel.innerHTML = "remote cam streaming";
			remoteVideoLabel.style.color = "#ff0";
		}
// not sure yet when to switch back to "remote cam not streaming"

		track.onunmute = () => {
			if(remoteVideoFrame!=null && remoteVideoFrame.srcObject == streams[0]) {
				if(!gentle) console.warn('peerCon.ontrack onunmute was already set');
				return;
			}
			if(!gentle) console.log('peerCon.ontrack onunmute set remoteStream',streams.length,streams[0]);
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
				if(dataChannel && dataChannel.readyState=="open") {
					dataChannel.send("cmd|callerDescriptionUpd|"+JSON.stringify(localDescription));
				} else {
					wsSend("callerDescriptionUpd|"+JSON.stringify(localDescription));
				}
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

				if(!singlebutton) {
					let msgboxText = msgbox.value.substring(0,300);
					if(!gentle) console.log('msgboxText',msgboxText);
					if(msgboxText!="") {
						if(dataChannel) {
							if(dataChannel.readyState=="open") {
								if(!gentle) console.log('send msgbox',msgboxText);
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
/*
		// we do this in connectLocalVideo()
		if(enableVideoCheckbox.checked) {
			if(localStream.getTracks().length>=2) {
				if(!gentle) console.log('dial  addTrack vid',localStream.getTracks()[1]);
				peerCon.addTrack(localStream.getTracks()[1],localStream);
			} else {
				if(!gentle) console.log('dial  addTrack no vid',localStream.getTracks().length);
			}
		}
*/
	}

	createDataChannel();

	console.log('dial peerCon.createOffer');
	peerCon.createOffer().then((desc) => {
		localDescription = desc;
		localDescription.sdp = maybePreferCodec(localDescription.sdp, 'audio', 'send', "opus");
		localDescription.sdp = localDescription.sdp.replace('useinbandfec=1',
			'useinbandfec=1;usedtx=1;stereo=1;maxaveragebitrate='+bitrate+';');
		console.log('got localDescription');
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
			showStatus("dataChannel error "+event.error,-1);	// .message ?
		}
		progressSendElement.style.display = "none";
		if(fileselectLabel!=null && mediaConnect && dataChannel!=null && dataChannel.readyState=="open") {
			if(localCandidateType!="relay" && remoteCandidateType!="relay") {
				fileselectLabel.style.display = "inline-block";
			}
		}
	}
	dataChannel.onmessage = event => {
		if(typeof event.data === "string") {
			if(!gentle) console.debug("dataChannel.onmessage");
			if(event.data) {
				if(event.data.startsWith("disconnect")) {
					console.log("dataChannel.close on 'disconnect'");
					dataChannel.close();
					hangupWithBusySound(false,"Peer hang up");
				} else if(event.data.startsWith("cmd|")) {
					let subCmd = event.data.substring(4);
					if(subCmd.startsWith("ledred")) {
						if(onlineIndicator!=null) {
							onlineIndicator.src="red-gradient.svg";
						}
						microphoneIsNeeded = true;

						// unmute micro
						if(localStream!=null) {
							const audioTracks = localStream.getAudioTracks();
							audioTracks[0].enabled = true;
							// localStream.getTracks().forEach(track => { ??? });
						}
					} else if(subCmd.startsWith("ledgreen")) {
						if(onlineIndicator!=null) {
							onlineIndicator.src="green-gradient.svg";
						}
						microphoneIsNeeded = false;

						// mute mic
						if(localStream!=null) {
							const audioTracks = localStream.getAudioTracks();
							audioTracks[0].enabled = false;
						}
					} else {
						if(!gentle) console.log("dataChannel.onmessage -> signallingCommand()");
						signallingCommand(subCmd);
					}
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
						if(!gentle) console.log("file send aborted by receiver");
						showStatus("file send aborted by receiver");
						fileSendAbort = true;
						progressSendElement.style.display = "none";
						if(fileselectLabel!=null && mediaConnect && dataChannel!=null && dataChannel.readyState=="open") {
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
					if(!gentle) console.log("file receive",fileName,fileSize);
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
}

function onIceCandidate(event) {
	var callerCandidate = event.candidate;
	if(callerCandidate==null) {
		// ICE gathering finished
		if(!gentle) console.log('onIce: end of callerCandidates');
	} else {
		//if(!gentle) console.log("onIce",callerCandidate.candidate);
		//console.log('onIce callerCandidate.address',callerCandidate.address);
		if(callerCandidate.address==null) {
			//console.warn('onIce skip callerCandidate.address==null');
		} else if(wsConn==null) {
			if(!gentle) console.log('onIce callerCandidate: wsConn==null', callerCandidate.address);
		} else if(wsConn.readyState!=1) {
			if(!gentle) console.log('onIce callerCandidate: readyState!=1',
				callerCandidate.address, wsConn.readyState);
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
	rtcConnect = false;
	mediaConnect = false;
	connectLocalVideo(true);
	if(fileselectLabel!=null) {
		fileselectLabel.style.display = "none";
		progressSendElement.style.display = "none";
		progressRcvElement.style.display = "none";
	}
	if(!singlebutton) {
		msgbox.value = "";
	}
	if(doneHangup) {
		if(!gentle) console.log('hangup doneHangup');
		return;
	}

	if(!gentle) console.log('hangup '+message, mustDisconnectCallee);
	if(message!="") {
		showStatus(message);
	}

	doneHangup = true;
	if(singlebutton) {
		dialButton.style.boxShadow = "";
	} else {
		onlineIndicator.src="";
	}
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

	if(remoteVideoFrame!=null) {
		console.log('hangup remoteVideoFrame.pause()');
		remoteVideoFrame.pause();
		remoteVideoFrame.currentTime = 0;
		remoteVideoFrame.srcObject = null;
	}
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
	avSelect.disabled = false;

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
							dataChannel.send("disconnect"); // tmtmtm
							dataChannel.close();
						}
						console.log('hangup peerCon.close 1');
						peerCon.close();
						peerCon = null;
					}
				},300);

			} else if(dataChannel && dataChannel.readyState=="open") {
				console.log('hangup dataChannel.close 2');
				dataChannel.send("disconnect"); // tmtmtm
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
		if(singlebutton) {
			// no StatsPostCall for you
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
	if(wsConn!=null) {
		wsConn.close();
		wsConn=null;
	}
	if(!gentle) console.log('hangup end',calleeID);
}

function hangupWithBusySound(mustDisconnectCallee,message) {
	dialing = false;
	stopAllAudioEffects();
	if(peerCon!=null) {
		if(!gentle) console.log(`hangupWithBusySound `+message);
		busySignalSound.play().catch(function(error) { });
		setTimeout(function() {
			if(!gentle) console.log(`hangupWithBusySound stopAllAudioEffects`);
			stopAllAudioEffects();
		},2500);
	} else {
		if(!gentle) console.log(`hangupWithBusySound no peerCon `+message);
	}
	hangup(mustDisconnectCallee,message);
}

var menuDialogOpenFlag = false;
function menuDialogOpen() {
	if(menuDialogOpenFlag) {
		if(!gentle) console.log('menuDialogOpen menuDialogOpenFlag');
		return;
	}
	if(!gentle) console.log('menuDialogOpen');
	menuDialogOpenFlag = true;

	hashcounter++;
	location.hash = hashcounter;

	fullScreenOverlayElement.style.display = "block";
	fullScreenOverlayElement.onclick = function() {
		if(!gentle) console.log('fullScreenOverlay click');
		historyBack();
	}
	mainElement.style.filter = "blur(0.8px) brightness(60%)";

	// position menuDialog at mouse coordinate
    var e = window.event;
    var posX = e.clientX/8 - 50;
	if(posX<0) posX=0;
    var posY = e.clientY;
	if(posY>50) posY-=50;
	if(!gentle) console.log('menuDialogOpen x/y',posX,posY);
	menuDialogElement.style.left = posX+"px";
	menuDialogElement.style.top = posY+"px";
	menuDialogElement.style.display = "block";
}

