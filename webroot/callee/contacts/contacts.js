// WebCall contacts client by timur.mobi
'use strict';
const databoxElement = document.getElementById('databox');

var callerID = "";
var callerName = "";
var formForNameOpen = false;
var formElement = null;

window.onload = function() {
	callerID = getUrlParams("callerId");
	callerName = getUrlParams("name");

	document.onkeydown = function(evt) {
		//console.log('contacts onload onkeydown event');
		evt = evt || window.event;
		var isEscape = false;
		if("key" in evt) {
			isEscape = (evt.key === "Escape" || evt.key === "Esc");
		} else {
			isEscape = (evt.keyCode === 27);
		}
		if(isEscape) {
			console.log('contacts esc key');
			if(formForNameOpen) {
				let parentElement = formElement.parentNode;
				parentElement.removeChild(formElement);
				formElement = null;
				formForNameOpen = false;
			} else {
				exitPage();
			}
		}
	};

	// XHR for current settings; server will use the cookie to authenticate us
	requestData();
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

function requestData() {
	let api = apiPath+"/getcontacts?id="+callerID;
	if(!gentle) console.log('request getcontacts api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		processContacts(xhr.responseText);
	}, errorAction);
}

var obj = null;
function processContacts(xhrresponse) {
	if(!gentle) console.log("xhrresponse ("+xhrresponse+")");
	if(xhrresponse!="") {
		let mainLink = window.location.href;
		let idx = mainLink.indexOf("/callee/");
		if(idx>0) {
			mainLink = mainLink.substring(0,idx) + "/user/";
		}

		// json parse xhrresponse
		obj = JSON.parse(xhrresponse);
		//if(!gentle) console.log('xhrresponse obj',obj);

		// in order to sort the json data we convert it to an array
		let entries = Object.entries(obj);
		// if there is no name, we use the id as name
		for(let entry of entries) {
			// [0]=id, [1]=name
			if(entry[1]=="") { entry[1]=entry[0]; }
		}
		// now sort
		entries.sort(function(a,b) {
			let aName = a[1].toLowerCase();
			let bName = b[1].toLowerCase();
			if(aName < bName){
				return -1
			} else if(aName > bName){
				return 1;
			} 
			return 0;
		});
		//if(!gentle) console.log('sorted results',entries);

		// create display table
		// TODO not sure about border-spacing:6px
		var dataBoxContent = "<table style='width:100%; border-collapse:separate; border-spacing:6px 2px; line-height:1.7em;'>"
		dataBoxContent += "<tr style='color:#7c0;font-weight:600;user-select:none;'><td>Name (edit)</td><td>ID (call)</td></tr>";
		for(let entry of entries) {
			let id = entry[0];
			let name = entry[1];
			//if(!gentle) console.log('obj[%s] (%s)',id, name);
			dataBoxContent += "<tr><td><a onclick='edit(this,event,\""+id+"\")'>"+name+"</a></td>"+
			"<td><a href='" + mainLink + id + "?callerId="+callerID+ "&name="+callerName+"'>"+id+"</a></td></tr>";
		}
		dataBoxContent += "</table>";
		databoxElement.innerHTML = dataBoxContent;
	}
}

var myTableElement;
function edit(tableElement,ev,key) {
	let name = obj[key];
	let rect = tableElement.getBoundingClientRect();
	console.log('edit',key,name,rect,ev.pageX,ev.pageY);
	if(formElement!=null) {
		let parentElement = formElement.parentNode;
		parentElement.removeChild(formElement);
		formElement = null;
	}
	myTableElement = tableElement;
	// offer a form for the user to edit the name at pos rect.x / rect.y and rect.width
	formElement = document.createElement("div");
	formElement.style = "position:absolute; left:"+rect.x+"px; top:"+(rect.y+window.scrollY)+"px; z-index:100;";
	formElement.innerHTML = "<form action='javascript:;' onsubmit='editSubmit(this,\""+key+"\")' id='user-comment'> <input type='text' id='formtext' value='"+name+"' autofocus> <input type='submit' id='submit' value='Store'> </form>";
	databox.appendChild(formElement);
	formForNameOpen = true;
}

function editSubmit(formElement,id) {
	//console.log('editSubmit',id);
	let formtextElement = document.getElementById("formtext");
	let oldName = obj[id];
	let newName = formtextElement.value;
	console.log('editSubmit value',oldName,newName,id);

	if(newName=="") {
		//prevent nameless element by aborting edit form
		let parentElement = formElement.parentNode;
		parentElement.removeChild(formElement);
		formElement = null;
		formForNameOpen = false;
		return;
	}

	if(newName.toLowerCase()=="delete" || newName=="---") {
		// special case
		let api = apiPath+"/deletecontact?id="+callerID+"&contactID="+id;
		if(!gentle) console.log('request api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			console.log('xhr deletecontact OK',xhr.responseText);
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
		// deliver newName change for id back to the server (/setcontact?id=callerID&contactID=id&name=newName)
		let api = apiPath+"/setcontact?id="+callerID+"&contactID="+id+"&name="+newName;
		if(!gentle) console.log('request api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			console.log('xhr setcontact OK',xhr.responseText);
			if(xhr.responseText=="ok") {
				obj[id] = newName;
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

function errorAction(errString,err) {
	console.log('xhr error',errString);
	// let user know via alert
	alert("xhr error "+errString);
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

function exitPage() {
	if(!gentle) console.log('exitPage');
	if(parent!=null && parent.iframeWindowClose) {
		if(!gentle) console.log('parent.iframeWindowClose()');
		history.back();
	}
	if(!gentle) console.log('contacts exitPage stop onkeydown handler');
}

