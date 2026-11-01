const CACHE_NAME = 'sto-k-odnomu-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/sound.js',
  './js/db.js',
  './js/editor.js',
  './js/game.js',
  './js/sw-register.js',
  './js/app.js',
  './assets/default_pack.json',
  './assets/birthday_14_pack.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

// Установка Service Worker и кэширование ресурсов
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Caching app shell assets');
      const cachePromises = ASSETS.map((asset) => {
        return cache.add(asset).catch((err) => {
          console.warn(`[SW] Could not pre-cache: ${asset}`, err);
        });
      });
      await Promise.all(cachePromises);
      return self.skipWaiting();
    })
  );
});

// Активация и удаление старого кэша
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Purging outdated cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Перехват запросов (Cache first with network fallback)
self.addEventListener('fetch', (event) => {
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Фоновое обновление
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {/* оффлайн */});
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
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
