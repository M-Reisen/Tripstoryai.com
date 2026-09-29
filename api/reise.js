// Vorschau-Karten (WhatsApp, iMessage, Telegram …) für Reisetagebücher.
// Wird von vercel.json NUR für Link-Vorschau-Programme aufgerufen; normale Besucher
// bekommen weiterhin direkt die statische Seite reisevorlage.html.
const SUPABASE_URL = 'https://celihvrblqqivtlvzbjp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlbGlodnJibHFxaXZ0bHZ6YmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDg4NzcsImV4cCI6MjA5ODIyNDg3N30.HkoN6h7tRtqOWdhidh4Gk7hrHmpNtW9rRteuVo3eFT4'; // öffentlicher anon-Key (derselbe wie in den Seiten)

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function fmtRange(from, to) {
  const f = (iso) => {
    const p = String(iso).split('-');
    return p.length === 3 ? p[2] + '.' + p[1] + '.' + p[0] : '';
  };
  if (!from) return '';
  return to && to !== from ? f(from) + ' – ' + f(to) : f(from);
}

module.exports = async (req, res) => {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.travona.de';
  const base = 'https://' + host;
  try {
    const q = new URL(req.url, 'https://x.invalid').searchParams;
    const id = (q.get('reise') || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

    // Statische Vorlage holen (ohne ?reise, damit die Umleitung nicht erneut greift)
    const pageRes = await fetch(base + '/reisevorlage.html');
    let html = await pageRes.text();

    let meta = null;
    let vis = null;
    if (id) {
      const r = await fetch(
        SUPABASE_URL + '/rest/v1/trips?id=eq.' + encodeURIComponent(id) + '&select=title,visibility',
        { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
      );
      if (r.ok) {
        const rows = await r.json();
        // Nur öffentliche und „per Link“ geteilte Reisen bekommen eine eigene Vorschau
        if (rows.length) vis = rows[0].visibility;
        if (rows.length && (rows[0].visibility === 'public' || rows[0].visibility === 'link')) {
          try { meta = JSON.parse(rows[0].title || '{}'); } catch (e) { meta = { name: rows[0].title }; }
        }
      }
    }

    if (meta && meta.name) {
      const title = (meta.emoji ? meta.emoji + ' ' : '') + meta.name + ' · Reisetagebuch';
      const range = fmtRange(meta.from, meta.to);
      const desc = (meta.note && String(meta.note).trim()) ||
        [range, meta.loc].filter(Boolean).join(' · ') ||
        'Ein Reisetagebuch auf Travona.';
      const image = /^https:\/\//i.test(meta.img || '') ? meta.img : base + '/og-default.png';
      const url = base + '/reisevorlage.html?reise=' + encodeURIComponent(id);

      const tags = [
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
        '<meta name="description" content="' + esc(desc) + '">',
        // Nur öffentliche Reisen sollen in Suchmaschinen erscheinen
        vis === 'public'
          ? '<meta name="robots" content="index, follow">\n<link rel="canonical" href="' + esc(url) + '">'
          : '<meta name="robots" content="noindex, nofollow">'
      ].join('\n');

      html = html
        .replace(/<meta\s+property="og:[^>]*>\s*/gi, '')
        .replace(/<meta\s+name="twitter:[^>]*>\s*/gi, '')
        .replace(/<meta\s+name="description"[^>]*>\s*/gi, '')
        .replace(/<title>[\s\S]*?<\/title>/i, '<title>' + esc(title) + '</title>')
        .replace('</head>', tags + '\n</head>');
    }

    // Private, „per Link“ geteilte und unbekannte Reisen: nicht in Suchmaschinen aufnehmen
    if (!(meta && meta.name)) {
      html = html.replace('</head>', '<meta name="robots" content="noindex, nofollow">\n</head>');
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).send(html);
  } catch (e) {
    // Im Fehlerfall einfach auf die normale Seite weiterleiten
    res.setHeader('Location', '/reisevorlage.html');
    res.status(302).end();
  }
};
