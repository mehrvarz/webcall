// WebCall Copyright 2022 timur.mobi. All rights reserved.
'use strict';
const clientVersion = '3.1.0';

const avSelect = document.querySelector("select#avSelect");
const vresDialogElement = document.getElementById('vresDialog');
const localVideoDiv = document.querySelector('div#localVideoDiv');
const localVideoFrame = document.getElementById("localVideoFrame");
const remoteVideoDiv = document.querySelector('div#remoteVideoDiv');
const remoteVideoFrame = document.querySelector('video#remoteVideoFrame');
const localVideoMsgElement = document.querySelector('span#localVideoMsg');
const vmonitorButton = document.querySelector('span#vmonitor');
const vsendButton = document.querySelector('span#vsend');
const localVideoRes = document.querySelector('span#localVideoRes');
const localVideoLabel = document.querySelector('div#localVideoLabel');
const remoteVideoRes = document.querySelector('span#remoteVideoRes');
const remoteVideoLabel = document.querySelector('div#remoteVideoLabel');
const cameraElement = document.getElementById('camera');
const fileselectLabel = document.getElementById("fileselectlabel");
const fileSelectElement = document.getElementById("fileselect");
const iframeWindowElement = document.getElementById('iframeWindow');
const fullscreenLabel = document.querySelector('label#fullscreenlabel');
const fullscreenCheckbox = document.querySelector('input#fullscreen');
const mainElement = document.getElementById('main');
const containerElement = document.getElementById('container');
const menuDialogElement = document.getElementById('menuDialog');
const fullScreenOverlayElement = document.getElementById('fullScreenOverlay');
const progressSendElement = document.getElementById('progressSend');
const progressSendLabel = document.getElementById('progressSendLabel');
const progressSendBar = document.getElementById('fileProgressSend');
const downloadList = document.getElementById('download');
const progressRcvElement = document.getElementById('progressRcv');
const progressRcvLabel = document.getElementById('progressRcvLabel');
const progressRcvBar = document.getElementById('fileProgressRcv');

var videoEnabled = false;
var localVideoMonitorPaused = false;
var hashcounter=0;
var dialing = false;
var doneHangup = false;
var onIceCandidates = 0;
var mediaConnect = false;
var connectionstatechangeCounter = 0;
var playDialSounds = true;
var pickupAfterLocalStream = false; // not used in caller

var ICE_config = {
	"iceServers": [
		{	'urls': 'stun:'+window.location.hostname+':3739' },
		{	'urls': 'turn:'+window.location.hostname+':3739',
			'username': 'c807ec29df3c9ff',
			'credential': '736518fb4232d44'
		}
	]
	,"iceTransportPolicy": "all" // "all" / "relay"
};

var defaultConstraintString = '"width": {"min":320,"ideal":1920, "max":4096 },"height": {"min":240, "ideal":1080, "max":2160 },"frameRate": { "min":10, "max":30 }';

var constraintString = defaultConstraintString;

var userMediaConstraints = {
	audio: {
		noiseSuppression: true,  // true by default
		echoCancellation: true,  // true by default
		autoGainControl: false,
	}
	// videoOn() will set userMediaConstraints.video
};

let myUserMediaDeviceId;
function setVideoConstraintsGiven() {
	// build userMediaConstraints.video from constraintString + myUserMediaDeviceId
	let tmpConstraints = constraintString;
	if(myUserMediaDeviceId && myUserMediaDeviceId!="default") {
		gLog('setVideoConstraintsGiven myUserMediaDeviceId',myUserMediaDeviceId);
		tmpConstraints += ',"deviceId": { "exact": "'+myUserMediaDeviceId+'" }';
	} else {
		// desktop chromium doesn't like 'exact' 'user'
		tmpConstraints += ',"facingMode": { "ideal": "user" }';
	}
	tmpConstraints = "{"+tmpConstraints+"}";
	userMediaConstraints.video = JSON.parse(tmpConstraints);
	return tmpConstraints;
}

function setVideoConstraintsLow() {
	gLog('===setVideoConstraintsLow===');
	constraintString = `
"width":  {"min":320, "ideal":640, "max":800 }
,"height": {"min":240, "ideal":480,  "max":600 }
`;
	let tmpConstraints = setVideoConstraintsGiven();
	gLog('setVideoConstraintsLow', tmpConstraints);
	userMediaConstraints.video = JSON.parse(tmpConstraints);
	getStream();
}

function setVideoConstraintsMid() {
	gLog('===setVideoConstraintsMid===');
	constraintString = `
"width":  {"min":640, "ideal":1280, "max":1920 }
,"height": {"min":480, "ideal":720,  "max":1080 }
`;
	let tmpConstraints = setVideoConstraintsGiven();
	gLog('setVideoConstraintsMid', tmpConstraints);
	userMediaConstraints.video = JSON.parse(tmpConstraints);
	getStream();
}

function setVideoConstraintsHigh() {
	gLog('===setVideoConstraintsHigh===');
	constraintString = `
"width":  {"min":1280,"ideal":1920, "max":2560 }
,"height": {"min":720, "ideal":720, "max":1200 }
`;
	let tmpConstraints = setVideoConstraintsGiven();
	gLog('setVideoConstraintsHigh', tmpConstraints);
	userMediaConstraints.video = JSON.parse(tmpConstraints);
	getStream();
}

