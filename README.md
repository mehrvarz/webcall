<div align="center">
  <a href="https://timur.mobi/webcall"><img src="webroot/webcall-logo.png" alt="WebCall"></a>
</div>

# WebCall WebRTC Telephony Server

Browser based telephony P2P E2EE with very high audio quality.
WebCall is lightweight and easy to use.

[https://timur.mobi/webcall](https://timur.mobi/webcall)

# Installation

A big WebCall server can provide 1M users with free and secure telephony.
1000 mini WebCall servers, each hosting 10K uses, can do the same for 10M users.
You can always use my server. But you can also run WebCall yourself.
Or have someone you trust do it. It's not that difficult.
Here I describes how you can build WebCall server and provide service for 10-30K users
on a dirt cheap server.

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

