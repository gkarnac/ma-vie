const CACHE_NAME = 'ma-vie-v10';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

// Installation — mise en cache des ressources
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache les assets locaux en priorité, les CDN en best-effort
      return cache.addAll(['./index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'])
        .then(() => {
          // CDN en best-effort (ne bloque pas si hors ligne)
          return Promise.allSettled([
            cache.add('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js')
          ]);
        });
    })
  );
  self.skipWaiting();
});

// Activation — nettoyage des anciens caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — stratégie Network First pour l'API Google, Cache First pour le reste
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API Google Sheets → toujours réseau (pas de cache)
  if (url.hostname.includes('script.google.com') || 
      url.hostname.includes('googleapis.com')) {
    return; // laisse passer sans intercepter
  }

  // Tout le reste → Cache First, fallback réseau
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Mettre en cache les nouvelles ressources valides
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => {
        // Hors ligne et pas en cache → retourner l'app principale
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
