// WebCall Copyright 2022 timur.mobi. All rights reserved.
'use strict';
const databoxElement = document.getElementById('databox');
const calleeMode = false;

var cookieName = "";
var calleeID = "";
var callerID = "";
var contactId = "";
var contactName = "";
var callerName = "";
var formForNameOpen = false;
var formElement = null;

window.onload = function() {
	if(document.cookie!="" && document.cookie.startsWith("webcallid=")) {
		// cookie webcallid exists
		cookieName = document.cookie.substring(10);
		let idxAmpasent = cookieName.indexOf("&");
		if(idxAmpasent>0) {
			cookieName = cookieName.substring(0,idxAmpasent);
		}
		//gLog('onload cookieName='+cookieName);
	}
	if(cookieName=="") {
		// no access without cookie
		databoxElement.innerHTML = "no cookie";
		return;
	}

	calleeID = "";
	let id = getUrlParams("id");
	if(typeof id!=="undefined" && id!="") {
		calleeID = cleanStringParameter(id,true);
	}
/*
	// calleeID may be a tmpID (not the main-id) of the callee
	// but this doesn't matter bc webcall server always provides us with the data of the main-id via xhr below
	if(calleeID!=cookieName) {
		// no access with the wrong cookie
		databoxElement.innerHTML = "wrong cookie";
		return;
	}
*/

	contactId = ""; // may contain @host
	let str = getUrlParams("contactId");
	if(typeof str!=="undefined" && str!="") {
		contactId = str;
	}

	contactName = "";
	str = getUrlParams("contactName");
	if(typeof str!=="undefined" && str!==null && str!=="" && str!=="null") {
		contactName = cleanStringParameter(str,true,"c1");
	}

	callerName = "";
	str = getUrlParams("callerName");
	if(typeof str!=="undefined" && str!==null && str!=="" && str!=="null") {
		callerName = cleanStringParameter(str,true,"c1");
	}

	// NOTE: calleeID is the callbackID of the caller (but may be blank in incognito mode)
	//       this is why we are using cookieName as ID for /getcontact

	// visible page layout:
	// contactId (may contain @host)		readonly
	// contactName							editable
	// callerName							don't show
	// callerID								don't show

	gLog("onload calleeID="+calleeID + " cookieName="+cookieName + " callerID="+callerID +
		" contactId="+contactId + " contactName="+contactName + " callerName="+callerName);

	hashcounter = 1;
	window.onhashchange = hashchange;

	let api = apiPath+"/getcontact?id="+cookieName + "&contactID="+contactId;
	gLog('request /getcontact api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		var xhrresponse = xhr.responseText;
		gLog("/getcontact for cookieName="+cookieName+" xhrresponse="+xhrresponse);
		if(xhrresponse!="") {
			// format: name|prefCallbackID|myNickname
			let tok = xhrresponse.split("|");

			// only if contactName is empty -> set it to tok[0] 
			if(tok.length>0 && tok[0]!="" && contactName=="") {
				contactName = cleanStringParameter(tok[0],true);
				gLog("contactName (from /getcontact)=("+contactName+")");
			}

			/* we ignore the old tok[1] and store calleeID as the new callbackID
			if(tok.length>1 && tok[1]!="" && calleeID=="") {
				calleeID = tok[1];
				gLog("callerID (from /getcontact)=("+calleeID+")");
			}
			*/

			// only if callerName is empty -> set it to tok[2] 
			if(tok.length>2 && tok[2]!="" && callerName=="") {
				callerName = tok[2]; // nickname of caller
				gLog("callerName (from /getcontact)=("+callerName+")");
			}

			let compoundName = contactName+"|"+calleeID+"|"+callerName;
			gLog("compoundName="+compoundName);

			let displayString =	"<table>"+
				"<tr><td>Contact ID:</td><td>"+contactId+"</td></tr>"+
				"<tr><td>Contact name:&nbsp;</td><td>"+contactName+"</td></tr>"+
				"<tr><td>Your ID*:</td><td>"+calleeID+"</td></tr>"+
				"<tr><td>Your name*:</td><td>"+callerName+"</td></tr>"+
				"</table>(*for this contact)<br><br>";

			let api = apiPath+"/setcontact?id="+cookieName+"&contactID="+contactId + "&name="+compoundName;
			gLog("request /setcontact api="+api);
			ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
				gLog("xhr /setcontact OK "+xhr.responseText);
				displayString += "Contact stored"+
					"<br><br><a href='..'>Open Contacts</a>";
				databoxElement.innerHTML = displayString;
			}, function(errString,err) {
				errorAction(errString,err);
				displayString += "Failed to store contact: "+errString+
					"<br><br><a href='..'>Open Contacts</a>";
				databoxElement.innerHTML = displayString;
			});

		}
	}, errorAction);

}

function getUrlParams(param) {
	if(window.location.search!="") {
		// skip questionmark
		var query = window.location.search.substring(1);
		var parts = query.split("&");
		for (var i=0;i<parts.length;i++) {
			var seg = parts[i].split("=");
			if (seg[0] == param) {
				return seg[1];
			}
		}
	}
	return "";
}

function errorAction(errString,err) {
	console.log('xhr error',errString);
	// let user know via alert
	alert("xhr error "+errString);
}

