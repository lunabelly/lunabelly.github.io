'use strict';
// Gives product, collection and journal pages their own title, description, link preview and
// Google structured data in the HTML itself, so search engines and WhatsApp/Instagram/Facebook
// previews see the right page without running the shop's scripts. It also puts the page's own
// text (the piece, the collection, the article) into the body, so crawlers that do not run
// scripts (ChatGPT search, Perplexity and others) read the same words a visitor sees. The shop's
// own scripts then draw the page exactly as before, replacing this copy.
// Public data only (the same the shop already reads with its publishable key). Any failure
// serves the plain shop page, so a visitor never sees an error because of this file.
const fs = require('fs');
const path = require('path');

const read = (f) => {
  for (const p of [path.join(process.cwd(), f), path.join(__dirname, '..', f)]) {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) { /* try next */ }
  }
  return '';
};
const SHELL = read('index.html');
const CFG = (() => {
  const c = read('config.js');
  return { url: (c.match(/url:'([^']+)'/) || [])[1], key: (c.match(/key:'([^']+)'/) || [])[1] };
})();
const SITE = ((SHELL.match(/rel='canonical' href='(https:\/\/[^/']+)/) || [])[1]) || 'https://luna-belly.vercel.app';
const STORE_IMG = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\//;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const opt = (u, w) => (STORE_IMG.test(u) ? SITE + '/_vercel/image?url=' + encodeURIComponent(u) + '&w=' + w + '&q=75' : u);
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

async function q(table, query) {
  const r = await fetch(CFG.url + '/rest/v1/' + table + '?' + query, {
    headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key, Accept: 'application/json' },
    signal: AbortSignal.timeout(3500),
  });
  if (!r.ok) throw new Error(table + ' ' + r.status);
  return r.json();
}

const money = (c, cur) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).format(c / 100).replace(/\.00$/, '');
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
const BACK = "<a class='back' href='/#shop'>← All pieces</a>";
async function shopSettings() {
  const rows = await q('site_settings', 'select=key,value&key=in.(currency,shipping_cents,free_shipping_cents)').catch(() => []);
  const g = (k) => (rows.find((r) => r.key === k) || {}).value;
  return { cur: /^[A-Z]{3}$/.test(g('currency') || '') ? g('currency') : 'GBP',
    ship: /^\d+$/.test(g('shipping_cents') || '') ? +g('shipping_cents') : 395,
    free: /^\d+$/.test(g('free_shipping_cents') || '') ? +g('free_shipping_cents') : 5000 };
}
const card = (p, cur) => "<article class='card'><div class='card-media-wrap'><a class='card-media' href='/p/" + encodeURIComponent(p.slug) + "'>" +
  (p.image_url ? "<img src='" + esc(opt(p.image_url, 640).replace(SITE, '')) + "' alt='" + esc(p.name) + "' loading='lazy' decoding='async'>" : '') +
  "</a></div><div class='card-body'><h3><a href='/p/" + encodeURIComponent(p.slug) + "'>" + esc(p.name) + "</a></h3><p class='price'>" +
  money(p.price_cents, cur) + '</p></div></article>';

function crumbs(list) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: list.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1] })) };
}

