// Sitemap für Suchmaschinen: Startseite, Vorteile-Seite und alle öffentlichen Reisen.
// Wird über vercel.json unter /sitemap.xml ausgeliefert.
const SUPABASE_URL = 'https://celihvrblqqivtlvzbjp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlbGlodnJibHFxaXZ0bHZ6YmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDg4NzcsImV4cCI6MjA5ODIyNDg3N30.HkoN6h7tRtqOWdhidh4Gk7hrHmpNtW9rRteuVo3eFT4'; // öffentlicher anon-Key (derselbe wie in den Seiten)
const BASE = 'https://www.travona.de';

// Reisen mit eigener Seite (statt der Vorlage)
const SPECIAL_PAGES = { 'australien-2026': 'australien.html' };

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = async (req, res) => {
  const urls = [BASE + '/', BASE + '/vorteile.html'];
  try {
    const r = await fetch(
      SUPABASE_URL + '/rest/v1/trips?visibility=eq.public&select=id&order=created_at.desc&limit=1000',
      { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } }
    );
    if (r.ok) {
      const rows = await r.json();
      rows.forEach((t) => {
        if (!t.id) return;
        urls.push(
          Object.prototype.hasOwnProperty.call(SPECIAL_PAGES, t.id)
            ? BASE + '/' + SPECIAL_PAGES[t.id]
            : BASE + '/reisevorlage.html?reise=' + encodeURIComponent(t.id)
        );
      });
    }
  } catch (e) { /* im Fehlerfall wenigstens die festen Seiten ausliefern */ }

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => '  <url><loc>' + xml(u) + '</loc></url>').join('\n') +
    '\n</urlset>\n';

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(body);
};
