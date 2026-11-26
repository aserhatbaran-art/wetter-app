'use strict';
// Bei jeder Änderung an App-Dateien die Version erhöhen.
const CACHE = 'wetter-v7';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

// cache: 'reload' umgeht den HTTP-Cache des Browsers (GitHub Pages: max-age=600),
// sonst könnte die neue Version alte Dateien in ihren Cache übernehmen.
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Nur die eigene App-Hülle wird gecacht (stale-while-revalidate).
// Wetter-API-Anfragen laufen direkt übers Netz; die App puffert die letzten Daten selbst.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      // no-cache: beim Server nachfragen (ETag), nicht blind den HTTP-Cache nehmen
      const network = fetch(req, { cache: 'no-cache' })
        .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached || Response.error());
      if (cached) { e.waitUntil(network); return cached; }
      return network;
    }),
  );
});