// Replaces the head tags of the shop page with the ones for this page.
function render(m) {
  let h = SHELL;
  const url = SITE + m.path;
  const title = m.title + ' | Luna Belly';
  const set = (re, val) => { h = h.replace(re, () => val); }; // a function, so '$' in shop text is never read as a pattern
  set(/<title>[^<]*<\/title>/, '<title>' + esc(title) + '</title>');
  set(/<meta name='description' content='[^']*'>/, "<meta name='description' content='" + esc(m.desc) + "'>");
  set(/<link rel='canonical' href='[^']*'>/, "<link rel='canonical' href='" + esc(url) + "'>");
  set(/<meta property='og:type' content='[^']*'>/, "<meta property='og:type' content='" + (m.ogType || 'website') + "'>");
  set(/<meta property='og:title' content='[^']*'>/, "<meta property='og:title' content='" + esc(title) + "'>");
  set(/<meta property='og:description' content='[^']*'>/, "<meta property='og:description' content='" + esc(m.desc) + "'>");
  set(/<meta property='og:url' content='[^']*'>/, "<meta property='og:url' content='" + esc(url) + "'>");
  if (m.image) set(/<meta property='og:image' content='[^']*'>/, "<meta property='og:image' content='" + esc(opt(m.image, 1080)) + "'>" +
    (m.imageAlt ? "\n<meta property='og:image:alt' content='" + esc(m.imageAlt) + "'>" : ''));
  set(/<script type='application\/ld\+json'>[\s\S]*?<\/script>/, (m.ld || []).map((o) => "<script type='application/ld+json' data-ssr>" + json(o) + '</script>').join('\n'));
  let extra = "<meta name='twitter:title' content='" + esc(title) + "'>\n<meta name='twitter:description' content='" + esc(m.desc) + "'>";
  if (m.noindex) extra += "\n<meta name='robots' content='noindex'>";
  if (m.price) extra += "\n<meta property='product:price:amount' content='" + m.price + "'>\n<meta property='product:price:currency' content='" + m.currency + "'>";
  if (m.preload) extra += "\n<link rel='preload' as='image' href='" + esc(opt(m.preload, 828).replace(SITE, '')) + "' imagesrcset='" +
    esc([640, 828, 1080, 1600].map((w) => opt(m.preload, w).replace(SITE, '') + ' ' + w + 'w').join(', ')) + "' imagesizes='(max-width: 860px) 100vw, 50vw' fetchpriority='high'>";
  set(/<\/head>/, extra + '\n</head>');
  if (m.body && m.box) {
    set("<div id='home'>", "<div id='home' hidden>");
    set("<div id='" + m.box + "' class='wrap sec' hidden></div>", "<div id='" + m.box + "' class='wrap sec'>" + m.body + '</div>');
  }
  return h;
}

