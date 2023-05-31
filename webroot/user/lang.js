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
	"willShowPostCall"		: "Available after call",
	"digAnswMachine"		: "About to call a digital answering machine",

	"tryingToFind"			: "Trying to find",
	"thisCanTakeSomeTime"	: "This may take a while. Please wait...",
	"isCurrentlyNot"		: "is currently not available.",
	"canYouWaitSomeTime"	: "Can you wait some time while we try to establish a connection?",
	"yesPleaseTry"			: "Yes, please try",
	"noIHaveToGo"			: "No, I have to go",
	"TryingToGet"			: "Trying to get",
	"onThePhonePleaseWait"	: "on the phone. Please wait...",
	"sorryUnableToReach"	: "Unable to contact",
	"PleaseTryAgainALittle"	: "Please try again a little later",
	"micmuted"				: "Mic muted",
	"peerNoTextChat"		: "Peer does not support TextChat",
	"connected"				: "Connected",
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
	"willShowPostCall"		: "Nach Anruf verfügbar",
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
	"micmuted"				: "Mikrofon stumm",
	"peerNoTextChat"		: "Gegenseite unterstütz kein TextChat",
	"connected"				: "Verbunden",
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
	"willShowPostCall"		: "Disponible previa llamada",
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
	"micmuted"				: "Micrófono silenciado",
	"peerNoTextChat"		: "Peer no soporta TextChat",
	"connected"				: "Conectado",
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
	"willShowPostCall"		: "Disponibile dopo la telefonata",
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
	"micmuted"				: "Microfono muto",
	"peerNoTextChat"		: "Peer non supporta la TextChat",
	"connected"				: "Collegato",
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
	"willShowPostCall"		: "Disponible après appel",
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
	"micmuted"				: "Micro en sourdine",
	"peerNoTextChat"		: "Le pair ne prend pas en charge le TextChat",
	"connected"				: "Connecté",
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
	"willShowPostCall"		: "Disponível após chamada",
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
	"micmuted"				: "Microfone mudo",
	"peerNoTextChat"		: "O par não oferece suporte a TextChat",
	"connected"				: "Ligado",
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
	"willShowPostCall"		: "Disponível após a chamada",
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
	"micmuted"				: "Microfone mudo",
	"peerNoTextChat"		: "O par não suporta TextChat",
	"connected"				: "Conectado",
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
	"willShowPostCall"		: "Dostupné po zavolání",
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
	"micmuted"				: "Mikrofon ztlumený",
	"peerNoTextChat"		: "Peer nepodporuje TextChat",
	"connected"				: "Připojeno",
},
"el": {
	"dialButton"			: "Κάλεσε",
	"hangupButton"			: "Κλείσε",
	"greetingMessage"		: "Μήνυμα καλωσορίσματος (προαιρετικό):",
	"connectingText"		: "Σύνδεση P2P...",
	"ringingText"			: "Χτυπάει...",
	"hangingUpText"			: "Τερματισμός κλήσης...",
	"msgbox"				: "(Το μήνυμα σου)",
	"nicknameLabel"			: "Ψευδώνυμο:",
	"callstatsLabel"		: "Στατιστικά κλήσης",
	"fullscreenLabel"		: "Πλήρης οθόνη",
	"willShowPostCall"		: "Διαθέσιμος μετά την κλήση",
	"digAnswMachine"		: "Πρόκειται να καλέσεις έναν ψηφιακό τηλεφωνητή",

	"tryingToFind"			: "Προσπάθεια εύρεσης:",
	"thisCanTakeSomeTime"	: "Μπορεί να πάρει λιγάκι. Παρακαλώ περιμένε...",
	"isCurrentlyNot"		: "δεν είναι διαθέσιμος αυτή την στιγμή.",
	"canYouWaitSomeTime"	: "Μπορείς να περιμένεις λιγάκι όσο προσπαθούμε να πραγματοποιήσουμε την σύνδεση?",
	"yesPleaseTry"			: "Ναι, κάνε την δουλειά σου",
	"noIHaveToGo"			: "Όχι, πρέπει να φύγω",
	"TryingToGet"			: "Προσπάθεια απόκτησης",
	"onThePhonePleaseWait"	: "σε κλήση. Παρακαλώ περίμενε...",
	"sorryUnableToReach"	: "Αδυναμία επικοινωνίας",
	"PleaseTryAgainALittle"	: "Παρακαλώ προσπάθησε ξανά λιγάκι αργότερα",
	"micmuted"				: "Μικρόφωνο κλειστό",
	"peerNoTextChat"		: "Ο συνομιλητής δεν υποστηρίζει TextChat",
	"connected"				: "Συνδέθηκε",
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
}

function lg(idStr) {
	if(typeof myLang == "undefined" || myLang==null) {
		myLang = langMap["en"];
	}
	let str = myLang[idStr];
	if(typeof str == "undefined" || str=="") {
		let myLang = langMap["en"];
		str = myLang[idStr];
	}
	return str;
}

