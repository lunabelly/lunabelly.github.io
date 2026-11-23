'use strict';
(function(){
if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
const r=(a,b)=>a+Math.random()*(b-a),sg=()=>Math.random()<.5?-1:1;
const sky=document.createElement('div');sky.id='sky';sky.setAttribute('aria-hidden','true');document.body.appendChild(sky);
const BH=800;let W=0,H=0,zone=120;
function star(band,side,px,py){
const k=Math.random(),type=k>.88?'big':k>.45?'':k>.17?'dot':'pl';
const s=type==='big'?r(18,34):type===''?r(8,16):type==='dot'?r(2.5,5):r(4,7);
let mv='',mx=0,my=0,md=r(6,14);
if(side){const m=Math.random()*(px===undefined?1:.76);
if(m<.24){mv='mA';my=r(30,90)*sg()}
else if(m<.44){mv='mA';mx=r(14,40)*sg()}
else if(m<.6){mv='mA';mx=r(12,34)*sg();my=r(20,70)*sg()}
else if(m<.76){mv='mO';mx=r(12,32)*sg();my=r(16,44)*sg();md=r(9,18)}
else if(m<.9){mv='mR';my=-r(140,300);mx=r(-22,22);md=r(7,15)}
else{mv='mR';my=r(140,300);mx=r(-22,22);md=r(8,16)}}
const d=Math.pow(Math.random(),1.5)*zone;
const x=px!==undefined?px:side===1?d:side===2?W-d-s:r(zone,Math.max(zone+1,W-zone-s));
const y=py!==undefined?py:r(16+Math.max(0,-my),BH-16-s-Math.max(0,my));
const el=document.createElement('div');el.className='st'+(type?' '+type:'')+(mv?' '+mv:'');
el.style.cssText='left:'+x.toFixed(1)+'px;top:'+y.toFixed(1)+'px;width:'+s.toFixed(1)+'px;height:'+s.toFixed(1)+'px;--d:'+r(1.8,5.5).toFixed(2)+'s;--l:'+(-r(0,14)).toFixed(2)+'s;--md:'+md.toFixed(1)+'s;--mx:'+mx.toFixed(0)+'px;--my:'+my.toFixed(0)+'px';
el.appendChild(document.createElement('i'));band.appendChild(el);
}
function build(){
sky.textContent='';
W=document.documentElement.clientWidth;H=document.documentElement.scrollHeight;
const mobile=W<760,g=document.getElementById('grid'),gut=g?Math.max(0,g.getBoundingClientRect().left):24;
zone=mobile?Math.max(gut+26,48):Math.min(Math.max(gut+36,110),W*.24);
const sideN=Math.round((mobile?72:180)*BH/1000),midN=Math.round((mobile?4:10)*BH/1000);
for(let y=0;y<H;y+=BH){
const b=document.createElement('div');b.className='band';b.style.top=y+'px';
for(let i=0;i<sideN;i++)star(b,1+i%2);
for(let i=0;i<midN;i++)star(b,0);
sky.appendChild(b);
}
hero(mobile);
}
function hero(mobile){
const h=document.querySelector('.hero'),inn=h&&h.querySelector('.hero-in'),txt=inn&&inn.firstElementChild;
if(!txt)return;
const hr=h.getBoundingClientRect(),art=h.querySelector('.hero-art'),ar=art?art.getBoundingClientRect():null,boxes=[],rg=document.createRange();
for(const c of txt.children){
if(getComputedStyle(c).display.indexOf('inline')===0)boxes.push(c.getBoundingClientRect());
else{rg.selectNodeContents(c);for(const q of rg.getClientRects())boxes.push(q)}
}
if(!boxes.length||hr.height<80)return;
const b=document.createElement('div');b.className='band';b.style.top=(hr.top+scrollY)+'px';b.style.height=hr.height+'px';
const want=mobile?30:80,P=7;let n=0;
for(let t=0;t<6000&&n<want;t++){
const x=r(hr.left+6,hr.right-40),y=r(hr.top+10,hr.bottom-44);
if(ar&&x>ar.left-30&&x<ar.right&&y>ar.top-30&&y<ar.bottom)continue;
let dist=1e9;
for(const q of boxes){const dx=Math.max(q.left-P-x-30,0,x-q.right-P),dy=Math.max(q.top-P-y-30,0,y-q.bottom-P);dist=Math.min(dist,Math.hypot(dx,dy))}
if(dist===0||Math.random()>Math.exp(-dist/150))continue;
star(b,3,x-hr.left,y-hr.top);n++;
}
sky.appendChild(b);
}
let rt;
function check(){const w=document.documentElement.clientWidth,h=document.documentElement.scrollHeight;if(w!==W||Math.abs(h-H)>200)build()}
addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(check,300)});
const grid=document.getElementById('grid');
if(grid){new MutationObserver(function(){clearTimeout(rt);rt=setTimeout(check,400)}).observe(grid,{childList:true})}
addEventListener('load',function(){setTimeout(build,300)});
build();
function shoot(){
const left=Math.random()<.5,e=document.createElement('div'),inset=r(6,Math.max(10,zone-24));
e.className='shoot';
e.style.cssText='left:'+((left?inset:W-inset)-55).toFixed(0)+'px;top:'+(scrollY+r(40,innerHeight*.55)).toFixed(0)+'px;--rot:'+(left?r(72,86):r(94,108)).toFixed(0)+'deg;--tx:'+((left?1:-1)*r(20,70)).toFixed(0)+'px;--ty:'+r(300,460).toFixed(0)+'px';
sky.appendChild(e);setTimeout(function(){e.remove()},1700);setTimeout(shoot,r(1800,4500));
}
setTimeout(shoot,1500);
})();
