'use strict';
/* Shop growth features. Loads after app.js and reuses its globals (sb, products, card, byId, wish, esc,
   toast, renderWish, paintWish, promo). Nothing in app.js is edited.
   5. Prices in other currencies (shown as an estimate; orders are always charged in pounds).
   6. Share a wishlist / bridal list by link; friends can mark pieces as bought.
   7. "Worn by you": customer photos from published reviews, on the home page.
   8. Refer a friend: friend codes in the cart, after checkout and on the account page. */
(function () {
  if (typeof sb === 'undefined') return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const E = (s) => esc(s);
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (x) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (x) { /* private mode */ } },
  };
  const SITE = location.origin;
  const waLink = (text) => 'https://wa.me/?text=' + encodeURIComponent(text);
  const copy = async (text, btn) => {
    try { await navigator.clipboard.writeText(text); } catch (x) {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (y) { /* ignore */ } t.remove();
    }
    if (btn) { const o = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = o; }, 1600); }
  };
  const ready = new Promise((res) => { const t = () => (typeof products !== 'undefined' && products.length ? res() : setTimeout(t, 120)); t(); });

  // ================================================================ 5. currencies
  const CURS = { GBP: '£ GBP', EUR: '€ EUR', USD: '$ USD', INR: '₹ INR' };
  let rates = { EUR: 1.17, USD: 1.27, INR: 107 };
  let fx = store.get('lb_fx', 'GBP');
  if (!CURS[fx]) fx = 'GBP';
  Promise.resolve(sb.from('site_settings').select('value').eq('key', 'fx_rates').maybeSingle()).then((r) => {
    try { const v = JSON.parse(r.data.value); ['EUR', 'USD', 'INR'].forEach((k) => { if (v[k] > 0) rates[k] = +v[k]; }); } catch (x) { /* defaults */ }
    paintFx();
  }).catch(() => {});
  const fmtFx = (pence) => new Intl.NumberFormat(fx === 'INR' ? 'en-IN' : 'en-GB', { style: 'currency', currency: fx, maximumFractionDigits: 0 }).format(pence / 100 * rates[fx]);
  const poundsIn = (el) => {
    const m = (el.textContent || '').replace(/≈.*$/, '').match(/£\s?([\d,]+(?:\.\d{1,2})?)/);
    return m ? Math.round(parseFloat(m[1].replace(/,/g, '')) * 100) : null;
  };
  // Prices only; totals keep their layout and get an estimate in the checkout note instead.
  const FX_SEL = '.price, .ctl-price strong';
  function paintFx() {
    $$(FX_SEL).forEach((el) => {
      let tag = el.nextElementSibling && el.nextElementSibling.classList.contains('fx') ? el.nextElementSibling : null;
      if (fx === 'GBP') { if (tag) tag.remove(); return; }
      const p = poundsIn(el);
      if (p == null) { if (tag) tag.remove(); return; }
      const text = '≈ ' + fmtFx(p);
      if (!tag) { el.insertAdjacentHTML('afterend', "<span class='fx' title='Estimate. You pay in pounds.'></span>"); tag = el.nextElementSibling; }
      if (tag.textContent !== text) tag.textContent = text;
    });
    const note = $('#fxNote');
    if (note) {
      const tot = $('#sumTotal') ? poundsIn($('#sumTotal')) : null;
      const text = fx === 'GBP' ? '' : (tot ? 'Your total is about ' + fmtFx(tot) + '. ' : '') + 'Prices in ' + CURS[fx].slice(2) + ' are an estimate. You pay in pounds (£), and your bank converts it.';
      note.hidden = fx === 'GBP';
      if (note.textContent !== text) note.textContent = text;
    }
  }
  let fxT = null;
  new MutationObserver(() => { clearTimeout(fxT); fxT = setTimeout(paintFx, 60); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  const bar = $('.bar');
  if (bar) {
    bar.insertAdjacentHTML('beforeend', "<label class='fx-pick'><span class='sr'>Show prices in</span><select id='fxSel' aria-label='Show prices in'>" +
      Object.keys(CURS).map((k) => "<option value='" + k + "'" + (k === fx ? ' selected' : '') + '>' + CURS[k] + '</option>').join('') + '</select></label>');
    $('#fxSel').addEventListener('change', (e) => { fx = e.target.value; store.set('lb_fx', fx); paintFx(); });
  }
  const ck = $('#checkoutView .note');
  if (ck) ck.insertAdjacentHTML('afterend', "<p id='fxNote' class='note fx-note' hidden></p>");
  paintFx();

  // ================================================================ 6. shared wishlists
  const qs = new URLSearchParams(location.search);
  const sharedToken = location.pathname.replace(/\/$/, '') === '/wishlist' ? (qs.get('l') || '').replace(/[^a-f0-9]/g, '').slice(0, 12) : '';
  let mine = store.get('lb_share', null); // { token, secret, name, date }
  const myMarks = () => store.get('lb_marks', {});
  if (typeof renderWish === 'function') {
    const baseWish = renderWish;
    renderWish = function () { // eslint-disable-line no-global-assign
      if (sharedToken) {
        // paintWish() calls renderWish() after every heart change: on a shared list only refresh the hearts.
        if ($('#wishPage') && $('#wishPage').dataset.shared) return hearts();
        return renderShared();
      }
      baseWish.apply(this, arguments);
      const box = $('#wishPage');
      if (!box || !wish.filter(byId).length || $('.share-bar', box)) return;
      $('h1', box).insertAdjacentHTML('afterend', "<div class='share-bar'><p>Planning a wedding, a birthday or a festival? Share your list with family and friends, and they can mark what they have bought.</p>" +
        "<button type='button' class='btn btn-solid' data-share-open>" + (mine ? 'Update and share your list' : 'Share your list') + '</button></div>');
    };
  }
  function shareDialog() {
    let d = $('#shareDlg');
    if (!d) {
      document.body.insertAdjacentHTML('beforeend', "<dialog id='shareDlg' class='share-dlg' aria-labelledby='shareTitle'><button type='button' class='x' data-share-close aria-label='Close'>×</button><div class='share-body'></div></dialog>");
      d = $('#shareDlg');
      d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-share-close]')) d.close(); });
    }
    $('.share-body', d).innerHTML = "<p class='eyebrow'>Share your list</p><h2 id='shareTitle'>Send your wishlist to anyone</h2>" +
      "<form id='shareForm' class='fields'><label class='span'>Name of your list<input name='name' required maxlength='80' value='" + E(mine ? mine.name : 'My Luna Belly wishlist') + "'></label>" +
      "<label class='span'>Wedding or event date (optional)<input name='date' type='date' value='" + E(mine && mine.date ? mine.date : '') + "'></label>" +
      "<p class='span note'>Anyone with the link can see the pieces and mark them as bought. Nothing else about you is shared. What others mark stays hidden from you, so the surprise is kept.</p>" +
      "<button class='btn btn-solid span'>" + (mine ? 'Update the link' : 'Create the link') + "</button><p class='span err' role='alert'></p></form><div class='share-done' hidden></div>";
    d.showModal();
  }
  async function saveShare(f) {
    const ids = wish.filter(byId);
    const btn = $('button', f), err = $('.err', f);
    btn.disabled = true; err.textContent = '';
    const r = await sb.rpc('share_list_save', { p_token: mine ? mine.token : null, p_secret: mine ? mine.secret : null, p_name: f.elements.name.value, p_date: f.elements.date.value || null, p_ids: ids });
    btn.disabled = false;
    if (r.error || !r.data) { err.textContent = /rate limit/.test((r.error && r.error.message) || '') ? 'Too many lists in a short time. Please try again later.' : 'That did not work. Please try again.'; return; }
    mine = { token: r.data.token, secret: r.data.secret, name: f.elements.name.value, date: f.elements.date.value || '' };
    store.set('lb_share', mine);
    const url = SITE + '/wishlist?l=' + mine.token;
    f.hidden = true;
    const done = $('.share-done', $('#shareDlg'));
    done.hidden = false;
    done.innerHTML = "<p>Your list is ready. Anyone with this link can see it:</p><div class='share-link'><input readonly value='" + E(url) + "' aria-label='Link to your list'><button type='button' class='btn btn-line' data-copy='" + E(url) + "'>Copy</button></div>" +
      "<p><a class='btn btn-solid wa' target='_blank' rel='noopener' href='" + E(waLink(mine.name + ' on Luna Belly: ' + url)) + "'>Send on WhatsApp</a></p>" +
      "<p class='note'>When you save more pieces, press <strong>Update and share your list</strong> again and the same link updates.</p>";
  }
  function hearts() {
    $$('#wishPage [data-wish]').forEach((el) => { const on = wish.indexOf(el.dataset.wish) >= 0; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); });
  }
  async function renderShared() {
    const box = $('#wishPage');
    if (!box || box.dataset.sharedLoading) return;
    box.dataset.sharedLoading = '1';
    box.innerHTML = "<p class='eyebrow'>A shared list</p><h1>Loading…</h1>";
    const r = await sb.rpc('share_list_get', { p_token: sharedToken });
    await ready;
    const L = r.data;
    delete box.dataset.sharedLoading;
    if (!L) { box.innerHTML = "<p class='eyebrow'>A shared list</p><h1>List not found</h1><div class='empty mid'><p>This link may have been mistyped, or the list was removed.</p><a class='btn btn-solid' href='/#shop'>Browse the collection</a></div>"; return; }
    const isOwner = mine && mine.token === sharedToken;
    const bought = L.bought || [];
    const items = (L.items || []).map(byId).filter(Boolean);
    let when = '';
    if (L.date) {
      const dt = new Date(L.date + 'T12:00:00'), days = Math.ceil((dt - new Date()) / 864e5);
      when = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + (days > 0 ? ' · ' + days + ' day' + (days === 1 ? '' : 's') + ' to go' : '');
    }
    document.title = L.name + ' | Luna Belly';
    box.innerHTML = "<p class='eyebrow'>A shared list</p><h1>" + E(L.name) + '</h1>' + (when ? "<p class='share-when'>" + E(when) + '</p>' : '') +
      (isOwner ? "<p class='share-note'>This is your list. What others have marked as bought is hidden from you, so the surprise is kept.</p>"
        : "<p class='share-note'>Buying a gift? Add it to your cart, then press <strong>Mark as bought</strong> so nobody buys the same piece.</p>") +
      (items.length ? "<div class='grid share-grid'>" + items.map((p) => {
        const got = !isOwner && bought.indexOf(p.id) >= 0;
        const byMe = !!myMarks()[sharedToken + ':' + p.id];
        return "<div class='share-item" + (got ? ' got' : '') + "'>" + card(p) + (isOwner ? '' :
          got ? "<p class='share-got'>✓ Already bought" + (byMe ? " <button type='button' class='link' data-unbuy='" + E(p.id) + "'>Undo</button>" : '') + '</p>'
            : "<button type='button' class='btn btn-line share-mark' data-buy='" + E(p.id) + "'>Mark as bought</button>") + '</div>';
      }).join('') + '</div>' : "<div class='empty mid'><p>This list is empty for now.</p></div>");
    box.dataset.shared = '1';
    delete box.dataset.sharedLoading;
    hearts();
  }
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-share-open],[data-copy],[data-buy],[data-unbuy],[data-refcopy]');
    if (!t) return;
    if (t.hasAttribute('data-share-open')) shareDialog();
    else if (t.dataset.copy) copy(t.dataset.copy, t);
    else if (t.dataset.refcopy) copy(t.dataset.refcopy, t);
    else if (t.dataset.buy || t.dataset.unbuy) {
      const id = t.dataset.buy || t.dataset.unbuy, on = !!t.dataset.buy;
      t.disabled = true;
      const r = await sb.rpc('share_list_mark', { p_token: sharedToken, p_product: id, p_bought: on, p_by: null });
      if (r.error || !r.data) { t.disabled = false; toast('That did not work. Please try again.'); return; }
      const m = myMarks(); if (on) m[sharedToken + ':' + id] = 1; else delete m[sharedToken + ':' + id]; store.set('lb_marks', m);
      toast(on ? 'Marked as bought. Thank you!' : 'Unmarked');
      renderShared();
    }
  });
  document.addEventListener('submit', (e) => { if (e.target.id === 'shareForm') { e.preventDefault(); saveShare(e.target); } });
  if (sharedToken && $('#wishPage')) renderShared();
  else if (typeof renderWish === 'function' && $('#wishPage') && !$('#wishPage').hidden) ready.then(() => renderWish());

  // ================================================================ 7. worn by you
  const story = $('#story');
  if (story) {
    Promise.all([ready, sb.from('reviews').select('id,product_id,author,rating,photos,created_at').eq('status', 'approved').not('photos', 'eq', '{}').order('created_at', { ascending: false }).limit(30)]).then((res) => {
      const rows = (res[1] && res[1].data) || [];
      const tiles = [];
      rows.forEach((r) => (r.photos || []).forEach((u) => { const p = byId(r.product_id); if (p && tiles.length < 12) tiles.push({ u, p, a: r.author }); }));
      if (!tiles.length) return;
      story.insertAdjacentHTML('beforebegin', "<section id='wornByYou' class='wrap sec worn' aria-labelledby='wornTitle'><p class='eyebrow'>Worn by you</p><h2 id='wornTitle'>Our customers, in their own photos</h2>" +
        "<div class='worn-grid'>" + tiles.map((t) => "<a class='worn-tile' href='/p/" + encodeURIComponent(t.p.slug) + "#reviews'><img src='" + E(t.u) + "' alt='" + E(t.a) + ' wearing ' + E(t.p.name) + "' loading='lazy'><span>" + E(t.a) + ' · ' + E(t.p.name) + '</span></a>').join('') + '</div>' +
        "<p class='worn-cta'>Bought from us? Add a photo when you review your piece and it may appear here.</p></section>");
    }).catch(() => {});
  }

  // ================================================================ 8. refer a friend
  const refCard = (d, title) => {
    const msg = 'I love Luna Belly. Use my code ' + d.code + ' for ' + d.percent + '% off your first order: ' + SITE;
    return "<div class='refer'><p class='eyebrow'>Refer a friend</p><h3>" + E(title) + '</h3>' +
      '<p>Your friend gets <strong>' + E(d.percent) + '% off</strong> their first order. You get <strong>' + E(d.points_each) + ' Luna points</strong> when it arrives.</p>' +
      "<div class='refer-code'><span>" + E(d.code) + "</span><button type='button' class='btn btn-line' data-refcopy='" + E(d.code) + "'>Copy code</button>" +
      "<a class='btn btn-solid wa' target='_blank' rel='noopener' href='" + E(waLink(msg)) + "'>Send on WhatsApp</a></div>" +
      (d.friends != null ? "<p class='note'>" + E(d.friends) + ' friend' + (d.friends === 1 ? ' has' : 's have') + ' used your code' + (d.points ? ', earning you ' + E(d.points) + ' points' : '') + (d.pending ? ' (' + E(d.pending) + ' on the way)' : '') + '.</p>' : '') + '</div>';
  };
  // Before placing an order: a friend code only works on a first order, never your own.
  // Checked as the email is typed, so a blocked code is explained before "Place order" is pressed.
  const form = $('#checkoutForm');
  const refState = { key: '', ok: true, reason: '' };
  const currentCode = () => (typeof promo !== 'undefined' && promo && promo.code) || '';
  async function refCheck() {
    const code = currentCode(), email = form.elements.email.value.trim().toLowerCase();
    const key = code + '|' + email, btn = $('#placeOrder'), err = $('#checkoutError');
    if (!code || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { refState.key = ''; refState.ok = true; if (btn.dataset.refBlock) { btn.disabled = false; delete btn.dataset.refBlock; err.textContent = ''; } return; }
    if (key === refState.key) return;
    refState.key = key;
    const r = await sb.rpc('referral_check', { p_code: code, p_email: email });
    if (refState.key !== key) return;
    const d = r.data || {};
    refState.ok = !(d.referral && !d.ok); refState.reason = d.reason || '';
    if (!refState.ok) { err.textContent = d.reason; btn.disabled = true; btn.dataset.refBlock = '1'; }
    else if (btn.dataset.refBlock) { btn.disabled = false; delete btn.dataset.refBlock; err.textContent = ''; }
  }
  if (form) {
    let rT = null;
    form.elements.email.addEventListener('input', () => { clearTimeout(rT); rT = setTimeout(refCheck, 350); });
    form.elements.email.addEventListener('change', refCheck);
    form.addEventListener('submit', (e) => {
      if (refState.key && !refState.ok && refState.key === currentCode() + '|' + form.elements.email.value.trim().toLowerCase()) {
        e.preventDefault(); e.stopImmediatePropagation(); $('#checkoutError').textContent = refState.reason;
      }
    }, true);
    // A code removed or changed in the cart, or the checkout reopened: check again.
    new MutationObserver(() => { refState.key = ''; refCheck(); }).observe($('#checkoutDlg'), { attributes: true, attributeFilter: ['open'] });
  }
  // After placing an order: show the customer their own code.
  const thanks = $('#thanksView');
  if (thanks) new MutationObserver(async () => {
    if (thanks.hidden || $('.refer', thanks)) return;
    const num = ($('#orderNo') || {}).textContent, email = ($('#thanksEmail') || {}).textContent;
    if (!num || !email) return;
    const r = await sb.rpc('referral_for_order', { p_order: num, p_email: email });
    if (r.data && r.data.code && !$('.refer', thanks)) $('.thanks-steps', thanks).insertAdjacentHTML('afterend', refCard(r.data, 'Share the love'));
  }).observe(thanks, { attributes: true, attributeFilter: ['hidden'] });
  // Account page: the signed-in customer's code and how it is doing.
  const acc = $('#accountPage');
  if (acc) new MutationObserver(async () => {
    const orders = $('#orders', acc);
    if (!orders || $('#refer', acc) || acc.dataset.refLoading) return;
    acc.dataset.refLoading = '1';
    const r = await sb.rpc('my_referral');
    delete acc.dataset.refLoading;
    if (r.data && r.data.code && !$('#refer', acc) && $('#orders', acc)) $('#orders', acc).insertAdjacentHTML('afterend', "<section class='accsec' id='refer'>" + refCard(r.data, 'Give ' + r.data.percent + '%, get points') + '</section>');
  }).observe(acc, { childList: true, subtree: true });
})();
