<div align="center">
  <a href="https://timur.mobi/webcall"><img src="webroot/webcall-logo.png" alt="WebCall"></a>
</div>

# WebCall Telephony Server

WebCall offers audio and video telephony plus bidirectional file transfer plus secure TextChat. WebCall delivers the best video quality on top of your internet connection. Strict use of P2P connectivity results in low latency and high frame rates. Audio + video + two-way file transfer + TextChat can be used in parallel. Audio and Video can be turned on and off individually at any time during the call.

WebCall offers very high audio quality. With a 20-320 bps adaptive bitrate (Opus codec) your calls sound better than most internet radio stations. It's a joy to use, especially for long distance calls.

WebCall sessions are always end-to-end encrypted. This prevents others from listening in on your calls.

WebCall operates fully self-contained. It makes no use of 3rd party services (STUN, TURN, etc.).
This means that no external party can track you.

WebCall web client works on iPhone, Android, Linux, macOS and Windows with a 2020+ web browser.
This means that you can receive calls from anyone on the internet:

[timur.mobi/webcall](https://timur.mobi/webcall)

WebCall-Mastodon Bridge delivers call notifications into your Mastodon inbox.
These notifications are sent whenever you do not pick up an incoming call.
You can answer your calls directly from your inbox:

[timur.mobi/webcall/mastodon](https://timur.mobi/webcall/mastodon)

TextChat E2EE Messaging:

[timur.mobi/webcall/more/#textchat](https://timur.mobi/webcall/more/#textchat)


# Native Clients

Native WebCall client for Android:

[github.com/mehrvarz/webcall-android](https://github.com/mehrvarz/webcall-android)

Native WebCall clients for Linux, FreeBSD, macOS, Windows:

[github.com/mehrvarz/webcall-apps](https://github.com/mehrvarz/webcall-apps)


# Building

With Go 1.19 run: go build

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


