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
	// calleeID may be a tmpID (not the main-id) of the callee
	// but this doesn't matter bc webcall server always provides us with the data of the main-id via xhr below
	if(calleeID==cookieName) {
		// no access with the wrong cookie
		databoxElement.innerHTML = "wrong cookie";
		return;
	}

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

	gLog("onload calleeID="+calleeID+" callerID="+callerID+" contactId="+contactId+" contactName="+contactName+
		" callerName="+callerName);

	hashcounter = 1;
	window.onhashchange = hashchange;

// page layout:
// contactId (may contain @host)		readonly
// contactName							editable
// callerName							don't show
// callerID								don't show

/*
	document.onkeydown = function(evt) {
		//gLog('contacts onload onkeydown event');
		evt = evt || window.event;
		var isEscape = false;
		if("key" in evt) {
			isEscape = (evt.key === "Escape" || evt.key === "Esc");
		} else {
			isEscape = (evt.keyCode === 27);
		}
		if(isEscape) {
			if(formForNameOpen) {
				//gLog('contacts.js esc key (formForNameOpen)');
				let parentElement = formElement.parentNode;
				parentElement.removeChild(formElement);
				formElement = null;
				formForNameOpen = false;
			} else {
				//gLog('contacts.js esc key -> exit');
				exitPage();
			}
		} else {
			//gLog('contacts.js no esc key');
		}
	};

	// XHR for current settings; server will use the cookie to authenticate us
	requestData();
*/

	let api = apiPath+"/getcontact?id="+calleeID + "&contactID="+contactId;
	console.log('request /getcontact api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		var xhrresponse = xhr.responseText;
		console.log("/getcontact for calleeID="+calleeID+" xhrresponse="+xhrresponse);
		if(xhrresponse!="") {
			// format: name|prefCallbackID|myNickname
			let tok = xhrresponse.split("|");

			if(tok.length>0 && tok[0]!="" && contactName=="") {
				contactName = cleanStringParameter(tok[0],true);
				console.log("contactName (from /getcontact)=("+contactName+")");
			}

			if(tok.length>1 && tok[1]!="" && calleeID=="") {
				calleeID = tok[1];
				console.log("callerID (from /getcontact)=("+calleeID+")");
			}

			if(tok.length>2 && tok[2]!="" && callerName=="") {
				// we prefer this over getUrlParams and settings
				callerName = tok[2]; // nickname of caller
				console.log("callerName (from /getcontact)=("+callerName+")");
			}

			let compoundName = contactName+"|"+calleeID+"|"+callerName;
			console.log("compoundName="+compoundName);

			let displayString =
				"ID: "+contactId+"<br>"+
				"Nickname: "+contactName+"<br><br>"+
				"Your nickname: "+callerName+"<br>"+
				"Your callback ID: "+calleeID;

			let api = apiPath+"/setcontact?id="+calleeID+"&contactID="+contactId + "&name="+compoundName;
			console.log("request /setcontact api="+api);
			ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
				console.log("xhr /setcontact OK "+xhr.responseText);
				displayString += "<br><br>Contact has been stored";
				databoxElement.innerHTML = displayString;
			}, function(errString,err) {
				errorAction(errString,err);
				displayString += "<br><br>Failed to store contact";
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
	gLog('xhr error',errString);
	// let user know via alert
	alert("xhr error "+errString);
}


/*
function requestData() {
	let api = apiPath+"/getcontacts?id="+calleeID;
	gLog('request getcontacts api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		processContacts(xhr.responseText);
	}, errorAction);
}

var obj = null;
function processContacts(xhrresponse) {
	// response from /getcontacts
	gLog("xhrresponse ("+xhrresponse+")");
	if(xhrresponse=="") {
		return;
	}
	let mainLink = window.location.href;
	let idx = mainLink.indexOf("/callee/");
	if(idx>0) {
		mainLink = mainLink.substring(0,idx) + "/user/";
	}

	// parse json response of xhr /getcontacts
	obj = JSON.parse(xhrresponse);
	//gLog('xhrresponse obj',obj);

	// in order to sort the json data we convert it to an array
	let entries = Object.entries(obj);
	// if there is no name, we use the id as name
	for(let entry of entries) {
		// entry[0]=id, entry[1]=name
		if(entry[1]=="") { entry[1]=entry[0]; }
	}
	// now sort
	entries.sort(function(a,b) {
		let aName = a[1].toLowerCase();
		let bName = b[1].toLowerCase();
		if(aName < bName) {
			return -1
		} else if(aName > bName) {
			return 1;
		}
		return 0;
	});
	//gLog('sorted results',entries);

	// create display table
	let remoteCallerIdMaxChar = 16;
	if(window.innerWidth>360) {
		remoteCallerIdMaxChar += Math.floor((window.innerWidth-360)/26);
	}
	//gLog("remoteCallerIdMaxChar="+remoteCallerIdMaxChar);
	var dataBoxContent = "<table style='width:100%; border-collapse:separate; line-height:1.7em;'>"
	dataBoxContent += "<tr style='color:#7c0;font-weight:600;user-select:none;'><td>Name (edit)</td><td>ID (call)</td><td></td></tr>";
	for(let entry of entries) {
		let id = entry[0]; // just a local id, or id@host
		let entry1 = entry[1];

		let tok = entry1.split("|");
		let name = "none";
		if(tok.length>0) name = tok[0]
		let prefCallbackId = "";
		if(tok.length>1) prefCallbackId = tok[1]
		let ourNickname = "";
		if(tok.length>2) ourNickname = tok[2]

		// left column: Name (edit)
		dataBoxContent += "<tr><td><a onclick='edit(this,event,\""+id+"\",\""+name+"\")'>"+name+"</a></td>";

		// right column: ID (call)
		let idxAt = id.indexOf("@");
		if(idxAt>=0) {
			// right column: remote user
			// if we go straight to a new tab for the remote-host caller-widget (as we do here),
			// the caller will have no chance to select a callerId
			// so instead, we open dial-ID for remote host
			let callerHost = id.substring(idxAt+1);
			let idOnly = id.substring(0,idxAt); // without callerHost
			let idDisplay = id;
			//gLog("id="+id+" idDisplay="+idDisplay+" callerHost="+callerHost+" location.host="+location.host);
			if(callerHost==location.host) {
				idDisplay = idOnly;
			}
			if(idDisplay.length > remoteCallerIdMaxChar+2) {
				idDisplay = idDisplay.substring(0,remoteCallerIdMaxChar)+"..";
				//gLog("idDisplay="+idDisplay+" "+idDisplay.length);
			}

			let args = "?callerId=select&targetHost="+callerHost;
			if(ourNickname!="") {
				if(args=="") args = "?callerName="+ourNickname;
				else args += "&callerName="+ourNickname;
			}
			if(dialsounds=="false") {
				if(args=="") args = "?ds=false";
				else args += "&ds=false";
			}
			// by straight opening a href we replace the content in the contacts iframe
			dataBoxContent += "<td><a href='" + mainLink + idOnly + args + "'>"+idDisplay+"</a></td>";

		} else {
			// right column: local user (this will open dial-id in an iframe)
			let args = "";
			if(prefCallbackId!="") args = "?callerId="+prefCallbackId;
			if(ourNickname!="") {
				if(args=="") args = "?callerName="+ourNickname;
				else args += "&callerName="+ourNickname;
			}
			if(dialsounds=="false") {
				if(args=="") args = "?ds=false";
				else args += "&ds=false";
			}

			// by straight opening a href we replace the content in the contacts iframe
			dataBoxContent += "<td><a href='" + mainLink + id + args + "'>"+id+"</a></td>";
		}

		dataBoxContent += "<td><a onclick=\"remove(this,'"+id+"')\" style='font-weight:600;'>del</a></td></tr>";
	}
	dataBoxContent += "</table>";
	databoxElement.innerHTML = dataBoxContent;
}

var myTableElement;
var removeId = 0;
function remove(tableElement,id) {
	gLog("remove "+id);
	myTableElement = tableElement;
	removeId = id;

	let yesNoInner = "<div style='position:absolute; left:-999em; top:0px; width:180px; z-index:110; background:#45dd; color:#fff; padding:20px 30px; line-height:2.5em; border-radius:3px; cursor:pointer;'>Delete this contact?<br>"+id+"<br><a onclick='removeDo();history.back();'>Delete!</a> &nbsp; <a onclick='history.back();'>Cancel</a></div>";
	menuDialogOpen(dynDialog,true,yesNoInner);
}

function removeDo() {
	let api = apiPath+"/deletecontact?id="+calleeID+"&contactID="+removeId;
	gLog('request api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		gLog('xhr deletecontact OK',xhr.responseText);
		if(xhr.responseText=="ok") {
			// delete myTableElement <tr> 2nd parent of myTableElement
			let trElement = myTableElement.parentNode.parentNode;
			// remove trElement from DOM
			let parentElement = trElement.parentNode;
			parentElement.removeChild(trElement);
		}
	}, errorAction);
}

function edit(tableElement,ev,key,name) {
	// edit the contact name
	let rect = tableElement.getBoundingClientRect();
	gLog('edit',key,name,rect,ev.pageX,ev.pageY);
	if(formElement!=null) {
		let parentElement = formElement.parentNode;
		parentElement.removeChild(formElement);
		formElement = null;
	}
	myTableElement = tableElement;
	// offer a form for the user to edit the name at pos rect.x / rect.y and rect.width
//TODO alternatively we could open a new dialog to edit: name|prefCallbackId|ourNickname
	formElement = document.createElement("div");
	formElement.style = "position:absolute; left:"+rect.x+"px; top:"+(rect.y+window.scrollY)+"px; z-index:100;";
	formElement.innerHTML = "<form action='javascript:;' onsubmit='editSubmit(this,\""+key+"\")' id='user-comment'> <input type='text' id='formtext' value='"+name+"' size='14' maxlength='14' autofocus> <input type='submit' id='submit' value='Store'> </form>";
	databox.appendChild(formElement);
	formForNameOpen = true;
}

function editSubmit(formElement,id) {
	// store the edited contact name via /setcontact - or delete this contact via /deletecontact
	//gLog('editSubmit',id);
	let formtextElement = document.getElementById("formtext");
	let newName = formtextElement.value;

	let entry1 = obj[id];
	let tok = entry1.split("|");
	let oldName = "none";
	if(tok.length>0) oldName = tok[0]
	let prefCallbackId = "";
	if(tok.length>1) prefCallbackId = tok[1]
	let ourNickname = "";
	if(tok.length>2) ourNickname = tok[2]
	gLog('editSubmit value',oldName,newName,id);

	if(newName=="") {
		//prevent nameless element by aborting edit form
		let parentElement = formElement.parentNode;
		parentElement.removeChild(formElement);
		formElement = null;
		formForNameOpen = false;
		return;
	}

	if(newName.toLowerCase()=="delete" || newName=="...") {
		// special case
		let api = apiPath+"/deletecontact?id="+calleeID+"&contactID="+id;
		gLog('request api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			gLog('xhr deletecontact OK',xhr.responseText);
			if(xhr.responseText=="ok") {
				// delete myTableElement <tr> 2nd parent of myTableElement
				let trElement = myTableElement.parentNode.parentNode;
				// remove trElement from DOM
				let parentElement = trElement.parentNode;
				parentElement.removeChild(trElement);
			}
		}, errorAction);

	} else if(newName!=oldName) {
		// name change
		// deliver newName change for id back to the server (/setcontact?id=calleeID&contactID=id&name=newName)
		let entry1 = newName+"|"+prefCallbackId+"|"+ourNickname;
		// TODO /setcontact would benefit from using POST
		let api = apiPath+"/setcontact?id="+calleeID+"&contactID="+id+"&name="+entry1;
		gLog('request api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			//gLog('xhr setcontact resp='+xhr.responseText);
			if(xhr.responseText=="") {
				obj[id] = entry1;
				myTableElement.innerHTML = newName;
			}
		}, errorAction);
	}

	// remove formElement from DOM
	let parentElement = formElement.parentNode;
	parentElement.removeChild(formElement);
	formElement = null;
	formForNameOpen = false;
}

function exitPage() {
	gLog('exitPage');
	if(parent!=null && parent.iframeWindowClose) {
		gLog('parent.iframeWindowClose()');
		history.back();
	}
	gLog('contacts exitPage stop onkeydown handler');
}
*/

/*
var xhrTimeout = 5000;
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
	gLog('xhr send',apiPath);
	xhr.open(type, apiPath, true);
	xhr.setRequestHeader("Content-type", "text/plain; charset=utf-8");
	if(postData) {
		gLog('posting',postData);
		xhr.send(postData);
	} else {
		xhr.send();
	}
}
*/
