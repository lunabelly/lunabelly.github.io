'use strict';
const cfg=window.LUNA_CONFIG,sb=window.supabase.createClient(cfg.url,cfg.key);
const $=s=>document.querySelector(s);
const $$=s=>Array.prototype.slice.call(document.querySelectorAll(s));
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const PATH=location.pathname.replace(/\/+$/,'')||'/';
const slugNow=(PATH.match(/^\/p\/(.+)$/)||[])[1];
const collNow=(PATH.match(/^\/c\/(.+)$/)||[])[1];
const isWish=PATH==='/wishlist';
const isTrack=PATH==='/track';
const isGiftPage=PATH==='/gift-cards';
const SPA=slugNow||collNow||isWish||isTrack||isGiftPage;
let CUR='GBP',FREE_SHIP=5000,SHIP=395,WRAP=350,HERO=null,IG='';
const money=c=>new Intl.NumberFormat('en-GB',{style:'currency',currency:CUR}).format(c/100);
const short=c=>money(c).replace(/\.00$/,'');
const link=p=>'/p/'+encodeURIComponent(p.slug);
const load=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const isUrl=u=>String(u||'').startsWith('https://');
let products=[],reviews=[],collections=[],filter='all',sortBy='curated';
let cart=load('lb_cart',[]);if(!Array.isArray(cart))cart=[];
let wish=load('lb_wish',[]);if(!Array.isArray(wish))wish=[];
let recent=load('lb_recent',[]);if(!Array.isArray(recent))recent=[];
let promo=load('lb_promo',null);
let giftc=load('lb_gift',null);
let cartToken=load('lb_cart_token',null);
let cartEmail=load('lb_cart_email',null);

const I_HEART="<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M12 20.6 4.3 12.9a5 5 0 0 1 7.1-7l.6.6.6-.6a5 5 0 0 1 7.1 7z'/></svg>";
const I_STAR="<svg viewBox='0 0 24 24' aria-hidden='true'><path d='m12 2.8 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L2.9 9.4l6.3-.9z'/></svg>";
const I_ZOOM="<svg viewBox='0 0 24 24' aria-hidden='true'><circle cx='11' cy='11' r='7'/><path d='M16 16l5 5M8 11h6M11 8v6'/></svg>";
const I_GIFT="<svg viewBox='0 0 24 24' aria-hidden='true'><rect x='3' y='8' width='18' height='4' rx='1'/><path d='M5 12v8h14v-8M12 8v12'/><path d='M12 8S10.5 4 8.5 4a2.5 2.5 0 0 0 0 5zM12 8s1.5-4 3.5-4a2.5 2.5 0 0 1 0 5z'/></svg>";
const I_LOCK="<svg viewBox='0 0 24 24' aria-hidden='true'><rect x='4' y='10' width='16' height='10' rx='2'/><path d='M8 10V7a4 4 0 0 1 8 0v3'/></svg>";
const PH="<svg class='ph' viewBox='0 0 200 250' aria-hidden='true'><path d='M18 96 Q100 176 182 96' fill='none' stroke='currentColor' stroke-width='2' stroke-dasharray='1 6' stroke-linecap='round'/><path d='M30 84 Q100 146 170 84' fill='none' stroke='currentColor' stroke-width='1.4' stroke-dasharray='1 5' stroke-linecap='round'/><circle cx='100' cy='150' r='5' fill='currentColor'/><circle cx='100' cy='164' r='3' fill='currentColor'/><circle cx='62' cy='126' r='3' fill='currentColor'/><circle cx='138' cy='126' r='3' fill='currentColor'/></svg>";
const SKEL=new Array(8).fill("<div class='card skel' aria-hidden='true'><div class='sk sk-media'></div><div class='sk sk-line'></div><div class='sk sk-line sm'></div></div>").join('');

const shots=p=>[p.image_url].concat(Array.isArray(p.gallery)?p.gallery:[]).filter(isUrl);
/* Photos are served at the right size for the screen, as WebP. On GitHub the sizes are made when the site is built
   (img-map.js lists them); on Vercel its image optimiser makes them. A photo added since the last build, or any failure, loads the original. */
const OPT=/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\//;
const VERCEL=/\.vercel\.app$/.test(location.hostname);
const opt=(u,w)=>{if(!OPT.test(u||''))return u;const m=window.LB_IMG&&window.LB_IMG[u];if(m){const b=m.w.find(x=>x>=w)||m.w[m.w.length-1];return '/img/'+m.k+'-'+b+'.webp'}return VERCEL?'/_vercel/image?url='+encodeURIComponent(u)+'&w='+w+'&q=75':u};
const srcs=(u,ws,sz)=>OPT.test(u||'')?` srcset='${esc(ws.map(w=>opt(u,w)+' '+w+'w').join(', '))}' sizes='${sz}' data-orig='${esc(u)}'`:'';
const CARD_W=[384,640,828],CARD_S='(max-width: 600px) 50vw, (max-width: 1000px) 33vw, 320px',PP_W=[640,828,1080,1600],PP_S='(max-width: 860px) 100vw, 50vw';
function setImg(img,u,ws,sz){img.removeAttribute('data-fb');if(OPT.test(u||'')){img.dataset.orig=u;img.sizes=sz;img.srcset=ws.map(w=>opt(u,w)+' '+w+'w').join(', ');img.src=opt(u,ws[1]||ws[0])}else{img.removeAttribute('srcset');img.removeAttribute('data-orig');img.src=u}}
document.addEventListener('error',e=>{const t=e.target;if(t&&t.tagName==='IMG'&&t.dataset.orig&&!t.dataset.fb){t.dataset.fb='1';t.removeAttribute('srcset');t.src=t.dataset.orig}},true);
window.lbOpt={opt,srcs,setImg,CARD_W,CARD_S};
const art=(p,eager)=>isUrl(p.image_url)?`<img src='${esc(opt(p.image_url,640))}'${srcs(p.image_url,CARD_W,CARD_S)} alt='${esc(p.name)} worn at the waist' ${eager?'':"loading='lazy' "}decoding='async'>`:PH;
const priceHtml=p=>money(p.price_cents)+(p.compare_at_cents>p.price_cents?` <s>${money(p.compare_at_cents)}</s>`:'');
const byId=id=>products.find(x=>x.id===id);
const stars=(n,label)=>`<span class='stars' role='img' aria-label='${esc(label||(Math.round(n*10)/10)+' out of 5')}'>`+[1,2,3,4,5].map(i=>`<span class='rstar${i<=Math.round(n)?' on':''}'>${I_STAR}</span>`).join('')+`</span>`;
function rated(id){const r=reviews.filter(x=>x.product_id===id);if(!r.length)return null;return{n:r.length,avg:r.reduce((s,x)=>s+x.rating,0)/r.length,list:r}}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2200)}
function setMeta(sel,attr,v){const e=document.querySelector(sel);if(e)e.setAttribute(attr,v)}
function setHero(url){if(!isUrl(url))return;const box=document.querySelector('.hero-art');if(!box)return;const img=document.createElement('img');img.fetchPriority='high';setImg(img,url,[640,828,1080,1600],PP_S);img.alt='A Luna Belly waist chain worn over a saree';Object.assign(img.style,{width:'100%',height:'100%',objectFit:'cover',borderRadius:'inherit',display:'block'});box.style.overflow='hidden';box.textContent='';box.appendChild(img)}
function loadHero(){if(isUrl(HERO)){setHero(HERO);return}const f=products.find(p=>p.featured&&isUrl(p.image_url))||products.find(p=>isUrl(p.image_url));if(f)setHero(f.image_url)}

