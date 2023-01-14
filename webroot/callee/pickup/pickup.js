// WebCall Copyright 2023 timur.mobi. All rights reserved.
'use strict';
const registerButton = document.querySelector('button#register');
const statusLine = document.getElementById('status');
const idLine = document.getElementById('id');
const form = document.querySelector('form#password');
const singlebutton = false;
var calleeLink = "";
var mid = "";

window.onload = function() {
	// mid maps to mastodon user-id's of the caller and callee
	// -> calleeIdOnMastodon = tmpkeyMastodonCalleeMap[mid]
	// -> callerIdOnMastodon = tmpkeyMastodonCallerReplyMap[mid]
	mid = getUrlParams("mid");
	if(typeof mid=="undefined") {
		mid = "";
	}

	// detect callee-id from cookie
	let cookieName = "";
	if(document.cookie!="" && document.cookie.startsWith("webcallid=")) {
		cookieName = document.cookie.substring(10);
		let idxAmpasent = cookieName.indexOf("&");
		if(idxAmpasent>0) {
			cookieName = cookieName.substring(0,idxAmpasent);
		}
		cookieName = cleanStringParameter(cookieName,true);
	}

	if(mid=="") {
		// no mid -> no mastodonUserID
		onload2("",false,false,cookieName);
		return;
	}

	// mid is given
/*
	var register = getUrlParams("register");
	if(typeof register!="undefined" && register!="") {
		console.log('arg register is set',register);

		let api = apiPath+"/getmiduser?mid="+mid;
		console.log('pwForm api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			console.log('xhr.responseText',xhr.responseText);
			if(xhr.responseText=="") {
				// no Mastodon user-id exists for this mid
				console.warn('# xhr response empty for api='+api);
// TODO give client visual feedback
			} else {
				// Mastodon user-id exists for this mid
				let tok = xhr.responseText.split("|");
				let mastodonUserID = "";
				let isValidCalleeID = false;
				let isOnlineCalleeID = false;
				if(tok.length>=1) {
					mastodonUserID = tok[0]; // always a mastodon-user-id, never a calleeID
					if(tok.length>=2) {
						if(tok[1]=="true") {
							isValidCalleeID = true;
						}
						if(tok.length>=3) {
							if(tok[2]=="true") {
								isOnlineCalleeID = true;
							}
						}
					}
					// what if isOnlineCalleeID==true? in that case isValidCalleeID should also be true
					if(isValidCalleeID) {
						// switch to /callee/(id) now
						// yes, ANYBODY can resolve mid to mastodonUserID; but they still need to login
						// adv of using mid= is that we can delete the mapping after a succesful callee-login
						console.info('calleeID does already exist',mastodonUserID);
						let replaceURL = "/callee/"+mastodonUserID+"?mid="+mid+"&auto=1";
						window.location.replace(replaceURL);
						return;
					}

					// calleeID does not yet exist: offer register
					document.title = "WebCall Register";
					let titleElement = document.getElementById('title');
					if(titleElement) {
						titleElement.innerHTML = "WebCall Register";
					}
					pwForm(mastodonUserID);
				}
			}
		}, function(errString,err) {
			console.warn('# xhr error',errString,err);
		});
		return;
	}
	console.log('arg register not set');
*/

	// try to get mastodonUserID of callee, valid/registered user, currently online user
	let api = apiPath+"/getmiduser?mid="+mid;
	console.log('pwForm api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		console.log('xhr.responseText',xhr.responseText);
		if(xhr.responseText=="") {
			// no Mastodon user-id exists for this mid
			onload2("",false,false,cookieName);
		} else {
			// Mastodon user-id exists for this mid
			let tok = xhr.responseText.split("|");
			let mastodonUserID = "";
			let isValidCalleeID = false;
			let isOnlineCalleeID = false;
			if(tok.length>=1) {
				mastodonUserID = tok[0]; // this is always a mastodon-user-id, never a calleeID
				if(tok.length>=2) {
					if(tok[1]=="true") {
						isValidCalleeID = true;
					}
					if(tok.length>=3) {
						if(tok[2]=="true") {
							isOnlineCalleeID = true;
						}
					}
				}
			}
			onload2(mastodonUserID,isValidCalleeID,isOnlineCalleeID,cookieName);
		}
	}, function(errString,err) {
		console.warn('# xhr error',errString,err);
		onload2("",false,false,cookieName);
	});
}

