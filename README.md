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
A small (1GB, shared) server can host 10-30K users.
Here I describe how you can build and run WebCall server for yourself:

[https://timur.mobi/webcall/install](https://timur.mobi/webcall/install)

# Distributed WebCall

With WebCall there can be a network of telephony servers, ultimately offering
free, boundless telephony to everyone.
This works because WebCall servers can be easily operated and as a user you are able to reach any other user,
independet of where you are being hosted.
All this is possible without any server-to-server coordination or communication.
Here I describe how this works:

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