/* ---------- wishlist ---------- */
const inWish=id=>wish.indexOf(id)>=0;
function heartBtn(p){const on=inWish(p.id);return `<button class='heart${on?' on':''}' data-wish='${esc(p.id)}' aria-pressed='${on}' aria-label='${on?'Remove':'Save'} ${esc(p.name)} ${on?'from':'to'} your wishlist' title='${on?'Saved':'Save for later'}'>${I_HEART}</button>`}
function toggleWish(id){const i=wish.indexOf(id);const p=byId(id);if(i>=0){wish.splice(i,1);toast((p?p.name:'Item')+' removed from wishlist')}else{wish.push(id);toast((p?p.name:'Item')+' saved to wishlist')}save('lb_wish',wish);paintWish()}
function paintWish(){const n=wish.filter(byId).length;const b=$('#wishCount');if(b){b.textContent=n;b.parentElement.classList.toggle('has',n>0)}
$$('[data-wish]').forEach(el=>{const on=inWish(el.dataset.wish);el.classList.toggle('on',on);el.setAttribute('aria-pressed',on)});
if(isWish)renderWish()}

/* ---------- cards ---------- */
function card(p,eager){const sale=p.compare_at_cents>p.price_cents,r=rated(p.id);
const alt=(Array.isArray(p.gallery)?p.gallery:[]).filter(isUrl)[0];
return `<article class='card'><div class='card-media-wrap'><a class='card-media' href='${link(p)}'>${art(p,eager)}${alt?`<img class='alt' src='${esc(opt(alt,640))}'${srcs(alt,CARD_W,CARD_S)} alt='' loading='lazy' decoding='async'>`:''}${!p.in_stock?`<span class='badge dark'>Sold out</span>`:sale?`<span class='badge'>Sale</span>`:p.stock_qty!=null&&p.stock_qty<=3?`<span class='badge soft'>Only ${esc(p.stock_qty)} left</span>`:''}</a>${heartBtn(p)}</div><div class='card-body'><h3><a href='${link(p)}'>${esc(p.name)}</a></h3>${r?`<p class='rate'>${stars(r.avg)}<span>(${r.n})</span></p>`:''}<p class='price'>${priceHtml(p)}</p><button class='btn btn-line' data-add='${esc(p.id)}' ${p.in_stock?'':'disabled'}>${p.in_stock?'Add to cart':'Sold out'}</button></div></article>`}
function sortList(l){const a=l.slice();
if(sortBy==='new')a.sort((x,y)=>new Date(y.created_at||0)-new Date(x.created_at||0));
else if(sortBy==='low')a.sort((x,y)=>x.price_cents-y.price_cents);
else if(sortBy==='high')a.sort((x,y)=>y.price_cents-x.price_cents);
return a}
function renderGrid(){const list=sortList(products.filter(p=>filter==='all'||(p.tags||[]).includes(filter)));
$('#grid').innerHTML=list.length?list.map((p,i)=>card(p,i<4)).join(''):`<div class='empty'><p>Nothing in this edit yet.</p><button class='btn btn-line' data-filter='all'>Show everything</button></div>`;paintWish()}
function strip(title,list,id){if(!list.length)return '';return `<section class='more' id='${id}'><p class='eyebrow'>${esc(title)}</p><div class='grid'>${list.map(p=>card(p)).join('')}</div></section>`}

/* ---------- data ---------- */
async function loadSettings(){const r=await sb.from('site_settings').select('key,value');if(r.error||!r.data)return;const s={};r.data.forEach(x=>{s[x.key]=x.value});
if(/^[A-Z]{3}$/.test(s.currency||''))CUR=s.currency;if(/^\d+$/.test(s.shipping_cents||''))SHIP=+s.shipping_cents;if(/^\d+$/.test(s.free_shipping_cents||''))FREE_SHIP=+s.free_shipping_cents;if(/^\d+$/.test(s.wrap_cents||''))WRAP=+s.wrap_cents;
HERO=s.hero_image_url||null;IG=(s.instagram||'').replace(/^@/,'').trim();
$$('[data-free]').forEach(e=>{e.textContent=short(FREE_SHIP)});
$$('[data-ship]').forEach(e=>{e.textContent=short(SHIP)});
$$('[data-wrap]').forEach(e=>{e.textContent=short(WRAP)});
if(IG)$$('[data-ig]').forEach(e=>{e.href='https://instagram.com/'+encodeURIComponent(IG);e.hidden=false;e.textContent='@'+IG})}
async function loadAll(){
const [,pr,rv,cl]=await Promise.all([loadSettings(),sb.from('products').select('*').order('sort_order'),sb.from('reviews').select('product_id,author,rating,title,body,created_at,is_sample').eq('status','approved').order('created_at',{ascending:false}),sb.from('collections').select('*').eq('active',true).order('sort_order')]);
collections=cl.error?[]:(cl.data||[]);
if(pr.error){const msg=`<div class='empty'><p>We could not load the collection. Please refresh the page.</p></div>`;$('#grid').innerHTML=msg;$('#productPage').innerHTML=msg;$('#wishPage').innerHTML=msg;return}
products=pr.data||[];reviews=rv.error?[]:(rv.data||[]);
renderGrid();renderCart();loadHero();paintWish();
if(slugNow)showProduct();
else if(collNow)renderColl();
else if(isWish)renderWish();
else if(isTrack)renderTrack();
else if(isGiftPage)renderGiftPage();
else{renderColls();renderPicks();renderRecent('#homeRecent',null)}}

