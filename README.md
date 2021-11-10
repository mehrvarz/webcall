<div align="center">
  <a href="https://timur.mobi/webcall"><img src="webroot/webcall-logo.png" alt="WebCall"></a>
</div>

# WebCall WebRTC Telephony Server

Hifi audio telephony + video telephony + bidirectional file transfer.
No tracking. No logging. All data delivered over E2E-encrypted P2P.
All features available to clients without software installation. 
All you need is a 2020+ browser.

Video telephony is coming with release 2.0 in Nov. 2021. You can use this, for instance, to make sure you don't share your sensitive files with the wrong person. Your files will be delivered over the same encrypted P2P-link used for audio/video.

You get better audio and video than in any conferencing app. Strict use of P2P offers lower latency and more frames over the same up-link. Participants can turn their video on and off at any time during the call.

Here you can get a WebCall phone number to play around with:

[https://timur.mobi/webcall](https://timur.mobi/webcall)

# Installation

Here I describe how you can run WebCall for yourself and for all your friends.
A single WebCall server can provide free and secure telephony for 1M users.
A small server (1-core, shared) can host up to 50K concurrent users in 1GB of RAM.
If you intend to host only 1000 users (or less), you can do so within 100KB of RAM.
In other words, you can easily run WebCall as a small daemon along side your web 
server on a very small server.

Keep in mind that WebCall is basically only assisting clients to connect to each other.
All data (audio/video/files) is sent directly from device to device. From the point 
of view of the server this is very economical.

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