function onload2(mastodonUserID,isValidCalleeID,isOnlineCalleeID,cookieName) {
	console.log('onload2',mid,mastodonUserID,isValidCalleeID,isOnlineCalleeID,cookieName);
	if(cookieName!="") {
		// cookieName found! it can be an 11-digit ID or a mastodonUserID
		if(cookieName.match(/^[0-9]*$/) != null && cookieName.length==11) {
			// cookieName is 11-digit numeric
			console.log('cookieName is 11-digit numeric');
			if(mastodonUserID!="") {
// TODO PROBLEM: cookieName is 11-digit and we don't know if the server maps it to mastodonUserID (from mid)
// should we fetch serverSettings for cookieName ?
//				if(serverSettings.mastodonID!="" && serverSettings.mastodonID!=mastodonUserID) {
				if(false) { // assunption
					// server does NOT map 11-digit cookieName to mastodonUserID
					console.log('# abort cookieName!=mastodonUserID');
// BUT THIS COULD BE THE !ST TIME (in which case it would be false to clear the cookie
			        document.cookie = "webcallid=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
					// TODO generate user-facing message
					return;
				}
			}
		} else {
			// cookieName is NOT 11-digit
			console.log('cookieName is NOT 11-digit numeric');
			// if mastodonUserID!="" and cookieName not= mastodonUserID: abort
			if(mastodonUserID=="") {
				console.log('mastodonUserID is empty');
			} else {
				console.log('mastodonUserID is NOT empty');
				if(cookieName!=mastodonUserID) {
					console.log('# abort cookieName!=mastodonUserID');
			        document.cookie = "webcallid=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
					// TODO generate user-facing message
					return;
				}
				console.log('cookieName is same as mastodonUserID');
			}
		}

		// switch to callee app
		let replaceURL = "/callee/"+cookieName;
		if(isOnlineCalleeID) {
			// if callee is already online, no new login will take place
			replaceURL += "?auto=1";
			if(mid!="") {
				// bc the callee is already logged in,
				// we send the caller-link to mastodon caller (and trigger all other steps) right here
// TODO maybe we should postpone this a little to allow the callee app to "show up in front" ?
				let api = apiPath+"/midcalleelogin?mid="+mid;
				ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
					console.log('xhr.responseText',xhr.responseText);
				}, function(errString,err) {
					console.warn('# xhr error',errString,err);
				});
			}
		} else {
			// callee is not currently online/logged-in
			// once login is complete, the steps above are triggered by the server
			if(mid!="") {
				// forward mid to the callee client
				replaceURL += "?mid="+mid;
			}
		}

		// if the callee app is not yet running, this will start it
// TODO but if it IS already running, does this switch to it?
//      and how does this work if the user is using the android app
		window.location.replace(replaceURL);
		return;
	}
	// cookieName is empty; this should also mean that callee is NOT currently logged in

	// offer multiple choice
	let dispMsg = "To answer the call...<br><br>";
	if(mastodonUserID!="") {
		if(isValidCalleeID) {
			// offer user to login with its existing calleeID==mastodonUserID account
			dispMsg += "- <a onclick='replaceCurrentUrl(\""+mastodonUserID+"\"); return false;'>use my Mastodon user ID: "+mastodonUserID+"</a><br><br>";
		} else {
			// offer user to register its mastodonUserID as calleeID
			// register new account tmpkeyMastodonCalleeMap[mid] as calleeID
			// we ONLY hand over (mid) to server (similar to /register, see: httpRegister() in httpOnline.go)
			// server knows that tmpkeyMastodonCalleeMap[mid] is the desired mastodon user-id
			dispMsg += "- <a onclick='pwForm(\""+mastodonUserID+"\"); return false;'>register my Mastodon user-ID as WebCall ID</a><br><br>";
		}
	}

	// offer to enter (via keyboard) a possibly existing calleeID for login
	// on submit: forward to callee-app (password will be entered there), hand over mid
	// on login, the server will use mid to send a mastodon msg to the caller, telling the call-url
	dispMsg += "- <a onclick='loginForm(); return false;'>let me enter my WebCall ID</a><br><br>";

/*
	// TODO tell server that "#(mid)" is the calleeID that belongs to mid
	// ajax: setCalleeIdTmpkey("#"+mid,mid)
	dispMsg += "- <a href=''>let me use a one-time session</a><br><br>";

	// TODO  (if we fw this to /register, mid needs to be passed through)
	dispMsg += "- <a onclick='xxx(); return false;'>create me a new WebCall-ID (11-digit)</a><br><br>";
*/

	showStatus(dispMsg + "<br><br><br>", -1);
}

function replaceCurrentUrl(mastodonUserID) {
	// user is trying to log-in as callee with an existing mastodonUserID (but no cookie, so not yet logged in?)
	// we assume the callee has to login now, so the server should trigger all this once callee online
	console.log('replaceCurrentUrl',mastodonUserID,mid);
	let replaceURL = "/callee/"+mastodonUserID;
	if(mid!="") {
		// forward mid to the callee client
		replaceURL += "?mid="+mid;
	}

	window.location.replace(replaceURL);
}


function loginForm() {
	// user is trying to log-in as callee with an entered calleeID (but no cookie, so not yet logged in?)
	showStatus("<form action='javascript:;' onsubmit='submitForm(this)' _style='max-width:450px;' id='usernamef'>"+
		"<label for='username' style='display:inline-block; _width:32px; padding-bottom:4px;'>ID:&nbsp;</label>"+
		"<input type='text' autocomplete='username' id='usernamei' name='username' value='' style='display:none;'>"+
		"<input name='username' id='username' type='text' class='formtext' autofocus required>"+
		"<span onclick='clearForm()' style='margin-left:5px; user-select:none;'>X</span>"+
		"<br>"+
		"<input type='submit' name='Submit' id='submit' value='OK' style='width:100px; margin-top:16px;'>"+
	"</form>",-1);
	// see submitForm() below
}

