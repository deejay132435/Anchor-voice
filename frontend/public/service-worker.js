// Anchor Service Worker v2 - Clean cache, no tracking
const CACHE_NAME = 'anchor-v2';
const ASSETS_TO_CACHE = [
  '/'
];

// Install event - minimal caching
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v2');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean ALL old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v2');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          console.log('[SW] Deleting cache:', name);
          return caches.delete(name);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network only, no cache
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      // Only use cache for navigation requests as fallback
      if (event.request.mode === 'navigate') {
        return caches.match('/');
      }
      return new Response('Offline', { status: 503 });
    })
  );
});

console.log('[SW] Anchor service worker v2 loaded - No caching, privacy-first');

