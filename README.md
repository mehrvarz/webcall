<div align="center">
  <a href="https://timur.mobi/webcall"><img src="webroot/webcall-logo.png" alt="WebCall"></a>
</div>

# WebCall WebRTC Telephony Server

Hifi audio telephony, video telephony plus bidirectional file transfer.
No tracking. No logging. All data delivered over E2E-encrypted P2P.
You can run the server yourself.

Video telephony is coming in Nov. 2021 with release 2.0. Here, caller and callee are able to turn their video on and off individually at any time during a call. You can use this, for instance, to make sure you are sending your sensitive files only to the right person. Your files will be delivered over the same P2P-link used for audio and video streaming. To use the full functionality, neither you, nor the other party has to install any software. All you need is a 2020+ browser running on any device.

Get yourself a WebCall phone number and start chatting and sharing right away:

[https://timur.mobi/webcall](https://timur.mobi/webcall)

# Installation

A single WebCall server can provide free and secure telephony to 1M users.
A small server (1-core, shared) can host up to 50K concurrent users in 1GB of RAM.
Here I describe how you can build WebCall and run it for yourself and all your 
friends. If you intend to host up to 1000 concurrent users only, you can do so within
100KB of RAM or less. In other words, you can easily run WebCall as a small 
daemon along with your web server:

[https://timur.mobi/webcall/install](https://timur.mobi/webcall/install)

# Decentral WebCall

We can build a network of telephony servers, offering completely free and
boundless audio and video telephony for everyone. This is possible because anyone can
run a WebCall server. And because, as a user, you can connect to any other WebCall user, 
regardless of who is doing the hosting.
All of this is possible with no central coordination and without any server-to-server
communication.

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

