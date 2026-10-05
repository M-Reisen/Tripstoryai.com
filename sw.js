// Travona – Service Worker
// Macht die Seite als App installierbar und offline nutzbar (Outback, Flugzeug).
// Seiten, Skripte, Schriften und Fotos kommen weiterhin zuerst frisch aus dem Netz und
// werden dabei auf dem Gerät gemerkt. Nur ohne Netz wird die gemerkte Fassung gezeigt.
// Seiten, die noch nie geöffnet wurden, zeigen offline eine freundliche Hinweisseite.
// Die Reisedaten selbst (Einträge, Ausgaben) merkt sich offline-sync.js.
const CORE = 'travona-offline-v2';
const PAGES = 'travona-seiten-v1';
const FILES = 'travona-dateien-v1';
const PHOTOS = 'travona-fotos-v1';
const KEEP = [CORE, PAGES, FILES, PHOTOS, 'travona-daten-v1']; // travona-daten-v1 gehört offline-sync.js
const OFFLINE_URL = '/offline.html';
const SUPABASE = 'https://celihvrblqqivtlvzbjp.supabase.co';
const CDN = ['cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'images.unsplash.com'];
const LIMIT = { [PAGES]: 40, [FILES]: 120, [PHOTOS]: 300 };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE)
      .then((c) => c.addAll([OFFLINE_URL, '/icon-192.png', '/offline-sync.js']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Welcher Speicher passt zu einer Adresse? null = nicht anfassen
function bucket(url) {
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_vercel/')) return null;
    return FILES;
  }
  if (CDN.includes(url.hostname)) return FILES;
  if (url.origin === SUPABASE && url.pathname.startsWith('/storage/v1/object/public/')) return PHOTOS;
  return null;
}

async function remember(name, req, res) {
  try {
    const c = await caches.open(name);
    await c.put(req, res);
    const keys = await c.keys();
    const max = LIMIT[name] || 100;
    for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
  } catch (e) {}
}

// Fremde Dateien ohne CORS-Modus als CORS laden, damit sie nicht als undurchsichtige
// (und im Speicher sehr groß gezählte) Antworten gemerkt werden.
async function load(req) {
  if (req.mode === 'no-cors' && new URL(req.url).origin !== self.location.origin) {
    try {
      const r = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
      if (r.ok) return r;
    } catch (e) { /* weiter mit normaler Anfrage */ }
  }
  return fetch(req);
}

async function networkFirst(req, name) {
  try {
    const res = await load(req);
    if (res.ok && res.type !== 'opaque') remember(name, req, res.clone());
    return res;
  } catch (e) {
    const hit = await caches.match(req, { ignoreVary: true });
    if (hit) return hit;
    throw e;
  }
}

async function page(req) {
  try {
    const res = await fetch(req);
    if (res.ok && !res.redirected && res.type === 'basic') remember(PAGES, req, res.clone());
    return res;
  } catch (e) {
    const hit = await caches.match(req, { ignoreVary: true });
    return hit || caches.match(OFFLINE_URL);
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') { event.respondWith(page(req)); return; }
  if (req.headers.has('range')) return;
  const url = new URL(req.url);
  const name = bucket(url);
  if (name) event.respondWith(networkFirst(req, name));
});

// Erster Besuch: die Seite war noch nicht unter Kontrolle des Service Workers.
// offline-sync.js schickt uns die Adressen der Seite und ihrer Skripte zum Merken.
self.addEventListener('message', (event) => {
  const d = event.data || {};
  if (d.type !== 'merken' || !Array.isArray(d.urls)) return;
  event.waitUntil((async () => {
    for (const u of d.urls.slice(0, 40)) {
      try {
        const url = new URL(u, self.location.origin);
        const isPage = url.href === new URL(d.urls[0], self.location.origin).href;
        const name = isPage ? PAGES : bucket(url);
        if (!name || (isPage && url.origin !== self.location.origin)) continue;
        const req = new Request(url.href, { credentials: 'same-origin' });
        if (await caches.match(req)) continue;
        const res = isPage ? await fetch(req) : await load(new Request(url.href, { mode: 'no-cors' }));
        if (res.ok && !res.redirected && res.type !== 'opaque') await remember(name, req, res);
      } catch (e) {}
    }
  })());
});