async function product(slug) {
  const rows = await q('products', 'select=id,slug,name,description,price_cents,compare_at_cents,image_url,gallery,material,dimensions,weight_g,adjust_min_cm,adjust_max_cm,care,in_stock,stock_qty,category,tags,labels&slug=eq.' + encodeURIComponent(slug) + '&limit=1');
  const p = rows[0];
  if (!p) return { status: 404, title: 'Piece not found', desc: 'This piece is no longer available.', path: '/p/' + encodeURIComponent(slug), noindex: true };
  // Only genuine reviews: approved and not a demo sample.
  const [revs, st] = await Promise.all([
    q('reviews', 'select=rating,author,title,body,created_at&status=eq.approved&is_sample=is.false&order=created_at.desc&product_id=eq.' + p.id).catch(() => []),
    shopSettings(),
  ]);
  const cur = st.cur;
  const imgs = [p.image_url].concat(Array.isArray(p.gallery) ? p.gallery : []).filter((u) => /^https:\/\//.test(u || ''));
  const pth = '/p/' + encodeURIComponent(p.slug);
  const url = SITE + pth;
  const desc = clip(p.description || (p.name + ' from Luna Belly, UK.'), 155);
  const price = (p.price_cents / 100).toFixed(2);
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.description || undefined,
    image: imgs.length ? imgs : undefined, sku: p.slug, material: p.material || undefined,
    weight: p.weight_g ? { '@type': 'QuantitativeValue', value: Number(p.weight_g), unitCode: 'GRM' } : undefined,
    brand: { '@type': 'Brand', name: 'Luna Belly' },
    offers: { '@type': 'Offer', url, priceCurrency: cur, price, itemCondition: 'https://schema.org/NewCondition',
      availability: 'https://schema.org/' + (p.in_stock ? 'InStock' : 'OutOfStock'), seller: { '@type': 'Organization', name: 'Luna Belly' } } };
  const avg = revs.length ? Math.round(revs.reduce((s, r) => s + r.rating, 0) / revs.length * 10) / 10 : 0;
  if (revs.length) {
    ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: avg, reviewCount: revs.length };
    ld.review = revs.slice(0, 10).map((r) => ({ '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
      author: { '@type': 'Person', name: r.author }, datePublished: String(r.created_at).slice(0, 10), name: r.title || undefined, reviewBody: r.body }));
  }
  // The same facts the product page shows, as plain HTML.
  const spec = [];
  if (p.material) spec.push(['Materials', esc(p.material)]);
  if (p.dimensions) spec.push(['Dimensions', esc(p.dimensions)]);
  if (p.weight_g) spec.push(['Weight', esc(p.weight_g) + ' g']);
  spec.push(['Adjustability', (p.adjust_min_cm && p.adjust_max_cm ? 'Fits a waist of ' + esc(p.adjust_min_cm) + '–' + esc(p.adjust_max_cm) + ' cm with the extender chain.' : 'Adjustable extender chain.') + " <a href='/size-guide'>Size guide</a>"]);
  if (p.care) spec.push(['Care', esc(p.care)]);
  spec.push(['Delivery', money(st.ship, cur) + ', free over ' + money(st.free, cur) + ". Boxed in a cotton pouch. <a href='/returns'>Delivery and returns</a>"]);
  const tags = p.tags || [];
  const sale = p.compare_at_cents > p.price_cents;
  const body = BACK + "<div class='pp'><div class='pp-gallery'><div class='pp-media" + (imgs.length ? " has'>" +
      "<img src='" + esc(opt(imgs[0], 828).replace(SITE, '')) + "' alt='" + esc(p.name) + " worn at the waist' fetchpriority='high' decoding='async'>" : "'>") + '</div></div>' +
    "<div class='pp-info'><p class='eyebrow'>" + esc(tags.slice(0, 2).join(' · ')) + '</p><h1>' + esc(p.name) + '</h1>' +
    (revs.length ? "<p class='rate'><span>" + avg + ' out of 5 · ' + revs.length + ' review' + (revs.length === 1 ? '' : 's') + '</span></p>' : '') +
    "<p class='price'>" + (sale ? '<s>' + money(p.compare_at_cents, cur) + '</s> ' : '') + money(p.price_cents, cur) + '</p>' +
    "<p class='lede sm'>" + esc(p.description) + '</p>' +
    ((p.labels || []).length ? "<ul class='labels'>" + p.labels.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '') +
    "<p class='avail " + (p.in_stock ? 'yes' : 'no') + "'>" + (p.in_stock ? 'In stock, ready to post' : 'Sold out') + '</p>' +
    "<dl class='specs'>" + spec.map((r) => '<div><dt>' + r[0] + '</dt><dd>' + r[1] + '</dd></div>').join('') + '</dl></div></div>' +
    (revs.length ? "<section class='reviews' id='reviews'><div class='rev-head'><h2>Reviews</h2></div><ul class='rev-list'>" + revs.slice(0, 10).map((r) =>
      "<li class='rev'><div class='rev-top'><span>" + esc(r.rating) + " out of 5</span><strong>" + esc(r.author) + '</strong></div>' + (r.title ? '<h4>' + esc(r.title) + '</h4>' : '') + '<p>' + esc(r.body) + '</p></li>').join('') + '</ul></section>' : '');
  return { title: p.name, desc, path: pth, ogType: 'product', image: imgs[0], imageAlt: p.name + ' worn at the waist', preload: imgs[0],
    price, currency: cur, box: 'productPage', body, ld: [ld, crumbs([['Home', '/'], [p.name, pth]])] };
}

async function collection(slug) {
  const rows = await q('collections', 'select=slug,name,blurb,product_ids&active=eq.true&slug=eq.' + encodeURIComponent(slug) + '&limit=1');
  const c = rows[0];
  if (!c) return { status: 404, title: 'Collection not found', desc: 'That collection has moved.', path: '/c/' + encodeURIComponent(slug), noindex: true };
  const ids = (c.product_ids || []).slice(0, 30);
  const [prods, st] = await Promise.all([
    ids.length ? q('products', 'select=id,slug,name,image_url,price_cents&id=in.(' + ids.join(',') + ')').catch(() => []) : [],
    shopSettings()]);
  const ordered = ids.map((id) => prods.find((p) => p.id === id)).filter(Boolean);
  const pth = '/c/' + encodeURIComponent(c.slug);
  return { title: c.name, desc: clip(c.blurb || (c.name + ': waist chains and kamarbandhs from Luna Belly.'), 155), path: pth,
    image: (ordered.find((p) => p.image_url) || {}).image_url, box: 'collPage',
    body: BACK + "<p class='eyebrow'>Collection</p><h1>" + esc(c.name) + "</h1><p class='lede'>" + esc(c.blurb || '') + '</p>' +
      (ordered.length ? "<div class='grid'>" + ordered.map((p) => card(p, st.cur)).join('') + '</div>' : ''),
    ld: [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: c.name, description: c.blurb || undefined, url: SITE + pth,
      mainEntity: { '@type': 'ItemList', itemListElement: ordered.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: SITE + '/p/' + encodeURIComponent(p.slug), name: p.name })) } },
      crumbs([['Home', '/'], [c.name, pth]])] };
}

