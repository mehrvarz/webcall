// WebCall Copyright 2023 timur.mobi. All rights reserved.
var shortLang;
var mainLang;
var myLang;

var langMap = {
"en": {
	"dialButton"			: "Dial",
	"hangupButton"			: "Hangup",
	"greetingMessage"		: "Greeting message (optional):",
	"connectingText"		: "Connecting P2P...",
	"ringingText"			: "Ringing...",
	"hangingUpText"			: "Hanging up...",
	"msgbox"				: "(Your message)",
	"nicknameLabel"			: "Nickname:",
	"callstatsLabel"		: "Call stats",
	"fullscreenLabel"		: "Fullscreen",
	"notAvailable"			: "Not available",
	"digAnswMachine"		: "About to call a digital answering machine",

	"tryingToFind"			: "Trying to find",
	"thisCanTakeSomeTime"	: "This can take a moment. Please wait...",
	"isCurrentlyNot"		: "is currently not available.",
	"canYouWaitSomeTime"	: "Can you wait some time while we try to establish a connection?",
	"yesPleaseTry"			: "Yes, please try",
	"noIHaveToGo"			: "No, I have to go",
	"TryingToGet"			: "Trying to get",
	"onThePhonePleaseWait"	: "on the phone. Please wait...",
	"sorryUnableToReach"	: "Unable to contact",
	"PleaseTryAgainALittle"	: "Please try again a little later.",
},
"de": {
	"dialButton"			: "Anwählen",
	"hangupButton"			: "Auflegen",
	"greetingMessage"		: "Gruß-Nachricht (optional):",
	"connectingText"		: "Verbinde P2P...",
	"ringingText"			: "Klingeln...",
	"hangingUpText"			: "Auflegen...",
	"msgbox"				: "(Deine Nachricht)",
	"nicknameLabel"			: "Rufname:",
	"callstatsLabel"		: "Anruf Daten",
	"fullscreenLabel"		: "Vollschirm",
	"notAvailable"			: "Nicht verfügbar",
	"digAnswMachine"		: "Verbindung mit einem digitalen Anrufbeantworter",

	"tryingToFind"			: "Nutzer wird gesucht:",
	"thisCanTakeSomeTime"	: "Das kann einen Moment dauern. Bitte warten...",
	"isCurrentlyNot"		: "ist derzeit nicht erreichbar.",
	"canYouWaitSomeTime"	: "Können Sie etwas warten, während eine Verbinding hergestellt wird?",
	"yesPleaseTry"			: "Ja, bitte verbinden",
	"noIHaveToGo"			: "Nein, keine Zeit",
	"TryingToGet"			: "Versuche mit",
	"onThePhonePleaseWait"	: "zu verbinden. Bitte warten...",
	"sorryUnableToReach"	: "Nutzer nicht erreichbar:",
	"PleaseTryAgainALittle"	: "Bitte versuchen Sie es etwas später erneut.",
},
"es": {
	"dialButton"			: "Llame a",
	"hangupButton"			: "Colgar",
	"greetingMessage"		: "Mensaje de saludo (opcional):",
	"connectingText"		: "Conexión P2P...",
	"ringingText"			: "Timbre...",
	"hangingUpText"			: "Colgar...",
	"msgbox"				: "(Su mensaje)",
	"nicknameLabel"			: "Apodo:",
	"callstatsLabel"		: "Estadísticas de llamadas",
	"fullscreenLabel"		: "Pantalla completa",
	"notAvailable"			: "No disponible",
	"digAnswMachine"		: "A punto de llamar a un contestador automático digital",

	"tryingToFind"			: "Se busca usuario:",
	"thisCanTakeSomeTime"	: "Esto puede llevar algún tiempo. Por favor, espere...",
	"isCurrentlyNot"		: "no está disponible actualmente.",
	"canYouWaitSomeTime"	: "¿Puede esperar un poco mientras se establece la conexión?",
	"yesPleaseTry"			: "Sí, conéctese",
	"noIHaveToGo"			: "No, no hay tiempo",
	"TryingToGet"			: "Intenta conectar con",
	"onThePhonePleaseWait"	: "Por favor, espere...",
	"sorryUnableToReach"	: "Usuario no localizable:",
	"PleaseTryAgainALittle"	: "Por favor, inténtelo de nuevo un poco más tarde.",
},
"it": {
	"dialButton"			: "Chiamata",
	"hangupButton"			: "Riattacca",
	"greetingMessage"		: "Messaggio di saluto (opzionale):",
	"connectingText"		: "Collegamento P2P...",
	"ringingText"			: "Suoneria...",
	"hangingUpText"			: "Appendere...",
	"msgbox"				: "(Il vostro messaggio)",
	"nicknameLabel"			: "Soprannome:",
	"callstatsLabel"		: "Statistiche di chiamata",
	"fullscreenLabel"		: "Schermo intero",
	"notAvailable"			: "Non disponibile",
	"digAnswMachine"		: "In procinto di chiamare una segreteria telefonica digitale",

	"tryingToFind"			: "L'utente è desiderato:",
	"thisCanTakeSomeTime"	: "L'operazione potrebbe richiedere del tempo. Si prega di attendere...",
	"isCurrentlyNot"		: "non è attualmente disponibile",
	"canYouWaitSomeTime"	: "Potete aspettare un po' mentre viene stabilita la connessione?",
	"yesPleaseTry"			: "Sì, si prega di collegare",
	"noIHaveToGo"			: "No, non c'è tempo",
	"TryingToGet"			: "Prova a connetterti con",
	"onThePhonePleaseWait"	: "Attendere prego...",
	"sorryUnableToReach"	: "Utente non raggiungibile:",
	"PleaseTryAgainALittle"	: "Riprovare un po' più tardi.",
},
"fr": {
	"dialButton"			: "Composer",
	"hangupButton"			: "Déconnexion",
	"greetingMessage"		: "Message d'accueil (optionnel):",
	"connectingText"		: "Connexion P2P...",
	"ringingText"			: "Sonnerie...",
	"hangingUpText"			: "Raccrocher...",
	"msgbox"				: "(Votre message)",
	"nicknameLabel"			: "Surnom:",
	"callstatsLabel"		: "Statistiques d'appels",
	"fullscreenLabel"		: "Plein écran",
	"notAvailable"			: "non disponible",
	"digAnswMachine"		: "Vous allez appeler un répondeur numérique",

	"tryingToFind"			: "Utilisateur recherché",
	"thisCanTakeSomeTime"	: "Cela peut prendre un certain temps. Veuillez patienter...",
	"isCurrentlyNot"		: "n'est pas disponible pour le moment",
	"canYouWaitSomeTime"	: "Pouvez-vous attendre un peu pendant qu'une connexion est établie ?",
	"yesPleaseTry"			: "Oui, veuillez vous connecter",
	"noIHaveToGo"			: "Non, pas le temps",
	"TryingToGet"			: "Essayez de vous connecter à",
	"onThePhonePleaseWait"	: "Veuillez patienter...",
	"sorryUnableToReach"	: "Utilisateur injoignable:",
	"PleaseTryAgainALittle"	: "Veuillez réessayer un peu plus tard.",
},
"pt-PT": {
	"dialButton"			: "Chamada",
	"hangupButton"			: "Desligar",
	"greetingMessage"		: "Mensagem de saudação (opcional):",
	"connectingText"		: "Ligando P2P...",
	"ringingText"			: "Anelar...",
	"hangingUpText"			: "Desligar...",
	"msgbox"				: "(A sua mensagem)",
	"nicknameLabel"			: "Apelido:",
	"callstatsLabel"		: "Estatísticas de chamadas",
	"fullscreenLabel"		: "Ecrã inteiro",
	"notAvailable"			: "Não Disponível",
	"digAnswMachine"		: "Prestes a ligar para um atendedor digital",

	"tryingToFind"			: "A tentar encontrar o",
	"thisCanTakeSomeTime"	: "Isto pode levar algum tempo. Aguarde, por favor...",
	"isCurrentlyNot"		: "não está actualmente disponível.",
	"canYouWaitSomeTime"	: "Pode esperar algum tempo enquanto tentamos estabelecer uma ligação?",
	"yesPleaseTry"			: "Sim, por favor tente",
	"noIHaveToGo"			: "Não, eu tenho de ir",
	"TryingToGet"			: "A tentar telefonar ao",
	"onThePhonePleaseWait"	: "Por favor, aguarde...",
	"sorryUnableToReach"	: "Incapaz de contactar o",
	"PleaseTryAgainALittle"	: "Por favor, tente novamente um pouco mais tarde.",
},
"pt-BR": {
	"dialButton"			: "Chamar",
	"hangupButton"			: "Desligar",
	"greetingMessage"		: "Mensagem de saudação (opcional):",
	"connectingText"		: "Conectando P2P...",
	"ringingText"			: "Tocando...",
	"hangingUpText"			: "Desligando...",
	"msgbox"				: "(Sua mensagem)",
	"nicknameLabel"			: "Apelido:",
	"callstatsLabel"		: "Estatísticas de chamada",
	"fullscreenLabel"		: "Tela cheia",
	"notAvailable"			: "não Disponível",
	"digAnswMachine"		: "Você está prestes a chamar um atendedor de chamadas digital",

	"tryingToFind"			: "Tentando encontrar",
	"thisCanTakeSomeTime"	: "Isto pode levar algum tempo. Aguarde, por favor...",
	"isCurrentlyNot"		: "não está disponível no momento.",
	"canYouWaitSomeTime"	: "Você deseja esperar enquanto tentamos estabelecer uma conexão?",
	"yesPleaseTry"			: "Sim, por favor tente",
	"noIHaveToGo"			: "Não, eu tenho de ir",
	"TryingToGet"			: "Tentado ligar para",
	"onThePhonePleaseWait"	: "Por favor, aguarde...",
	"sorryUnableToReach"	: "Não foi possível se comunicar com",
	"PleaseTryAgainALittle"	: "Por favor, tente novamente mais tarde.",
},
"cs-CS": {
	"dialButton"			: "Vytočit",
	"hangupButton"			: "Položit",
	"greetingMessage"		: "Pozdrav (nepovinné):",
	"connectingText"		: "Vytáčení...",
	"ringingText"			: "Vyzvánění...",
	"hangingUpText"			: "Pokládání...",
	"msgbox"				: "(Zpráva)",
	"nicknameLabel"			: "Jméno:",
	"callstatsLabel"		: "Přehled hovorů",
	"fullscreenLabel"		: "Celá obrazovka",
	"notAvailable"			: "Nedostupný",
	"digAnswMachine"		: "Probíhá připojení k záznamníku",

	"tryingToFind"			: "Hledám",
	"thisCanTakeSomeTime"	: "Může to chvíli trvat. Prosím čekejte...",
	"isCurrentlyNot"		: "není právě dostupný.",
	"canYouWaitSomeTime"	: "Můžete chvíli počkat, než se spojení povede?",
	"yesPleaseTry"			: "Ano, počkám",
	"noIHaveToGo"			: "Ne, musím jít",
	"TryingToGet"			: "Zkouším se spojit s",
	"onThePhonePleaseWait"	: "Prosím čekejte...",
	"sorryUnableToReach"	: "Nemohu se spojit s",
	"PleaseTryAgainALittle"	: "Zkuste to prosím později.",
}};

