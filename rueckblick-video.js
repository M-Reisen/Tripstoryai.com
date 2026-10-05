// Travona – Reise-Rückblick als Video: rund 30 Sekunden im Story-Format (9:16) für Instagram, TikTok und WhatsApp.
// Wird komplett im Browser erzeugt (Canvas + MediaRecorder), ohne Server und ohne Zusatzkosten.
// Liest nur die Reisedaten, die reisevorlage.html bzw. australien.html schon geladen haben
// (tripHead, photos, coordForDay, ortFuerTag …), genau wie reise-in-zahlen.js.
(function(){
  var W=1080,H=1920,FPS=30;
  var OUT_W=720,OUT_H=1280;              // Aufnahmegröße: läuft auch auf älteren Handys flüssig
  var MAX_FOTOS=12;
  var C={bg:'#F4EFE8',ink:'#1A1714',fog:'#6B6560',terra:'#B5714A',rule:'#D8D0C4',teal:'#2C5F6A',white:'#FFFFFF'};
  var _url=null,_blob=null,_showCosts=false,_run=0;

  /* ---------- Reisedaten ---------- */
  function dayList(){
    var d=typeof lyDays==='function'?lyDays():(typeof buildDays==='function'?buildDays():[]);
    return (d||[]).map(function(x){return typeof x==='string'?x:x&&x.iso;}).filter(Boolean);
  }
  function ph(){return typeof photos!=='undefined'?photos:{};}
  function ortOf(iso){try{return typeof ortFuerTag==='function'?(ortFuerTag(iso)||''):'';}catch(e){return '';}}
  function titelOf(iso){
    try{
      if(typeof entries==='undefined'||!entries)return '';
      var e=Array.isArray(entries)?entries.find(function(x){return x&&x.datum===iso;}):entries[iso];
      return e&&e.titel?String(e.titel):'';
    }catch(e){return '';}
  }
  function timeout(ms,v){return new Promise(function(r){setTimeout(function(){r(v);},ms);});}
  function thumb(u,w){try{return window.tvThumb?window.tvThumb(u,w):u;}catch(e){return u;}}
  function dmy(iso){if(!iso)return '';var p=iso.split('-');return p[2]+'.'+p[1]+'.'+p[0];}
  function dLong(iso){try{return new Date(iso+'T12:00:00').toLocaleDateString('de-DE',{day:'numeric',month:'long'});}catch(e){return dmy(iso);}}
  function num(n){return Math.round(n).toLocaleString('de-DE');}

  // Fotolisten aller Tage laden (in der gespeicherten Reihenfolge der Seite)
  async function loadPhotos(days){
    var P=ph(),todo=days.filter(function(iso){return !Array.isArray(P[iso]);});
    if(typeof sbLoadPhotos!=='function')return;
    var order=typeof orderedPhotos==='function'?orderedPhotos:(typeof loadPhotoOrder==='function'?loadPhotoOrder:null);
    for(var i=0;i<todo.length;i+=6){
      await Promise.all(todo.slice(i,i+6).map(async function(iso){
        try{var l=await sbLoadPhotos(iso);P[iso]=order?order(iso,l):l;}catch(e){P[iso]=[];}
      }));
    }
  }

  // Bis zu 12 Fotos, gleichmäßig über die Reise verteilt (erst ein Foto pro Tag, dann weitere)
  function pickPhotos(days){
    var P=ph(),withPics=days.filter(function(iso){return Array.isArray(P[iso])&&P[iso].length;});
    var picks=[];
    if(withPics.length>=MAX_FOTOS){
      for(var i=0;i<MAX_FOTOS;i++){
        var iso=withPics[Math.round(i*(withPics.length-1)/(MAX_FOTOS-1))];
        picks.push({iso:iso,k:0});
      }
    }else{
      for(var r=0;picks.length<MAX_FOTOS;r++){
        var added=false;
        withPics.forEach(function(iso){if(picks.length<MAX_FOTOS&&P[iso][r]){picks.push({iso:iso,k:r});added=true;}});
        if(!added)break;
      }
    }
    picks.sort(function(a,b){return a.iso<b.iso?-1:a.iso>b.iso?1:a.k-b.k;});
    return picks.map(function(p){return {iso:p.iso,url:P[p.iso][p.k],tag:days.indexOf(p.iso)+1,ort:ortOf(p.iso),titel:titelOf(p.iso)};});
  }

  // Route: ein Punkt pro Ortswechsel, chronologisch
  async function route(days){
    if(typeof coordForDay!=='function')return [];
    var pts=[];
    for(var i=0;i<days.length;i++){
      var pt=null;
      try{pt=await Promise.race([coordForDay(days[i]),timeout(4000,null)]);}catch(e){}
      if(!pt)continue;
      var lon=pt.lon!=null?pt.lon:pt.lng,last=pts[pts.length-1];
      if(last&&Math.abs(last.lat-pt.lat)<0.01&&Math.abs(last.lon-lon)<0.01)continue;
      pts.push({lat:+pt.lat,lon:+lon,name:ortOf(days[i])});
    }
    return pts;
  }

  function coverSrc(){
    if(window.__tripImg)return window.__tripImg;
    try{if(window.tvCoverURL){var u=window.tvCoverURL();if(u)return u;}}catch(e){}
    var h=document.getElementById('hero-bg-img');
    if(h&&/supabase\.co\/|\/titelbilder\//.test(h.src))return h.src;
    if(typeof HERO_IMG_URL!=='undefined')return HERO_IMG_URL;
    return null;
  }
  function loadImg(src){
    return new Promise(function(res){
      if(!src)return res(null);
      var im=new Image();im.crossOrigin='anonymous';   // ohne CORS-Freigabe ließe sich das Video nicht aufnehmen
      var t=setTimeout(function(){res(null);},15000);
      im.onload=function(){clearTimeout(t);res(im.naturalWidth?im:null);};
      im.onerror=function(){clearTimeout(t);res(null);};
      im.src=src;
    });
  }
  async function loadPic(u){return (await loadImg(thumb(u,1080)))||(await loadImg(u));}

  async function collect(status){
    var days=dayList();
    var head=typeof tripHead!=='undefined'?tripHead:{};
    status('Fotos werden geladen …');
    await loadPhotos(days);
    var picks=pickPhotos(days);
    status('Route wird berechnet …');
    var pts=await Promise.race([route(days),timeout(15000,[])]);
    var stats=null;
    try{if(window.travonaReiseInZahlen&&window.travonaReiseInZahlen.daten)stats=await window.travonaReiseInZahlen.daten();}catch(e){}
    status('Bilder werden vorbereitet …');
    var imgs=[],cover=null;
    for(var i=0;i<picks.length;i+=4){
      var part=await Promise.all(picks.slice(i,i+4).map(function(p){return loadPic(p.url);}));
      part.forEach(function(im,k){if(im){picks[i+k].img=im;imgs.push(picks[i+k]);}});
    }
    cover=await loadImg(coverSrc());
    if(!cover&&imgs.length)cover=imgs[0].img;
    return {
      title:head.title||'Unsere Reise',emoji:head.emoji&&head.emoji!=='🌍'?head.emoji:'',
      from:head.from||days[0]||'',to:head.to||days[days.length-1]||'',
      days:days.length,pts:pts,fotos:imgs,cover:cover,stats:stats
    };
  }

  /* ---------- Zeichnen ---------- */
  function clamp(v,a,b){return v<a?a:v>b?b:v;}
  function ease(t){t=clamp(t,0,1);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
  function easeOut(t){t=clamp(t,0,1);return 1-Math.pow(1-t,3);}
  function setLS(x,v){if('letterSpacing' in x)x.letterSpacing=v;}

  function coverDraw(x,img,zoom,fx,fy){
    var s=Math.max(W/img.naturalWidth,H/img.naturalHeight)*zoom,iw=img.naturalWidth*s,ih=img.naturalHeight*s;
    x.drawImage(img,(W-iw)/2+fx*(iw-W)/2,(H-ih)/2+fy*(ih-H)/2,iw,ih);
  }
  function wrap(x,text,maxW,maxLines){
    var words=String(text).split(/\s+/),lines=[],cur='';
    words.forEach(function(w){var t=cur?cur+' '+w:w;if(x.measureText(t).width>maxW&&cur){lines.push(cur);cur=w;}else cur=t;});
    if(cur)lines.push(cur);
    if(lines.length>maxLines){lines=lines.slice(0,maxLines);var l=lines[maxLines-1];while(l&&x.measureText(l+' …').width>maxW)l=l.slice(0,-1);lines[maxLines-1]=l.trim()+' …';}
    return lines;
  }
  function shade(x,from,alpha){
    var g=x.createLinearGradient(0,from,0,H);g.addColorStop(0,'rgba(26,23,20,0)');g.addColorStop(1,'rgba(26,23,20,'+alpha+')');
    x.fillStyle=g;x.fillRect(0,from,W,H-from);
  }
  function rise(x,t,delay,fn){                       // Text weich von unten einblenden
    var p=easeOut((t-delay)/0.7);if(p<=0)return;
    x.save();x.globalAlpha*=p;x.translate(0,(1-p)*40);fn();x.restore();
  }
  function mark(x,light){                            // kleines Wasserzeichen
    x.save();x.globalAlpha*=0.9;x.textAlign='right';x.fillStyle=light?'rgba(255,255,255,.85)':C.terra;
    x.font='500 34px "DM Sans", sans-serif';x.fillText('travona.de',W-70,120);x.restore();
  }

  function dateRange(d){return d.to&&d.to!==d.from?dmy(d.from)+' – '+dmy(d.to):dmy(d.from);}

  function drawIntro(x,t,dur,d){
    x.fillStyle=C.ink;x.fillRect(0,0,W,H);
    var L=90;
    if(d.cover){coverDraw(x,d.cover,1.04+0.1*(t/dur),0,-0.2);shade(x,H*0.35,0.85);}
    else{x.fillStyle=C.bg;x.fillRect(0,0,W,H);}
    var light=!!d.cover;
    x.textAlign='left';x.textBaseline='alphabetic';
    x.font='400 104px "Playfair Display", serif';
    var lines=wrap(x,(d.emoji?d.emoji+' ':'')+d.title,W-2*L,3),y=H-300-(lines.length-1)*116;
    rise(x,t,0.2,function(){
      x.fillStyle=light?'#F0C9A8':C.terra;x.font='500 32px "DM Sans", sans-serif';setLS(x,'6px');
      x.fillText('UNSER REISE-RÜCKBLICK',L,y-150);setLS(x,'0px');
    });
    rise(x,t,0.45,function(){
      x.fillStyle=light?C.white:C.ink;x.font='400 104px "Playfair Display", serif';
      lines.forEach(function(l,i){x.fillText(l,L,y+i*116);});
    });
    if(d.from)rise(x,t,0.8,function(){
      x.fillStyle=light?'rgba(255,255,255,.85)':C.fog;x.font='400 40px "DM Sans", sans-serif';
      x.fillText(dateRange(d)+(d.days>1?'  ·  '+d.days+' Tage':''),L,y+lines.length*116+10);
    });
  }

  function projector(pts){
    var la0=pts.reduce(function(s,p){return s+p.lat;},0)/pts.length,k=Math.cos(la0*Math.PI/180);
    var xs=pts.map(function(p){return p.lon*k;}),ys=pts.map(function(p){return -p.lat;});
    var minX=Math.min.apply(null,xs),maxX=Math.max.apply(null,xs),minY=Math.min.apply(null,ys),maxY=Math.max.apply(null,ys);
    var bx=170,by=420,bw=W-340,bh=1060,s=Math.min(bw/((maxX-minX)||1e-6),bh/((maxY-minY)||1e-6));
    if(!isFinite(s)||s>bw*40)s=bw*40;
    var ox=bx+(bw-(maxX-minX)*s)/2,oy=by+(bh-(maxY-minY)*s)/2;
    return pts.map(function(p,i){return {x:ox+(xs[i]-minX)*s,y:oy+(ys[i]-minY)*s,name:p.name};});
  }
  function drawMap(x,t,dur,d){
    x.fillStyle=C.bg;x.fillRect(0,0,W,H);
    // feines Punktraster als Kartengrund
    x.fillStyle='rgba(181,113,74,.13)';
    for(var gy=380;gy<1560;gy+=48)for(var gx=60;gx<W-40;gx+=48){x.beginPath();x.arc(gx,gy,2.4,0,6.283);x.fill();}
    var L=90;x.textAlign='left';
    rise(x,t,0.1,function(){
      x.fillStyle=C.terra;x.font='500 32px "DM Sans", sans-serif';setLS(x,'6px');x.fillText('UNSERE ROUTE',L,210);setLS(x,'0px');
      x.fillStyle=C.ink;x.font='400 80px "Playfair Display", serif';x.fillText(wrap(x,d.title,W-2*L,1)[0],L,310);
    });
    var P=d._proj||(d._proj=projector(d.pts)),seg=[],tot=0;
    for(var i=1;i<P.length;i++){var l=Math.hypot(P[i].x-P[i-1].x,P[i].y-P[i-1].y);seg.push(l);tot+=l;}
    var prog=ease((t-0.6)/Math.max(1,dur-1.8)),want=prog*tot;
    // ganze Route blass, gefahrener Teil in Terrakotta
    x.lineCap='round';x.lineJoin='round';
    x.strokeStyle='#C2B6A6';x.lineWidth=7;x.setLineDash([1,20]);
    x.beginPath();P.forEach(function(p,i){i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y);});x.stroke();x.setLineDash([]);
    x.strokeStyle=C.terra;x.lineWidth=14;x.beginPath();x.moveTo(P[0].x,P[0].y);
    var acc=0,head={x:P[0].x,y:P[0].y},reached=0;
    for(i=1;i<P.length;i++){
      if(acc+seg[i-1]<=want){x.lineTo(P[i].x,P[i].y);acc+=seg[i-1];reached=i;head=P[i];}
      else{var f=seg[i-1]?(want-acc)/seg[i-1]:0;head={x:P[i-1].x+(P[i].x-P[i-1].x)*f,y:P[i-1].y+(P[i].y-P[i-1].y)*f};x.lineTo(head.x,head.y);break;}
    }
    if(prog>0)x.stroke();
    // Stationen mit Namen (Namen nur, wenn genug Platz zum vorigen Namen ist)
    var labeled=[];
    P.forEach(function(p,i){
      var on=i<=reached&&prog>0;
      x.beginPath();x.arc(p.x,p.y,on?18:12,0,6.283);x.fillStyle=on?C.teal:C.white;x.fill();
      x.lineWidth=5;x.strokeStyle=on?C.bg:'#C2B6A6';x.stroke();
      if(!on||!p.name)return;
      if(labeled.some(function(q){return Math.abs(q.x-p.x)<260&&Math.abs(q.y-p.y)<60;}))return;
      labeled.push(p);
      x.font='500 42px "DM Sans", sans-serif';
      var right=p.x<W*0.62,tw=x.measureText(p.name).width,tx=right?p.x+40:p.x-40-tw;
      tx=clamp(tx,30,W-30-tw);
      x.fillStyle='rgba(244,239,232,.85)';x.fillRect(tx-10,p.y-34,tw+20,52);
      x.fillStyle=C.ink;x.textAlign='left';x.fillText(p.name,tx,p.y+4);
    });
    if(prog>0&&prog<1){x.beginPath();x.arc(head.x,head.y,24,0,6.283);x.fillStyle=C.terra;x.fill();x.lineWidth=7;x.strokeStyle=C.white;x.stroke();}
    // Zähler unten
    var km=d.stats&&d.stats.km?d.stats.km:0;
    rise(x,t,0.4,function(){
      x.textAlign='left';x.fillStyle=C.ink;x.font='400 120px "Playfair Display", serif';
      var big=km?num(km*prog)+' km':String(Math.max(1,Math.round(P.length*prog)))+' Orte';
      x.fillText(big,L,1720);
      x.fillStyle=C.fog;x.font='400 38px "DM Sans", sans-serif';
      x.fillText(km?P.length+' Stationen · Luftlinie':'unterwegs',L,1785);
    });
  }

  function drawPhoto(x,t,dur,d,i){
    var p=d.fotos[i],dir=i%2?1:-1;
    x.fillStyle=C.ink;x.fillRect(0,0,W,H);
    coverDraw(x,p.img,1.06+0.08*(i%2?1-t/dur:t/dur),dir*0.5*(t/dur-0.5),0);
    shade(x,H*0.55,0.8);
    mark(x,true);
    var L=90;x.textAlign='left';
    var tt=i===0?t:t+0.3;                            // ab dem zweiten Foto steht der Text schneller
    rise(x,tt,0.2,function(){
      x.fillStyle='#F0C9A8';x.font='500 32px "DM Sans", sans-serif';setLS(x,'5px');
      x.fillText(('TAG '+p.tag+'  ·  '+dLong(p.iso)).toUpperCase(),L,H-260);setLS(x,'0px');
    });
    rise(x,tt,0.35,function(){
      x.fillStyle=C.white;x.font='400 84px "Playfair Display", serif';
      x.fillText(wrap(x,p.ort||p.titel||d.title,W-2*L,1)[0],L,H-165);
      if(p.ort&&p.titel){x.fillStyle='rgba(255,255,255,.85)';x.font='italic 400 42px "Playfair Display", serif';x.fillText(wrap(x,p.titel,W-2*L,1)[0],L,H-100);}
    });
  }

  function statList(d){
    var s=d.stats||{},out=[];
    var days=s.days||d.days;
    if(days)out.push([days,days===1?'Tag':'Tage','']);
    if(s.orte>1)out.push([s.orte,'Orte','']);
    if(s.km)out.push([s.km,'Kilometer','']);
    if(s.fotos)out.push([s.fotos,s.fotos===1?'Foto':'Fotos','']);
    if(_showCosts&&s.total>0)out.push([s.total,'ausgegeben',' €']);
    if(_showCosts&&s.total>0&&days>1)out.push([s.total/days,'pro Tag',' €']);
    else if(s.belege&&out.length<6)out.push([s.belege,s.belege===1?'Beleg':'Belege','']);
    return out.slice(0,6);
  }
  function drawStats(x,t,dur,d){
    x.fillStyle=C.bg;x.fillRect(0,0,W,H);
    var L=90;x.textAlign='left';
    rise(x,t,0.1,function(){
      x.fillStyle=C.terra;x.font='500 32px "DM Sans", sans-serif';setLS(x,'6px');x.fillText('UNSERE REISE IN ZAHLEN',L,330);setLS(x,'0px');
      x.fillStyle=C.ink;x.font='400 92px "Playfair Display", serif';
      wrap(x,(d.emoji?d.emoji+' ':'')+d.title,W-2*L,2).forEach(function(l,i){x.fillText(l,L,450+i*104);});
    });
    var st=statList(d),cw=(W-2*L)/2,gy=760,cell=280;
    st.forEach(function(s,i){
      var cx=L+(i%2)*cw,cy=gy+Math.floor(i/2)*cell,dl=0.5+i*0.25,p=easeOut((t-dl)/1.6);
      if(t<dl)return;
      x.save();x.globalAlpha*=clamp((t-dl)/0.4,0,1);
      x.strokeStyle=C.rule;x.lineWidth=2;x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+(cw-(i%2?0:40))*easeOut((t-dl)/0.6),cy);x.stroke();
      x.fillStyle=i%3===0?C.terra:C.ink;
      var txt=num(s[0]*p)+s[2],fs=120;x.font='400 '+fs+'px "Playfair Display", serif';
      var full=num(s[0])+s[2];while(x.measureText(full).width>cw-50&&fs>48){fs-=6;x.font='400 '+fs+'px "Playfair Display", serif';}
      x.fillText(txt,cx,cy+fs+24);
      x.fillStyle=C.fog;x.font='400 38px "DM Sans", sans-serif';x.fillText(s[1],cx,cy+fs+86);
      x.restore();
    });
  }

  function drawOutro(x,t,dur,d){
    x.fillStyle=C.ink;x.fillRect(0,0,W,H);
    x.textAlign='center';
    rise(x,t,0.15,function(){x.fillStyle=C.bg;x.font='italic 400 70px "Playfair Display", serif';x.fillText('Belege rein,',W/2,H/2-90);x.fillText('Reisebericht raus.',W/2,H/2);});
    rise(x,t,0.6,function(){x.fillStyle=C.terra;x.font='500 64px "DM Sans", sans-serif';x.fillText('travona.de',W/2,H/2+170);});
    rise(x,t,0.9,function(){x.fillStyle='rgba(244,239,232,.7)';x.font='400 36px "DM Sans", sans-serif';x.fillText('Dein Reisetagebuch mit KI',W/2,H/2+240);});
    x.textAlign='left';
  }

  // Ablauf: Titel → Route → Fotos → Zahlen → Abspann (zusammen rund 30 Sekunden)
  function timeline(d){
    var segs=[{dur:3.2,fn:drawIntro}];
    if(d.pts.length>=2)segs.push({dur:d.fotos.length?6:8,fn:drawMap});
    var n=d.fotos.length;
    if(n){var pd=clamp(15/n,1.3,2.6);d.fotos.forEach(function(_,i){segs.push({dur:pd,fn:function(x,t,dur,dd){drawPhoto(x,t,dur,dd,i);}});});}
    segs.push({dur:n?4.6:6.5,fn:drawStats});
    segs.push({dur:3.2,fn:drawOutro});
    var at=0;segs.forEach(function(s){s.at=at;at+=s.dur;});
    return {segs:segs,total:at};
  }
  var FADE=0.4;
  function frame(x,tl,d,t){
    var segs=tl.segs,k=segs.length-1;
    while(k>0&&t<segs[k].at)k--;
    var s=segs[k],lt=t-s.at;
    if(k>0&&lt<FADE){                               // weicher Übergang vom vorigen Abschnitt
      var pr=segs[k-1];pr.fn(x,pr.dur,pr.dur,d);
      x.save();x.globalAlpha=lt/FADE;s.fn(x,lt,s.dur,d);x.restore();
    }else s.fn(x,lt,s.dur,d);
  }

  /* ---------- Aufnahme ---------- */
  function pickMime(){
    if(typeof MediaRecorder==='undefined'||!MediaRecorder.isTypeSupported)return null;
    var c=['video/mp4;codecs=avc1.42E01E','video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
    for(var i=0;i<c.length;i++){try{if(MediaRecorder.isTypeSupported(c[i]))return c[i];}catch(e){}}
    return null;
  }
  function canRecord(cv){return !!(cv.captureStream&&pickMime());}

  function play(cv,tl,d,onProgress,record){
    var x=cv.getContext('2d');x.setTransform(cv.width/W,0,0,cv.height/H,0,0);
    var run=++_run;
    return new Promise(function(resolve,reject){
      var rec=null,chunks=[],mime=null,hidden=false;
      if(record){
        mime=pickMime();
        try{
          var stream=cv.captureStream(FPS);
          rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});
          rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data);};
          rec.onstop=function(){
            stream.getTracks().forEach(function(tr){tr.stop();});
            if(hidden||run!==_run)return reject(new Error(hidden?'hidden':'abort'));
            var type=(rec.mimeType||mime).split(';')[0];
            resolve(chunks.length?new Blob(chunks,{type:type}):null);
          };
          frame(x,tl,d,0);
          rec.start(1000);
        }catch(e){return reject(e);}
      }
      function onVis(){if(document.hidden){hidden=true;finish();}}
      document.addEventListener('visibilitychange',onVis);
      var t0=performance.now(),done=false;
      function finish(){
        if(done)return;done=true;
        document.removeEventListener('visibilitychange',onVis);
        if(rec){setTimeout(function(){try{rec.stop();}catch(e){reject(e);}},250);}
        else resolve(null);
      }
      function tick(now){
        if(done)return;
        if(run!==_run){finish();return;}
        var t=(now-t0)/1000;
        if(t>=tl.total){frame(x,tl,d,tl.total-0.001);onProgress(1);finish();return;}
        frame(x,tl,d,t);onProgress(t/tl.total);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  /* ---------- Dialog ---------- */
  function css(){
    if(document.getElementById('rbv-css'))return;
    var s=document.createElement('style');s.id='rbv-css';
    s.textContent='#rbv-ov{position:fixed;inset:0;z-index:10000;background:rgba(26,23,20,.78);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"DM Sans",sans-serif}'
      +'#rbv-ov .rbv-box{background:#F4EFE8;border-radius:10px;max-width:420px;width:100%;max-height:100%;overflow:auto;padding:18px;text-align:center}'
      +'#rbv-ov h3{font-family:"Playfair Display",serif;font-weight:400;font-size:24px;margin:0 0 4px;color:#1A1714}'
      +'#rbv-ov p{font-size:13px;color:#6B6560;margin:0 0 12px;line-height:1.5}'
      +'#rbv-ov .rbv-stage{position:relative;width:100%;max-width:calc(56vh * 9 / 16);aspect-ratio:9/16;margin:0 auto 10px;border-radius:8px;overflow:hidden;background:#1A1714}'
      +'#rbv-ov canvas,#rbv-ov video{display:block;width:100%;height:100%;object-fit:contain;background:#1A1714}'
      +'#rbv-ov .rbv-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:20px;color:#F4EFE8;font-size:14px;line-height:1.5}'
      +'#rbv-ov .rbv-bar{height:4px;background:#D8D0C4;border-radius:2px;overflow:hidden;margin:0 0 10px}'
      +'#rbv-ov .rbv-bar i{display:block;height:100%;width:0;background:#B5714A}'
      +'#rbv-ov label{display:flex;gap:8px;align-items:center;justify-content:center;font-size:14px;color:#1A1714;margin-bottom:8px;cursor:pointer}'
      +'#rbv-ov .rbv-btn{display:block;width:100%;padding:13px;border-radius:6px;border:0;font:500 14px "DM Sans",sans-serif;cursor:pointer;margin-top:8px;background:#B5714A;color:#fff;text-decoration:none}'
      +'#rbv-ov .rbv-btn.alt{background:transparent;color:#1A1714;border:1px solid #D8D0C4}'
      +'#rbv-ov .rbv-btn[hidden]{display:none}#rbv-ov .rbv-btn[disabled]{opacity:.5}';
    document.head.appendChild(s);
  }
  function $(id){return document.getElementById(id);}
  function close(){_run++;var o=$('rbv-ov');if(o)o.remove();if(_url){URL.revokeObjectURL(_url);_url=null;}_blob=null;}
  function fileName(d,type){
    var ext=/mp4/.test(type)?'mp4':'webm';
    return 'travona-rueckblick-'+String(d.title).toLowerCase().replace(/[^a-z0-9äöüß]+/g,'-').replace(/^-|-$/g,'')+'.'+ext;
  }
  function show(id,on){var e=$(id);if(e)e.hidden=!on;}

  async function open(){
    css();close();
    var ov=document.createElement('div');ov.id='rbv-ov';
    ov.innerHTML='<div class="rbv-box" role="dialog" aria-modal="true" aria-label="Reise-Rückblick als Video">'
      +'<h3>Reise-Rückblick als Video</h3><p id="rbv-sub">Route, Fotos und Zahlen als 30-Sekunden-Video im Story-Format.</p>'
      +'<div class="rbv-stage" id="rbv-stage"><canvas id="rbv-cv" width="'+OUT_W+'" height="'+OUT_H+'"></canvas><div class="rbv-msg" id="rbv-msg">Reisedaten werden geladen …</div></div>'
      +'<div class="rbv-bar"><i id="rbv-bar"></i></div>'
      +'<label id="rbv-costs-l"><input type="checkbox" id="rbv-costs"'+(_showCosts?' checked':'')+'> Ausgaben zeigen</label>'
      +'<button type="button" class="rbv-btn" id="rbv-go" disabled>Video erstellen</button>'
      +'<button type="button" class="rbv-btn" id="rbv-share" hidden>Teilen</button>'
      +'<button type="button" class="rbv-btn alt" id="rbv-save" hidden>Video speichern</button>'
      +'<button type="button" class="rbv-btn alt" id="rbv-again" hidden>Neu erstellen</button>'
      +'<button type="button" class="rbv-btn alt" id="rbv-close">Schließen</button></div>';
    ov.addEventListener('click',function(e){if(e.target===ov)close();});
    document.body.appendChild(ov);
    $('rbv-close').onclick=close;

    var msg=function(t){var m=$('rbv-msg');if(m){m.textContent=t||'';m.style.display=t?'flex':'none';}};
    try{await Promise.all([document.fonts.load('400 96px "Playfair Display"'),document.fonts.load('italic 400 48px "Playfair Display"'),document.fonts.load('400 34px "DM Sans"'),document.fonts.load('500 34px "DM Sans"')]);}catch(e){}
    var d;
    try{d=await collect(msg);}catch(e){console.error('Rückblick:',e);msg('Die Reisedaten konnten nicht geladen werden.');return;}
    if(!$('rbv-ov'))return;
    if(!d.days){msg('Erst Reisedaten anlegen, dann klappt der Rückblick.');return;}
    var cv=$('rbv-cv'),rec=canRecord(cv),tl=timeline(d);
    // Standbild als Vorschau
    var x=cv.getContext('2d');x.setTransform(cv.width/W,0,0,cv.height/H,0,0);frame(x,tl,d,2.5);msg('');
    $('rbv-sub').textContent=Math.round(tl.total)+' Sekunden mit '+(d.fotos.length?d.fotos.length+' Fotos, ':'')+(d.pts.length>=2?'Route ':'')+'und Reise in Zahlen.'
      +(rec?' Bitte den Bildschirm während der Aufnahme offen lassen.':'');
    if(!rec){
      $('rbv-go').textContent='Vorschau abspielen';
      $('rbv-sub').textContent+=' Dieser Browser kann das Video nicht speichern. Du kannst die Vorschau mit der Bildschirmaufnahme deines Handys aufnehmen.';
    }
    $('rbv-go').disabled=false;
    $('rbv-costs').onchange=function(){_showCosts=this.checked;frame(x,tl,d,tl.total-0.1-3.2);};

    async function go(){
      ['rbv-go','rbv-share','rbv-save','rbv-again'].forEach(function(id){show(id,false);});
      $('rbv-costs').disabled=true;
      var st=$('rbv-stage'),v=st.querySelector('video');if(v){v.remove();cv.style.display='';}
      if(_url){URL.revokeObjectURL(_url);_url=null;}_blob=null;
      var bar=$('rbv-bar');
      try{
        _blob=await play(cv,tl,d,function(p){bar.style.width=(p*100).toFixed(1)+'%';},rec);
      }catch(e){
        if(!$('rbv-ov'))return;
        msg(e&&e.message==='hidden'?'Die Aufnahme wurde unterbrochen, weil der Bildschirm gewechselt hat. Bitte noch einmal starten.':'Das Video konnte nicht aufgenommen werden.');
        if(!(e&&e.message==='hidden'))console.error('Rückblick-Video:',e);
        $('rbv-again').hidden=false;$('rbv-costs').disabled=false;return;
      }
      if(!$('rbv-ov'))return;
      $('rbv-costs').disabled=false;
      if(!_blob){$('rbv-again').textContent='Noch einmal abspielen';$('rbv-again').hidden=false;return;}
      _url=URL.createObjectURL(_blob);
      cv.style.display='none';
      var vid=document.createElement('video');vid.src=_url;vid.controls=true;vid.playsInline=true;vid.setAttribute('playsinline','');vid.muted=true;vid.loop=true;
      st.appendChild(vid);try{vid.play();}catch(e){}
      $('rbv-again').textContent='Neu erstellen';
      ['rbv-share','rbv-save','rbv-again'].forEach(function(id){show(id,true);});
      if(!/mp4/.test(_blob.type))$('rbv-sub').textContent='Fertig. Dein Browser speichert das Video als WebM. Für Instagram am besten auf dem Handy erstellen, dort entsteht MP4.';
      else $('rbv-sub').textContent='Fertig. Tipp: In Instagram oder TikTok kannst du noch Musik dazulegen.';
    }
    $('rbv-go').onclick=go;$('rbv-again').onclick=go;
    $('rbv-save').onclick=function(){
      if(!_url)return;
      var a=document.createElement('a');a.href=_url;a.download=fileName(d,_blob.type);document.body.appendChild(a);a.click();a.remove();
    };
    $('rbv-share').onclick=async function(){
      if(!_blob)return;
      var f=new File([_blob],fileName(d,_blob.type),{type:_blob.type});
      if(navigator.canShare&&navigator.canShare({files:[f]})){
        try{await navigator.share({files:[f],title:'Unser Reise-Rückblick',text:'Unser Reise-Rückblick, erstellt mit travona.de'});}
        catch(e){if(!e||e.name!=='AbortError')$('rbv-save').click();}
      }else $('rbv-save').click();
    };
  }
  window.travonaRueckblickVideo=open;
})();
