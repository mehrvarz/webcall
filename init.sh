echo 'const apiPath = "/rtcsig";' > webroot/user/custom.js
echo 'const gentle = true;' >> webroot/user/custom.js
echo 'const singlebutton = false;' >> webroot/user/custom.js
echo 'const apiPath = "/rtcsig";' > webroot/callee/custom.js
echo 'const gentle = true;' >> webroot/callee/custom.js
echo 'const apiPath = "/rtcsig";' > webroot/button/custom.js
echo 'const gentle = true;' >> webroot/button/custom.js
echo 'const singlebutton = true;' >> webroot/button/custom.js
#wget https://webrtc.github.io/adapter/adapter-8.1.0.js
wget https://github.com/webrtcHacks/adapter/raw/gh-pages/adapter-8.1.1.js
cp adapter-8.1.1.js webroot/adapter-latest.js
rm adapter-8.1.1.js

