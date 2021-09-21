echo 'const apiPath = "/rtcsig";' > webroot/user/custom.js
echo 'const gentle = true;' >> webroot/user/custom.js
echo 'const singlebutton = false;' >> webroot/user/custom.js
echo 'const apiPath = "/rtcsig";' > webroot/callee/custom.js
echo 'const gentle = true;' >> webroot/callee/custom.js
echo 'const apiPath = "/rtcsig";' > webroot/button/custom.js
echo 'const gentle = true;' >> webroot/button/custom.js
echo 'const singlebutton = true;' >> webroot/button/custom.js
wget https://webrtc.github.io/adapter/adapter-7.7.1.js
cp adapter-7.7.1.js webroot/adapter-latest.js
rm adapter-7.7.1.js

