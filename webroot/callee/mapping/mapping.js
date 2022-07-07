// WebCall mapping client by timur.mobi
'use strict';
const databoxElement = document.getElementById('databox');
const calleeMode = false;

var calleeID = "";
var callerName = "";
var dialsounds = "";
var formForNameOpen = false;
var formElement = null;

window.onload = function() {
	calleeID = getUrlParams("callerId");
	if(!gentle) console.log('mapping onload calleeID='+calleeID);

	hashcounter = 1;
	window.onhashchange = hashchange;

	document.onkeydown = function(evt) {
		//console.log('mapping onload onkeydown event');
		evt = evt || window.event;
		var isEscape = false;
		if("key" in evt) {
			isEscape = (evt.key === "Escape" || evt.key === "Esc");
		} else {
			isEscape = (evt.keyCode === 27);
		}
		if(isEscape) {
			if(formForNameOpen) {
				if(!gentle) console.log('mapping.js esc key (formForNameOpen)');
				let parentElement = formElement.parentNode;
				parentElement.removeChild(formElement);
				formElement = null;
				formForNameOpen = false;
			} else {
				if(!gentle) console.log('mapping.js esc key -> exit');
				exitPage();
			}
		} else {
			//console.log('mapping.js no esc key');
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

var altIDs = "";
function requestData() {
	let api = apiPath+"/getmapping?id="+calleeID;
	if(!gentle) console.log('request getmapping api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		altIDs = xhr.responseText;
		displayMapping();
	}, errorAction);
}

var dataBoxContent="";
function displayMapping() {
	if(!gentle) console.log("displayMapping("+altIDs+")");
	let mainLink = window.location.href;
	let idx = mainLink.indexOf("/callee/");
	if(idx>0) {
		mainLink = mainLink.substring(0,idx) + "/user/";
	}

	let count = 0;
	dataBoxContent="";

	if(altIDs!="") {
		dataBoxContent += "<table style='width:100%; border-collapse:separate; _border-spacing:6px 2px; line-height:1.7em;'>"
		dataBoxContent += "<tr style='color:#7c0;font-weight:600;user-select:none;'><td>ID</td><td>Assign</td></tr>";

		// main callee id
		dataBoxContent += "<tr><td><a href='/user/"+calleeID+"' onclick='clickID("+calleeID+");return false;'>"+calleeID+"</a></td>" + "<td>(Main-ID)</td></tr>";

		// parse altIDs, format: id,true,assign|id,true,assign|...
		let tok = altIDs.split("|");
		count = tok.length;
		for(var i=0; i<tok.length; i++) {
			//console.log("tok["+i+"]="+tok[i]);
			if(tok[i]!="") {
				let tok2 = tok[i].split(",");
				let id = tok2[0].trim();
				let active = tok2[1].trim();
				let assign = tok2[2].trim();
				if(assign=="") {
					assign = "none";
				}
				//console.log("assign=("+assign+")");

				dataBoxContent += "<tr><td><a href='" + mainLink + id + "' onclick='clickID("+id+");return false;'>"+id+"</a></td>"+
					"<td><a onclick='edit(this,event,\""+id+"\",\""+assign+"\")'>"+ assign +"</a></td>"+
					"<td><a onclick='remove("+i+","+id+")' style='font-weight:600;'>X</a></td></tr>";
			}
		}
		dataBoxContent += "</table>";

	}

	dataBoxContent += "<br>";
	if(count<5) {
		// no more than 10 tmpID's per callee
		dataBoxContent += "<button onclick='add()'>Add New-ID</button> &nbsp; ";
	}
	dataBoxContent += "<button onclick='exitPage()'>Close</button>";

	databoxElement.innerHTML = dataBoxContent;
}

function clickID(id) {
	// prevent click-open id-link
	gLog('clickID='+id);
}

function add() {
	// fetch and register a new/free id
	let api = apiPath+"/fetchid?id="+calleeID;
	gLog('request fetchid api='+api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log("# add error("+xhr.responseText+")");
		} else if(xhr.responseText=="") {
			console.log("# add empty response");
		} else {
			let newID = xhr.responseText;
			console.log("add newID="+newID);
			// ",true," = activated and without an assigned name
			if(altIDs=="") {
				altIDs = newID+",true,";
			} else {
				altIDs += "|"+newID+",true,";
			}
			storeData();
		}
	}, errorAction);
}

var removeIdx = 0;
var removeId = 0;
function remove(idx,id) {
	gLog("remove "+idx+" "+id);
	removeIdx = idx;
	removeId = id;
	// yesNoDialog will call removeDo() for 'yes'
	menuDialogOpen(yesNoDialog,true);
}

function removeDo() {
	let api = apiPath+"/deletemapping?id="+calleeID+"&delid="+removeId;
	if(!gentle) console.log('request api',api);
	ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log("/deletemapping err="+err);
		} else if(xhr.responseText!="ok") {
			console.log("/deletemapping response not 'ok' (%s)",xhr.responseText);
		} else {
			// xhr.responseText == "ok"
			let oldAltIDs = altIDs;
			console.log('remove old altIDs='+oldAltIDs);
			altIDs = "";
			let tok = oldAltIDs.split("|");
			let writeCount=0;
			for(var i=0; i<tok.length; i++) {
				if(i!=removeIdx) {
					console.log("tok["+i+"]="+tok[i]);
					if(writeCount==0) {
						altIDs += tok[i];
					} else {
						altIDs += "|"+tok[i];
					}
					writeCount++;
				}
			}
			console.log('remove new altIDs='+altIDs);
			storeData();
		}
	}, errorAction);
}

