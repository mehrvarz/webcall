rm adapter-8.2.2.js
wget https://github.com/webrtcHacks/adapter/raw/gh-pages/adapter-8.2.2.js
cp adapter-8.2.2.js webroot/callee/adapter-latest.js
rm adapter-8.2.2.js
rm -f webroot/user/adapter-latest.js
ln webroot/callee/adapter-latest.js webroot/user/adapter-latest.js

