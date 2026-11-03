// Service Worker for AR Living Memory
const CACHE_NAME = 'ar-fresh-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Always fetch fresh network content for AR assets and media
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
