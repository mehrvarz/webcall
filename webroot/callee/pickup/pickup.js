// WebCall Copyright 2023 timur.mobi. All rights reserved.
'use strict';
const registerButton = document.querySelector('button#register');
const statusLine = document.getElementById('status');
const idLine = document.getElementById('id');
const form = document.querySelector('form#password');
const singlebutton = false;
var calleeLink = "";
var mid = "";
var cookieName = "";
var mastodonUserID = "";
var isValidCalleeID = false;
var isOnlineCalleeID = false;
var mappedCalleeID = "";
var wsCliMastodonID = "";
var callerID = "";

window.onload = function() {
	cookieName = "";
	mastodonUserID = "";
	isValidCalleeID = false;
	isOnlineCalleeID = false;
	mappedCalleeID = "";
	wsCliMastodonID = "";
	callerID = "";

	// get callee-id from cookie
	if(document.cookie!="" && document.cookie.startsWith("webcallid=")) {
		cookieName = document.cookie.substring(10);
		let idxAmpasent = cookieName.indexOf("&");
		if(idxAmpasent>0) {
			cookieName = cookieName.substring(0,idxAmpasent);
		}
		cookieName = cleanStringParameter(cookieName,true);
	}

	// mid maps to mastodon user-id's of the caller and callee
	// -> calleeIdOnMastodon = tmpkeyMastodonCalleeMap[mid]
	// -> callerIdOnMastodon = tmpkeyMastodonCallerReplyMap[mid]
	mid = getUrlParams("mid");
	if(typeof mid=="undefined") {
		mid = "";
	}
	if(mid=="") {
		// no mid -> no mastodonUserID
		showStatus("Data outdated<br><br><br>", -1);
		// TODO add context links (info about webcall, etc.)
		//onload2();
		return;
	}

	// mid is given
	// try to get mastodonUserID of callee, valid/registered user, currently online user
	let api = apiPath+"/getmiduser?mid="+mid;
	console.log('ajax',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		console.log('xhr.responseText',xhr.responseText);
		if(xhr.responseText=="") {
			// no Mastodon user-id exists for this mid
		} else {
			// Mastodon user-id exists for this mid
			let tok = xhr.responseText.split("|");
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
						if(tok.length>=4) {
							mappedCalleeID = tok[3]
							if(tok.length>=5) {
								wsCliMastodonID = tok[4]
								if(tok.length>=6) {
									callerID = tok[5]
								}
							}
						}
					}
				}
			}
		}
		onload2();
	}, function(errString,err) {
		console.warn('# xhr error',errString,err);
		onload2();
	});
}

