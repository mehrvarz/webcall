// WebCall Copyright 2023 timur.mobi. All rights reserved.
'use strict';
const clientVersion = '3.6.7';

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
const chatButton = document.querySelector('button#chatButton');
const muteMicDiv = document.getElementById("muteMicDiv");
const muteMicElement = document.getElementById("muteMic");
const muteMiclabelElement = document.getElementById("muteMiclabel");

var bitrate = 320000;
var calleeID = "";
var localStream = null; // set by mediaDevices.getUserMedia() -> gotStream()
var remoteStream = null; // set by peerConOntrack()
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
var callStatsTitle = "Call Stats";
var willShowPostCall = "Available post call";

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

function muteMic(flag) {
	if(!localStream) {
		console.log("! muteMic no localStream on muteMic state change: "+flag);
	} else {
		const audioTracks = localStream.getAudioTracks();
		if(!audioTracks[0]) {
			console.log("# muteMic no audioTracks on muteMic state change: "+flag);
		} else {
			if(flag) {
				console.log("muteMic state change "+flag+": mic disable");
				audioTracks[0].enabled = false;
			} else {
				console.log("muteMic state change "+flag+": mic enable");
				audioTracks[0].enabled = true;
			}
		}
	}
}

var fileSelectInitialized = false;
function fileSelectInit() {
	if(fileSelectElement) {
		if(!fileSelectInitialized) {
			fileSelectInitialized = true;
			gLog("fileSelectInit addEventListener");
			fileSelectElement.addEventListener('change', (event) => {
				// user has selected a file to send
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
		} else {
			gLog("fileSelectInit already initialzed");
		}
	} else {
		console.log("# no fileSelectElement");
	}
}

function sendFile(file) {
	let fileName = file.name;
	let idxLastSlash = fileName.lastIndexOf("/");
	if(idxLastSlash>=0) {
		fileName = fileName.substring(idxLastSlash+1);
	}
	console.log("fileSelect: "+file.name, file.size, file.type, file.lastModified);
	dataChannel.send("file|"+fileName+","+file.size+","+file.type+","+file.lastModified);
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
	progressSendLabel.innerHTML = "Sending: "+fileName.substring(0,25);
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
			progressSendLabel.innerHTML = "sending '"+fileName.substring(0,22)+"' "+kbytesPerSec+" KB/s";
			//console.log("sending: "+fileName +" "+ file.size);
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
				showStatus("sent "+fileName.substring(0,28)+" "+Math.floor(file.size/1000)+" KB",-1);
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
			errorFkt("timeout",xhrTimeout);
		}
	}
	xhr.onerror = function(e) {
		errorFkt("fetching",xhr.status);
	};
	//console.log("xhr api="+api);
	// cross-browser compatible approach to bypassing the cache
	if(api.indexOf("?")>=0) {
		api += "&_="+new Date().getTime();
	} else {
		api += "?_="+new Date().getTime();
	}
	//gLog('xhr '+api);
	xhr.open(type, api, !sync);
	xhr.setRequestHeader("Content-type", "text/plain; charset=utf-8");
	try {
		if(postData) {
			xhr.send(postData);
		} else {
			xhr.send();
		}
	} catch(ex) {
		console.log("# xhr send ex="+ex);
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
		myStatsPostCallString = willShowPostCall;
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
	}
	return myStatsPostCallString;
}

