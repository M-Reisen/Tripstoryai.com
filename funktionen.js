// Travona – animierte Funktionen nur abspielen, solange sie im Bild sind (spart Akku)
(function(){
  if(!('IntersectionObserver' in window)) return;
  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){ e.target.classList.toggle('fx-off',!e.isIntersecting); });
  },{rootMargin:'60px'});
  document.querySelectorAll('.fx-scene').forEach(function(s){ s.classList.add('fx-off'); io.observe(s); });
})();
