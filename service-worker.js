// Generated with a content version by tools/build-app.js.
const CACHE = 'quire-app-5e523914a97e';
const APP_SHELL = [
  '/',
  '/quire.html',
  '/manifest.webmanifest',
  '/quire-icon.svg',
  '/quire-icon-192.png',
  '/quire-icon-512.png',
  '/apple-touch-icon.png',
];
const worker = /** @type {any} */ (globalThis);

worker.addEventListener('install', (/** @type {any} */ event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

worker.addEventListener('activate', (/** @type {any} */ event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('quire-app-') && key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => worker.clients.claim()),
  );
});

worker.addEventListener('message', (/** @type {any} */ event) => {
  if (event.data === 'SKIP_WAITING') worker.skipWaiting();
});

worker.addEventListener('fetch', (/** @type {any} */ event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== worker.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('/');
        throw new Error(`No offline response for ${url.pathname}`);
      }),
  );
});