async function post(slug) {
  const rows = await q('posts', 'select=slug,title,excerpt,body,cover_url,published_at,updated_at,created_at&published=eq.true&slug=eq.' + encodeURIComponent(slug) + '&limit=1');
  const p = rows[0];
  if (!p) return { status: 404, title: 'Article not found', desc: 'That article has moved.', path: '/blog/' + encodeURIComponent(slug), noindex: true };
  const pth = '/blog/' + encodeURIComponent(p.slug);
  const paras = String(p.body || '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean).map((t) => '<p>' + esc(t).replace(/\n/g, '<br>') + '</p>').join('');
  const body = "<a class='back' href='/blog'>← The Luna Journal</a><article class='post'><p class='postdate'>" + day(p.published_at || p.created_at) + '</p>' +
    '<h1>' + esc(p.title) + '</h1>' + (p.excerpt ? "<p class='lede sm'>" + esc(p.excerpt) + '</p>' : '') + "<div class='postbody'>" + paras + '</div>' +
    "<p class='postend'><a class='btn btn-line' href='/#shop'>Browse the collection</a> <a class='link' href='/kamarbandh'>Kamarbandh guide</a> <a class='link' href='/size-guide'>Size guide</a> <a class='link' href='/care'>Jewellery care</a></p></article>";
  return { title: p.title, desc: clip(p.excerpt || p.title, 155), path: pth, ogType: 'article', image: p.cover_url || undefined, box: 'pagePage', body,
    ld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.excerpt || undefined,
      datePublished: p.published_at || p.created_at, dateModified: p.updated_at || p.published_at || p.created_at,
      image: /^https:\/\//.test(p.cover_url || '') ? p.cover_url : undefined, mainEntityOfPage: SITE + pth,
      author: { '@type': 'Organization', name: 'Luna Belly' }, publisher: { '@type': 'Organization', name: 'Luna Belly' } },
    crumbs([['Home', '/'], ['The Luna Journal', '/blog'], [p.title, pth]])] };
}