function openPostCallStats() {
	gLog('openPostCallStats');
	let str = "string:<h2>"+callStatsTitle+"</h2>"+showStatsPostCall();
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
function getStatsCandidateTypesEx(results,eventString1) {
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
function menuDialogOpen(menuDialog,position,inner) {
	// position: 0=centered, 1=atMousePos, 2=random
	if(menuDialogOpenElement) {
		console.log('# menuDialogOpen menuDialogOpenElement');
		return;
	}
	if(typeof menuDialog=="undefined" || menuDialog==null) {
		console.log('# menuDialog undefined');
		return;
	}

	//soundKeyboard(); // only for testing

	//console.log('menuDialogOpen');
	menuDialogOpenElement = menuDialog;
	if(typeof inner!="undefined" && inner!=null) {
		menuDialogOpenElement.innerHTML = inner;
	}

	hashcounter++;
	location.hash = hashcounter;
	//gLog("menuDialogOpen hashcounter="+hashcounter+" "+location.hash);

	fullScreenOverlayElement.style.display = "block";
	fullScreenOverlayElement.onclick = function() {
		//console.log('fullScreenOverlayElement.onclick');
		history.back();
	}

	containerElement.style.filter = "blur(0.8px) brightness(60%)";
	if(calleeMode) {
		if(wsConn && navigator.cookieEnabled && getCookieSupport()) {
			// cookies avail: "Settings" visible
			if(menuSettingsElement) {
				menuSettingsElement.style.display = "block";
				idMappingElement.style.display = "block";
			}
		} else {
			// "Settings" hidden
			if(menuSettingsElement) {
				menuSettingsElement.style.display = "none";
				idMappingElement.style.display = "none";
			}
		}
	}

	const menuDialogOpenChildElement = menuDialogOpenElement.firstElementChild;
	var posX, posY;
	if(position==1) { // atMousePos
		// position menuDialog at mouse coordinate
		posY = menuDialogOpenChildElement.style.top;
		var e = window.event;
		if(typeof e !== "undefined" && e !== null) {
			posX = e.clientX * 0.70 -60;
			if(posX<0) posX=0;
			posY = e.clientY;
			if(posY>50) posY-=50;
			gLog('menuDialogOpen1 atMousePos x/y',posX,e.clientX,posY,e.clientY);
			menuDialogOpenChildElement.style.left = posX+"px";
			menuDialogOpenChildElement.style.top = (posY+window.scrollY)+"px";
			gLog('menuDialogOpen2 atMousePos x/y',posX,posY+window.scrollY);
		} else {
			// ?
		}

	} else if(position==0) { // centered
		menuDialog.style.position = "absolute";
		menuDialog.style.height = mainElement.clientHeight+"px";
		menuDialog.style.width = mainElement.clientWidth+"px";
		menuDialogOpenChildElement.style.margin = "0 auto";
		menuDialogOpenChildElement.style.top = "50%";
		menuDialogOpenChildElement.style.left = "50%";
		menuDialogOpenChildElement.style.right = "";
		menuDialogOpenChildElement.style.transform = "translate(-50%, -50%)";

	} else if(position==2) { // random
		posX = Math.floor(Math.random()*90)+10;
		posY = Math.floor(Math.random()*120);
		gLog("menuDialogOpen random posY="+posY+" posX="+posX);
		menuDialogOpenChildElement.style.left = posX+"px";
		menuDialogOpenChildElement.style.top  = posY+"px";
	}

	menuDialogOpenElement.style.display = "block";

	// move menuDialog up to prevent bottom cut-off (if there is room on top)
	// move menuDialog left to prevent rightside cut-off (if there is room to the left)
	setTimeout(function() {
		let pageHeight = mainElement.clientHeight;
		let menuHeight = menuDialogOpenChildElement.clientHeight;
		//console.log('menuDialogOpen up',posY, menuHeight, pageHeight);
		while(posY>10 && posY + menuHeight > pageHeight) {
			posY -= 10;
		}
		//console.log('menuDialogOpen up2',posY, menuHeight, pageHeight);
		menuDialogOpenChildElement.style.top = (posY+window.scrollY)+"px"; // add scrollY-offset to posY
		/*
		let menuWidth = menuDialogOpenChildElement.clientWidth;
		let pageWidth = mainElement.clientWidth;
		while(posX>10 && posX + menuWidth > pageWidth) {
			posX -= 10;
		}
		gLog('menuDialogOpen left2',posX, menuWidth, pageWidth);
		menuDialogOpenChildElement.style.left = (posX+window.scrollX)+"px"; // add scrollX-offset to posX
		*/
	},60);
}

function menuDialogClose() {
	if(menuDialogOpenElement) {
		//console.log("menuDialogClose()");
		menuDialogOpenElement.style.display = "none";
		containerElement.style.filter = "";
		fullScreenOverlayElement.style.display = "none";
		fullScreenOverlayElement.onclick = null;
		menuDialogOpenElement = null;
	} else {
		//console.log("menuDialogClose() was not open");
	}
}

function onIceCandidate(event,myCandidateName) {
	if(doneHangup) {
		console.log('# onIce ignored after doneHangup '+JSON.stringify(event.candidate));
		return;
	}
	if(event.candidate==null) {
		// ICE gathering has finished
		gLog('onIce end of candidates');
	} else if(event.candidate.address==null) {
		console.log('# onIce skip event.candidate.address==null '+JSON.stringify(event.candidate));
	} else if(isDataChlOpen()) {
		onIceCandidates++;
		console.log("onIce "+myCandidateName+" dataChl doneHangup="+doneHangup);
		dataChannel.send("cmd|"+myCandidateName+"|"+JSON.stringify(event.candidate));
	} else if(wsConn==null) {
		console.log("# onIce "+myCandidateName+": wsConn==null "+event.candidate.address+" "+onIceCandidates);
	} else if(typeof wsConn.readyState !== "undefined" && wsConn.readyState!=1) {
		// supposed meaning: true = signaling server not connected
		console.log("# onIce "+myCandidateName+" readyS!=1 "+event.candidate.address+" "+wsConn.readyState);
	} else {
		onIceCandidates++;
		gLog("onIce "+myCandidateName+" wsSend "+event.candidate.address+" "+onIceCandidates);
		// 300ms delay to prevent "cmd "+myCandidateName+" no peerCon.remoteDescription" on other side
		setTimeout(function() {
			if(!doneHangup) {
				wsSend(myCandidateName+"|"+JSON.stringify(event.candidate));
			}
		},300);
	}
}

function checkNetwork() {
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.isNetwork !== "undefined" && Android.isNetwork !== null) {
			if(Android.isNetwork()<1) {
				Android.toast("No network");
				return false;
			}
		}
	}
	return true;
}

