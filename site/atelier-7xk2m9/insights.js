'use strict';
/* Studio additions. Loads after studio.js and reuses its client and helpers (sb, view, esc,
   money, when, empty, TABS, go, CUR). studio.js itself is not modified.
   - Visitors: visits, popular pieces, where people come from, add-to-cart and orders.
   - Site health: the daily check's report, uptime, browser errors, emails sent, low-stock
     level, and an Optimise photos button.
   - Orders: marking an order Shipped asks for an optional tracking number first; the
     customer is emailed automatically by the database when the status changes.
   - Photo uploads are resized and compressed in the browser before upload (no visible
     quality loss) and cached by browsers for a year. */
(function () {
  if (typeof sb === 'undefined' || typeof TABS === 'undefined') return;
  var $v = function () { return document.getElementById('view'); };

  // ---------------------------------------------------------------- shared bits
  // Styles live in insights.css: the site's security policy blocks styles added by scripts.
  var list = function (title, rows, fmt) {
    return "<div class='lst'><h3>" + title + '</h3>' + (rows && rows.length
      ? '<ol>' + rows.map(function (r) { return '<li><span>' + esc(fmt ? fmt(r.name || r.path) : (r.name || r.path)) + '</span><b>' + r.n + '</b></li>'; }).join('') + '</ol>'
      : "<p class='saved'>Nothing yet.</p>") + '</div>';
  };
  var pageName = function (p) {
    var m = { '/': 'Home', '/blog': 'Journal', '/about': 'About us', '/account': 'Account', '/track': 'Track order', '/wishlist': 'Wishlist', '/gift-cards': 'Gift cards', '/faq': 'FAQ', '/care': 'Jewellery care', '/contact': 'Contact', '/returns': 'Delivery & returns', '/privacy': 'Privacy', '/terms': 'Terms', '/size-guide': 'Size guide' };
    if (m[p]) return m[p];
    if (p.indexOf('/p/') === 0) return 'Piece: ' + decodeURIComponent(p.slice(3)).replace(/-/g, ' ');
    if (p.indexOf('/blog/') === 0) return 'Article: ' + decodeURIComponent(p.slice(6)).replace(/-/g, ' ');
    if (p.indexOf('/c/') === 0) return 'Collection: ' + decodeURIComponent(p.slice(3)).replace(/-/g, ' ');
    return p;
  };

  // ---------------------------------------------------------------- Visitors
  var days = 7;
  TABS.stats = async function () {
    var v = $v();
    v.innerHTML = empty('Loading…');
    var r = await sb.rpc('stats_summary', { p_days: days });
    if (r.error || !r.data) { v.innerHTML = empty('Could not load visitor numbers.'); return; }
    var s = r.data, daily = s.daily || [];
    var max = Math.max.apply(null, daily.map(function (d) { return d.visits; }).concat([1]));
    var conv = s.visits ? Math.round(s.orders / s.visits * 1000) / 10 : 0;
    var dfmt = function (d) { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
    v.innerHTML =
      "<h2>Visitors</h2><p class='saved'>Counted without cookies and without storing anyone's IP address. People who have asked their browser not to be tracked are not counted.</p>" +
      "<div class='range' role='group' aria-label='Period'>" + [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(function (x) {
        return "<button type='button' data-days='" + x[0] + "'" + (x[0] === days ? " class='on'" : '') + '>' + x[1] + '</button>';
      }).join('') + '</div>' +
      "<div class='kpis'>" +
      [['Visits', s.visits], ['Pages viewed', s.views], ['Pieces viewed', s.product_views], ['Added to cart', s.carts], ['Checkouts started', s.checkouts], ['Orders', s.orders], ['Sales', money(s.revenue_cents)], ['Visits that ordered', conv + '%']]
        .map(function (k) { return "<div class='kpi'><b>" + esc(k[1]) + '</b><span>' + k[0] + '</span></div>'; }).join('') + '</div>' +
      '<h3>Visits per day</h3>' +
      "<div class='bars'>" + daily.map(function (d) {
        return "<i data-h='" + Math.max(2, Math.round(d.visits / max * 100)) + "' title='" + esc(dfmt(d.day) + ': ' + d.visits + ' visits, ' + d.views + ' pages') + "'></i>";
      }).join('') + '</div>' +
      "<div class='barlab'><span>" + (daily[0] ? dfmt(daily[0].day) : '') + '</span><span>' + (daily.length ? dfmt(daily[daily.length - 1].day) : '') + '</span></div>' +
      "<div class='lists'>" +
      list('Most viewed pieces', s.products) + list('Most added to cart', s.added) +
      list('Where visitors came from', s.sources) + list('Phone or computer', s.devices, function (n) { return n.charAt(0).toUpperCase() + n.slice(1); }) +
      list('Most viewed pages', s.pages, pageName) + '</div>';
    v.querySelectorAll('.bars i').forEach(function (i) { i.style.height = i.dataset.h + '%'; });
  };

  // ---------------------------------------------------------------- Site health
  TABS.health = async function () {
    var v = $v();
    v.innerHTML = empty('Loading…');
    var q = await Promise.all([
      sb.from('health_runs').select('at,ok,report').eq('kind', 'daily').order('at', { ascending: false }).limit(1),
      sb.from('health_state').select('*').eq('key', 'site').maybeSingle(),
      sb.from('site_errors').select('*').order('last_at', { ascending: false }).limit(40),
      sb.from('mail_log').select('*').order('at', { ascending: false }).limit(25),
      sb.from('site_settings').select('value').eq('key', 'low_stock_at').maybeSingle()
    ]);
    var run = q[0].data && q[0].data[0], st = q[1].data, errs = q[2].data || [], mails = q[3].data || [];
    var low = q[4].data ? q[4].data.value : '2';
    var rep = (run && run.report) || {};
    var up = !st || !st.fails;
    v.innerHTML =
      '<h2>Site health</h2>' +
      "<p class='hstat'><span class='hdot" + (up ? '' : ' bad') + "'></span>" +
      (up ? 'The shop is online' + (st && st.last_ok_at ? ', last checked ' + esc(when(st.last_ok_at)) : '') + '. It is checked every 5 minutes.'
          : 'The shop did not load at the last check. ' + esc(st.detail)) + '</p>' +

      "<div class='hsec'><h3>Daily check</h3>" +
      (run ? "<p class='saved'>Last run " + esc(when(run.at)) + '. It runs every morning and emails you the result.</p>' +
        ((rep.needs || []).length ? "<p class='need'><strong>Needs a look</strong></p><ul>" + rep.needs.map(function (n) { return "<li class='need'><b>" + esc(n.what) + '</b>' + (n.detail ? '<br><small>' + String(n.detail).replace(/<br>/g, ' · ').replace(/<[^>]*>/g, '') + '</small>' : '') + '</li>'; }).join('') + '</ul>' : '') +
        ((rep.fixed || []).length ? '<p><strong>Fixed automatically</strong></p><ul>' + rep.fixed.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
        ((rep.fine || []).length ? '<p><strong>Checked and fine</strong></p><ul>' + rep.fine.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '')
        : "<p class='saved'>The first daily check has not run yet.</p>") +
      "<div class='rowb'><button type='button' class='btn btn-line' data-hx='run'>Run the check now</button><span class='saved' id='runMsg' role='status'></span></div></div>" +

      "<div class='hsec'><h3>Photos</h3><p class='saved'>New photos are made lighter automatically when you upload them. This button finds older photos over 1 MB and saves a lighter copy at the same size, so the shop loads faster. The originals are kept.</p>" +
      "<div class='rowb'><button type='button' class='btn btn-line' data-hx='photos'>Optimise photos</button><span class='saved' id='photoMsg' role='status'></span></div></div>" +

      "<div class='hsec'><h3>Low-stock alert</h3><form id='lowForm' class='rowb'><label>Email me when a piece has this many left or fewer <input name='n' type='number' min='0' max='100' required value='" + esc(low) + "' class='lowin'></label><button class='btn btn-solid'>Save</button><span class='saved' role='status'></span></form>" +
      "<p class='saved'>This only applies to pieces where you have entered a stock number.</p></div>" +

      "<div class='hsec'><h3>Errors seen by visitors</h3>" +
      (errs.length ? '<table><tr><th>Last seen</th><th>What happened</th><th>Page</th><th>Times</th></tr>' + errs.map(function (e) {
        return '<tr><td>' + esc(when(e.last_at)) + '</td><td>' + esc(e.message) + (e.source ? '<br><small>' + esc(e.source) + '</small>' : '') + '</td><td>' + esc(e.path) + '<br><small>' + esc(e.device) + '</small></td><td>' + e.hits + '</td></tr>';
      }).join('') + "</table><p><button type='button' class='link' data-hx='clear'>Clear this list</button></p>" : "<p class='saved'>None. Visitors' browsers have not reported any problems.</p>") + '</div>' +

      "<div class='hsec'><h3>Emails sent</h3>" +
      (mails.length ? '<table><tr><th>When</th><th>Email</th><th>To</th><th></th></tr>' + mails.map(function (m) {
        return '<tr><td>' + esc(when(m.at)) + '</td><td>' + esc(m.subject) + '</td><td>' + esc(m.to_addr) + '</td><td' + (m.ok ? '>Sent' : " class='bad' title='" + esc(m.error) + "'>Failed") + '</td></tr>';
      }).join('') + '</table>' : "<p class='saved'>No emails yet.</p>") + '</div>';
  };

  document.addEventListener('click', async function (e) {
    var d = e.target.closest('[data-days],[data-hx]');
    if (!d) return;
    if (d.dataset.days) { days = +d.dataset.days; TABS.stats(); return; }
    var x = d.dataset.hx;
    if (x === 'run') {
      var m = document.getElementById('runMsg');
      d.disabled = true;
      var r = await sb.rpc('run_health_now');
      if (r.error) { m.textContent = 'Could not start the check.'; d.disabled = false; return; }
      if (r.data === false) { m.textContent = 'A check ran in the last 5 minutes. Try again shortly.'; d.disabled = false; return; }
      m.textContent = 'Checking every page and photo. This takes about a minute…';
      var started = Date.now();
      var wait = setInterval(async function () {
        var q = await sb.from('health_runs').select('at').eq('kind', 'daily').order('at', { ascending: false }).limit(1);
        var last = q.data && q.data[0] && new Date(q.data[0].at).getTime();
        if (last && last > started - 5000) { clearInterval(wait); if (tab === 'health') TABS.health(); }
        else if (Date.now() - started > 150000) { clearInterval(wait); m.textContent = 'Still running. Open Site health again in a minute.'; }
      }, 5000);
    } else if (x === 'clear') {
      if (!window.confirm('Clear the list of visitor errors?')) return;
      await sb.from('site_errors').delete().gte('id', 0);
      TABS.health();
    } else if (x === 'photos') {
      d.disabled = true;
      await optimisePhotos(document.getElementById('photoMsg'));
      d.disabled = false;
    }
  });
  document.addEventListener('submit', async function (e) {
    if (e.target.id !== 'lowForm') return;
    e.preventDefault();
    e.stopPropagation();
    var n = Math.max(0, Math.min(100, parseInt(new FormData(e.target).get('n'), 10) || 0));
    var note = e.target.querySelector('[role=status]');
    var r = await sb.from('site_settings').upsert({ key: 'low_stock_at', value: String(n), updated_at: new Date().toISOString() });
    note.textContent = r.error ? 'Could not save.' : 'Saved.';
  }, true);

  // ---------------------------------------------------------------- photos
  var BIG = 1000000, MAXSIDE = 2400, QUALITY = 0.9;
  var encode = function (source, w, h) {
    return new Promise(function (res) {
      var scale = Math.min(1, MAXSIDE / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      var g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(source, 0, 0, c.width, c.height);
      c.toBlob(function (b) { res(b && b.type === 'image/webp' ? b : null); }, 'image/webp', QUALITY);
    });
  };
  // Smaller uploads: keeps the original when it is already light, or when compressing
  // would not help. Animated GIFs and SVGs are never touched.
  var shrink = async function (file) {
    try {
      if (!/^image\/(jpeg|png|webp|heic|heif|avif)$/i.test(file.type) || !window.createImageBitmap) return file;
      var bmp = await createImageBitmap(file);
      var light = file.size <= 700000 && Math.max(bmp.width, bmp.height) <= MAXSIDE && /jpeg|webp/.test(file.type);
      if (light) return file;
      var out = await encode(bmp, bmp.width, bmp.height);
      if (!out || out.size >= file.size) return file;
      return new File([out], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
    } catch (e) { return file; }
  };
  var upload = async function (file, prefix) {
    var f = await shrink(file);
    var ext = ((f.name || '').split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    var path = prefix + '-' + Date.now() + '.' + ext;
    var u = await sb.storage.from('products').upload(path, f, { upsert: true, contentType: f.type, cacheControl: '31536000' });
    if (u.error) return null;
    return sb.storage.from('products').getPublicUrl(path).data.publicUrl;
  };
  // Every photo upload in the Studio (products, gallery, home page photo, journal covers)
  // goes through studio.js's uploadImage, so replacing it here covers them all.
  uploadImage = upload; // eslint-disable-line no-global-assign

  async function optimisePhotos(msg) {
    msg.textContent = 'Looking for large photos…';
    var q = await Promise.all([
      sb.from('products').select('id,name,image_url,gallery'),
      sb.from('posts').select('id,title,cover_url'),
      sb.from('site_settings').select('value').eq('key', 'hero_image_url').maybeSingle()
    ]);
    var refs = [];
    (q[0].data || []).forEach(function (p) {
      if (p.image_url) refs.push({ url: p.image_url, kind: 'main', id: p.id });
      (p.gallery || []).forEach(function (g, i) { refs.push({ url: g, kind: 'gallery', id: p.id, i: i }); });
    });
    (q[1].data || []).forEach(function (p) { if (p.cover_url) refs.push({ url: p.cover_url, kind: 'post', id: p.id }); });
    if (q[2].data && q[2].data.value) refs.push({ url: q[2].data.value, kind: 'hero' });
    var big = [];
    for (var i = 0; i < refs.length; i++) {
      try {
        var h = await fetch(refs[i].url, { method: 'HEAD', cache: 'no-store' });
        var size = +h.headers.get('content-length') || 0;
        if (size > BIG) { refs[i].size = size; big.push(refs[i]); }
      } catch (e) { /* skip */ }
    }
    if (!big.length) { msg.textContent = 'All photos are already a sensible size.'; return; }
    var done = 0, saved = 0, swap = {};
    for (var k = 0; k < big.length; k++) {
      var b = big[k];
      msg.textContent = 'Optimising photo ' + (k + 1) + ' of ' + big.length + '…';
      if (swap[b.url] === undefined) {
        swap[b.url] = null;
        try {
          var img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise(function (ok, bad) { img.onload = ok; img.onerror = bad; img.src = b.url + (b.url.indexOf('?') < 0 ? '?' : '&') + 'opt=1'; });
          var out = await encode(img, img.naturalWidth, img.naturalHeight);
          if (out && out.size < b.size * 0.85) {
            var path = 'opt-' + Date.now() + '-' + k + '.webp';
            var up = await sb.storage.from('products').upload(path, out, { contentType: 'image/webp', cacheControl: '31536000' });
            if (!up.error) { swap[b.url] = sb.storage.from('products').getPublicUrl(path).data.publicUrl; saved += b.size - out.size; }
          }
        } catch (e) { /* leave this one as it is */ }
      }
      var nu = swap[b.url];
      if (!nu) continue;
      if (b.kind === 'main') await sb.from('products').update({ image_url: nu }).eq('id', b.id);
      else if (b.kind === 'gallery') {
        var g = (await sb.from('products').select('gallery').eq('id', b.id).maybeSingle()).data;
        if (g && g.gallery) { g.gallery[b.i] = nu; await sb.from('products').update({ gallery: g.gallery }).eq('id', b.id); }
      } else if (b.kind === 'post') await sb.from('posts').update({ cover_url: nu }).eq('id', b.id);
      else if (b.kind === 'hero') await sb.from('site_settings').upsert({ key: 'hero_image_url', value: nu, updated_at: new Date().toISOString() });
      done++;
    }
    msg.textContent = done ? 'Done. ' + done + ' photo' + (done === 1 ? '' : 's') + ' made lighter, saving ' + (saved / 1e6).toFixed(1) + ' MB per visit.' : 'These photos could not be made smaller without losing quality, so they were left as they are.';
  }

  // ---------------------------------------------------------------- Orders: tracking
  var dlg = document.createElement('dialog');
  dlg.id = 'shipDlg';
  dlg.innerHTML = "<form method='dialog' id='shipForm'><h3>Mark as shipped</h3><p class='saved'>The customer gets an email saying their order is on its way. Add the tracking number or tracking link if you have one.</p>" +
    "<label>Tracking number or link (optional)<input name='tracking' maxlength='300' autocomplete='off'></label>" +
    "<div class='rowb'><button type='button' class='link' data-shipcancel>Cancel</button><button class='btn btn-solid'>Mark as shipped</button></div></form>";
  document.body.appendChild(dlg);
  var pending = null;
  // Runs before studio.js's own handler and takes over only the change to "shipped".
  document.addEventListener('change', function (e) {
    var s = e.target;
    if (!s.matches || !s.matches('select[data-order]') || s.value !== 'shipped') return;
    e.stopImmediatePropagation();
    pending = s;
    dlg.returnValue = '';
    dlg.querySelector('[name=tracking]').value = '';
    dlg.showModal();
  }, true);
  dlg.addEventListener('click', function (e) {
    if (e.target.closest('[data-shipcancel]')) { dlg.close(); }
  });
  dlg.addEventListener('close', function () {
    if (pending && dlg.returnValue !== 'ok') { TABS.orders(); pending = null; }
  });
  document.getElementById('shipForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!pending) return;
    var id = pending.dataset.order, tr = String(dlg.querySelector('[name=tracking]').value || '').trim();
    var up = { status: 'shipped' };
    if (tr) up.tracking = tr;
    var r = await sb.from('orders').update(up).eq('id', id);
    pending = null;
    dlg.close('ok');
    if (r.error) window.alert('Could not update the order.');
    TABS.orders();
  });
  // Show saved tracking numbers under each order's status.
  new MutationObserver(async function () {
    if (tab !== 'orders') return;
    var sels = document.querySelectorAll('select[data-order]');
    if (!sels.length || document.querySelector('.trk')) return;
    var ids = Array.prototype.map.call(sels, function (s) { return s.dataset.order; });
    var r = await sb.from('orders').select('id,tracking').in('id', ids).not('tracking', 'is', null);
    (r.data || []).forEach(function (o) {
      var s = document.querySelector("select[data-order='" + o.id + "']");
      if (s && !s.parentNode.querySelector('.trk')) s.insertAdjacentHTML('afterend', "<small class='trk'>Tracking: " + esc(o.tracking) + '</small>');
    });
  }).observe(document.getElementById('view'), { childList: true });

  // ---------------------------------------------------------------- Products: Handmade tick box
  // Saved straight away when ticked. The database then adds the piece to the Handmade
  // collection and the shop shows a Handmade badge on its photo.
  var hmBusy = false;
  new MutationObserver(async function () {
    if (tab !== 'products' || hmBusy) return;
    var forms = Array.prototype.filter.call(document.querySelectorAll('form[data-prod]'), function (f) { return !f.querySelector('[data-handmade]'); });
    if (!forms.length) return;
    hmBusy = true;
    var r = await sb.from('products').select('id,handmade');
    hmBusy = false;
    var on = {};
    (r.data || []).forEach(function (p) { on[p.id] = p.handmade; });
    forms.forEach(function (f) {
      if (f.querySelector('[data-handmade]')) return;
      var id = f.dataset.prod;
      var feat = f.querySelector("input[name='featured']");
      var html = "<label class='chk hmchk' title='Shows a Handmade badge on the shop and adds the piece to the Handmade collection'><input type='checkbox' data-handmade='" + esc(id) + "'" + (on[id] ? ' checked' : '') + "> Handmade</label><span class='saved hmmsg' role='status'></span>";
      if (feat && feat.closest('label')) feat.closest('label').insertAdjacentHTML('afterend', html);
      else { var row = f.querySelector('.rowf'); if (row) row.insertAdjacentHTML('beforeend', html); }
    });
  }).observe(document.getElementById('view'), { childList: true, subtree: true });
  document.addEventListener('change', async function (e) {
    var c = e.target;
    if (!c.matches || !c.matches('[data-handmade]')) return;
    var msg = c.closest('label').nextElementSibling;
    if (msg) msg.textContent = 'Saving…';
    var r = await sb.from('products').update({ handmade: c.checked }).eq('id', c.dataset.handmade);
    if (r.error) { c.checked = !c.checked; if (msg) msg.textContent = 'Could not save.'; return; }
    if (msg) msg.textContent = c.checked ? 'Marked handmade.' : 'No longer marked handmade.';
  });

  // ---------------------------------------------------------------- Settings: payment link
  new MutationObserver(async function () {
    if (tab !== 'settings' || document.getElementById('payForm') || !document.getElementById('setForm')) return;
    document.getElementById('setForm').insertAdjacentHTML('afterend',
      "<form id='payForm' class='setf'><h2>Payments</h2>" +
      "<p class='saved'>Paste the payment link from your payment provider (for example a Stripe, PayPal or SumUp payment link). Customers see a Pay now button straight after ordering and in their order email. Leave it empty to keep taking payment by email.</p>" +
      "<label>Payment link<input name='link' type='url' inputmode='url' placeholder='https://' autocomplete='off'></label>" +
      "<p class='saved'>Optional: put {amount} or {order} in the link and they are replaced with the order total and order number, for example https://paypal.me/yourname/{amount}GBP</p>" +
      "<button class='btn btn-solid'>Save payment link</button><p id='payMsg' class='saved' role='status'></p></form>");
    var r = await sb.from('site_settings').select('value').eq('key', 'payment_link').maybeSingle();
    var f = document.getElementById('payForm');
    if (f) f.elements.link.value = (r.data && r.data.value) || '';
  }).observe(document.getElementById('view'), { childList: true });
  document.addEventListener('submit', async function (e) {
    if (e.target.id !== 'payForm') return;
    e.preventDefault();
    e.stopPropagation();
    var v = String(e.target.elements.link.value || '').trim();
    var msg = document.getElementById('payMsg');
    if (v && !/^https:\/\/[^\s]+$/i.test(v)) { msg.textContent = 'The link must start with https://'; return; }
    var r = await sb.from('site_settings').upsert({ key: 'payment_link', value: v, updated_at: new Date().toISOString() });
    msg.textContent = r.error ? 'Could not save.' : (v ? 'Saved. Customers will now see a Pay now button.' : 'Saved. The Pay now button is switched off.');
  }, true);
})();
