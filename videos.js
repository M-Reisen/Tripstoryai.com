// Travona – kurze Videos pro Reisetag
// Speicherort: Foto-Speicher „Reisefotos“, Ordner <reise>/videos/<datum>/
//   <zeit>_v<zufall>.mp4  das Video (max. 60 s)
//   <zeit>_v<zufall>.jpg  das Vorschaubild dazu (gleiche <zeit> = gehört zusammen)
// Große Handy-Videos (4K, 25 MB pro 10 s) werden vor dem Hochladen im Browser auf 720p
// verkleinert (ca. 2 MB pro 10 s), damit Speicher und Datenverkehr im bestehenden
// Supabase-Tarif bleiben. Abgespielt wird erst nach Antippen, vorher lädt nur das Vorschaubild.
// Die Seiten setzen Platzhalter <div class="tv-vids" data-iso="…"> in die Tageskarte;
// im Tagebuch (#journal-entries) hängt sich dieses Skript selbst an jeden Tag.
// Nutzt nur, was reisevorlage.html bzw. australien.html bereitstellen (sb, editMode, toast …).
(function(){
  var MAX_SEK=60;                 // längstes Video
  var MAX_MB=50;                  // größte Datei (auch Grenze im Foto-Speicher)
  var MAX_PRO_TAG=5;              // Videos pro Tag
  var ZIEL_PX=1280;               // lange Seite nach dem Verkleinern (720p)
  var ZIEL_BPS=2500000;           // Bildqualität nach dem Verkleinern (≈ 19 MB pro Minute)
  var DIREKT_MB=15;               // kleinere MP4-Dateien bis 1080p unverändert hochladen
  var BUCKET='Reisefotos';
  var VID_RE=/\.(mp4|mov|m4v|webm)$/i;

  function reise(){
    if(typeof REISE!=='undefined'&&REISE)return REISE;
    if(typeof REISE_ID!=='undefined'&&REISE_ID)return REISE_ID;
    return null;
  }
  function ordner(iso){return reise()+'/videos/'+iso;}
  function darfBearbeiten(){return typeof editMode!=='undefined'&&!!editMode;}
  function hinweis(t){try{if(typeof toast==='function')toast(t);else alert(t);}catch(e){}}
  function melde(t){try{if(window.travonaFehler)window.travonaFehler('Video: '+t,'videos.js');}catch(e){}}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function mb(b){return (b/1048576).toLocaleString('de-DE',{maximumFractionDigits:b<10485760?1:0})+' MB';}
  function sek(s){s=Math.round(s||0);return s<60?s+' s':Math.floor(s/60)+':'+('0'+s%60).slice(-2)+' min';}
  function url(pfad){return sb.storage.from(BUCKET).getPublicUrl(pfad).data.publicUrl;}

  // ── Laden ──────────────────────────────────────────────────────────────
  var tage=null;          // Promise → Set der Tage mit Videos (eine Abfrage für die ganze Reise)
  var cache={};           // iso → Promise → [{zeit, video, bild, pfade:[…]}]
  function tageMitVideos(){
    if(!tage){
      tage=sb.storage.from(BUCKET).list(reise()+'/videos',{limit:1000}).then(function(r){
        var s={};(r.data||[]).forEach(function(f){if(!f.id&&/^\d{4}-\d{2}-\d{2}$/.test(f.name))s[f.name]=1;});
        return s;
      }).catch(function(){return {};});
    }
    return tage;
  }
  function videosVom(iso){
    if(!cache[iso]){
      cache[iso]=tageMitVideos().then(function(s){
        if(!s[iso])return [];
        return sb.storage.from(BUCKET).list(ordner(iso),{limit:100}).then(function(r){
          var g={};
          (r.data||[]).forEach(function(f){
            if(!f.id)return;
            var z=(f.name.match(/^(\d{10,})_/)||[])[1];if(!z)return;
            var e=g[z]=g[z]||{zeit:+z,pfade:[]};
            var p=ordner(iso)+'/'+f.name;e.pfade.push(p);
            if(VID_RE.test(f.name))e.video=url(p);else if(/\.jpe?g$/i.test(f.name))e.bild=url(p);
          });
          return Object.keys(g).map(function(k){return g[k];}).filter(function(e){return e.video;}).sort(function(a,b){return a.zeit-b.zeit;});
        });
      }).catch(function(){delete cache[iso];return [];});
    }
    return cache[iso];
  }
  function neuLaden(iso){delete cache[iso];tage=null;zeichneAlle(iso);}

  // ── Anzeige ────────────────────────────────────────────────────────────
  function kachel(v,i,iso,edit){
    return '<div class="tvv-k" data-i="'+i+'">'
      +'<button type="button" class="tvv-play" data-src="'+esc(v.video)+'" aria-label="Video abspielen">'
      +(v.bild?'<img src="'+esc(v.bild)+'" alt="" loading="lazy" decoding="async">':'')
      +'<span class="tvv-pfeil">▶</span></button>'
      +(edit?'<button type="button" class="tvv-del" data-iso="'+esc(iso)+'" data-i="'+i+'" aria-label="Video löschen">✕</button>':'')
      +'</div>';
  }
  function fuelle(el){
    var iso=el.getAttribute('data-iso');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||'')||!reise())return;
    var edit=el.hasAttribute('data-edit')&&darfBearbeiten();
    videosVom(iso).then(function(list){
      if(!el.isConnected)return;
      if(!list.length&&!edit){el.innerHTML='';el.hidden=true;return;}
      el.hidden=false;
      el._tvv=list;
      el.innerHTML='<div class="tvv-label">🎬 Videos</div><div class="tvv-grid">'
        +list.map(function(v,i){return kachel(v,i,iso,edit);}).join('')
        +(edit&&list.length<MAX_PRO_TAG?'<label class="tvv-add"><span>🎬</span><span>Video</span><input type="file" accept="video/*" style="display:none"></label>':'')
        +'</div>'+(edit&&!list.length?'<div class="tvv-tipp">Kurze Clips bis '+MAX_SEK+' Sekunden. Gäste sehen sie wie deine Fotos.</div>':'');
    });
  }
  function zeichneAlle(iso){
    var els=document.querySelectorAll('.tv-vids[data-iso]');
    for(var i=0;i<els.length;i++)if(!iso||els[i].getAttribute('data-iso')===iso){els[i].removeAttribute('data-tvv');}
    scan();
  }
  function scan(){
    if(!reise()||typeof sb==='undefined')return;
    // Tagebuch: jedem Tag einen Platzhalter geben (vor den Reaktionen)
    var ents=document.querySelectorAll('#journal-entries .fig-journal-entry[data-jiso]');
    for(var i=0;i<ents.length;i++){
      var en=ents[i];if(en.querySelector('.tv-vids'))continue;
      var txt=en.querySelector('.fj-text');if(!txt)continue;
      var d=document.createElement('div');d.className='tv-vids tvv-journal';d.hidden=true;d.setAttribute('data-iso',en.getAttribute('data-jiso'));
      var re=txt.querySelector('.fj-react');
      if(re)txt.insertBefore(d,re);else txt.appendChild(d);
    }
    var els=document.querySelectorAll('.tv-vids[data-iso]:not([data-tvv])');
    for(var j=0;j<els.length;j++){els[j].setAttribute('data-tvv','1');fuelle(els[j]);}
  }
  var geplant=false;
  function bald(){if(geplant)return;geplant=true;requestAnimationFrame(function(){geplant=false;scan();});}

  // Antippen: Video abspielen (erst jetzt wird es geladen)
  document.addEventListener('click',function(ev){
    var b=ev.target.closest&&ev.target.closest('.tvv-play');
    if(b){
      ev.preventDefault();
      var v=document.createElement('video');
      v.src=b.getAttribute('data-src');v.controls=true;v.playsInline=true;v.setAttribute('playsinline','');v.preload='auto';
      v.className='tvv-video';
      var img=b.querySelector('img');if(img)v.poster=img.src;
      b.parentNode.replaceChild(v,b);
      var p=v.play();if(p&&p.catch)p.catch(function(){});
      return;
    }
    var del=ev.target.closest&&ev.target.closest('.tvv-del');
    if(del){ev.preventDefault();loeschen(del);}
  });
  document.addEventListener('change',function(ev){
    var inp=ev.target;
    if(!inp||!inp.closest||!inp.closest('.tvv-add'))return;
    var box=inp.closest('.tv-vids');var f=inp.files&&inp.files[0];inp.value='';
    if(box&&f)oeffneDialog(box.getAttribute('data-iso'),f);
  });

  function loeschen(btn){
    var box=btn.closest('.tv-vids');if(!box||!box._tvv)return;
    var iso=btn.getAttribute('data-iso'),v=box._tvv[+btn.getAttribute('data-i')];if(!v)return;
    var k=btn.closest('.tvv-k');if(k)k.style.display='none';
    var weg=function(){
      sb.storage.from(BUCKET).remove(v.pfade).then(function(r){
        if(r.error||(Array.isArray(r.data)&&!r.data.length)){hinweis('Video konnte nicht gelöscht werden.');}
        neuLaden(iso);
      });
    };
    if(typeof tvDeleteWithUndo==='function')tvDeleteWithUndo('Video gelöscht',weg,function(){if(k)k.style.display='';});
    else weg();
  }

  // ── Hochladen ──────────────────────────────────────────────────────────
  function mp4Typ(){
    if(typeof MediaRecorder==='undefined'||!MediaRecorder.isTypeSupported)return null;
    // Nur H.264 (spielt überall, auch auf dem iPhone). Safari nimmt „video/mp4“ immer als H.264 auf.
    var t=['video/mp4;codecs=avc1.42E01F,mp4a.40.2','video/mp4;codecs=avc1.42E01F','video/mp4;codecs=avc1,mp4a.40.2','video/mp4;codecs=avc1'];
    for(var i=0;i<t.length;i++)if(MediaRecorder.isTypeSupported(t[i]))return t[i];
    if(/Apple/.test(navigator.vendor||'')&&MediaRecorder.isTypeSupported('video/mp4'))return 'video/mp4';
    return null;
  }
  function kannVerkleinern(){
    var c=document.createElement('canvas');
    return !!(mp4Typ()&&c.captureStream);
  }
  function warte(el,ev,ms){
    return new Promise(function(res,rej){
      var t=setTimeout(function(){rej(new Error('Zeitüberschreitung: '+ev));},ms||15000);
      el.addEventListener(ev,function f(){clearTimeout(t);el.removeEventListener(ev,f);res();});
      el.addEventListener('error',function(){clearTimeout(t);rej(new Error('Video lässt sich nicht lesen'));},{once:true});
    });
  }
  function vorschaubild(v){
    var w=v.videoWidth,h=v.videoHeight,s=Math.min(1,720/Math.max(w,h));
    var c=document.createElement('canvas');c.width=Math.round(w*s);c.height=Math.round(h*s);
    c.getContext('2d').drawImage(v,0,0,c.width,c.height);
    return new Promise(function(res){c.toBlob(function(b){res(b);},'image/jpeg',0.8);});
  }

  var D=null; // offener Dialog
  function dialogHTML(){
    return '<div class="tvv-dlg" role="dialog" aria-modal="true" aria-label="Video hinzufügen">'
      +'<div class="tvv-box"><div class="tvv-h">🎬 Video hinzufügen</div>'
      +'<div class="tvv-vorschau"></div>'
      +'<div class="tvv-info">Video wird gelesen …</div>'
      +'<div class="tvv-bar" hidden><i></i></div>'
      +'<div class="tvv-btns"><button type="button" class="tvv-ab">Abbrechen</button><button type="button" class="tvv-ok" disabled>Hochladen</button></div>'
      +'</div></div>';
  }
  function schliessen(){
    if(!D)return;
    D.abbruch=true;
    try{if(D.rec&&D.rec.state!=='inactive')D.rec.stop();}catch(e){}
    try{D.v.pause();}catch(e){}
    try{if(D.ac)D.ac.close();}catch(e){}
    try{URL.revokeObjectURL(D.objUrl);}catch(e){}
    if(D.el)D.el.remove();
    D=null;
  }
  function info(t){if(D)D.el.querySelector('.tvv-info').innerHTML=t;}
  function balken(p){
    if(!D)return;var b=D.el.querySelector('.tvv-bar');b.hidden=p==null;
    if(p!=null)b.firstChild.style.width=Math.max(2,Math.min(100,Math.round(p*100)))+'%';
  }

  async function oeffneDialog(iso,file){
    schliessen();
    if(!/^video\//.test(file.type||'')&&!VID_RE.test(file.name||'')){hinweis('Bitte eine Videodatei wählen.');return;}
    var el=document.createElement('div');el.innerHTML=dialogHTML();el=el.firstChild;document.body.appendChild(el);
    var v=document.createElement('video');
    v.playsInline=true;v.setAttribute('playsinline','');v.preload='auto';v.muted=false;
    var objUrl=URL.createObjectURL(file);
    D={el:el,v:v,iso:iso,file:file,objUrl:objUrl};
    var d=D;
    el.querySelector('.tvv-vorschau').appendChild(v);
    el.querySelector('.tvv-ab').onclick=schliessen;
    el.querySelector('.tvv-ok').onclick=function(){starte(d);};
    try{
      v.src=objUrl;
      await warte(v,'loadedmetadata');
      if(d!==D)return;
      var dauer=v.duration;
      if(!isFinite(dauer)||dauer<=0)throw new Error('Länge unbekannt');
      if(dauer>MAX_SEK+0.5){
        info('Das Video ist '+sek(dauer)+' lang. Erlaubt sind bis zu '+MAX_SEK+' Sekunden.<br>Kürze es in der Fotos-App (Bearbeiten, Anfang und Ende ziehen) und wähle es dann noch einmal.');
        return;
      }
      // Vorschaubild aus dem Video (bei 0,5 s), danach zurück an den Anfang
      v.currentTime=Math.min(0.5,dauer/3);
      try{await warte(v,'seeked',8000);d.bild=await vorschaubild(v);}catch(e){}
      v.currentTime=0;
      try{await warte(v,'seeked',5000);}catch(e){}
      if(d!==D)return;
      var gross=Math.max(v.videoWidth,v.videoHeight);
      d.dauer=dauer;
      d.direkt=file.size<=DIREKT_MB*1048576&&/mp4/i.test(file.type||'')&&gross<=1920;
      d.verkleinern=!d.direkt&&kannVerkleinern();
      if(!d.direkt&&!d.verkleinern&&file.size>MAX_MB*1048576){
        info('Das Video ist '+mb(file.size)+' groß. Dieser Browser kann es nicht verkleinern, und mehr als '+MAX_MB+' MB gehen nicht.<br>Versuche es auf dem iPhone in Safari oder am Computer in Chrome, oder wähle einen kürzeren Clip.');
        return;
      }
      var ca=Math.max(0.3,dauer*ZIEL_BPS/8/1048576+dauer*0.016);
      info(sek(dauer)+' · '+mb(file.size)
        +(d.verkleinern?'<br>Wird vor dem Hochladen auf etwa '+mb(Math.min(file.size,ca*1048576))+' verkleinert. Das dauert so lange wie das Video, bitte die Seite so lange offen lassen.':''));
      el.querySelector('.tvv-ok').disabled=false;
    }catch(e){
      info('Dieses Video lässt sich hier nicht lesen. Versuche ein anderes Video oder einen anderen Browser.');
      melde('lesen: '+(e&&e.message||e));
    }
  }

  // Muss direkt im Tipp auf „Hochladen“ starten: nur dann darf das Video mit Ton laufen
  function starte(d){
    if(d!==D)return;
    d.el.querySelector('.tvv-ok').disabled=true;
    if(!d.verkleinern){hochladen(d,d.file,d.file.type&&/^video\//.test(d.file.type)?d.file.type:'video/mp4');return;}
    var v=d.v,typ=mp4Typ();
    var w=v.videoWidth,h=v.videoHeight,s=Math.min(1,ZIEL_PX/Math.max(w,h));
    var c=document.createElement('canvas');c.width=Math.round(w*s/2)*2;c.height=Math.round(h*s/2)*2;
    var ctx=c.getContext('2d');
    ctx.drawImage(v,0,0,c.width,c.height);
    var spuren=c.captureStream(30).getVideoTracks(),ohneTon=false;
    try{
      var AC=window.AudioContext||window.webkitAudioContext;
      d.ac=new AC();
      var src=d.ac.createMediaElementSource(v),ziel=d.ac.createMediaStreamDestination();
      src.connect(ziel);
      if(d.ac.resume)d.ac.resume();
      spuren=spuren.concat(ziel.stream.getAudioTracks());
    }catch(e){ohneTon=true;melde('ton: '+(e&&e.message||e));}
    var teile=[];
    try{
      d.rec=new MediaRecorder(new MediaStream(spuren),{mimeType:typ,videoBitsPerSecond:ZIEL_BPS,audioBitsPerSecond:128000});
    }catch(e){
      melde('recorder: '+(e&&e.message||e));
      ersatz(d,'Verkleinern geht in diesem Browser nicht.');return;
    }
    d.rec.ondataavailable=function(e){if(e.data&&e.data.size)teile.push(e.data);};
    var fertig=false;
    var malen=function(){
      if(fertig||d.abbruch)return;
      ctx.drawImage(v,0,0,c.width,c.height);
      balken(v.currentTime/d.dauer);
      if(v.requestVideoFrameCallback)v.requestVideoFrameCallback(malen);else requestAnimationFrame(malen);
    };
    var stopp=function(){if(fertig)return;fertig=true;try{d.rec.stop();}catch(e){}};
    d.rec.onstop=function(){
      if(d.abbruch||d.playFehler)return;
      var blob=new Blob(teile,{type:'video/mp4'});
      if(blob.size<20000){melde('leer: '+blob.size);ersatz(d,'Verkleinern hat nicht geklappt.');return;}
      if(blob.size>=d.file.size&&d.file.size<=MAX_MB*1048576){hochladen(d,d.file,d.file.type||'video/mp4');return;}
      hochladen(d,blob,'video/mp4');
    };
    v.onended=stopp;
    v.onerror=function(){melde('abspielen');stopp();};
    var not=setTimeout(stopp,(d.dauer*2+20)*1000);
    d.rec.addEventListener('stop',function(){clearTimeout(not);});
    info('Wird verkleinert …'+(ohneTon?' (ohne Ton)':'')+' Bitte die Seite offen lassen.');
    balken(0);
    d.rec.start(1000);
    var p=v.play();
    if(p&&p.catch)p.catch(function(e){
      melde('play: '+(e&&e.message||e));
      fertig=true;d.playFehler=true;try{d.rec.stop();}catch(x){}
      ersatz(d,'Das Video konnte nicht abgespielt werden.');
    });
    malen();
  }
  // Verkleinern geht nicht: Original hochladen, wenn es klein genug ist
  function ersatz(d,grund){
    if(d!==D)return;
    if(d.file.size<=MAX_MB*1048576){hochladen(d,d.file,d.file.type||'video/mp4');return;}
    balken(null);
    info(grund+' Das Original ist mit '+mb(d.file.size)+' zu groß (max. '+MAX_MB+' MB). Bitte einen kürzeren Clip wählen.');
  }

  async function hochladen(d,blob,typ){
    if(d!==D)return;
    if(blob.size>MAX_MB*1048576){balken(null);info('Das Video ist auch verkleinert noch '+mb(blob.size)+' groß (max. '+MAX_MB+' MB). Bitte einen kürzeren Clip wählen.');return;}
    try{d.v.pause();}catch(e){}
    info('Wird hochgeladen … '+mb(blob.size));balken(null);
    var zeit=Date.now(),z='v'+Math.random().toString(36).slice(2,10);
    var endung=/quicktime/i.test(typ)?'mov':/webm/i.test(typ)?'webm':'mp4';
    var basis=ordner(d.iso)+'/'+zeit+'_'+z;
    var r=await sb.storage.from(BUCKET).upload(basis+'.'+endung,blob,{contentType:typ.split(';')[0],cacheControl:'31536000'});
    if(d!==D)return;
    if(r.error){
      var m=String(r.error.message||r.error);
      melde('upload: '+m);
      balken(null);
      info(/mime|type|size|large|exceed/i.test(m)
        ?'Der Speicher nimmt noch keine Videos an. Die Freischaltung in Supabase fehlt noch.'
        :'Hochladen fehlgeschlagen ('+esc(m)+'). Bitte später noch einmal versuchen.');
      d.el.querySelector('.tvv-ok').disabled=false;
      return;
    }
    if(d.bild){try{await sb.storage.from(BUCKET).upload(basis+'.jpg',d.bild,{contentType:'image/jpeg',cacheControl:'31536000'});}catch(e){}}
    var iso=d.iso;
    schliessen();
    hinweis('Video hochgeladen');
    neuLaden(iso);
  }

  // ── Aussehen ───────────────────────────────────────────────────────────
  var css=''
    +'.tv-vids{padding:12px 28px 4px}.tv-vids[hidden]{display:none}'
    +'.tvv-journal{padding:14px 0 0}'
    +'.tvv-label{font-size:.72rem;font-weight:500;color:var(--fog,#8a8178);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}'
    +'.tvv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}'
    +'.tvv-journal .tvv-grid{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}'
    +'.tvv-k{position:relative;border-radius:12px;overflow:hidden;background:#1A1714;aspect-ratio:1/1}'
    +'.tvv-play{all:unset;cursor:pointer;display:block;width:100%;height:100%;position:relative}'
    +'.tvv-play img{width:100%;height:100%;object-fit:cover;display:block}'
    +'.tvv-pfeil{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:58px;height:58px;border-radius:50%;background:rgba(255,255,255,.92);color:#C4622D;font-size:24px;display:flex;align-items:center;justify-content:center;padding-left:4px;box-sizing:border-box;box-shadow:0 4px 16px rgba(0,0,0,.3)}'
    +'.tvv-video{width:100%;height:100%;object-fit:contain;background:#000;display:block}'
    +'.tvv-del{position:absolute;top:6px;right:6px;width:30px;height:30px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:14px;cursor:pointer}'
    +'.tvv-add{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:2px dashed rgba(0,0,0,.18);border-radius:12px;min-height:120px;cursor:pointer;color:var(--fog,#8a8178);font-size:.8rem}'
    +'.tvv-add span:first-child{font-size:1.4rem}'
    +'.tvv-tipp{font-size:.75rem;color:var(--fog,#8a8178);margin-top:6px}'
    +'.tvv-dlg{position:fixed;inset:0;z-index:100000;background:rgba(26,23,20,.55);display:flex;align-items:center;justify-content:center;padding:16px}'
    +'.tvv-box{background:#fff;color:#1A1714;border-radius:18px;padding:20px;width:100%;max-width:420px;font:400 16px/1.45 "DM Sans",Inter,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35)}'
    +'.tvv-h{font:600 1.15rem/1.3 "Playfair Display",Georgia,serif;margin-bottom:12px}'
    +'.tvv-vorschau video{width:100%;max-height:42vh;border-radius:12px;background:#000;display:block}'
    +'.tvv-info{margin:12px 0 4px;font-size:.92rem;color:#4a443e}'
    +'.tvv-bar{height:8px;border-radius:4px;background:#eee4d8;overflow:hidden;margin:8px 0}.tvv-bar i{display:block;height:100%;width:2%;background:#C4622D;transition:width .3s}'
    +'.tvv-btns{display:flex;gap:10px;justify-content:flex-end;margin-top:14px}'
    +'.tvv-btns button{font:600 16px/1 "DM Sans",Inter,sans-serif;border-radius:12px;padding:13px 18px;cursor:pointer;border:1px solid rgba(0,0,0,.15);background:#fff;color:#1A1714}'
    +'.tvv-btns .tvv-ok{background:#C4622D;border-color:#C4622D;color:#fff}.tvv-btns .tvv-ok:disabled{opacity:.45;cursor:default}'
    +'.fig-journal-entry.jr-collapsed .tv-vids{display:none !important}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  function los(){
    new MutationObserver(bald).observe(document.body,{childList:true,subtree:true});
    scan();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',los);else los();
  window.tvVideos={neuLaden:neuLaden};
})();
