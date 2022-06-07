wget https://github.com/webrtcHacks/adapter/raw/gh-pages/adapter-8.1.1.js
cp adapter-8.1.1.js webroot/callee/adapter-latest.js
rm adapter-8.1.1.js
rm -f webroot/user/adapter-latest.js
ln webroot/callee/adapter-latest.js webroot/user/adapter-latest.js
rm -f webroot/button/adapter-latest.js
ln webroot/callee/adapter-latest.js webroot/button/adapter-latest.js
rm -f webroot/user/client.js
ln webroot/callee/client.js webroot/user/client.js
rm -f webroot/button/client.js
ln webroot/callee/client.js webroot/button/client.js



