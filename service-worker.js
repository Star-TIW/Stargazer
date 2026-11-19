const CACHE_NAME = "stargazer-cache-v24";
const STATIC_ASSETS = [
  "/", "/index.html", "/home.css", "/movies.css", "/movies.js", "/player-sources.js", "/provider-frame.js",
  "/particle-config.js", "/sync.js", "/particles.min.js", "/settings.html", "/manifest.json",
  "/stargazer.png", "/stargazer-192.png", "/stargazer-512.png",
  "/star.png", "/live/", "/live/index.html", "/live/live.css", "/live/live.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.allSettled(STATIC_ASSETS.map(path => cache.add(path)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("stargazer-cache-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !STATIC_ASSETS.includes(url.pathname) || url.search || request.headers.has("range")) return;
  const response = fetch(request);
  event.waitUntil(response.then(async result => {
    if (result.ok && !result.redirected) {
      const copy = result.clone();
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, copy);
    }
  }).catch(() => {}));
  event.respondWith(response.catch(async () => (await caches.match(request)) || Response.error()));
});