/* ---------- product page ---------- */
function specRows(p){const rows=[];
if(p.material)rows.push(['Materials',esc(p.material)]);
if(p.dimensions)rows.push(['Dimensions',esc(p.dimensions)]);
if(p.weight_g)rows.push(['Weight',esc(p.weight_g)+' g']);
rows.push(['Adjustability',p.adjust_min_cm&&p.adjust_max_cm?`Fits a waist of ${esc(p.adjust_min_cm)}–${esc(p.adjust_max_cm)} cm with the extender chain. <a href='/size-guide'>Size guide</a>`:`Adjustable extender chain. <a href='/size-guide'>Size guide</a>`]);
rows.push(['Metals','Base metal and plating are listed above. Plated finishes wear with time and can darken with moisture, perfume and friction. If you react to metals, read <a href="/care#allergy">what these pieces are made of</a> before ordering.']);
if(p.care)rows.push(['Care',esc(p.care)]);
rows.push(['Delivery',`<span data-ship>${short(SHIP)}</span>, free over <span data-free>${short(FREE_SHIP)}</span>. Boxed in a cotton pouch. <a href='/returns'>Delivery and returns</a>`]);
return `<dl class='specs'>`+rows.map(r=>`<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join('')+`</dl>`}

function reviewBlock(p){const r=rated(p.id);
const list=r?r.list.map(x=>`<li class='rev'><div class='rev-top'>${stars(x.rating,x.rating+' out of 5')}<strong>${esc(x.author)}</strong><time datetime='${esc(x.created_at)}'>${new Date(x.created_at).toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</time></div>${x.title?`<h4>${esc(x.title)}</h4>`:''}<p>${esc(x.body)}</p>${x.is_sample?`<p class='sample'>Sample review, written to demonstrate the layout. Not from a real customer.</p>`:''}</li>`).join(''):'';
return `<section class='reviews' id='reviews'><div class='rev-head'><h2>Reviews</h2>${r?`<p class='rate big'>${stars(r.avg)}<span>${(Math.round(r.avg*10)/10)} out of 5 · ${r.n} review${r.n===1?'':'s'}</span></p>`:`<p class='note'>No reviews yet. Be the first to write one.</p>`}</div>
${list?`<ul class='rev-list'>${list}</ul>`:''}
<details class='rev-form'><summary>Write a review</summary>
<form id='reviewForm' data-product='${esc(p.id)}'>
<fieldset class='rate-pick'><legend>Your rating</legend>${[5,4,3,2,1].map(i=>`<label><input type='radio' name='rating' value='${i}' required><span>${i} star${i===1?'':'s'}</span></label>`).join('')}</fieldset>
<label>Your name<input name='author' required maxlength='60' autocomplete='name'></label>
<label>Headline (optional)<input name='title' maxlength='80'></label>
<label>Your review<textarea name='body' rows='4' required maxlength='2000'></textarea></label>
<input class='hp' name='website' tabindex='-1' autocomplete='off' aria-hidden='true'>
<button class='btn btn-solid'>Submit review</button>
<p id='revMsg' role='status'></p>
<p class='note'>Reviews are published after we check them. We only publish reviews from real customers.</p>
</form></details></section>`}

function showProduct(){const box=$('#productPage'),back=`<a class='back' href='/#shop'>← All pieces</a>`;
let slug=slugNow;try{slug=decodeURIComponent(slugNow)}catch(e){}
const p=products.find(x=>x.slug===slug);
if(!p){document.title='Piece not found | Luna Belly';box.innerHTML=back+`<div class='empty mid'><h1>This piece is no longer available</h1><p>It may have sold out or been renamed.</p><a class='btn btn-solid' href='/#shop'>Browse the collection</a></div>`;return}
const imgs=shots(p),r=rated(p.id);
const low=p.in_stock&&p.stock_qty!=null&&p.stock_qty<=3;
const related=products.filter(x=>x.id!==p.id&&x.in_stock);
const tags=(p.tags||[]);
const sameTag=related.filter(x=>(x.tags||[]).some(t=>tags.indexOf(t)>=0));
const picks=(sameTag.concat(related.filter(x=>sameTag.indexOf(x)<0))).slice(0,4);
box.innerHTML=back+`<div class='pp'>
<div class='pp-gallery'>
<div class='pp-media${imgs.length?' has':''}'>${imgs.length?`<img id='ppMain' src='${esc(opt(imgs[0],828))}'${srcs(imgs[0],PP_W,PP_S)} alt='${esc(p.name)} worn at the waist' fetchpriority='high' decoding='async'>`:PH}${imgs.length?`<button class='zoom-btn' data-zoom='0' aria-label='Zoom into ${esc(p.name)}'>${I_ZOOM}<span>Zoom</span></button>`:''}</div>
${imgs.length>1?`<div class='thumbs' role='group' aria-label='More photographs'>${imgs.map((u,i)=>`<button class='thumb${i?'':' on'}' data-shot='${i}' aria-label='Photograph ${i+1} of ${imgs.length}'><img src='${esc(opt(u,256))}'${srcs(u,[256],'80px')} alt='' loading='lazy' decoding='async'></button>`).join('')}</div>`:''}
</div>
<div class='pp-info'>
<p class='eyebrow'>${esc(tags.slice(0,2).join(' · '))}</p>
<h1>${esc(p.name)}</h1>
${r?`<a class='rate' href='#reviews'>${stars(r.avg)}<span>${r.n} review${r.n===1?'':'s'}</span></a>`:''}
<p class='price'>${priceHtml(p)}</p>
<p class='lede sm'>${esc(p.description)}</p>
${(p.labels||[]).length?`<ul class='labels'>${(p.labels||[]).map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:''}
<p class='avail ${p.in_stock?'yes':'no'}'>${p.in_stock?(low?`Only ${esc(p.stock_qty)} left in stock`:'In stock, ready to post'):'Sold out'}</p>
<div class='pp-buy'><button class='btn btn-solid' data-add='${esc(p.id)}' ${p.in_stock?'':'disabled'}>${p.in_stock?'Add to cart':'Sold out'}</button>${heartBtn(p)}</div>
${specRows(p)}
</div></div>`+reviewBlock(p)+strip('You may also like',picks,'related')+`<div id='ppRecent'></div>`;
pushRecent(p.slug);renderRecent('#ppRecent',p.slug);paintWish();
const url=location.origin+link(p),desc=String(p.description||'').slice(0,155);
document.title=p.name+' | Luna Belly';
setMeta("meta[name='description']",'content',desc);setMeta("link[rel='canonical']",'href',url);
setMeta("meta[property='og:title']",'content',document.title);setMeta("meta[property='og:description']",'content',desc);
setMeta("meta[property='og:url']",'content',url);if(imgs.length)setMeta("meta[property='og:image']",'content',imgs[0]);
const ld=document.createElement('script');ld.type='application/ld+json';
if(!document.querySelector('script[data-ssr]'))ld.textContent=JSON.stringify({'@context':'https://schema.org','@type':'Product',name:p.name,description:p.description||'',image:imgs.length?imgs:undefined,sku:p.slug,material:p.material||undefined,weight:p.weight_g?{'@type':'QuantitativeValue',value:p.weight_g,unitCode:'GRM'}:undefined,brand:{'@type':'Brand',name:'Luna Belly'},
aggregateRating:r?{'@type':'AggregateRating',ratingValue:(Math.round(r.avg*10)/10),reviewCount:r.n}:undefined,
offers:{'@type':'Offer',url:url,priceCurrency:CUR,price:(p.price_cents/100).toFixed(2),availability:'https://schema.org/'+(p.in_stock?'InStock':'OutOfStock')}});
if(ld.textContent)document.head.appendChild(ld);window.dispatchEvent(new Event('resize'))}

/* ---------- recently viewed + wishlist page ---------- */
function pushRecent(slug){recent=[slug].concat(recent.filter(s=>s!==slug)).slice(0,8);save('lb_recent',recent)}
function renderRecent(sel,skip){const box=$(sel);if(!box)return;
const list=recent.filter(s=>s!==skip).map(s=>products.find(p=>p.slug===s)).filter(Boolean).slice(0,4);
box.innerHTML=list.length?strip('Recently viewed',list,'recent'):'';paintWish()}
function renderWish(){const box=$('#wishPage');if(!box)return;
const list=wish.map(byId).filter(Boolean);
box.innerHTML=`<p class='eyebrow'>Saved pieces</p><h1>Your wishlist</h1>`+(list.length?`<div class='grid'>${list.map(p=>card(p)).join('')}</div>`:`<div class='empty mid'><p>You have not saved anything yet. Tap the heart on a piece to keep it here.</p><a class='btn btn-solid' href='/#shop'>Browse the collection</a></div>`);
document.title='Your wishlist | Luna Belly';$$('[data-wish]').forEach(el=>{el.classList.toggle('on',inWish(el.dataset.wish));el.setAttribute('aria-pressed',inWish(el.dataset.wish))})}

function picked(){const seen=recent.map(s=>products.find(p=>p.slug===s)).filter(Boolean);
const basis=seen.concat(wish.map(byId).filter(Boolean));
if(!basis.length)return [];
const weight={};basis.forEach(p=>(p.tags||[]).forEach(t=>{weight[t]=(weight[t]||0)+1}));
const seenIds={};basis.forEach(p=>{seenIds[p.id]=1});
const scored=products.filter(p=>p.in_stock&&!seenIds[p.id]).map(p=>({p,s:(p.tags||[]).reduce((n,t)=>n+(weight[t]||0),0)})).filter(x=>x.s>0);
scored.sort((a,b)=>b.s-a.s);return scored.slice(0,4).map(x=>x.p)}
function renderPicks(){const box=$('#homePicks');if(!box)return;const l=picked();box.innerHTML=l.length?strip('Picked for you',l,'picks'):'';paintWish()}

function renderColls(){const box=$('#homeColls');if(!box||!collections.length)return;
box.innerHTML=`<p class='eyebrow'>Collections</p><div class='colls'>${collections.map(c=>{
const n=(c.product_ids||[]).filter(id=>byId(id)).length;
return `<a class='coll' href='/c/${encodeURIComponent(c.slug)}'><h3>${esc(c.name)}</h3><p>${esc(c.blurb||'')}</p><span>${n} piece${n===1?'':'s'}</span></a>`}).join('')}</div>`}

function renderColl(){const box=$('#collPage');if(!box)return;
let slug=collNow;try{slug=decodeURIComponent(collNow)}catch(e){}
const c=collections.find(x=>x.slug===slug);
if(!c){document.title='Collection not found | Luna Belly';box.innerHTML=`<a class='back' href='/#shop'>← All pieces</a><div class='empty mid'><h1>That collection has moved</h1><a class='btn btn-solid' href='/#shop'>Browse everything</a></div>`;return}
const list=(c.product_ids||[]).map(byId).filter(Boolean);
document.title=c.name+' | Luna Belly';
setMeta("meta[name='description']",'content',String(c.blurb||'').slice(0,155));
setMeta("link[rel='canonical']",'href',location.origin+'/c/'+encodeURIComponent(c.slug));
box.innerHTML=`<a class='back' href='/#shop'>← All pieces</a><p class='eyebrow'>Collection</p><h1>${esc(c.name)}</h1><p class='lede'>${esc(c.blurb||'')}</p>`+
(list.length?`<div class='grid'>${list.map(p=>card(p)).join('')}</div>`:`<div class='empty mid'><p>Nothing in this collection yet.</p><a class='btn btn-solid' href='/#shop'>Browse everything</a></div>`);
paintWish()}

function trackSteps(status){const order=['pending','confirmed','shipped','delivered'];
const copy={pending:['Order placed','We have received your order and will email you to confirm it.'],
confirmed:['Payment confirmed','Your payment has been received and your order is booked in.'],
shipped:['Dispatched','Your parcel is on its way from Birmingham.'],
delivered:['Delivered','Your Luna Belly order has arrived. We hope you love it.']};
if(status==='cancelled')return `<p class='avail no'>This order was cancelled. If that is unexpected, message us in the chat.</p>`;
const at=order.indexOf(status);
return `<ol class='track'>${order.map((s,i)=>`<li class='${i<at?'done':i===at?'now':''}'><strong>${copy[s][0]}</strong><span>${copy[s][1]}</span></li>`).join('')}</ol>
<p class='note'>We add tracking numbers by email once a parcel is dispatched.</p>`}

function renderTrack(){const box=$('#trackPage');if(!box)return;
document.title='Track your order | Luna Belly';
const q=new URLSearchParams(location.search);
box.innerHTML=`<a class='back' href='/#shop'>← All pieces</a><p class='eyebrow'>Your order</p><h1>Track your order</h1>
<p class='lede sm'>Enter the order number from your confirmation, the one beginning LB, and the email you ordered with.</p>
<form id='trackForm' class='setf'><label>Order number<input name='o' required placeholder='LB-XXXXXXXX' value='${esc(q.get('o')||'')}'></label>
<label>Email<input name='e' type='email' required autocomplete='email' value='${esc(q.get('e')||'')}'></label>
<button class='btn btn-solid'>Find my order</button><p id='trackMsg' role='status'></p></form><div id='trackOut'></div>`;
if(q.get('o')&&q.get('e'))doTrack(q.get('o'),q.get('e'))}

async function doTrack(num,email){const msg=$('#trackMsg'),out=$('#trackOut');msg.textContent='Looking…';
const r=await sb.rpc('track_order',{p_number:num,p_email:email});
if(r.error||!r.data||!r.data.ok){msg.textContent='We could not find an order with that number and email. Check both, or message us in the chat.';out.innerHTML='';return}
const o=r.data;msg.textContent='';
const m=c=>new Intl.NumberFormat('en-GB',{style:'currency',currency:o.currency||'GBP'}).format(c/100);
out.innerHTML=`<div class='trackbox'><h2>${esc(o.order_number)}</h2>
<p class='note'>Placed ${new Date(o.placed_at).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})} · delivering to ${esc(o.city)}, ${esc(o.country)}</p>
<ul class='sumlines'>${(o.items||[]).map(i=>`<li><span>${esc(i.name)} × ${esc(i.qty)}</span><span>${m(i.price_cents*i.qty)}</span></li>`).join('')}</ul>
<div class='sum total'><span>Total</span><strong>${m(o.total_cents)}</strong></div>
${trackSteps(o.status)}</div>`}

function renderGiftPage(){const box=$('#giftPage');if(!box)return;
document.title='Gift cards | Luna Belly';
setMeta("meta[name='description']",'content','Luna Belly gift cards: choose an amount, we send the card, they choose the piece.');
setMeta("link[rel='canonical']",'href',location.origin+'/gift-cards');
box.innerHTML=`<a class='back' href='/#shop'>← All pieces</a><p class='eyebrow'>Gift cards</p><h1>Let them choose</h1>
<p class='lede sm'>A waist chain is a personal thing, and sizing and style are easier chosen by the wearer. A gift card takes that worry away.</p>
<div class='giftgrid'>
<div class='giftcard'>${I_GIFT}<h3>How it works</h3><ol><li>Message us in the chat with the amount you want and who it is for.</li><li>We email you the card, or send it straight to them on the date you choose.</li><li>They enter the number in their cart and the balance comes off the total.</li></ol></div>
<div class='giftcard'><h3>Good to know</h3><ul><li>Any amount from ${short(2500)} upwards.</li><li>Valid for 12 months from the day it is issued.</li><li>Spend it over several orders. Whatever is left stays on the card.</li><li>Not exchangeable for cash, and we cannot replace a card number that is lost.</li></ul></div>
</div>
<h2>Check a balance</h2>
<form id='balForm' class='setf'><label>Gift card number<input name='code' required placeholder='LB-GIFT-XXXXXXXX'></label><button class='btn btn-solid'>Check balance</button><p id='balMsg' role='status'></p></form>
<p class='note'><a href='/?chat=1'>Open the chat</a> to buy one, or see <a href='/c/gifts'>the gifts collection</a> if you would rather choose the piece yourself.</p>`}

document.addEventListener('submit',async e=>{
if(e.target.id==='trackForm'){e.preventDefault();const d=new FormData(e.target);doTrack(String(d.get('o')),String(d.get('e')))}
else if(e.target.id==='balForm'){e.preventDefault();const msg=$('#balMsg');msg.textContent='Checking…';
const r=await sb.rpc('check_gift_card',{p_code:String(new FormData(e.target).get('code'))});
msg.textContent=(r.error||!r.data)?'We could not check that just now.':r.data.ok?'That card has '+money(r.data.balance_cents)+' left on it.':r.data.reason}});

/* ---------- cart ---------- */
function wrapOn(){const el=$('#wrapChk');return !!(el&&el.checked)}
function totals(){const lines=cart.map(l=>({qty:l.qty,p:byId(l.id)})).filter(l=>l.p);
const sub=lines.reduce((n,l)=>n+l.qty*l.p.price_cents,0);
const count=lines.reduce((n,l)=>n+l.qty,0);
let disc=0;if(promo&&promo.code){disc=promo.kind==='percent'?Math.floor(sub*promo.value/100):Math.min(promo.value,sub)}
disc=Math.min(disc,sub);
const after=sub-disc;
let ship=count===0||after>=FREE_SHIP?0:SHIP;
const wrap=count&&wrapOn()?WRAP:0;
const before=after+ship+wrap;
const gift=giftc&&giftc.code?Math.min(giftc.balance_cents,before):0;
return{lines,sub,count,disc,ship,wrap,gift,total:before-gift}}
function renderCart(){const t=totals();
$('#cartCount').textContent=t.count;$('.cart-btn').classList.toggle('has',t.count>0);
$('#cartItems').innerHTML=t.lines.length?t.lines.map(l=>`<div class='line'><a class='line-media' href='${link(l.p)}'>${art(l.p)}</a><div class='line-info'><h4><a href='${link(l.p)}'>${esc(l.p.name)}</a></h4><p class='price'>${money(l.p.price_cents)}</p><div class='qty'><button data-dec='${esc(l.p.id)}' aria-label='One fewer ${esc(l.p.name)}'>−</button><span aria-label='Quantity'>${l.qty}</span><button data-inc='${esc(l.p.id)}' aria-label='One more ${esc(l.p.name)}'>+</button><button class='link' data-remove='${esc(l.p.id)}'>Remove</button></div></div></div>`).join(''):`<div class='empty mid cartempty'><svg viewBox='0 0 120 120' aria-hidden='true'><path d='M12 46 Q60 104 108 46' fill='none' stroke='currentColor' stroke-width='2' stroke-dasharray='1 7' stroke-linecap='round'/><circle cx='60' cy='79' r='6' fill='currentColor'/><circle cx='60' cy='92' r='3.5' fill='currentColor'/><circle cx='33' cy='64' r='3.5' fill='currentColor'/><circle cx='87' cy='64' r='3.5' fill='currentColor'/></svg><p>Your cart is empty.</p><button class='btn btn-line' data-action='cart-close'>Keep browsing</button><a class='link' href='/c/gifts'>Or see the gifts collection</a></div>`;
const left=FREE_SHIP-(t.sub-t.disc);
$('#shipNote').textContent=t.count===0?'Free delivery on orders over '+short(FREE_SHIP):left>0?'Add '+money(left)+' more for free delivery':'You have free delivery';
$('#shipBar').style.width=Math.min(100,Math.round((t.sub-t.disc)/FREE_SHIP*100))+'%';
$('#cartSubtotal').textContent=money(t.sub);
$('#cartDiscount').hidden=!t.disc;$('#cartDiscountVal').textContent='−'+money(t.disc);
$('#cartGift').hidden=!t.gift;$('#cartGiftVal').textContent='−'+money(t.gift);
$('#cartGiftName').textContent=giftc&&giftc.code?giftc.code:'';
$('#giftInput').value=giftc&&giftc.code?giftc.code:'';
$('#cartDiscountName').textContent=promo&&promo.code?promo.code:'';
$('#checkoutBtn').disabled=t.count===0;
$('#promoInput').value=promo&&promo.code?promo.code:'';
$('#sumLines').innerHTML=t.lines.map(l=>`<li><span>${esc(l.p.name)} × ${l.qty}</span><span>${money(l.qty*l.p.price_cents)}</span></li>`).join('')+(t.disc?`<li class='disc'><span>Discount ${esc(promo.code)}</span><span>−${money(t.disc)}</span></li>`:'');
$('#sumShip').textContent=t.ship?money(t.ship):'Free';
$('#sumWrap').hidden=!t.wrap;$('#sumWrapVal').textContent=money(t.wrap);
$('#sumGift').hidden=!t.gift;$('#sumGiftVal').textContent='−'+money(t.gift);
$('#sumTotal').textContent=money(t.total)}
function addToCart(id){const line=cart.find(l=>l.id===id);if(line)line.qty=Math.min(line.qty+1,20);else cart.push({id,qty:1});save('lb_cart',cart);renderCart();queueCart();const p=byId(id);toast((p?p.name:'Item')+' added to cart')}
function changeQty(id,d){const line=cart.find(l=>l.id===id);if(!line)return;line.qty=Math.min(line.qty+d,20);if(line.qty<=0)cart=cart.filter(l=>l.id!==id);save('lb_cart',cart);renderCart();queueCart()}
const cartOpen=open=>{$('#cart').classList.toggle('open',open);$('#scrim').classList.toggle('open',open);document.body.classList.toggle('locked',open);if(open)$('#cart').focus()};

/* ---------- abandoned cart capture ----------
We only keep a cart once the shopper has given us their email, at checkout or by
subscribing. Saving again later updates the same row, which resets the timer, so an
active shopper is never chased. Placing an order marks the row recovered server-side. */
const emailOk=e=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e||''));
async function keepCart(email){
const who=String(email||cartEmail||'').trim().toLowerCase();
if(!emailOk(who))return;
const t=totals();
if(!t.count)return;
try{const r=await sb.rpc('save_cart',{p_token:cartToken,p_email:who,
p_items:t.lines.map(l=>({id:l.p.id,name:l.p.name,price_cents:l.p.price_cents,qty:l.qty})),
p_total:t.total});
if(!r.error&&r.data){cartToken=r.data;cartEmail=who;save('lb_cart_token',cartToken);save('lb_cart_email',who)}}catch(e){}}
let cartTimer=null;
function queueCart(){if(!cartEmail)return;clearTimeout(cartTimer);cartTimer=setTimeout(()=>keepCart(),2000)}

$('#giftForm').addEventListener('submit',async e=>{e.preventDefault();
const code=$('#giftInput').value.trim().toUpperCase(),msg=$('#giftMsg');
if(!code){giftc=null;save('lb_gift',null);msg.textContent='';renderCart();return}
msg.textContent='Checking…';
const r=await sb.rpc('check_gift_card',{p_code:code});
if(r.error||!r.data||!r.data.ok){giftc=null;save('lb_gift',null);msg.textContent=(r.data&&r.data.reason)||'That gift card number was not recognised.';renderCart();return}
giftc={code:r.data.code,balance_cents:r.data.balance_cents};save('lb_gift',giftc);
msg.textContent=money(giftc.balance_cents)+' balance applied.';renderCart()});

$('#promoForm').addEventListener('submit',async e=>{e.preventDefault();
const code=$('#promoInput').value.trim().toUpperCase(),msg=$('#promoMsg');
if(!code){promo=null;save('lb_promo',null);msg.textContent='';renderCart();return}
msg.textContent='Checking…';
const r=await sb.rpc('check_discount',{p_code:code,p_subtotal:totals().sub});
if(r.error||!r.data||!r.data.ok){promo=null;save('lb_promo',null);msg.textContent=(r.data&&r.data.reason)||'That code is not valid.';renderCart();return}
const d=r.data;promo={code:d.code,kind:/%/.test(d.label)?'percent':'amount',value:/%/.test(d.label)?parseInt(d.label,10):d.amount_cents};
save('lb_promo',promo);msg.textContent=d.label.charAt(0).toUpperCase()+d.label.slice(1)+' applied.';renderCart()});

/* ---------- checkout ---------- */
function openCheckout(){cartOpen(false);$('#checkoutView').hidden=false;$('#thanksView').hidden=true;$('#checkoutError').textContent='';$('#checkoutDlg').showModal()}
$('#checkoutForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('#placeOrder');btn.disabled=true;btn.textContent='Placing order…';
const body=Object.fromEntries(new FormData(e.target));
if(promo&&promo.code)body.discount=promo.code;
if(giftc&&giftc.code)body.gift=giftc.code;
const r=await sb.rpc('checkout',{p_customer:body,p_items:cart.map(l=>({id:l.id,qty:l.qty}))});
btn.disabled=false;btn.textContent='Place order';
if(r.error){const m=r.error.message||'';
$('#checkoutError').textContent=/rate limit/.test(m)?'Too many orders in a short time. Please wait a few minutes and try again.':/unavailable/.test(m)?'Sorry, one of your items has just sold out. Please update your cart and try again.':'We could not place your order. Please check your details and try again.';return}
const t=totals(),d=r.data||{};
$('#thanksLines').innerHTML=t.lines.map(l=>`<li><span>${esc(l.p.name)} × ${l.qty}</span><span>${money(l.qty*l.p.price_cents)}</span></li>`).join('');
$('#thanksTotal').textContent=money(t.total);
$('#thanksEmail').textContent=body.email||'';
$('#thanksPoints').hidden=!d.points_earned;
$('#thanksPoints').textContent=d.points_earned?`You earned ${d.points_earned} Luna point${d.points_earned===1?'':'s'}. You now have ${d.points_total}, which puts you at ${d.tier} level.`:'';
$('#thanksGift').hidden=!d.gift_cents;
$('#thanksGift').textContent=d.gift_cents?`${money(d.gift_cents)} was taken from your gift card${d.gift_balance?`, leaving ${money(d.gift_balance)} on it`:', using the last of its balance'}.`:'';
$('#thanksTrack').href='/track?o='+encodeURIComponent(d.order_number||'')+'&e='+encodeURIComponent(body.email||'');
cart=[];promo=null;giftc=null;save('lb_cart',cart);save('lb_promo',null);save('lb_gift',null);
cartToken=null;cartEmail=null;save('lb_cart_token',null);save('lb_cart_email',null);
renderCart();e.target.reset();
$('#orderNo').textContent=d.order_number||'';$('#checkoutView').hidden=true;$('#thanksView').hidden=false;$('#thanksView').scrollIntoView({block:'start'})});