function storeData() {
	let api = apiPath+"/setmapping?id="+calleeID;
	if(!gentle) console.log('/setmapping api',api);
	ajaxFetch(new XMLHttpRequest(), "POST", api, function(xhr) {
		if(xhr.responseText.startsWith("error")) {
			console.log('# /setmapping err='+xhr.responseText);
		} else {
			// all is well
			displayMapping();
		}
	}, errorAction, altIDs);
}

// TODO need a active/inactive checkbox (default = activated)
// on deactivate: remove mapping[urlID] (via server) and patch altIDs and call storeData()
// on reactivate: add mapping[urlID] (via server) and patch altIDs and call storeData()

var myTableElement;
function edit(tableElement,ev,key,assign) {
	if(!gentle) console.log("edit key="+key+" assign="+assign);
	// edit assign string (see below on how)
	let rect = tableElement.getBoundingClientRect();
	if(!gentle) console.log('edit',key,name,ev.pageX,ev.pageY);
	if(formForNameOpen) {
		let parentElement = formElement.parentNode;
		parentElement.removeChild(formElement);
		formElement = null;
	}
	myTableElement = tableElement;
	// offer a form for the user to edit the name at pos rect.x / rect.y and rect.width
	formElement = document.createElement("div");
	formElement.style = "position:absolute; left:"+rect.x+"px; top:"+(rect.y+window.scrollY)+"px; z-index:100;";
	formElement.innerHTML = "<form action='javascript:;' onsubmit='editSubmit(this,\""+key+"\",\""+assign+"\")' id='user-comment'> <input type='text' id='formtext' value='"+assign+"' size='8' maxlength='8' autofocus> <input type='submit' id='submit' value='Store'> </form>";
	databoxElement.appendChild(formElement);
	formForNameOpen = true;
}

function editSubmit(formElement, id, assign) {
	if(!gentle) console.log("editSubmit id="+id+" assign="+assign);
	let formtextElement = document.getElementById("formtext");
	let newAssign = formtextElement.value;
	if(!gentle) console.log('editSubmit value change',assign,newAssign);

	// remove formElement from DOM
	let parentElement = formElement.parentNode;
	parentElement.removeChild(formElement);
	formElement = null;
	formForNameOpen = false;

	if(newAssign=="") {
		//prevent nameless element by aborting edit form
		return;
	}

	if(newAssign!=assign) {
		// store assign string
		let api = apiPath+"/setassign?id="+calleeID+"&setid="+id+"&assign="+newAssign;
		if(!gentle) console.log('/setassign api',api);
		ajaxFetch(new XMLHttpRequest(), "GET", api, function(xhr) {
			if(xhr.responseText.startsWith("error")) {
				console.log('# /setassign err='+xhr.responseText);
			} else if(xhr.responseText!="ok") {
				console.log('# /setassign response not ok (%s)',xhr.responseText);
			} else {
				// all is well
				//myTableElement.innerHTML = newAssign;

				// patch altIDs and call storeData() (will automatically call displayMapping())
				let newAltIDs = "";
				let tok = altIDs.split("|");
				for(var i=0; i<tok.length; i++) {
					if(!gentle) console.log("old tok["+i+"]="+tok[i]);
					if(tok[i]!="") {
						let tok2 = tok[i].split(",");
						let oldid = tok2[0].trim();
						let oldactive = tok2[1].trim();
						let oldassign = tok2[2].trim();
						if(oldid==id) {
							tok[i] = id+","+oldactive+","+newAssign;
						}
					}
					if(!gentle) console.log("new tok["+i+"]="+tok[i]);
					if(i==0) {
						newAltIDs += tok[i];
					} else {
						newAltIDs += "|"+tok[i];
					}
				}
				if(!gentle) console.log("newAltIDs="+newAltIDs);
				altIDs = newAltIDs;
				storeData();
			}
		}, errorAction);
	}
}

var xhrTimeout = 5000;
function ajaxFetch(xhr, type, apiPath, processData, errorFkt, postData) {
	xhr.onreadystatechange = function() {
		if(xhr.readyState == 4 && (xhr.status==200 || xhr.status==0)) {
			processData(xhr);
		} else if(xhr.readyState==4) {
			errorFkt("fetch error",xhr.status);
		}
	}
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
		if(!gentle) console.log('xhr post='+postData);
		xhr.send(postData);
	} else {
		xhr.send();
	}
}

function errorAction(errString,err) {
	console.log('xhr error',errString);
	// let user know via alert
	alert("xhr error "+errString);
}

function exitPage() {
	if(!gentle) console.log('mapping exitPage');
	if(parent!=null && parent.iframeWindowClose) {
		if(!gentle) console.log('mapping parent.iframeWindowClose()');
		history.back();
	}
	if(!gentle) console.log('mapping exitPage stop onkeydown handler');
}