function onload2() {
	// cookieName                                  = now or previously logged-in calleeID, or ""
	// mappedCalleeID                              = mastodonUserID or 11-digit ID or ""
	// wsCliMastodonID (midEntry.mastodonIdCallee) = mastodonUserID or ""
	console.log('onload2 mid cookie', mid, cookieName);
	console.log('onload2 mastodonUserID', mastodonUserID);
	console.log('onload2 flags', isValidCalleeID, isOnlineCalleeID);
	console.log('onload2 mappedCalleeID', mappedCalleeID);
	console.log('onload2 wsCliMastodonID', wsCliMastodonID);
	console.log('onload2 callerID', callerID);

	if(mastodonUserID=="") {
		showStatus("Data outdated<br><br><br>", -1);
		// TODO add context links (info about webcall, etc.)
		return;
	}

	let dispMsg = "";

	if(callerID!="") {
		dispMsg += "Incoming call ☎️ from "+callerID+"<br>";
	}

/*
	dispMsg += "Your Mastodon ID: "+mastodonUserID;
	if(wsCliMastodonID!="" && mastodonUserID!=wsCliMastodonID) {
		dispMsg += " ("+wsCliMastodonID+")";
	}
	dispMsg += "<br>";
*/

/*
	if(cookieName!="") {
		// cookieName found! it can be an 11-digit ID or a mastodonUserID
		dispMsg += "Found WebCall cookie for ID: "+cookieName+"<br>";
	}

	// DO NOT SHOW WARNING if wsCliMastodonID!="" && wsCliMastodonID==mastodonUserID
	if(wsCliMastodonID!="" && wsCliMastodonID==mastodonUserID) {
		// do not show warning (cookieName is already prepared to answer mastodonUserID
	} else
	if(mappedCalleeID!="" && cookieName!=mappedCalleeID) {
		// warn user "you may run into a cookie issue" ?
		dispMsg += "Warning: User-ID and WebCall-ID differ<br>";
	}
*/

	dispMsg += "<br>"; // visual vertical gap

	// offer multiple choice
	dispMsg += "Your WebCall identity to answer call:<br><br>";

	if(isOnlineCalleeID) {
		// the callee referenced by mid is currently online
		dispMsg += "A WebCall client ";
		if(mappedCalleeID!="") {
			dispMsg += "("+mappedCalleeID+") ";
		} else if(mastodonUserID!="") {
			dispMsg += "("+mastodonUserID+") ";
//		} else if(cookieName!="") {					// cookieName could be from a different ID
//			dispMsg += "("+cookieName+") ";
		}
		dispMsg += "is already active.<br>Incoming WebCalls will be received there.<br>";

		// callee for mid is online -> no new server-login will take place; server will NOT send caller-link
		// so we send the caller-link to mastodon-caller (and trigger all other steps) right here
		let api = apiPath+"/sendCallerLink?id="+mappedCalleeID+"&mid="+mid;
		console.log('ajax',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			console.log('xhr.responseText',xhr.responseText);
		}, function(errString,err) {
			console.warn('# xhr error',errString,err);
		});
		return;

	} else if(isValidCalleeID) {
		// mid-callee is NOT online but IS a valid webcall account
		console.log("onload2 "+mastodonUserID+" is a valid WebCall ID");
		if(mastodonUserID!="") {
			// mastodonUserID is NOT currently online/logged-in - offer a link to start it
			// once login is complete, server will send caller-link to mastodon-caller, etc.
			let replaceURL = "/callee/"+mastodonUserID;
			if(mid!="") {
				// forward mid to the callee client
				replaceURL += "?mid="+mid;
			}
			if(mappedCalleeID!="") {
				dispMsg += "➡️ <a href='"+replaceURL+"'>"+mastodonUserID+"</a> ("+mappedCalleeID+")<br><br>";
			} else {
				dispMsg += "➡️ <a href='"+replaceURL+"'>"+mastodonUserID+"</a> (user ID)<br><br>";
			}
		} else if(mappedCalleeID!="") {
			// mappedCalleeID is NOT currently online/logged-in - offer a link to start it
			// once login is complete, server will send caller-link to mastodon-caller, etc.
			let replaceURL = "/callee/"+mappedCalleeID;
			if(mid!="") {
				// forward mid to the callee client
				replaceURL += "?mid="+mid;
			}
			dispMsg += "➡️ <a href='"+replaceURL+"'>"+mappedCalleeID+"</a> (mapped ID)<br><br>";
		}
	} else {
		// not isValidCalleeID
		// offer user to register mastodonUserID as calleeID
		// register new account tmpkeyMastodonCalleeMap[mid] as calleeID
		// we ONLY hand over (mid) to server (similar to /register, see: httpRegister() in httpOnline.go)
		// server knows that tmpkeyMastodonCalleeMap[mid] is the desired mastodon user-id
		dispMsg += "➡️ register new ID: <a onclick='pwForm(\""+mastodonUserID+"\"); return false;'>"+mastodonUserID+"</a><br><br>";
	}

	if(cookieName!="") {
		if(mappedCalleeID==cookieName) {
			// don't repeat
			//dispMsg += "➡️ <a onclick='startCallee("+cookieName+"); return false;'>"+cookieName+"</a><br><br>";
		} else {
			dispMsg += "➡️ <a onclick='startCallee("+cookieName+"); return false;'>"+cookieName+"</a> (cookie)<br><br>";
		}
	}

//	if(cookieName!="") {
		// no calleeID stored in cookie
		// offer user to enter (via keyboard) a possibly existing calleeID for login
		// on submit: forward to callee-app (password will be entered there), hand over mid
		// on login, the server will use mid to send a mastodon msg to the caller, telling the call-url
		dispMsg += "➡️ enter ID: <a onclick='loginForm(); return false;'>[Input form]</a><br><br>";
//	}