/* ---------- reviews + newsletter ---------- */
document.addEventListener('submit',async e=>{
if(e.target.id==='reviewForm'){e.preventDefault();const f=e.target,d=new FormData(f),msg=$('#revMsg');
if(d.get('website')){msg.textContent='Thank you, your review has been sent for checking.';f.reset();return}
msg.textContent='Sending…';
const r=await sb.from('reviews').insert({product_id:f.dataset.product,author:String(d.get('author')).trim(),rating:+d.get('rating'),title:String(d.get('title')||'').trim()||null,body:String(d.get('body')).trim()});
msg.textContent=r.error?(/rate limit/.test(r.error.message||'')?'You have sent several reviews already. Please try again later.':'That did not send. Please try again.'):'Thank you. Your review will appear once we have checked it.';
if(!r.error)f.reset()}});
$('#newsForm').addEventListener('submit',async e=>{e.preventDefault();
if(e.target.website&&e.target.website.value){$('#newsMsg').textContent='You are on the list. Thank you.';e.target.reset();return}
const email=e.target.email.value.trim().toLowerCase();const r=await sb.from('subscribers').insert({email});
const ok=!r.error||r.error.code==='23505';
if(ok){$('#newsMsg').innerHTML=`<span class='newsdone'><strong>You are on the list.</strong> Use <code>WELCOME10</code> for 10% off your first order. <button type='button' class='link' id='copyCode'>Copy code</button></span>`;keepCart(email);e.target.reset()}
else $('#newsMsg').textContent='That did not work. Please check the address and try again.'});
document.addEventListener('click',e=>{if(e.target&&e.target.id==='copyCode'){const b=e.target;
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText('WELCOME10').then(()=>{b.textContent='Copied'},()=>{b.textContent='Press and hold to copy'})}
else b.textContent='Press and hold to copy'}});

