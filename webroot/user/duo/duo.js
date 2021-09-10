// WebCall Duo starter client by timur.mobi
'use strict';
const statusLine = document.getElementById('status');
const form = document.querySelector('form#mnumber');
const formMnumber = document.querySelector('input#mnumberval');

window.onload = function() {
	showStatus("Two parties can create an audio-link between their browsers in order to have a private conversation (have a phone call) by docking on with the same session number. This number must be 6 to 9 digits long. You can use the generated number or change it if you like.",-1);
	form.style.display = "block";
	randomNumber();
}

function clearForm() {
	document.getElementById("mnumberval").value = "";
	setTimeout(function() {
		formMnumber.focus();
	},400);
}

function randomNumber() {
	document.getElementById("mnumberval").value = "";
	setTimeout(function() {
		let randNr = Math.floor(Math.random() * 999999999);
		// make sure !randNr is not used currently
		let api = apiPath+"online?id=!"+randNr;
		if(!gentle) console.log('check online',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			if(!gentle) console.log('xhr.responseText',xhr.responseText);
			if(xhr.responseText=="unknown") {
				document.getElementById("mnumberval").value = randNr;
				setTimeout(function() {
					formMnumber.focus();
				},100);
			} else {
				randomNumber();
			}
		}, errorAction);
	},300);
}

function submitForm(theForm) {
	var valueMnumber = document.getElementById("mnumberval").value;
	if(valueMnumber.length < 6) {
		showStatus("Your connection number must be at least six digits long.",-1);
		return;
	}
	window.location.replace("/callee/!"+valueMnumber);
}

function errorAction(errString,err) {
	console.log('xhr error',errString);
	showStatus('xhr error '+errString,-1);
}

var xhrTimeout = 50000;
function ajaxFetch(xhr, type, apiPath, processData, errorFkt, postData) {
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
	if(!gentle) console.log('xhr send',apiPath);
	xhr.open(type, apiPath, true);
	xhr.setRequestHeader("Content-type", "text/plain; charset=utf-8");
	if(postData) {
		xhr.send(postData);
	} else {
		xhr.send();
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

