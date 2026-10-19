// Offline support: serve from cache, refresh the cache in the background.
// A new version of the game shows up on the next launch after an update.
const CACHE = 'monster-truck-v4';
const FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'src/main.js',
  'src/input.js',
  'src/truck.js',
  'src/world.js',
  'src/effects.js',
  'src/audio.js',
  'src/parts.js',
  'src/cars.js',
  'src/truck-art.js',
  'src/tricks.js',
  'src/consts.js',
  'src/track.js',
  'src/crushables.js',
  'src/powerups.js',
  'src/scenery.js',
  'src/sky.js',
  'src/textures.js',
  'vendor/three.module.min.js',
  'vendor/BufferGeometryUtils.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const fresh = caches.open(CACHE).then((cache) =>
    fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }),
  );
  e.waitUntil(fresh.catch(() => {}));
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((cached) => cached || fresh),
  );
});