var iframeWindowOpenFlag = false;
var iframeWindowOpenUrl = null;
function iframeWindowOpen(url, horiCenterBound, addStyleString, dontIframeOnload) {
	// dontIframeOnload=false: the document (height or min-height) determines the iframe height
	// dontIframeOnload=true:  the styleString (addStyleString) determines the iframe height
	// for webcall widgets we use dontIframeOnload=false, because they use height to set the iframe height
	// ext html pages may not set a fixed height, in this case we use dontIframeOnload=true

	gLog('iframeWindowOpen='+url);
	if(iframeWindowOpenFlag) {
		iframeWindowClose();
	}
	if(menuDialogOpenElement) {
		//console.log('iframeWindowOpen menuDialogOpenElement menuDialogClose()');
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
	window.scrollTo({ top: 0, behavior: 'smooth' });

	//console.log("iframeWindowOpen "+url+" horiCenter="+horiCenterBound+" addStyle="+addStyleString+" dontIframeOnload="+dontIframeOnload);
	iframeWindowOpenUrl = url;
	iframeWindowOpenFlag = true;

	let styleString = "width:94%; max-width:600px; position:absolute; z-index:200;";
	if(horiCenterBound) {
		// center hori
		styleString += "top:50%; left:50%; transform:translate(-50%,-50%);"
	} else {
		// left-bound
		styleString += "left:3.2%; top:10px;"
	}

	if(typeof addStyleString !== "undefined" && addStyleString!="") {
		//console.log("iframeWindowOpen addStyleString="+addStyleString);
		styleString += addStyleString;
	}
	//console.log("iframeWindowOpen styleString="+styleString);

	iframeWindowElement.style = styleString;
	if(url.startsWith("string:")) {
		iframeWindowElement.innerHTML = url.substring(7);
	} else {
		if(!checkNetwork()) {
			iframeWindowClose();
			return;
		}

		if(divspinnerframe) {
			if(divspinnerframe) divspinnerframe.style.display = "block";
		}
		// we call iframeOnload() so that the iframe height becomes same as the content height
		// for this to work, the document at url needs to have a fixed height or min-height
		// if the document does not have fixed height or min-height, scrollHeight = 150px
		// in this case dontIframeOnload should be set to skip onload='iframeOnload(this)'
		if(typeof dontIframeOnload == "undefined" || dontIframeOnload==false) {
			iframeWindowElement.innerHTML = "<iframe id='child' src='"+url+"' scrolling='yes' frameborder='no' width='100%' height='100%' allow='microphone;camera' onload='iframeOnload(this)'></iframe>";
		} else {
			iframeWindowElement.innerHTML = "<iframe id='child' src='"+url+"' scrolling='yes' frameborder='no' width='100%' height='100%' allow='microphone;camera'></iframe>";
		}
	}

	if(divspinnerframe) {
		divspinnerframe.style.display = "none";
	}
}

function iframeOnload(obj) {
	// we run scrollHeight twice
	// 1. scrollHeight without delay = min-height (from html element)(not larger than mainElementHeight)
	let mainElementRect = mainElement.getBoundingClientRect();
	let mainElementHeight = (mainElementRect.bottom - mainElementRect.top) * 0.9;
	//console.log("mainElementHeight="+mainElementHeight+" "+mainElementRect.bottom+" "+mainElementRect.top)
	try {
		let iframeHeight = obj.contentWindow.document.documentElement.scrollHeight;
		if(iframeHeight > mainElementHeight) {
			iframeHeight = mainElementHeight;
		}
		//console.log("iframeOnload1 height="+iframeHeight);
		obj.style.height = iframeHeight+"px";
		obj.contentWindow.focus();
	} catch(ex) {
		console.error("iframeOnload "+ex.message);
	}

	// 2. scrollHeight with delay = actual height of content (not larger than mainElementHeight)
	setTimeout(function() {
		try {
			let iframeHeight = obj.contentWindow.document.documentElement.scrollHeight;
			if(iframeHeight > mainElementHeight) {
				iframeHeight = mainElementHeight;
			}
			//console.log("iframeOnload2 height="+iframeHeight);
			obj.style.height = iframeHeight+"px";
			obj.contentWindow.focus();

			// 3. scrollHeight with delay = actual height of content (not larger than mainElementHeight)
			setTimeout(function() {
				try {
					let iframeHeight = obj.contentWindow.document.documentElement.scrollHeight;
					if(iframeHeight > mainElementHeight) {
						iframeHeight = mainElementHeight;
					}
					//console.log("iframeOnload3 height="+iframeHeight);
					obj.style.height = iframeHeight+"px";
					obj.contentWindow.focus();
				} catch(ex) {
					console.error("iframeOnload "+ex.message);
				}
			},150);
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
		} else if(iframeWindowOpenUrl.indexOf("/callee/settings")>=0 || 
				  iframeWindowOpenUrl.indexOf("/callee/mapping/")>=0) {
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
				console.log("# audio error " + err.message);
				if(!doneHangup) {
					alert("audio error: " + err.message +
						  "\nLooks like an issue with your browser");
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
    console.log("gotStream set localStream");
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
		if(!muteMicElement || !muteMicElement.checked) {
			gLog('gotStream unmute loc audio inp '+audioTracks[0]);
			audioTracks[0].enabled = true;
		}
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
		console.log('# gotStream videoEnabled but getTracks().length<2: no addTrack vid '+localStream.getTracks().length);
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
			console.log("# connectLocalVideo no dataChannel");
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
			gLog("connectLocalVideo dataChannel.send cmd|rtcVideoOff");
			dataChannel.send("cmd|rtcVideoOff");
		}

		gLog("connectLocalVideo remoteFullScreen");
		remoteFullScreen(true); // force end
		gLog("connectLocalVideo end done");
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
		return;
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
	gLog("remoteFullScreen "+fullScreenId+" forceClose="+forceClose);
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
		gLog('remoteFullScreen exit');
		if(remoteVideoFrame) {
			//gLog('remoteFullScreen aspectRatio 16/9');
			remoteVideoFrame.style.aspectRatio = "16/9";
		}
		/*
		// exitFullscreen is not supported in webkit (aborts JS without err-msg if exitFullscreen() is called)
		let ua = navigator.userAgent;
		if(ua.indexOf("iPhone")<0 && ua.indexOf("iPad")<0) {
			gLog('remoteFullScreen exitFullscreen');
			document.exitFullscreen().catch(err => {
				console.log('remoteFullScreen exitFullscreen err='+err.message);
			});
		}
		*/
		// make remotefullscreen label white
		//gLog('remoteFullScreen remotefullscreenLabel');
		let remotefullscreenLabel = document.getElementById("remotefullscreen");
		if(remotefullscreenLabel) {
			//gLog('remoteFullScreen remotefullscreenLabel #fff');
			remotefullscreenLabel.style.color = "#fff";
		}
	}
}

function closeRemoteVideo() {
	gLog('closeRemoteVideo');
	if(isDataChlOpen()) {
		// make other side stop their cam delivery
		dataChannel.send("cmd|stopCamDelivery");
	}
	remoteFullScreen(true); // force end
}

function remoteVideoHide() {
	gLog('remoteVideoHide '+remoteVideoShowing);
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

//	track.onunmute = () => {
//		if(remoteVideoFrame && remoteVideoFrame.srcObject == streams[0]) {
//			if(!gentle) console.warn('peerCon.ontrack onunmute was already set');
//			return;
//		}
		gLog('peerCon.ontrack set remoteVideoFrame.srcObject');
//		if(remoteStream) {
//			gLog('peerCon.ontrack onunmute have prev remoteStream');
//			// TODO treat like localStream in gotStream() ? apparently not needed
//		}
		remoteStream = streams[0];
//	};

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
			},600);
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
			//console.log('hashchange menuDialogOpenElement menuDialogClose()');
			menuDialogClose();
		}
	}
	hashcounter = newhashcounter;
}

