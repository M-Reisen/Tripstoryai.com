// Travona – „Reise in Zahlen“: teilbares Bild im Story-Format (1080 × 1920) für Instagram, TikTok und WhatsApp.
// Liest nur die Reisedaten, die reisevorlage.html schon geladen hat (tripHead, costs, dayExpenses, photos …).
(function(){
  var W=1080,H=1920;
  var C={bg:'#F4EFE8',ink:'#1A1714',fog:'#6B6560',terra:'#B5714A',rule:'#D8D0C4'};
  var _url=null,_blob=null,_showCosts=true;

  // Die Reisedaten sind globale Variablen aus reisevorlage.html (let/function im Seitenskript)
  function V(){
    return {
      head:typeof tripHead!=='undefined'?tripHead:{},
      costs:typeof costs!=='undefined'?costs:[],
      dx:typeof dayExpenses!=='undefined'?dayExpenses:{},
      photos:typeof photos!=='undefined'?photos:{},
      toEUR:typeof toEUR==='function'?toEUR:function(a){return a;},
      days:dayList(),
      ort:typeof ortFuerTag==='function'?ortFuerTag:null,
      loadPhotos:typeof sbLoadPhotos==='function'?sbLoadPhotos:null
    };
  }
  function dayList(){
    var d=typeof lyDays==='function'?lyDays():(typeof buildDays==='function'?buildDays():[]);
    return (d||[]).map(function(x){return typeof x==='string'?x:x&&x.iso;}).filter(Boolean);
  }
  function coverSrc(){
    var h=document.getElementById('hero-bg-img');
    if(h)return /supabase\.co\//.test(h.src)?h.src:null; // Standardbild der Vorlage gehört nicht zur Reise
    h=document.querySelector('.figma-hero > img');
    return h?h.src:null;
  }
  function statKm(){return typeof _statKm!=='undefined'?_statKm:null;}
  function num(n){return Math.round(n).toLocaleString('de-DE');}
  function dmy(iso){if(!iso)return '';var p=iso.split('-');return p[2]+'.'+p[1]+'.'+p[0];}

  async function photoCount(v){
    var days=v.days,ph=v.photos,load=v.loadPhotos,n=0,todo=[];
    days.forEach(function(iso){
      if(Array.isArray(ph[iso]))n+=ph[iso].length;
      else if(load)todo.push(iso);
    });
    for(var i=0;i<todo.length;i+=6){
      var part=await Promise.all(todo.slice(i,i+6).map(function(iso){return load(iso).catch(function(){return [];});}));
      part.forEach(function(a,k){ph[todo[i+k]]=a;n+=a.length;});
    }
    return n;
  }
  async function km(){
    if(statKm()==null&&typeof computeStatKm==='function'){
      try{await Promise.race([computeStatKm(),new Promise(function(r){setTimeout(r,8000);})]);}catch(e){}
    }
    return statKm();
  }

  async function collect(){
    var v=V(),head=v.head,costs=v.costs,dx=v.dx,toEUR=v.toEUR,days=v.days;
    var orte={};
    if(v.ort)days.forEach(function(iso){var o=v.ort(iso);if(o)orte[o.toLowerCase()]=1;});
    var belege=costs.length,total=0;
    costs.forEach(function(c){total+=toEUR(c.amount,c.cur);});
    Object.keys(dx).forEach(function(iso){(dx[iso]||[]).forEach(function(e){belege++;total+=toEUR(e.amount,e.cur||'EUR');});});
    return {
      title:head.title||'Meine Reise',emoji:head.emoji&&head.emoji!=='🌍'?head.emoji:'',
      from:head.from||days[0]||'',to:head.to||days[days.length-1]||'',
      days:days.length,orte:Object.keys(orte).length,km:await km(),fotos:await photoCount(v),
      belege:belege,total:total
    };
  }

  function loadImg(src){
    return new Promise(function(res){
      if(!src)return res(null);
      var im=new Image();im.crossOrigin='anonymous';
      var t=setTimeout(function(){res(null);},12000);
      im.onload=function(){clearTimeout(t);res(im);};
      im.onerror=function(){clearTimeout(t);res(null);};
      im.src=src;
    });
  }
  function wrap(ctx,text,maxW,maxLines){
    var words=String(text).split(/\s+/),lines=[],cur='';
    words.forEach(function(w){var t=cur?cur+' '+w:w;if(ctx.measureText(t).width>maxW&&cur){lines.push(cur);cur=w;}else cur=t;});
    if(cur)lines.push(cur);
    if(lines.length>maxLines){lines=lines.slice(0,maxLines);var l=lines[maxLines-1];while(l&&ctx.measureText(l+' …').width>maxW)l=l.slice(0,-1);lines[maxLines-1]=l.trim()+' …';}
    return lines;
  }

  async function draw(d,cover){
    try{await Promise.all([document.fonts.load('400 96px "Playfair Display"'),document.fonts.load('italic 400 48px "Playfair Display"'),document.fonts.load('400 34px "DM Sans"'),document.fonts.load('500 34px "DM Sans"')]);}catch(e){}
    var cv=document.createElement('canvas');cv.width=W;cv.height=H;
    var x=cv.getContext('2d');
    x.fillStyle=C.bg;x.fillRect(0,0,W,H);
    var top=0;
    if(cover){
      var ch=760,s=Math.max(W/cover.naturalWidth,ch/cover.naturalHeight),iw=cover.naturalWidth*s,ih=cover.naturalHeight*s;
      x.drawImage(cover,(W-iw)/2,(ch-ih)/2,iw,ih);
      var gr=x.createLinearGradient(0,ch-260,0,ch);gr.addColorStop(0,'rgba(244,239,232,0)');gr.addColorStop(1,C.bg);
      x.fillStyle=gr;x.fillRect(0,ch-260,W,260);
      top=ch-40;
    }else top=260;
    var L=90;
    x.textBaseline='alphabetic';x.textAlign='left';
    x.fillStyle=C.terra;x.font='500 30px "DM Sans", sans-serif';
    if('letterSpacing' in x)x.letterSpacing='6px';
    x.fillText('MEINE REISE IN ZAHLEN',L,top+60);
    if('letterSpacing' in x)x.letterSpacing='0px';
    x.fillStyle=C.ink;x.font='400 92px "Playfair Display", serif';
    var lines=wrap(x,(d.emoji?d.emoji+' ':'')+d.title,W-2*L,2),y=top+170;
    lines.forEach(function(l){x.fillText(l,L,y);y+=104;});
    if(d.from){x.fillStyle=C.fog;x.font='400 34px "DM Sans", sans-serif';x.fillText(d.to&&d.to!==d.from?dmy(d.from)+' – '+dmy(d.to):dmy(d.from),L,y-30);y+=30;}

    var stats=[];
    if(d.days)stats.push([num(d.days),d.days===1?'Tag':'Tage']);
    if(d.orte>1)stats.push([num(d.orte),'Orte']);
    if(d.km)stats.push([num(d.km),'Kilometer']);
    if(d.fotos)stats.push([num(d.fotos),d.fotos===1?'Foto':'Fotos']);
    if(d.belege)stats.push([num(d.belege),d.belege===1?'Beleg':'Belege']);
    if(_showCosts&&d.total>0)stats.push([num(d.total)+' €','ausgegeben']);
    if(_showCosts&&d.total>0&&d.days>1)stats.push([num(d.total/d.days)+' €','pro Tag']);
    stats=stats.slice(0,6);

    var footY=H-230,gy=Math.max(y+40,top+380),rows=Math.ceil(stats.length/2)||1;
    var cell=Math.min(250,(footY-60-gy)/rows),cw=(W-2*L)/2;
    x.strokeStyle=C.rule;x.lineWidth=2;
    stats.forEach(function(s,i){
      var cx=L+(i%2)*cw,cy=gy+Math.floor(i/2)*cell;
      x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+cw-(i%2?0:40),cy);x.stroke();
      x.fillStyle=i%3===0?C.terra:C.ink;
      var fs=Math.min(112,cell*0.5);x.font='400 '+Math.round(fs)+'px "Playfair Display", serif';
      while(x.measureText(s[0]).width>cw-50&&fs>40){fs-=6;x.font='400 '+Math.round(fs)+'px "Playfair Display", serif';}
      x.fillText(s[0],cx,cy+fs+28);
      x.fillStyle=C.fog;x.font='400 34px "DM Sans", sans-serif';
      x.fillText(s[1],cx,cy+fs+88);
    });

    x.beginPath();x.moveTo(L,footY);x.lineTo(W-L,footY);x.stroke();
    x.fillStyle=C.ink;x.font='italic 400 52px "Playfair Display", serif';
    x.fillText('Belege rein, Reisebericht raus.',L,footY+90);
    x.fillStyle=C.terra;x.font='500 40px "DM Sans", sans-serif';
    x.fillText('travona.de',L,footY+160);
    return new Promise(function(res){try{cv.toBlob(function(b){res(b);},"image/png");}catch(e){res(null);}});
  }

  function css(){
    if(document.getElementById('riz-css'))return;
    var s=document.createElement('style');s.id='riz-css';
    s.textContent='#riz-ov{position:fixed;inset:0;z-index:10000;background:rgba(26,23,20,.72);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"DM Sans",sans-serif}'
      +'#riz-ov .riz-box{background:#F4EFE8;border-radius:10px;max-width:420px;width:100%;max-height:100%;overflow:auto;padding:18px;text-align:center}'
      +'#riz-ov h3{font-family:"Playfair Display",serif;font-weight:400;font-size:24px;margin:0 0 4px;color:#1A1714}'
      +'#riz-ov p{font-size:13px;color:#6B6560;margin:0 0 12px;line-height:1.5}'
      +'#riz-ov .riz-img{display:block;width:100%;max-height:58vh;object-fit:contain;border-radius:6px;background:#e9e2d7;margin:0 auto 12px;min-height:200px}'
      +'#riz-ov label{display:flex;gap:8px;align-items:center;justify-content:center;font-size:14px;color:#1A1714;margin-bottom:12px;cursor:pointer}'
      +'#riz-ov .riz-btn{display:block;width:100%;padding:13px;border-radius:6px;border:0;font:500 14px "DM Sans",sans-serif;cursor:pointer;margin-top:8px;background:#B5714A;color:#fff;text-decoration:none}'
      +'#riz-ov .riz-btn.alt{background:transparent;color:#1A1714;border:1px solid #D8D0C4}'
      +'#riz-ov .riz-btn[disabled]{opacity:.5}';
    document.head.appendChild(s);
  }
  function close(){var o=document.getElementById('riz-ov');if(o)o.remove();if(_url){URL.revokeObjectURL(_url);_url=null;}}
  function fileName(d){return 'reise-in-zahlen-'+String(d.title).toLowerCase().replace(/[^a-z0-9äöüß]+/g,'-').replace(/^-|-$/g,'')+'.png';}

  async function render(d,cover){
    var img=document.getElementById('riz-img'),btns=document.querySelectorAll('#riz-ov .riz-btn[data-need]');
    btns.forEach(function(b){b.disabled=true;});
    _blob=await draw(d,cover);
    if(_url)URL.revokeObjectURL(_url);
    _url=_blob?URL.createObjectURL(_blob):null;
    if(img&&_url)img.src=_url;
    btns.forEach(function(b){b.disabled=!_blob;});
  }

  async function open(){
    css();close();
    var ov=document.createElement('div');ov.id='riz-ov';
    ov.innerHTML='<div class="riz-box" role="dialog" aria-modal="true" aria-label="Reise in Zahlen">'
      +'<h3>Reise in Zahlen</h3><p>Ein Bild im Story-Format für Instagram, TikTok oder WhatsApp.</p>'
      +'<img class="riz-img" id="riz-img" alt="Vorschau: Reise in Zahlen">'
      +'<label><input type="checkbox" id="riz-costs"'+(_showCosts?' checked':'')+'> Ausgaben zeigen</label>'
      +'<button type="button" class="riz-btn" data-need="1" id="riz-share" disabled>Teilen</button>'
      +'<button type="button" class="riz-btn alt" data-need="1" id="riz-save" disabled>Bild speichern</button>'
      +'<button type="button" class="riz-btn alt" id="riz-close">Schließen</button></div>';
    ov.addEventListener('click',function(e){if(e.target===ov)close();});
    document.body.appendChild(ov);
    document.getElementById('riz-close').onclick=close;

    var parts=await Promise.all([collect(),loadImg(coverSrc())]);
    var d=parts[0],cover=parts[1];
    if(!document.getElementById('riz-ov'))return;
    await render(d,cover);
    document.getElementById('riz-costs').onchange=function(){_showCosts=this.checked;render(d,cover);};
    document.getElementById('riz-save').onclick=function(){
      if(!_url)return;
      var a=document.createElement('a');a.href=_url;a.download=fileName(d);document.body.appendChild(a);a.click();a.remove();
    };
    document.getElementById('riz-share').onclick=async function(){
      if(!_blob)return;
      var f=new File([_blob],fileName(d),{type:'image/png'});
      if(navigator.canShare&&navigator.canShare({files:[f]})){
        try{await navigator.share({files:[f],title:'Meine Reise in Zahlen',text:'Meine Reise in Zahlen, erstellt mit travona.de'});}
        catch(e){if(!e||e.name!=='AbortError')document.getElementById('riz-save').click();}
      }else document.getElementById('riz-save').click();
    };
  }
  window.travonaReiseInZahlen=open;
  open.daten=collect;   // auch vom Rückblick-Video (rueckblick-video.js) genutzt
})();
