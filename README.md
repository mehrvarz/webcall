<div align="center">
  <a href="https://timur.mobi/webcall"><img src="webroot/webcall-logo.png" alt="WebCall"></a>
</div>

# WebCall WebRTC Telephony Server

Browser based telephony P2P E2EE with very high audio quality.
WebCall is lightweight and easy to use.

[https://timur.mobi/webcall](https://timur.mobi/webcall)

# Installation

A single WebCall server can provide free and secure telephony to 1M users.
1000 mini servers, each hosting 10K uses, can do the same for 10M users.

You can always use my WebCall server. But you can also run the server yourself.
Or have someone you trust run it for you.
Here I describe how you can build WebCall server and offer telephony to 10-30K users
on a small server with 1GB memory.

[https://timur.mobi/webcall/install](https://timur.mobi/webcall/install)

# License

AGPL3.0 - see: [LICENSE](LICENSE)

# 3rd party code (external)

- github.com/lesismal/nbio
- go.etcd.io/bbolt
- github.com/pion/turn
- github.com/mrjones/oauth
- github.com/SherClockHolmes/webpush-go
- gopkg.in/ini
- webrtcHacks/adapter.js

# 3rd party code (embedded/modified)

- github.com/RapidLoop: skv
- github.com/ChimeraCoder: Twitter
- AppRTC's sdputils.js: prefercodec.js
- mr-wang-from-next-door: GetOutboundIP()
- github.com/mahan: AtomBool