function switchLanguage(userLang) {
	if(userLang=="en") {
		console.log("switchLanguage abort en");
		return;
	}
	console.log("switchLanguage: "+userLang);
	shortLang = userLang;
	mainLang = shortLang;
	myLang = langMap[userLang];
	if(typeof myLang == "undefined" || myLang==null) {
		let idxDash = userLang.indexOf("-");
		if(idxDash>0) {
			shortLang = userLang.substring(0,idxDash);
			console.log("try shortLang: "+shortLang);
			myLang = langMap[shortLang];
		}
		if(typeof myLang == "undefined" || myLang==null) {
			mainLang = shortLang+"-"+
					shortLang.charAt(0).toUpperCase()+shortLang.charAt(1).toUpperCase();
			console.log("try mainLang: "+mainLang);
			myLang = langMap[mainLang];
		}
	}
	if(typeof myLang == "undefined" || myLang==null) {
		console.log("# no support for "+userLang+"/"+shortLang+"/"+mainLang);
		return;
	}

	console.log("myLang",myLang);

	let str = myLang["dialButton"];
	if(typeof str !== "undefined" && str!="") {
		dialButton.innerHTML = str;
	}

	str = myLang["hangupButton"];
	if(typeof str !== "undefined" && str!="") {
		hangupButton.innerHTML = str;
	}

	str = myLang["connectingText"];
	if(typeof str !== "undefined" && str!="") {
		connectingText = str;
	}

	str = myLang["ringingText"];
	if(typeof str !== "undefined" && str!="") {
		ringingText = str;
	}

	str = myLang["msgbox"];
	if(typeof str !== "undefined" && str!="") {
		if(msgbox) msgbox.placeholder = str;
	}

	str = myLang["nicknameLabel"];
	if(typeof str !== "undefined" && str!="") {
		let nicknameLabel = document.getElementById("nicknameLabel");
		if(nicknameLabel) nicknameLabel.innerHTML = str;
	}

	str = myLang["callstatsLabel"];
	if(typeof str !== "undefined" && str!="") {
		callStatsTitle = str;
		let callstatsLabel = document.getElementById("callstats");
		if(callstatsLabel) callstatsLabel.innerHTML = callStatsTitle;
		// TODO must also change title of opened iframe "Call Statistics" in client.js
		// as well as 'No call stats available' in client.js
	}

	str = myLang["fullscreenLabel"];
	if(typeof str !== "undefined" && str!="") {
		let fullscreenLabel = document.getElementById("fullscreen");
		//console.log("fullscreenLabel=",fullscreenLabel.labels[0]);
		//if(fullscreenLabel) fullscreenLabel.value = str;
		if(fullscreenLabel) fullscreenLabel.labels[0].innerText = str;
	}

	str = myLang["notAvailable"]; // client.js
	if(typeof str !== "undefined" && str!="") {
		notAvailable = str;
	}

//	str = myLang["hangingUpText"];
//	if(typeof str !== "undefined" && str!="") {
//		hangingUpText = str;
//	}

//	str = myLang["greetingMessage"];
//	if(typeof str !== "undefined" && str!="") {
//		greetingMessage = str;
//	}

//	str = myLang["digAnswMachine"];
//	if(typeof str !== "undefined" && str!="") {
//		digAnswMachine = str;
//	}
}

function lg(idStr) {
	if(typeof myLang == "undefined" || myLang==null) {
		myLang = langMap["en"];
	}
	let str = myLang[idStr];
	if(str=="") {
		str = myLang["en"];
	}
	return str;
}

