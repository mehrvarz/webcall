// WebCall Copyright 2023 timur.mobi. All rights reserved.
'use strict';
const form = document.querySelector('form#settings');
const formPw = document.querySelector('input#nickname');
//const webpush1button = document.getElementById("webpush1but");
//const webpush2button = document.getElementById("webpush2but");
//const webpush1subscrElement = document.getElementById("webpush1subscr");
//const webpush2subscrElement = document.getElementById("webpush2subscr");
//const webpush1uaElement = document.getElementById("webpush1ua");
//const webpush2uaElement = document.getElementById("webpush2ua");
var calleeID = "";
var calleeLink = "";
var vapidPublicKey = ""
var xhrTwidActive = false;
var calleeVersion = "";

window.onload = function() {
	let id = getUrlParams("id");
	if(typeof id!=="undefined" && id!="") {
		calleeID = id;
	}
	let ver = getUrlParams("ver");
	if(typeof ver!=="undefined" && ver!="") {
		calleeVersion = ver;
	}
	if(!gentle) console.log("calleeID="+calleeID);
	// XHR to get current settings; server will use the cookie to authenticate us
	requestSettings();
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
	}
}

function requestSettings() {
	let api = apiPath+"/getsettings?id="+calleeID;
	if(!gentle) console.log('request getsettings api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		//if(!gentle) console.log('xhr.responseText',xhr.responseText);
		if(xhr.responseText=="") {
			console.log('/getsettings failed for '+calleeID);
			// create user visible error message
			let container = document.getElementById("container");
			if(container) {
				var aDivElement = document.createElement("div");
				aDivElement.innerHTML = "Failed to access settings. "+
					"This could be a cookie issue, or due to access of multiple users.";
				container.appendChild(aDivElement);
			}
			return;
		}
		prepareSettings(xhr.responseText);
	}, errorAction);
}

