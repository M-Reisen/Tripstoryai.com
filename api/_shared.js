// Gemeinsame Helfer für die Reise-Seiten, Ziel-Seiten und die Sitemap.
// (Dateien mit „_“ am Anfang werden von Vercel nicht als eigene Adresse ausgeliefert.)
const SUPABASE_URL = 'https://celihvrblqqivtlvzbjp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlbGlodnJibHFxaXZ0bHZ6YmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDg4NzcsImV4cCI6MjA5ODIyNDg3N30.HkoN6h7tRtqOWdhidh4Gk7hrHmpNtW9rRteuVo3eFT4'; // öffentlicher anon-Key (derselbe wie in den Seiten)
const BASE = 'https://www.travona.de';

// Reisen mit eigener Seite (statt der Vorlage)
const SPECIAL_PAGES = { 'australien-2026': 'australien.html' };

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const enc = encodeURIComponent;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const clean = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

async function sbGet(path) {
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/' + path,
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

// Reisen laden; funktioniert auch, solange die neuen Spalten (land, land_slug, slug, weitere) noch fehlen
async function getTrips(filter) {
  const sets = [
    { sel: 'id,title,visibility,land,land_slug,slug,weitere', fill: {} },
    { sel: 'id,title,visibility,land,land_slug,slug', fill: { weitere: null } },
    { sel: 'id,title,visibility', fill: { land: null, land_slug: null, slug: null, weitere: null } }
  ];
  for (const set of sets) {
    const rows = await sbGet('trips?' + filter + '&select=' + set.sel);
    if (rows !== null) return rows.map((r) => Object.assign({}, set.fill, r));
  }
  return null;
}

// Hauptland + weitere Länder einer Reise als Liste {name, slug}
function landsOf(row) {
  const out = [];
  if (row.land_slug) out.push({ name: row.land || row.land_slug, slug: row.land_slug });
  (Array.isArray(row.weitere) ? row.weitere : []).forEach((w) => {
    if (w && w.slug && !out.some((o) => o.slug === w.slug)) out.push({ name: w.name || w.slug, slug: w.slug });
  });
  return out;
}

// Alle öffentlichen Reisen, die ein Land als Hauptland ODER als weiteres Land haben
async function tripsForLand(slug) {
  const main = (await getTrips('visibility=eq.public&land_slug=eq.' + enc(slug) + '&order=created_at.desc')) || [];
  const extra = (await getTrips('visibility=eq.public&weitere=cs.' + enc(JSON.stringify([{ slug: slug }])) + '&order=created_at.desc')) || [];
  const seen = new Set(), rows = [];
  main.concat(extra).forEach((r) => { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } });
  return rows;
}

function landName(rows, slug) {
  for (const r of rows) {
    const l = landsOf(r).find((x) => x.slug === slug);
    if (l) return l.name;
  }
  return slug;
}

function parseMeta(row) {
  try { return JSON.parse(row.title || '{}') || {}; } catch (e) { return { name: row.title }; }
}

function fmtRange(from, to) {
  const f = (iso) => { const p = String(iso).split('-'); return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : ''; };
  if (!from) return '';
  return to && to !== from ? f(from) + ' – ' + f(to) : f(from);
}

// Schöne Adresse einer Reise (oder die alte, falls noch kein Land/Adressname gesetzt ist)
function tripPath(row) {
  if (row.land_slug && row.slug) return '/reisetagebuch/' + row.land_slug + '/' + row.slug;
  if (has(SPECIAL_PAGES, row.id)) return '/' + SPECIAL_PAGES[row.id];
  return '/reisevorlage.html?reise=' + enc(row.id);
}

function tripTitle(meta, row) {
  const name = meta.name || 'Reise';
  const landPart = row.land && name.toLowerCase().indexOf(String(row.land).toLowerCase()) < 0 ? ' ' + row.land : '';
  return (meta.emoji ? meta.emoji + ' ' : '') + name + ' · Reisetagebuch' + landPart;
}
function tripDesc(meta, row) {
  return (meta.note && String(meta.note).trim()) ||
    [fmtRange(meta.from, meta.to), meta.loc || landsOf(row).map((l) => l.name).join(', ')].filter(Boolean).join(' · ') ||
    'Ein Reisetagebuch auf Travona.';
}

