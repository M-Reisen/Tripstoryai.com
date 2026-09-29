// Travona – App-Installation: Service Worker + dezenter Hinweis „Als App installieren“
(function () {
  'use strict';

  // 1) Service Worker (macht die Seite installierbar)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  // 2) Hinweis nur auf Seiten mit data-banner="1" und nur, wenn noch nicht als App geöffnet
  var script = document.currentScript;
  var wantBanner = script && script.getAttribute('data-banner') === '1';
  var standalone = false;
  try { standalone = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches; } catch (e) {}
  if (!wantBanner || standalone) return;

  var KEY = 'tv_install_dismissed';
  try {
    var t = parseInt(localStorage.getItem(KEY) || '0', 10);
    if (t && Date.now() - t < 30 * 24 * 3600 * 1000) return; // 30 Tage Ruhe nach „Später“
  } catch (e) {}

  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var deferred = null;

  var css = document.createElement('style');
  css.textContent =
    '.tvi-bar{position:fixed;left:12px;right:12px;bottom:12px;z-index:9000;display:flex;align-items:center;gap:12px;padding:12px 14px;background:#F4EFE8;color:#1A1714;border:1px solid #D8D0C4;border-radius:10px;box-shadow:0 8px 28px rgba(26,23,20,.14);font-family:"DM Sans",system-ui,sans-serif;max-width:520px;margin:0 auto;}' +
    '.tvi-bar img{width:40px;height:40px;border-radius:9px;flex:0 0 auto;border:1px solid #D8D0C4;}' +
    '.tvi-txt{flex:1;font-size:13px;line-height:1.4;}' +
    '.tvi-txt b{display:block;font-weight:500;font-size:14px;}' +
    '.tvi-btn{font:inherit;font-size:11px;letter-spacing:.06em;text-transform:uppercase;padding:10px 14px;border:0;border-radius:4px;background:#B5714A;color:#fff;cursor:pointer;white-space:nowrap;}' +
    '.tvi-btn:hover{background:#9c5f3c;}' +
    '.tvi-x{font:inherit;font-size:20px;line-height:1;border:0;background:none;color:#6B6560;cursor:pointer;padding:4px 6px;}' +
    '.tvi-bar button:focus-visible{outline:2px solid #B5714A;outline-offset:2px;}' +
    '.tvi-ov{position:fixed;inset:0;z-index:9100;background:rgba(26,23,20,.45);display:flex;align-items:flex-end;justify-content:center;font-family:"DM Sans",system-ui,sans-serif;}' +
    '.tvi-sheet{width:100%;max-width:520px;background:#F4EFE8;border-radius:16px 16px 0 0;padding:26px 24px calc(28px + env(safe-area-inset-bottom));color:#1A1714;}' +
    '.tvi-sheet h2{font-family:"Playfair Display",Georgia,serif;font-weight:400;font-size:24px;margin-bottom:14px;}' +
    '.tvi-sheet ol{margin:0 0 16px 20px;font-size:15px;line-height:1.75;}' +
    '.tvi-sheet p{font-size:13px;line-height:1.6;color:#6B6560;margin-bottom:20px;}' +
    '.tvi-sheet .tvi-btn{width:100%;padding:13px;}';
  document.head.appendChild(css);

  function dismiss(bar) {
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  }

  function showSheet() {
    var ov = document.createElement('div');
    ov.className = 'tvi-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML =
      '<div class="tvi-sheet">' +
        '<h2>Travona als App</h2>' +
        '<ol>' +
          '<li>Tippe in <b>Safari</b> auf das <b>Teilen-Symbol</b> (Quadrat mit Pfeil).</li>' +
          '<li>Wähle <b>„Zum Home-Bildschirm“</b>. Eventuell musst du dafür in der Liste nach unten scrollen.</li>' +
          '<li>Tippe auf <b>„Hinzufügen“</b>.</li>' +
        '</ol>' +
        '<p>Das funktioniert nur in Safari, nicht in der Vorschau einer anderen App. Öffne die Seite dafür zuerst in Safari.</p>' +
        '<button class="tvi-btn" type="button">Verstanden</button>' +
      '</div>';
    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('button').addEventListener('click', close);
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
    document.body.appendChild(ov);
  }

  function showBar() {
    if (document.querySelector('.tvi-bar')) return;
    var canPrompt = !!deferred;
    if (!canPrompt && !isIOS) return; // sonst kein sinnvoller Weg anzubieten
    var bar = document.createElement('div');
    bar.className = 'tvi-bar';
    bar.innerHTML =
      '<img src="/icon-192.png" alt="">' +
      '<div class="tvi-txt"><b>Travona als App</b>Auf den Startbildschirm legen.</div>' +
      '<button class="tvi-btn" type="button">' + (canPrompt ? 'Installieren' : 'So geht\u2019s') + '</button>' +
      '<button class="tvi-x" type="button" aria-label="Später">\u00d7</button>';
    bar.querySelector('.tvi-btn').addEventListener('click', function () {
      if (canPrompt && deferred) {
        deferred.prompt();
        deferred.userChoice.then(function () { deferred = null; dismiss(bar); });
      } else {
        showSheet();
      }
    });
    bar.querySelector('.tvi-x').addEventListener('click', function () { dismiss(bar); });
    document.body.appendChild(bar);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    setTimeout(showBar, 3000);
  });
  window.addEventListener('appinstalled', function () {
    var b = document.querySelector('.tvi-bar');
    if (b) b.parentNode.removeChild(b);
  });
  if (isIOS) {
    window.addEventListener('load', function () { setTimeout(showBar, 4000); });
  }
})();
