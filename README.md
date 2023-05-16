<div align="center">
  <a href="https://timur.mobi/webcall"><img src="webroot/webcall-logo.png" alt="WebCall"></a>
</div>

# WebCall Telephony

WebCall offers HQ audio/video telephony plus bidirectional file transfer. WebCall video delivers the best picture quality on top of your internet connection. Strict use of P2P connectivity results in lower latency and higher frame rates. Audio + video + two-way file transfer can all be used at the same time. Video delivery can be turned on and off at any time during the call. Audio stays in place for the duration of the call. 

You may want to use video only briefly and continue audio-only for the rest of your conversation. Maybe you want to use video to make sure you are connected to the right person, before you start exchanging some sensitive files. Turning video off can also result in faster file delivery.

WebCall offers super high audio quality. With a 20-280 bps adaptive bitrate (Opus codec) it offers better audio quality than even the best internet radio stations. It is a joy to use, especially for long distance telephony.

WebCall links are always end-to-end encrypted. This prevents others from listening in on your calls. It also guarantees that your data can not be altered on the fly.

WebCall server operates fully self-contained. It does not depend on 3rd party services (say, for STUN, TURN, etc.). This means that no big internet company will be able to track what WebCall users do.

WebCall web client can be used on iPhone, Android, Linux, macOS and Windows with a 2020+ web browser.

[timur.mobi/webcall](https://timur.mobi/webcall)

Native WebCall client for Android:

[github.com/mehrvarz/webcall-android](https://github.com/mehrvarz/webcall-android)

Native WebCall clients for Linux, FreeBSD, macOS, Windows:

[github.com/mehrvarz/webcall-apps](https://github.com/mehrvarz/webcall-apps)


# Installation

A single WebCall server can provide free and secure telephony for up to 1M concurrent users.
You can run a small server for up to 1000 concurrent users within 100KB of RAM! 
In other words, you can run WebCall server as a small daemon along side your web server. 
And because all data (audio/video/files) is sent directly from client to client, 
you will see practically no additional CPU load.

[https://timur.mobi/webcall/install](https://timur.mobi/webcall/install)


# License

AGPL3.0 - see: [LICENSE](LICENSE)

## 3rd party code (external)

- github.com/mattn: go-mastodon
- github.com/lesismal/nbio
- go.etcd.io/bbolt
- github.com/pion/turn
- github.com/webrtcHacks/adapter.js

## 3rd party code (embedded)

- github.com/RapidLoop: skv
- AppRTC's sdputils.js: prefercodec.js
- mr-wang-from-next-door: GetOutboundIP()


