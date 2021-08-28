self.addEventListener('push', event => {
  console.log('[Service Worker] Push Received data:',event.data.text());
  const options = {
    body: event.data.text(),
	sound: '/webcall/callee/notification.mp3', // does not seem to work
	timestamp: Date.parse('01 Jan 2000 00:00:00'), // does not seem to work
	image: '/apple-touch-icon.png' // does not seem to work
//	badge: "/badge.png", // ???
//	icon: "/plug-512.png", // ???

  };
  event.waitUntil(self.registration.showNotification("WebCall", options));
});