var serverSettings = null;
function prepareSettings(xhrresponse) {
	//console.log('xhrresponse',xhrresponse);
	if(xhrresponse=="") {
		serverSettings = null;
		return;
	}

	// json parse xhrresponse
	serverSettings = JSON.parse(xhrresponse);
	if(typeof serverSettings.vapidPublicKey!=="undefined") {
		if(!gentle) console.log('serverSettings.vapidPublicKey',serverSettings.vapidPublicKey);
		vapidPublicKey = serverSettings.vapidPublicKey
	}

	document.getElementById("madiv").style.display = "none";
	if(typeof serverSettings.mastodonID!=="undefined" && serverSettings.mastodonID!="") {
		console.log('serverSettings.mastodonID',serverSettings.mastodonID);
		document.getElementById("madiv").style.display = "block";

		if(serverSettings.mastodonID!=calleeID) {
			document.getElementById("maid").innerHTML = "Mastodon ID: <span style='color:#bff;font-weight:400;'>"+serverSettings.mastodonID+"</span>";
		}

		let tootOnCallCheckbox = document.getElementById("tootOnCall");
		let skipUserSendImmediatelyCheckbox = document.getElementById("skipUserSendImmediately");
		if(typeof serverSettings.tootOnCall!=="undefined") {
			if(!gentle) console.log('serverSettings.tootOnCall',serverSettings.tootOnCall);
			if(serverSettings.tootOnCall=="true") {
				tootOnCallCheckbox.checked = true;
			} else {
				tootOnCallCheckbox.checked = false;
			}

			tootOnCallCheckbox.addEventListener('change', function() {
				if(this.checked) {
				} else {
					skipUserSendImmediatelyCheckbox.checked = false;
				}
			});
		}
		if(typeof serverSettings.askCallerBeforeNotify!=="undefined") {
			if(!gentle) console.log('serverSettings.askCallerBeforeNotify',
				serverSettings.askCallerBeforeNotify);
			if(skipUserSendImmediatelyCheckbox) {
				if(serverSettings.askCallerBeforeNotify=="true") {
					skipUserSendImmediatelyCheckbox.checked = false;
				} else {
					skipUserSendImmediatelyCheckbox.checked = true;
				}
			}
		}
	}

	if(typeof serverSettings.nickname!=="undefined") {
		if(!gentle) console.log('serverSettings.nickname',serverSettings.nickname);
		document.getElementById("nickname").value = serverSettings.nickname;
	}

	if(typeof serverSettings.storeContacts!=="undefined") {
		if(!gentle) console.log('serverSettings.storeContacts',serverSettings.storeContacts);
		if(serverSettings.storeContacts=="true") {
			document.getElementById("storeContacts").checked = true;
		} else {
			document.getElementById("storeContacts").checked = false;
		}
	}
	if(typeof serverSettings.storeMissedCalls!=="undefined") {
		if(!gentle) console.log('serverSettings.storeMissedCalls',serverSettings.storeMissedCalls);
		if(serverSettings.storeMissedCalls=="true") {
			document.getElementById("storeMissedCalls").checked = true;
		} else {
			document.getElementById("storeMissedCalls").checked = false;
		}
	}

	/*
	if(typeof serverSettings.webPushSubscription1!=="undefined") {
		//if(!gentle) console.log('serverSettings.webPushSubscription1',serverSettings.webPushSubscription1);
		if(serverSettings.webPushSubscription1=="") {
			webpush1button.innerHTML = "Subscribe";
		} else {
			webpush1button.innerHTML = "Unsubscribe";
			let subscriptionObj = JSON.parse(serverSettings.webPushSubscription1);
			//console.log('subscription',subscriptionObj);
			if(subscriptionObj && subscriptionObj.endpoint) {
				if(subscriptionObj.endpoint.length>50) {
					webpush1subscrElement.innerHTML = subscriptionObj.endpoint.substring(0,50)+"...";
				} else {
					webpush1subscrElement.innerHTML = subscriptionObj.endpoint;
				}
			}
		}
	}
	if(typeof serverSettings.webPushUA1!=="undefined") {
		if(serverSettings.webPushUA1==navigator.userAgent) {
			webpush1uaElement.innerHTML = serverSettings.webPushUA1 + " (THIS DEVICE)";
		} else {
			webpush1uaElement.innerHTML = serverSettings.webPushUA1;
		}
	}
	if(typeof serverSettings.webPushSubscription2!=="undefined") {
		//if(!gentle) console.log('serverSettings.webPushSubscription2',serverSettings.webPushSubscription2);
		if(serverSettings.webPushSubscription2=="") {
			webpush2button.innerHTML = "Subscribe";
		} else {
			webpush2button.innerHTML = "Unsubscribe";
			let subscriptionObj = JSON.parse(serverSettings.webPushSubscription2);
			//console.log('subscription',subscriptionObj);
			if(subscriptionObj && subscriptionObj.endpoint) {
				if(subscriptionObj.endpoint.length>50) {
					webpush2subscrElement.innerHTML = subscriptionObj.endpoint.substring(0,50)+"...";
				} else {
					webpush2subscrElement.innerHTML = subscriptionObj.endpoint;
				}
			}
		}
	}
	if(typeof serverSettings.webPushUA2!=="undefined") {
		if(serverSettings.webPushUA2==navigator.userAgent) {
			webpush2uaElement.innerHTML = serverSettings.webPushUA2 + " (THIS DEVICE)";
		} else {
			webpush2uaElement.innerHTML = serverSettings.webPushUA2;
		}
	}

	webpush1button.onclick = function() {
		if(serverSettings.webPushSubscription1=="") {
			webPushSubscribe(1);
		} else {
			console.log('unsubscribe webPushSubscription1');
			serverSettings.webPushSubscription1 = "";
			webpush1subscrElement.innerHTML = "";
			serverSettings.webPushUA1 = "";
			webpush1uaElement.innerHTML = "";
			webpush1button.innerHTML = "Subscribe";
			submitForm(false);
		}
	}

	webpush2button.onclick = function() {
		if(serverSettings.webPushSubscription2=="") {
			webPushSubscribe(2);
		} else {
			console.log('unsubscribe webPushSubscription2');
			serverSettings.webPushSubscription2 = "";
			webpush2subscrElement.innerHTML = "";
			serverSettings.webPushUA2 = "";
			webpush2uaElement.innerHTML = "";
			webpush2button.innerHTML = "Subscribe";
			submitForm(false);
		}
	}
	*/

	console.log("clientVer="+clientVersion+" calleeVer="+calleeVersion);
	let displayVersion = "";
	/*
	if(typeof serverSettings.serverVersion!=="undefined") {
		if(!gentle) console.log('serverSettings.serverVersion',serverSettings.serverVersion);
		serverVersion = serverSettings.serverVersion;
		//document.getElementById("verstring").innerHTML = "WebCall Server: "+serverVersion;
		displayVersion = "WebCall server: "+serverVersion+"<br>";
	}
	*/
	if(calleeVersion=="") {
		calleeVersion="?"
	}
	if(calleeVersion!=clientVersion) {
		displayVersion = "Current version: "+calleeVersion+"<br>"+
		                 "Online version: "+clientVersion+"<br>"+
		                 "To update: <a href='/webcall/more/#updatecallee' target='_blank'>Clear cache + reload</a>";
	} else {
		displayVersion = "WebCall v"+clientVersion;
	}
	document.getElementById("verstring").innerHTML = displayVersion;

	form.style.display = "block";
	setTimeout(function() {
		formPw.focus();
	},400);
	// data will be stored in submitForm()
}

