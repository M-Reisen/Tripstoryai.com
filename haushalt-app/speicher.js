// Haushaltsbuch-App: alle Daten bleiben auf diesem Gerät (localStorage), kein Server.
// Bietet dieselben Abfragen wie der Datenbank-Client der Travona-Seite (from/select/eq/…),
// damit die Seite unverändert damit arbeiten kann.
(function () {
  'use strict';
  var KEY = 'haushaltsbuch_daten_v1';
  function laden() {
    try { var d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && Array.isArray(d.buchungen)) return d; } catch (e) {}
    return { buchungen: [], einstellungen: { budget: 0 }, gesichert: null, geaendert: null };
  }
  var D = laden();
  function speichern() {
    D.geaendert = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(D)); return true; } catch (e) { return false; }
  }
  // Gerät bitten, die Daten nicht automatisch zu löschen
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  function tabelle(t) {
    if (t === 'haushalt_buchungen') return D.buchungen;
    if (t === 'haushalt_einstellungen') return [Object.assign({ owner: 'lokal' }, D.einstellungen)];
    return [];
  }
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function kopie(o) { return JSON.parse(JSON.stringify(o)); }
  function neueId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function Abfrage(t) { this.t = t; this.f = []; this.o = []; this.op = 'select'; this.einzeln = false; }
  var P = Abfrage.prototype;
  P.select = function () { return this; };
  P.eq = function (k, v) { this.f.push(function (r) { return r[k] === v; }); return this; };
  P.gt = function (k, v) { this.f.push(function (r) { return r[k] > v; }); return this; };
  P.gte = function (k, v) { this.f.push(function (r) { return r[k] >= v; }); return this; };
  P.lt = function (k, v) { this.f.push(function (r) { return r[k] < v; }); return this; };
  P.lte = function (k, v) { this.f.push(function (r) { return r[k] <= v; }); return this; };
  P.order = function (k, opt) { this.o.push({ k: k, desc: !!(opt && opt.ascending === false) }); return this; };
  P.maybeSingle = function () { this.einzeln = true; return this; };
  P.insert = function (x) { this.op = 'insert'; this.x = [].concat(x); return this; };
  P.upsert = function (x) { this.op = 'upsert'; this.x = [].concat(x); return this; };
  P.update = function (x) { this.op = 'update'; this.x = x; return this; };
  P['delete'] = function () { this.op = 'delete'; return this; };
  P.ausfuehren = function () {
    var f = this.f, passt = function (r) { return f.every(function (g) { return g(r); }); }, d;
    if (this.t === 'haushalt_einstellungen') {
      if (this.op === 'upsert' || this.op === 'update') {
        var x = this.op === 'upsert' ? this.x[0] : this.x;
        if (x && x.budget != null) D.einstellungen.budget = Number(x.budget) || 0;
        if (!speichern()) return { data: null, error: { message: 'Speicher voll' } };
      }
      d = tabelle(this.t);
      return { data: this.einzeln ? d[0] : d, error: null };
    }
    var T = D.buchungen;
    if (this.op === 'select') {
      d = T.filter(passt);
      var o = this.o;
      if (o.length) d.sort(function (a, b) {
        for (var i = 0; i < o.length; i++) { var c = cmp(a[o[i].k], b[o[i].k]); if (c) return o[i].desc ? -c : c; }
        return 0;
      });
      d = kopie(d);
      if (this.einzeln) d = d[0] || null;
      return { data: d, error: null };
    }
    if (this.op === 'insert' || this.op === 'upsert') {
      d = this.x.map(function (r) {
        r = Object.assign({ id: neueId(), created_at: new Date().toISOString() }, kopie(r));
        r.betrag = Number(r.betrag) || 0;
        T.push(r);
        return r;
      });
    } else if (this.op === 'update') {
      var x2 = this.x;
      d = T.filter(passt);
      d.forEach(function (r) { Object.assign(r, kopie(x2)); });
    } else {
      d = T.filter(passt);
      D.buchungen = T.filter(function (r) { return !passt(r); });
    }
    if (!speichern()) { D = laden(); return { data: null, error: { message: 'Speicher voll' } }; }
    return { data: kopie(d), error: null };
  };
  P.then = function (ok, fail) {
    var r;
    try { r = this.ausfuehren(); } catch (e) { r = { data: null, error: { message: String(e) } }; }
    return Promise.resolve(r).then(ok, fail);
  };

  // ── Sicherung ──────────────────────────────────────────────────────────────
  function sicherung() {
    return {
      app: 'travona-haushaltsbuch', version: 1, exportiert: new Date().toISOString(),
      buchungen: kopie(D.buchungen), einstellungen: kopie(D.einstellungen)
    };
  }
  function pruefen(obj) {
    if (!obj || obj.app !== 'travona-haushaltsbuch' || !Array.isArray(obj.buchungen)) throw new Error('Das ist keine Haushaltsbuch-Sicherung.');
    return obj.buchungen.filter(function (r) {
      return r && /^\d{4}-\d{2}-\d{2}$/.test(r.datum) && Number(r.betrag) > 0 && (r.art === 'ausgabe' || r.art === 'einnahme') && r.kategorie && r.kategorie !== 'startguthaben';
    }).map(function (r) {
      return {
        id: String(r.id || neueId()), datum: r.datum, betrag: Math.round(Number(r.betrag) * 100) / 100, art: r.art,
        kategorie: String(r.kategorie).slice(0, 40), beschreibung: String(r.beschreibung || '').slice(0, 200),
        fix: !!r.fix, created_at: r.created_at || new Date().toISOString(), owner: 'lokal'
      };
    });
  }
  // ersetzen=true: alles durch die Sicherung ersetzen, sonst nur fehlende Buchungen ergänzen
  function einlesen(obj, ersetzen) {
    var neu = pruefen(obj), alt = D, n = 0;
    if (ersetzen) {
      D = { buchungen: neu, einstellungen: { budget: Number(obj.einstellungen && obj.einstellungen.budget) || 0 }, gesichert: D.gesichert };
      n = neu.length;
    } else {
      var ids = {};
      D.buchungen.forEach(function (r) { ids[r.id] = 1; });
      neu.forEach(function (r) { if (!ids[r.id]) { D.buchungen.push(r); n++; } });
      if (!D.einstellungen.budget && obj.einstellungen && obj.einstellungen.budget) D.einstellungen.budget = Number(obj.einstellungen.budget) || 0;
    }
    if (!speichern()) { D = alt; throw new Error('Auf dem Gerät ist nicht genug Platz.'); }
    return n;
  }
  function gesichert() {
    D.gesichert = new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {}
  }

  window.Haushalt = {
    from: function (t) { return new Abfrage(t); },
    sicherung: sicherung, einlesen: einlesen, gesichert: gesichert,
    info: function () { return { anzahl: D.buchungen.length, gesichert: D.gesichert, geaendert: D.geaendert }; }
  };
})();
