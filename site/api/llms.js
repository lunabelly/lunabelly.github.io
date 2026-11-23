'use strict';
// /llms.txt: a plain-text summary of the shop for AI assistants, built from the live shop
// (pieces, collections, articles) so it never goes out of date. Public data only.
const fs = require('fs');
const path = require('path');

const read = (f) => {
  for (const p of [path.join(process.cwd(), f), path.join(__dirname, '..', f)]) {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) { /* try next */ }
  }
  return '';
};
const c = read('config.js');
const CFG = { url: (c.match(/url:'([^']+)'/) || [])[1], key: (c.match(/key:'([^']+)'/) || [])[1] };
const SITE = ((read('index.html').match(/rel='canonical' href='(https:\/\/[^/']+)/) || [])[1]) || 'https://luna-belly.vercel.app';
const one = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

async function q(table, query) {
  const r = await fetch(CFG.url + '/rest/v1/' + table + '?' + query, {
    headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key }, signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) throw new Error(table + ' ' + r.status);
  return r.json();
}

module.exports = async (req, res) => {
  let prods = [], colls = [], posts = [], sets = [];
  try {
    [prods, colls, posts, sets] = await Promise.all([
      q('products', 'select=slug,name,price_cents,material,weight_g,adjust_min_cm,adjust_max_cm,in_stock&order=sort_order'),
      q('collections', 'select=slug,name,blurb&active=eq.true&order=sort_order'),
      q('posts', 'select=slug,title,excerpt&published=eq.true&order=published_at.desc'),
      q('site_settings', 'select=key,value&key=in.(currency,shipping_cents,free_shipping_cents)'),
    ]);
  } catch (e) { /* the fixed part below still makes sense */ }
  const g = (k) => (sets.find((s) => s.key === k) || {}).value;
  const cur = /^[A-Z]{3}$/.test(g('currency') || '') ? g('currency') : 'GBP';
  const money = (n) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).format(n / 100).replace(/\.00$/, '');
  const ship = /^\d+$/.test(g('shipping_cents') || '') ? +g('shipping_cents') : 395;
  const free = /^\d+$/.test(g('free_shipping_cents') || '') ? +g('free_shipping_cents') : 5000;
  const L = [
    '# Luna Belly',
    '',
    '> Luna Belly is a small online shop based in Birmingham, UK, that sells waist jewellery only: kamarbandhs, oddiyanam-style bridal belts, belly chains and waist chains, for weddings, festivals and everyday wear. It posts orders across the UK.',
    '',
    'Facts:',
    '- Online shop only, based in Birmingham, United Kingdom. No walk-in counter.',
    '- Sells waist jewellery only. Does not sell necklaces, earrings or full bridal sets.',
    '- Pieces are plated jewellery (mostly gold-plated brass or gold-plated stainless steel), not solid gold. Each product page lists the base metal, plating, dimensions, weight and adjustable waist range.',
    '- Most pieces come from jewellery makers in India, Hong Kong and elsewhere; handmade pieces are labelled.',
    '- UK delivery ' + money(ship) + ', free on orders over ' + money(free) + '. Outside the UK: ask in the chat before ordering.',
    '- 14 days from delivery to change your mind.',
    '- Orders are confirmed by email with payment details; online card payment is not yet available.',
    '- Help with sizing and choosing a piece is available in the chat on every page.',
    '',
    '## Guides',
    '- [What is a kamarbandh, and how do you wear one?](' + SITE + '/kamarbandh): meaning, how to wear it with a lehenga or saree, choosing one for a wedding, UK delivery',
    '- [Waist chains and kamarbandhs in Birmingham](' + SITE + '/birmingham)',
    '- [Delivery across the Midlands](' + SITE + '/midlands)',
    '- [Size guide](' + SITE + '/size-guide)',
    '- [Jewellery care and materials](' + SITE + '/care)',
    '- [Delivery and returns](' + SITE + '/returns)',
    '- [FAQ](' + SITE + '/faq)',
  ];
  if (prods.length) {
    L.push('', '## Pieces');
    prods.forEach((p) => L.push('- [' + one(p.name) + '](' + SITE + '/p/' + encodeURIComponent(p.slug) + '): ' + money(p.price_cents) +
      (p.material ? '; ' + one(p.material) : '') + (p.weight_g ? '; ' + p.weight_g + ' g' : '') +
      (p.adjust_min_cm && p.adjust_max_cm ? '; fits a ' + p.adjust_min_cm + '–' + p.adjust_max_cm + ' cm waist' : '') + (p.in_stock ? '' : '; sold out')));
  }
  if (colls.length) {
    L.push('', '## Collections');
    colls.forEach((k) => L.push('- [' + one(k.name) + '](' + SITE + '/c/' + encodeURIComponent(k.slug) + ')' + (k.blurb ? ': ' + one(k.blurb) : '')));
  }
  if (posts.length) {
    L.push('', '## The Luna Journal');
    posts.forEach((p) => L.push('- [' + one(p.title) + '](' + SITE + '/blog/' + encodeURIComponent(p.slug) + ')' + (p.excerpt ? ': ' + one(p.excerpt) : '')));
  }
  L.push('', '## Optional', '- [About us](' + SITE + '/about)', '- [Contact](' + SITE + '/contact)', '- [Sitemap](' + SITE + '/sitemap.xml)', '');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end(L.join('\n'));
};
