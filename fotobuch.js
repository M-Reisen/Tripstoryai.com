/* Travona – Fotobuch
 * Baut aus den Reisedaten ein Fotobuch (A4 quer), zeigt es sofort an und lädt Fotos erst,
 * wenn sie im Bild sind. Fürs Drucken werden die Fotos passend zur Rahmengröße in
 * Druckqualität nachgeladen (Supabase-Bildumwandlung, sonst Original).
 *
 * Zwei Ausgaben:
 *  - „Drucken / PDF“: A4 quer, ohne Beschnitt, ca. 200 dpi (Zuhause, Teilen)
 *  - „Druckdatei“:    303 × 216 mm (A4 quer + 3 mm Beschnitt je Seite), 300 dpi,
 *                     gerade Seitenzahl – für Fotobuch-Anbieter (siehe docs/fotobuch-druck.md)
 *
 * Aufruf: TvFotobuch.busy('…'); TvFotobuch.open(buch)
 * buch = {title, sub, dates, stations:[…], cover:url, items:[
 *   {type:'hotel', name, ort, photo, stars, note, extraHtml},
 *   {type:'day', date, ort, titel, text, photos:[{url, cap}]} ]}
 */
(function(){
  'use strict';
  var PX_MM=96/25.4;                 // CSS-Pixel je Millimeter
  var W=297,H=210,BLEED=3,M=15,GAP=4; // Seitenmaße in mm, Rand, Fotoabstand
  var MAX_PX=2500;                   // Obergrenze der Supabase-Bildumwandlung
  var MAX_PER_PAGE=8,MAX_PAGES_PER_DAY=3,LONG_TEXT=400,TEXT_PER_PAGE=3300;
  var FONTS='https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500&display=swap';
  var MODES={
    home:{bleed:0,dpi:200,label:'Drucken / PDF'},
    pro:{bleed:BLEED,dpi:300,label:'Druckdatei'}
  };
  var S={root:null,host:null,mode:'home',book:null,cancel:false};

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function toast(t){try{window.toast(t);}catch(e){}}
  function mm(v){return (Math.round(v*100)/100)+'mm';}

  // ── Bildadressen ──────────────────────────────────────────────────────────
  var RX=/^(https:\/\/[^\/]+)\/storage\/v1\/(?:object|render\/image)\/public\/(Reisefotos\/[^?]+\.(?:jpe?g|png|webp))(?:\?.*)?$/i;
  // Vorschau-/Thumb-Adresse zurück auf das Original
  function original(u){
    u=String(u||'');var m=u.match(RX);
    return m?m[1]+'/storage/v1/object/public/'+m[2]:u;
  }
  // Bildumwandlung aus? (gleiche Regel wie tvThumb auf der Seite)
  function thumbsOff(u){
    if(window.__noThumb)return true;
    try{if(window.tvThumb&&window.tvThumb(u,64)===u)return true;}catch(e){}
    return false;
  }
  // Foto genau in Rahmengröße anfordern (wMm × hMm bei pxPerMm)
  function sized(u,wMm,hMm,pxPerMm,fit,q){
    var o=original(u),m=o.match(RX);
    if(!m||/^Reisefotos\/Logo\//.test(m[2])||thumbsOff(o))return o;
    var w=wMm*pxPerMm,h=hMm*pxPerMm,k=Math.min(1,MAX_PX/Math.max(w,h));
    w=Math.max(16,Math.round(w*k));h=Math.max(16,Math.round(h*k));
    return m[1]+'/storage/v1/render/image/public/'+m[2]+'?width='+w+'&height='+h+'&resize='+(fit||'cover')+'&quality='+(q||75);
  }

  // ── Seitenaufbau ──────────────────────────────────────────────────────────
  // Rahmen als Anteile [x,y,b,h] der Fotofläche; je Fotoanzahl ein Raster
  var LAYOUTS={
    1:[[0,0,1,1]],
    2:[[0,0,.5,1],[.5,0,.5,1]],
    3:[[0,0,.58,1],[.58,0,.42,.5],[.58,.5,.42,.5]],
    4:[[0,0,.5,.5],[.5,0,.5,.5],[0,.5,.5,.5],[.5,.5,.5,.5]],
    5:[[0,0,.5,1],[.5,0,.25,.5],[.75,0,.25,.5],[.5,.5,.25,.5],[.75,.5,.25,.5]],
    6:[[0,0,1/3,.5],[1/3,0,1/3,.5],[2/3,0,1/3,.5],[0,.5,1/3,.5],[1/3,.5,1/3,.5],[2/3,.5,1/3,.5]],
    7:[[0,0,.4,1],[.4,0,.2,.5],[.6,0,.2,.5],[.8,0,.2,.5],[.4,.5,.2,.5],[.6,.5,.2,.5],[.8,.5,.2,.5]],
    8:[[0,0,.25,.5],[.25,0,.25,.5],[.5,0,.25,.5],[.75,0,.25,.5],[0,.5,.25,.5],[.25,.5,.25,.5],[.5,.5,.25,.5],[.75,.5,.25,.5]]
  };
  function rects(n,ax,ay,aw,ah,mirror){
    return (LAYOUTS[n]||LAYOUTS[8]).map(function(f){
      var fx=mirror?1-f[0]-f[2]:f[0],fy=f[1],fw=f[2],fh=f[3];
      var l=fx>0.001?GAP/2:0,r=fx+fw<0.999?GAP/2:0,t=fy>0.001?GAP/2:0,b=fy+fh<0.999?GAP/2:0;
      return {x:ax+fx*aw+l,y:ay+fy*ah+t,w:fw*aw-l-r,h:fh*ah-t-b};
    });
  }
  // Ein Foto: Position in mm (Beschnittzugabe über --b); data-* für die Druckauflösung
  function photo(p,r,fit,bleedEdges){
    var cap=p.cap?String(p.cap):'';
    var capH=cap?6:0;
    var e=bleedEdges||'';
    var left='calc('+mm(r.x)+(e.indexOf('l')>=0?' - var(--b)':'')+')';
    var top='calc('+mm(r.y)+(e.indexOf('t')>=0?' - var(--b)':'')+')';
    var wd='calc('+mm(r.w)+(e.indexOf('l')>=0?' + var(--b)':'')+(e.indexOf('r')>=0?' + var(--b)':'')+')';
    var ht='calc('+mm(r.h)+(e.indexOf('t')>=0?' + var(--b)':'')+(e.indexOf('b')>=0?' + var(--b)':'')+')';
    var bw=r.w+(e.indexOf('l')>=0?BLEED:0)+(e.indexOf('r')>=0?BLEED:0);
    var bh=r.h-capH+(e.indexOf('t')>=0?BLEED:0)+(e.indexOf('b')>=0?BLEED:0);
    return '<figure class="pb-ph'+(fit==='contain'?' contain':'')+(cap?' has-cap':'')+'" style="left:'+left+';top:'+top+';width:'+wd+';height:'+ht+'">'
      +'<img alt="" loading="lazy" decoding="async" data-src="'+esc(original(p.url))+'" data-w="'+bw.toFixed(1)+'" data-h="'+bh.toFixed(1)+'" data-fit="'+(fit||'cover')+'">'
      +(cap?'<figcaption>'+esc(cap)+'</figcaption>':'')+'</figure>';
  }
  function header(eyebrow,date,ort){
    return '<header class="pb-hd"><div><div class="pb-eyebrow">'+esc(eyebrow)+'</div><div class="pb-date">'+esc(date)+'</div></div>'
      +(ort?'<div class="pb-ort">'+esc(ort)+'</div>':'')+'</header>';
  }
  function slimHeader(date,ort){
    return '<header class="pb-hd slim"><div class="pb-date-s">'+esc(date)+'</div>'+(ort?'<div class="pb-ort">'+esc(ort)+'</div>':'')+'</header>';
  }
  function page(cls,inner,folio){
    return '<section class="pb-page '+cls+'"><div class="pb-trim">'+inner+(folio?'<div class="pb-folio">'+folio+'</div>':'')+'</div></section>';
  }
  function textHtml(t){return esc(t).replace(/\n{2,}/g,'</p><p>').replace(/\n/g,'<br>');}
  // geschätzte Höhe (mm) eines kurzen Textblocks unter den Fotos
  function textBoxHeight(titel,text){
    var cols=text.length>180?2:1,perLine=cols===1?140:134;
    var lines=Math.ceil(text.length/perLine)+(text.match(/\n/g)||[]).length;
    return Math.min(40,(titel?8:0)+Math.max(1,lines)*5.4+2);
  }
  // langen Text an Absatz- oder Satzgrenzen auf Seiten verteilen
  function splitText(t){
    var out=[];t=String(t);
    while(t.length>TEXT_PER_PAGE){
      var cut=t.lastIndexOf('\n',TEXT_PER_PAGE);
      if(cut<TEXT_PER_PAGE*0.6)cut=t.lastIndexOf('. ',TEXT_PER_PAGE)+1;
      if(cut<TEXT_PER_PAGE*0.6)cut=t.lastIndexOf(' ',TEXT_PER_PAGE);
      if(cut<=0)cut=TEXT_PER_PAGE;
      out.push(t.slice(0,cut).trim());t=t.slice(cut).trim();
    }
    if(t)out.push(t);
    return out;
  }
  function chunkPhotos(pics){
    pics=pics.slice(0,MAX_PER_PAGE*MAX_PAGES_PER_DAY);
    if(!pics.length)return [];
    var n=Math.min(MAX_PAGES_PER_DAY,Math.ceil(pics.length/MAX_PER_PAGE));
    var base=Math.floor(pics.length/n),rem=pics.length%n,out=[],i=0;
    for(var p=0;p<n;p++){var s=base+(rem>0?1:0);if(rem>0)rem--;out.push(pics.slice(i,i+s));i+=s;}
    return out;
  }

  function buildPages(book){
    var pages=[],folio=1,tag=0,nPhotos=0,mirror=false;
    var next=function(){return ++folio;};
    // Deckblatt
    var cov=book.cover?original(book.cover):'';
    var stations=(book.stations||[]).filter(Boolean);
    pages.push('<section class="pb-page pb-cover'+(cov?'':' noimg')+'"><div class="pb-trim">'
      +(cov?photo({url:cov},{x:0,y:0,w:W,h:H},'cover','ltrb')+'<div class="pb-veil"></div>':'')
      +'<div class="pb-cover-in">'
      +'<div class="pb-eyebrow">Reisetagebuch</div>'
      +'<h1 class="pb-cover-title">'+esc(book.title||'Unsere Reise')+'</h1>'
      +(book.sub?'<div class="pb-cover-sub">'+esc(book.sub)+'</div>':'')
      +'<div class="pb-rule"></div>'
      +(book.dates?'<div class="pb-cover-dates">'+esc(book.dates)+'</div>':'')
      +(stations.length?'<div class="pb-cover-route">'+stations.map(esc).join('<span>·</span>')+'</div>':'')
      +'</div><div class="pb-cover-brand">travona.de</div></div></section>');

    (book.items||[]).forEach(function(it){
      if(it.type==='hotel'){
        var hasPh=!!it.photo,stars='';
        for(var s=1;s<=5&&it.stars;s++)stars+=s<=it.stars?'★':'☆';
        var col='<div class="pb-hotel-txt'+(hasPh?'':' solo')+'">'
          +'<div class="pb-eyebrow">Unsere Unterkunft</div>'
          +'<h2 class="pb-hotel-name">'+esc(it.name)+'</h2>'
          +(it.ort?'<div class="pb-ort">'+esc(it.ort)+'</div>':'')
          +(stars?'<div class="pb-stars">'+stars+'</div>':'')
          +(it.note?'<div class="pb-quote">„'+esc(it.note)+'“</div>':'')
          +(it.extraHtml?'<div class="pb-extra">'+it.extraHtml+'</div>':'')
          +'</div>';
        pages.push(page('pb-hotel',(hasPh?photo({url:it.photo},{x:0,y:0,w:160,h:H},'cover','ltb'):'')+col,next()));
        if(hasPh)nPhotos++;
        return;
      }
      var text=String(it.text||'').trim(),titel=String(it.titel||'').trim();
      var chunks=chunkPhotos(it.photos||[]);
      if(!text&&!chunks.length)return;
      tag++;
      var eyebrow='Tag '+tag;
      var isLong=text.length>LONG_TEXT;
      if(isLong){
        splitText(text).forEach(function(part,i){
          pages.push(page('pb-textpage',header(eyebrow,it.date,it.ort)
            +'<div class="pb-longtext fit"'+(i===0&&titel?' style="top:44mm"':'')+'>'
            +(i===0&&titel?'<h3 class="pb-title">'+esc(titel)+'</h3>':'')
            +'<div class="pb-cols"><p>'+textHtml(part)+'</p></div></div>',next()));
        });
      }
      chunks.forEach(function(ch,i){
        var first=i===0;
        var showText=first&&!isLong&&(text||titel);
        var top=first?42:30;
        var th=showText?textBoxHeight(titel,text):0;
        var bottom=H-M-(th?th+5:0);
        var fit=ch.length===1?'contain':'cover';
        var rs=rects(ch.length,M,top,W-2*M,bottom-top,mirror);
        mirror=!mirror;
        nPhotos+=ch.length;
        var body=(first?header(eyebrow,it.date,it.ort):slimHeader(it.date,it.ort))
          +ch.map(function(p,k){return photo(p,rs[k],fit);}).join('')
          +(showText?'<div class="pb-textbox fit" style="height:'+mm(th)+'">'+(titel?'<h3 class="pb-title">'+esc(titel)+'</h3>':'')
            +'<div class="pb-txt'+(text.length>180?' two':'')+'"><p>'+textHtml(text)+'</p></div></div>':'');
        pages.push(page('pb-day',body,next()));
      });
      if(!chunks.length&&!isLong){
        pages.push(page('pb-textpage',header(eyebrow,it.date,it.ort)
          +'<div class="pb-longtext fit">'+(titel?'<h3 class="pb-title">'+esc(titel)+'</h3>':'')
          +'<div class="pb-cols one"><p>'+textHtml(text)+'</p></div></div>',next()));
      }
    });

    // Schlussseite: Reise in Zahlen
    var stat=function(n,l){return '<div class="pb-stat"><div class="pb-stat-n">'+n+'</div><div class="pb-stat-l">'+l+'</div></div>';};
    pages.push(page('pb-end','<div class="pb-end-in"><div class="pb-eyebrow">Unsere Reise in Zahlen</div><div class="pb-stats">'
      +stat(tag,tag===1?'Tag':'Tage')+stat(nPhotos,nPhotos===1?'Foto':'Fotos')+(stations.length?stat(stations.length,stations.length===1?'Station':'Stationen'):'')
      +'</div><div class="pb-rule"></div><div class="pb-end-brand">Erstellt mit Travona</div><div class="pb-end-url">travona.de</div></div>',''));
    // Leerseite, damit die Druckdatei eine gerade Seitenzahl hat (nur im Druckdatei-Modus sichtbar)
    if(pages.length%2)pages.splice(pages.length-1,0,'<section class="pb-page pb-pad"><div class="pb-trim"></div></section>');
    return pages.join('');
  }

  var CSS=''
    +':host{all:initial;display:block}'
    +'.pb-root{--b:0mm;--ink:#1A1714;--paper:#F6F1EA;--terra:#B5714A;--muted:#6B6560;--line:#D8D0C4;font-family:"DM Sans",system-ui,-apple-system,sans-serif;color:var(--ink);width:calc(297mm + 2*var(--b));}'
    +'.pb-root.pro{--b:3mm}'
    +'.pb-root *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    +'.pb-page{position:relative;width:calc(297mm + 2*var(--b));height:calc(210mm + 2*var(--b));overflow:hidden;background:var(--paper);break-after:page;page-break-after:always;break-inside:avoid}'
    +'.pb-page:last-child{break-after:auto;page-break-after:auto}'
    +'.pb-root:not(.pro) .pb-pad{display:none}'
    +'.pb-trim{position:absolute;left:var(--b);top:var(--b);width:297mm;height:210mm}'
    // Fotos
    +'.pb-ph{position:absolute;overflow:hidden;background:#E8E0D3}'
    +'.pb-ph img{display:block;width:100%;height:100%;object-fit:cover}'
    +'.pb-ph.has-cap img{height:calc(100% - 6mm)}'
    +'.pb-ph.has-cap{background:transparent}.pb-ph.has-cap img{background:#E8E0D3}'
    +'.pb-ph.contain{background:transparent}.pb-ph.contain img{object-fit:contain}'
    +'.pb-ph figcaption{height:6mm;padding-top:1.6mm;font-size:7.5pt;line-height:1.2;color:var(--muted);font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
        // Kopfzeile
    +'.pb-hd{position:absolute;left:15mm;right:15mm;top:15mm;height:21mm;display:flex;align-items:flex-end;justify-content:space-between;gap:10mm;border-bottom:.3mm solid var(--line);padding-bottom:3mm}'
    +'.pb-hd.slim{height:10mm;padding-bottom:2.5mm}'
    +'.pb-eyebrow{font-size:7.5pt;letter-spacing:.28em;text-transform:uppercase;color:var(--terra);font-weight:500;margin-bottom:1.5mm}'
    +'.pb-date{font-family:"Playfair Display",Georgia,serif;font-size:21pt;line-height:1.1}'
    +'.pb-date-s{font-family:"Playfair Display",Georgia,serif;font-size:11pt}'
    +'.pb-ort{font-size:8pt;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);text-align:right;max-width:130mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    +'.pb-folio{position:absolute;left:0;right:0;bottom:10mm;text-align:center;font-size:7pt;letter-spacing:.1em;color:#9A938A}'
    +'.pb-hotel .pb-folio{left:160mm}'
    // Texte
    +'.pb-title{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-weight:400;font-size:13pt;line-height:1.25;margin-bottom:2mm;color:var(--ink)}'
    +'.pb-textbox{position:absolute;left:15mm;right:15mm;bottom:15mm;overflow:hidden;border-top:.3mm solid var(--terra);padding-top:3mm}'
    +'.pb-txt,.pb-cols{font-size:9.5pt;line-height:1.55;color:#3A352E;text-align:justify;hyphens:auto;-webkit-hyphens:auto}'
    +'.pb-txt.two{column-count:2;column-gap:10mm}'
    +'.pb-longtext{position:absolute;left:15mm;right:15mm;top:44mm;bottom:15mm;overflow:hidden}'
    +'.pb-longtext .pb-title{font-size:17pt;margin-bottom:5mm}'
    +'.pb-cols{column-count:2;column-gap:12mm;font-size:10.5pt;line-height:1.65}'
    +'.pb-cols.one{column-count:1;max-width:170mm}'
    +'.pb-txt p+p,.pb-cols p+p{margin-top:2.5mm}'
    // Deckblatt
    +'.pb-cover{background:#2A2622;color:#fff}'
    +'.pb-cover .pb-ph{background:#2A2622}'
    +'.pb-veil{position:absolute;inset:calc(-1 * var(--b));background:linear-gradient(90deg,rgba(26,23,20,.72) 0%,rgba(26,23,20,.42) 45%,rgba(26,23,20,0) 75%)}'
    +'.pb-cover-in{position:absolute;left:24mm;bottom:28mm;max-width:170mm}'
    +'.pb-cover .pb-eyebrow{color:#E9C9B3}'
    +'.pb-cover-title{font-family:"Playfair Display",Georgia,serif;font-weight:400;font-size:50pt;line-height:1.02;letter-spacing:-.01em}'
    +'.pb-cover-sub{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-size:17pt;margin-top:3mm;opacity:.92}'
    +'.pb-rule{width:28mm;height:.6mm;background:var(--terra);margin:7mm 0}'
    +'.pb-cover-dates{font-size:10.5pt;letter-spacing:.1em;opacity:.92}'
    +'.pb-cover-route{font-size:8.5pt;line-height:1.9;letter-spacing:.06em;opacity:.82;margin-top:3mm}'
    +'.pb-cover-route span{margin:0 2.2mm;color:#E9C9B3}'
    +'.pb-cover-brand{position:absolute;right:15mm;bottom:15mm;font-size:7.5pt;letter-spacing:.3em;text-transform:uppercase;opacity:.85;text-shadow:0 0 3mm rgba(0,0,0,.45)}'
    +'.pb-cover.noimg .pb-cover-brand{text-shadow:none}'
    +'.pb-cover.noimg{background:var(--paper);color:var(--ink)}'
    +'.pb-cover.noimg .pb-eyebrow{color:var(--terra)}.pb-cover.noimg .pb-cover-route span{color:var(--terra)}'
    +'.pb-cover.noimg .pb-cover-in{top:50%;bottom:auto;transform:translateY(-50%)}'
    // Unterkunft
    +'.pb-hotel-txt{position:absolute;left:175mm;right:15mm;top:15mm;bottom:22mm;display:flex;flex-direction:column;justify-content:center}'
    +'.pb-hotel-txt.solo{left:40mm;right:40mm;align-items:center;text-align:center}'
    +'.pb-hotel-txt .pb-ort{text-align:inherit;white-space:normal;margin-top:2.5mm}'
    +'.pb-hotel-name{font-family:"Playfair Display",Georgia,serif;font-weight:400;font-size:24pt;line-height:1.15}'
    +'.pb-stars{color:var(--terra);font-size:13pt;letter-spacing:.2em;margin-top:5mm}'
    +'.pb-quote{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-size:12.5pt;line-height:1.5;color:#3A352E;margin-top:5mm}'
    +'.pb-extra{margin-top:6mm}.pb-extra svg,.pb-extra img{display:block;max-width:100%;max-height:85mm;width:auto;height:auto}'
    // Schlussseite
    +'.pb-end-in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}'
    +'.pb-stats{display:flex;gap:22mm;margin-top:6mm}'
    +'.pb-stat-n{font-family:"Playfair Display",Georgia,serif;font-size:40pt;line-height:1}'
    +'.pb-stat-l{font-size:8pt;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin-top:2.5mm}'
    +'.pb-end-in .pb-rule{margin:12mm auto 8mm}'
    +'.pb-end-brand{font-family:"Playfair Display",Georgia,serif;font-style:italic;font-size:13pt}'
    +'.pb-end-url{font-size:8pt;letter-spacing:.3em;text-transform:uppercase;color:var(--terra);margin-top:2mm}'
    // Bildschirm: Seiten als Blätter, im Druckdatei-Modus Schnittkante andeuten
    +'@media screen{.pb-page{margin:0 auto 14px;box-shadow:0 2px 14px rgba(0,0,0,.25)}'
    +'.pb-root.pro .pb-trim:after{content:"";position:absolute;inset:0;outline:1px dashed rgba(181,113,74,.9);pointer-events:none;z-index:5}}';

  // ── Text einpassen ────────────────────────────────────────────────────────
  function fitTexts(root){
    root.querySelectorAll('.fit').forEach(function(box){
      var t=box.querySelector('.pb-txt,.pb-cols');if(!t)return;
      t.style.fontSize='';t.style.lineHeight='';
      var fs=parseFloat(getComputedStyle(t).fontSize),lh=1.6,guard=0;
      var over=function(){return box.scrollHeight>box.clientHeight+1||t.scrollWidth>t.clientWidth+1;};
      while(over()&&fs>10.5&&guard++<40){fs-=0.5;lh=Math.max(1.35,lh-0.02);t.style.fontSize=fs+'px';t.style.lineHeight=String(lh);}
    });
  }

  // ── Fotos laden ───────────────────────────────────────────────────────────
  function imgs(){return S.root?Array.prototype.slice.call(S.root.querySelectorAll('img[data-src]')):[];}
  function previewPxPerMm(){
    var z=parseFloat(document.getElementById('pb-zwrap').style.zoom)||1;
    return Math.min(8,Math.max(2.5,PX_MM*z*(window.devicePixelRatio||1)));
  }
  function setPreviewSources(){
    var k=previewPxPerMm();
    imgs().forEach(function(im){
      im.src=sized(im.getAttribute('data-src'),+im.getAttribute('data-w'),+im.getAttribute('data-h'),k,im.getAttribute('data-fit'),70);
    });
  }
  // Fehler beim umgewandelten Bild -> Original
  function onImgError(ev){
    var im=ev.target;if(!im||im.tagName!=='IMG')return;
    var o=im.getAttribute('data-src');
    if(o&&im.src!==o){im.src=o;}
  }
  function whenLoaded(im){
    return new Promise(function(res){
      if(im.complete&&im.naturalWidth)return res();
      var done=false,t=setTimeout(fin,45000);
      function fin(){if(done)return;done=true;clearTimeout(t);im.removeEventListener('load',ok);im.removeEventListener('error',bad);res();}
      function ok(){fin();}
      function bad(){var o=im.getAttribute('data-src');if(o&&im.src!==o){im.src=o;}else fin();}
      im.addEventListener('load',ok);im.addEventListener('error',bad);
    });
  }
  async function loadForPrint(mode){
    var k=MODES[mode].dpi/25.4,list=imgs(),done=0;
    S.cancel=false;
    busy('Fotos in Druckqualität laden …',true);
    list.forEach(function(im){
      im.loading='eager';
      var u=sized(im.getAttribute('data-src'),+im.getAttribute('data-w'),+im.getAttribute('data-h'),k,im.getAttribute('data-fit'),mode==='pro'?90:85);
      if(im.src!==u)im.src=u;
    });
    progress('0 von '+list.length+' Fotos');
    var stop=new Promise(function(res){S.onCancel=res;});
    await Promise.race([stop,Promise.all(list.map(function(im){return whenLoaded(im).then(function(){done++;progress(done+' von '+list.length+' Fotos');});}))]);
    S.onCancel=null;
    if(S.cancel)return false;
    try{if(document.fonts&&document.fonts.ready)await document.fonts.ready;}catch(e){}
    fitTexts(S.root);
    unbusy();
    return !S.cancel;
  }

  // ── Lade-Hinweis ──────────────────────────────────────────────────────────
  function busy(text,cancellable){
    var ov=document.getElementById('pb-loading-overlay');
    if(!ov){
      ov=document.createElement('div');ov.id='pb-loading-overlay';
      ov.style.cssText='position:fixed;inset:0;z-index:10001;background:rgba(26,23,20,.72);backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:"DM Sans",sans-serif;text-align:center;padding:24px';
      document.body.appendChild(ov);
    }
    if(!document.getElementById('pbspin-style')){var st=document.createElement('style');st.id='pbspin-style';st.textContent='@keyframes pbspin{to{transform:rotate(360deg)}}';document.head.appendChild(st);}
    ov.innerHTML='<div style="width:40px;height:40px;border:3px solid rgba(255,255,255,.25);border-top-color:#B5714A;border-radius:50%;animation:pbspin .8s linear infinite;margin-bottom:18px"></div>'
      +'<div style="font-family:\'Playfair Display\',serif;font-size:21px;margin-bottom:6px">'+esc(text)+'</div><div id="pb-progress" style="font-size:13px;opacity:.85"></div>';
    if(cancellable){
      var c=document.createElement('button');c.type='button';c.textContent='Abbrechen';
      c.style.cssText='margin-top:18px;padding:10px 20px;border-radius:999px;border:1px solid rgba(255,255,255,.5);background:transparent;color:#fff;font-size:13px;cursor:pointer';
      c.onclick=function(){S.cancel=true;unbusy();if(S.onCancel)S.onCancel();};ov.appendChild(c);
    }
  }
  function progress(t){var p=document.getElementById('pb-progress');if(p)p.textContent=t;}
  function unbusy(){var ov=document.getElementById('pb-loading-overlay');if(ov)ov.remove();}

  // ── Ansicht ───────────────────────────────────────────────────────────────
  function ensureFonts(){
    if(document.querySelector('link[data-pb-fonts]'))return;
    var l=document.createElement('link');l.rel='stylesheet';l.href=FONTS;l.setAttribute('data-pb-fonts','1');document.head.appendChild(l);
  }
  function printStyle(mode){
    var b=MODES[mode].bleed;
    var s=document.getElementById('pb-print-style');
    if(!s){s=document.createElement('style');s.id='pb-print-style';document.head.appendChild(s);}
    s.textContent='@page{size:'+(W+2*b)+'mm '+(H+2*b)+'mm;margin:0}'
      +'@media print{html,body{background:#fff !important;height:auto !important;overflow:visible !important;margin:0 !important;padding:0 !important}'
      +'body>*:not(#pb-viewer){display:none !important}'
      +'#pb-viewer{position:static !important;display:block !important;background:#fff !important;height:auto !important;overflow:visible !important}'
      +'#pb-viewer .pb-bar{display:none !important}#pb-scroll{overflow:visible !important;height:auto !important;padding:0 !important}#pb-zwrap{zoom:1 !important;width:auto !important;margin:0 !important}}';
  }
  function setMode(mode){
    S.mode=mode;
    var r=S.root&&S.root.querySelector('.pb-root');
    if(r)r.classList.toggle('pro',mode==='pro');
    printStyle(mode);
    fitZoom();
  }
  function fitZoom(){
    var sc=document.getElementById('pb-scroll'),zw=document.getElementById('pb-zwrap');
    if(!sc||!zw)return;
    var pw=(W+2*MODES[S.mode].bleed)*PX_MM;
    zw.style.width=pw+'px';
    zw.style.zoom=String(Math.min(1,(sc.clientWidth-16)/pw));
  }
  function removeViewer(){
    var v=document.getElementById('pb-viewer');if(v)v.remove();
    var s=document.getElementById('pb-print-style');if(s)s.remove();
    window.removeEventListener('popstate',close);
    window.removeEventListener('resize',fitZoom);
    document.documentElement.style.overflow='';
    S.root=null;
  }
  function close(){removeViewer();}
  function backOrClose(){if(history.state&&history.state.pb)history.back();else close();}

  async function doPrint(mode){
    if(mode==='pro')toast('Druckdatei: Im Druckdialog „Als PDF speichern“, Ränder „Keine“, Skalierung 100 % wählen.');
    else toast('Im Druckdialog „Als PDF speichern“ oder einen Drucker wählen.');
    setMode(mode);
    var ok=await loadForPrint(mode);
    if(!ok){toast('Abgebrochen.');return;}
    setTimeout(function(){try{window.print();}catch(e){toast('Drucken war hier nicht möglich. Nutze „Neuer Tab“.');}},300);
  }
  // Eigenständiges Dokument (für „Neuer Tab“), Fotos in Druckqualität A4
  function standalone(){
    var r=S.root.querySelector('.pb-root').cloneNode(true),k=MODES[S.mode].dpi/25.4;
    r.querySelectorAll('img[data-src]').forEach(function(im){
      im.removeAttribute('loading');
      im.setAttribute('src',sized(im.getAttribute('data-src'),+im.getAttribute('data-w'),+im.getAttribute('data-h'),k,im.getAttribute('data-fit'),85));
      im.setAttribute('onerror',"this.onerror=null;this.src=this.getAttribute('data-src')");
    });
    var b=MODES[S.mode].bleed;
    return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(S.book.title||'Fotobuch')+' – Fotobuch</title>'
      +'<link rel="stylesheet" href="'+FONTS+'"><style>'+CSS.replace(':host{all:initial;display:block}','body{margin:0;background:#cfc9c0}')
      +'@page{size:'+(W+2*b)+'mm '+(H+2*b)+'mm;margin:0}@media print{body{background:#fff}}</style></head><body>'+r.outerHTML+'</body></html>';
  }

  async function open(book){
    S.book=book;
    try{
      ensureFonts();
      removeViewer();
      var v=document.createElement('div');v.id='pb-viewer';
      v.style.cssText='position:fixed;inset:0;z-index:10000;background:#CFC9C0;display:flex;flex-direction:column;font-family:"DM Sans",sans-serif;';
      var bar=document.createElement('div');bar.className='pb-bar';
      bar.style.cssText='flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:max(10px,env(safe-area-inset-top)) 12px 10px;background:#F4EFE8;border-bottom:1px solid #D8D0C4;';
      var btn=function(label,title,fn,solid){
        var b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.onclick=fn;
        b.style.cssText='min-height:40px;padding:0 14px;border-radius:999px;font-size:14px;font-weight:500;cursor:pointer;font-family:inherit;border:1px solid '+(solid?'#1A1714':'#D8D0C4')+';background:'+(solid?'#1A1714':'transparent')+';color:'+(solid?'#F4EFE8':'#1A1714')+';white-space:nowrap;';
        return b;
      };
      var ttl=document.createElement('div');
      ttl.textContent=(book.title||'Fotobuch')+' – Fotobuch';
      ttl.style.cssText='flex:1 1 120px;min-width:0;font-size:13px;color:#6B6560;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      bar.appendChild(btn('← Schließen','Fotobuch schließen',backOrClose,false));
      bar.appendChild(ttl);
      bar.appendChild(btn('Drucken / PDF','A4 quer – zum Ausdrucken oder als PDF speichern',function(){doPrint('home');},true));
      bar.appendChild(btn('Druckdatei','Für Fotobuch-Anbieter: 3 mm Beschnitt, 300 dpi, gerade Seitenzahl',function(){doPrint('pro');},false));
      bar.appendChild(btn('Neuer Tab','Fotobuch in einem neuen Tab öffnen',function(){
        var u=URL.createObjectURL(new Blob([standalone()],{type:'text/html'}));
        window.open(u,'_blank');setTimeout(function(){URL.revokeObjectURL(u);},60000);
      },false));
      var sc=document.createElement('div');sc.id='pb-scroll';
      sc.style.cssText='flex:1 1 auto;overflow:auto;-webkit-overflow-scrolling:touch;padding:14px 8px;';
      var zw=document.createElement('div');zw.id='pb-zwrap';zw.style.margin='0 auto';
      var host=document.createElement('div');
      zw.appendChild(host);sc.appendChild(zw);v.appendChild(bar);v.appendChild(sc);
      document.body.appendChild(v);
      document.documentElement.style.overflow='hidden';
      S.host=host;S.root=host.attachShadow({mode:'open'});
      S.root.addEventListener('error',onImgError,true);
      S.root.innerHTML='<style>'+CSS+'</style><div class="pb-root">'+buildPages(book)+'</div>';
      setMode('home');
      setPreviewSources();
      window.addEventListener('resize',fitZoom);
      fitTexts(S.root);
      try{if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){if(S.root)fitTexts(S.root);});}catch(e){}
      try{history.pushState({pb:1},'');}catch(e){}
      window.addEventListener('popstate',close);
      unbusy();
    }catch(e){
      console.error('Fotobuch:',e);unbusy();removeViewer();
      toast('Das Fotobuch konnte nicht geöffnet werden.');
      throw e;
    }
  }

  // kleine Hilfe: Aufgaben mit begrenzter Parallelität abarbeiten
  async function pool(list,n,fn){
    var i=0;
    async function w(){while(i<list.length){var x=list[i++];await fn(x);}}
    var ws=[];for(var k=0;k<Math.min(n,list.length);k++)ws.push(w());
    await Promise.all(ws);
  }

  window.TvFotobuch={open:open,busy:function(t){busy(t,false);},unbusy:unbusy,pool:pool,original:original,
    _build:buildPages,_sized:sized};
})();