// Vorhandene Vorschau-/Such-Angaben entfernen und neue vor </head> einsetzen
function injectHead(html, { title, tags, id, route }) {
  html = html
    .replace(/<meta\s+property="og:[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="twitter:[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="robots"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '');
  if (title) html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + esc(title) + '</title>');
  if (id) html = html.replace(/<head>/i, '<head>\n<script>window.__REISE_ID=' + JSON.stringify(id) + ';</script>');
  // Reise vom Server nicht auffindbar (z. B. privat): die Seite schlägt sie mit der Anmeldung des Besuchers selbst nach
  else if (route) html = html.replace(/<head>/i, '<head>\n<script>window.__ROUTE=' + JSON.stringify(route) + ';</script>');
  return html.replace('</head>', tags + '\n</head>');
}

function shareTags({ title, desc, image, url, robots }) {
  return [
    '<meta name="description" content="' + esc(desc) + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Travona">',
    '<meta property="og:locale" content="de_DE">',
    '<meta property="og:title" content="' + esc(title) + '">',
    '<meta property="og:description" content="' + esc(desc) + '">',
    '<meta property="og:image" content="' + esc(image) + '">',
    '<meta property="og:url" content="' + esc(url) + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + esc(title) + '">',
    '<meta name="twitter:description" content="' + esc(desc) + '">',
    '<meta name="twitter:image" content="' + esc(image) + '">',
    '<meta name="robots" content="' + robots + '">',
    robots.indexOf('noindex') < 0 ? '<link rel="canonical" href="' + esc(url) + '">' : ''
  ].filter(Boolean).join('\n');
}

// ── Listen-Seiten (Reiseziele) ─────────────────────────────────────────
const LIST_CSS = `
:root{--ground:#F4EFE8;--ink:#1A1714;--fog:#6B6560;--terra:#B5714A;--rule:#D8D0C4;}
*{margin:0;padding:0;box-sizing:border-box;}
body{background:var(--ground);color:var(--ink);font-family:'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh;}
a{color:inherit;text-decoration:none;}
header{border-bottom:1px solid var(--rule);}
.hi{max-width:1200px;margin:0 auto;padding:16px 32px;display:flex;justify-content:space-between;align-items:center;}
.brand{height:36px;width:auto;background:#fff;padding:5px 10px;border-radius:6px;box-shadow:0 1px 4px rgba(26,23,20,.12);display:block;}
.btn{font-size:12px;letter-spacing:.06em;text-transform:uppercase;padding:10px 18px;border:1px solid var(--rule);border-radius:4px;color:var(--fog);}
.btn:hover{color:var(--ink);border-color:var(--ink);}
.hero{padding:72px 32px 40px;text-align:center;border-bottom:1px solid var(--rule);}
.eyebrow{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--terra);margin-bottom:18px;}
h1{font-family:'Playfair Display',Georgia,serif;font-weight:400;font-size:clamp(34px,5.4vw,58px);line-height:1.08;letter-spacing:-.5px;}
.lead{max-width:560px;margin:20px auto 0;font-size:16px;line-height:1.7;color:var(--fog);}
.crumbs{font-size:12px;letter-spacing:.06em;color:var(--fog);margin-bottom:20px;}
.crumbs a:hover{color:var(--ink);}
.wrap{max-width:1200px;margin:0 auto;padding:56px 32px 80px;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:2px;background:var(--rule);border:1px solid var(--rule);}
.card{background:var(--ground);display:block;transition:background .3s;}
.card:hover{background:#EDE8E0;}
.cover{height:200px;background:#e3dccf;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.cover img{width:100%;height:100%;object-fit:cover;display:block;}
.cover .emoji{font-size:40px;opacity:.5;}
.body{padding:26px 24px 28px;}
.dates{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--fog);margin-bottom:10px;}
.name{font-family:'Playfair Display',Georgia,serif;font-size:24px;line-height:1.2;margin-bottom:8px;}
.loc{font-size:12px;color:var(--terra);letter-spacing:.04em;margin-bottom:12px;}
.countries{font-size:12px;color:var(--fog);margin-bottom:12px;}
.note{font-size:14px;line-height:1.7;color:var(--fog);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}
.empty{padding:70px 20px;text-align:center;color:var(--fog);background:var(--ground);grid-column:1/-1;}
footer{max-width:1200px;margin:0 auto;padding:40px 32px 60px;border-top:1px solid var(--rule);text-align:center;font-size:12px;letter-spacing:.04em;color:var(--fog);}
footer a{margin:0 12px;}
@media(max-width:720px){.hi{padding:14px 18px;}.hero{padding:52px 20px 32px;}.wrap{padding:40px 18px 60px;}}
`;

