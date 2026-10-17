// Service worker de Tempus fugit : permet d'utiliser l'appli hors ligne.
// Stratégie : on sert le cache immédiatement et on le met à jour en arrière-plan
// (une mise à jour publiée est donc visible au 2e chargement). Pour forcer le
// renouvellement du cache d'un coup, incrémenter CACHE_VERSION.
const CACHE_VERSION = 'v2';
const CACHE_NAME = 'tempus-fugit-' + CACHE_VERSION;

const ASSETS = [
  './',
  './index.html',
  './app/style.css',
  './app/manifest.webmanifest',
  './app/icon-192.png',
  './app/icon-512.png',
  './app/icon-maskable-512.png',
  './app/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('tempus-fugit-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      if (res) return res;
      // Hors ligne et fichier inconnu : pour une navigation, on rend la page principale
      if (req.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      return new Response('Hors ligne', { status: 503, statusText: 'Hors ligne' });
    })
  );
});
