<div align="center">
  <a href="https://timur.mobi/webcall"><img src="webroot/webcall-logo.png" alt="WebCall"></a>
</div>

# WebCall WebRTC Telephony Server

Browser based telephony over E2EE P2P with very high audio quality.
WebCall is lightweight and easy to use.
Fetch a unique phone number (a WebCall user link), send it to a friend and ask to be called back:

[https://timur.mobi/webcall](https://timur.mobi/webcall)

# Installation

A single WebCall server can provide free and secure telephony to 1M users.
A very small (1GB, shared) server can host up to 30K concurrent users.
Here I describe how you can build WebCall and run it for yourself and 30K friends:

[https://timur.mobi/webcall/install](https://timur.mobi/webcall/install)

# Decentralized WebCall

We can build a network of telephony servers, offering completely free and
boundless telephony to everyone. This is possible because new WebCall 
servers can be added easily by anyone. And because, as a user, you can interact with any 
other WebCall user, regardless of who is hosting you or them. 
All of this is possible without central coordination and without any server-to-server 
communication taking place.

[https://timur.mobi/webcall/info/server](https://timur.mobi/webcall/info/server)

# License

AGPL3.0 - see: [LICENSE](LICENSE)

# 3rd party code (external)

- github.com/lesismal/nbio
- go.etcd.io/bbolt
- github.com/pion/turn
- github.com/mrjones/oauth
- github.com/SherClockHolmes/webpush-go
- gopkg.in/ini
- github.com/webrtcHacks/adapter.js

# 3rd party code (embedded/modified)

- github.com/RapidLoop: skv
- github.com/ChimeraCoder: Twitter
- AppRTC's sdputils.js: prefercodec.js
- mr-wang-from-next-door: GetOutboundIP()
- github.com/mahan: AtomBool

