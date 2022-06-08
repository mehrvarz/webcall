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
rm -f webroot/button/caller.js
ln webroot/user/caller.js webroot/button/caller.js

rm -f webroot/user/prefercodec.js
ln webroot/callee/prefercodec.js webroot/user/prefercodec.js
rm -f webroot/button/prefercodec.js
ln webroot/callee/prefercodec.js webroot/button/prefercodec.js

