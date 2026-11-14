// Offline-first service worker SmartGarden v2.
// Кэширует приложение, онлайн-базу растений и просмотренные спутниковые тайлы — экономит трафик.
const CACHE = 'smartgarden-v2.4.3'; // меняйте при каждом выпуске — старый кэш удалится
const TILES = 'smartgarden-tiles-v2';
const MAX_TILES = 400;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg', './plants-db/v2/index.json']).catch(() => {})));
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

  // Онлайн-база растений (индекс, категории): сеть, при ошибке — кэш
  if (url.pathname.includes('/plants-db/')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }
  // Сама страница приложения: сначала сеть (чтобы обновления приходили сразу), без сети — кэш
  if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
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
