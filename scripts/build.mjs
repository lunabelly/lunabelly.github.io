// Builds the GitHub Pages version of Luna Belly into _site/.
//
// GitHub Pages only serves files, so everything Vercel did on request is done here instead:
//  - a ready-made page for every piece, collection and journal article, with its own title,
//    description, structured data and readable text (the same code as site/api/page.js),
//  - sitemap.xml and llms.txt from the live shop,
//  - every product photo resized to WebP at the widths the shop asks for,
//  - security and no-index rules as <meta> tags (Pages cannot send custom headers).
// Run by .github/workflows/pages.yml on every push and every hour. Reads public shop data only,
// with the same publishable key the website already uses. Fails, and publishes nothing, if the
// shop cannot be reached, so a bad build never replaces a good site.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'site');
const OUT = path.resolve(ROOT, process.env.OUT_DIR || '_site');
const SITE = (process.env.SITE_URL || 'https://lunabelly.github.io').replace(/\/$/, '');
const OLD = 'https://luna-belly.vercel.app';
const WIDTHS = [384, 640, 828, 1080, 1600];
const SKIP = new Set(['api', 'vercel.json']);
const TEXT = /\.(html|js|css|txt|xml|json|webmanifest|svg)$/;
const STORE_IMG = /^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\//;

const CSP = "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' https://fonts.googleapis.com; " +
  "font-src https://fonts.gstatic.com; img-src 'self' https: data: blob:; connect-src 'self' https://dfyekwaqybiucvkwnaxu.supabase.co " +
  "wss://dfyekwaqybiucvkwnaxu.supabase.co https://api.openai.com wss://generativelanguage.googleapis.com; " +
  "media-src 'self' blob: https://dfyekwaqybiucvkwnaxu.supabase.co; base-uri 'self'; form-action 'self'";
const HEAD_META = `<meta http-equiv='Content-Security-Policy' content="${CSP}">\n<meta name='referrer' content='strict-origin-when-cross-origin'>`;
const NOINDEX = "<meta name='robots' content='noindex, nofollow'>";

const log = (...a) => console.log('[build]', ...a);
const write = (rel, data) => {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, data);
};
const addHead = (html, extra) => html.replace(/<meta charset='utf-8'>/i, (m) => m + '\n' + extra);

// 1. Copy the site, pointing every link at the new address.
fs.rmSync(OUT, { recursive: true, force: true });
(function copy(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (!rel && SKIP.has(e.name)) continue;
    const from = path.join(dir, e.name);
    if (e.isDirectory()) { copy(from, r); continue; }
    if (TEXT.test(e.name)) {
      let t = fs.readFileSync(from, 'utf8').split(OLD).join(SITE).split(OLD.replace('https://', '')).join(SITE.replace('https://', ''));
      if (e.name.endsWith('.html') && !/^google[0-9a-f]+\.html$/.test(e.name)) {
        t = addHead(t, HEAD_META + (r.startsWith('atelier-') ? '\n' + NOINDEX : ''));
      }
      write(r, t);
    } else {
      write(r, fs.readFileSync(from));
    }
  }
})(SRC, '');
write('.nojekyll', '');

// 2. Live shop data (public only).
const conf = fs.readFileSync(path.join(SRC, 'config.js'), 'utf8');
const API = (conf.match(/url:'([^']+)'/) || [])[1];
const KEY = (conf.match(/key:'([^']+)'/) || [])[1];
async function q(table, query) {
  const r = await fetch(API + '/rest/v1/' + table + '?' + query, {
    headers: { apikey: KEY, Authorization: 'Bearer ' + KEY }, signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`${table}: HTTP ${r.status}`);
  return r.json();
}
const [prods, colls, posts, hero] = await Promise.all([
  q('products', 'select=slug,image_url,gallery&order=sort_order'),
  q('collections', 'select=slug&active=eq.true&order=sort_order'),
  q('posts', 'select=slug,cover_url&published=eq.true&order=published_at.desc'),
  q('site_settings', 'select=value&key=eq.hero_image_url'),
]);
log(`shop data: ${prods.length} pieces, ${colls.length} collections, ${posts.length} articles`);
if (!prods.length) throw new Error('The shop returned no products; not publishing.');

// 3. Photos at every width the shop asks for.
const sharp = (await import('sharp')).default;
const photos = new Set();
for (const p of prods) [p.image_url].concat(Array.isArray(p.gallery) ? p.gallery : []).forEach((u) => photos.add(u));
for (const p of posts) photos.add(p.cover_url);
if (hero[0]) photos.add(hero[0].value);
const MAP = {};
let made = 0, failed = 0;
for (const u of [...photos].filter((u) => STORE_IMG.test(u || ''))) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    const meta = await sharp(buf).metadata();
    const k = crypto.createHash('sha1').update(u).digest('hex').slice(0, 16);
    const ws = WIDTHS.filter((w, i) => i === 0 || w <= (meta.width || 0));
    for (const w of ws) {
      write(`img/${k}-${w}.webp`, await sharp(buf).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 75 }).toBuffer());
    }
    MAP[u] = { k, w: ws };
    made++;
  } catch (e) {
    failed++;
    log('photo left as original:', u, String(e.message || e));
  }
}
write('img-map.js', '/* Made by scripts/build.mjs: each shop photo and the widths saved for it under /img. */\nwindow.LB_IMG=' + JSON.stringify(MAP) + ';\n');
log(`photos: ${made} resized, ${failed} left as original`);