/*
function webPushSubscribe(deviceNumber) {
	if(!('serviceWorker' in navigator)) {
		console.warn("no serviceWorker in navigator");
		alert("WebPush fail: no serviceWorker support");
		return
	}

	if(!('PushManager' in window)) {
		console.warn("no pushManager in window");
		alert("WebPush fail: no pushManager support");
		return
	}

//	console.log("webPushSubscribe device=%d -> serviceWorker.register...",deviceNumber);
//	let ret = navigator.serviceWorker.register('service-worker.js');
//	// get access to the registration (and registration.pushManager) object.
//	console.log("webPushSubscribe serviceWorker.ready...");
//	navigator.serviceWorker.ready
//	.then(function(registration) {
//		console.log("webPushSubscribe serviceWorker.register =",ret);
		let registration = parent.pushRegistration
		console.log("webPushSubscribe registration =",registration);
		console.log("webPushSubscribe pushManager.getSubscription()");
		registration.pushManager.getSubscription()
		.then(pushSubscription => {
			console.log("webPushSubscribe scope =",registration.scope);
			if(!pushSubscription){
				//the device is not subscribed
				console.log("pushSubscription must be invoked...");
				subscribe(registration);
			} else {
				console.log("pushSubscription exists already");
				//check if user was subscribed with a different key
				let json = pushSubscription.toJSON();
				console.log("pushSubscription exists json",json);
				let public_key = json.keys.p256dh;
				console.log("pushSubscription exists public_key",public_key);
				
				if(public_key != vapidPublicKey){
					console.log("pushSubscription old public_key != current key");
					pushSubscription.unsubscribe().then(successful => {
						// You've successfully unsubscribed
						console.log("pushSubscription create a new...");
						subscribe(registration);
					}).catch(e => {
						// Unsubscription failed
						console.log("unsubscription failed",e);
						alert("Unsubscription of old pushSubscription failed\n"+e);
					})
				} else {
					console.log("pushSubscription old public_key == current key");
					deliverSubscription(pushSubscription);
				}
			}
		}).catch(err => {
			// after pushManager.getSubscription()
			// fennec shows: Uncaught (in promise) DOMException: Error retrieving push subscription.
			// FF 90 Nightly: does the same, but it takes a little while
			// this means that GCM is not enabled on Android
			console.log("webPushSubscribe getSubscription err",err);
			alert("webPushSubscribe getSubscription error\n"+err);
		});
//	}).catch(err => {
//		console.log("webPushSubscribe getSubscription err",err);
//		alert("webPushSubscribe getSubscription error\n"+err);
//	});

	let deliverSubscription = function(subscr) {
		// subscr will be used for webpush.SendNotification()
		let webPushSubscriptionChanged = false;
		if(deviceNumber==1) {
			console.log("webPushSubscribe 1 deliverSubscription",subscr);
			let newSubscr = JSON.stringify(subscr);
			if(newSubscr!="" && serverSettings.webPushSubscription1!=newSubscr) {
				serverSettings.webPushSubscription1 = newSubscr;
				if(subscr && subscr.endpoint) {
					if(subscr.endpoint.length>50) {
						webpush1subscrElement.innerHTML = subscr.endpoint.substr(0,50)+"...";
					} else {
						webpush1subscrElement.innerHTML = subscr.endpoint;
					}
					if(serverSettings.webPushUA1==navigator.userAgent) {
						webpush1uaElement.innerHTML = serverSettings.webPushUA1 + " (THIS DEVICE)";
					} else {
						webpush1uaElement.innerHTML = serverSettings.webPushUA1;
					}
					serverSettings.webPushUA1 = navigator.userAgent;
					webpush1button.innerHTML = "Unsubscribe";
				} else {
					// this should never happen
					webpush1subscrElement.innerHTML = "";
					webpush1uaElement.innerHTML = "";
					serverSettings.webPushUA1 = "";
					webpush1button.innerHTML = "Subscribe";
				}
				webPushSubscriptionChanged = true;
			}
		} else {
			console.log("webPushSubscribe 2 deliverSubscription",subscr);
			let newSubscr = JSON.stringify(subscr);
			if(newSubscr!="" && serverSettings.webPushSubscription2!=newSubscr) {
				serverSettings.webPushSubscription2 = newSubscr;
				if(subscr && subscr.endpoint) {
					if(subscr.endpoint.length>50) {
						webpush2subscrElement.innerHTML = subscr.endpoint.substr(0,50)+"...";
					} else {
						webpush2subscrElement.innerHTML = subscr.endpoint;
					}
					if(serverSettings.webPushUA2==navigator.userAgent) {
						webpush2uaElement.innerHTML = serverSettings.webPushUA2 + " (THIS DEVICE)";
					} else {
						webpush2uaElement.innerHTML = serverSettings.webPushUA2;
					}
					serverSettings.webPushUA2 = navigator.userAgent;
					webpush2button.innerHTML = "Unsubscribe";
				} else {
					// this should never happen
					webpush2subscrElement.innerHTML = "";
					webpush2uaElement.innerHTML = "";
					serverSettings.webPushUA2 = "";
					webpush2button.innerHTML = "Subscribe";
				}
				webPushSubscriptionChanged = true;
			}
		}
		if(webPushSubscriptionChanged) {
			// auto store (but don't close settings)
			submitForm(false);
		}
	}

	let urlBase64ToUint8Array = function(base64String) {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding)
			.replace(/\-/g, '+')
			.replace(/_/g, '/');
		const rawData = window.atob(base64);
		return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
	}

	let subscribe = function(registration) {
		console.log("registration.pushManager.subscribe()");
		// TODO in ungoo-chromium, this is often the last line logged
		// this means: no success - and there is no error msg
		// we need to build a timeout functionality
		let gotResponse = 0;
		setTimeout(function() {
			if(gotResponse==0) {
				alert("Got no response from device.\nWeb push may not be supported.");
			}
		},2000);
		registration.pushManager.subscribe({
		    userVisibleOnly: true,
		    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
		})
		.then(function(subscription) {
			gotResponse = 1;
			console.log("function(subscription)",subscription);
			deliverSubscription(subscription);
		})
		.catch(function(err) {
			gotResponse = 2;
			console.log("	",err);
			alert("webPushSubscribe subscribe error\n"+err);
		});
	}
}
*/

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
	// cross-browser compatible approach to bypassing the cache
	if(apiPath.indexOf("?")>=0) {
		apiPath += "&_="+new Date().getTime();
	} else {
		apiPath += "?_="+new Date().getTime();
	}
	if(!gentle) console.log('xhr send',apiPath);
	xhr.open(type, apiPath, true);
	xhr.setRequestHeader("Content-type", "text/plain; charset=utf-8");
	if(postData) {
		if(!gentle) console.log('posting',postData);
		xhr.send(postData);
	} else {
		xhr.send();
	}
}

