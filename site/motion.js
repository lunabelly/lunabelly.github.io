'use strict';
(function(){
const sel='.sec>.eyebrow,.sec>h2,.filters,.story .wrap>*,.feats>div,.faq details,.news .wrap>*,footer .foot';
document.querySelectorAll(sel).forEach((el,i)=>{el.classList.add('reveal');el.style.transitionDelay=(i%4)*50+'ms'});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -40px 0px'});
const watch=()=>document.querySelectorAll('.reveal:not(.in)').forEach(el=>io.observe(el));watch();
const grid=document.getElementById('grid');
if(grid){new MutationObserver(()=>{grid.querySelectorAll('.card:not(.reveal)').forEach((c,i)=>{c.classList.add('reveal');c.style.transitionDelay=(i%4)*60+'ms'});watch()}).observe(grid,{childList:true})}
const count=document.getElementById('cartCount');
if(count){new MutationObserver(()=>{count.classList.remove('bump');void count.offsetWidth;count.classList.add('bump');setTimeout(()=>count.classList.remove('bump'),300)}).observe(count,{childList:true,characterData:true,subtree:true})}
})();
