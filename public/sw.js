const CACHE_NAME = 'costruker-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.css',
  '/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Cache and network fallback (Network first strategy for API, Cache first for assets)
self.addEventListener('fetch', event => {
  if(event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) return response;
          return fetch(event.request);
        })
    );
  }
});
