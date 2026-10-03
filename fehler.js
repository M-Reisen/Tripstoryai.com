// Travona – Fehlerüberwachung
// Meldet JavaScript-Fehler aus dem Browser in die Supabase-Tabelle „client_errors“,
// damit Probleme auffallen, bevor sich jemand beschwert.
// Gespeichert werden nur Meldung, Seite und Browser – keine Eingaben oder Inhalte.
(function () {
  var URL_ = 'https://celihvrblqqivtlvzbjp.supabase.co/rest/v1/client_errors';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNlbGlodnJibHFxaXZ0bHZ6YmpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NDg4NzcsImV4cCI6MjA5ODIyNDg3N30.HkoN6h7tRtqOWdhidh4Gk7hrHmpNtW9rRteuVo3eFT4'; // öffentlicher anon-Key
  var MAX_PRO_SEITE = 5;   // höchstens 5 Meldungen pro Seitenaufruf
  var gesendet = 0, schonGemeldet = {};

  function cut(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }

  function melden(meldung, quelle) {
    if (gesendet >= MAX_PRO_SEITE) return;
    meldung = cut(meldung, 500);
    if (!meldung || schonGemeldet[meldung]) return;
    // Rauschen von Browser-Erweiterungen und abgebrochenen Skripten ignorieren
    if (/^Script error\.?$/.test(meldung) || /extension:\/\//.test(quelle || '')) return;
    schonGemeldet[meldung] = 1; gesendet++;
    try {
      fetch(URL_, {
        method: 'POST', keepalive: true,
        headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          meldung: meldung,
          quelle: cut(quelle, 300),
          seite: cut(location.pathname + location.search.replace(/([?&](token|code|access_token)=)[^&]*/g, '$1…'), 300),
          browser: cut(navigator.userAgent, 300)
        })
      }).catch(function () {});
    } catch (e) { /* Fehlerüberwachung darf nie selbst stören */ }
  }

  window.addEventListener('error', function (e) {
    if (!e || !e.message) return;
    melden(e.message, (e.filename || '') + (e.lineno ? ':' + e.lineno + ':' + (e.colno || 0) : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    melden('Unbehandelt: ' + (r && r.message ? r.message : r), r && r.stack ? String(r.stack).split('\n')[1] : '');
  });
  window.travonaFehler = melden;   // für eigene Meldungen: travonaFehler('Text', 'Ort')
})();