/* ---------- chat ---------- */
let chatToken=load('lb_chat',null),chatSeen=load('lb_chat_seen',0),chatIsOpen=false,chatCount=-1;
function paintChat(rows){const log=$('#chatLog');log.innerHTML=`<div class='msg them'>Hi, welcome to Luna Belly. Ask us anything about sizing, orders or styling and we will reply right here.</div>`+rows.map(m=>`<div class='msg ${m.sender==='admin'?'them':'me'}'>${esc(m.body)}</div>`).join('');log.scrollTop=log.scrollHeight}
async function chatRefresh(){if(!chatToken)return;const r=await sb.rpc('chat_history',{p_token:chatToken});if(r.error||!r.data)return;const data=r.data,last=data[data.length-1];
if(chatIsOpen){if(data.length!==chatCount)paintChat(data);chatSeen=data.length;save('lb_chat_seen',chatSeen);$('#chatDot').hidden=true}else{$('#chatDot').hidden=!(data.length>chatSeen&&last&&last.sender==='admin')}
chatCount=data.length}
function chatOpen(open){chatIsOpen=open;$('#chat').classList.toggle('open',open);$('#chatName').hidden=!!chatToken;if(open){chatCount=-1;if(chatToken)chatRefresh();else paintChat([]);$('#chatInput').focus()}}
async function chatSend(text,retry){if(!chatToken){const name=$('#chatName').value.trim()||null;const s=await sb.rpc('chat_start',{p_name:name,p_email:null});if(s.error||!s.data)return false;chatToken=s.data;save('lb_chat',chatToken);$('#chatName').hidden=true}
const r=await sb.rpc('chat_send',{p_token:chatToken,p_body:text});
if(r.error){if(!retry&&/invalid token/.test(r.error.message||'')){chatToken=null;save('lb_chat',null);return chatSend(text,true)}return false}return true}
$('#chatForm').addEventListener('submit',async e=>{e.preventDefault();const input=$('#chatInput'),text=input.value.trim();if(!text)return;input.disabled=true;const ok=await chatSend(text);input.disabled=false;
if(ok){input.value='';await chatRefresh()}else toast('Message not sent. Please try again in a moment.');input.focus()});
setInterval(()=>{if(chatIsOpen)chatRefresh()},5000);
setInterval(()=>{if(!chatIsOpen)chatRefresh()},30000);

