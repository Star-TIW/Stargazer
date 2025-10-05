self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("stargazer-cache-v1").then((cache) => {
      return cache.addAll([
        "/",
        "/index.html",
        "/live.css",
        "/main.js",
        "/manifest.json",
        "/stargazer.png"
      ]);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});