function setVideoConstraintsHD() {
	gLog('===setVideoConstraintsHD===');
	constraintString = `
"width":  {"min":1920,"ideal":1920, "max":4096 }
,"height": {"min":720, "ideal":1080, "max":2160 }
,"frameRate": { "min":10, "max":60 }
`;
	let tmpConstraints = setVideoConstraintsGiven();
	gLog('setVideoConstraintsHD', tmpConstraints);
	userMediaConstraints.video = JSON.parse(tmpConstraints);
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
		gLog('localVideo size', localVideoFrame.videoWidth, localVideoFrame.videoHeight);
		showVideoToast(localVideoRes, localVideoFrame.videoWidth, localVideoFrame.videoHeight);
	}
}

function showVideoResolutionRemote() {
	if(remoteVideoFrame.videoWidth>10 && remoteVideoFrame.videoHeight>10) {
		gLog('remoteVideo size', remoteVideoFrame.videoWidth, remoteVideoFrame.videoHeight);
		showVideoToast(remoteVideoRes, remoteVideoFrame.videoWidth, remoteVideoFrame.videoHeight);
	}
}

if(fileSelectElement) {
	//gLog("fileSelectElement.addEventListener");
	fileSelectElement.addEventListener('change', (event) => {
		gLog("fileSelect event");
		history.back();
		const files = fileSelectElement.files;
		const file = files.item(0);
		if(file==null) {
			showStatus("error: file==null",-1);
			return;
		}
		if(!isDataChlOpen()) {
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
	gLog("fileSelect: "+file.name, file.size, file.type, file.lastModified);
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
	fileReader.addEventListener('error', error => console.error("# Error reading file:", error));
	fileReader.addEventListener('abort', event => console.log("# File reading aborted:", event));
	fileReader.addEventListener('load', e => {
		if(fileSendAbort) {
			gLog("file send user abort");
			fileReader.abort();
			return;
		}
		if(!isDataChlOpen()) {
			console.log("# file send no dataChannel");
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
				gLog("file send complete", file.size);
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
			console.log("file send user abort");
			fileReader.abort();
			return;
		}
		if(!isDataChlOpen()) {
			console.log("file send abort on dataChannel");
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

var xhrTimeout = 25000;
function ajaxFetch(xhr, type, api, processData, errorFkt, postData, sync) {
	xhr.onreadystatechange = function() {
		if(xhr.readyState == 4 && (xhr.status==200 || xhr.status==0)) {
			processData(xhr);
		} else if(xhr.readyState==4) {
			errorFkt("fetch error",xhr.status);
		}
	}
	if(!sync) {
		xhr.timeout = xhrTimeout;
		xhr.ontimeout = function() {
			errorFkt("timeout",0);
		}
	}
	xhr.onerror= function(e) {
		errorFkt("fetching",xhr.status);
	};
	// cross-browser compatible approach to bypassing the cache
	if(api.indexOf("?")>=0) {
		api += "&_="+new Date().getTime();
	} else {
		api += "?_="+new Date().getTime();
	}
	gLog('xhr '+api);
	xhr.open(type, api, !sync);
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
		gLog('startTimer '+startDuration);
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
	if(countDownSecs==60 || countDownSecs==15) {
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
		gLog('updateClock countDownSecs<=0 stopTimer '+countDownSecs);
		stopTimer();
	}
}

var statsPostCallString = "";
var statsPostCallDurationMS = 0;
function getStatsPostCall(results) {
	//gLog('statsPostCall start');
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
	if(durationSecs>0) {
		gLog("statsPostCall "+statsPostCallString);
	}
}

function showStatsPostCall() {
	var myStatsPostCallString = statsPostCallString.replaceAll("\n","<br>");
	if(myStatsPostCallString=="") {
		myStatsPostCallString = "No call stats available";
	}
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.keepAwakeMS !== "undefined" && Android.keepAwakeMS !== null) {
			var awakeSecs = parseInt(Android.keepAwakeMS()/1000, 10);
			var awakeMins = parseInt(awakeSecs/60);
			var awakeHrs  = parseInt(awakeMins/60);
			awakeMins = awakeMins - awakeHrs*60;
			awakeSecs = awakeSecs - awakeHrs*60*60 - awakeMins*60;
			myStatsPostCallString += "<br><br>KeepAwake today: "+
				awakeHrs+"h&nbsp;" +
				String(awakeMins).padStart(2,'0')+"m&nbsp;"+
				String(awakeSecs).padStart(2,'0')+"s";
		}
/*
	} else {
		var awakeSecs = 134; //40333;
		var awakeMins = parseInt(awakeSecs/60);
		var awakeHrs  = parseInt(awakeMins/60);
		awakeMins = awakeMins - awakeHrs*60;
		awakeSecs = awakeSecs - awakeHrs*60*60 - awakeMins*60;
		myStatsPostCallString += "<br><br>KeepAwake today: "+
			awakeHrs+"hr&nbsp;" +
			String(awakeMins).padStart(2,'0')+"min&nbsp;"+
			String(awakeSecs).padStart(2,'0')+"sec";
*/
	}
	return myStatsPostCallString;
}

function openPostCallStats() {
	let str = "string:<h2>Call Statistics</h2>"+showStatsPostCall();
	gLog('openPostCallStats');
	iframeWindowOpen(str,false,"background:#33ad; color:#eee; padding:20px; max-width:400px; left:5.0%; top:3%; font-size:1.1em; line-height:1.4em;");
}

function stopProgressSend() {
	gLog("stopProgressSend");
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
	gLog("stopProgressRcv");
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
	//gLog('getStatsCandidateTypes start');
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
				gLog("getStatsCandidateTypes 1st "+localCandidateId,remoteCandidateId);
			}
		}
	});
	//gLog("getStatsCandidateTypes candidateId's A "+localCandidateId+" "+remoteCandidateId);
	if(localCandidateId=="" || remoteCandidateId=="") {
		// for chrome
		results.forEach(res => {
			if(res.type=="transport" && res.selectedCandidatePairId!="") {
				let selectedCandidatePairId = res.selectedCandidatePairId;
				//gLog('getStatsCandidateTypes PairId '+selectedCandidatePairId);
				results.forEach(res => {
					if(res.id==selectedCandidatePairId) {
						localCandidateId = res.localCandidateId;
						remoteCandidateId = res.remoteCandidateId
						//gLog("getStatsCandidateTypes 2nd "+localCandidateId+" "+remoteCandidateId);
					}
				});
			}
		});
	}

	//gLog("getStatsCandidateTypes candidateId's B "+localCandidateId+" "+remoteCandidateId);
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

	gLog('getStatsCandidateTypes '+rtcLink+" "+localCandidateType+" "+remoteCandidateType);
	return eventString1+" "+rtcLink;
}

var menuDialogOpenElement = null;
function menuDialogOpen(menuDialog,atMousePos) {
	if(menuDialogOpenElement) {
		gLog('# menuDialogOpen menuDialogOpenElement');
		return;
	}
	if(typeof menuDialog=="undefined" || menuDialog==null) {
		gLog('# menuDialog undefined');
		return;
	}
	//gLog('menuDialogOpen '+menuDialog);
	menuDialogOpenElement = menuDialog;

	hashcounter++;
	location.hash = hashcounter;
	gLog("menuDialogOpen hashcounter="+hashcounter+" "+location.hash);
	fullScreenOverlayElement.style.display = "block";
	fullScreenOverlayElement.onclick = function() {
		gLog('fullScreenOverlayElement.onclick');
		history.back();
	}
	containerElement.style.filter = "blur(0.8px) brightness(60%)";
	if(calleeMode) {
		if(wsConn && navigator.cookieEnabled && getCookieSupport()) {
			// cookies avail: "Settings" visible
			if(menuSettingsElement) {
				menuSettingsElement.style.display = "block";
			}
		} else {
			// "Settings" hidden
			if(menuSettingsElement) {
				menuSettingsElement.style.display = "none";
			}
		}
	}

	const menuDialogOpenChildElement = menuDialogOpenElement.firstElementChild;
	var posY = 0;
	if(atMousePos) {
		// position menuDialog at mouse coordinate
		var e = window.event;
		var posX = e.clientX * 0.70 -40;
		if(posX<0) posX=0;
		posY = e.clientY;
		if(posY>50) posY-=50;
		//gLog('menuDialogOpen x/y',posX,e.clientX,posY,e.clientY);
		menuDialogOpenChildElement.style.left = posX+"px";
		menuDialogOpenChildElement.style.top = (posY+window.scrollY)+"px"; // add scrollY-offset to posY
		gLog('menuDialogOpen2 x/y',posX,posY+window.scrollY);
	}

	menuDialogOpenElement.style.display = "block";

	// move popup-menu up to prevent bottom cut-off (if there is room on top)
	setTimeout(function() {
		let menuHeight = menuDialogOpenChildElement.clientHeight;
		let pageHeight = mainElement.clientHeight;
		//gLog('menuDialogOpen up',posY, menuHeight, pageHeight);
		while(posY>10 && posY + menuHeight > pageHeight) {
			posY -= 10;
		}
		gLog('menuDialogOpen up2',posY, menuHeight, pageHeight);
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

function onIceCandidate(event,myCandidateName) {
	if(doneHangup) {
		gLog('onIce ignored after doneHangup');
		return;
	}
	if(event.candidate==null) {
		// ICE gathering has finished
		gLog('onIce end of candidates');
	} else if(event.candidate.address==null) {
		//console.warn('onIce skip event.candidate.address==null');
	} else if(isDataChlOpen()) {
		onIceCandidates++;
		gLog("onIce "+myCandidateName+" dataChl doneHangup="+doneHangup);

		dataChannel.send("cmd|"+myCandidateName+"|"+JSON.stringify(event.candidate));
	} else if(wsConn==null) {
		gLog("onIce "+myCandidateName+": wsConn==null "+event.candidate.address+" "+onIceCandidates);
	} else if(typeof wsConn.readyState !== "undefined" && wsConn.readyState!=1) {
		// supposed meaning: true = signaling server not connected
		gLog("onIce "+myCandidateName+" readyS!=1 "+event.candidate.address+" "+wsConn.readyState);
	} else {
		onIceCandidates++;
		gLog("onIce "+myCandidateName+" wsSend "+event.candidate.address+" "+onIceCandidates);
		// 300ms delay to prevent "cmd "+myCandidateName+" no peerCon.remoteDescription" on other side
		setTimeout(function() {
			// TODO support dataChannel delivery?
			if(!doneHangup) {
				wsSend(myCandidateName+"|"+JSON.stringify(event.candidate));
			}
		},300);
	}
}

var iframeWindowOpenFlag = false;
var iframeWindowOpenUrl = null;
function iframeWindowOpen(url, horiCenterBound, addStyleString, dontIframeOnload) {
	// dontIframeOnload=false: the document (height or min-height) determines the iframe height
	// dontIframeOnload=true:  the styleString (addStyleString) determines the iframe height
	// for webcall widgets we use dontIframeOnload=false, because they use height to set the iframe height
	// ext html pages may not set a fixed height, in this case we use dontIframeOnload=true

	//console.log('iframeWindowOpen='+url);
	if(iframeWindowOpenFlag) {
		//tmtmtm
		//console.log("# iframeWindowOpen fail iframeWindowOpenFlag");
		//return;
		iframeWindowClose();
	}
	if(menuDialogOpenElement) {
		menuDialogClose();
	} else {
		hashcounter++;
		location.hash = hashcounter;
	}

	fullScreenOverlayElement.style.display = "block";
	fullScreenOverlayElement.onclick = function() {
		//gLog('fullScreenOverlayElement.onclick '+url);
		let connect = false;
		try {
			connect = window.frames[0].window.mediaConnect;
		} catch(ex) {}
		if(connect==true) {
			//gLog('onclick fullScreenOverlayElement ignored (no history.back)');
		} else {
			//gLog('onclick fullScreenOverlayElement no mediaConnect -> history.back');
			history.back();
		}
	}

	containerElement.style.filter = "blur(0.8px) brightness(60%)";

	// scroll to top
	//window.scrollTo(0, 0);
	window.scrollTo({ top: 0, behavior: 'smooth' });

	console.log("iframeWindowOpen "+url+" horiCenterBound="+horiCenterBound+" addStyle="+addStyleString+" dontIframeOnload="+dontIframeOnload);
	iframeWindowOpenUrl = url;
	iframeWindowOpenFlag = true;

	let styleString = "width:94%; max-width:600px; position:absolute; z-index:200;";
	if(horiCenterBound) {
		// center hori
		styleString += "top:50%; left:50%; transform:translate(-50%,-50%);"
	} else {
		// left-bound
		styleString += "left:3.2%; top:2%;"
	}

	if(typeof addStyleString !== "undefined" && addStyleString) {
		styleString += addStyleString;
	}

	console.log("iframeWindowOpen styleString="+styleString);

	if(url.startsWith("string:")) {
		iframeWindowElement.style = styleString;
		iframeWindowElement.innerHTML = url.substring(7);
	} else {
		iframeWindowElement.style = styleString;
		// we call iframeOnload() so that the iframe height becomes same as the content height
		// for this to work, the document at url needs to have a fixed height or min-height
		// if the document does not have fixed height or min-height, scrollHeight = 150px
		// in this case dontIframeOnload should be set to skip onload='iframeOnload(this)'
		if(dontIframeOnload) {
			iframeWindowElement.innerHTML = "<iframe id='child' src='"+url+"' scrolling='yes' frameborder='no' width='100%' height='100%' allow='microphone;camera'></iframe>";
		} else {
			iframeWindowElement.innerHTML = "<iframe id='child' src='"+url+"' scrolling='yes' frameborder='no' width='100%' height='100%' allow='microphone;camera' onload='iframeOnload(this)'></iframe>";
		}
	}

	if(divspinnerframe) {
		divspinnerframe.style.display = "none";
	}
}

function iframeOnload(obj) {
	// scrollHeight without delay = min-height (set on the html element)
	// scrollHeight with delay    = actual height of content
	// this is why we run scrollHeight twice
	try {
		let iframeHeight = obj.contentWindow.document.documentElement.scrollHeight + 10 + 'px';
		console.log("iframeOnload height="+iframeHeight);
		obj.style.height = iframeHeight;
		obj.contentWindow.focus();
	} catch(ex) {
		console.error("iframeOnload "+ex.message);
	}

	setTimeout(function() {
		try {
			let iframeHeight = obj.contentWindow.document.documentElement.scrollHeight + 10 + 'px';
			console.log("iframeOnload delayed height="+iframeHeight);
			obj.style.height = iframeHeight;
			obj.contentWindow.focus();
		} catch(ex) {
			console.error("iframeOnload "+ex.message);
		}
	},150);
}

function iframeWindowClose() {
	if(iframeWindowOpenUrl && iframeWindowOpenUrl!="") {
		gLog('iframeWindowClose '+iframeWindowOpenUrl);
		containerElement.style.filter="";
		iframeWindowElement.innerHTML = "";
		iframeWindowElement.style.display = "none";
		fullScreenOverlayElement.style.display = "none";
		fullScreenOverlayElement.onclick = null;
		iframeWindowOpenFlag = false;

		if(iframeWindowOpenUrl.indexOf("/user/")>=0 && iframeWindowOpenUrl.indexOf("?callerId=")>=0) {
			if(typeof Android !== "undefined" && Android !== null) {
				Android.peerDisConnect(); // will reset callInProgress and turn off proximity sensor
			}
		} else if(iframeWindowOpenUrl.indexOf("/callee/settings")>=0) {
			// calling fkt in callee.js
			getSettings();
		}
		iframeWindowOpenUrl=null;
	} else {
		//console.log("iframeWindowClose was not open");
	}
}

let lastGoodMediaConstraints;
let lastGoodAvSelectIndex;
let myUserMediaConstraints;
function getStream(selectObject) {
	if(!navigator || !navigator.mediaDevices) {
		alert("getStream no access navigator.mediaDevices");
		return;
	}

	//if(!gentle) {
	//	const supportedConstraints = navigator.mediaDevices.getSupportedConstraints();
	//	gLog('getStream supportedConstraints',supportedConstraints);
	//}

	if(selectObject) {
		gLog('===getStream avSelect===');
		// selectObject is (only) set if user operates avSelect manually
		// parse for deviceId (selectObject.value in avSelect.options)
		for(var i = avSelect.options.length - 1; i >= 0; i--) {
			if(avSelect.options[i].value == selectObject.value) {
				// found deviceId
				myUserMediaDeviceId = selectObject.value;
				gLog('getStream avSelect deviceId '+myUserMediaDeviceId);

				if(avSelect.options[i].label.startsWith("Audio")) {
					if(videoEnabled) {
						gLog('getStream avSelect audio: videoOff');
						videoOff();
					}
				} else if(avSelect.options[i].label.startsWith("Video")) {
					let tmpConstraints = defaultConstraintString;
					if(myUserMediaDeviceId) {
						tmpConstraints += ',"deviceId": { "exact": "'+myUserMediaDeviceId+'" }';
					}
					tmpConstraints = "{"+tmpConstraints+"}";
					gLog('getStream avSelect video '+tmpConstraints);
					userMediaConstraints.video = JSON.parse(tmpConstraints);
				}
				break;
			}
		}
	}

	myUserMediaConstraints = JSON.parse(JSON.stringify(userMediaConstraints));

	if(!videoEnabled) {
		//gLog('getStream !videoEnabled: Constraints.video = false');
		myUserMediaConstraints.video = false;
	}

	if(videoEnabled) {
		if(!myUserMediaConstraints.video) {
			gLog('getStream videoEnabled but !myUserMediaConstraints.video: localVideoHide()');
			if(localVideoMsgElement) {
				localVideoMsgElement.innerHTML = "no video device";
				localVideoMsgElement.style.opacity = 0.9;
			}
		}
	}

	if(localStream) {
		//gLog("gotStream stop previous localStream len",allTracks.length);
		const allTracks = localStream.getTracks();
		allTracks.forEach(track => {
			track.stop();
		});
		if(peerCon && peerCon.iceConnectionState!="closed" && addedAudioTrack) {
			peerCon.removeTrack(addedAudioTrack);
		}
		addedAudioTrack = null;
		if(peerCon && peerCon.iceConnectionState!="closed" && addedVideoTrack) {
			peerCon.removeTrack(addedVideoTrack);
		}
		addedVideoTrack = null;
		localStream = null;
	}

	//gLog('getStream set getUserMedia '+myUserMediaConstraints);
	let saveWorkingConstraints = JSON.parse(JSON.stringify(myUserMediaConstraints));
	return navigator.mediaDevices.getUserMedia(myUserMediaConstraints)
		.then(function(stream) {
			gLog('getStream success -> gotStream');
			gotStream(stream);
			// no error: use this as lastGoodMediaConstraints
			lastGoodMediaConstraints = JSON.parse(JSON.stringify(saveWorkingConstraints));
			if(avSelect) {
				lastGoodAvSelectIndex = avSelect.selectedIndex;
			}
			//console.log('set lastGoodMediaConstraints',lastGoodMediaConstraints);
		})
		.catch(function(err) {
			if(!videoEnabled) {
				console.log('# audio input error', err.message); // "Peer connection is closed"
				if(!doneHangup) {
					alert("audio input error " + err.message);
				}
			} else {
				console.log('# audio/video error', err.message);
				if(localVideoMsgElement) {
					localVideoMsgElement.innerHTML = "video mode error";
					localVideoMsgElement.style.opacity = 0.9;
				}
			}
			showStatus(""); // undo "Connecting..."
			if(typeof dialButton!=="undefined" && dialButton) {
				dialButton.disabled = false;
				hangupButton.disabled = true;
			}

			if(lastGoodMediaConstraints) {
				gLog('getStream back to lastGoodMediaConstraints '+lastGoodMediaConstraints);
				userMediaConstraints = JSON.parse(JSON.stringify(lastGoodMediaConstraints));
				if(avSelect) {
					avSelect.selectedIndex = lastGoodAvSelectIndex;
				}
				if(!userMediaConstraints.video && videoEnabled) {
					gLog('getStream back to lastGoodMediaConstraints !Constraints.video');
					//localVideoHide();
				}
				if(userMediaConstraints.video && !videoEnabled) {
					gLog('getStream back to lastGoodMediaConstraints Constraints.video');
					localVideoShow();
				}
				return navigator.mediaDevices.getUserMedia(userMediaConstraints)
					.then(function(stream) {
						gotStream(stream);
						if(videoEnabled && localVideoMsgElement) {
							// remove error msg
							setTimeout(function() {
								localVideoMsgElement.innerHTML = "";
								localVideoMsgElement.style.opacity = 0;
							},1000);
						}
					})
					.catch(function(err) {
						if(videoEnabled && localVideoMsgElement) {
							gLog('getStream backto lastGoodMediaConstraints videoEnabled err');
							localVideoMsgElement.innerHTML = "no video device";
							localVideoMsgElement.style.opacity = 0.9;
						}
					});
			}
		});
}

function gotDevices(deviceInfos) {
	// fill avSelect with the available audio/video input devices (mics and cams)
	if(avSelect) {
		var i, L = avSelect.options.length - 1;
		for(i = L; i >= 0; i--) {
			avSelect.remove(i);
		}

		let countVideoDevices = 0;
		for(const deviceInfo of deviceInfos) {
			if(deviceInfo.kind=="audioinput" || deviceInfo.kind=="videoinput") {
				let deviceId = deviceInfo.deviceId;
				if(deviceId.length>20) {
					deviceId = deviceId.substring(0,20)+"...";
				}
				//gLog('gotDevices '+deviceInfo.kind+","+deviceInfo.label+","+deviceId);
			}

			const option = document.createElement('option');
			option.value = deviceInfo.deviceId;

			if(deviceInfo.kind === 'audioinput') {
				let deviceInfoLabel = deviceInfo.label;
				if(deviceInfoLabel=="Default") {
					deviceInfoLabel="Audio Default";
				} else if(deviceInfoLabel) {
					deviceInfoLabel = "Audio "+deviceInfoLabel
				}
				option.text = deviceInfoLabel || `Audio ${avSelect.length + 1}`;
			} else if (deviceInfo.kind === 'videoinput') {
				if(!videoEnabled) {
					continue;
				}
				if(countVideoDevices==0) {
					// the 1st video device shows up, therefore we create a default video device entry before it
					// this entry has no deviceId
					const defaultVideoOption = document.createElement('option');
					defaultVideoOption.text = "Video Default";
					defaultVideoOption.value = ""; // empty deviceId
					avSelect.appendChild(defaultVideoOption);
				}
				countVideoDevices++;

				let deviceInfoLabel = deviceInfo.label;
				if(deviceInfoLabel) {
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
			track.stop();
		});
		if(peerCon && peerCon.iceConnectionState!="closed" && addedAudioTrack) {
			peerCon.removeTrack(addedAudioTrack);
		}
		addedAudioTrack = null;
		if(peerCon && peerCon.iceConnectionState!="closed" && addedVideoTrack) {
			peerCon.removeTrack(addedVideoTrack);
		}
		addedVideoTrack = null;
	}

	localStream = stream;

	const audioTracks = localStream.getAudioTracks();
	if(!mediaConnect) {
		gLog('gotStream mute loc audio inp '+audioTracks[0]);
		audioTracks[0].enabled = false;
	} else {
		gLog('gotStream unmute loc audio inp '+audioTracks[0]);
		audioTracks[0].enabled = true;
	}

	if(!peerCon || peerCon.iceConnectionState=="closed") {
		gLog('gotStream no peerCon: no addTrack');
	} else if(addedAudioTrack) {
		gLog('gotStream addedAudioTrack already set: no addTrack');
	} else {
		gLog('gotStream addedAudioTrack');
		addedAudioTrack = peerCon.addTrack(audioTracks[0],localStream);
	}

	// now let's look at all the reasons NOT to add the videoTrack to peerCon
	if(!videoEnabled) {
		// disable all video tracks (do not show the video locally)
		gLog("gotStream !videoEnabled -> stop video tracks");
		stream.getVideoTracks().forEach(function(track) {
			gLog("gotStream !videoEnabled stop video track "+track);
			track.stop();
		})
	} else if(!addLocalVideoEnabled) {
		// video streaming has not been activated yet
		gLog('gotStream videoEnabled but !addLocalVideoEnabled: no addTrack vid');
	} else if(!peerCon || peerCon.iceConnectionState=="closed") {
		//gLog('gotStream videoEnabled but !peerCon: no addTrack vid');
	} else if(localCandidateType=="relay" || remoteCandidateType=="relay") {
		gLog('gotStream videoEnabled but relayed con: no addTrack vid (%s)(%s) '+
			localCandidateType+" "+remoteCandidateType);
	} else if(localStream.getTracks().length<2) {
		gLog('# gotStream videoEnabled but getTracks().length<2: no addTrack vid '+localStream.getTracks().length);
	} else {
		gLog('peerCon addTrack local video input '+localStream.getTracks()[1]);
		addedVideoTrack = peerCon.addTrack(localStream.getTracks()[1],localStream);
	}

	gLog("gotStream set localVideoFrame.srcObject");
	localVideoFrame.srcObject = localStream;
	localVideoFrame.volume = 0;
	localVideoFrame.muted = 0;
	if(videoEnabled) {
		vmonitor();
	}
	gotStream2();
}

function videoSwitch(forceClose) {
	if(videoEnabled || forceClose) {
		gLog("===videoSwitch videoOff==="+forceClose);
		videoOff();
	} else {
		gLog("===videoSwitch videoOn===");
		videoOn();
	}
}

var vpauseTimer = null;
var addLocalVideoEnabled = false;
function connectLocalVideo(forceOff) {
	if(vpauseTimer) {
		clearTimeout(vpauseTimer);
		vpauseTimer = null;
	}
	if(!addLocalVideoEnabled && !forceOff) {
		// start streaming localVideo to other peer
		addLocalVideoEnabled = true; // will cause: peerCon.addTrack(video)
		if(isDataChlOpen()) {
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
		} else if(!peerCon || peerCon.iceConnectionState=="closed") {
			gLog("connectLocalVideo discon !peerCon: !removeTrack");
		} else  {
			gLog("connectLocalVideo discon peerCon.removeTrack(addedVideoTrack)");
			peerCon.removeTrack(addedVideoTrack);
			addedVideoTrack = null;
		}

		if(isDataChlOpen()) {
			// make other side stop our cam (their remote cam)
			dataChannel.send("cmd|rtcVideoOff");
		}

		remoteFullScreen(true); // force end
	}
}

function vmonitor() {
	gLog("vmonitor");
	if(localVideoMsgElement) {
		localVideoMsgElement.innerHTML = "";
		localVideoMsgElement.style.opacity = 0;
	}
	if(vmonitorButton) {
		vmonitorButton.style.color = "#ff0";
	}
	localVideoFrame.style.opacity = 1;
	if(!localStream) {
		// re-enable paused video and microphone
		gLog("vmonitor !localStream: re-enable");
		pickupAfterLocalStream = false;

		// we set defaultConstraintString, so that when video is enabled, we have access to the highest resol.
		constraintString = defaultConstraintString;
		setVideoConstraintsGiven();

		getStream(); // -> gotStream() -> gotStream2()
		return
		// vmonitor will be called again, but then with localStream
	}
	if(videoEnabled) {
		localVideoFrame.play().catch(function(error) {});
		if(!mediaConnect) {
			gLog("vmonitor play new vpauseTimer");
			if(vsendButton)
				vsendButton.style.color = "#fff";
			if(vpauseTimer) {
				clearTimeout(vpauseTimer);
				vpauseTimer = null;
			}
			vpauseTimer = setTimeout(vpauseByTimer, 45000);
		} else {
			gLog("vmonitor play");
		}
	}
	localVideoMonitorPaused = false;
}

function vpauseByTimer() {
	gLog("vpauseByTimer"+mediaConnect);
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
	if(localVideoMsgElement) {
		localVideoMsgElement.innerHTML = "monitor paused";
		localVideoMsgElement.style.opacity = 0.9;
	}

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

function getLocalVideoDivHeight() {
	return parseFloat(getComputedStyle(localVideoFrame).width)/16*9;
}

function localVideoShow() {
	// expand local video frame/div
	videoEnabled = true;
	localVideoLabel.style.opacity = 0.7; // will be transitioned
	let localVideoDivHeight = getLocalVideoDivHeight();
	localVideoDiv.style.height = ""+localVideoDivHeight+"px"; // will be transitioned
	let localVideoDivOnVisible = function() {
		localVideoDiv.style.height = "auto";
		localVideoDiv.removeEventListener('transitionend',localVideoDivOnVisible);
	}
	localVideoDiv.addEventListener('transitionend', localVideoDivOnVisible);
	localVideoDiv.style.visibility = "visible";

	cameraElement.style.opacity = 0;
}

function localVideoHide() {
	// shrink local video frame/div
	gLog('localVideoHide()');
	videoEnabled = false;
	lastGoodMediaConstraints = null;
	lastGoodAvSelectIndex = 0;
	if(localVideoMsgElement) {
		localVideoMsgElement.style.opacity = 0;
	}
	localVideoLabel.style.opacity = 0.3;
	let localVideoDivHeight = getLocalVideoDivHeight();
	localVideoDiv.style.height = ""+localVideoDivHeight+"px"; // from auto to fixed
	setTimeout(function() { // wait for fixed height
		if(!videoEnabled) {
			localVideoDiv.style.height = "0px";
		}
	},100);
	cameraElement.style.opacity = 1;

	// remove all video devices from avSelect
	for(var i = avSelect.options.length - 1; i >= 0; i--) {
		if(avSelect.options[i].label.startsWith("Video")) {
			avSelect.remove(i);
		}
	}
}

function remoteVideoDivTransitioned() {
	gLog('remoteVideo transitioned'+remoteVideoDiv.style.height);
	if(remoteVideoDiv.style.height != "0px") {
		remoteVideoDiv.style.height = "auto";
	}
	remoteVideoDiv.removeEventListener('transitionend',remoteVideoDivTransitioned);
}

var remoteVideoShowing = false;
function remoteVideoShow() {
	gLog('remoteVideoShow '+remoteVideoShowing);
	window.requestAnimationFrame(function(){
		if(!remoteVideoShowing) {
			let remoteVideoDivHeight = parseFloat(getComputedStyle(remoteVideoFrame).width)/16*9;
			gLog('remoteVideoShow '+remoteVideoShowing+" "+remoteVideoDivHeight);
			remoteVideoDiv.style.height = ""+remoteVideoDivHeight+"px";
			remoteVideoDiv.addEventListener('transitionend', remoteVideoDivTransitioned) // when done: height auto
			remoteVideoLabel.innerHTML = 'remote-cam <span id="remotefullscreen" onclick="remoteFullScreen(false)" style="margin-left:3%">fullscreen</span> <span onclick="closeRemoteVideo()" style="margin-left:3%">close</span>';
			remoteVideoShowing = true;
		}
	});
}

function remoteFullScreen(forceClose) {
	let fullScreenId = "";
	if(document.fullscreenElement) {
		fullScreenId = document.fullscreenElement.id;
	}
	//gLog("remoteFullScreen "+fullScreenId+" "+forceClose);
	if(fullScreenId!="remoteVideoDiv" && !forceClose) {
		// not yet in remoteVideoDiv fullscreen mode
		if(remoteVideoDiv.requestFullscreen) {
			// switch to remoteVideoDiv fullscreen mode
			//gLog('remoteFullScreen start');
			remoteVideoFrame.style.aspectRatio = "auto";
			remoteVideoDiv.requestFullscreen();
			vpause();
			// make remotefullscreen label yellow
			let remotefullscreenLabel = document.getElementById("remotefullscreen");
			if(remotefullscreenLabel) {
				remotefullscreenLabel.style.color = "#ff0";
			}
		}
	} else {
		// exit remoteVideoDiv fullscreen mode
		//gLog('remoteFullScreen end');
		remoteVideoFrame.style.aspectRatio = "16/9";
		document.exitFullscreen().catch(err => { });
		// make remotefullscreen label white
		let remotefullscreenLabel = document.getElementById("remotefullscreen");
		if(remotefullscreenLabel) {
			remotefullscreenLabel.style.color = "#fff";
		}
	}
}

function closeRemoteVideo() {
	if(isDataChlOpen()) {
		// make other side stop their cam delivery
		dataChannel.send("cmd|stopCamDelivery");
	}
	remoteFullScreen(true); // force end
}

function remoteVideoHide() {
	//gLog('remoteVideoHide',remoteVideoShowing);
	window.requestAnimationFrame(function(){
		if(remoteVideoShowing) {
			let remoteVideoDivHeight = parseFloat(getComputedStyle(remoteVideoFrame).width)/16*9;
			gLog('remoteVideoHide',remoteVideoDiv.style.height,remoteVideoDivHeight);
			remoteVideoDiv.style.height = remoteVideoDivHeight+"px"; // height from auto to fixed
			//gLog('remoteVideoHide',remoteVideoDiv.style.height);
			window.requestAnimationFrame(function(){
				if(remoteVideoShowing) {
					//gLog('remoteVideoHide set 0px');
					remoteVideoDiv.style.height = "0px";
					remoteVideoLabel.innerHTML = "";
					remoteVideoShowing = false;
				}
			});
		}
	});
	remoteFullScreen(true); // force end
}

function peerConOntrack(track, streams) {

// TODO tmtmtm
//		track.onunmute = () => {
//			if(remoteVideoFrame && remoteVideoFrame.srcObject == streams[0]) {
//				if(!gentle) console.warn('peerCon.ontrack onunmute was already set');
//				return;
//			}
		gLog('peerCon.ontrack onunmute set remoteVideoFrame.srcObject');
//		if(remoteStream) {
//			gLog('peerCon.ontrack onunmute have prev remoteStream');
//			// TODO treat like localStream in gotStream() ? apparently not needed
//		}
		remoteStream = streams[0];
//		};

/*
	gLog('peerCon.ontrack');
	track.onunmute = () => {
		if(remoteVideoFrame && remoteVideoFrame.srcObject == streams[0]) {
			if(!gentle) console.warn('peerCon.ontrack onunmute was already set');
			return;
		}
		gLog('peerCon.ontrack onunmute set remoteVideoFrame.srcObject',streams[0]);
		if(remoteStream) {
			gLog('peerCon.ontrack onunmute have prev remoteStream');
			// TODO treat like localStream in gotStream() ? apparently not needed
		}
		remoteStream = streams[0];
	};
*/
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

				gLog('peerCon.ontrack onIceCandidates='+onIceCandidates);
				gLog('peerCon.ontrack connectionstatechangeCounter='+connectionstatechangeCounter);
				/*
				if(connectionstatechangeCounter<=0) {
					// this is a problem 
				}
				*/
				let videoTracks = remoteStream.getVideoTracks();
				gLog('peerCon.ontrack unmute track.enabled: delay vtracks',videoTracks.length);
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
	if(/*!gentle &&*/ msg && msg!="") {
		// msg may contain html, which we don't want to console.log
		let idx = msg.indexOf("<");
		if(idx>=0) {
			console.log('status: '+msg.substring(0,idx)+"...");
		} else {
			console.log('status: '+msg);
		}
	}
	if(!singlebutton) {
		let sleepMs = 5000;
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
	gLog("dataChannel.onclose");
	dataChannel = null;
	if(rtcConnect) {
		if(mediaConnect) {
			hangupWithBusySound(false,"dataChannel.close");
		} else {
			hangup(true,true,"dataChannel.close");
		}
	}
}

function dataChannelOnerror(event) {
	console.log("# dataChannel.onerror",event);
	if(rtcConnect) {
		showStatus("# dataChannel error "+event.error,-1);
		hangup(true,true,"dataChannelOnerror");
	}
	progressSendElement.style.display = "none";
	if(fileselectLabel && mediaConnect && isDataChlOpen() && isP2pCon()) {
		fileselectLabel.style.display = "block";
	}
}

function hangupWithBusySound(mustDisconnectCallee,message) {
	dialing = false;
	stopAllAudioEffects();
	if(peerCon && peerCon.iceConnectionState!="closed") {
		if(playDialSounds && busySignalSound!=null) {
			gLog(`hangupWithBusySound `+message);
			busySignalSound.play().catch(function(error) { });
			setTimeout(function() {
				gLog(`hangupWithBusySound stopAllAudioEffects`);
				stopAllAudioEffects();
			},1500);
		}
	}
	hangup(mustDisconnectCallee,true,message);
}

function onkeydownFunc(evt) {
	//gLog('menuDialogOpen onkeydown event');
	evt = evt || window.event;
	var isEscape = false;
	if("key" in evt) {
		isEscape = (evt.key === "Escape" || evt.key === "Esc");
	} else {
		isEscape = (evt.keyCode === 27);
	}
	if(isEscape) {
		if(iframeWindowOpenFlag || menuDialogOpenElement) {
			gLog("client.js: esc key -> back");
			history.back();
		} else {
			//console.log('client.js: esc key (ignore)');
		}
	} else if(evt.key=="!") {
		//console.log("client.js: excl-key -> menuDialogOpen()");
		//menuDialogOpen(menuDialogElement);
	}
}

function gLog(...args) {
	if(!gentle) console.log(...args);
}

function cleanStringParameter(str,eliminateSpaces) {
	let ret = str.replace('|','').trim();
	if(eliminateSpaces) {
		ret = ret.replace(/ /g,'');
	}
	return ret;
}