/* ---------- zoom lightbox ---------- */
let lbShots=[],lbAt=0,lbZoom=false;
function lb(){let el=$('#lightbox');if(el)return el;
el=document.createElement('div');el.id='lightbox';el.hidden=true;el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Photograph');
el.innerHTML=`<button class='lb-x' data-lb='close' aria-label='Close'>×</button><button class='lb-nav prev' data-lb='prev' aria-label='Previous photograph'>‹</button><div class='lb-stage' id='lbStage'><img id='lbImg' alt=''></div><button class='lb-nav next' data-lb='next' aria-label='Next photograph'>›</button><p class='lb-hint' id='lbHint'></p>`;
document.body.appendChild(el);return el}
function lbOpen(imgs,i,name){lbShots=imgs;lbAt=i||0;const el=lb();el.hidden=false;document.body.classList.add('locked');lbPaint(name);el.querySelector('.lb-x').focus()}
function lbPaint(name){const el=lb(),img=$('#lbImg');setImg(img,lbShots[lbAt],[1080,1600],'100vw');img.alt=(name||'Photograph')+', enlarged';
lbZoom=false;img.classList.remove('z');img.style.transformOrigin='center';
$('#lbHint').textContent=lbShots.length>1?`${lbAt+1} of ${lbShots.length} · tap the photo to zoom`:'Tap the photo to zoom';
el.querySelectorAll('.lb-nav').forEach(b=>{b.hidden=lbShots.length<2})}
function lbClose(){const el=$('#lightbox');if(!el)return;el.hidden=true;document.body.classList.remove('locked')}
function lbMove(d){if(lbShots.length<2)return;lbAt=(lbAt+d+lbShots.length)%lbShots.length;lbPaint()}
function lbZoomAt(e){const img=$('#lbImg'),r=img.getBoundingClientRect();
const pt=e.touches&&e.touches[0]?e.touches[0]:e;
const x=Math.min(100,Math.max(0,(pt.clientX-r.left)/r.width*100));
const y=Math.min(100,Math.max(0,(pt.clientY-r.top)/r.height*100));
img.style.transformOrigin=x+'% '+y+'%'}
document.addEventListener('click',e=>{const t=e.target.closest('[data-lb]');if(!t)return;
const a=t.dataset.lb;if(a==='close')lbClose();else if(a==='prev')lbMove(-1);else if(a==='next')lbMove(1)});
document.addEventListener('click',e=>{const st=e.target.closest('#lbStage');if(!st)return;
const img=$('#lbImg');if(e.target!==img){lbClose();return}
lbZoom=!lbZoom;lbZoomAt(e);img.classList.toggle('z',lbZoom)});
document.addEventListener('mousemove',e=>{if(lbZoom&&e.target&&e.target.id==='lbImg')lbZoomAt(e)});
document.addEventListener('touchmove',e=>{if(lbZoom&&e.target&&e.target.id==='lbImg'){lbZoomAt(e);e.preventDefault()}},{passive:false});

