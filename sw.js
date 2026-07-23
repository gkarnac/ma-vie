// Service Worker désactivé — chargement direct depuis le réseau
self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
      .then(() => self.registration.unregister())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request));
});