async function blogList() {
  const posts = await q('posts', 'select=slug,title,excerpt,published_at&published=eq.true&order=published_at.desc');
  const head = "<p class='eyebrow'>The Luna Journal</p><h1>Notes on wearing it well</h1><p class='lede sm'>Styling, sizing and care, written by us.</p>";
  return head + "<div class='postgrid'>" + posts.map((p) => "<article class='postcard'><a href='/blog/" + encodeURIComponent(p.slug) + "'><p class='postdate'>" +
    day(p.published_at) + '</p><h2>' + esc(p.title) + '</h2><p>' + esc(p.excerpt) + "</p><span class='postmore'>Read it</span></a></article>").join('') + '</div>';
}
// Same words as the About page drawn by pages.js.
const ABOUT = "<div class='about'><p class='eyebrow'>About us</p><h1>Waist jewellery, gathered from around the world</h1>" +
  "<p class='lede'>Luna Belly is a small online shop based in Birmingham, UK. We look for one thing: beautiful chains for the waist.</p>" +
  "<div class='aboutcols'><div><h2>Why the waist</h2><p>The kamarbandh has been worn for centuries, at weddings, at festivals and on ordinary evenings. It is the piece that finishes a saree and the one that moves when you do. We think it deserves the same attention as a necklace, and far more than it usually gets.</p>" +
  '<h2>Where our pieces come from</h2><p>We do not pretend to make everything we sell. Most of our pieces come from jewellery makers and suppliers in India, Hong Kong and elsewhere. We choose each design for how it sits and how it moves, check it when it arrives, and describe it as it is: the base metal, the plating and the stones.</p>' +
  "<h2>Handmade pieces</h2><p>Some pieces are made by hand. Those carry a Handmade badge on their photo and live together in our <a href='/c/handmade'>Handmade collection</a>, so you always know which is which. Because each one is made individually, no two are exactly alike.</p></div><div>" +
  "<h2>What we promise, and what we do not</h2><p>Every product page lists the base metal and the plating. We do not claim that plated jewellery lasts forever or that nobody will ever react to it. We would rather tell you what a piece is made of and how to look after it. Our <a href='/care'>care page</a> does exactly that.</p>" +
  "<h2>Talk to us</h2><p>There is a chat on every page, and a person answers it. Ask about sizing, about a gift, or about a piece you cannot decide on. You can also find the details on our <a href='/contact'>contact page</a>.</p></div></div>" +
  "<div class='aboutstory'><h2>Our story</h2><p>Luna Belly began with a simple observation: the kamarbandh is one of the most beautiful pieces of jewellery there is, and one of the hardest to find outside India. Good ones were scattered across markets and makers on the other side of the world.</p>" +
  '<p>So we started gathering them in one place. We are new and we are small, and we are building the collection one piece at a time. If there is a style you are looking for and cannot find here, tell us in the chat. We may well be able to find it for you.</p></div>' +
  "<p class='aboutcta'><a class='btn btn-solid' href='/#shop'>Shop the collection</a> <a class='btn btn-line' href='/blog'>Read the journal</a></p></div>";
const GIFTS = BACK + "<p class='eyebrow'>Gift cards</p><h1>Let them choose</h1><p class='lede sm'>A waist chain is a personal thing, and sizing and style are easier chosen by the wearer. A gift card takes that worry away.</p>" +
  "<div class='giftgrid'><div class='giftcard'><h3>How it works</h3><ol><li>Message us in the chat with the amount you want and who it is for.</li><li>We email you the card, or send it straight to them on the date you choose.</li><li>They enter the number in their cart and the balance comes off the total.</li></ol></div>" +
  "<div class='giftcard'><h3>Good to know</h3><ul><li>Any amount from £25 upwards.</li><li>Valid for 12 months from the day it is issued.</li><li>Spend it over several orders. Whatever is left stays on the card.</li><li>Not exchangeable for cash, and we cannot replace a card number that is lost.</li></ul></div></div>";

const FIXED = {
  blog: { title: 'The Luna Journal', desc: 'Styling notes, sizing help and honest jewellery care from Luna Belly.', path: '/blog', box: 'pagePage' },
  about: { title: 'About us', desc: 'Luna Belly is a small shop for waist chains and kamarbandhs, chosen from jewellery makers in India, Hong Kong and beyond, with a separate handmade collection.', path: '/about', box: 'pagePage', body: ABOUT },
  gifts: { title: 'Gift cards', desc: 'Luna Belly gift cards: choose an amount, we send the card, they choose the piece.', path: '/gift-cards', box: 'giftPage', body: GIFTS },
};

module.exports = async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const t = u.searchParams.get('t') || '';
  const s = String(u.searchParams.get('s') || '').slice(0, 120);
  let m = null, status = 200;
  try {
    if (!SHELL) throw new Error('no shell');
    if (t === 'p' && s) m = await product(s);
    else if (t === 'c' && s) m = await collection(s);
    else if (t === 'post' && s) m = await post(s);
    else if (FIXED[t]) {
      m = Object.assign({}, FIXED[t], { ld: [crumbs([['Home', '/'], [FIXED[t].title, FIXED[t].path]])] });
      if (t === 'blog') m.body = await blogList().catch(() => '');
    }
    if (m && m.status) status = m.status;
  } catch (e) {
    m = null; status = 200;
  }
  const html = m ? render(m) : SHELL;
  res.statusCode = html ? status : 500;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Browsers always check for a fresh copy; Vercel's edge keeps one for 10 minutes and refreshes it in the background.
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', m ? 'public, s-maxage=600, stale-while-revalidate=86400' : 'no-store');
  res.end(html || 'Something went wrong. Please refresh the page.');
};
