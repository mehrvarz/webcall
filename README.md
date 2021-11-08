<div align="center">
  <a href="https://timur.mobi/webcall"><img src="webroot/webcall-logo.png" alt="WebCall"></a>
</div>

# WebCall WebRTC Telephony Server

Hifi audio telephony + video telephony + bidirectional file transfer.
No tracking. No logging. All data is delivered over E2E-encrypted P2P.
Run the server yourself.

Video telephony is coming with release 2.0 in Nov. 2021. Here, caller and callee are able to turn video on and off individually at any time during a call. You can use this, for instance, to make sure you are sending your sensitive files only to the person you want to share them with. Your files will be delivered over the same encrypted P2P-link used for audio and video. To make use of WebCall, neither you, nor the other party needs to install any software. All you need is a 2020+ browser.

Audio and video are better in WebCall compare to conferencing apps. Strict use of P2P offers higher resolution, lower latency and more frames over the same internet connection.

Get a WebCall phone number here:

[https://timur.mobi/webcall](https://timur.mobi/webcall)

# Installation

Here I describe how you can build WebCall and run it for yourself and all your 
friends. A single WebCall server can provide free and secure telephony to 1M users.
A small server (1-core, shared) can host up to 50K concurrent users in 1GB of RAM.
If you intend to host up to 1000 concurrent users or less, you can do so within
100KB of RAM. In other words, you can easily run WebCall as a small daemon along 
with your web server on a very small server.

Keep in mind that WebCall is only assisting the clients to connects to each other.
All data (audio/video/files) is then sent directly from device to device. From the 
point of view of the server this is very economical.

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

