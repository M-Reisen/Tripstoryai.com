// Travona – minimaler Service Worker
// Macht die Seite als App installierbar. Es werden KEINE Seiten zwischengespeichert:
// Alles kommt weiter frisch aus dem Netz. Nur wenn das Gerät offline ist,
// erscheint statt der Browser-Fehlerseite eine freundliche Hinweisseite.
const CACHE = 'travona-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll([OFFLINE_URL, '/icon-192.png']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});