/*
// TODO one-time session: tell server that "#(mid)" is the calleeID that belongs to mid
	// ajax: setCalleeIdTmpkey("#"+mid,mid)
	dispMsg += "&nbsp; <a href=''>let me use a one-time session</a><br><br>";
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

//	window.location.replace(replaceURL);
	exelink(replaceURL);
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
	startCallee(valueUsername);
}

function startCallee(valueUsername) {
	// we need to know if valueUsername (for instance cookieName) is online/valid
	// why? bc opening this callee can cause "already logged in" if it is already logged in
	// we need to do an ajax to find out. problem: we must prevent this api from being misused
	let isOnline = false;
	if(valueUsername==mastodonUserID && isOnlineCalleeID) {
		isOnline = true;
		startCallee2(valueUsername,isOnline);
	} else {
		// do ajax to find out if valueUsername is online
		// we attach a valid mid, so the server can verify we are a valid client
		let api = apiPath+"/getonline?id="+valueUsername+"&mid="+mid;
		console.log('ajax',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			console.log('xhr.responseText',xhr.responseText);
			if(xhr.responseText=="") {
				// no Mastodon user-id exists for this mid
			} else {
				startCallee2(valueUsername,xhr.responseText=="true");
			}
		});
	}
}


function startCallee2(valueUsername,isOnline) {
	console.log('startCallee2 valueUsername/online',valueUsername,isOnline);
	if(isOnline) {
		showStatus("Your WebCall app is online (ID "+valueUsername+").<br><br>"+
			"To receive incoming calls, switch to the running app.<br><br>"+
			"This tab can be closed now.<br>", -1);
		// send caller link
		// callee for mid is online -> no new server-login will take place; server will NOT send caller-link
		// so we send the caller-link to mastodon-caller (and trigger all other steps) right here
		let api = apiPath+"/sendCallerLink?id="+valueUsername+"&mid="+mid;
		console.log('ajax',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			console.log('xhr.responseText',xhr.responseText);
		}, function(errString,err) {
			console.warn('# xhr error',errString,err);
		});
		return;
	}

	let replaceURL = "/callee/"+valueUsername + "?mid="+mid+"&auto=1";
	console.log('startCallee2 replaceURL',replaceURL);
	exelink(replaceURL);

// TODO  how does this work if the user is using the android app?
}

function clearForm() {
	let userNameElement = document.getElementById("username");
	if(userNameElement) {
		userNameElement.value = "";
		userNameElement.focus();
	}
}

function pwForm(mastodonUserID) {
	// let user register their mastodonUserID as calleeID
	// show the mastodonUserID and ask for a password to register it as a new calleeID (via submitPw())
	showStatus("Username: "+mastodonUserID+"<br>"+
		"<form action='javascript:;' onsubmit='submitPw(this,\""+mastodonUserID+"\")' id='pwf'>"+
		"<label for='username' style='display:inline-block; padding-bottom:4px;'>Password:&nbsp;</label>"+
		"<input type='text' autocomplete='password' id='pwi' name='pw' value='' style='display:none;'>"+
		"<input name='username' id='pw' type='password' autocomplete='current-password' class='formtext' autofocus required>"+
		"<span onclick='clearForm()' style='margin-left:5px; user-select:none;'>X</span>"+
		"<br>"+
		"<input type='submit' name='Submit' id='submit' value='OK' style='width:100px; margin-top:16px;'>"+
	"</form>",-1);
}

function submitPw(theForm,mastodonUserID) {
	// cont. letting user register their mastodonUserID as calleeID
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
	if(!gentle) console.log('ajax',api);
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
			"<a onclick='exelink("+calleeLink+"); return false;' href='"+calleeLink+"'>"+calleeLink+"</a>",-1);
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
	// exelink(url) is used so we can do window.location or window.open(new-tab)
	console.log("exelink parent", window.location, window.parent.location);
	if(window.location !== window.parent.location) {
		// running inside an iframe -> open in a new tab
		//console.log("exelink open",calleeLink);
		window.open(url, '_blank');
	} else {
		// not running inside an iframe -> continue in the same tab
		//console.log("exelink replace",calleeLink);
//		window.location.replace(url); // does not allow back button (TODO which is better?)
		window.location.href = url;   // allows back button
	}
}






/*
		if(cookieName.match(/^[0-9]*$/) != null && cookieName.length==11) {
			// cookieName is 11-digit
			console.log('cookieName is 11-digit');
			if(mastodonUserID!="") {
				// the request comes from a valid mastodonUserID
				if(mastodonUserID==wsCliMastodonID) {
					console.log('mastodonUserID==wsCliMastodonID');
					// server maps cookieName (11-digit) to requesting mastodonUserID
				} else {
					// server does NOT map 11-digit cookieName to requesting mastodonUserID
					// it makes no sense to switch to callee
					console.log('# abort! mastodonUserID!=wsCliMastodonID');
// BUT THIS COULD BE THE 1ST TIME (in which case it would be wrong to clear the cookie?)
			        document.cookie = "webcallid=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
// generate user-facing message
					return;
				}
			}
		} else {
			// cookieName is NOT 11-digit
			console.log('cookieName is NOT 11-digit');
			// if mastodonUserID!="" and cookieName not= mastodonUserID: abort
			if(mastodonUserID=="") {
				console.log('mastodonUserID is empty');
			} else {
				console.log('mastodonUserID is NOT empty');
				if(cookieName!=mastodonUserID) {
					// it makes no sense to switch to callee
					console.log('# abort! cookieName!=mastodonUserID');
			        document.cookie = "webcallid=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
// generate user-facing message
					return;
				}
				console.log('cookieName==mastodonUserID');
			}
		}
*/

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
// give client visual feedback
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

