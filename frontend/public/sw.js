// NASA CLPS Lunar Browser - Offline Service Worker
const CACHE_NAME = 'clps-lunar-offline-v2';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/game',
  '/terrain/lunar-detail-color.png',
  '/terrain/lunar-regolith-normal.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Precache partial miss, continuing:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key.startsWith('clps-lunar-offline-') && key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Avoid caching non-http schemes
  if (!url.protocol.startsWith('http')) return;

  // For API calls, try network first, then return offline synthetic error if unavailable
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({
            error: 'Network unavailable. Running in offline mission mode.',
            offline: true,
          }),
          {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })
    );
    return;
  }

  // A release marker must describe the running server, never a cached build.
  if (url.pathname === '/build-info.json') {
    event.respondWith(fetch(request, {cache: 'no-cache'}));
    return;
  }

  // Always ask the server for HTML first: cached shells otherwise hide deployed UI changes.
  // Keep previously visited routes usable when the connection is genuinely offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, {cache: 'no-cache'}).then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
        }
        return response;
      }).catch(async () => {
        const saved = await caches.match(request);
        if (saved) return saved;
        const shell = await caches.match('/index.html');
        if (shell) return shell;
        return new Response('Offline: this page has not been saved on this device yet.', {
          status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'},
        });
      })
    );
    return;
  }

  // The handoff uses stable filenames. Fetch them first so a release cannot mix
  // an old navigation script with a new landing page.
  if (url.origin === self.location.origin && url.pathname.startsWith('/brahmos/')) {
    event.respondWith(fetch(request, {cache: 'no-cache'}).then(response => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
      }
      return response;
    }).catch(async () => (await caches.match(request)) || new Response('Asset unavailable offline', {status: 503})));
    return;
  }

  // Hashed assets may use the cached copy while refreshing in the background.
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});
