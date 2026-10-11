// Travona – „Gut zu wissen“: Besonderheiten des Reiselandes als kurze Tipp-Karten (kein Fließtext).
// Eigene Ansicht #section-tipps (Mehr › Gut zu wissen, für Besucher Tab „Tipps“, Link …#tipps).
// Seiten ohne diese Ansicht zeigen es weiter unter der Route. Besucher sehen die Karten, sobald es Tipps gibt.
// Die Besitzerin legt Tipps an, bearbeitet oder löscht sie und lässt sich von der KI Vorschläge
// aus ihren Tagebuchtexten machen (Abhaken und Übernehmen).
// Gespeichert als eine Zeile in kommentare: ort = <reise>_gutzuwissen, nachricht = JSON {tips:[{id,k,t,d}]}.
(function(){
  var KATS=[
    {k:'essen',ic:'🍽️',l:'Essen & Trinken'},
    {k:'alltag',ic:'🙂',l:'Alltag & Umgangsformen'},
    {k:'geld',ic:'💳',l:'Geld & Trinkgeld'},
    {k:'unterwegs',ic:'🚗',l:'Unterwegs'},
    {k:'sprache',ic:'🗣️',l:'Sprache'},
    {k:'natur',ic:'☀️',l:'Natur & Sicherheit'},
    {k:'sonst',ic:'📌',l:'Sonstiges'}
  ];
  var D={tips:[]},geladen=false,sec=null;

  function E(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function kat(k){for(var i=0;i<KATS.length;i++)if(KATS[i].k===k)return KATS[i];return KATS[KATS.length-1];}
  function besitzer(){return typeof editMode!=='undefined'&&!!editMode;}
  function meldung(t){if(typeof toast==='function')toast(t);}
  function tripKey(){
    var k=(typeof REISE!=='undefined'&&REISE)||(typeof REISE_ID!=='undefined'&&REISE_ID)||location.pathname;
    return String(k).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60)||'x';
  }
  function tripId(){return (typeof REISE!=='undefined'&&REISE)||(typeof REISE_ID!=='undefined'&&REISE_ID)||null;}
  function key(){return (typeof PFX!=='undefined'&&PFX?PFX:tripKey()+'_')+'gutzuwissen';}
  function land(){
    var h=(typeof tripHead!=='undefined'&&tripHead)||{};
    var t=String(h.title||'').replace(/\s*\d{4}\s*$/,'').trim();
    return t;
  }
  function neueId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}

  // ── Laden / Speichern ─────────────────────────────────────────────────────
  async function laden(){
    if(typeof sb==='undefined')return;
    try{
      var r=await sb.from('kommentare').select('nachricht').eq('ort',key()).limit(1);
      if(r.error)return;
      if(r.data&&r.data.length){var j=JSON.parse(r.data[0].nachricht||'{}');if(j&&Array.isArray(j.tips))D=j;}
      geladen=true;
    }catch(e){}
  }
  async function speichern(){
    var payload=JSON.stringify(D);
    var r=await sb.from('kommentare').select('id').eq('ort',key()).limit(1),res;
    if(r.error)throw r.error;
    if(r.data&&r.data.length)res=await sb.from('kommentare').update({nachricht:payload}).eq('id',r.data[0].id);
    else res=await sb.from('kommentare').insert({ort:key(),name:'Gut zu wissen',nachricht:payload,created_at:new Date().toISOString(),owner:typeof currentUser!=='undefined'&&currentUser?currentUser.id:null,trip_id:tripId()});
    if(res&&res.error)throw res.error;
  }

  // ── Darstellung ───────────────────────────────────────────────────────────
  function css(){
    if(document.getElementById('gzw-css'))return;
    var s=document.createElement('style');s.id='gzw-css';
    s.textContent=''
      +'.gzw{margin-top:34px}#section-tipps .gzw{margin-top:0}'
      +'.gzw h3{font-family:"Playfair Display",serif;font-weight:400;font-size:1.6rem;margin:0 0 4px;color:var(--a-ink,#1A1714)}'
      +'.gzw-sub{font-size:.85rem;color:var(--a-fog,#6B6560);margin:0 0 16px}'
      +'.gzw-acts{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}'
      +'.gzw-b{font:600 14px "DM Sans",sans-serif;padding:11px 16px;border-radius:999px;border:1px solid var(--a-line,#D8D0C4);background:#fff;color:var(--a-ink,#1A1714);cursor:pointer}'
      +'.gzw-b.pri{background:var(--a-ink,#1A1714);color:#fff;border-color:var(--a-ink,#1A1714)}'
      +'.gzw-kat{margin:0 0 14px}'
      +'.gzw-kat-t{font:700 12px "DM Sans",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--terra,#B5714A);margin:0 0 8px}'
      +'.gzw-tip{display:flex;gap:12px;align-items:flex-start;background:#fff;border-radius:16px;padding:12px 14px;margin:0 0 8px;box-shadow:var(--a-sh,0 2px 10px rgba(0,0,0,.06))}'
      +'.gzw-ic{font-size:20px;line-height:1.3;flex-shrink:0}'
      +'.gzw-t{font:600 15px/1.4 "DM Sans",sans-serif;color:var(--a-ink,#1A1714)}'
      +'.gzw-d{font-size:.86rem;line-height:1.5;color:var(--a-fog,#6B6560);margin-top:2px}'
      +'.gzw-ed{margin-left:auto;flex-shrink:0;border:0;background:var(--a-sand,#EFE7DC);border-radius:50%;width:34px;height:34px;cursor:pointer;font-size:14px}'
      +'.gzw-leer{background:#fff;border-radius:16px;padding:16px;color:var(--a-fog,#6B6560);font-size:.9rem;line-height:1.6}'
      +'.gzw-ov{position:fixed;inset:0;z-index:9800;background:rgba(26,23,20,.55);display:flex;align-items:flex-end;justify-content:center}'
      +'.gzw-sh{width:100%;max-width:520px;max-height:88vh;overflow:auto;background:#F7F1E8;border-radius:24px 24px 0 0;padding:18px 18px calc(22px + env(safe-area-inset-bottom));box-sizing:border-box}'
      +'.gzw-sh h4{font:700 19px "DM Sans",sans-serif;margin:0 0 12px}'
      +'.gzw-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}'
      +'.gzw-chip{font:500 13px "DM Sans",sans-serif;padding:8px 12px;border-radius:999px;border:1px solid var(--a-line,#D8D0C4);background:#fff;cursor:pointer}'
      +'.gzw-chip.on{background:var(--a-ink,#1A1714);color:#fff;border-color:var(--a-ink,#1A1714)}'
      +'.gzw-sh input,.gzw-sh textarea{width:100%;box-sizing:border-box;font:16px "DM Sans",sans-serif;padding:12px;border:1px solid var(--a-line,#D8D0C4);border-radius:12px;background:#fff;margin:0 0 10px}'
      +'.gzw-row{display:flex;gap:8px;justify-content:space-between;align-items:center;margin-top:6px}'
      +'.gzw-vs{text-transform:none;letter-spacing:normal;font-weight:400;display:flex;gap:10px;align-items:flex-start;background:#fff;border-radius:14px;padding:12px;margin:0 0 8px;cursor:pointer}'
      +'.gzw-vs input{width:22px;height:22px;margin:2px 0 0;flex-shrink:0}'
      +'.gzw-q{font-size:.72rem;color:var(--terra,#B5714A);margin-top:3px}';
    document.head.appendChild(s);
  }
  function anker(){return document.getElementById('section-tipps')||document.getElementById('section-route');}
  function eigeneAnsicht(){var a=anker();return !!a&&a.id==='section-tipps';}
  function zeichnen(){
    var a=anker();if(!a)return;
    css();
    var own=besitzer(),tips=D.tips||[];
    if(!sec||!sec.isConnected){sec=document.createElement('div');sec.id='tv-gzw';sec.className='gzw';a.appendChild(sec);}
    if(!own&&!tips.length){
      if(eigeneAnsicht()){sec.style.display='';sec.innerHTML='<h3>Gut zu wissen</h3><div class="gzw-leer">Für diese Reise gibt es noch keine Tipps.</div>';return;}
      sec.style.display='none';sec.innerHTML='';return;
    }
    sec.style.display='';
    var l=land();
    var h=(own&&eigeneAnsicht()?'<button type="button" class="app-back" onclick="appShow(\'mehr\')" style="margin:0 0 14px">← Mehr</button>':'')
      +'<h3>Gut zu wissen'+(l?' in '+E(l):'')+'</h3><p class="gzw-sub">Besonderheiten des Landes, kurz notiert.</p>';
    if(own)h+='<div class="gzw-acts"><button type="button" class="gzw-b pri" data-gzw="neu">＋ Tipp notieren</button><button type="button" class="gzw-b" data-gzw="ki">✨ KI-Vorschläge aus dem Tagebuch</button></div>';
    if(!tips.length){
      h+='<div class="gzw-leer">Noch keine Tipps. Notiere z. B. „Bestellen und zahlen an der Theke, das Essen wird gebracht“. Oder lass dir Vorschläge aus deinen Tagebuchtexten machen.</div>';
    }else{
      KATS.forEach(function(k){
        var ts=tips.filter(function(t){return kat(t.k).k===k.k;});
        if(!ts.length)return;
        h+='<div class="gzw-kat"><div class="gzw-kat-t">'+k.ic+' '+E(k.l)+'</div>'
          +ts.map(function(t){
            return '<div class="gzw-tip"><div><div class="gzw-t">'+E(t.t)+'</div>'+(t.d?'<div class="gzw-d">'+E(t.d)+'</div>':'')+'</div>'
              +(own?'<button type="button" class="gzw-ed" data-gzw="ed" data-id="'+E(t.id)+'" aria-label="Tipp bearbeiten">✎</button>':'')+'</div>';
          }).join('')+'</div>';
      });
    }
    sec.innerHTML=h;
  }

  // ── Tipp anlegen / bearbeiten ─────────────────────────────────────────────
  function schliessen(){if(typeof stopDictation==='function')stopDictation();var o=document.getElementById('gzw-ov');if(o)o.remove();}
  function overlay(inner){
    schliessen();
    var o=document.createElement('div');o.id='gzw-ov';o.className='gzw-ov';
    o.innerHTML='<div class="gzw-sh" role="dialog" aria-modal="true">'+inner+'</div>';
    o.addEventListener('click',function(e){if(e.target===o)schliessen();});
    document.body.appendChild(o);
    return o;
  }
  function editor(id){
    var tip=null;(D.tips||[]).forEach(function(t){if(t.id===id)tip=t;});
    var k=tip?kat(tip.k).k:'essen';
    var o=overlay('<h4>'+(tip?'Tipp bearbeiten':'Tipp notieren')+'</h4>'
      +'<div class="gzw-chips">'+KATS.map(function(x){return '<button type="button" class="gzw-chip'+(x.k===k?' on':'')+'" data-k="'+x.k+'">'+x.ic+' '+E(x.l)+'</button>';}).join('')+'</div>'
      +'<input id="gzw-t" maxlength="120" placeholder="Kurz, z. B. Man stellt sich in einer Schlange an" value="'+E(tip?tip.t:'')+'">'
      +'<textarea id="gzw-d" rows="2" maxlength="300" placeholder="Optional: ein Satz mehr dazu">'+E(tip?tip.d||'':'')+'</textarea>'
      +'<div class="gzw-row">'
        +(typeof startDictationFor==='function'?'<button type="button" class="gzw-b" id="gzw-dict">Diktieren</button>':'<span></span>')
        +'<span style="display:flex;gap:8px">'+(tip?'<button type="button" class="gzw-b" id="gzw-del" style="color:#B3261E">Löschen</button>':'')
        +'<button type="button" class="gzw-b pri" id="gzw-ok">Speichern</button></span></div>');
    o.querySelectorAll('.gzw-chip').forEach(function(c){c.onclick=function(){k=c.getAttribute('data-k');o.querySelectorAll('.gzw-chip').forEach(function(x){x.classList.toggle('on',x===c);});};});
    var dict=o.querySelector('#gzw-dict');if(dict)dict.onclick=function(){startDictationFor('gzw-t','gzw-dict',['gzw-d']);};
    setTimeout(function(){var i=o.querySelector('#gzw-t');if(i&&!tip)i.focus();},150);
    o.querySelector('#gzw-ok').onclick=async function(){
      var t=o.querySelector('#gzw-t').value.trim(),d=o.querySelector('#gzw-d').value.trim();
      if(!t){meldung('Bitte eine kurze Zeile schreiben.');return;}
      var vorher=JSON.stringify(D);
      if(tip){tip.k=k;tip.t=t;tip.d=d;}else D.tips.push({id:neueId(),k:k,t:t,d:d});
      this.disabled=true;
      try{await speichern();schliessen();zeichnen();meldung('✓ Tipp gespeichert');}
      catch(e){D=JSON.parse(vorher);this.disabled=false;meldung('Speichern fehlgeschlagen. Bitte erneut versuchen.');}
    };
    var del=o.querySelector('#gzw-del');
    if(del)del.onclick=async function(){
      var vorher=JSON.stringify(D);
      D.tips=D.tips.filter(function(t){return t.id!==id;});
      try{await speichern();schliessen();zeichnen();meldung('Tipp gelöscht');}
      catch(e){D=JSON.parse(vorher);meldung('Löschen fehlgeschlagen. Bitte erneut versuchen.');}
    };
  }

  // ── KI-Vorschläge aus den Tagebuchtexten ──────────────────────────────────
  function tagebuchTexte(){
    var out=[];
    try{
      if(Array.isArray(entries)){
        entries.forEach(function(e){if(e&&e.text&&/^\d{4}-\d{2}-\d{2}$/.test(e.datum||''))out.push({iso:e.datum,t:(e.titel?e.titel+': ':'')+e.text});});
      }else if(entries&&typeof entries==='object'){
        Object.keys(entries).forEach(function(iso){var e=entries[iso];if(e&&e.text)out.push({iso:iso,t:[e.titel,e.ort].filter(Boolean).join(', ')+(e.titel||e.ort?': ':'')+e.text});});
      }
    }catch(e){}
    out.sort(function(a,b){return a.iso<b.iso?-1:1;});
    var s='';out.forEach(function(x){if(s.length<14000)s+=x.iso+' – '+x.t.replace(/\s+/g,' ').trim()+'\n';});
    return s.slice(0,14000);
  }
  function jsonAus(txt){
    var t=String(txt||'').replace(/```json/gi,'').replace(/```/g,'');
    var a=t.indexOf('['),b=t.lastIndexOf(']');
    if(a<0||b<a)return null;
    try{return JSON.parse(t.slice(a,b+1));}catch(e){return null;}
  }
  async function kiVorschlaege(btn){
    if(typeof currentUser==='undefined'||!currentUser){meldung('Bitte zuerst anmelden.');return;}
    if(typeof AI_PROXY_URL==='undefined'){meldung('KI ist hier nicht verfügbar.');return;}
    var texte=tagebuchTexte(),l=land()||'dem Reiseland';
    var schon=(D.tips||[]).map(function(t){return '- '+t.t;}).join('\n');
    var prompt='Du hilfst bei einem privaten Reisetagebuch über eine Reise nach '+l+'. '
      +'Sammle kurze, praktische Besonderheiten des Landes, die Reisende wissen sollten (z. B. Bestellen und Zahlen an der Theke, Anstehen in der Schlange, Trinkgeld, Linksverkehr, typische Redewendungen, Sonnenschutz). '
      +'Nimm zuerst alles, was in den Tagebuchtexten unten vorkommt (quelle "tagebuch"). Ergänze höchstens 6 allgemein bekannte, sichere Besonderheiten des Landes (quelle "allgemein"). Erfinde nichts Unsicheres. '
      +'Lass weg, was schon notiert ist. Jeder Tipp: eine kurze Zeile (max. 90 Zeichen) und optional ein erklärender Satz. '
      +'Kategorien (k): essen, alltag, geld, unterwegs, sprache, natur, sonst. '
      +'Antworte NUR mit einem JSON-Array, ohne Einleitung, im Format [{"k":"essen","t":"...","d":"...","q":"tagebuch"}], höchstens 14 Einträge, auf Deutsch.\n\n'
      +'Schon notiert:\n'+(schon||'(nichts)')+'\n\nTagebuchtexte:\n'+(texte||'(keine Texte vorhanden)');
    var alt=btn?btn.textContent:'';
    if(btn){btn.disabled=true;btn.textContent='✨ KI denkt nach …';}
    try{
      var headers=typeof aiAuthHeaders==='function'?await aiAuthHeaders():{'Content-Type':'application/json'};
      var r=await fetch(AI_PROXY_URL,{method:'POST',headers:headers,body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:2000,messages:[{role:'user',content:prompt}]})});
      var d=await r.json();
      if(d.error){meldung('KI-Fehler: '+((typeof d.error==='string'?d.error:d.error.message)||'unbekannt'));return;}
      var txt=d.content?d.content.map(function(c){return c.text||'';}).join(''):'';
      var liste=jsonAus(txt);
      if(!liste||!liste.length){meldung('Keine Vorschläge erhalten. Bitte später nochmal versuchen.');return;}
      liste=liste.filter(function(x){return x&&typeof x.t==='string'&&x.t.trim();}).slice(0,14).map(function(x){
        return {k:kat(String(x.k||'')).k,t:String(x.t).trim().slice(0,120),d:String(x.d||'').trim().slice(0,300),q:x.q==='tagebuch'?'tagebuch':'allgemein'};
      });
      auswahl(liste);
    }catch(e){meldung('Verbindungsfehler. Bitte erneut versuchen.');}
    finally{if(btn){btn.disabled=false;btn.textContent=alt;}}
  }
  function auswahl(liste){
    var o=overlay('<h4>KI-Vorschläge</h4><p class="gzw-sub" style="margin-bottom:12px">Hake an, was du übernehmen willst. Du kannst jeden Tipp danach noch ändern.</p>'
      +liste.map(function(x,i){var kk=kat(x.k);return '<label class="gzw-vs"><input type="checkbox" data-i="'+i+'" checked><span><div class="gzw-t">'+kk.ic+' '+E(x.t)+'</div>'+(x.d?'<div class="gzw-d">'+E(x.d)+'</div>':'')+'<div class="gzw-q">'+(x.q==='tagebuch'?'aus deinem Tagebuch':'allgemeiner Tipp')+'</div></span></label>';}).join('')
      +'<div class="gzw-row"><button type="button" class="gzw-b" id="gzw-ab">Abbrechen</button><button type="button" class="gzw-b pri" id="gzw-uber">Übernehmen</button></div>');
    o.querySelector('#gzw-ab').onclick=schliessen;
    o.querySelector('#gzw-uber').onclick=async function(){
      var neu=[];o.querySelectorAll('input[type=checkbox]').forEach(function(c){if(c.checked){var x=liste[+c.getAttribute('data-i')];neu.push({id:neueId(),k:x.k,t:x.t,d:x.d});}});
      if(!neu.length){schliessen();return;}
      var vorher=JSON.stringify(D);
      D.tips=(D.tips||[]).concat(neu);
      this.disabled=true;
      try{await speichern();schliessen();zeichnen();meldung('✓ '+neu.length+(neu.length===1?' Tipp':' Tipps')+' übernommen');}
      catch(e){D=JSON.parse(vorher);this.disabled=false;meldung('Speichern fehlgeschlagen. Bitte erneut versuchen.');}
    };
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  document.addEventListener('click',function(ev){
    var b=ev.target&&ev.target.closest?ev.target.closest('[data-gzw]'):null;
    if(!b||!besitzer())return;
    var a=b.getAttribute('data-gzw');
    if(a==='neu')editor(null);
    else if(a==='ed')editor(b.getAttribute('data-id'));
    else if(a==='ki')kiVorschlaege(b);
  });
  function warte(cb){
    var n=0;
    (function tick(){
      // Bei schönen Adressen wird die Reise teils erst nach der Anmeldung aufgelöst
      var offen=typeof REISE!=='undefined'&&!REISE&&!!window.__ROUTE;
      if(typeof _qxAuthDone!=='undefined'&&_qxAuthDone&&!offen)return cb();
      if(++n<100)setTimeout(tick,200);else cb();
    })();
  }
  window.TvGzw={
    zeigen:function(){if(eigeneAnsicht()&&window.appShow)return appShow('tipps');var s=document.getElementById('tv-gzw');if(s)try{s.scrollIntoView({behavior:'smooth',block:'start'});}catch(e){}},
    hatTipps:function(){return !!(D.tips&&D.tips.length);},
    neu:function(){if(besitzer())editor(null);}
  };
  if(!anker())return;
  warte(async function(){
    await laden();
    zeichnen();
    if(window.appTabs)try{appTabs();}catch(e){}   // Besucher-Tab „Tipps“ erscheint, sobald es Tipps gibt
    // Gästeansicht an/aus oder spätere Anmeldung: neu zeichnen
    new MutationObserver(function(){zeichnen();}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
    // Die Seite zeichnet den Routen-Bereich teils neu: Abschnitt dann wieder anhängen
    var a=anker();if(a)new MutationObserver(function(){if(!sec||!sec.isConnected)zeichnen();}).observe(a,{childList:true});
  });
})();
