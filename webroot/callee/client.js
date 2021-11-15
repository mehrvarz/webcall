// WebCall Copyright 2021 timur.mobi. All rights reserved.
'use strict';
const avSelect = document.querySelector("select#avSelect");
const localVideoDiv = document.querySelector('div#localVideoDiv');
const localVideoFrame = document.querySelector('video#localVideoFrame');
const remoteVideoDiv = document.querySelector('div#remoteVideoDiv');
const remoteVideoFrame = document.querySelector('video#remoteVideoFrame');
const localVideoPausedElement = document.querySelector('span#localVideoPaused');
const vmonitorButton = document.querySelector('span#vmonitor');
const vsendButton = document.querySelector('span#vsend');
const localVideoRes = document.querySelector('span#localVideoRes');
const remoteVideoRes = document.querySelector('span#remoteVideoRes');
const remoteVideoLabel = document.querySelector('div#remoteVideoLabel');
const cameraElement = document.getElementById('camera');
const fileSelectElement = document.getElementById("fileselect");
const iframeWindowElement = document.getElementById('iframeWindow');
const fullscreenCheckbox = document.querySelector('input#fullscreen');
const mainElement = document.getElementById('main');
const containerElement = document.getElementById('container');
const menuDialogElement = document.getElementById('menuDialog');
const vresDialogElement = document.getElementById('vresDialog');
const fullScreenOverlayElement = document.getElementById('fullScreenOverlay');
const progressSendElement = document.getElementById('progressSend');
const progressSendLabel = document.getElementById('progressSendLabel');
const progressSendBar = document.getElementById('fileProgressSend');
const downloadList = document.getElementById('download');
const progressRcvElement = document.getElementById('progressRcv');
const progressRcvLabel = document.getElementById('progressRcvLabel');
const progressRcvBar = document.getElementById('fileProgressRcv');
const fileselectLabel = document.getElementById("fileselectlabel");

var videoEnabled = false;
var localVideoMonitorPaused = false;
var hashcounter=0;
var dialing = false;

var ICE_config = {
	"iceServers": [
		{	'urls': 'stun:'+window.location.hostname+':3739' },
		{	'urls': 'turn:'+window.location.hostname+':3739',
			'username': 'c807ec29df3c9ff',
			'credential': '736518fb4232d44'
		}
	]
};

var defaultConstraintString = `
"width":  {"min":480, "ideal":1280, "max":1920 },
"height": {"min":360, "ideal":720,  "max":1080 },
"frameRate": { "min":10, "max":60 }
`;

var constraintString = defaultConstraintString;

var userMediaConstraints = {
	audio: {
		noiseSuppression: true,  // true by default
		echoCancellation: true,  // true by default
		autoGainControl: false,
	},
	video: {
		width:  { min: 480, ideal: 1280, max: 1920 },
		height: { min: 360, ideal:  720, max: 1080 },
		frameRate: { min:10, max:60 },
	}
};

let myUserMediaDeviceId;
function setVideoConstraintsGiven() {
	// build userMediaConstraints.video from constraintString + myUserMediaDeviceId
	let tmpConstraints = constraintString;
	if(myUserMediaDeviceId) {
		gLog('setVideoConstraintsGiven myUserMediaDeviceId',myUserMediaDeviceId);
		tmpConstraints += ","+myUserMediaDeviceId;
	} else {
		//gLog('setVideoConstraintsGiven no myUserMediaDeviceId');
	}
	tmpConstraints = "{"+tmpConstraints+"}";
	userMediaConstraints.video = JSON.parse(tmpConstraints);
	return tmpConstraints;
}

function setVideoConstraintsLow() {
	constraintString = `
"width":  {"min":320, "ideal":640, "max":800 },
"height": {"min":240, "ideal":360, "max":600 },
"frameRate": { "min":10, "max":30 }
`;
	let tmpConstraints = setVideoConstraintsGiven();
	gLog('setVideoConstraintsLow', tmpConstraints);
	userMediaConstraints.video = JSON.parse(tmpConstraints);
	historyBack();
	getStream();
}

function setVideoConstraintsMid() {
	constraintString = `
"width":  {"min":480, "ideal":1280, "max":1920 },
"height": {"min":360, "ideal":720,  "max":1080 },
"frameRate": { "min":10, "max":60 }
`;
	let tmpConstraints = setVideoConstraintsGiven();
	gLog('setVideoConstraintsMid', tmpConstraints);
	userMediaConstraints.video = JSON.parse(tmpConstraints);
	historyBack();
	getStream();
}

function setVideoConstraintsHigh() {
	constraintString = `
"width":  {"min":1280,"ideal":1920, "max":4096 },
"height": {"min":720, "ideal":720, "max":2160 },
"frameRate": { "min":10, "max":60 }
`;
	let tmpConstraints = setVideoConstraintsGiven();
	gLog('setVideoConstraintsHigh', tmpConstraints);
	userMediaConstraints.video = JSON.parse(tmpConstraints);
	historyBack();
	getStream();
}