var showStatusTimeout = null;
var showStatusMsg = "";
function showStatus(msg,timeoutMs) {
	gLog("showStatus msg="+msg,timeoutMs);
	if(typeof msg=="undefined" || msg==null) {
		console.log("status: msg undefined");
		return;
	}
	if(showStatusTimeout!=null) {
		gLog("showStatus clearTimeout of prev");
		clearTimeout(showStatusTimeout);
		showStatusTimeout = null;
	} else {
		gLog("showStatus no clearTimeout of prev");
	}

	let sleepMs = 2500;
	if(typeof timeoutMs!=="undefined") {
		sleepMs = timeoutMs;
	}
	if(msg!="") {
		// msg may contain html, which we don't want to log
		let idx = msg.indexOf("<");
		if(idx>=0) {
			console.log("status: "+msg.substring(0,idx)+"...");
		} else {
			console.log("status: "+msg);
		}
	} else {
		gLog("showStatus empty msg");
	}

	showStatusMsg = msg;
	statusLine.style.display = "none";
	statusLine.style.opacity = 0;
	statusLine.innerHTML = msg;
	statusLine.style.opacity = 1;
	statusLine.style.display = "block";

	if(msg!="" && sleepMs>=0) {
		// msg bleibt für sleepMs stehen
		// und dann transitioned to opacity für 600ms zu 0
		//console.log("status sleepMs="+sleepMs);
		// TODO would be nice to transition also the height

		showStatusTimeout = setTimeout(function() {
			// msg here is the old msg, but showStatusMsg might be different by now
			if(msg==showStatusMsg) {
				gLog("showStatus start opacityTransition msg="+msg);
				let opacityTransitioned = function() {
					// this occurs after the opacity-transition time of 600ms
					gLog("showStatus opacityTransitioned msg="+msg+" statusMsg="+showStatusMsg);
					if(msg==showStatusMsg) {
						// still showing the old msg: clear it
						statusLine.innerHTML = "";
					} else {
						// we are already showing a newer status msg: don't clear it
					}
					statusLine.removeEventListener('transitionend',opacityTransitioned);
				}
				statusLine.addEventListener('transitionend', opacityTransitioned); // 600ms
				statusLine.style.opacity = 0;
			} else {
				gLog("showStatus execute old timer (but msg!=showStatusMsg)");
			}
			showStatusTimeout = null;
		},sleepMs);
	}
}

