// Travona – KI-Tagesbericht aus den Fotos des Tages: Die KI sieht bis zu 10 Fotos, kennt Ort, Unterkunft und
// Ausflüge des Tages (und optionale Stichpunkte) und schreibt daraus einen Tagebucheintrag in Wir-Form.
// Nutzt nur, was reisevorlage.html bzw. australien.html schon bereitstellen (photos, sbLoadPhotos, aiAuthHeaders …).
(function(){
  var MAX_FOTOS=10;

  function fotosFuerTag(iso){
    var all=(typeof photos!=='undefined'&&photos[iso])||[];
    // Ausgeblendete Fotos nicht an die KI geben
    if(typeof window.isHiddenPhoto==='function')all=all.filter(function(u){return !window.isHiddenPhoto(iso,u);});
    if(all.length<=MAX_FOTOS)return all.slice();
    // gleichmäßig über den Tag verteilt auswählen
    var out=[],step=all.length/MAX_FOTOS;
    for(var i=0;i<MAX_FOTOS;i++)out.push(all[Math.floor(i*step)]);
    return out;
  }
  function tagesInfos(iso){
    var z=[];
    try{
      var st=typeof stayForDay==='function'?stayForDay(iso):null;
      if(st&&st.label)z.push('Unterkunft: '+st.label);
      var list=typeof costs!=='undefined'&&Array.isArray(costs)?costs:[];
      list.forEach(function(c){
        if(c.datum!==iso||c.cat==='Unterkunft')return;
        z.push((c.cat==='Ausflug'?'Ausflug: ':(c.cat==='Flug'?'Flug: ':'Unterwegs: '))+String(c.label||'').replace(/^[^\wÄÖÜäöü]+/,''));
      });
    }catch(e){}
    return z.slice(0,6);
  }
  function datumText(iso){
    try{return new Date(iso+'T12:00:00').toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});}catch(e){return iso;}
  }

  // o: {iso, ort, titel, kat, notizen, reise}
  async function schreibe(o){
    if(!o||!/^\d{4}-\d{2}-\d{2}$/.test(o.iso||''))throw new Error('Bitte zuerst ein Datum wählen.');
    if(typeof photos!=='undefined'&&!Array.isArray(photos[o.iso])&&typeof sbLoadPhotos==='function'){
      try{photos[o.iso]=await sbLoadPhotos(o.iso);}catch(e){}
    }
    var urls=fotosFuerTag(o.iso);
    if(!urls.length)throw new Error('Für diesen Tag gibt es noch keine Fotos. Lade zuerst Fotos hoch oder schreib Stichpunkte.');
    if(typeof window.tvCapImageB64!=='function')throw new Error('Fotos können gerade nicht gelesen werden. Bitte die Seite neu laden.');
    var bilder=[];
    for(var i=0;i<urls.length;i++){
      try{bilder.push(await window.tvCapImageB64(urls[i]));}catch(e){}
    }
    if(!bilder.length)throw new Error('Die Fotos konnten nicht geladen werden.');

    var st=(typeof AI_STYLES!=='undefined'&&typeof getAiStyle==='function'&&AI_STYLES[getAiStyle()])||{};
    var regeln=typeof AI_NO_HYPE!=='undefined'?AI_NO_HYPE:'';
    var infos=tagesInfos(o.iso);
    var prompt='Du hilfst beim Schreiben eines privaten Reisetagebuchs. Oben siehst du '+bilder.length+(bilder.length===1?' Foto':' Fotos')+' von einem Reisetag. '
      +'Schreibe daraus einen Tagebucheintrag auf Deutsch in Wir-Form, 80 bis 160 Wörter. '+(st.diary||'')+'\n\n'+regeln+'\n\n'
      +'Beschreibe, was auf den Fotos zu sehen ist, und verbinde es zu einem Tagesablauf. Erfinde keine Erlebnisse, Gespräche, Gefühle, Namen oder Uhrzeiten, die weder auf den Fotos noch in den Angaben stehen. '
      +'Nenne keine Personen mit Namen.\n\n'
      +'Datum: '+datumText(o.iso)+'\n'
      +(o.reise?'Reise: '+o.reise+'\n':'')
      +(o.ort?'Ort: '+o.ort+'\n':'')
      +(o.titel?'Titel: '+o.titel+'\n':'')
      +(o.kat?'Kategorie: '+o.kat+'\n':'')
      +(infos.length?infos.join('\n')+'\n':'')
      +(o.notizen?'Eigene Stichpunkte (haben Vorrang vor den Fotos):\n'+o.notizen+'\n':'')
      +'\nGib nur den Text des Eintrags aus, ohne Überschrift und ohne Erklärung.';
    var content=bilder.map(function(b){return {type:'image',source:{type:'base64',media_type:'image/jpeg',data:b}};});
    content.push({type:'text',text:prompt});
    var headers=await aiAuthHeaders();
    var r=await fetch(AI_PROXY_URL,{method:'POST',headers:headers,body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,messages:[{role:'user',content:content}]})});
    var d=await r.json();
    if(d.error)throw new Error((typeof d.error==='string'?d.error:d.error.message)||'KI-Fehler');
    var t=(d.content||[]).map(function(c){return c.text||'';}).join('').trim();
    if(!t)throw new Error('Keine Antwort von der KI.');
    return t;
  }
  window.travonaTagesbericht=schreibe;
})();