function setVideoConstraintsHD() {
	constraintString = `
"width":  {"min":1920,"ideal":1920, "max":4096 },
"height": {"min":720, "ideal":720, "max":2160 },
"frameRate": { "min":10, "max":60 }
`;
	let tmpConstraints = setVideoConstraintsGiven();
	gLog('setVideoConstraintsHD', tmpConstraints);
	userMediaConstraints.video = JSON.parse(tmpConstraints);
	historyBack();
	getStream();
}

function showVideoToast(toastElement,w,h) {
	if(toastElement) {
		toastElement.style.transition = "";
		toastElement.style.opacity = 0; // start from 0
		toastElement.innerHTML = w+" x "+h;
		toastElement.style.visibility = "visible";
		toastElement.style.transition = "opacity 500ms";
		toastElement.style.opacity = 1; // transition to 1
		setTimeout(function(oldWidth) {
			// time to fade
			if(localVideoFrame.videoWidth==oldWidth) {
				toastElement.style.opacity = 0; // transition to 1
				setTimeout(function(oldWidth2) {
					if(localVideoFrame.videoWidth==oldWidth2) {
						toastElement.style.visibility = "hidden";
						toastElement.innerHTML = "";
						localVideoRes.style.transition = "";
					}
				},500,oldWidth);
			}
		},1800,localVideoFrame.videoWidth);
	}
}

function showVideoResolutionLocal() {
	if(videoEnabled && localVideoFrame.videoWidth>10 && localVideoFrame.videoHeight>10) {
		gLog('localVideo size change', localVideoFrame.videoWidth, localVideoFrame.videoHeight);
		showVideoToast(localVideoRes, localVideoFrame.videoWidth, localVideoFrame.videoHeight);
	}
}

function showVideoResolutionRemote() {
	if(remoteVideoFrame.videoWidth>10 && remoteVideoFrame.videoHeight>10) {
		gLog('remoteVideo size change', remoteVideoFrame.videoWidth, remoteVideoFrame.videoHeight);
		showVideoToast(remoteVideoRes, remoteVideoFrame.videoWidth, remoteVideoFrame.videoHeight);
	}
}

if(fileSelectElement) {
	fileSelectElement.addEventListener('change', (event) => {
		gLog("fileSelect event");
		historyBack();
		const files = fileSelectElement.files;
		const file = files.item(0);
		if(file==null) {
			showStatus("error: file==null",-1);
			return;
		}
		if(dataChannel==null || dataChannel.readyState!="open") {
			showStatus("error: no dataChannel",-1);
			return;
		}
		if(file.name=="") {
			showStatus("error: empty file.name",-1);
			return;
		}
		if(file.size<=0) {
			showStatus("error: file.size <= 0",-1);
			return;
		}
		if(file.size>=500*1024*1024) {
			console.log("fileSelect warn file.size %d > 500MB",file.size);
			if(confirm("The selected file may be too big for the receiving device. "+
					   "Are you sure you want to send it?")) {
				sendFile(file);
			} else {
				console.log("fileSelect transfer aborted by user");
			}
		} else {
			sendFile(file);
		}
	});
}

function sendFile(file) {
	console.log("fileSelect: "+file.name, file.size, file.type, file.lastModified);
	dataChannel.send("file|"+file.name+","+file.size+","+file.type+","+file.lastModified);
	fileselectLabel.style.display = "none";
	showStatus("",-1);

	const chunkSize = 16*1024;
	let fileReader = new FileReader();
	let offset = 0;
	let fileSendStartDate = Date.now();
	let fileSendLastSinceStartSecs = 0;
	fileSendAbort = false;
	progressSendBar.max = file.size;
	progressSendElement.style.display = "block";
	progressSendLabel.innerHTML = "Sending: "+file.name.substring(0,25);
	fileReader.addEventListener('error', error => console.error('Error reading file:', error));
	fileReader.addEventListener('abort', event => console.log('File reading aborted:', event));
	fileReader.addEventListener('load', e => {
		if(fileSendAbort) {
			console.log('file send user abort');
			fileReader.abort();
			return;
		}
		if(dataChannel==null || dataChannel.readyState!="open") {
			console.log('file send no dataChannel');
			fileReader.abort();
			return;
		}
		dataChannel.send(e.target.result);
		offset += e.target.result.byteLength;
		//gLog('file send', offset, file.size, dataChannel.bufferedAmount);
		progressSendBar.value = offset;
		let sinceStartSecs = Math.floor((Date.now() - fileSendStartDate + 500)/1000);
		if(sinceStartSecs!=fileSendLastSinceStartSecs && sinceStartSecs!=0) {
			let kbytesPerSec = Math.floor(offset/1000/sinceStartSecs);
			progressSendLabel.innerHTML = "sending '"+file.name.substring(0,22)+"' "+kbytesPerSec+" KB/s";
			fileSendLastSinceStartSecs = sinceStartSecs;
		}
		if (offset < file.size) {
			readSlice(offset);
		} else {
			let sendComplete = function() {
				if(dataChannel && dataChannel.bufferedAmount > 0) {
					gLog('file send flushing buffered...');
					setTimeout(sendComplete,200);
					return;
				}
				console.log('file send complete', file.size);
				offset = 0;
				progressSendElement.style.display = "none";
				showStatus("sent '"+file.name.substring(0,25)+"' "+Math.floor(file.size/1000)+" KB",-1);
				if(mediaConnect && isDataChlOpen()) {
					if(isP2pCon()) {
						fileselectLabel.style.display = "block";
					}
				}
			};
			sendComplete();
		}
	});
	const readSlice = o => {
		if(fileSendAbort) {
			console.log('file send user abort');
			fileReader.abort();
			return;
		}
		if(dataChannel==null || dataChannel.readyState!="open") {
			console.log('file send abort on dataChannel');
			return;
		}
		if(dataChannel.bufferedAmount > 10*chunkSize) {
			// file send delay
			setTimeout(function() {
				readSlice(o);
			},50);
			return;
		}
		const slice = file.slice(offset, o + chunkSize);
		fileReader.readAsArrayBuffer(slice);
	};
	readSlice(0);
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
	xhr.ontimeout = function() {
		errorFkt("timeout",0);
	}
	xhr.onerror= function(e) {
		errorFkt("fetching",xhr.status);
	};
	gLog('xhr send(%s) timeout=%d',api,xhrTimeout);
	xhr.open(type, api, true);
	xhr.setRequestHeader("Content-type", "text/plain; charset=utf-8");
	if(postData) {
		xhr.send(postData);
	} else {
		xhr.send();
	}
}