/* ---------- events ---------- */
document.addEventListener('click',e=>{
const t=e.target.closest('[data-add],[data-filter],[data-inc],[data-dec],[data-remove],[data-close],[data-action],[data-wish],[data-shot],[data-zoom]');
if(!t)return;const d=t.dataset;
if(d.add!==undefined)addToCart(d.add);
else if(d.wish!==undefined)toggleWish(d.wish);
else if(d.shot!==undefined){const p=products.find(x=>x.slug===(()=>{try{return decodeURIComponent(slugNow)}catch(e){return slugNow}})());
const imgs=p?shots(p):[];const i=+d.shot;const main=$('#ppMain');if(main&&imgs[i]){setImg(main,imgs[i],PP_W,PP_S);$$('.thumb').forEach(b=>b.classList.toggle('on',b===t));$('.zoom-btn').dataset.zoom=i}}
else if(d.zoom!==undefined){const p=products.find(x=>x.slug===(()=>{try{return decodeURIComponent(slugNow)}catch(e){return slugNow}})());
if(p)lbOpen(shots(p),+d.zoom,p.name)}
else if(d.inc!==undefined)changeQty(d.inc,1);
else if(d.dec!==undefined)changeQty(d.dec,-1);
else if(d.remove!==undefined)changeQty(d.remove,-99);
else if(d.close!==undefined)t.closest('dialog').close();
else if(d.filter!==undefined){filter=d.filter;$$('.chip').forEach(b=>{const on=b.dataset.filter===filter;b.classList.toggle('on',on);b.setAttribute('aria-pressed',on)});renderGrid()}
else if(d.action==='cart-open')cartOpen(true);
else if(d.action==='cart-close')cartOpen(false);
else if(d.action==='checkout')openCheckout();
else if(d.action==='chat-toggle')chatOpen(!chatIsOpen);
else if(d.action==='chat-open'){e.preventDefault();chatOpen(true)}
else if(d.action==='menu'){const nav=$('#nav'),open=!nav.classList.contains('open');nav.classList.toggle('open',open);t.setAttribute('aria-expanded',open)}});
$$('dialog').forEach(dlg=>dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()}));
$('#nav').addEventListener('click',e=>{if(e.target.tagName==='A'){$('#nav').classList.remove('open');$('.menu-btn').setAttribute('aria-expanded','false')}});
document.addEventListener('keydown',e=>{
if(e.key!=='Escape')return;
const el=$('#lightbox');if(el&&!el.hidden){lbClose();return}
cartOpen(false);if(chatIsOpen)chatOpen(false)});
document.addEventListener('keydown',e=>{const el=$('#lightbox');if(!el||el.hidden)return;
if(e.key==='ArrowLeft')lbMove(-1);else if(e.key==='ArrowRight')lbMove(1)});

