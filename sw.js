// Offline-first service worker SmartGarden v2.
// Кэширует приложение, онлайн-базу растений и просмотренные спутниковые тайлы — экономит трафик.
const CACHE = 'smartgarden-v2';
const TILES = 'smartgarden-tiles-v2';
const MAX_TILES = 400;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg', './plants-db/plants.json']).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== TILES).map((k) => caches.delete(k)))));
  self.clients.claim();
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Спутниковые тайлы: cache-first, ограниченный размер
  if (url.hostname.endsWith('arcgisonline.com')) {
    e.respondWith(
      caches.open(TILES).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        // кэшируем только CORS-ответы: «непрозрачные» нельзя склеить в снимок участка
        if (res.ok && res.type !== 'opaque') {
          c.put(req, res.clone());
          trim(TILES, MAX_TILES);
        }
        return res;
      })
    );
    return;
  }
  // API (поиск, погода, Википедия) — только сеть, кэшем управляет приложение
  if (url.origin !== location.origin && !url.hostname.includes('fonts.g')) return;

  // База растений: сеть, при ошибке — кэш
  if (url.pathname.endsWith('/plants.json')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }
  // Остальное: cache-first
  e.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
    )
  );
});
