// Travona – Diktieren
// Gemeinsame Diktierfunktion für Tagebuch, Bewertungen, „Gut zu wissen“ und die Testseite.
// Nutzt die Spracherkennung des Browsers (kostenlos, kein Server). Wo die nicht geht
// (manche iPhone-Apps, Home-Bildschirm-App, Siri & Diktat aus, Firefox), erscheint ein
// klarer Hinweis unter dem Textfeld und die Tastatur öffnet sich, damit man deren 🎤 nutzen kann.
(function () {
  var ua = navigator.userAgent || '';
  var IOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var TASTATUR = IOS
    ? 'Tippe ins Textfeld und dann auf das 🎤 unten rechts auf der Tastatur.'
    : 'Tippe ins Textfeld und nutze das 🎤 auf deiner Tastatur.';
  var MAX_MS = 120000;     // Sicherheits-Stopp nach 2 Minuten
  var START_MS = 8000;     // startet die Erkennung bis dahin nicht, gilt sie als nicht verfügbar

  var cur = null;          // laufende Sitzung: {rec, ta, btn, label, stopped, heard, ...}

  function el(id) { return id && id.nodeType ? id : document.getElementById(id); }

  function melden(code) {
    try { if (window.travonaFehler) window.travonaFehler('Diktieren: ' + code, IOS ? 'iOS' : ''); } catch (e) {}
  }

  function hinweis(ta, text) {
    if (!ta || !ta.parentNode) { if (typeof window.toast === 'function') window.toast(text); return; }
    var h = ta.parentNode.querySelector('.diktat-hinweis');
    if (!h) {
      h = document.createElement('div');
      h.className = 'diktat-hinweis';
      h.setAttribute('role', 'status');
      h.style.cssText = 'margin:6px 0 8px;padding:8px 10px;border-radius:8px;background:#f6ebe0;color:#6b3f24;font-size:.8rem;line-height:1.4';
      ta.parentNode.insertBefore(h, ta.nextSibling);
    }
    h.textContent = text;
    clearTimeout(h._t);
    h._t = setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); }, 15000);
  }

  function hinweisWeg(ta) {
    var h = ta && ta.parentNode && ta.parentNode.querySelector('.diktat-hinweis');
    if (h && h.parentNode) h.parentNode.removeChild(h);
  }

  function tastatur(ta, grund) {
    hinweis(ta, (grund ? grund + ' ' : '') + TASTATUR);
    try { ta.focus(); } catch (e) {}
  }

  function knopf(s, aktiv) {
    if (!s.btn) return;
    s.btn.textContent = aktiv ? '⏹ Stopp' : s.label;
  }

  function ende(s) {
    clearTimeout(s.wd); clearTimeout(s.max);
    knopf(s, false);
    if (cur === s) cur = null;
  }

  function stoppen() {
    var s = cur;
    if (!s) return;
    s.stopped = true;
    try { s.rec.stop(); } catch (e) {}
    ende(s);              // Knopf sofort zurück; letzte Wörter kommen noch über onresult
  }

  var FEHLER = {
    'not-allowed': 'Das Mikrofon ist für travona.de nicht erlaubt. Du kannst es in den Browser-Einstellungen erlauben, oder:',
    'service-not-allowed': 'Die Spracherkennung ist hier gesperrt (z. B. Siri & Diktat aus oder als App vom Home-Bildschirm geöffnet).',
    'audio-capture': 'Es wurde kein Mikrofon gefunden.',
    'network': 'Die Spracherkennung braucht gerade Internet.',
    'language-not-supported': 'Deutsch wird von der Spracherkennung hier nicht unterstützt.'
  };

  function sitzung(s) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = new SR();
    s.rec = rec;
    s.base = s.ta.value ? s.ta.value.replace(/\s+$/, '') + ' ' : '';
    rec.lang = 'de-DE';
    // iPhone/iPad: Dauer-Modus verdoppelt dort Text oder bricht ab. Daher Satz für Satz
    // und nach jeder Pause automatisch weiter, bis man „Stopp“ tippt.
    rec.continuous = !IOS;
    rec.interimResults = true;
    rec.onstart = rec.onaudiostart = function () {
      if (s.ok) return;
      s.ok = true; clearTimeout(s.wd);
      if (cur === s) { knopf(s, true); hinweis(s.ta, '🎤 Mikrofon an. Jetzt sprechen, zum Beenden „Stopp“ tippen.'); }
    };
    rec.onresult = function (e) {
      if (s.rec !== rec) return;
      var fin = '', zw = '';
      for (var i = 0; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t + ' '; else zw += t;
      }
      var neu = (fin + zw).trim();
      if (neu) { s.heard = true; s.ta.value = s.base + neu; }
      try { s.ta.dispatchEvent(new Event('input', { bubbles: true })); } catch (x) {}
    };
    rec.onerror = function (e) {
      var code = e && e.error;
      if (code === 'aborted') return;
      if (code === 'no-speech') { if (!s.heard && !IOS) hinweis(s.ta, 'Ich habe nichts gehört. Tippe nochmal auf „Diktieren“ und sprich.'); return; }
      s.fail = true;
      melden(code);
      ende(s);
      tastatur(s.ta, FEHLER[code] || ('Diktieren hat nicht geklappt (' + code + ').'));
    };
    rec.onend = function () {
      if (s.rec !== rec) return;
      // iPhone: nach einer Sprechpause neu starten, solange nicht gestoppt
      if (IOS && cur === s && !s.stopped && !s.fail && s.ok) {
        try { sitzung(s); return; } catch (x) {}
      }
      if (cur === s) { ende(s); if (s.heard) hinweisWeg(s.ta); }
    };
    rec.start();
  }

  window.startDictationFor = function (textareaId, btnId) {
    var ta = el(textareaId), btn = el(btnId);
    if (!ta) return;
    // Läuft schon: gleicher Knopf = stoppen, anderes Feld = altes beenden und neu starten
    if (cur) { var gleich = cur.ta === ta; stoppen(); if (gleich) return; }

    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { melden('nicht vorhanden'); tastatur(ta, 'Dieser Browser kann nicht selbst diktieren.'); return; }

    var s = { ta: ta, btn: btn, label: btn ? (btn.getAttribute('data-label') || btn.textContent) : '' };
    if (btn && !btn.getAttribute('data-label')) btn.setAttribute('data-label', s.label);
    cur = s;
    knopf(s, true);
    hinweis(ta, 'Mikrofon wird gestartet… Bitte den Zugriff erlauben, falls gefragt.');
    try {
      sitzung(s);
    } catch (e) {
      melden('start ' + (e && e.name));
      ende(s);
      tastatur(ta, 'Die Spracherkennung startet hier nicht.');
      return;
    }
    // Manche Browser (z. B. in Apps) tun beim Start gar nichts: dann nicht stumm hängen bleiben
    s.wd = setTimeout(function () {
      if (cur !== s || s.ok) return;
      try { s.rec.abort(); } catch (x) {}
      melden('startet nicht');
      ende(s);
      tastatur(ta, 'Die Spracherkennung startet hier nicht.');
    }, START_MS);
    s.max = setTimeout(function () { if (cur === s) stoppen(); }, MAX_MS);
  };

  window.stopDictation = stoppen;
})();
