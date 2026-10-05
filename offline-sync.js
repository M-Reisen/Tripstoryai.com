// Travona – Offline-Modus
// Tagebuch und Ausgaben funktionieren auch ohne Netz (Outback, Flugzeug):
// 1) Alles, was die Seite aus Supabase liest, wird auf dem Gerät gemerkt und ohne Netz
//    von dort angezeigt.
// 2) Änderungen ohne Netz (Einträge, Ausgaben, Löschen) kommen in eine Warteschlange und
//    werden automatisch nachgereicht, sobald wieder Internet da ist.
// Einbinden direkt NACH supabase-js. Mit data-queue="1" sind Offline-Änderungen erlaubt
// (nur Reiseseiten), ohne das Attribut zeigt die Seite offline nur die gemerkten Daten.
// Fotos werden offline nicht hochgeladen (zu groß); das geht wieder, sobald Netz da ist.
(function () {
  'use strict';
  if (!window.fetch || !window.supabase || !window.supabase.createClient) return;

  var SB = 'https://celihvrblqqivtlvzbjp.supabase.co';
  var REST = SB + '/rest/v1/';
  var AUTH_KEY = 'sb-celihvrblqqivtlvzbjp-auth-token';
  var DATA_CACHE = 'travona-daten-v1';
  var QKEY = 'tv_offline_queue';
  var IDKEY = 'tv_offline_ids';
  var QUEUE_TABLES = { kommentare: 1 };         // Tagebuch, Ausgaben, Kosten … liegen alle hier
  var READ_RPC = { reaktionen_laden: 1 };       // RPCs, die nur lesen
  var me = document.currentScript;
  var QUEUE_ON = !!(me && me.getAttribute('data-queue') === '1');
  var realFetch = window.fetch.bind(window);
  var hasCaches = !!window.caches;
  var client = null, origGetSession = null;
  var offline = navigator.onLine === false;
  var syncing = null, needLogin = false;

  // ── Kleiner Speicher (localStorage) ──────────────────────────────────────────
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function queue() { return lsGet(QKEY, []); }
  function saveQueue(q) { var ok = lsSet(QKEY, q); updateBadge(); return ok; }
  function pending() { return queue().filter(function (o) { return !o.synced; }); }
  function idMap() { return lsGet(IDKEY, {}); }
  function storedSession() {
    var s = lsGet(AUTH_KEY, null);
    if (s && s.currentSession) s = s.currentSession;
    return s && s.user ? s : null;
  }

  // Vorläufige IDs für offline angelegte Zeilen: negativ, damit sie nie mit echten kollidieren
  var seq = 0;
  function tempId() { return -(Date.now() * 1000 + (seq++ % 1000)); }
  function isTemp(id) { return typeof id === 'number' && id < 0; }
  // Ersetzt vorläufige IDs in einer Adresse durch die echten (nach dem Nachreichen)
  function mapIds(str) {
    var m = idMap();
    return String(str).replace(/-\d{13,17}/g, function (t) { return m[t] != null ? String(m[t]) : t; });
  }

  function setOffline(v) {
    if (offline === v) return;
    offline = v;
    updateBadge();
    if (!v) scheduleSync(500);
  }
  function raceTimeout(p, ms) {
    return Promise.race([p, new Promise(function (r) { setTimeout(function () { r(null); }, ms); })]);
  }
  function headersOf(init) { try { return new Headers((init && init.headers) || {}); } catch (e) { return new Headers(); } }
  function parseJSON(s) { try { return typeof s === 'string' ? JSON.parse(s) : null; } catch (e) { return null; } }

  // ── PostgREST-Abfragen lokal nachbilden (eq, like, order, limit …) ───────────
  function parseQuery(url) {
    var q = { select: '*', order: [], limit: null, offset: 0, filters: [] };
    var u;
    try { u = new URL(url); } catch (e) { return q; }
    u.searchParams.forEach(function (v, k) {
      if (k === 'select') q.select = v;
      else if (k === 'order') q.order = v.split(',').map(function (s) { var p = s.split('.'); return { col: p[0], desc: p[1] === 'desc' }; });
      else if (k === 'limit') q.limit = +v;
      else if (k === 'offset') q.offset = +v;
      else if (k === 'on_conflict' || k === 'columns' || k.indexOf('__') === 0) { /* keine Filter */ }
      else q.filters.push({ col: k, expr: v });
    });
    return q;
  }
  function likeRe(pat, ci) {
    var out = '', i, ch;
    for (i = 0; i < pat.length; i++) {
      ch = pat[i];
      if (ch === '\\' && i + 1 < pat.length) { i++; out += pat[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
      else if (ch === '%' || ch === '*') out += '[\\s\\S]*';
      else if (ch === '_') out += '[\\s\\S]';
      else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + out + '$', ci ? 'i' : '');
  }
  function cmp(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    var na = Number(a), nb = Number(b);
    if (a !== '' && b !== '' && !isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }
  function test(row, col, expr) {
    var neg = false;
    if (expr.indexOf('not.') === 0) { neg = true; expr = expr.slice(4); }
    var i = expr.indexOf('.');
    if (i < 0) return true;
    var op = expr.slice(0, i), val = expr.slice(i + 1), x = row[col], r;
    switch (op) {
      case 'eq': r = x != null && String(x) === val; break;
      case 'neq': r = x != null && String(x) !== val; break;
      case 'gt': r = x != null && cmp(x, val) > 0; break;
      case 'gte': r = x != null && cmp(x, val) >= 0; break;
      case 'lt': r = x != null && cmp(x, val) < 0; break;
      case 'lte': r = x != null && cmp(x, val) <= 0; break;
      case 'like': r = x != null && likeRe(val, false).test(String(x)); break;
      case 'ilike': r = x != null && likeRe(val, true).test(String(x)); break;
      case 'is': r = val === 'null' ? x == null : String(x) === val; break;
      case 'in':
        r = x != null && val.replace(/^\(|\)$/g, '').split(',').map(function (s) { return s.replace(/^"|"$/g, ''); }).indexOf(String(x)) >= 0;
        break;
      default: return true; // unbekannt → nicht filtern
    }
    return neg ? !r : r;
  }
  function matches(row, filters) {
    for (var i = 0; i < filters.length; i++) if (!test(row, filters[i].col, filters[i].expr)) return false;
    return true;
  }
  function project(row, select) {
    if (!select || select === '*' || select.indexOf('(') >= 0) return row;
    var o = {};
    select.split(',').forEach(function (c) { c = c.trim(); if (c in row) o[c] = row[c]; });
    return o;
  }
  function sortRows(rows, order) {
    if (!order.length) return rows;
    return rows.slice().sort(function (a, b) {
      for (var i = 0; i < order.length; i++) {
        var d = cmp(a[order[i].col], b[order[i].col]);
        if (d) return order[i].desc ? -d : d;
      }
      return 0;
    });
  }

  // ── Gemerkte Antworten (Cache API) ──────────────────────────────────────────
  function cacheKey(url, init, kind) {
    var h = headersOf(init);
    var extra = kind + '|' + (h.get('Prefer') || '') + '|' + (h.get('Accept') || '') + '|' + (kind === 'GET' || kind === 'HEAD' ? '' : (typeof init.body === 'string' ? init.body : ''));
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + '__tv=' + encodeURIComponent(extra);
  }
  var mirrorMemo = {};
  async function cacheMatch(key) {
    if (!hasCaches) return null;
    try { var c = await caches.open(DATA_CACHE); return (await c.match(key)) || null; } catch (e) { return null; }
  }
  async function cachePut(key, res) {
    if (!hasCaches) return;
    try {
      var body = await res.text();
      var h = new Headers(res.headers);
      h.set('X-TV-Cached-At', String(Date.now()));
      var c = await caches.open(DATA_CACHE);
      await c.put(key, new Response(body, { status: res.status, headers: h }));
      mirrorMemo = {};
    } catch (e) {}
  }
  // Alle gemerkten Zeilen einer Tabelle (nach ID), für Abfragen, die noch nie online liefen
  async function mirror(table) {
    if (mirrorMemo[table]) return mirrorMemo[table];
    var out = { byId: {}, any: false, oldest: Date.now() };
    if (hasCaches) {
      try {
        var c = await caches.open(DATA_CACHE), keys = await c.keys(), list = [];
        for (var i = 0; i < keys.length; i++) {
          if (keys[i].url.indexOf(REST + table + '?') !== 0) continue;
          var r = await c.match(keys[i]);
          if (!r) continue;
          var data = await r.json().catch(function () { return null; });
          if (!data) continue;
          list.push({ at: +r.headers.get('X-TV-Cached-At') || 0, rows: Array.isArray(data) ? data : [data] });
        }
        list.sort(function (a, b) { return a.at - b.at; });
        list.forEach(function (l) {
          out.any = true;
          if (l.at < out.oldest) out.oldest = l.at;
          l.rows.forEach(function (row) {
            if (row && row.id != null) out.byId[row.id] = Object.assign(out.byId[row.id] || {}, row);
          });
        });
      } catch (e) {}
    }
    mirrorMemo[table] = out;
    return out;
  }

  // Warteschlange auf eine Zeilenliste anwenden (nur Änderungen, die neuer sind als die Liste)
  function applyOps(rows, table, filters, listAt, byId) {
    var changed = false;
    queue().forEach(function (o) {
      if (o.table !== table) return;
      if (o.synced && o.synced <= listAt) return;
      var of = parseQuery(mapIds(o.url)).filters;
      if (o.method === 'POST') {
        (o.rows || []).forEach(function (r) {
          if (!matches(r, filters)) return;
          rows = rows.filter(function (x) { return x.id !== r.id; });
          rows.push(r);
          changed = true;
        });
      } else if (o.method === 'PATCH') {
        rows = rows.map(function (r) {
          var full = Object.assign({}, byId[r.id] || {}, r);
          if (!matches(full, of)) return r;
          changed = true;
          return Object.assign({}, r, o.patch || {});
        });
      } else if (o.method === 'DELETE') {
        var n = rows.length;
        rows = rows.filter(function (r) { return !matches(Object.assign({}, byId[r.id] || {}, r), of); });
        if (rows.length !== n) changed = true;
      }
    });
    return { rows: rows, changed: changed };
  }

  function jsonRes(body, status, extra) {
    var h = { 'Content-Type': 'application/json; charset=utf-8', 'X-Travona-Offline': '1' };
    if (extra) for (var k in extra) h[k] = extra[k];
    return new Response(body === undefined ? null : JSON.stringify(body), { status: status || 200, headers: h });
  }
  function offlineError() {
    return jsonRes({ message: 'Offline – diese Daten sind noch nicht auf dem Gerät gespeichert.', code: 'OFFLINE' }, 503);
  }
  function shape(rows, init, status, total) {
    var h = headersOf(init), extra = {};
    if (/count=/.test(h.get('Prefer') || '')) extra['Content-Range'] = (rows.length ? '0-' + (rows.length - 1) : '*') + '/' + (total == null ? rows.length : total);
    if (/vnd\.pgrst\.object/.test(h.get('Accept') || '')) {
      if (rows.length !== 1) return jsonRes({ message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, 406);
      return jsonRes(rows[0], status, extra);
    }
    return jsonRes(rows, status, extra);
  }

  // Offline-Antwort auf ein SELECT: gemerkte Antwort + Warteschlange
  async function offlineSelect(url, init, table, cached) {
    var q = parseQuery(url), base = null, listAt = 0, fromMirror = false, total = null;
    var mm = await mirror(table);
    if (cached) {
      base = await cached.clone().json().catch(function () { return null; });
      listAt = +cached.headers.get('X-TV-Cached-At') || 0;
      if (base && !Array.isArray(base)) base = [base];
      var cr = cached.headers.get('Content-Range');
      if (cr && cr.indexOf('/') >= 0) total = +cr.split('/')[1];
    }
    if (!base) {
      if (!mm.any && !queue().some(function (o) { return o.table === table; })) return offlineError();
      fromMirror = true;
      listAt = mm.any ? mm.oldest : 0;
      base = Object.keys(mm.byId).map(function (k) { return mm.byId[k]; }).filter(function (r) { return matches(r, q.filters); });
    }
    var res = applyOps(base, table, q.filters, listAt, mm.byId);
    var rows = res.rows;
    if (fromMirror || res.changed) rows = sortRows(rows, q.order);
    if (fromMirror && q.offset) rows = rows.slice(q.offset);
    if (fromMirror || res.changed || total == null) total = rows.length;
    if (q.limit != null) rows = rows.slice(0, q.limit);
    rows = rows.map(function (r) { return project(r, q.select); });
    return shape(rows, init, 200, total);
  }

  // ── Lesen: erst Netz, ohne Netz die gemerkte Fassung ────────────────────────
  async function readThrough(url, init, kind, table) {
    var key = cacheKey(url, init, kind);
    var cached = await cacheMatch(key);
    if (navigator.onLine !== false) {
      try {
        var net = realFetch(url, init);
        var res = cached ? await raceTimeout(net, 9000) : await net;
        if (res) {
          setOffline(false);
          if (res.ok && kind !== 'HEAD') cachePut(key, res.clone());
          return res;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        setOffline(true);
      }
    } else setOffline(true);
    if (!table) return cached || offlineError();   // Fotoliste, RPC
    return offlineSelect(url, init, table, cached);
  }

  // ── Schreiben: online direkt, sonst in die Warteschlange ────────────────────
  function newOp(url, init, method, table) {
    var h = headersOf(init), body = typeof init.body === 'string' ? init.body : null, obj = parseJSON(body);
    var op = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      table: table, method: method, url: url, body: body,
      prefer: h.get('Prefer') || '', accept: h.get('Accept') || '', apikey: h.get('apikey') || '',
      at: Date.now(), synced: 0
    };
    if (method === 'POST') {
      op.rows = (Array.isArray(obj) ? obj : obj ? [obj] : []).map(function (r) {
        return Object.assign({}, r, { id: r.id != null ? r.id : tempId() });
      });
    }
    if (method === 'PATCH') op.patch = obj || {};
    return op;
  }
  function pruneSynced(q) {
    var cut = Date.now() - 30 * 864e5, synced = q.filter(function (o) { return o.synced; });
    var drop = synced.length > 200 ? synced.length - 200 : 0;
    return q.filter(function (o) {
      if (!o.synced) return true;
      if (o.synced < cut) return false;
      if (drop > 0) { drop--; return false; }
      return true;
    });
  }
  // Auch online gespeicherte Änderungen merken, damit ältere gemerkte Listen offline aktuell sind
  async function logOnlineWrite(op, res) {
    try {
      if (op.method === 'POST' && /return=representation/.test(op.prefer)) {
        var data = await res.clone().json().catch(function () { return null; });
        var arr = Array.isArray(data) ? data : data ? [data] : [];
        op.rows = op.rows.map(function (r, i) { return arr[i] && arr[i].id != null ? Object.assign({}, r, arr[i]) : r; });
      }
      op.synced = Date.now();
      var q = queue(); q.push(op); saveQueue(pruneSynced(q));
      mirrorMemo = {};
    } catch (e) {}
  }
  async function writeThrough(url, init, method, table) {
    if (navigator.onLine !== false) {
      if (pending().length) { try { await syncNow(); } catch (e) {} }
      if (!pending().length) {
        try {
          var res = await realFetch(url, init);
          setOffline(false);
          if (res.ok) logOnlineWrite(newOp(url, init, method, table), res);
          return res;
        } catch (e) {
          if (e && e.name === 'AbortError') throw e;
          setOffline(true);
        }
      }
    } else setOffline(true);
    return enqueue(url, init, method, table);
  }
  async function enqueue(url, init, method, table) {
    var op = newOp(url, init, method, table);
    var wantRep = /return=representation/.test(op.prefer);
    var rows = [];
    if (method === 'POST') rows = op.rows;
    else if (wantRep) {
      // Betroffene Zeilen (vor dieser Änderung) für die Antwort ermitteln
      var mm = await mirror(table);
      var all = Object.keys(mm.byId).map(function (k) { return mm.byId[k]; });
      var f = parseQuery(url).filters;
      rows = applyOps(all, table, [], 0, mm.byId).rows.filter(function (r) { return matches(r, f); });
      if (method === 'PATCH') rows = rows.map(function (r) { return Object.assign({}, r, op.patch); });
      rows = rows.map(function (r) { return project(r, parseQuery(url).select); });
    }
    var q = queue(); q.push(op);
    if (!saveQueue(pruneSynced(q))) return jsonRes({ message: 'Gerätespeicher voll – offline nicht gespeichert.', code: 'OFFLINE_FULL' }, 507);
    mirrorMemo = {};
    hintOnce();
    if (!wantRep) return new Response(null, { status: method === 'POST' ? 201 : 204, headers: { 'X-Travona-Offline': '1' } });
    return shape(rows, init, method === 'POST' ? 201 : 200);
  }

  // ── Nachreichen, sobald wieder Netz da ist ──────────────────────────────────
  async function accessToken() {
    if (!origGetSession) return null;
    try {
      var r = await origGetSession();
      var s = r && r.data && r.data.session;
      return s ? s.access_token : null;
    } catch (e) { return null; }
  }
  function markOp(id, fn) {
    var q = queue();
    for (var i = 0; i < q.length; i++) if (q[i].id === id) { fn(q, i); break; }
    saveQueue(q);
  }
  async function runSync() {
    var ops = pending();
    if (!ops.length || navigator.onLine === false) return;
    var token = await accessToken();
    if (!token) { needLogin = true; updateBadge(); return; }
    needLogin = false;
    var done = 0, failed = 0;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      var url = mapIds(op.url);
      var headers = { apikey: op.apikey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
      var prefer = op.prefer;
      if (op.method === 'POST') {
        // Echte IDs zurückbekommen, damit spätere Änderungen die richtige Zeile treffen
        prefer = prefer.split(',').filter(function (p) { return p && !/^return=/.test(p.trim()); }).concat('return=representation').join(',');
        headers.Accept = 'application/json';
      } else if (op.accept) headers.Accept = op.accept;
      if (prefer) headers.Prefer = prefer;
      var res;
      try {
        res = await realFetch(url, { method: op.method, headers: headers, body: op.method === 'DELETE' ? undefined : op.body });
      } catch (e) { setOffline(true); break; }
      setOffline(false);
      if (res.ok) {
        var rows = op.rows;
        if (op.method === 'POST') {
          var data = await res.json().catch(function () { return null; });
          var arr = Array.isArray(data) ? data : data ? [data] : [];
          var m = idMap();
          rows = (op.rows || []).map(function (r, k) {
            if (!arr[k] || arr[k].id == null) return r;
            if (isTemp(r.id)) m[r.id] = arr[k].id;
            return Object.assign({}, r, arr[k]);
          });
          lsSet(IDKEY, m);
        }
        markOp(op.id, function (q, k) { q[k].synced = Date.now(); q[k].url = url; if (rows) q[k].rows = rows; });
        done++;
      } else if (res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500) {
        break; // später nochmal versuchen
      } else {
        // Dauerhaft abgelehnt (z. B. keine Berechtigung): aus der Warteschlange nehmen, aber aufheben
        var info = await res.text().catch(function () { return ''; });
        markOp(op.id, function (q, k) {
          var bad = lsGet('tv_offline_failed', []);
          bad.push(Object.assign({}, q[k], { status: res.status, error: info.slice(0, 300) }));
          lsSet('tv_offline_failed', bad.slice(-50));
          q.splice(k, 1);
        });
        failed++;
      }
    }
    mirrorMemo = {};
    if (done) flash('✓ ' + (done === 1 ? '1 Offline-Änderung' : done + ' Offline-Änderungen') + ' gespeichert');
    if (failed) flash((failed === 1 ? '1 Offline-Änderung' : failed + ' Offline-Änderungen') + ' konnte nicht gespeichert werden', true);
  }
  function syncNow() {
    if (syncing) return syncing;
    syncing = (async function () {
      updateBadge();
      try {
        // Nur ein Tab gleichzeitig reicht nach
        if (navigator.locks && navigator.locks.request) await navigator.locks.request('tv-offline-sync', runSync);
        else await runSync();
      } finally { syncing = null; updateBadge(); }
    })();
    return syncing;
  }
  var syncTimer = null;
  function scheduleSync(ms) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { if (pending().length) syncNow(); }, ms || 0);
  }

  // ── fetch umleiten (nur Supabase-Datenbank und Fotolisten) ──────────────────
  window.fetch = function (input, init) {
    try {
      var url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : null;
      if (!url || url.indexOf(SB + '/') !== 0) return realFetch(input, init);
      init = init || {};
      var method = String(init.method || 'GET').toUpperCase();
      if (url.indexOf(REST) === 0) {
        url = mapIds(url);
        var table = url.slice(REST.length).split('?')[0];
        if (table.indexOf('rpc/') === 0) {
          if (READ_RPC[table.slice(4)]) return readThrough(url, init, 'RPC', null);
          return realFetch(url, init);
        }
        if (method === 'GET' || method === 'HEAD') return readThrough(url, init, method, table);
        if (QUEUE_ON && QUEUE_TABLES[table] && storedSession()) return writeThrough(url, init, method, table);
        return realFetch(url, init);
      }
      if (url.indexOf(SB + '/storage/v1/object/list/') === 0) return readThrough(url, init, 'LIST', null);
      return realFetch(input, init);
    } catch (e) {
      return realFetch(input, init);
    }
  };

  // ── Anmeldung auch offline behalten ─────────────────────────────────────────
  // Ohne Netz kann supabase-js den Zugang nicht erneuern und meldet „nicht angemeldet“.
  // Dann gilt die zuletzt gespeicherte Anmeldung weiter, bis wieder Netz da ist.
  function patchClient(c) {
    if (client || !c || !c.auth) return;
    client = c;
    var a = c.auth, orig = a.getSession.bind(a);
    origGetSession = orig;
    a.getSession = async function () {
      var st = storedSession();
      if (st && navigator.onLine === false) return { data: { session: st }, error: null };
      try {
        var r = st ? await raceTimeout(orig(), 6000) : await orig();
        if (r && r.data && r.data.session) return r;
        var st2 = storedSession(); // bei echtem Abmelden ist sie gelöscht
        if (st2 && (!r || r.error)) return { data: { session: st2 }, error: null };
        return r;
      } catch (e) {
        var st3 = storedSession();
        if (st3) return { data: { session: st3 }, error: null };
        throw e;
      }
    };
    var so = a.signOut.bind(a);
    a.signOut = async function () {
      var r = await so.apply(null, arguments);
      // Gemerkte Reisedaten beim Abmelden vom Gerät löschen (offene Änderungen bleiben)
      try { if (hasCaches) await caches.delete(DATA_CACHE); } catch (e) {}
      saveQueue(pending());
      mirrorMemo = {};
      return r;
    };
    if (pending().length) scheduleSync(2000);
  }
  var origCreate = window.supabase.createClient;
  window.supabase.createClient = function () {
    var c = origCreate.apply(this, arguments);
    try { patchClient(c); } catch (e) {}
    return c;
  };

  // ── Hinweis-Leiste ──────────────────────────────────────────────────────────
  var pill = null, flashTimer = null, flashing = false, hinted = false;
  function ensurePill() {
    if (pill || !document.body) return pill;
    var st = document.createElement('style');
    st.textContent = '#tv-offline{position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top));transform:translateX(-50%);z-index:9500;max-width:calc(100% - 32px);padding:7px 14px;border-radius:999px;background:#1A1714;color:#F4EFE8;font:500 12.5px/1.35 "DM Sans",system-ui,sans-serif;box-shadow:0 4px 16px rgba(26,23,20,.25);display:none;align-items:center;gap:7px;text-align:center;pointer-events:none;}'
      + '#tv-offline.on{display:flex;}#tv-offline.ok{background:#4F6B4A;}#tv-offline.warn{background:#B5714A;}'
      + '#tv-offline i{width:7px;height:7px;border-radius:50%;background:#E0A27A;flex:none;}#tv-offline.ok i{background:#CFE3C8;}'
      + '@media print{#tv-offline{display:none !important;}}';
    document.head.appendChild(st);
    pill = document.createElement('div');
    pill.id = 'tv-offline';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    pill.innerHTML = '<i></i><span></span>';
    document.body.appendChild(pill);
    return pill;
  }
  function showPill(text, cls) {
    if (!ensurePill()) return;
    pill.className = 'on' + (cls ? ' ' + cls : '');
    pill.lastChild.textContent = text;
  }
  function updateBadge() {
    if (flashing) return;
    var n = pending().length;
    var plural = n === 1 ? '1 Änderung' : n + ' Änderungen';
    if (offline) {
      if (!QUEUE_ON) showPill('Offline · gespeicherte Ansicht');
      else showPill(n ? 'Offline · ' + plural + ' auf dem Gerät gespeichert' : 'Offline · Einträge werden auf dem Gerät gespeichert');
    } else if (n) {
      if (syncing) showPill(plural + ' werden synchronisiert …');
      else if (needLogin) showPill(plural + ' warten · zum Speichern bitte anmelden', 'warn');
      else showPill(plural + ' warten auf Synchronisierung');
    } else if (pill) pill.className = '';
  }
  function flash(text, warn) {
    flashing = true;
    showPill(text, warn ? 'warn' : 'ok');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { flashing = false; updateBadge(); }, 3500);
  }
  function hintOnce() {
    if (hinted) return;
    hinted = true;
    flash('Ohne Netz gespeichert · wird später synchronisiert');
  }

  // ── Ereignisse ──────────────────────────────────────────────────────────────
  window.addEventListener('online', function () { setOffline(false); scheduleSync(800); });
  window.addEventListener('offline', function () { setOffline(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && navigator.onLine !== false) scheduleSync(500);
  });
  setInterval(function () { if (navigator.onLine !== false && pending().length && !syncing) syncNow(); }, 30000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', updateBadge);
  else updateBadge();

  // Beim allerersten Besuch steuert der Service Worker die Seite noch nicht.
  // Dann bitten wir ihn, diese Seite samt Skripten gleich zu merken, damit sie offline öffnet.
  window.addEventListener('load', function () {
    if (!('serviceWorker' in navigator) || navigator.serviceWorker.controller) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (!reg.active) return;
      var urls = [location.href];
      try {
        performance.getEntriesByType('resource').forEach(function (e) {
          if (e.initiatorType === 'script' || e.initiatorType === 'link' || e.initiatorType === 'css') urls.push(e.name);
        });
      } catch (e) {}
      reg.active.postMessage({ type: 'merken', urls: urls });
    }).catch(function () {});
  });

  window.TravonaOffline = { sync: syncNow, pending: function () { return pending().length; } };
})();
