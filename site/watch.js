'use strict';
/* Luna Belly site watcher. Loaded first, before the shop's own scripts.
   1. Error catcher: page errors, failed photos, blocked content and failed requests to the
      database are reported (message and page address only) so the daily check can see them.
   2. Self-healing photos: a photo that fails is retried once; if it still fails a tidy
      placeholder is shown instead of a broken-image icon.
   3. Visitor counting (only where the script tag has data-stats): page views, add-to-cart and
      checkout clicks. No cookies, no storage, no IP address, nothing that identifies a person.
      Skipped for browsers that ask not to be tracked, and for automated browsers. */
(function () {
  var me = document.currentScript;
  var STATS = !!(me && me.hasAttribute('data-stats'));
  var cfg = function () {
    return window.LUNA_CONFIG || { url: 'https://dfyekwaqybiucvkwnaxu.supabase.co', key: 'sb_publishable_yGa_ZWI0G9VYNlDK5E9ABA_-R-cyXVU' };
  };
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  var device = function () {
    var coarse = window.matchMedia && matchMedia('(pointer:coarse)').matches;
    var w = Math.min(screen.width || innerWidth, screen.height || innerHeight);
    return coarse ? (w >= 700 ? 'tablet' : 'mobile') : 'desktop';
  };
  var page = function () { return location.pathname.slice(0, 200); };
  var rpc = function (name, body) {
    if (!realFetch) return;
    var c = cfg();
    try {
      realFetch(c.url + '/rest/v1/rpc/' + name, {
        method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json', apikey: c.key, Authorization: 'Bearer ' + c.key },
        body: JSON.stringify(body)
      }).catch(function () {});
    } catch (e) { /* never let reporting break the page */ }
  };

  // ---------------------------------------------------------------- 1. errors
  var sent = {}, budget = 12;
  // Automated browsers (preview bots, test tools) are ignored so they cannot fill the report.
  var bot = navigator.webdriver || /bot|crawl|spider|slurp|preview|lighthouse|headless/i.test(navigator.userAgent);
  var report = function (kind, message, source) {
    if (bot) return;
    message = String(message || '').slice(0, 500);
    if (!message || budget <= 0) return;
    var k = kind + '|' + message + '|' + source;
    if (sent[k]) return;
    sent[k] = 1; budget--;
    rpc('log_site_error', { p_kind: kind, p_message: message, p_source: String(source || '').slice(0, 300), p_path: page(), p_device: device() });
  };
  var clean = function (u) { try { var x = new URL(u, location.href); return x.origin + x.pathname; } catch (e) { return String(u || '').split('?')[0]; } };

  // ---------------------------------------------------------------- 2. photos
  var PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 500'><rect width='400' height='500' fill='#f3ead9'/>" +
    "<path d='M232 180a74 74 0 1 0 0 140a58 58 0 1 1 0-140z' fill='none' stroke='#b08a3e' stroke-width='3' opacity='.7'/>" +
    "<text x='200' y='380' font-family='Georgia,serif' font-size='22' fill='#7d6a60' text-anchor='middle'>Luna Belly</text></svg>");
  var healImage = function (img) {
    var src = img.getAttribute('src') || '';
    if (!src || src.indexOf('data:') === 0) return;
    if (!img.dataset.lbRetry) {
      img.dataset.lbRetry = src;
      setTimeout(function () {
        if (img.getAttribute('src') !== src) return; // the page already changed it
        img.src = src + (src.indexOf('?') < 0 ? '?' : '&') + 'retry=' + Date.now();
      }, 1200);
      return;
    }
    report('image', 'Photo failed to load', clean(img.dataset.lbRetry));
    img.removeAttribute('srcset');
    img.src = PLACEHOLDER;
    img.classList.add('img-missing');
  };

  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.tagName) {
      if (t.tagName === 'IMG') healImage(t);
      else if (t.tagName === 'SCRIPT' || t.tagName === 'LINK') report('network', t.tagName.toLowerCase() + ' failed to load', clean(t.src || t.href));
      return;
    }
    report('js', e.message, (e.filename ? clean(e.filename) : '') + (e.lineno ? ':' + e.lineno : ''));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    report('promise', r && r.message ? r.message : String(r), r && r.stack ? String(r.stack).split('\n')[1] || '' : '');
  });
  document.addEventListener('securitypolicyviolation', function (e) {
    report('csp', 'Blocked by security policy: ' + e.violatedDirective, clean(e.blockedURI));
  });
  var origErr = console.error;
  console.error = function () {
    try {
      var a = arguments[0];
      report('js', 'console: ' + (a && a.message ? a.message : typeof a === 'string' ? a : JSON.stringify(a)), '');
    } catch (e) { /* ignore */ }
    return origErr.apply(console, arguments);
  };
  // Failed requests to the shop's database (server errors or no connection at all).
  if (realFetch) {
    var base = cfg().url;
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : input && input.url || '';
      var ours = url.indexOf(base) === 0 && url.indexOf('/rpc/log_site_error') < 0 && url.indexOf('/rpc/track_view') < 0;
      return realFetch(input, init).then(function (r) {
        if (ours && r.status >= 500) report('network', 'Database request failed (' + r.status + ')', clean(url).replace(base, ''));
        return r;
      }, function (err) {
        if (ours && navigator.onLine !== false) report('network', 'Database could not be reached', clean(url).replace(base, ''));
        throw err;
      });
    };
  }

  // ---------------------------------------------------------------- 3. visitor counting
  if (!STATS) return;
  var nav = navigator;
  if (bot || nav.globalPrivacyControl || nav.doNotTrack === '1' || window.doNotTrack === '1') return;
  var refHost = '';
  try { refHost = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '') : ''; } catch (e) { refHost = ''; }
  var external = refHost !== location.hostname.replace(/^www\./, '');
  var first = true, last = '';
  var track = function (ev, product) {
    rpc('track_view', { p_ev: ev, p_path: page(), p_ref: external ? refHost : '', p_device: device(), p_product: product || '', p_visit: ev === 'view' && first && external });
  };
  var view = function () {
    var p = page();
    if (p === last) return;
    last = p;
    track('view');
    first = false;
  };
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    history[m] = function () { var r = orig.apply(this, arguments); setTimeout(view, 0); return r; };
  });
  window.addEventListener('popstate', function () { setTimeout(view, 0); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-add],[data-action="checkout"]');
    if (!t) return;
    if (t.hasAttribute('data-add')) track('cart', t.getAttribute('data-add'));
    else track('checkout');
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(view, 300); });
  else setTimeout(view, 300);
})();
