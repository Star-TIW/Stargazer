const CACHE_NAME = "stargazer-cache-v14";
const STATIC_ASSETS = [
  "/", "/index.html", "/home.css", "/movies.css", "/movies.js", "/player-sources.js",
  "/particle-config.js", "/particles.min.js", "/settings.html", "/manifest.json",
  "/stargazer.png", "/stargazer-192.png", "/stargazer-512.png",
  "/star.png", "/live/", "/live/index.html", "/live/live.css", "/live/live.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Always prefer fresh app code. Fall back to cache when offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
  );
});

