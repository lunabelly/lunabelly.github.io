'use strict';
/* Luna Belly service worker: lets the shop and the Studio be installed as apps, and shows a
   friendly page when there is no connection. Everything is fetched fresh from the network first,
   so a new version of the site is always used straight away; the saved copy is only a fallback
   when offline. The Studio, the database and anything on another site are never saved. */
const CACHE = 'lb-v2';
const OFFLINE = '/offline.html';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/styles.css', '/service.css', '/favicon.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/atelier-7xk2m9')) {
    // Studio: never stored. Offline, show the offline page instead of an error.
    if (req.mode === 'navigate') e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }
  // Account pages, resized photos and the sitemap are left to the browser's own cache.
  if (url.pathname.startsWith('/account') || url.pathname.startsWith('/_vercel/') || url.pathname === '/sitemap.xml') return;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match(OFFLINE) : Response.error()))));
});