function cardHtml(row) {
  const m = parseMeta(row);
  const img = /^https:\/\//i.test(m.img || '')
    ? '<img src="' + esc(m.img) + '" alt="" loading="lazy">'
    : '<span class="emoji">' + esc(m.emoji || '🧳') + '</span>';
  const note = (m.note || '').trim();
  return '<a class="card" href="' + esc(tripPath(row)) + '">' +
    '<div class="cover">' + img + '</div>' +
    '<div class="body">' +
    (m.from ? '<div class="dates">' + esc(fmtRange(m.from, m.to)) + '</div>' : '') +
    '<div class="name">' + esc(m.name || 'Reise') + '</div>' +
    (m.loc ? '<div class="loc">' + esc(m.loc) + '</div>' : '') +
    (landsOf(row).length > 1 ? '<div class="countries">' + esc(landsOf(row).map((l) => l.name).join(' · ')) + '</div>' : '') +
    (note ? '<div class="note">' + esc(note) + '</div>' : '') +
    '</div></a>';
}

function listPage({ title, desc, path, robots, crumbs, h1, lead, inner, script }) {
  const url = BASE + path;
  return '<!DOCTYPE html>\n<html lang="de">\n<head>\n<meta charset="UTF-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    '<title>' + esc(title) + '</title>\n' +
    shareTags({ title, desc, image: BASE + '/og-default.png', url, robots }) + '\n' +
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<meta name="theme-color" content="#F4EFE8">\n' +
    '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;1,400&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">\n' +
    '<style>' + LIST_CSS + '</style>\n</head>\n<body>\n' +
    '<header><div class="hi"><a href="/index.html" aria-label="Zur Startseite"><img class="brand" src="' +
    SUPABASE_URL + '/storage/v1/object/public/Reisefotos/Logo/travona-full.png.PNG" alt="Travona"></a>' +
    '<a class="btn" href="/meine-reisen.html">Anmelden</a></div></header>\n' +
    '<section class="hero"><div class="crumbs">' + crumbs + '</div><h1>' + esc(h1) + '</h1><p class="lead">' + esc(lead) + '</p></section>\n' +
    '<main class="wrap">' + inner + '</main>\n' +
    '<footer><a href="/index.html">Community</a> · <a href="/reisetagebuch">Reiseziele</a> · <a href="/vorteile.html">Eigenes Tagebuch starten</a> · <a href="/impressum.html">Impressum</a> · <a href="/datenschutz.html">Datenschutz</a></footer>\n' +
    (script || '') + '</body>\n</html>\n';
}

module.exports = {
  SUPABASE_URL, SUPABASE_KEY, BASE, SPECIAL_PAGES,
  esc, enc, has, clean, sbGet, getTrips, parseMeta, fmtRange,
  tripPath, tripTitle, tripDesc, injectHead, shareTags, cardHtml, listPage,
  landsOf, tripsForLand, landName
};
