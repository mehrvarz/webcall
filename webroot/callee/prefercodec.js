// Taken from AppRTC's sdputils.js:
// Sets |codec| as the default |type| codec if it's present.
// The format of |codec| is 'NAME/RATE', e.g. 'opus/48000'.
function maybePreferCodec(sdp, type, dir, codec) {
	const str = `${type} ${dir} codec`;
	if (codec === '') {
		console.log(`No preference on ${str}.`);
		return sdp;
	}
	// "prefer audio send codec: opus"
	//console.log(`prefer ${str}: ${codec}`);
	const sdpLines = sdp.split('\r\n');
	// Search for m line.
	const mLineIndex = findLine(sdpLines, 'm=', type);
	if (mLineIndex === null) {
		return sdp;
	}
	// If the codec is available, set it as the default in m line.
	const codecIndex = findLine(sdpLines, 'a=rtpmap', codec);
	if (codecIndex) {
		const payload = getCodecPayloadType(sdpLines[codecIndex]);
		if (payload) {
			sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex], payload);
		}
	}
	sdp = sdpLines.join('\r\n');
	return sdp;
}

// Find the line in sdpLines that starts with |prefix|, and, if specified,
// contains |substr| (case-insensitive search).
function findLine(sdpLines, prefix, substr) {
	return findLineInRange(sdpLines, 0, -1, prefix, substr);
}

// Find the line in sdpLines[startLine...endLine - 1] that starts with |prefix|
// and, if specified, contains |substr| (case-insensitive search).
function findLineInRange(sdpLines, startLine, endLine, prefix, substr) {
	const realEndLine = endLine !== -1 ? endLine : sdpLines.length;
	for (let i = startLine; i < realEndLine; ++i) {
		if (sdpLines[i].indexOf(prefix) === 0) {
			if (!substr ||
				sdpLines[i].toLowerCase().indexOf(substr.toLowerCase()) !== -1) {
				return i;
			}
		}
	}
	return null;
}

// Gets the codec payload type from an a=rtpmap:X line.
function getCodecPayloadType(sdpLine) {
	const pattern = new RegExp('a=rtpmap:(\\d+) \\w+\\/\\d+');
	const result = sdpLine.match(pattern);
	return (result && result.length === 2) ? result[1] : null;
}

// Returns a new m= line with the specified codec as the first one.
function setDefaultCodec(mLine, payload) {
	const elements = mLine.split(' ');
	// Just copy the first three parameters; codec order starts on fourth.
	const newLine = elements.slice(0, 3);
	// Put target payload first and copy in the rest.
	newLine.push(payload);
	for(let i=3; i < elements.length; i++) {
		if(elements[i] !== payload) {
			newLine.push(elements[i]);
		}
	}
	return newLine.join(' ');
}

function exitPage() {
	if(!gentle) console.log('exitPage');
	if(parent!=null && parent.iframeWindowClose) {
		if(!gentle) console.log('history.back()');
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
		console.log('prefercodec: esc key -> exitPage');
		exitPage();
	} else {
        console.log('prefercodec: no esc key (ignore)');
	}
};

