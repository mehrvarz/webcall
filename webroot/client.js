// WebCall Copyright 2021 timur.mobi. All rights reserved.
'use strict';

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
	if(calleeLevel>0 && navigator.cookieEnabled && getCookieSupport()!=null) {
		// cookies avail, "Settings" and "Exit" allowed
		if(!gentle) console.log('menuSettingsElement on (cookies enabled)');
		if(menuSettingsElement) {
			menuSettingsElement.style.display = "block";
		}
		if(menuExit) {
			menuExit.style.display = "block";
		}
	} else {
		if(!gentle) console.log('menuSettingsElement off (cookies disabled)');
		if(menuSettingsElement) {
			menuSettingsElement.style.display = "none";
		}
		if(menuExit) {
			menuExit.style.display = "none";
		}
	}
	menuDialogElement.style.display = "block";
}




function historyBack() {
	history.back(); // will call closeResults()
}

function menuDialogClose() {
	if(!gentle) console.log('menuDialogClose');
	menuDialogElement.style.display = "none";
	mainElement.style.filter = "";
	fullScreenOverlayElement.style.display = "none";
	fullScreenOverlayElement.onclick = null;
	menuDialogOpenFlag = false;
}

var iframeWindowOpenFlag = false;
function iframeWindowOpen(url,addStyleString) {
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

	fullScreenOverlayElement.style.display = "block";
	fullScreenOverlayElement.onclick = function() {
		historyBack();
	}

	mainElement.style.filter = "blur(0.8px) brightness(60%)";

	if(!gentle) console.log('iframeWindowOpen', url);
	iframeWindowOpenFlag = true;
	let styleString = "width:90%; max-width:520px; height:98%; position:absolute; left:3.5%; top:1%; padding:10px; z-index:200; overflow-y:scroll;";
	if(url.startsWith("string:")) {
		if(addStyleString) {
			styleString += addStyleString;
		}
		iframeWindowElement.style = styleString;
		iframeWindowElement.innerHTML = url.substring(7);
	} else {
		iframeWindowElement.style = styleString;
		iframeWindowElement.innerHTML = "<iframe src='"+url+"' scrolling='yes' frameborder='no' width='100%' height='100%' allow='microphone' onload='this.contentWindow.focus()'></iframe>";
	}
}

function iframeWindowClose() {
	if(!gentle) console.log('iframeWindowClose');
	mainElement.style.filter="";
	iframeWindowElement.innerHTML = "";
	iframeWindowElement.style.display = "none";
	fullScreenOverlayElement.style.display = "none";
	fullScreenOverlayElement.onclick = null;
	iframeWindowOpenFlag = false;
}