// The photo list loads before the shop script on every page that runs it.
for (const rel of ['index.html']) {
  const f = path.join(OUT, rel);
  const t = fs.readFileSync(f, 'utf8');
  if (!t.includes("<script src='/app.js'>")) throw new Error(rel + ': app.js tag not found');
  fs.writeFileSync(f, t.replace("<script src='/app.js'>", "<script src='/img-map.js'></script>\n<script src='/app.js'>"));
}

// Vercel image addresses in generated pages -> the files made above (or the original photo).
function fixImages(html) {
  return html.replace(/(https:\/\/[^'"\s/]+)?\/_vercel\/image\?url=([^&'"\s]+)(?:&#38;|&amp;|&)w=(\d+)(?:&#38;|&amp;|&)q=\d+/g, (all, abs, enc, w) => {
    const u = decodeURIComponent(enc);
    const m = MAP[u];
    if (!m) return u;
    const b = m.w.find((x) => x >= +w) || m.w[m.w.length - 1];
    return (abs ? SITE : '') + '/img/' + m.k + '-' + b + '.webp'; // link previews need a full address
  });
}

// 4. A ready-made page for every piece, collection and article, made by the same code Vercel ran.
process.chdir(OUT); // page.js reads index.html and config.js from here: the copies with the new address.
const run = (file, url) => new Promise((resolve, reject) => {
  const handler = require(path.join(SRC, 'api', file));
  const res = {
    statusCode: 200, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(body) { resolve({ status: this.statusCode, body: String(body) }); },
  };
  Promise.resolve(handler({ url }, res)).catch(reject);
});
const SAFE = /^[a-z0-9][a-z0-9-]{0,118}$/;
const jobs = [
  ...prods.filter((p) => SAFE.test(p.slug)).map((p) => ['page.js', '/api/page?t=p&s=' + p.slug, `p/${p.slug}.html`]),
  ...colls.filter((c) => SAFE.test(c.slug)).map((c) => ['page.js', '/api/page?t=c&s=' + c.slug, `c/${c.slug}.html`]),
  ...posts.filter((p) => SAFE.test(p.slug)).map((p) => ['page.js', '/api/page?t=post&s=' + p.slug, `blog/${p.slug}.html`]),
  ['page.js', '/api/page?t=blog', 'blog.html'],
  ['page.js', '/api/page?t=about', 'about.html'],
  ['page.js', '/api/page?t=gifts', 'gift-cards.html'],
];
for (const [file, url, out] of jobs) {
  const r = await run(file, url);
  // page.js answers with the plain home page when it cannot reach the shop: never publish that as a piece.
  if (r.status !== 200 || !r.body.includes('data-ssr')) throw new Error(`${out}: page did not build (status ${r.status})`);
  write(out, fixImages(r.body));
}
log(`pages: ${jobs.length} made`);

const sm = await run('sitemap.js', '/sitemap.xml');
if (!sm.body.includes('/p/')) throw new Error('sitemap.xml came out without pieces');
write('sitemap.xml', sm.body);
const ll = await run('llms.js', '/llms.txt');
if (!ll.body.includes('## Pieces')) throw new Error('llms.txt came out without pieces');
write('llms.txt', ll.body);

// 5. Pages that only make sense in a visitor's own browser: the shop page, kept out of search.
const shell = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
for (const p of ['wishlist', 'track', 'account']) write(p + '.html', addHead(shell, NOINDEX));

// 6. A piece, collection or article added since the last build: the shop draws it in the browser.
const nf = path.join(OUT, '404.html');
fs.writeFileSync(nf, fs.readFileSync(nf, 'utf8').replace('</head>', "<script src='/spa-404.js'></script>\n</head>"));
write('spa-404.js', `'use strict';
/* GitHub serves this page for any address without a file. Pieces, collections and articles added
   since the site was last built get a file at the next build (within the hour); until then the
   shop page is loaded here so the visitor still sees them. Anything else stays "Page not found". */
(function () {
  if (!/^\\/(p|c|blog)\\/[a-z0-9-]+\\/?$/.test(location.pathname)) return;
  document.documentElement.style.visibility = 'hidden';
  fetch('/index.html').then(function (r) { return r.ok ? r.text() : Promise.reject(); }).then(function (t) {
    document.open(); document.write(t); document.close();
  }).catch(function () { document.documentElement.style.visibility = ''; });
})();
`);

log('done:', OUT, 'for', SITE);
