'use strict';
// sitemap.xml built from the live shop: every piece (with its photos), active collection and
// published journal article, plus the fixed pages. Search engines read it; nothing else does.
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
const x = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

async function q(table, query) {
  const r = await fetch(CFG.url + '/rest/v1/' + table + '?' + query, {
    headers: { apikey: CFG.key, Authorization: 'Bearer ' + CFG.key }, signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) throw new Error(table + ' ' + r.status);
  return r.json();
}

const PAGES = ['/', '/blog', '/about', '/gift-cards', '/faq', '/size-guide', '/care', '/returns', '/contact', '/privacy', '/terms', '/birmingham', '/midlands', '/kamarbandh'];

module.exports = async (req, res) => {
  let prods = [], colls = [], posts = [];
  try {
    [prods, colls, posts] = await Promise.all([
      q('products', 'select=slug,name,image_url,gallery,created_at&order=sort_order'),
      q('collections', 'select=slug,created_at&active=eq.true&order=sort_order'),
      q('posts', 'select=slug,published_at,updated_at&published=eq.true&order=published_at.desc'),
    ]);
  } catch (e) { /* fixed pages only */ }
  const url = (loc, mod, extra) => '<url><loc>' + x(SITE + loc) + '</loc>' + (mod ? '<lastmod>' + mod + '</lastmod>' : '') + (extra || '') + '</url>';
  const out = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">']
    .concat(PAGES.map((p) => url(p)))
    .concat(prods.map((p) => url('/p/' + encodeURIComponent(p.slug), day(p.created_at),
      [p.image_url].concat(Array.isArray(p.gallery) ? p.gallery : []).filter((u) => /^https:\/\//.test(u || '')).slice(0, 10)
        .map((u) => '<image:image><image:loc>' + x(u) + '</image:loc></image:image>').join(''))))
    .concat(colls.map((k) => url('/c/' + encodeURIComponent(k.slug))))
    .concat(posts.map((p) => url('/blog/' + encodeURIComponent(p.slug), day(p.updated_at || p.published_at))))
    .concat(['</urlset>']);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.end(out.join('\n'));
};