let timerStartDate=0;
let timerIntervalID=0;
function startTimer(startDuration) {
	if(!timerStartDate && startDuration>0) {
		gLog('startTimer',startDuration);
		timerElement.style.opacity = 0.5;
		timerStartDate = Date.now();
		updateClock(startDuration);
		timerIntervalID = setInterval(updateClock, 999, startDuration);
	}
}
function stopTimer() {
	timerStartDate = null
	if(timerIntervalID && timerIntervalID>0) {
		gLog('stopTimer');
		clearInterval(timerIntervalID);
		timerIntervalID=0;
		timerElement.style.opacity = 0;
	}
}

function updateClock(startDuration) {
	let sinceStartSecs = Math.floor((Date.now() - timerStartDate + 500)/1000);
	let countDownSecs = startDuration - sinceStartSecs;
	if(countDownSecs<=0) {
		countDownSecs=0;
	}
	if(countDownSecs==60 || countDownSecs==30 || countDownSecs==15) {
		notificationSound.play().catch(function(error) { });
	}
	if(timerElement) {
		let timerMin = Math.floor(countDownSecs/60);
		let timerSec = countDownSecs - timerMin*60;
		let timerSecStr = ""+timerSec;
		if(timerSec<10) {
			timerSecStr = "0"+timerSecStr;
		}
		timerElement.innerHTML = ""+timerMin+":"+timerSecStr;
	}
	if(countDownSecs<=0) {
		gLog('updateClock countDownSecs<=0 stopTimer',countDownSecs);
		stopTimer();
	}
}

var statsPostCallString = "";
var statsPostCallDurationMS = 0;
function getStatsPostCall(results) {
	gLog('statsPostCall start');
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
		gLog('statsPostCall rtcConnectStartDate==0');
		durationRtcMS = 0;
	}
		
	results.forEach(res => {
		if(res.type=="inbound-rtp") {
			bytesReceived = res.bytesReceived;
			packetsReceived = res.packetsReceived;
			packetsLost = res.packetsLost;
			jitter = res.jitter;
			jitterBufferDelay = res.jitterBufferDelay; // FF: undefined
		} else if(res.type=="outbound-rtp") {
			bytesSent = res.bytesSent;
			packetsSent = res.packetsSent;
			retransmittedPacketsSent = res.retransmittedPacketsSent; // FF: undefined
		} else if(res.type=="remote-inbound-rtp") {
			roundTripTime = res.roundTripTime; // FF: undefined
		}
	});
	let durationSecs = Math.floor((statsPostCallDurationMS+500)/1000);
	if(isNaN(durationSecs)) { durationSecs = 0; }
	let durationRtcSecs = Math.floor((durationRtcMS+500)/1000);

	let bitsReceivedPerSec = 0;
	if(statsPostCallDurationMS>0) {
		bitsReceivedPerSec = Math.floor(bytesReceived*8000/statsPostCallDurationMS);
	}
	if(isNaN(bitsReceivedPerSec)) { bitsReceivedPerSec = 0; }

	let bitsSentPerSec = 0;
	if(durationRtcMS>0) {
		bitsSentPerSec = Math.floor(bytesSent*8000/durationRtcMS);
	}

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
	gLog("statsPostCall",statsPostCallString);
}

function showStatsPostCall() {
	var myStatsPostCallString = statsPostCallString.replaceAll("\n","<br>");
	if(myStatsPostCallString=="") {
		myStatsPostCallString = "No call stats available";
	}
	return myStatsPostCallString;
}

function openPostCallStats() {
	let str = "string:<h2>Call Statistics</h2>"+showStatsPostCall();
	gLog('openPostCallStats');
	iframeWindowOpen(str,"background:#33ad; color:#eee; padding:20px; max-width:400px; left:5.0%; top:3%; font-size:1.1em; line-height:1.4em;");
}

function stopProgressSend() {
	console.log("stopProgressSend");
	showStatus("file send aborted");
	fileSendAbort = true;
	progressSendElement.style.display = "none";
	if(isDataChlOpen()) {
		dataChannel.send("file|end-send");
		if(fileselectLabel && mediaConnect) {
			if(isP2pCon()) {
				fileselectLabel.style.display = "block";
			}
		}
	}
}

