let firebaseAppCheckToken = null;

importScripts("./service_worker/push.js");
importScripts("./service_worker/appCheckToken.js");

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("my-cache").then((cache) => {
      return cache.addAll(["/"]);
    })
  );
});

self.addEventListener("activate", async (event) => {
  event.waitUntil(clients.claim());
  if (!firebaseAppCheckToken) {
    await requestAppCheckToken();
  }
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
