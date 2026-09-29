// Sitemap für Suchmaschinen (unter /sitemap.xml): Startseite, Vorteile, Reiseziele
// und alle öffentlichen Reisen mit ihrer schönen Adresse.
const S = require('./_shared');

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

module.exports = async (req, res) => {
  const urls = [S.BASE + '/', S.BASE + '/vorteile.html'];
  try {
    const rows = (await S.getTrips('visibility=eq.public&order=created_at.desc&limit=1000')) || [];
    const lands = new Set();
    rows.forEach((r) => {
      if (!r.id) return;
      if (r.land_slug && r.slug) S.landsOf(r).forEach((l) => lands.add(l.slug));
      urls.push(S.BASE + S.tripPath(r));
    });
    if (lands.size) {
      urls.push(S.BASE + '/reisetagebuch');
      Array.from(lands).sort().forEach((l) => urls.push(S.BASE + '/reisetagebuch/' + l));
    }
  } catch (e) { /* im Fehlerfall wenigstens die festen Seiten */ }

  const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => '  <url><loc>' + xml(u) + '</loc></url>').join('\n') + '\n</urlset>\n';
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(body);
};