const BAR=[()=>`Free delivery on orders over <span data-free>${short(FREE_SHIP)}</span>`,
()=>'Handcrafted in small batches in Birmingham',
()=>`Gift wrapping and a handwritten card for ${short(WRAP)}`,
()=>'10% off your first order with the code WELCOME10'];
let barAt=0;
function barTick(){const el=$('#barMsg');if(!el)return;barAt=(barAt+1)%BAR.length;
el.classList.remove('in');setTimeout(()=>{el.innerHTML=BAR[barAt]();el.classList.add('in')},420)}
if(!matchMedia('(prefers-reduced-motion: reduce)').matches)setInterval(barTick,6000);
const toTop=$('#toTop');
if(toTop){addEventListener('scroll',()=>{toTop.hidden=window.scrollY<700},{passive:true});
toTop.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}))}
const sortSel=$('#sortSel');
if(sortSel)sortSel.addEventListener('change',()=>{sortBy=sortSel.value;renderGrid()});
document.addEventListener('change',e=>{const el=e.target;
if(el&&el.name==='email'&&el.form&&el.form.id==='checkoutForm')keepCart(el.value)});
$('#year').textContent=new Date().getFullYear();
if(/(^|[?&])chat=1/.test(location.search))setTimeout(()=>chatOpen(true),400);
document.addEventListener('change',e=>{if(e.target.id==='wrapChk'){$('#giftFields').hidden=!e.target.checked&&!$('#isGift').checked;renderCart()}
else if(e.target.id==='isGift'){$('#giftFields').hidden=!e.target.checked;if(!e.target.checked&&$('#wrapChk'))$('#wrapChk').checked=false;renderCart()}});
if(SPA){$('#home').hidden=true;
if(slugNow){$('#productPage').hidden=false;$('#productPage').innerHTML=`<div class='pp'><div class='sk sk-big'></div><div class='pp-info'><div class='sk sk-line'></div><div class='sk sk-line sm'></div><div class='sk sk-line'></div></div></div>`}
else if(collNow)$('#collPage').hidden=false;
else if(isWish)$('#wishPage').hidden=false;
else if(isTrack)$('#trackPage').hidden=false;
else if(isGiftPage)$('#giftPage').hidden=false}
else $('#grid').innerHTML=SKEL;
renderCart();loadAll();chatRefresh();
