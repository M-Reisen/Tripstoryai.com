// Travona – „Diese Reise nachbuchen“: Nach Reiseende sehen Besucher alle Unterkünfte, Flüge, Transfers und Ausflüge
// mit den bezahlten Preisen. Sie können die Route anpassen (Nächte ändern, Stopps weglassen oder einfügen),
// die Kosten rechnen sich sofort neu, und jede Position hat einen Such-Link zum Buchen.
// Liest nur Daten, die reisevorlage.html bzw. australien.html schon geladen haben (costs, tripHead, dayExpenses, toEUR …).
// Australien liefert seine Positionen über window.travonaNachbuchenQuelle().
(function(){
  var CATS=[
    {key:'Flug',label:'Flüge',search:'Flug suchen'},
    {key:'Transport',label:'Transport & Mietwagen',search:'Suchen'},
    {key:'Ausflug',label:'Ausflüge & Touren',search:'Tour suchen'},
    {key:'Sonstiges',label:'Sonstiges',search:''}
  ];
  var S=null,_open=false,LINKS={},_linksLoaded=false,_linksP=null;

  // ── Hilfen ────────────────────────────────────────────────────────────────
  function E(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function eur(n){return Math.round(n).toLocaleString('de-DE')+' €';}
  function isISO(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||'');}
  function iso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function add(s,n){var d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return iso(d);}
  function diff(a,b){return Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/864e5);}
  function today(){return iso(new Date());}
  function kurz(s){return new Date(s+'T12:00:00').toLocaleDateString('de-DE',{weekday:'short',day:'numeric',month:'short'});}
  function span(a,b,yr){
    var x=new Date(a+'T12:00:00'),y=new Date(b+'T12:00:00');
    if(a===b)return kurz(a);
    var o={day:'numeric',month:'short'};
    return x.toLocaleDateString('de-DE',o)+' – '+y.toLocaleDateString('de-DE',yr?{day:'numeric',month:'short',year:'numeric'}:o);
  }
  function nN(n){return n+(n===1?' Nacht':' Nächte');}
  function info(raw){var p=String(raw||'').split('‖');return {text:p[0]||'',bis:p[4]||'',from:p[6]||'',to:p[7]||''};}
  function admin(){return document.documentElement.classList.contains('is-admin');}
  function safeURL(u){u=String(u||'').trim();return /^https?:\/\/[^\s"'<>]+$/i.test(u)?u.slice(0,500):'';}
  function host(u){try{return new URL(u).hostname.replace(/^www\./,'');}catch(e){return '';}}

  // ── Einstellungen der Besitzerin, gespeichert als eine Zeile in kommentare:
  //    pro Position Anbieter-Link + Beschreibung ({u,d}) und die Freigabe für Besucher (_frei) ──
  function linkKey(){return (typeof PFX!=='undefined'&&PFX?PFX:tripKey()+'_')+'nb_links';}
  function tripId(){return (typeof REISE!=='undefined'&&REISE)||(typeof REISE_ID!=='undefined'&&REISE_ID)||null;}
  function loadLinks(){
    if(_linksLoaded||typeof sb==='undefined')return Promise.resolve();
    if(!_linksP)_linksP=fetchLinks().then(function(){_linksP=null;});
    return _linksP;
  }
  async function fetchLinks(){
    try{
      var r=await sb.from('kommentare').select('nachricht').eq('ort',linkKey()).limit(1);
      if(r.error)return;
      if(r.data&&r.data.length){var j=JSON.parse(r.data[0].nachricht||'{}');if(j&&typeof j==='object')LINKS=j;}
      _linksLoaded=true;
    }catch(e){}
  }
  function frei(){return _linksLoaded&&!!LINKS._frei;}
  async function saveLinks(msg){
    try{
      var payload=JSON.stringify(LINKS),r=await sb.from('kommentare').select('id').eq('ort',linkKey()).limit(1),res;
      if(r.data&&r.data.length)res=await sb.from('kommentare').update({nachricht:payload}).eq('id',r.data[0].id);
      else res=await sb.from('kommentare').insert({ort:linkKey(),name:'Nachbuchen-Links',nachricht:payload,created_at:new Date().toISOString(),owner:typeof currentUser!=='undefined'&&currentUser?currentUser.id:null,trip_id:tripId()});
      if(res&&res.error)throw res.error;
      if(typeof toast==='function')toast(msg||'Anbieter gespeichert');
      return true;
    }catch(e){if(typeof toast==='function')toast('Speichern fehlgeschlagen. Bitte erneut versuchen.');return false;}
  }

  // ── Daten der Seite ───────────────────────────────────────────────────────
  function head(){return typeof tripHead!=='undefined'&&tripHead?tripHead:{};}
  function fx(){return typeof toEUR==='function'?toEUR:function(a){return a;};}
  function days(){
    var d=[];
    try{d=typeof lyDays==='function'?lyDays():(typeof buildDays==='function'?buildDays():[]);}catch(e){}
    d=(d||[]).map(function(x){return typeof x==='string'?x:x&&x.iso;}).filter(isISO);
    var h=head();
    if(!d.length&&isISO(h.from)&&isISO(h.to)){for(var x=h.from;x<=h.to;x=add(x,1))d.push(x);}
    return d;
  }
  function tripKey(){
    var k=(typeof REISE!=='undefined'&&REISE)||(typeof REISE_ID!=='undefined'&&REISE_ID)||location.pathname;
    return String(k).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60)||'x';
  }
  function rawItems(){
    try{
      if(typeof window.travonaNachbuchenQuelle==='function')return window.travonaNachbuchenQuelle()||[];
      return typeof costs!=='undefined'&&Array.isArray(costs)?costs:[];
    }catch(e){return [];}
  }
  function model(){
    var toE=fx(),stays=[],groups={};
    CATS.forEach(function(c){groups[c.key]=[];});
    rawItems().forEach(function(c,i){
      var pi=info(c.info),eurAmt=toE(Number(c.amount)||0,c.cur||'EUR');
      var it={id:String(c.id!=null?c.id:'i'+i),cat:c.cat,label:String(c.label||'Position'),text:pi.text,datum:isISO(c.datum)?c.datum:'',amount:eurAmt,from:pi.from,to:pi.to};
      if(c.cat==='Unterkunft'){
        it.n0=c.nights||(it.datum&&isISO(pi.bis)?Math.max(0,diff(it.datum,pi.bis)):0)||1;
        it.loc=c.loc||(pi.text&&pi.text.length<48?pi.text:'');
        stays.push(it);
      }else (groups[c.cat]||groups.Sonstiges).push(it);
    });
    function byDate(a,b){return (a.datum||'9999')<(b.datum||'9999')?-1:((a.datum||'9999')>(b.datum||'9999')?1:0);}
    stays.sort(byDate);
    Object.keys(groups).forEach(function(k){groups[k].sort(byDate);});
    var d=days();
    var dx=typeof dayExpenses!=='undefined'&&dayExpenses?dayExpenses:{},vor=0;
    Object.keys(dx).forEach(function(k){(dx[k]||[]).forEach(function(e){vor+=toE(Number(e.amount)||0,e.cur||'EUR');});});
    return {stays:stays,groups:groups,days:d,first:d[0]||(stays[0]&&stays[0].datum)||today(),last:d[d.length-1]||'',vorOrt:vor};
  }

  // ── Zustand (Änderungen des Besuchers) ────────────────────────────────────
  function defaultStart(first){
    var s=first,min=add(today(),14),y=0;
    while(s<min&&y<10){var d=new Date(s+'T12:00:00');d.setFullYear(d.getFullYear()+1);s=iso(d);y++;}
    return s;
  }
  function fresh(m){return {start:defaultStart(m.first),n:{},off:{},add:[],vor:1};}
  function lsKey(){return 'tv_nb_'+tripKey();}
  function save(){try{localStorage.setItem(lsKey(),JSON.stringify(S));}catch(e){}}
  function clean(o,m){
    var s=fresh(m);
    if(!o||typeof o!=='object')return s;
    if(isISO(o.start))s.start=o.start;
    if(o.n&&typeof o.n==='object')Object.keys(o.n).forEach(function(k){var v=parseInt(o.n[k],10);if(v>=1&&v<=60)s.n[k]=v;});
    if(o.off&&typeof o.off==='object')Object.keys(o.off).forEach(function(k){if(o.off[k])s.off[k]=1;});
    if(Array.isArray(o.add))o.add.slice(0,20).forEach(function(a,i){
      if(!a||!a.name)return;
      s.add.push({id:'x'+i,after:a.after==null?null:String(a.after),name:String(a.name).slice(0,80),n:Math.min(60,Math.max(1,parseInt(a.n,10)||1)),ppn:Math.max(0,Number(a.ppn)||0)});
    });
    s.vor=o.vor===0?0:1;
    return s;
  }
  function load(m){
    var h=(location.hash||'').match(/^#nachbuchen=([A-Za-z0-9_-]+)/);
    if(h){try{return clean(JSON.parse(decodeURIComponent(escape(atob(h[1].replace(/-/g,'+').replace(/_/g,'/'))))),m);}catch(e){}}
    try{return clean(JSON.parse(localStorage.getItem(lsKey())||'null'),m);}catch(e){return fresh(m);}
  }
  function shareURL(){
    var j=btoa(unescape(encodeURIComponent(JSON.stringify(S)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return location.origin+location.pathname+location.search+'#nachbuchen='+j;
  }

  // ── Berechnung: neue Daten und Kosten ─────────────────────────────────────
  function plan(m){
    var seq=[],ptr=null,prevEnd=null,shift=diff(m.first,S.start),map=[];
    S.add.filter(function(a){return a.after===null;}).forEach(function(a){seq.push({c:a});});
    m.stays.forEach(function(st){
      seq.push({s:st});
      S.add.filter(function(a){return a.after===st.id;}).forEach(function(a){seq.push({c:a});});
    });
    var rows=[],total=0,orig=0;
    seq.forEach(function(x){
      if(x.s){
        var st=x.s,off=!!S.off[st.id],n=off?0:(S.n[st.id]||st.n0),start;
        orig+=st.amount;
        if(st.datum){
          // Abstand zur vorherigen Unterkunft bleibt erhalten (z. B. Nachtflug ohne Hotel)
          if(ptr===null)start=add(S.start,Math.max(0,diff(m.first,st.datum)));
          else start=add(ptr,prevEnd?Math.max(0,diff(prevEnd,st.datum)):0);
          prevEnd=add(st.datum,st.n0);
        }else start=ptr||S.start;
        var end=add(start,n),price=st.n0?st.amount/st.n0*n:0;
        if(!off)total+=price;
        if(st.datum)map.push({o0:st.datum,o1:add(st.datum,st.n0),n0:st.n0,s:start,e:end,n:n,off:off});
        rows.push({kind:'stay',st:st,off:off,n:n,start:start,end:end,price:price,ppn:st.n0?st.amount/st.n0:0});
        ptr=end;
      }else{
        var a=x.c,s2=ptr||S.start,e2=add(s2,a.n),p2=a.ppn*a.n;
        total+=p2;
        rows.push({kind:'add',a:a,n:a.n,start:s2,end:e2,price:p2});
        ptr=e2;
      }
    });
    // Andere Positionen wandern mit der Unterkunft, in deren Zeitraum sie liegen
    function moved(d){
      if(!d)return {d:''};
      var c=null;
      map.forEach(function(x){if(x.o0<=d)c=x;});
      if(!c)return {d:add(d,shift)};
      var k=diff(c.o0,d);
      if(k<c.n0){
        if(c.off)return {d:add(c.s,0),warn:'Gehört zu einem weggelassenen Stopp'};
        if(k>=c.n&&k>0)return {d:add(c.e,0),warn:'Liegt nach der Kürzung außerhalb des Aufenthalts'};
        return {d:add(c.s,k)};
      }
      return {d:add(c.e,k-c.n0)};
    }
    var groups={};
    CATS.forEach(function(cat){
      groups[cat.key]=(m.groups[cat.key]||[]).map(function(it){
        var mv=moved(it.datum),off=!!S.off[it.id];
        orig+=it.amount;
        if(!off)total+=it.amount;
        return {it:it,off:off,d:mv.d,warn:mv.warn};
      });
    });
    var newLast=m.last?moved(m.last).d:'';
    // Wenn Stopps nach dem letzten Reisetag eingefügt wurden, verlängert sich die Reise
    if(ptr&&(!newLast||ptr>newLast))newLast=ptr;
    var nDays=newLast?diff(S.start,newLast)+1:m.days.length;
    var perDay=m.days.length?m.vorOrt/m.days.length:0,vor=perDay*Math.max(1,nDays);
    orig+=m.vorOrt;
    if(S.vor)total+=vor;
    return {rows:rows,groups:groups,total:total,orig:orig,nDays:nDays,oDays:m.days.length,end:newLast,perDay:perDay,vor:vor};
  }

  // ── Such-Links (ohne Partnerprogramm, reine Suche) ────────────────────────
  function bookingURL(name,loc,ci,co){
    return 'https://www.booking.com/searchresults.de.html?ss='+encodeURIComponent((name+' '+(loc||'')).trim())
      +'&checkin='+ci+'&checkout='+co+'&group_adults=2&no_rooms=1';
  }
  function itemURL(cat,it,d){
    var q;
    if(cat==='Flug'){
      var m=it.label.match(/([A-Za-zÄÖÜäöüß .-]+?)\s*(?:→|->|–|-)\s*([A-Za-zÄÖÜäöüß .-]+)$/);
      var from=it.from||(m?m[1].replace(/^.*·\s*/,''):''),to=it.to||(m?m[2]:'');
      q=from&&to?'Flüge von '+from.trim()+' nach '+to.trim()+(d?' am '+d:''):'Flug '+it.label;
      return 'https://www.google.com/travel/flights?hl=de&q='+encodeURIComponent(q);
    }
    if(cat==='Ausflug')return 'https://www.getyourguide.de/s/?q='+encodeURIComponent(it.label.replace(/^[^\wÄÖÜäöü]+/,'').slice(0,90));
    if(cat==='Transport')return 'https://www.google.com/search?q='+encodeURIComponent(it.label.replace(/^[^\wÄÖÜäöü]+/,'')+(d?' '+d:''));
    return '';
  }

  // ── Darstellung ───────────────────────────────────────────────────────────
  function css(){
    if(document.getElementById('nb-css'))return;
    var s=document.createElement('style');s.id='nb-css';
    s.textContent=''
      +'#nb-ov{position:fixed;inset:0;z-index:9000;background:rgba(26,23,20,.55);display:flex;align-items:flex-end;justify-content:center}'
      +'#nb-ov .nb-sh{background:#F7F1E8;width:100%;max-width:640px;height:94vh;height:94dvh;border-radius:22px 22px 0 0;display:flex;flex-direction:column;overflow:hidden;font-family:"DM Sans",sans-serif;color:#1A1714}'
      +'@media(min-width:700px){#nb-ov{align-items:center}#nb-ov .nb-sh{height:90vh;border-radius:22px}}'
      +'#nb-ov .nb-top{display:flex;align-items:flex-start;gap:12px;padding:20px 20px 12px;border-bottom:1px solid #E6DCCB}'
      +'#nb-ov .nb-top h2{font:500 1.55rem/1.15 "Playfair Display",serif;margin:0 0 4px}'
      +'#nb-ov .nb-top p{margin:0;font-size:.84rem;color:#5F5953;line-height:1.4}'
      +'#nb-ov .nb-x{margin-left:auto;flex:none;width:38px;height:38px;border-radius:50%;border:0;background:#EFE6D8;font-size:20px;line-height:1;cursor:pointer;color:#1A1714}'
      +'#nb-ov .nb-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:14px 16px 24px}'
      +'#nb-ov .nb-row0{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#fff;border-radius:16px;padding:12px 14px;box-shadow:0 2px 10px rgba(26,23,20,.07);font-size:.86rem}'
      +'#nb-ov .nb-row0 label{display:flex;align-items:center;gap:8px;font-weight:500;text-transform:none;letter-spacing:0;font-size:.86rem;color:#1A1714;margin:0}'
      +'#nb-ov .nb-row0 input{width:auto;padding:6px 8px;border:1px solid #D8D0C4;border-radius:8px;font:inherit;background:#F7F1E8;color:#1A1714}'
      +'#nb-ov .nb-row0 span{color:#5F5953}'
      +'#nb-ov h3{font:600 .72rem "DM Sans",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#A8522F;margin:22px 4px 10px;display:flex;justify-content:space-between}'
      +'#nb-ov h3 b{font-weight:600;color:#5F5953;letter-spacing:0;text-transform:none;font-size:.8rem}'
      +'#nb-ov .nb-card{background:#fff;border-radius:16px;padding:12px 14px;margin-bottom:8px;box-shadow:0 2px 10px rgba(26,23,20,.07);transition:opacity .2s}'
      +'#nb-ov .nb-card.off{opacity:.55;background:#F1EBE1;box-shadow:none}'
      +'#nb-ov .nb-card.off .nb-name{text-decoration:line-through}'
      +'#nb-ov .nb-l1{display:flex;gap:10px;align-items:flex-start}'
      +'#nb-ov .nb-num{flex:none;width:26px;height:26px;border-radius:50%;background:#A8522F;color:#fff;font-size:.75rem;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}'
      +'#nb-ov .nb-card.add .nb-num{background:#2C5F6A}'
      +'#nb-ov .nb-tx{flex:1;min-width:0}'
      +'#nb-ov .nb-name{font-weight:600;font-size:.95rem;line-height:1.25;word-wrap:break-word}'
      +'#nb-ov .nb-sub{font-size:.8rem;color:#5F5953;margin-top:2px}'
      +'#nb-ov .nb-desc{font-size:.8rem;color:#1A1714;font-style:italic;margin-top:5px;line-height:1.4}'
      +'#nb-ov .nb-warn{font-size:.78rem;color:#A8522F;margin-top:4px}'
      +'#nb-ov .nb-pr{flex:none;text-align:right;font-weight:700;font-size:.95rem;white-space:nowrap}'
      +'#nb-ov .nb-pr small{display:block;font-weight:400;font-size:.72rem;color:#5F5953}'
      +'#nb-ov .nb-l2{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;padding-left:36px}'
      +'#nb-ov .nb-step{display:flex;align-items:center;border:1px solid #D8D0C4;border-radius:999px;overflow:hidden}'
      +'#nb-ov .nb-step button{width:34px;height:32px;border:0;background:#fff;font-size:18px;cursor:pointer;color:#1A1714}'
      +'#nb-ov .nb-step button:disabled{opacity:.3;cursor:default}'
      +'#nb-ov .nb-step span{min-width:68px;text-align:center;font-size:.82rem;font-weight:600}'
      +'#nb-ov .nb-btn{border:1px solid #D8D0C4;background:#fff;border-radius:999px;padding:7px 13px;font:500 .8rem "DM Sans",sans-serif;cursor:pointer;color:#1A1714;text-decoration:none;display:inline-flex;align-items:center;gap:4px}'
      +'#nb-ov .nb-btn.go{border-color:#A8522F;color:#A8522F}'
      +'#nb-ov .nb-btn.pri{background:#A8522F;border-color:#A8522F;color:#fff}'
      +'#nb-ov .nb-btn.ins{border-style:dashed;color:#2C5F6A;border-color:#9DB8BD}'
      +'#nb-ov .nb-form{background:#fff;border:1.5px solid #2C5F6A;border-radius:16px;padding:12px 14px;margin:0 0 8px;display:grid;grid-template-columns:1fr 1fr;gap:8px}'
      +'#nb-ov .nb-form label{font-size:.75rem;color:#5F5953;display:flex;flex-direction:column;gap:3px;text-transform:none;letter-spacing:0;margin:0}'
      +'#nb-ov .nb-form label.w{grid-column:1/-1}'
      +'#nb-ov .nb-form input{padding:8px 10px;border:1px solid #D8D0C4;border-radius:8px;font:inherit;font-size:.9rem;background:#F7F1E8;color:#1A1714;width:100%;box-sizing:border-box}'
      +'#nb-ov .nb-form div{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end}'
      +'#nb-ov .nb-tg{display:flex;gap:10px;align-items:flex-start;cursor:pointer;text-transform:none;letter-spacing:0;margin:0;font-size:inherit;color:inherit}'
      +'#nb-ov .nb-tg input{width:20px;height:20px;margin:2px 0 0;accent-color:#A8522F;flex:none}'
      +'#nb-ov .nb-note{font-size:.76rem;color:#5F5953;line-height:1.45;margin:18px 4px 0}'
      +'#nb-ov .nb-foot{border-top:1px solid #E6DCCB;background:#fff;padding:12px 16px calc(12px + env(safe-area-inset-bottom));display:flex;align-items:center;gap:10px}'
      +'#nb-ov .nb-sum{flex:1;min-width:0}'
      +'#nb-ov .nb-sum small{display:block;font-size:.72rem;color:#5F5953}'
      +'#nb-ov .nb-sum b{font:700 1.35rem "DM Sans",sans-serif}'
      +'#nb-ov .nb-d{display:inline-block;margin-left:6px;font-size:.75rem;font-weight:600;padding:2px 8px;border-radius:999px;vertical-align:3px}'
      +'#nb-ov .nb-d.minus{background:#E3EFE7;color:#2E6B45}#nb-ov .nb-d.plus{background:#F6E3DA;color:#A8522F}'
      +'#nb-ov .nb-own{display:flex;align-items:center;gap:8px;font-size:.8rem;margin-top:10px;color:#5F5953;text-transform:none;letter-spacing:0}'
      +'#nb-ov .nb-own input{width:18px;height:18px;accent-color:#A8522F}'
      +'#nb-card{margin:12px 16px 0;background:#fff;border-radius:22px;box-shadow:0 2px 10px rgba(26,23,20,.07);padding:16px 18px;display:flex;gap:14px;align-items:center;cursor:pointer;border:0;width:calc(100% - 32px);text-align:left;font-family:"DM Sans",sans-serif;color:#1A1714}'
      +'#nb-card i{flex:none;width:44px;height:44px;border-radius:50%;background:#EFE6D8;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:22px}'
      +'#nb-card b{display:block;font:500 1.08rem "Playfair Display",serif}'
      +'#nb-card small{display:block;font-size:.8rem;color:#5F5953;margin-top:2px;line-height:1.35}'
      +'#nb-card em{margin-left:auto;font-style:normal;color:#A8522F;font-weight:600;font-size:.85rem;white-space:nowrap}';
    document.head.appendChild(s);
  }

  function render(){
    var body=document.getElementById('nb-body');if(!body)return;
    var m=model(),p=plan(m),h='',num=0,open=body.getAttribute('data-form')||'';
    h+='<div class="nb-row0"><label>Reisebeginn <input type="date" id="nb-start" value="'+E(S.start)+'" min="'+E(today())+'"></label>'
      +'<span>'+(p.end?E(span(S.start,p.end,1))+' · ':'')+p.nDays+' Tage'+(p.nDays!==p.oDays?' (statt '+p.oDays+')':'')+'</span></div>';

    var stTotal=0;p.rows.forEach(function(r){if(!(r.kind==='stay'&&r.off))stTotal+=r.price;});
    h+='<h3>Route & Unterkünfte<b>'+eur(stTotal)+'</b></h3>';
    function ins(after){
      var key='f:'+(after==null?'':after);
      if(open===key){
        return '<div class="nb-form" data-after="'+E(after==null?'':after)+'">'
          +'<label class="w">Ort oder Unterkunft<input id="nb-f-name" maxlength="80" placeholder="z. B. Mission Beach" autocomplete="off"></label>'
          +'<label>Nächte<input id="nb-f-n" type="number" min="1" max="60" value="1" inputmode="numeric"></label>'
          +'<label>Preis pro Nacht (€)<input id="nb-f-p" type="number" min="0" step="1" placeholder="optional" inputmode="decimal"></label>'
          +'<div><button type="button" class="nb-btn" data-act="cancel">Abbrechen</button><button type="button" class="nb-btn pri" data-act="save">Einfügen</button></div></div>';
      }
      return '';
    }
    function lnkForm(id){
      if(open!=='l:'+id)return '';
      var L=LINKS[id]||{};
      return '<div class="nb-form" data-lid="'+E(id)+'">'
        +'<label class="w">Link zum Anbieter<input id="nb-l-u" type="url" maxlength="500" placeholder="https://…" value="'+E(L.u||'')+'" autocomplete="off"></label>'
        +'<label class="w">Beschreibung (optional)<input id="nb-l-d" maxlength="200" placeholder="z. B. Familiengeführt, super Frühstück, direkt am Strand" value="'+E(L.d||'')+'"></label>'
        +'<div>'+(L.u||L.d?'<button type="button" class="nb-btn" data-act="ldel" data-id="'+E(id)+'">Entfernen</button>':'')
        +'<button type="button" class="nb-btn" data-act="cancel">Abbrechen</button><button type="button" class="nb-btn pri" data-act="lsave" data-id="'+E(id)+'">Speichern</button></div></div>';
    }
    function lnkBtn(id){return admin()?'<button type="button" class="nb-btn ins" data-act="lnk" data-id="'+E(id)+'">✎ Anbieter</button>':'';}
    function desc(id){var d=(LINKS[id]||{}).d;return d?'<div class="nb-desc">'+E(d)+'</div>':'';}
    function direct(id,label){var u=safeURL((LINKS[id]||{}).u);return u?'<a class="nb-btn go" target="_blank" rel="noopener nofollow" href="'+E(u)+'">'+E(label)+' '+E(host(u))+' ↗</a>':'';}
    function insBtn(after){return '<button type="button" class="nb-btn ins" data-act="ins" data-after="'+E(after)+'">＋ Stopp danach</button>';}
    h+=ins(null);
    p.rows.forEach(function(r){
      if(r.kind==='stay'){
        var st=r.st;num+=r.off?0:1;
        h+='<div class="nb-card'+(r.off?' off':'')+'"><div class="nb-l1"><span class="nb-num">'+(r.off?'–':num)+'</span>'
          +'<div class="nb-tx"><div class="nb-name">'+E(st.label)+'</div>'
          +'<div class="nb-sub">'+(st.loc?E(st.loc)+' · ':'')+(r.off?'weggelassen':E(span(r.start,r.end))+' · '+nN(r.n))+'</div>'+desc(st.id)+'</div>'
          +'<div class="nb-pr">'+(r.off?eur(0):(st.amount?eur(r.price):'–'))+(st.amount&&!r.off?'<small>'+eur(r.ppn)+' / Nacht</small>':'')+'</div></div>'
          +'<div class="nb-l2">'
          +(r.off?'<button type="button" class="nb-btn" data-act="on" data-id="'+E(st.id)+'">Wieder aufnehmen</button>'
            :'<div class="nb-step"><button type="button" data-act="minus" data-id="'+E(st.id)+'"'+(r.n<=1?' disabled':'')+' aria-label="Eine Nacht weniger">−</button><span>'+nN(r.n)+'</span><button type="button" data-act="plus" data-id="'+E(st.id)+'"'+(r.n>=60?' disabled':'')+' aria-label="Eine Nacht mehr">+</button></div>'
             +'<button type="button" class="nb-btn" data-act="off" data-id="'+E(st.id)+'">Weglassen</button>'
             +(direct(st.id,'Buchen bei')||'')
             +'<a class="nb-btn'+(safeURL((LINKS[st.id]||{}).u)?'':' go')+'" target="_blank" rel="noopener nofollow" href="'+E(bookingURL(st.label,st.loc,r.start,r.end))+'">'+(safeURL((LINKS[st.id]||{}).u)?'Booking.com vergleichen ↗':'Buchen ↗')+'</a>')
          +insBtn(st.id)+lnkBtn(st.id)+'</div></div>';
        h+=lnkForm(st.id)+ins(st.id);
      }else{
        var a=r.a;num++;
        h+='<div class="nb-card add"><div class="nb-l1"><span class="nb-num">'+num+'</span>'
          +'<div class="nb-tx"><div class="nb-name">'+E(a.name)+'</div><div class="nb-sub">Dein Vorschlag · '+E(span(r.start,r.end))+' · '+nN(r.n)+'</div></div>'
          +'<div class="nb-pr">'+(a.ppn?eur(r.price)+'<small>'+eur(a.ppn)+' / Nacht</small>':'<small>Preis offen</small>')+'</div></div>'
          +'<div class="nb-l2"><div class="nb-step"><button type="button" data-act="aminus" data-id="'+E(a.id)+'"'+(r.n<=1?' disabled':'')+' aria-label="Eine Nacht weniger">−</button><span>'+nN(r.n)+'</span><button type="button" data-act="aplus" data-id="'+E(a.id)+'" aria-label="Eine Nacht mehr">+</button></div>'
          +'<button type="button" class="nb-btn" data-act="adel" data-id="'+E(a.id)+'">Entfernen</button>'
          +'<a class="nb-btn go" target="_blank" rel="noopener nofollow" href="'+E(bookingURL(a.name,'',r.start,r.end))+'">Unterkunft suchen ↗</a>'+insBtn(a.id)+'</div></div>';
        h+=ins(a.id);
      }
    });
    if(!p.rows.length)h+='<p class="nb-note">Für diese Reise sind noch keine Unterkünfte eingetragen.</p>';

    CATS.forEach(function(cat){
      var g=p.groups[cat.key];if(!g||!g.length)return;
      var sum=0;g.forEach(function(x){if(!x.off)sum+=x.it.amount;});
      h+='<h3>'+E(cat.label)+'<b>'+eur(sum)+'</b></h3>';
      g.forEach(function(x){
        var it=x.it,url=itemURL(cat.key,it,x.d);
        h+='<div class="nb-card'+(x.off?' off':'')+'"><label class="nb-tg"><input type="checkbox" data-act="tg" data-id="'+E(it.id)+'"'+(x.off?'':' checked')+'>'
          +'<div class="nb-tx"><div class="nb-name">'+E(it.label)+'</div>'
          +'<div class="nb-sub">'+(x.d?E(kurz(x.d)):'')+(x.d&&it.text?' · ':'')+E(it.text)+'</div>'+desc(it.id)
          +(x.warn&&!x.off?'<div class="nb-warn">'+E(x.warn)+'</div>':'')+'</div>'
          +'<div class="nb-pr">'+(it.amount?eur(it.amount):'<small>Preis offen</small>')+'</div></label>'
          +(function(){
            var dl=x.off?'':direct(it.id,'Buchen bei'),sl=url&&!x.off&&!dl?'<a class="nb-btn go" target="_blank" rel="noopener nofollow" href="'+E(url)+'">'+E(cat.search)+' ↗</a>':'';
            var row=dl+sl+lnkBtn(it.id);
            return row?'<div class="nb-l2">'+row+'</div>':'';
          })()
          +'</div>'+lnkForm(it.id);
      });
    });

    if(m.vorOrt>0){
      h+='<h3>Vor Ort<b>'+eur(S.vor?p.vor:0)+'</b></h3>'
        +'<div class="nb-card'+(S.vor?'':' off')+'"><label class="nb-tg"><input type="checkbox" data-act="vor"'+(S.vor?' checked':'')+'>'
        +'<div class="nb-tx"><div class="nb-name">Essen, Eintritte & Co.</div><div class="nb-sub">⌀ '+eur(p.perDay)+' pro Tag × '+p.nDays+' Tage</div></div>'
        +'<div class="nb-pr">'+eur(p.vor)+'</div></label></div>';
    }
    h+='<p class="nb-note">Die Preise sind die Beträge, die auf dieser Reise bezahlt wurden. Heutige Preise können abweichen. „Buchen“ öffnet den Anbieter oder die Suche mit deinen neuen Daten.</p>';
    if(admin()){
      h+='<label class="nb-own"><input type="checkbox" data-act="pub"'+(frei()?' checked':'')+'> Für Besucher freigeben (nur du siehst diesen Schalter)</label>';
    }
    var st=body.scrollTop;
    body.innerHTML=h;
    body.scrollTop=st;
    var d=p.total-p.orig,dd=Math.round(d);
    document.getElementById('nb-total').innerHTML='<small>Gesamt für deine Version</small><b>'+eur(p.total)+'</b>'
      +(dd?'<span class="nb-d '+(dd<0?'minus':'plus')+'">'+(dd<0?'−':'+')+eur(Math.abs(d))+'</span>':'');
    var f=document.getElementById('nb-f-name')||document.getElementById('nb-l-u');if(f)f.focus();
  }

  function onClick(e){
    var b=e.target.closest('[data-act]');if(!b)return;
    var a=b.getAttribute('data-act'),id=b.getAttribute('data-id'),body=document.getElementById('nb-body');
    if(a==='tg'||a==='vor'||a==='pub')return; // Checkboxen laufen über change
    var m=model(),st=m.stays.find(function(x){return x.id===id;}),ad=S.add.find(function(x){return x.id===id;});
    if(a==='minus'&&st)S.n[id]=Math.max(1,(S.n[id]||st.n0)-1);
    else if(a==='plus'&&st)S.n[id]=Math.min(60,(S.n[id]||st.n0)+1);
    else if(a==='off')S.off[id]=1;
    else if(a==='on')delete S.off[id];
    else if(a==='aminus'&&ad)ad.n=Math.max(1,ad.n-1);
    else if(a==='aplus'&&ad)ad.n=Math.min(60,ad.n+1);
    else if(a==='adel')S.add=S.add.filter(function(x){return x.id!==id;});
    else if(a==='ins'){body.setAttribute('data-form','f:'+b.getAttribute('data-after'));render();return;}
    else if(a==='lnk'){body.setAttribute('data-form','l:'+id);render();return;}
    else if(a==='ldel'){delete LINKS[id];body.removeAttribute('data-form');render();saveLinks();return;}
    else if(a==='lsave'){
      var raw=(document.getElementById('nb-l-u').value||'').trim(),u=safeURL(raw),dsc=(document.getElementById('nb-l-d').value||'').trim().slice(0,200);
      if(raw&&!u){if(typeof toast==='function')toast('Bitte den vollständigen Link mit https:// eingeben.');document.getElementById('nb-l-u').focus();return;}
      if(u||dsc)LINKS[id]={u:u,d:dsc};else delete LINKS[id];
      body.removeAttribute('data-form');render();saveLinks();return;
    }
    else if(a==='cancel'){body.removeAttribute('data-form');render();return;}
    else if(a==='save'){
      var name=(document.getElementById('nb-f-name').value||'').trim();
      if(!name){document.getElementById('nb-f-name').focus();return;}
      var after=b.closest('.nb-form').getAttribute('data-after');
      S.add.push({id:'x'+Date.now().toString(36),after:after===''?null:after,name:name.slice(0,80),
        n:Math.min(60,Math.max(1,parseInt(document.getElementById('nb-f-n').value,10)||1)),
        ppn:Math.max(0,parseFloat(String(document.getElementById('nb-f-p').value).replace(',','.'))||0)});
      body.removeAttribute('data-form');
    }
    else return;
    save();render();
  }
  function onChange(e){
    var t=e.target,a=t.getAttribute('data-act');
    if(t.id==='nb-start'){if(isISO(t.value)){S.start=t.value;save();render();}return;}
    if(a==='tg'){var id=t.getAttribute('data-id');if(t.checked)delete S.off[id];else S.off[id]=1;save();render();}
    else if(a==='vor'){S.vor=t.checked?1:0;save();render();}
    else if(a==='pub'){
      var on=t.checked;
      if(on)LINKS._frei=1;else delete LINKS._frei;
      _linksLoaded=true;
      saveLinks(on?'„Nachbuchen“ ist für Besucher freigegeben.':'„Nachbuchen“ ist für Besucher ausgeblendet.').then(function(ok){
        if(!ok){if(on)delete LINKS._frei;else LINKS._frei=1;t.checked=!on;}
        banner();
      });
    }
  }

  function close(){
    var o=document.getElementById('nb-ov');if(o)o.remove();
    _open=false;document.documentElement.style.overflow='';
    if(/^#nachbuchen/.test(location.hash||''))try{history.replaceState(null,'',location.pathname+location.search);}catch(e){}
  }
  function open(){
    css();close();
    var m=model();
    if(!S)S=load(m);
    var ov=document.createElement('div');ov.id='nb-ov';
    ov.innerHTML='<div class="nb-sh" role="dialog" aria-modal="true" aria-labelledby="nb-h">'
      +'<div class="nb-top"><div><h2 id="nb-h">Diese Reise nachbuchen</h2><p>'+E(head().title||'')+(head().title?' · ':'')+'Ändere Nächte, lass Stopps weg oder füge eigene hinzu. Die Kosten rechnen sich sofort neu.</p></div>'
      +'<button type="button" class="nb-x" aria-label="Schließen">×</button></div>'
      +'<div class="nb-body" id="nb-body"></div>'
      +'<div class="nb-foot"><div class="nb-sum" id="nb-total"></div>'
      +'<button type="button" class="nb-btn" id="nb-reset">Zurücksetzen</button>'
      +'<button type="button" class="nb-btn pri" id="nb-share">Teilen</button></div></div>';
    ov.addEventListener('click',function(e){if(e.target===ov)close();});
    document.body.appendChild(ov);
    _open=true;document.documentElement.style.overflow='hidden';
    ov.querySelector('.nb-x').onclick=close;
    var body=document.getElementById('nb-body');
    body.addEventListener('click',onClick);
    body.addEventListener('change',onChange);
    document.getElementById('nb-reset').onclick=function(){S=fresh(model());save();body.removeAttribute('data-form');render();};
    document.getElementById('nb-share').onclick=async function(){
      var url=shareURL(),t=(head().title||'Reise')+' – meine Version zum Nachbuchen';
      if(navigator.share){try{await navigator.share({title:t,url:url});return;}catch(e){if(e&&e.name==='AbortError')return;}}
      try{await navigator.clipboard.writeText(url);if(typeof toast==='function')toast('Link kopiert');}
      catch(e){prompt('Link kopieren:',url);}
    };
    render();
    loadLinks().then(function(){if(_open)render();});
  }

  // ── Karte im Kopfbereich (Startansicht) ───────────────────────────────────
  // Besucher sehen die Ansicht nur, wenn die Besitzerin sie freigegeben hat (nicht automatisch nach Reiseende)
  function visible(){
    if(!rawItems().length)return false;
    if(admin())return true;
    return frei();
  }
  function banner(){
    var hero=document.getElementById('app-hero');if(!hero)return;
    var c=document.getElementById('nb-card'),stats=hero.querySelector('.ah-stats');
    if(!stats||!visible()){if(c)c.remove();return;}
    if(c&&c.previousElementSibling===stats)return;
    if(c)c.remove();
    css();
    c=document.createElement('button');c.type='button';c.id='nb-card';
    var pre=admin()&&!frei();
    c.innerHTML='<i><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A8522F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18M9 12v2M15 12v2"/></svg></i><span><b>Diese Reise nachbuchen</b><small>'+(pre?'Nur für dich sichtbar, bis du es freigibst. ':'')+'Hotels, Flüge und Touren mit Preisen. Route anpassen, Kosten sehen.</small></span><em>Ansehen ›</em>';
    c.onclick=open;
    stats.insertAdjacentElement('afterend',c);
  }
  function init(){
    var hero=document.getElementById('app-hero');
    if(hero&&window.MutationObserver)new MutationObserver(banner).observe(hero,{childList:true});
    var tries=0,t=setInterval(function(){
      tries++;loadLinks().then(banner);
      if(/^#nachbuchen/.test(location.hash||'')&&_linksLoaded&&visible()&&!_open){clearInterval(t);open();return;}
      if(tries>40)clearInterval(t);
    },500);
  }
  window.travonaNachbuchen=open;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