function submitForm(theForm) {
	// user has keyboard-entered a calleeID, now send user to /callee-app for login
	// we assume the callee has to login now, so the server should trigger all this once callee online
	var valueUsername = document.getElementById("username").value;
	console.log('submitForm valueUsername',valueUsername);

	// hand over mid to the callee app
	let replaceURL = "/callee/"+valueUsername + "?mid="+mid+"&auto=1";
	console.log('submitForm replaceURL',replaceURL);

//	window.location.replace(replaceURL); // does not allow back button (TODO which is better?)
	window.location.href = replaceURL;
}

function clearForm() {
	let userNameElement = document.getElementById("username");
	if(userNameElement) {
		userNameElement.value = "";
		userNameElement.focus();
	}
}

function pwForm(mastodonUserID) {
	// display the callee's mastodonUserID 
	// and ask for a password to register it as a new calleeID (via submitPw())
	showStatus("Username: "+mastodonUserID+"<br>"+
		"<form action='javascript:;' onsubmit='submitPw(this,\""+mastodonUserID+"\")' id='pwf'>"+
		"<label for='username' style='display:inline-block; padding-bottom:4px;'>Password:&nbsp;</label>"+
		"<input type='text' autocomplete='password' id='pwi' name='pw' value='' style='display:none;'>"+
		"<input name='username' id='pw' type='password' class='formtext' autofocus required>"+
		"<span onclick='clearForm()' style='margin-left:5px; user-select:none;'>X</span>"+
		"<br>"+
		"<input type='submit' name='Submit' id='submit' value='OK' style='width:100px; margin-top:16px;'>"+
	"</form>",-1);
}

function submitPw(theForm,mastodonUserID) {
	// use the entered password (and the mastodon user-id via mid) to register a new calleeID
	// for this we ajax(post) /registermid/(mid)
	// /registermid will do: calleeIdOnMastodon = tmpkeyMastodonCalleeMap[mid]
	// and it will register calleeIdOnMastodon with valuePw
	var valuePw = document.getElementById("pw").value;
	console.log('submitForm valuePw',valuePw);

	let api = apiPath+"/registermid/"+mid;
	if(typeof Android !== "undefined" && Android !== null) {
		if(typeof Android.getVersionName !== "undefined" && Android.getVersionName !== null) {
			api = api + "?ver="+Android.getVersionName();
		}
		if(typeof Android.webviewVersion !== "undefined" && Android.webviewVersion !== null) {
			api = api + "_" + Android.webviewVersion();
		}
	} else {
		//api = api + "&ver="+clientVersion;
	}
	if(!gentle) console.log('register via api='+api);
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		// only if we get back "OK" do we continue with:
		if(xhr.responseText=="OK") {
			// register success; we now offer the callee-link to the user
			calleeLink = window.location.href;
			// calleeLink may have ?i=906735 attached: cut it off
			let idxArg = calleeLink.indexOf("?");
			if(idxArg>=0) calleeLink = calleeLink.substring(0,idxArg);
			//if(!gentle) console.log('calleeLink1='+calleeLink);
			calleeLink = calleeLink.replace("pickup/","");
			//if(!gentle) console.log('calleeLink2='+calleeLink+" mastodonUserID="+mastodonUserID);
			calleeLink += mastodonUserID;

			calleeLink += "?auto=1";
			if(mid!="") {
				// add mid (so that caller can be notified)
				calleeLink += "&mid="+mid;
			}
			console.log("calleeLink="+calleeLink+" mid="+mid);

			// exelink() will use calleeLink
			showStatus( "Please keep ID and password in a secure place. "+
			//"We can not send you this data."+
			"<br><br>Your WebCall callee link is shown below. "+
			"It lets you receive calls and should work in any web browser. "+
			"Click to start:<br><br>"+
			"<a onclick='exelink(this.href); return false;' href='"+calleeLink+"'>"+calleeLink+"</a>",-1);
		} else {
			// register fail
			console.log('response:',xhr.responseText);
			showStatus("Sorry, it is not possible to register your ID right now. Please try again later.",-1);
		}
	}, function(errString,err) {
		console.warn('# xhr error',errString,err);
		showStatus("Error "+errString+". Registration not possible at this time. Please try again later. Thank you.<br><br>",-1);
	}, "pw="+valuePw);
}

function exelink(url) {
	console.log("exelink parent", window.location, window.parent.location);
	if(window.location !== window.parent.location) {
		// running inside an iframe -> open in a new tab
		//console.log("exelink open",calleeLink);
		window.open(calleeLink, '_blank');
	} else {
		// not running inside an iframe -> continue in the same tab
		//console.log("exelink replace",calleeLink);
		window.location.replace(calleeLink);
	}
}

