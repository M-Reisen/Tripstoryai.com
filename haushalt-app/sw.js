// Haushaltsbuch-App: alle Dateien beim ersten Öffnen merken, danach läuft sie ohne Internet.
// Bei neuer Version CACHE hochzählen.
const CACHE = 'haushaltsbuch-app-v2';
const FILES = [
  '/haushalt-app/', '/haushalt-app/index.html', '/haushalt-app/speicher.js', '/haushalt-app/manifest.webmanifest',
  '/haushalt-app/icon-180.png', '/haushalt-app/icon-192.png', '/haushalt-app/icon-512.png',
  '/fonts/fonts.css', '/fonts/dm-sans-latin.woff2', '/fonts/dm-sans-latin-ext.woff2',
  '/fonts/playfair-display-latin.woff2', '/fonts/playfair-display-latin-ext.woff2'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.indexOf('haushaltsbuch-app-') === 0 && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Erst Netz (damit Updates ankommen), ohne Netz aus dem Speicher; Seitenaufrufe immer auf die App-Seite
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const nav = req.mode === 'navigate';
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const c = await caches.open(CACHE);
        c.put(nav ? '/haushalt-app/index.html' : req, res.clone());
      }
      return res;
    } catch (err) {
      const hit = nav ? await caches.match('/haushalt-app/index.html') : await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
