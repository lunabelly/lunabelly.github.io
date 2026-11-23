'use strict';
/* Shop extras. Loads after app.js / shop-plus.js and reuses their globals (sb, products, card, addToCart,
   totals, renderCart, promo, giftc, cart, SHIP, FREE_SHIP, money, short, link, esc, toast).
   1. Back-in-stock: "Email me when it's back" on sold-out pieces.
   2. Complete the look: matching pieces with a set saving, also applied in the cart (and at checkout on the server).
   3. Gift finder: three quick questions, then a shortlist.
   4. Reviews: customers can add photos; "Verified purchase" when the email matches an order.
   5. Product videos, when the Studio has added one. */
(function () {
  if (typeof sb === 'undefined' || typeof products === 'undefined') return;
  const $ = (s, r) => (r || document).querySelector(s);
  const all = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const e = (s) => esc(s);
  let looks = [];
  const ready = new Promise((res) => {
    const tick = () => (products.length ? res() : setTimeout(tick, 120));
    tick();
  });
  const looksReady = Promise.resolve(sb.from('looks').select('id,name,product_ids,percent,sort_order').eq('active', true).order('sort_order')).then((r) => {
    looks = (r && r.data) || [];
    if (typeof renderCart === 'function') renderCart();
  }).catch(() => { /* bundles are optional */ });
  const byIdx = (id) => products.find((p) => p.id === id);

  // ------------------------------------------------------------------ 2. bundle maths (mirrors bundle_cents on the server)
  function bundleFor(lines) {
    const have = {};
    lines.forEach((l) => { if (l.p && l.qty > 0) have[l.p.id] = l.p.price_cents; });
    const used = {};
    let cents = 0;
    const names = [];
    looks.slice().sort((a, b) => b.percent - a.percent || a.sort_order - b.sort_order).forEach((L) => {
      const ids = L.product_ids || [];
      if (ids.length < 2 || !ids.every((id) => have[id] != null) || ids.some((id) => used[id])) return;
      const s = ids.reduce((n, id) => n + have[id], 0);
      cents += Math.floor(s * L.percent / 100);
      ids.forEach((id) => { used[id] = 1; });
      names.push(L.name);
    });
    return { cents, names };
  }
  if (typeof totals === 'function') {
    const baseTotals = totals;
    totals = function () { // eslint-disable-line no-global-assign
      const t = baseTotals();
      const b = bundleFor(t.lines);
      if (!b.cents) return Object.assign(t, { bundle: 0, bundleNames: [] });
      const base = t.sub - b.cents;
      let disc = 0;
      if (typeof promo !== 'undefined' && promo && promo.code) disc = promo.kind === 'percent' ? Math.floor(base * promo.value / 100) : Math.min(promo.value, base);
      disc = Math.min(disc, base);
      const after = base - disc;
      const ship = t.count === 0 || after >= FREE_SHIP ? 0 : SHIP;
      const before = after + ship + t.wrap;
      const gift = typeof giftc !== 'undefined' && giftc && giftc.code ? Math.min(giftc.balance_cents, before) : 0;
      return Object.assign(t, { bundle: b.cents, bundleNames: b.names, disc, ship, gift, total: before - gift });
    };
  }
  if (typeof renderCart === 'function') {
    const baseRender = renderCart;
    renderCart = function () { // eslint-disable-line no-global-assign
      baseRender.apply(this, arguments);
      const t = totals();
      let row = $('#cartBundle');
      const discRow = $('#cartDiscount');
      if (!row && discRow) {
        discRow.insertAdjacentHTML('beforebegin', "<div class='sum disc' id='cartBundle' hidden><span>Bundle saving <span id='cartBundleName'></span></span><strong id='cartBundleVal'></strong></div>");
        row = $('#cartBundle');
      }
      const sum = $('#sumLines');
      if (sum && t.bundle && !$('.bundle-line', sum)) {
        const li = "<li class='disc bundle-line'><span>Bundle saving" + (t.bundleNames.length ? ' (' + e(t.bundleNames.join(', ')) + ')' : '') + '</span><span>−' + money(t.bundle) + '</span></li>';
        const d = $('li.disc', sum);
        if (d) d.insertAdjacentHTML('beforebegin', li); else sum.insertAdjacentHTML('beforeend', li);
      }
      if (!row) return;
      row.hidden = !t.bundle;
      if (t.bundle) {
        $('#cartBundleVal').textContent = '−' + money(t.bundle);
        $('#cartBundleName').textContent = t.bundleNames.length ? '(' + t.bundleNames.join(', ') + ')' : '';
        const left = FREE_SHIP - (t.sub - t.bundle - t.disc);
        const note = $('#shipNote'), bar = $('#shipBar');
        if (note) note.textContent = left > 0 ? 'Add ' + money(left) + ' more for free delivery' : 'You have free delivery';
        if (bar) bar.style.width = Math.min(100, Math.round((t.sub - t.bundle - t.disc) / FREE_SHIP * 100)) + '%';
      }
    };
    renderCart();
  }

  // ------------------------------------------------------------------ product page extras
  const page = $('#productPage');
  let current = null;
  function decorate() {
    if (!page) return;
    const pp = $('.pp', page);
    if (!pp || pp.dataset.extras === '1' || !products.length) return;
    const slug = decodeURIComponent(location.pathname.replace(/^\/p\//, '').replace(/\/$/, ''));
    const p = products.find((x) => x.slug === slug);
    if (!p) return;
    pp.dataset.extras = '1';
    current = p;
    restockForm(p, pp);
    video(p, pp);
    looksReady.then(() => { if (pp.isConnected && !$('.ctl', page)) completeLook(p, pp); });
    reviewsExtras(p);
  }
  if (page) new MutationObserver(() => decorate()).observe(page, { childList: true });
  ready.then(decorate);

  // 1. back in stock
  function restockForm(p, pp) {
    if (p.in_stock) return;
    const buy = $('.pp-buy', pp);
    if (!buy) return;
    buy.insertAdjacentHTML('afterend',
      "<form id='restockForm' class='restock'><p><strong>Sold out for now.</strong> Leave your email and we will tell you once, as soon as it is back.</p>" +
      "<div class='restock-row'><input type='email' name='email' required maxlength='200' placeholder='Your email' autocomplete='email' aria-label='Your email'><button class='btn btn-solid'>Email me</button></div>" +
      "<p class='restock-msg' role='status'></p><p class='note'>We only use it for this one message.</p></form>");
  }
  document.addEventListener('submit', async (ev) => {
    if (ev.target.id !== 'restockForm') return;
    ev.preventDefault();
    const f = ev.target, msg = $('.restock-msg', f), btn = $('button', f);
    btn.disabled = true;
    msg.textContent = 'Saving…';
    const r = await sb.rpc('stock_alert_signup', { p_product: current && current.id, p_email: f.elements.email.value });
    btn.disabled = false;
    if (r.error) { msg.textContent = /rate/i.test(r.error.message || '') ? 'Too many requests. Please try again later.' : 'That did not work. Please try again.'; return; }
    if (!r.data || !r.data.ok) { msg.textContent = (r.data && r.data.reason) || 'Please check your email address.'; return; }
    f.innerHTML = "<p class='restock-done'><strong>Thank you.</strong> We will email you as soon as it is back in stock.</p>";
  });

  // 5. video
  function video(p, pp) {
    if (!p.video_url || !/^https:\/\//.test(p.video_url)) return;
    const gal = $('.pp-gallery', pp), media = $('.pp-media', pp);
    if (!gal || !media) return;
    gal.insertAdjacentHTML('beforeend', "<button type='button' class='vid-btn' data-video aria-pressed='false'><svg viewBox='0 0 24 24' aria-hidden='true'><path d='M8 5v14l11-7z'/></svg><span>Watch it move</span></button>");
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-video]');
    if (!b || !current) return;
    const media = $('#productPage .pp-media');
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    $('span', b).textContent = on ? 'Back to photos' : 'Watch it move';
    const v = $('video', media);
    if (on && !v) {
      media.insertAdjacentHTML('beforeend', "<video class='pp-video' src='" + e(current.video_url) + "' muted loop playsinline autoplay controls preload='metadata' aria-label='" + e(current.name) + " being worn'></video>");
    } else if (!on && v) v.remove();
  });

  // 2. complete the look
  function completeLook(p, pp) {
    const L = looks.find((x) => (x.product_ids || []).indexOf(p.id) >= 0);
    if (!L) return;
    const pieces = L.product_ids.map(byIdx).filter(Boolean);
    if (pieces.length < 2) return;
    const others = pieces.filter((x) => x.id !== p.id);
    const full = pieces.reduce((n, x) => n + x.price_cents, 0);
    const save = Math.floor(full * L.percent / 100);
    const can = pieces.every((x) => x.in_stock);
    pp.insertAdjacentHTML('afterend',
      "<section class='ctl' aria-labelledby='lookTitle'><div class='ctl-head'><div><p class='eyebrow'>Complete the look</p><h2 id='lookTitle'>" + e(L.name) + '</h2>' +
      '<p class="ctl-sub">Wear ' + e(p.name) + ' with ' + others.map((x) => e(x.name)).join(' and ') + '. Buy the set and save ' + e(L.percent) + '%.</p></div>' +
      "<div class='ctl-buy'><p class='ctl-price'><s>" + money(full) + '</s> <strong>' + money(full - save) + '</strong><small>You save ' + money(save) + '</small></p>' +
      "<button type='button' class='btn btn-solid' data-addlook='" + e(L.id) + "'" + (can ? '' : ' disabled') + '>' + (can ? 'Add the whole look' : 'Part of the set is sold out') + '</button></div></div>' +
      "<div class='grid ctl-grid'>" + others.map((x) => card(x)).join('') + '</div></section>');
    if (typeof paintWish === 'function') paintWish();
  }
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-addlook]');
    if (!b) return;
    const L = looks.find((x) => x.id === b.dataset.addlook);
    if (!L) return;
    L.product_ids.forEach((id) => { if (!cart.find((l) => l.id === id)) addToCart(id); });
    toast('The whole look is in your cart, with the set saving');
  });

  // 4. reviews: photos and verified purchase
  async function reviewsExtras(p) {
    const f = $('#reviewForm');
    if (f && !$('[name=photos]', f)) {
      const hp = $('.hp', f);
      hp.insertAdjacentHTML('beforebegin',
        "<label>Photos (optional, up to 3)<input type='file' name='photos' accept='image/jpeg,image/png,image/webp' multiple></label>" +
        "<div class='rev-thumbs' aria-live='polite'></div>" +
        "<label>The email you ordered with (optional)<input type='email' name='verify' maxlength='200' autocomplete='email'><small class='rev-hint'>Only used to add a <strong>Verified purchase</strong> label. It is checked and then thrown away, never shown or stored.</small></label>");
      $('[name=photos]', f).addEventListener('change', (ev) => {
        const files = Array.prototype.slice.call(ev.target.files || []).slice(0, 3);
        $('.rev-thumbs', f).innerHTML = files.map((x) => "<img alt='' src='" + URL.createObjectURL(x) + "'>").join('');
        if ((ev.target.files || []).length > 3) $('#revMsg').textContent = 'Only the first three photos will be added.';
      });
    }
    const r = await sb.from('reviews').select('created_at,photos,verified').eq('product_id', p.id).eq('status', 'approved');
    (r.data || []).forEach((x) => {
      const t = page.querySelector("time[datetime='" + x.created_at + "']");
      const li = t && t.closest('.rev');
      if (!li || li.dataset.extras) return;
      li.dataset.extras = '1';
      if (x.verified) $('.rev-top', li).insertAdjacentHTML('beforeend', "<span class='verified'><svg viewBox='0 0 24 24' aria-hidden='true'><path d='M5 12.5l4.5 4.5L19 7.5'/></svg>Verified purchase</span>");
      if ((x.photos || []).length) li.insertAdjacentHTML('beforeend', "<div class='rev-photos'>" + x.photos.map((u, i) => "<a href='" + e(u) + "' target='_blank' rel='noopener'><img src='" + e(u) + "' alt='Customer photo " + (i + 1) + "' loading='lazy'></a>").join('') + '</div>');
    });
  }
  // Shrinks a photo in the browser before upload (longest side 1600px), so uploads are quick and small.
  function shrink(file) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => res(b), 'image/jpeg', 0.85);
      };
      img.onerror = () => res(null);
      img.src = URL.createObjectURL(file);
    });
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  document.addEventListener('submit', async (ev) => {
    if (ev.target.id !== 'reviewForm') return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    const f = ev.target, d = new FormData(f), msg = $('#revMsg'), btn = $('button', f);
    if (d.get('website')) { msg.textContent = 'Thank you, your review has been sent for checking.'; f.reset(); return; }
    btn.disabled = true;
    const files = d.getAll('photos').filter((x) => x && x.size).slice(0, 3);
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      msg.textContent = 'Uploading photo ' + (i + 1) + ' of ' + files.length + '…';
      const blob = await shrink(files[i]);
      if (!blob) continue;
      const path = 'r/' + uid() + '.jpg';
      const u = await sb.storage.from('review-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (!u.error) urls.push(sb.storage.from('review-photos').getPublicUrl(path).data.publicUrl);
    }
    msg.textContent = 'Sending…';
    const r = await sb.from('reviews').insert({
      product_id: f.dataset.product, author: String(d.get('author')).trim(), rating: +d.get('rating'),
      title: String(d.get('title') || '').trim() || null, body: String(d.get('body')).trim(),
      photos: urls, verify_email: String(d.get('verify') || '').trim() || null,
    });
    btn.disabled = false;
    msg.textContent = r.error ? (/rate limit/.test(r.error.message || '') ? 'You have sent several reviews already. Please try again later.' : 'That did not send. Please try again.')
      : 'Thank you. Your review will appear once we have checked it.' + (files.length && urls.length < files.length ? ' Some photos could not be added.' : '');
    if (!r.error) { f.reset(); const th = $('.rev-thumbs', f); if (th) th.innerHTML = ''; }
  }, true);

  // ------------------------------------------------------------------ 3. gift finder
  const Q = [
    { k: 'occ', q: 'What is the occasion?', a: [['bridal', 'Wedding or bridal'], ['festive', 'Festival or party'], ['minimal', 'Everyday wear'], ['statement', 'Something to stand out'], ['any', 'Not sure yet']] },
    { k: 'style', q: 'Which style suits her?', a: [['delicate', 'Delicate and simple'], ['bold', 'Bold and ornate'], ['pearl', 'With pearls'], ['bells', 'With bells or coins'], ['any', 'Surprise me']] },
    { k: 'budget', q: 'What is your budget?', a: [['0-4000', 'Under £40'], ['4000-7000', '£40 to £70'], ['7000-99999', 'Over £70'], ['any', 'Any budget']] },
  ];
  const STYLE = {
    delicate: (p) => (p.tags || []).indexOf('minimal') >= 0 || /single|fine|delicate|simple|layer/i.test(p.name),
    bold: (p) => (p.tags || []).indexOf('statement') >= 0 || /kundan|temple|oddiyanam|goddess|statement/i.test(p.name + ' ' + (p.description || '')),
    pearl: (p) => /pearl/i.test(p.name + ' ' + (p.tags || []).join(' ') + ' ' + (p.material || '')),
    bells: (p) => /bell|coin|jhumka|ghungroo|chime/i.test(p.name + ' ' + (p.description || '')),
  };
  function pick(ans) {
    const list = products.filter((p) => p.in_stock);
    const range = ans.budget && ans.budget !== 'any' ? ans.budget.split('-').map(Number) : null;
    const scored = list.map((p) => {
      let s = 0;
      if (ans.occ && ans.occ !== 'any' && (p.tags || []).indexOf(ans.occ) >= 0) s += 3;
      if (ans.style && ans.style !== 'any' && STYLE[ans.style](p)) s += 2;
      if (p.featured) s += 0.5;
      const inBudget = !range || (p.price_cents >= range[0] && p.price_cents < range[1]);
      return { p, s, inBudget };
    });
    const bySc = (a, b) => b.s - a.s || a.p.price_cents - b.p.price_cents;
    const inB = scored.filter((x) => x.inBudget).sort(bySc);
    const matches = inB.filter((x) => x.s >= 1);
    let best = matches, relaxed = false;
    if (!matches.length) {
      const anyMatch = scored.filter((x) => x.s >= 1).sort(bySc);
      if (anyMatch.length && range) { best = anyMatch; relaxed = true; } else best = inB.length ? inB : scored.slice().sort(bySc);
    }
    return { list: best.slice(0, 3).map((x) => x.p), relaxed };
  }
  let gf = null;
  function openFinder() {
    if (!gf) {
      document.body.insertAdjacentHTML('beforeend', "<dialog id='gfDlg' class='gf' aria-labelledby='gfTitle'><button type='button' class='gf-x' data-gf-close aria-label='Close'>×</button><div class='gf-body'></div></dialog>");
      gf = $('#gfDlg');
      gf.addEventListener('click', (ev) => {
        if (ev.target === gf || ev.target.closest('[data-gf-close]')) { gf.close(); return; }
        const b = ev.target.closest('[data-gf]');
        if (b) { gf._ans[b.dataset.gf] = b.dataset.v; step(gf._step + 1); return; }
        if (ev.target.closest('[data-gf-back]')) step(Math.max(0, gf._step - 1));
        if (ev.target.closest('[data-gf-again]')) { gf._ans = {}; step(0); }
        if (ev.target.closest('a')) gf.close();
      });
    }
    gf._ans = {};
    step(0);
    if (!gf.open) gf.showModal();
  }
  function step(i) {
    gf._step = i;
    const body = $('.gf-body', gf);
    if (i < Q.length) {
      const q = Q[i];
      body.innerHTML = "<p class='eyebrow'>Gift finder · " + (i + 1) + ' of ' + Q.length + "</p><h2 id='gfTitle'>" + e(q.q) + "</h2><div class='gf-opts'>" +
        q.a.map((a) => "<button type='button' class='gf-opt' data-gf='" + q.k + "' data-v='" + a[0] + "'>" + e(a[1]) + '</button>').join('') + '</div>' +
        (i ? "<button type='button' class='link gf-back' data-gf-back>← Back</button>" : '');
      return;
    }
    const r = pick(gf._ans);
    body.innerHTML = "<p class='eyebrow'>Gift finder</p><h2 id='gfTitle'>" + (r.list.length ? 'Our picks for her' : 'Nothing quite matches') + '</h2>' +
      (r.relaxed ? "<p class='note'>Nothing in that budget matches right now, so here are the closest matches, slightly over budget.</p>" : '') +
      (r.list.length ? "<div class='grid gf-grid'>" + r.list.map((p) => card(p)).join('') + '</div>' : "<p>Tell us about her in the chat and we will suggest something.</p>") +
      "<p class='gf-foot'>Tick <strong>This is a gift</strong> at checkout for wrapping and a handwritten card. <button type='button' class='link' data-gf-again>Start again</button></p>";
    if (typeof paintWish === 'function') paintWish();
  }
  window.lunaGiftFinder = () => ready.then(openFinder);
  const filters = $('#shop .filters');
  if (filters) filters.insertAdjacentHTML('beforeend', "<button type='button' class='chip gf-chip' data-giftfinder><svg viewBox='0 0 24 24' aria-hidden='true'><path d='M4 11h16v9H4zM3 7h18v4H3zM12 7v13M12 7c-2-4-6-4-6-1.5S10 7 12 7zm0 0c2-4 6-4 6-1.5S14 7 12 7z'/></svg>Gift finder</button>");
  document.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-giftfinder]')) { ev.preventDefault(); window.lunaGiftFinder(); }
  });
  if (location.hash === '#gift-finder') window.lunaGiftFinder();
})();