function isDataChlOpen() {
	if(dataChannel) {
		gLog("isDataChlOpen state="+dataChannel.readyState);
		if(dataChannel.readyState=="open") {
			return true;
		}
	} else {
		//gLog("isDataChlOpen no dataChannel");
	}
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
}

function dataChannelOnerror(event) {
	console.log("# dataChannel.onerror",event.error);
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
	gLog("hangupWithBusySound stopAllAudioEffects "+message);
	stopAllAudioEffects();
	if(peerCon && peerCon.iceConnectionState!="closed") {
		if(playDialSounds && busySignalSound!=null) {
			gLog("hangupWithBusySound busySignalSound.play");
			busySignalSound.play().catch(function(error) { });
			setTimeout(function() {
				gLog("hangupWithBusySound stopAllAudioEffects");
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
	//console.log("onkeydownFunc %d %s isEscape=%d", evt.keyCode, evt.key, isEscape);
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

function getUrlParams(param) {
	if(window.location.search!="") {
		// skip questionmark
		var query = window.location.search.substring(1);
		var parts = query.split("&");
		for(var i=0;i<parts.length;i++) {
			var seg = parts[i].split("=");
			if(seg[0] == param) {
				if(typeof seg[1]!=="undefined" && seg[1]!="" && seg[1]!="null") {
					let ret = decodeURIComponent(seg[1]);
					//console.log("getUrlParams1 seg[1]="+seg[1]+" ret="+ret);
					return ret;
				}
				return "true";
			}
		}
	}
	if(param=="id") {
		let path = window.location.pathname;
		let lastSlash = path.lastIndexOf("/");
		let value = path.substring(lastSlash+1);
		//console.log("getUrlParams2 path="+path+" value="+value);
		return value;
	}
	return "";
}

function gLog(...args) {
	if(!gentle) console.log(...args);
}

function soundBeep() {
	var snd = new Audio("data:audio/wav;base64,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qJrx4KOQjahZxWbcZgztj2c49nKmkId44S71j0c8eV9yDK6uPRzx5X18eDvjvQ6yKo9ZSS6l//8elePK/Lf//IInrOF/FvDoADYAGBMGb7FtErm5MXMlmPAJQVgWta7Zx2go+8xJ0UiCb8LHHdftWyLJE0QIAIsI+UbXu67dZMjmgDGCGl1H+vpF4NSDckSIkk7Vd+sxEhBQMRU8j/12UIRhzSaUdQ+rQU5kGeFxm+hb1oh6pWWmv3uvmReDl0UnvtapVaIzo1jZbf/pD6ElLqSX+rUmOQNpJFa/r+sa4e/pBlAABoAAAAA3CUgShLdGIxsY7AUABPRrgCABdDuQ5GC7DqPQCgbbJUAoRSUj+NIEig0YfyWUho1VBBBA//uQZB4ABZx5zfMakeAAAAmwAAAAF5F3P0w9GtAAACfAAAAAwLhMDmAYWMgVEG1U0FIGCBgXBXAtfMH10000EEEEEECUBYln03TTTdNBDZopopYvrTTdNa325mImNg3TTPV9q3pmY0xoO6bv3r00y+IDGid/9aaaZTGMuj9mpu9Mpio1dXrr5HERTZSmqU36A3CumzN/9Robv/Xx4v9ijkSRSNLQhAWumap82WRSBUqXStV/YcS+XVLnSS+WLDroqArFkMEsAS+eWmrUzrO0oEmE40RlMZ5+ODIkAyKAGUwZ3mVKmcamcJnMW26MRPgUw6j+LkhyHGVGYjSUUKNpuJUQoOIAyDvEyG8S5yfK6dhZc0Tx1KI/gviKL6qvvFs1+bWtaz58uUNnryq6kt5RzOCkPWlVqVX2a/EEBUdU1KrXLf40GoiiFXK///qpoiDXrOgqDR38JB0bw7SoL+ZB9o1RCkQjQ2CBYZKd/+VJxZRRZlqSkKiws0WFxUyCwsKiMy7hUVFhIaCrNQsKkTIsLivwKKigsj8XYlwt/WKi2N4d//uQRCSAAjURNIHpMZBGYiaQPSYyAAABLAAAAAAAACWAAAAApUF/Mg+0aohSIRobBAsMlO//Kk4soosy1JSFRYWaLC4qZBYWFRGZdwqKiwkNBVmoWFSJkWFxX4FFRQWR+LsS4W/rFRb/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////VEFHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU291bmRib3kuZGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMjAwNGh0dHA6Ly93d3cuc291bmRib3kuZGUAAAAAAAAAACU=");
	snd.volume = 0.5;
    snd.play();
}

function soundKeyboard() {
	var snd = new Audio("data:audio/wav;base64,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");
	snd.volume = 0.1;
	snd.play();
}
function cleanStringParameter(str, eliminateSpaces, comment) {
	//console.log("cleanStringParameter1="+str+" "+comment);
	if(typeof str=="undefined") str="";
	if(str=="undefined") str="";
	let ret = str.replace('|','').trim();
	//console.log("cleanStringParameter ret="+ret);
	if(eliminateSpaces) {
		ret = ret.replace(/ /g,'');
		//console.log("cleanStringParameter ret2="+ret);
	}
	return ret;
}

function clearcookie() {
	console.log("clearcookie id=("+calleeID+")");
	document.cookie = "webcallid=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
	setTimeout(function() {
		if(typeof Android !== "undefined" && Android !== null &&
				typeof Android.gotoBasepage !== "undefined" && Android.gotoBasepage !== null) {
			Android.gotoBasepage();
		} else {
			window.location.reload();
		}
	},1000);
}

function enableTextChat() {
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
}

