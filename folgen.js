// Travona – Reisenden folgen (Community)
// 1) Auf öffentlichen Reisen (reisevorlage.html, australien.html) erscheint oben ein Knopf „Folgen“.
//    Nicht angemeldet: Wunsch merken, zur Anmeldung, danach zurück zur Reise und automatisch folgen.
// 2) In „Meine Reisen“ zeigt TvFolgen.meineReisen() die öffentlichen Reisen aller Gefolgten.
// Daten: Tabelle folgen (follower, followed), jede:r sieht nur die eigene Liste. Siehe supabase/migrations/20261011_folgen.sql
(function(){
  var PENDING='tv_folgen_wunsch';
  function E(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function client(){return (typeof sb!=='undefined'&&sb)?sb:null;}
  function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function lsSet(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);}catch(e){}}

  function css(){
    if(document.getElementById('tv-folgen-css'))return;
    var s=document.createElement('style');s.id='tv-folgen-css';
    s.textContent=''
      +'.tvf-wrap{margin-top:18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}'
      +'.tvf-btn{font:600 13px/1 "DM Sans",Inter,sans-serif;padding:10px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.85);background:rgba(255,255,255,.92);color:#1A1714;cursor:pointer}'
      +'.tvf-btn.on{background:transparent;color:#fff}'
      +'.tvf-btn:disabled{opacity:.6;cursor:default}'
      +'.tvf-who{font-size:13px;color:rgba(255,255,255,.8)}'
      +'html.is-admin .tvf-wrap{display:none}'
      +'.tvf-sec{margin-top:46px}'
      +'.tvf-meta{font-size:.82rem;color:var(--fog,#6B6560);margin:4px 0 16px}'
      +'.tvf-person{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:22px 0 10px}'
      +'.tvf-person b{font-family:"Playfair Display",serif;font-weight:400;font-size:1.15rem}'
      +'.tvf-un{font:500 12px "DM Sans",sans-serif;background:none;border:1px solid var(--line,#D8D0C4);border-radius:999px;padding:6px 12px;cursor:pointer;color:var(--fog,#6B6560)}'
      +'.tvf-empty{background:#fff;border-radius:14px;padding:22px;color:var(--fog,#6B6560);font-size:.9rem;line-height:1.6}'
      +'.tvf-empty a{color:var(--terra,#B5714A)}';
    document.head.appendChild(s);
  }

  async function name(id){
    var c=client();if(!c)return '';
    try{var r=await c.from('profiles').select('display_name').eq('id',id).limit(1);return (r.data&&r.data[0]&&r.data[0].display_name)||'';}catch(e){return '';}
  }
  async function folgeIch(id){
    var c=client();
    var r=await c.from('folgen').select('followed').eq('followed',id).limit(1);
    return !!(r.data&&r.data.length);
  }
  async function folgen(id){
    var r=await client().from('folgen').insert({followed:id});
    if(r.error&&r.error.code!=='23505')throw r.error; // 23505 = folgt schon
  }
  async function entfolgen(id){
    var r=await client().from('folgen').delete().eq('followed',id);
    if(r.error)throw r.error;
  }

  // ── 1) Knopf auf einer öffentlichen Reise ─────────────────────────────────
  function warteAufReise(cb){
    var n=0;
    (function tick(){
      var bereit=typeof _qxAuthDone!=='undefined'&&_qxAuthDone;
      if(bereit)return cb();
      if(++n<100)setTimeout(tick,200);
    })();
  }
  function reiseKnopf(){
    warteAufReise(async function(){
      try{
        if(typeof tripVisibility==='undefined'||tripVisibility!=='public')return;
        if(typeof tripOwner==='undefined'||!tripOwner)return;
        var me=(typeof currentUser!=='undefined'&&currentUser)?currentUser.id:null;
        if(me===tripOwner)return;
        var sub=document.getElementById('hero-sub')||document.querySelector('.figma-hero-sub');
        if(!sub||document.getElementById('tvf-wrap'))return;
        css();
        var wer=await name(tripOwner)||'diese:n Reisende:n';
        var wrap=document.createElement('div');wrap.className='tvf-wrap';wrap.id='tvf-wrap';
        wrap.innerHTML='<button type="button" class="tvf-btn" id="tvf-btn"></button><span class="tvf-who">'+E(wer)+'</span>';
        sub.parentNode.insertBefore(wrap,sub.nextSibling);
        var btn=document.getElementById('tvf-btn');
        var an=false;
        function zeig(){btn.textContent=an?'✓ Du folgst':'＋ Folgen';btn.classList.toggle('on',an);btn.setAttribute('aria-pressed',an?'true':'false');}
        if(me){
          an=await folgeIch(tripOwner);
          // Nach der Anmeldung den gemerkten Wunsch erfüllen
          if(!an&&lsGet(PENDING)===tripOwner){try{await folgen(tripOwner);an=true;}catch(e){}}
          lsSet(PENDING,null);
        }
        zeig();
        btn.onclick=async function(){
          if(!me){
            lsSet(PENDING,tripOwner);
            location.href='/meine-reisen.html?weiter='+encodeURIComponent(location.pathname+location.search);
            return;
          }
          btn.disabled=true;
          try{if(an)await entfolgen(tripOwner);else await folgen(tripOwner);an=!an;}
          catch(e){alert('Das hat nicht geklappt. Bitte versuche es nochmal.');}
          btn.disabled=false;zeig();
        };
      }catch(e){console.error('Folgen:',e);}
    });
  }

  // ── 2) „Meine Reisen“: Reisen der Gefolgten ───────────────────────────────
  function reiseLink(r){
    if(r.id==='australien-2026')return '/australien.html';
    if(r.land_slug&&r.slug)return '/reisetagebuch/'+r.land_slug+'/'+r.slug;
    return '/reisevorlage.html?reise='+encodeURIComponent(r.id);
  }
  function karte(r){
    var m={};try{m=JSON.parse(r.title||'{}')||{};}catch(e){m={name:r.title||'Reise'};}
    var img=/^https:\/\//i.test(m.img||'')?m.img:'';
    var cover=img?'<img src="'+E(img)+'" alt=""><div class="trip-cover-grad"></div>'
      :'<div class="trip-cover-fallback" style="background:linear-gradient(140deg,#2C5F6A,#1e434b)"><span class="big">'+E(m.emoji||'🌍')+'</span></div>';
    return '<a class="trip-card" href="'+E(reiseLink(r))+'"><div class="trip-cover">'+cover+'</div><div class="trip-body">'
      +'<div class="trip-name">'+E(m.name||'Reise')+'</div>'
      +(m.loc?'<div class="trip-loc">'+E(m.loc)+'</div>':'')
      +'<div class="trip-note">'+E(m.note||'')+'</div>'
      +'<div class="trip-foot"><span class="trip-open">Tagebuch öffnen →</span></div></div></a>';
  }
  async function meineReisen(anker){
    var c=client();if(!c||!anker)return;
    css();
    var sec=document.getElementById('tvf-sec');
    if(!sec){sec=document.createElement('section');sec.id='tvf-sec';sec.className='tvf-sec';anker.parentNode.insertBefore(sec,anker.nextSibling);}
    try{
      var f=await c.from('folgen').select('followed,created_at').order('created_at',{ascending:false});
      var ids=(f.data||[]).map(function(x){return x.followed;});
      var anz=0;try{var a=await c.rpc('meine_follower');anz=a.data||0;}catch(e){}
      var head='<div class="section-title">Reisende, denen du folgst</div>'
        +'<div class="tvf-meta">'+(anz===1?'1 Person folgt dir':anz+' Personen folgen dir')+'</div>';
      if(!ids.length){
        sec.innerHTML=head+'<div class="tvf-empty">Du folgst noch niemandem. Öffne eine öffentliche Reise unter <a href="/">Entdecken</a> und tippe oben auf „＋ Folgen“. Dann siehst du hier alle ihre öffentlichen Reisen.</div>';
        return;
      }
      var t=await c.from('trips').select('id,owner,title,land_slug,slug,created_at').in('owner',ids).eq('visibility','public').order('created_at',{ascending:false});
      var p=await c.from('profiles').select('id,display_name').in('id',ids);
      var namen={};(p.data||[]).forEach(function(x){namen[x.id]=x.display_name||'';});
      var html=head;
      ids.forEach(function(id){
        var rs=(t.data||[]).filter(function(r){return r.owner===id;});
        html+='<div class="tvf-person"><b>'+E(namen[id]||'Reisende:r')+'</b><button type="button" class="tvf-un" data-id="'+E(id)+'">Nicht mehr folgen</button></div>'
          +(rs.length?'<div class="trips-grid">'+rs.map(karte).join('')+'</div>':'<div class="tvf-empty">Gerade keine öffentlichen Reisen.</div>');
      });
      sec.innerHTML=html;
      sec.querySelectorAll('.tvf-un').forEach(function(b){
        b.onclick=async function(){
          b.disabled=true;
          try{await entfolgen(b.getAttribute('data-id'));meineReisen(anker);}catch(e){b.disabled=false;alert('Das hat nicht geklappt. Bitte versuche es nochmal.');}
        };
      });
    }catch(e){console.error('Folgen:',e);sec.innerHTML='';}
  }

  window.TvFolgen={meineReisen:meineReisen};
  if(document.getElementById('hero-sub')||document.querySelector('.figma-hero-sub')){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',reiseKnopf);else reiseKnopf();
  }
})();
