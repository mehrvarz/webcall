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

