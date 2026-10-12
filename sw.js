/* Service worker — Générateur de Dominos à Chanter
   Rend l'application utilisable hors ligne.
   - Les fichiers de l'application sont mis en cache à l'installation.
   - Stratégie « réseau d'abord, cache en secours » : quand on est en ligne, on reçoit toujours la dernière version
     publiée (et le cache est rafraîchi) ; hors ligne, ou si le réseau tarde trop, c'est la copie en cache qui sert.
   - La police Google « Patrick Hand » (altérations ♯ ♭ de la portée) est mise en cache elle aussi.
   Pour forcer une mise à jour du cache après une publication, incrémenter VERSION. */

const VERSION = 'dominos-v4';
const CACHE_APP = `${VERSION}-app`;
const CACHE_FONTS = `${VERSION}-fonts`;

const FICHIERS_APP = [
    './',
    'index.html',
    'app/style.css',
    'app/manifest.webmanifest',
    'app/icon-192.png',
    'app/icon-512.png',
    'app/icon-maskable-512.png',
    'app/apple-touch-icon.png'
];

const URL_CSS_POLICE = 'https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap';
const DELAI_RESEAU_MS = 4000;

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cacheApp = await caches.open(CACHE_APP);
        // Les fichiers de l'application sont indispensables : si l'un manque, l'installation échoue et sera retentée.
        await cacheApp.addAll(FICHIERS_APP.map(u => new Request(u, { cache: 'reload' })));

        // La police est un « plus » : son échec (hors ligne, site bloqué) n'empêche pas l'installation.
        try {
            const cacheFonts = await caches.open(CACHE_FONTS);
            const repCss = await fetch(URL_CSS_POLICE, { mode: 'cors' });
            if (repCss.ok) {
                const css = await repCss.clone().text();
                await cacheFonts.put(URL_CSS_POLICE, repCss);
                const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/['"]/g, ''));
                await Promise.all(urls.map(async (u) => {
                    try {
                        const r = await fetch(u, { mode: 'cors' });
                        if (r.ok) await cacheFonts.put(u, r);
                    } catch (e) { /* ignoré */ }
                }));
            }
        } catch (e) { /* ignoré */ }

        self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const noms = await caches.keys();
        await Promise.all(
            noms.filter(n => n !== CACHE_APP && n !== CACHE_FONTS).map(n => caches.delete(n))
        );
        await self.clients.claim();
    })());
});

// Réseau d'abord (avec délai maximal), sinon cache.
async function reseauPuisCache(request) {
    const cache = await caches.open(CACHE_APP);
    try {
        const reponse = await Promise.race([
            fetch(request),
            new Promise((_, rejet) => setTimeout(() => rejet(new Error('delai')), DELAI_RESEAU_MS))
        ]);
        if (reponse && reponse.ok) cache.put(request, reponse.clone());
        return reponse;
    } catch (e) {
        const enCache = await cache.match(request, { ignoreSearch: true });
        if (enCache) return enCache;
        if (request.mode === 'navigate') {
            const accueil = await cache.match('index.html') || await cache.match('./');
            if (accueil) return accueil;
        }
        throw e;
    }
}

// Cache d'abord pour la police (elle ne change pas), avec rafraîchissement en arrière-plan.
async function cachePuisReseau(request) {
    const cache = await caches.open(CACHE_FONTS);
    const enCache = await cache.match(request);
    const maj = fetch(request).then((reponse) => {
        if (reponse && (reponse.ok || reponse.type === 'opaque')) cache.put(request, reponse.clone());
        return reponse;
    }).catch(() => null);
    return enCache || (await maj) || Response.error();
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (url.origin === self.location.origin) {
        event.respondWith(reseauPuisCache(request));
    } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(cachePuisReseau(request));
    }
});
