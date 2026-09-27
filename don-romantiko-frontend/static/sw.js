/**
 * DON ROMANTIKO POS - Service Worker
 * Enables PWA installation, offline application shell caching,
 * and offline fallback during power or network outages.
 */

const CACHE_NAME = 'don-romantiko-pos-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon.svg',
  './js/config.js',
  './js/state.js',
  './js/utils.js',
  './js/auth.js',
  './js/cashier.js',
  './js/dispatcher.js',
  './js/inventory.js',
  './js/navigation.js',
  './js/pax-modal.js',
  './js/payment.js',
  './js/sales.js',
  './js/tables.js',
  './js/offline-db.js',
  './js/main.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Some assets could not be pre-cached:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // For API endpoints, prefer network. If offline, let caller handle or fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(async (error) => {
        // Fallback for menu fetching if offline
        if (url.pathname === '/api/menu') {
          const cached = await caches.match(event.request);
          if (cached) return cached;
        }
        throw error;
      })
    );
    return;
  }

  // For static app shell assets, use Cache First with Network Fallback
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache for next time
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});
