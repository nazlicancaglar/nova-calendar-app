const CACHE_NAME = 'nova-workspace-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Pre-cache static shell on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-caching failed during install, will cache on the fly:', err);
      });
    })
  );
  self.skipWaiting();
});

// Clean up old caches on activation
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Caching strategy for same-origin requests:
//  - Vite's hashed build assets (/assets/*.js, *.css) are IMMUTABLE — their
//    filename changes on every build — so cache-first is safe AND fast: instant
//    repeat loads and true offline capability, with zero staleness risk.
//  - Everything else (index.html, manifest.json, icons) stays network-first so
//    a deploy is picked up immediately; falls back to cache only when offline.
//    (Cache-first on index.html previously served stale JS after every deploy.)
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Skip APIs and cross-origin requests
  if (req.url.includes('/api/') || !req.url.startsWith(self.location.origin)) {
    return;
  }

  const url = new URL(req.url);
  const isHashedAsset = url.pathname.startsWith('/assets/');

  if (isHashedAsset) {
    // Cache-first for immutable hashed assets.
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, cacheCopy));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Network-first for the app shell and other same-origin files.
  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, cacheCopy);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(req))
  );
});
