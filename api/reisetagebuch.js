// Schöne Reise-Adressen:
//   /reisetagebuch                  -> Übersicht der Reiseziele
//   /reisetagebuch/<land>           -> alle öffentlichen Reisen eines Ziels
//   /reisetagebuch/<land>/<name>    -> die Reise selbst (ausgeliefert wird die Vorlage)
//   /reisevorlage.html?reise=<id>   -> alte Adresse: leitet auf die neue weiter, sofern vorhanden
const fs = require('fs');
const path = require('path');
const S = require('./_shared');

function send(res, status, html, cache) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (cache) res.setHeader('Cache-Control', cache);
  res.status(status).send(html);
}

function notFound(res) {
  const html = S.listPage({
    title: 'Reise nicht gefunden · Travona', desc: 'Diese Seite gibt es nicht.',
    path: '/reisetagebuch', robots: 'noindex, nofollow',
    crumbs: '<a href="/index.html">Travona</a>', h1: 'Reise nicht gefunden',
    lead: 'Diese Adresse gibt es nicht (mehr). Stöbere bei den Reisezielen.',
    inner: '<div class="grid"><div class="empty"><a class="btn" href="/reisetagebuch">Zu den Reisezielen</a></div></div>'
  });
  send(res, 404, html, 'public, s-maxage=60');
}

// Die Vorlage wird direkt aus der Datei gelesen (vercel.json: includeFiles). Nur wenn das nicht klappt,
// wird sie als Rückfall per Abruf geholt. Zu kurze oder unvollständige Seiten werden nie ausgeliefert.
function looksComplete(t) {
  return typeof t === 'string' && t.length > 5000 && /<body/i.test(t) && /<\/html>\s*$/i.test(t);
}
async function fetchPage(origin, file) {
  try {
    const t = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    if (looksComplete(t)) return t;
  } catch (e) { /* Rückfall */ }
  const r = await fetch(origin + '/' + file);
  if (!r.ok) throw new Error('Seite nicht ladbar: ' + file + ' (' + r.status + ')');
  const t = await r.text();
  if (!looksComplete(t)) throw new Error('Seite unvollständig: ' + file);
  return t;
}

// Reise-Seite unter der schönen Adresse
async function tripPage(res, origin, land, slug) {
  const rows = await S.getTrips('land_slug=eq.' + S.enc(land) + '&slug=eq.' + S.enc(slug) + '&limit=1');
  if (!rows || !rows.length) {
    // Der Server sieht nur öffentliche und „per Link“ geteilte Reisen. Private Reisen (und unbekannte
    // Adressen) bekommen die Vorlage ohne Angaben; sie schlägt die Reise mit der Anmeldung des Besuchers nach.
    const generic = await fetchPage(origin, 'reisevorlage.html');
    const html404 = S.injectHead(generic, {
      title: null, tags: '<meta name="robots" content="noindex, nofollow">', route: { land, slug }
    });
    return send(res, 200, html404, 'public, s-maxage=60');
  }
  const row = rows[0];
  const file = S.has(S.SPECIAL_PAGES, row.id) ? S.SPECIAL_PAGES[row.id] : 'reisevorlage.html';
  let html = await fetchPage(origin, file);
  const meta = S.parseMeta(row);
  const url = S.BASE + S.tripPath(row);
  let title = null, tags;
  if (row.visibility === 'public' || row.visibility === 'link') {
    title = S.tripTitle(meta, row);
    const image = /^https:\/\//i.test(meta.img || '') ? meta.img : S.BASE + '/og-default.png';
    tags = S.shareTags({
      title, desc: S.tripDesc(meta, row), image, url,
      robots: row.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'
    });
  } else {
    tags = '<meta name="robots" content="noindex, nofollow">';   // private Reisen: nichts preisgeben
  }
  html = S.injectHead(html, { title, tags, id: row.id });
  send(res, 200, html, 'public, s-maxage=60, stale-while-revalidate=300');
}

// Alte Adresse: weiterleiten oder (ohne Land/Adressname) wie bisher ausliefern
async function altPage(res, origin, id) {
  const rows = await S.getTrips('id=eq.' + S.enc(id) + '&limit=1');
  const row = rows && rows[0];
  if (row && row.land_slug && row.slug && (row.visibility === 'public' || row.visibility === 'link')) {
    res.setHeader('Location', S.tripPath(row));
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    res.status(301).end();
    return;
  }
  let html = await fetchPage(origin, 'reisevorlage.html');
  let title = null, tags = '<meta name="robots" content="noindex, nofollow">';
  if (row && (row.visibility === 'public' || row.visibility === 'link')) {
    const meta = S.parseMeta(row);
    title = S.tripTitle(meta, row);
    const image = /^https:\/\//i.test(meta.img || '') ? meta.img : S.BASE + '/og-default.png';
    tags = S.shareTags({
      title, desc: S.tripDesc(meta, row), image,
      url: S.BASE + '/reisevorlage.html?reise=' + S.enc(id),
      robots: row.visibility === 'public' ? 'index, follow' : 'noindex, nofollow'
    });
  }
  html = S.injectHead(html, { title, tags, id: null });   // Reise-Schlüssel steht in der Adresse
  send(res, 200, html, 'public, s-maxage=60, stale-while-revalidate=300');
}