function stopProgressRcv() {
	console.log("stopProgressRcv");
	showStatus("file receive aborted");
	fileReceiveAbort = true;
	progressRcvElement.style.display = "none";
	if(isDataChlOpen()) {
		dataChannel.send("file|end-rcv");
	}
}

var rtcLink = "";
var localCandidateType = "";
var remoteCandidateType = "";
function getStatsCandidateTypesEx(results,eventString1,eventString2) {
	gLog('getStatsCandidateTypes start');
	rtcLink = "unknown";
	let localCandidateId = "";
	let remoteCandidateId = "";
	localCandidateType = "";
	remoteCandidateType = "";
	results.forEach(res => {
		if(res.type=="candidate-pair") {
			if(res.selected) {
				localCandidateId = res.localCandidateId;
				remoteCandidateId = res.remoteCandidateId;
				gLog("getStatsCandidateTypes 1st", localCandidateId,remoteCandidateId);
			}
		}
	});
	gLog("getStatsCandidateTypes candidateId's A", localCandidateId,remoteCandidateId);
	if(localCandidateId=="" || remoteCandidateId=="") {
		// for chrome
		results.forEach(res => {
			if(res.type=="transport" && res.selectedCandidatePairId!="") {
				let selectedCandidatePairId = res.selectedCandidatePairId;
				gLog('getStatsCandidateTypes PairId',selectedCandidatePairId);
				results.forEach(res => {
					if(res.id==selectedCandidatePairId) {
						localCandidateId = res.localCandidateId;
						remoteCandidateId = res.remoteCandidateId
						gLog("getStatsCandidateTypes 2nd",localCandidateId,remoteCandidateId);
					}
				});
			}
		});
	}

	gLog("getStatsCandidateTypes candidateId's B",localCandidateId,remoteCandidateId);
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

	gLog('getStatsCandidateTypes',rtcLink,localCandidateType,remoteCandidateType);
	return eventString1+" "+rtcLink;
}

