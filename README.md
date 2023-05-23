<div align="center">
  <a href="https://timur.mobi/webcall"><img src="webroot/webcall-logo.png" alt="WebCall"></a>
</div>

# WebCall Telephony

WebCall offers audio and video telephony plus bidirectional file transfer plus secure TextChat. WebCall video delivers the best picture quality on top of your internet connection. Strict use of P2P connectivity results in lower latency and higher frame rates. Audio + video + two-way file transfer and TextChat can be used at the same time. Audio and Video delivery can be turned on and off individually at any time during the call.

WebCall provides very high audio quality. With a 20-320 bps adaptive bitrate (Opus codec) it offers better audio quality than most internet radio stations. It is a joy to use, especially for long distance calls.

WebCall sessions are always end-to-end encrypted. This prevents others from listening in on your calls.

WebCall server operates fully self-contained. It does not depend on any 3rd party services (say, for STUN, TURN, etc.). This means that other partie can not track your usage.

WebCall web client can be used on iPhone, Android, Linux, macOS and Windows with a 2020+ web browser.
This means that you can receive calls from basically anyone on the internet:

[timur.mobi/webcall](https://timur.mobi/webcall)

Native WebCall client for Android:

[github.com/mehrvarz/webcall-android](https://github.com/mehrvarz/webcall-android)

Native WebCall clients for Linux, FreeBSD, macOS, Windows:

[github.com/mehrvarz/webcall-apps](https://github.com/mehrvarz/webcall-apps)

WebCall-Mastodon Bridge:

[timur.mobi/webcall/mastodon/](https://timur.mobi/webcall/mastodon)

TextChat E2EE Messaging:

[timur.mobi/webcall/more/#textchat](https://timur.mobi/webcall/more/#textchat)


# Building

With Go 1.19 installed: go build

[timur.mobi/webcall/install](https://timur.mobi/webcall/install)


# License

AGPL3.0 - see: [LICENSE](LICENSE)

## 3rd party code (external)

- github.com/lesismal/nbio
- go.etcd.io/bbolt
- github.com/mattn/go-mastodon
- github.com/pion/turn
- github.com/webrtcHacks/adapter.js

## 3rd party code (embedded)

- github.com/RapidLoop: skv
- AppRTC's sdputils.js: prefercodec.js
- mr-wang-from-next-door: GetOutboundIP()