// Alle öffentlichen Reisen eines Ziels (Hauptland oder weiteres Land)
async function landPage(res, land) {
  const rows = await S.tripsForLand(land);
  if (!rows.length) return notFound(res);
  const name = S.landName(rows, land);
  const n = rows.length;
  const html = S.listPage({
    title: 'Reisetagebücher ' + name + ' · Travona',
    desc: 'Echte Reisetagebücher aus ' + name + ': Routen, Fotos und Momente von unterwegs. ' +
      n + (n === 1 ? ' Reise' : ' Reisen') + ' auf Travona.',
    path: '/reisetagebuch/' + land, robots: 'index, follow',
    crumbs: '<a href="/index.html">Travona</a> › <a href="/reisetagebuch">Reiseziele</a> › ' + S.esc(name),
    h1: 'Reisetagebücher ' + name,
    lead: 'Echte Reisen aus ' + name + ' – mit Route, Fotos und Tagesberichten.',
    inner: '<div class="grid">' + rows.map(S.cardHtml).join('') + '</div>'
  });
  send(res, 200, html, 'public, s-maxage=300, stale-while-revalidate=600');
}

// Übersicht aller Reiseziele (Hauptländer und weitere Länder)
async function overview(res) {
  const rows = (await S.getTrips('visibility=eq.public&order=created_at.desc')) || [];
  const lands = {};
  rows.forEach((r) => {
    if (!r.land_slug || !r.slug) return;          // nur Reisen mit schöner Adresse
    S.landsOf(r).forEach((l) => {
      if (!lands[l.slug]) lands[l.slug] = { name: l.name, count: 0, row: r, main: r.land_slug === l.slug };
      // Titelbild bevorzugt von einer Reise, deren Hauptland es ist
      if (!lands[l.slug].main && r.land_slug === l.slug) { lands[l.slug].row = r; lands[l.slug].main = true; }
      lands[l.slug].count++;
    });
  });
  const keys = Object.keys(lands).sort((a, b) => lands[a].name.localeCompare(lands[b].name, 'de'));
  const inner = '<div class="grid">' + (keys.length ? keys.map((k) => {
    const l = lands[k], m = S.parseMeta(l.row);
    const img = /^https:\/\//i.test(m.img || '')
      ? '<img src="' + S.esc(m.img) + '" alt="" loading="lazy">'
      : '<span class="emoji">' + S.esc(m.emoji || '🌍') + '</span>';
    return '<a class="card" href="/reisetagebuch/' + S.esc(k) + '"><div class="cover">' + img + '</div>' +
      '<div class="body"><div class="name">' + S.esc(l.name) + '</div>' +
      '<div class="loc">' + l.count + (l.count === 1 ? ' Reise' : ' Reisen') + '</div></div></a>';
  }).join('') : '<div class="empty">Noch keine öffentlichen Reisen.</div>') + '</div>';
  const html = S.listPage({
    title: 'Reisetagebücher nach Reiseziel · Travona',
    desc: 'Echte Reisetagebücher nach Reiseziel: Routen, Fotos und Momente von unterwegs.',
    path: '/reisetagebuch', robots: keys.length ? 'index, follow' : 'noindex, follow',
    crumbs: '<a href="/index.html">Travona</a> › Reiseziele',
    h1: 'Reisetagebücher nach Reiseziel',
    lead: 'Such dir ein Ziel aus und lass dich von echten Reisen inspirieren.',
    inner
  });
  send(res, 200, html, 'public, s-maxage=300, stale-while-revalidate=600');
}

module.exports = async (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.travona.de';
  const origin = 'https://' + host;
  try {
    const q = new URL(req.url, 'https://x.invalid').searchParams;
    const land = S.clean(q.get('land')), slug = S.clean(q.get('slug'));
    const alt = S.clean(q.get('reise') || q.get('alt'));
    if (land && slug) return await tripPage(res, origin, land, slug);
    if (land) return await landPage(res, land);
    if (alt) return await altPage(res, origin, alt);
    return await overview(res);
  } catch (e) {
    console.error('reisetagebuch:', e && e.stack ? e.stack : e);
    const q2 = new URL(req.url, 'https://x.invalid').searchParams;
    const id2 = S.clean(q2.get('reise') || q2.get('alt'));
    // Alte Adresse: die Seite direkt ausliefern lassen (die Regel in vercel.json überspringt „direkt“)
    res.setHeader('Location', id2 ? '/reisevorlage.html?reise=' + S.enc(id2) + '&direkt=1' : '/index.html');
    res.status(302).end();
  }
};
