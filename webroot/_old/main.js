// WebCall online checker by timur.mobi
'use strict';
const apiPath = "/rtcsig";
const gentle = false;

window.onload = function() {
	//console.log('onload');

	checkServerMode(function(mode) {
		if(mode==0) {
			// normal mode
//			checkOnline("Answie",document.getElementById('answie'),function(){
//				checkOnline("Timur",document.getElementById('timur'),null);
//			});
//			return;

//			checkOnlineMulti(["Answie", "Timur", "Random"],
//						[document.getElementById('answie'), document.getElementById('timur'),
//						 document.getElementById('randomWaiting')],
//				function(){
//					// do nothing
//				}
//			);
		}

		if(mode==1) {
			// maintenance mode
			let navElement = document.getElementById('nav')
			let navParent = navElement.parentNode;
			navParent.removeChild(navElement);
			var msgElement = document.createElement("div");
			msgElement.style = "margin-top:15%; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; font-size:1.2em; line-height:1.5em;";
			msgElement.innerHTML = "<div>WebCall server is currently in maintenance mode.<br>Please try again a little later.</div>";
			navParent.appendChild(msgElement);
			return;
		}
	});
}

function checkServerMode(callback) {
	//console.log('checkServerMode');
	let api = apiPath+"/mode";
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

/*
function checkOnlineMulti(idArray,turnOnElementArray,callback) {
	//console.log('checkOnline',id);
	let api = apiPath+"/isonline/";
	for(var i=0; i<idArray.length; i++) {
		if(i>0) {
			api += ",";
		}
		api += idArray[i];
	}

	//if(!gentle) console.log('checkOnline',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		//if(!gentle) console.log('xhr.responseText',xhr.responseText);
		var parts = xhr.responseText.split(",");
		for(var i=0;i<parts.length;i++) {
			if(parts[i].startsWith(":")) {
				if(turnOnElementArray && turnOnElementArray[i]) {
					turnOnElementArray[i].style.display = "block";
				}
			}
		}
		if(callback) {
			callback();
		}
	}, function(errString,err) {
		console.log('xhr error',errString);
	});
}
*/

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

function submitFormDone(theForm) {
	console.log("submitFormDone...");
	var formPw = document.querySelector('textarea#comment');
	var valuePw = document.getElementById("comment").value;
	if(valuePw.length < 3) {
		formPw.focus();
		return;
	}
	var messageText = valuePw;
	console.log("submitFormDone text",messageText);
	let api = apiPath+"/message";
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		setTimeout(function() {
			document.getElementById("comment").value = "";
			alert("Your message was delivered. Thank you.");
		},800);
		console.log('submitFormDone sent');
	}, function(errString,err) {
		console.log('xhr error',errString);
	},messageText);
}

