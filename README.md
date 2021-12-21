<div align="center">
  <a href="https://timur.mobi/webcall"><img src="webroot/webcall-logo.png" alt="WebCall"></a>
</div>

# WebCall WebRTC Telephony

v2.0.4 Dec 21, 2021

HQ audio/video telephony with bidirectional file transfer

WebCall video delivers the best picture quality on top of your internet connection. Strict use of P2P connectivity results in lower latency and higher frame rates. Audio + video + two-way file transfer can all be used at the same time. Video delivery can be turned on and off at any time during the call. Audio stays in place for the duration of the call. 

You may want to use video just briefly and continue audio-only for the rest of your conversation. Maybe you want to use video to make sure you are connected to the right person, before you start exchanging some sensitive files. Turning video off can also result in faster file delivery.

WebCall offers super high audio quality. With a 20-280 bps adaptive bitrate (Opus codec) it offers better audio quality than even the best internet radio stations. It is a joy to use, especially for long distance telephony.

WebCall links are always end-to-end encrypted. This prevents others from listening in on your calls. It also guarantees that your data can not be altered on the fly.

WebCall server operates fully self-contained. It does not depend on 3rd party services (say, for STUN or TURN). This means that no big internet company will be able to track what you do. This is true when you use my server at timur.mobi. This server exists only to showcase WebCall in the best possible way. It is also true if you run your own WebCall server.

WebCall work on iPhone, Android, Linux, Mac and Windows. All you need is a 2020+ web browser.

[https://timur.mobi/webcall](https://timur.mobi/webcall)


# Installation

A single WebCall server can provide free and secure telephony for up to 1M concurrent users.
You can run a small server for up to 1000 concurrent users within 100KB of RAM! 
In other words, you can run WebCall server as a small daemon along side your web server. 
And because all data (audio/video/files) is sent directly from client to client, 
you will see practically no additional CPU load.

[https://timur.mobi/webcall/install](https://timur.mobi/webcall/install)


# Decentral WebCall

We can build a network of telephony servers, offering free and boundless audio and video 
telephony for everyone. This is possible because anyone can run a WebCall server. And 
because, as a user, you can connect to any other WebCall user, regardless of who is doing 
the hosting. 
All of this is possible with no central coordination and without any server-to-server
communication.

[https://timur.mobi/webcall/info/server](https://timur.mobi/webcall/info/server)


# License

AGPL3.0 - see: [LICENSE](LICENSE)


## 3rd party code (external)

- github.com/lesismal/nbio
- go.etcd.io/bbolt
- github.com/pion/turn
- github.com/mrjones/oauth
- github.com/SherClockHolmes/webpush-go
- gopkg.in/ini
- github.com/webrtcHacks/adapter.js

## 3rd party code (embedded/modified)

- github.com/RapidLoop: skv
- github.com/ChimeraCoder: Twitter
- AppRTC's sdputils.js: prefercodec.js
- mr-wang-from-next-door: GetOutboundIP()
- github.com/mahan: AtomBool