function submitForm(autoclose) {
	var store = function() {
		// we use encodeURI to encode the subscr-strings bc these strings are themselves json 
		// and cannot just be packaged inside json
		var newSettings = 
		   '{"nickname":"'+document.getElementById("nickname").value.trim()+'",'+
			'"storeContacts":"'+document.getElementById("storeContacts").checked+'",'+
			'"storeMissedCalls":"'+document.getElementById("storeMissedCalls").checked+'",'+
			'"tootOnCall":"'+document.getElementById("tootOnCall").checked+'",'+
			'"askCallerBeforeNotify":"'+!(document.getElementById("skipUserSendImmediately").checked)+'"'+
//			'"webPushSubscription1":"'+encodeURI(serverSettings.webPushSubscription1)+'",'+
//			'"webPushUA1":"'+encodeURI(serverSettings.webPushUA1)+'",'+
//			'"webPushSubscription2":"'+encodeURI(serverSettings.webPushSubscription2)+'",'+
//			'"webPushUA2":"'+encodeURI(serverSettings.webPushUA2)+'"'+
		   '}';
		if(!gentle) console.log('submitForm newSettings',newSettings);

		let api = apiPath+"/setsettings?id="+calleeID;
		if(!gentle) console.log('request setsettings api='+api);
		ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
			if(!gentle) console.log('data posted',newSettings);
			if(autoclose) {
				exitPage();
			}
		}, function(errString,err) {
			errorAction(errString,err);
			if(autoclose) {
				exitPage();
			}
		}, newSettings);
	}

	store();
}

function clearForm(idx) {
	if(idx==0)
		document.getElementById("nickname").value = "";
	formPw.focus();
}

function errorAction(errString,err) {
	console.log('xhr error',errString);
	alert("xhr error\n"+errString);
}

function exitPage() {
	if(!gentle) console.log('exitPage');
	if(parent!=null && parent.iframeWindowClose) {
		if(!gentle) console.log('history.back');
		history.back();
	}
}

document.onkeydown = function(evt) {
	evt = evt || window.event;
	var isEscape = false;
	if("key" in evt) {
		isEscape = (evt.key === "Escape" || evt.key === "Esc");
	} else {
		isEscape = (evt.keyCode === 27);
	}
	if(isEscape) {
		if(!gentle) console.log('settings: esc key');
		exitPage();
	}
};