var menuDialogOpenElement = null;
function menuDialogOpen(menuDialog) {
	if(menuDialogOpenElement) {
		gLog('# menuDialogOpen menuDialogOpenElement');
		return;
	}
	menuDialogOpenElement = menuDialog;

	hashcounter++;
	location.hash = hashcounter;
	fullScreenOverlayElement.style.display = "block";
	fullScreenOverlayElement.onclick = function() {
		historyBack();
	}
	containerElement.style.filter = "blur(0.8px) brightness(60%)";
	if(calleeMode) {
		if(wsConn && navigator.cookieEnabled && getCookieSupport()) {
			// cookies avail: "Contacts", "Settings" and "Exit" allowed
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
	}

	// position menuDialog at mouse coordinate
    var e = window.event;
    var posX = e.clientX * 0.65;
	if(posX<0) posX=0;
    var posY = e.clientY;
	if(posY>50) posY-=50;
	//gLog('menuDialogOpen x/y',posX,e.clientX,posY,e.clientY);
	const menuDialogOpenChildElement = menuDialogOpenElement.firstElementChild;
	menuDialogOpenChildElement.style.left = posX+"px";
	menuDialogOpenChildElement.style.top = (posY+window.scrollY)+"px"; // add scrollY-offset to posY
	menuDialogOpenElement.style.display = "block";

	// move popup-menu up to prevent bottom cut-off (if there is room on top)
	setTimeout(function() {
		//gLog('menuDialogOpenChildElement');
		let menuHeight = menuDialogOpenChildElement.clientHeight;
		let pageHeight = mainElement.clientHeight;
		//gLog('menuDialogOpen up',posY, menuHeight, pageHeight);
		while(posY>10 && posY + menuHeight > pageHeight) {
			posY -= 10;
		}
		//gLog('menuDialogOpen up2',posY, menuHeight, pageHeight);
		menuDialogOpenChildElement.style.top = (posY+window.scrollY)+"px"; // add scrollY-offset to posY
	},60);
}

function menuDialogClose() {
	if(menuDialogOpenElement) {
		menuDialogOpenElement.style.display = "none";
		containerElement.style.filter = "";
		fullScreenOverlayElement.style.display = "none";
		fullScreenOverlayElement.onclick = null;
		menuDialogOpenElement = null;
	}
}

function historyBack() {
	history.back();
}

var iframeWindowOpenFlag = false;
function iframeWindowOpen(url,addStyleString) {
	if(iframeWindowOpenFlag) {
		gLog('iframeWindowOpen iframeWindowOpenFlag');
		return;
	}
	if(menuDialogOpenElement) {
		menuDialogClose();
	} else {
		hashcounter++;
		location.hash = hashcounter;
	}

	fullScreenOverlayElement.style.display = "block";
	fullScreenOverlayElement.onclick = function() {
		historyBack();
	}

	containerElement.style.filter = "blur(0.8px) brightness(60%)";

	gLog('iframeWindowOpen', url);
	iframeWindowOpenFlag = true;
	let styleString = "width:90%; max-width:440px; height:94%; position:absolute; left:3.5%; top:1%; padding:10px; z-index:200;";
	if(addStyleString) {
		styleString += addStyleString;
	}
	if(url.startsWith("string:")) {
		iframeWindowElement.style = styleString;
		iframeWindowElement.innerHTML = url.substring(7);
	} else {
		iframeWindowElement.style = styleString;
		iframeWindowElement.innerHTML = "<iframe src='"+url+"' scrolling='yes' frameborder='no' width='100%' height='100%' allow='microphone' onload='this.contentWindow.focus()'></iframe>";
	}
}

function iframeWindowClose() {
	gLog('iframeWindowClose');
	containerElement.style.filter="";
	iframeWindowElement.innerHTML = "";
	iframeWindowElement.style.display = "none";
	fullScreenOverlayElement.style.display = "none";
	fullScreenOverlayElement.onclick = null;
	iframeWindowOpenFlag = false;
}

let lastGoodMediaConstraints;
let myUserMediaConstraints;
function getStream(selectObject) {
	if(!navigator || !navigator.mediaDevices) {
		alert("getStream no access navigator.mediaDevices");
		return;
	}

//	if(!gentle) {
//		const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
//		gLog('getStream supportedConstraints',supportedConstraints);
//	}


	if(selectObject) {
		gLog('getStream avSelect');
		// selectObject is (only) set if user operates avSelect manually
		// parse for deviceId (selectObject.value in avSelect.options)
		for(var i = avSelect.options.length - 1; i >= 0; i--) {
			if(avSelect.options[i].value == selectObject.value) {
				// found deviceId
				myUserMediaDeviceId = '"exact": "'+selectObject.value+'"';
				gLog('getStream avSelect deviceId',myUserMediaDeviceId);

				if(avSelect.options[i].label.startsWith("Audio")) {
					if(videoEnabled) {
						gLog('getStream avSelect audio: videoOff');
						videoOff();
					} else {
						//gLog('getStream avSelect audio: video was off');
					}
				} else if(avSelect.options[i].label.startsWith("Video")) {
					let tmpConstraints = constraintString;
					if(myUserMediaDeviceId) {
						tmpConstraints += ","+myUserMediaDeviceId;
					}
					tmpConstraints = "{"+tmpConstraints+"}";
					gLog('getStream avSelect video',tmpConstraints);
					userMediaConstraints.video = JSON.parse(tmpConstraints);
				}
				break;
			}
		}
	}

	// full copy
	myUserMediaConstraints = JSON.parse(JSON.stringify(userMediaConstraints));

	if(!videoEnabled) {
		gLog('getStream !videoEnabled: Constraints.video = false');
		myUserMediaConstraints.video = false;
	}

	if(videoEnabled) {
		if(!myUserMediaConstraints.video) {
			gLog('getStream !myUserMediaConstraints.video + videoEnabled: localVideoHide()');
			localVideoHide();
		} else {
			//videoOn();
		}
	}

	gLog('getStream set getUserMedia',myUserMediaConstraints);
	return navigator.mediaDevices.getUserMedia(myUserMediaConstraints)
		.then(function(stream) {
			gotStream(stream);
		})
		.catch(function(err) {
			if(!videoEnabled) {
				console.log('# audio input error', err);
				alert("audio input error " + err);
			} else {
				console.log('# audio/video input error', err);
				alert("audio/video input error " + err);
				if(!lastGoodMediaConstraints) {
					localVideoHide();
				}
			}
			if(lastGoodMediaConstraints) {
				gLog('getStream back to lastGoodMediaConstraints',lastGoodMediaConstraints);
				userMediaConstraints = lastGoodMediaConstraints;
				if(!userMediaConstraints.video && videoEnabled) {
					gLog('getStream back to lastGoodMediaConstraints !Constraints.video');
					localVideoHide();
				}
				if(userMediaConstraints.video && !videoEnabled) {
					gLog('getStream back to lastGoodMediaConstraints Constraints.video');
					localVideoShow();
				}
				return navigator.mediaDevices.getUserMedia(userMediaConstraints)
					.then(gotStream)
					.catch(function(err) {
						if(videoEnabled) {
							gLog('getStream backto lastGoodMediaConstraints videoEnabled err');
							localVideoHide();
						}
					});
			}
		});
}

function gotDevices(deviceInfos) {
	// fill avSelect with the available audio/video input devices (mics and cams)
	//gLog('gotDevices',deviceInfos);
	if(avSelect) { // not set in button mode
		var i, L = avSelect.options.length - 1;
		for(i = L; i >= 0; i--) {
			avSelect.remove(i);
		}

		for(const deviceInfo of deviceInfos) {
			if(deviceInfo.kind=="audioinput" || deviceInfo.kind=="videoinput") {
				gLog('gotDevices',deviceInfo.kind,deviceInfo.label,deviceInfo.deviceId);
			}

			const option = document.createElement('option');
			option.value = deviceInfo.deviceId;

			if(deviceInfo.kind === 'audioinput') {
				let deviceInfoLabel = deviceInfo.label;
				if(deviceInfoLabel=="Default") {
//					deviceInfoLabel="Audio Input Default";
					continue;
				} else if(deviceInfoLabel) {
					deviceInfoLabel = "Audio "+deviceInfoLabel
				}
				option.text = deviceInfoLabel || `Audio ${avSelect.length + 1}`;
			} else if (deviceInfo.kind === 'videoinput') {
				if(!videoEnabled) {
					continue;
				}
				let deviceInfoLabel = deviceInfo.label;
				if(deviceInfoLabel=="Default") {
//					deviceInfoLabel="Video Input Default";
					continue;
				} else if(deviceInfoLabel) {
					deviceInfoLabel = "Video "+deviceInfoLabel
				}
				option.text = deviceInfoLabel || `Video ${avSelect.length + 1}`;
			} else {
				continue;
			}

			var exists=false
			var length = avSelect.options.length;
			for(var i = length-1; i >= 0; i--) {
				if(avSelect.options[i].text == option.text) {
					exists=true; // don't add again
					break;
				}
			}
			if(!exists) {
				avSelect.appendChild(option);
			}
		}
	}
}

var addedAudioTrack = null;
var addedVideoTrack = null;
function gotStream(stream) {
	// add localStream audioTrack and (possibly) localStream videoTrack to peerCon using peerCon.addTrack()
	// then activate localVideoFrame with localStream
    gLog("gotStream set localStream");
	if(localStream) {
		// stop all tracks on previous localStream
		const allTracks = localStream.getTracks();
		//gLog("gotStream stop previous localStream len",allTracks.length);
		allTracks.forEach(track => {
			//gLog('gotStream previous localStream track.stop()',track);
			track.stop(); 
		});
		if(peerCon && addedAudioTrack) {
			//gLog("gotStream previous localStream peerCon.removeTrack(addedAudioTrack)");
			peerCon.removeTrack(addedAudioTrack);
		}
		addedAudioTrack = null;
		if(peerCon && addedVideoTrack) {
			//gLog("gotStream previous localStream peerCon.removeTrack(addedVideoTrack)");
			peerCon.removeTrack(addedVideoTrack);
		}
		addedVideoTrack = null;
	}

	localStream = stream;

	if(!peerCon) {
		gLog('gotStream no peerCon: no addTrack');
	} else if(addedAudioTrack) {
		gLog('gotStream addedAudioTrack already set: no addTrack');
	} else {
		const audioTracks = localStream.getAudioTracks();
		audioTracks[0].enabled = true;
		gLog('peerCon addTrack local audio input',audioTracks[0]);
		addedAudioTrack = peerCon.addTrack(audioTracks[0],localStream);
	}

	// now let's look at all the reasons NOT to add the videoTrack to peerCon
	if(!videoEnabled) {
		// disable all video tracks (do not show the video locally)
		gLog("gotStream !videoEnabled -> stop video tracks");
		stream.getVideoTracks().forEach(function(track) {
			gLog("gotStream !videoEnabled stop video track",track);
			track.stop();
		})
	} else if(!addLocalVideoEnabled) {
		// video streaming has not been activated yet
		gLog('gotStream videoEnabled but !addLocalVideoEnabled: no addTrack vid');
	} else if(!peerCon) {
		//gLog('gotStream videoEnabled but !peerCon: no addTrack vid');
	} else if(localCandidateType=="relay" || remoteCandidateType=="relay") {
		gLog('gotStream videoEnabled but relayed con: no addTrack vid (%s)(%s)',localCandidateType,remoteCandidateType);
	} else if(localStream.getTracks().length<2) {
		gLog('# gotStream videoEnabled but getTracks().length<2: no addTrack vid',localStream.getTracks().length);
	} else {
		gLog('peerCon addTrack local video input',localStream.getTracks()[1]);
		addedVideoTrack = peerCon.addTrack(localStream.getTracks()[1],localStream);
	}

	gLog("gotStream set localVideoFrame.srcObject");
	localVideoFrame.srcObject = localStream;
	localVideoFrame.volume = 0;
	if(videoEnabled) {
		vmonitor();
	}
	lastGoodMediaConstraints = myUserMediaConstraints;
	gotStream2();
}

function videoSwitch(forceClose) {
	if(videoEnabled || forceClose) {
		gLog("videoSwitch videoOff",forceClose);
		videoOff();
	} else {
		gLog("videoSwitch videoOn");
		videoOn();
	}
}

var addLocalVideoEnabled = false;
function connectLocalVideo(forceOff) {
	if(vpauseTimer) {
		clearTimeout(vpauseTimer);
		vpauseTimer = null;
	}
	if(!addLocalVideoEnabled && !forceOff) {
		// start streaming localVideo to other peer
		addLocalVideoEnabled = true; // will cause: peerCon.addTrack(video)
		if(dataChannel && dataChannel.readyState=="open") {
			gLog("connectLocalVideo set");
			if(vsendButton) {
				vsendButton.classList.remove('blink_me');
				vsendButton.style.color = "#ff0";
			}
			pickupAfterLocalStream = true; // will cause: pickup2()
			getStream(); // -> gotStream() -> gotStream2() -> pickup2(): "calleeDescriptionUpd"
		} else {
			gLog("# connectLocalVideo no dataChannel");
		}
	} else {
		// stop streaming localVideo to other peer
		if(vsendButton) {
			vsendButton.style.color = "#fff";
		}
		if(videoEnabled) {
			vpauseTimer = setTimeout(vpauseByTimer, 40000);
		}
		addLocalVideoEnabled = false;
		if(!addedVideoTrack) {
			gLog("connectLocalVideo discon !addedVideoTrack: !removeTrack");
		} else if(!peerCon) {
			gLog("connectLocalVideo discon !peerCon: !removeTrack");
		} else  {
			gLog("connectLocalVideo discon peerCon.removeTrack(addedVideoTrack)");
			peerCon.removeTrack(addedVideoTrack);
			addedVideoTrack = null;
		}

		if(dataChannel && dataChannel.readyState=="open") {
			// make other side pause our cam (their remote cam)
			dataChannel.send("cmd|rtcVideoOff");
		}
	}
}

var vpauseTimer = null;
function vmonitor() {
	if(localVideoPausedElement) {
		localVideoPausedElement.style.visibility = "hidden";
	}
	if(vmonitorButton) {
		vmonitorButton.style.color = "#ff0";
	}
	localVideoFrame.style.opacity = 1;
	if(!localStream) {
		// re-enable paused video and microphone
		gLog("vmonitor !localStream: re-enable");
		pickupAfterLocalStream = false;
		getStream(); // -> gotStream() -> gotStream2()
		// in the end, vmonitor will be called again, but then with localStream
	} else if(videoEnabled) {
		localVideoFrame.play().catch(function(error) {});
		if(!mediaConnect) {
			gLog("vmonitor play new vpauseTimer");
			if(vsendButton)
				vsendButton.style.color = "#fff";
			if(vpauseTimer) {
				clearTimeout(vpauseTimer);
				vpauseTimer = null;
			}
			vpauseTimer = setTimeout(vpauseByTimer, 40000);
		} else {
			gLog("vmonitor play");
		}
	}
	localVideoMonitorPaused = false;
}

function vpauseByTimer() {
	gLog("vpauseByTimer",mediaConnect);
	if(!mediaConnect) {
		vpause();
	}
}

function vpause() {
	gLog("vpause");
	localVideoFrame.pause();
	localVideoFrame.style.opacity = 0.4;
	if(vmonitorButton) {
		vmonitorButton.style.color = "#fff";
	}
	if(vpauseTimer) {
		clearTimeout(vpauseTimer);
		vpauseTimer = null;
	}
	localVideoPausedElement.style.visibility = "visible";

	if(!mediaConnect) {
		// deactivate video + microphone pause, so that there will be no red-tab
		localStream.getTracks().forEach(track => { track.stop(); });
		const audioTracks = localStream.getAudioTracks();
		localStream.removeTrack(audioTracks[0]);
		localStream = null;
		gLog("vpause localStream-a/v deactivated");
	}
	localVideoMonitorPaused = true;
}

function vmonitorSwitch() {
	if(localVideoMonitorPaused) {
		vmonitor();
	} else {
		vpause();
	}
}

function onIceCandidate(event,myCandidateName) {
	if(event.candidate==null) {
		// ICE gathering has finished
		gLog('onIce end of candidates');
	} else if(event.candidate.address==null) {
		//console.warn('onIce skip event.candidate.address==null');
	} else if(dataChannel && dataChannel.readyState=="open") {
		gLog("onIce "+myCandidateName+" via dataChannel", event.candidate.address);
		dataChannel.send("cmd|"+myCandidateName+"|"+JSON.stringify(event.candidate));
	} else if(wsConn==null) {
		gLog("onIce "+myCandidateName+": wsConn==null", event.candidate.address);
	} else if(wsConn.readyState!=1) {
		gLog("onIce "+myCandidateName+": readyState!=1",	event.candidate.address, wsConn.readyState);
	} else {
		gLog("onIce "+myCandidateName+" via wsSend", event.candidate.address);
		// 300ms delay to prevent "cmd "+myCandidateName+" no peerCon.remoteDescription" on other side
		setTimeout(function() {
			// TODO support dataChannel delivery?
			wsSend(myCandidateName+"|"+JSON.stringify(event.candidate));
		},300);
	}
}

function localVideoDivOnVisible() {
	localVideoDiv.style.height = "auto";
	localVideoDiv.removeEventListener('transitionend',localVideoDivOnVisible);
}

function localVideoShow() {
	videoEnabled = true;
	localVideoLabel.style.opacity = 0.7; // will be transitioned
	let localVideoDivHeight = parseFloat(getComputedStyle(localVideoFrame).width)/16*9;
	//gLog("localVideoShow DivHeight",localVideoDivHeight);
	localVideoDiv.style.height = ""+localVideoDivHeight+"px"; // will be transitioned
	localVideoDiv.addEventListener('transitionend', localVideoDivOnVisible) // switch to height auto
	localVideoDiv.style.visibility = "visible";
	cameraElement.style.opacity = 0;
}

function localVideoHide() {
	videoEnabled = false;
	lastGoodMediaConstraints = null;
	localVideoLabel.style.opacity = 0.3;
	let localVideoDivHeight = parseFloat(getComputedStyle(localVideoFrame).width)/16*9;
	localVideoDiv.style.height = ""+localVideoDivHeight+"px"; // from auto to fixed
	setTimeout(function() { // wait for fixed height
		if(!videoEnabled) {
			localVideoDiv.style.height = "0px";
		}
	},200);
	cameraElement.style.opacity = 1;
}

function remoteVideoDivOnVisible() {
	remoteVideoDiv.style.height = "auto";
	remoteVideoDiv.removeEventListener('transitionend',remoteVideoDivOnVisible);
}

var remoteVideoShowing = false;
function remoteVideoShow() {
	let remoteVideoDivHeight = parseFloat(getComputedStyle(remoteVideoFrame).width)/16*9;
	remoteVideoDiv.style.height = ""+remoteVideoDivHeight+"px";
	remoteVideoDiv.addEventListener('transitionend', remoteVideoDivOnVisible) // switch to height auto
	remoteVideoLabel.innerHTML = "remote cam";
	remoteVideoShowing = true;
}

function remoteVideoHide() {
	if(remoteVideoShowing) {
		let remoteVideoDivHeight = parseFloat(getComputedStyle(remoteVideoFrame).width)/16*9;
		remoteVideoDiv.style.height = remoteVideoDivHeight+"px"; // height from auto to fixed
		remoteVideoLabel.innerHTML = "";
		setTimeout(function() { // wait for fixed height
			remoteVideoDiv.style.height = "0px";
		},200);
		remoteVideoShowing = false;
	}
}

function peerConOntrack(track, streams) {
// TODO tmtmtm
//		track.onunmute = () => {
//			if(remoteVideoFrame && remoteVideoFrame.srcObject == streams[0]) {
//				if(!gentle) console.warn('peerCon.ontrack onunmute was already set');
//				return;
//			}
		gLog('peerCon.ontrack onunmute set remoteVideoFrame.srcObject',streams[0]);
//		if(remoteStream) {
//			gLog('peerCon.ontrack onunmute have prev remoteStream');
//			// TODO treat like localStream in gotStream() ? apparently not needed
//		}
		remoteStream = streams[0];
//		};

	if(remoteVideoFrame) {
		if(!track.enabled) {
			gLog('peerCon.ontrack onunmute !track.enabled: not set remoteVideoFrame');
		} else {
			if(remoteVideoFrame.srcObject == remoteStream) {
				gLog('peerCon.ontrack onunmute track.enabled: same remoteStream again');
				return;
			}
			remoteVideoFrame.srcObject = remoteStream;
			if(remoteStream==null) {
				remoteVideoHide();
				return;
			}
			gLog('peerCon.ontrack onunmute track.enabled: new remoteStream');
			remoteVideoFrame.play().catch(function(error) { });
			setTimeout(function() {
				if(remoteStream==null) {
					remoteVideoFrame.srcObject = null;
					remoteVideoHide();
					return;
				}
				let videoTracks = remoteStream.getVideoTracks();
				gLog('peerCon.ontrack onunmute track.enabled: delayed v-tracks',videoTracks.length);
				if(videoTracks.length>0) {
					remoteVideoShow();
				} else {
					remoteVideoHide();
				}
			},500);
		}
	}
};

function hashchange() {
	var newhashcounter;
	if(location.hash.length > 0) {
		newhashcounter = parseInt(location.hash.replace('#',''),10);
	} else {
		newhashcounter = 0;
	}
	//gLog("hashchange hashcounter",hashcounter,newhashcounter);
	if(hashcounter>0 && newhashcounter<hashcounter) {
		if(iframeWindowOpenFlag) {
			iframeWindowClose();
		} else if(menuDialogOpenElement) {
			menuDialogClose();
		}
	}
	hashcounter = newhashcounter;
}

function showStatus(msg,timeoutMs) {
	if(!gentle && msg && msg!="") {
		// msg may contain html, which we don't want to console.log
		let idx = msg.indexOf("<");
		if(idx>=0) {
			gLog('showStatus: %s',msg.substring(0,idx));
		} else {
			gLog('showStatus: %s',msg);
		}
	}
	if(!singlebutton) {
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
}

function isDataChlOpen() {
	if(dataChannel && dataChannel.readyState=="open")
		return true;
	return false;
}

function isP2pCon() {
	if(localCandidateType!="relay" && remoteCandidateType!="relay")
		return true;
	return false;
}

function dataChannelOnclose(event) {
	gLog("dataChannel.onclose",event);
}

function dataChannelOnerror(event) {
	if(rtcConnect) {
		console.log("dataChannel.onerror",event);
		showStatus("# dataChannel error "+event.error,-1);
		hangup();
	}
	progressSendElement.style.display = "none";
	if(fileselectLabel && mediaConnect && isDataChlOpen() && isP2pCon()) {
		fileselectLabel.style.display = "block";
	}
}

function hangupWithBusySound(mustDisconnectCallee,message) {
	dialing = false;
	stopAllAudioEffects();
	if(peerCon) {
		gLog(`hangupWithBusySound `+message);
		busySignalSound.play().catch(function(error) { });
		setTimeout(function() {
			gLog(`hangupWithBusySound stopAllAudioEffects`);
			stopAllAudioEffects();
		},2500);
	}
	hangup(mustDisconnectCallee,message);
}

function gLog(...args) {
	if(!gentle) console.log(...args);
}

