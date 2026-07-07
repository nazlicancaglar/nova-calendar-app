const CACHE_NAME = 'nova-workspace-v1';
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

// Dynamic cache-first / stale-while-revalidate strategy for same-origin requests
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Skip APIs and cross-origin requests
  if (req.url.includes('/api/') || !req.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      // Fetch from network to update the cache in the background
      const fetchPromise = fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const cacheCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, cacheCopy);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Ignore network errors in background revalidation
      });

      // If cached, return immediately and let fetch update it in background
      if (cachedResponse) {
        return cachedResponse;
      }

      // If not cached, wait for the network fetch
      return fetchPromise;
    })
  );
});
