'use strict';
/* Shop service features. Loads after app.js and the other shop scripts; nothing else is edited.
   - Price drop alerts: "Email me if the price drops" on product pages and for the whole wishlist.
   - Returns: customers start a return from the order tracking page (linked from their account),
     and see where it is. The owner handles it in Studio > Returns.
   - Receipts: "Download receipt" on the order tracking page (uses invoice.js).
   - Install as an app: service worker, and a small "Get the app" card on phones. */
(function () {
  if (typeof sb === 'undefined') return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const E = (s) => esc(s);
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (x) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (x) { /* private mode */ } },
  };
  const svg = (d) => "<svg viewBox='0 0 24 24' aria-hidden='true'>" + d + '</svg>';
  const BELL = "<path d='M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z'/><path d='M10 20.5a2 2 0 0 0 4 0'/>";
  const okEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
  async function myEmail() {
    try { const s = await sb.auth.getSession(); const u = s.data && s.data.session && s.data.session.user; if (u && u.email) return u.email; } catch (x) { /* signed out */ }
    return store.get('lb_pa_email', '');
  }

  // ================================================================ price drop alerts
  function paDialog(ids, label) {
    let d = $('#paDlg');
    if (!d) {
      document.body.insertAdjacentHTML('beforeend', "<dialog id='paDlg' class='share-dlg pa-dlg' aria-labelledby='paTitle'><button type='button' class='x' data-pa-close aria-label='Close'>×</button><div class='pa-body'></div></dialog>");
      d = $('#paDlg');
      d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-pa-close]')) d.close(); });
    }
    $('.pa-body', d).innerHTML = "<p class='eyebrow'>Price alert</p><h2 id='paTitle'>Tell me if the price drops</h2>" +
      '<p>We will email you if ' + E(label) + ' goes down in price. Nothing else, and every email has a link to stop.</p>' +
      "<form id='paForm' class='fields'><label class='span'>Your email<input name='email' type='email' required autocomplete='email'></label>" +
      "<button class='btn btn-solid span'>Email me</button><p class='span err' role='alert'></p></form>";
    d.dataset.ids = JSON.stringify(ids);
    d.dataset.label = label;
    myEmail().then((v) => { const i = $('#paForm [name=email]'); if (i && !i.value) i.value = v || ''; });
    d.showModal();
  }
  async function paSave(f) {
    const d = $('#paDlg'), btn = $('button', f), err = $('.err', f);
    const email = f.elements.email.value.trim();
    if (!okEmail(email)) { err.textContent = 'Please check your email address.'; return; }
    btn.disabled = true; err.textContent = '';
    const r = await sb.rpc('price_watch_add', { p_email: email, p_ids: JSON.parse(d.dataset.ids || '[]') });
    btn.disabled = false;
    if (r.error) { err.textContent = /rate limit/.test(r.error.message) ? 'Too many alerts in a short time. Please try again later.' : 'That did not work. Please try again.'; return; }
    store.set('lb_pa_email', email);
    $('.pa-body', d).innerHTML = "<p class='eyebrow'>Price alert</p><h2>You are all set</h2><p>We will email <strong>" + E(email) + '</strong> if ' + E(d.dataset.label) +
      " goes down in price.</p><p><button type='button' class='btn btn-solid' data-pa-close>Done</button></p>";
    toast('Price alert on');
  }
  function productButton() {
    const page = $('#productPage');
    if (!page || page.hidden) return;
    const buy = $('.pp-buy', page), add = $('[data-add]', page);
    if (!buy || !add || $('.pa-link', page)) return;
    const p = typeof byId === 'function' ? byId(add.dataset.add) : null;
    buy.insertAdjacentHTML('afterend', "<button type='button' class='link pa-link' data-pa='" + E(add.dataset.add) + "' data-pa-name='" + E(p ? p.name : 'this piece') + "'>" + svg(BELL) + '<span>Email me if the price drops</span></button>');
  }
  function wishButton() {
    const box = $('#wishPage');
    if (!box || box.hidden || box.dataset.shared || $('.pa-bar', box)) return;
    const ids = (typeof wish !== 'undefined' ? wish : []).filter((id) => typeof byId === 'function' && byId(id));
    if (!ids.length) return;
    const after = $('.share-bar', box) || $('h1', box);
    if (!after) return;
    after.insertAdjacentHTML('afterend', "<div class='pa-bar'>" + svg(BELL) + '<p>Waiting for a sale? We can email you if anything on your wishlist goes down in price.</p>' +
      "<button type='button' class='btn btn-line' data-pa='wish'>Email me about price drops</button></div>");
  }
  ['#productPage', '#wishPage'].forEach((s) => {
    const el = $(s);
    if (el) new MutationObserver(() => { productButton(); wishButton(); }).observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  });
  productButton(); wishButton();

  // ================================================================ returns and receipts (order tracking page)
  const REASONS = [['changed_mind', 'I changed my mind'], ['faulty', 'It is faulty'], ['damaged', 'It arrived damaged'], ['wrong_item', 'Wrong item sent'], ['other', 'Something else']];
  const STATUS = { requested: ['Waiting for us to look at it', ''], approved: ['Approved: please post it back (see your email)', 'ok'], received: ['We have it back', 'ok'],
    refunded: ['Refunded', 'ok'], rejected: ['Not accepted (see your email)', 'bad'] };
  let seller = null;
  function trackCreds() {
    const f = $('#trackForm');
    return f ? { o: f.elements.o.value.trim(), e: f.elements.e.value.trim() } : null;
  }
  async function trackExtras() {
    const out = $('#trackOut'), box = out && $('.trackbox', out);
    if (!box || box.dataset.svc) return;
    box.dataset.svc = '1';
    const c = trackCreds();
    if (!c) return;
    const r = await Promise.all([sb.rpc('order_receipt', { p_number: c.o, p_email: c.e }), sb.rpc('return_get', { p_number: c.o, p_email: c.e })]);
    const o = r[0].data;
    if (!o || !$('#trackOut .trackbox')) return;
    const rets = r[1].data || [];
    const open = rets.some((x) => ['requested', 'approved', 'received'].indexOf(x.status) >= 0);
    const canReturn = !open && (o.status === 'shipped' || o.status === 'delivered');
    const m = (c2) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: o.currency || 'GBP' }).format(c2 / 100);
    box.insertAdjacentHTML('beforeend', "<div class='svc-acts'><button type='button' class='btn btn-line' data-receipt>" + (o.payment_status === 'paid' ? 'Download receipt' : 'Download order summary') + '</button>' +
      (canReturn ? "<button type='button' class='btn btn-line' data-ret-open>Return something</button>" : '') + '</div>' +
      (rets.length ? "<div class='ret-list'><h3>Your returns</h3>" + rets.map((x) => {
        const st = STATUS[x.status] || [x.status, ''];
        return "<div class='ret-row'><div><strong>" + E(x.ref) + "</strong> <span class='ret-st " + st[1] + "'>" + E(st[0]) + '</span><br><small>' +
          (x.items || []).map((i) => E(i.name) + ' × ' + E(i.qty)).join(', ') + '</small></div>' +
          (x.status === 'refunded' && x.refund_cents != null ? '<strong>' + m(x.refund_cents) + '</strong>' : '') + '</div>';
      }).join('') + '</div>' : '') +
      (canReturn ? "<form id='retForm' class='ret-form' hidden><h3>Return something</h3>" +
        "<p class='note'>Choose what you would like to send back. We email you within a working day with what to do next, so please do not post anything yet.</p>" +
        (o.items || []).map((i) => "<div class='ret-item'><label class='chk'><input type='checkbox' name='it' value='" + E(i.id) + "'> " + E(i.name) + '</label>' +
          ((i.qty || 1) > 1 ? "<label class='ret-qty'>How many<select name='q_" + E(i.id) + "'>" + Array.from({ length: i.qty }, (_, k) => "<option>" + (k + 1) + '</option>').join('') + '</select></label>' : '') + '</div>').join('') +
        "<label>Why are you returning it?<select name='reason' required><option value=''>Choose a reason</option>" + REASONS.map((x) => "<option value='" + x[0] + "'>" + x[1] + '</option>').join('') + '</select></label>' +
        "<label>Anything we should know? (optional)<textarea name='note' rows='3' maxlength='1000' placeholder='For a fault, tell us what happened. A photo helps: you can send it in the chat.'></textarea></label>" +
        "<p class='note'>You have 14 days from delivery to change your mind, and 30 days if something is wrong with it. See <a href='/returns'>delivery and returns</a>.</p>" +
        "<button class='btn btn-solid'>Send return request</button><p class='err' role='alert'></p></form>" : ''));
    box.dataset.order = JSON.stringify(o);
    if (canReturn && /[?&]return=1/.test(location.search)) { $('#retForm').hidden = false; $('#retForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  async function retSend(f) {
    const c = trackCreds(), err = $('.err', f), btn = $('button', f);
    const items = $$('[name=it]:checked', f).map((x) => ({ id: x.value, qty: +((f.elements['q_' + x.value] || {}).value || 1) }));
    if (!items.length) { err.textContent = 'Tick at least one piece.'; return; }
    if (!f.elements.reason.value) { err.textContent = 'Choose a reason.'; return; }
    btn.disabled = true; err.textContent = '';
    const r = await sb.rpc('return_request', { p_number: c.o, p_email: c.e, p_items: items, p_reason: f.elements.reason.value, p_note: f.elements.note.value });
    btn.disabled = false;
    if (r.error) { err.textContent = /rate limit/.test(r.error.message) ? 'Too many requests in a short time. Please try again later.' : r.error.message; return; }
    toast('Return request sent');
    const box = $('#trackOut .trackbox');
    $$('.svc-acts,.ret-list,.ret-form', box).forEach((x) => x.remove());
    delete box.dataset.svc;
    await trackExtras();
    const list = $('#trackOut .ret-list');
    if (list) { list.insertAdjacentHTML('afterbegin', "<p class='ret-done'>Thank you. Your return number is <strong>" + E(r.data.ref) + '</strong>. We have emailed you a copy and will be in touch within a working day.</p>'); list.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }
  const trackOut = () => $('#trackOut');
  new MutationObserver(() => { if (trackOut()) trackExtras(); }).observe(document.body, { childList: true, subtree: true });
  // Account page: a "Return or receipt" link next to each order's Track link.
  const acc = $('#accountPage');
  if (acc) new MutationObserver(() => {
    $$("a.link[href^='/track?o=']", acc).forEach((a) => {
      if (a.nextElementSibling && a.nextElementSibling.classList.contains('svc-acc')) return;
      a.insertAdjacentHTML('afterend', "<br><a class='link svc-acc' href='" + E(a.getAttribute('href')) + "&return=1'>Return or receipt</a>");
    });
  }).observe(acc, { childList: true, subtree: true });

  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-pa],[data-receipt],[data-ret-open],[data-install],[data-install-x]');
    if (!t) return;
    if (t.dataset.pa) {
      if (t.dataset.pa === 'wish') {
        const ids = (typeof wish !== 'undefined' ? wish : []).filter((id) => byId(id));
        paDialog(ids, ids.length === 1 ? byId(ids[0]).name : 'anything on your wishlist (' + ids.length + ' pieces)');
      } else paDialog([t.dataset.pa], t.dataset.paName || 'this piece');
    } else if (t.hasAttribute('data-receipt')) {
      const box = t.closest('.trackbox');
      if (!window.lbDoc || !box || !box.dataset.order) return;
      seller = seller || await window.lbDoc.seller(sb);
      window.lbDoc.print(window.lbDoc.html(JSON.parse(box.dataset.order), seller, 'customer'));
    } else if (t.hasAttribute('data-ret-open')) {
      const f = $('#retForm'); if (f) { f.hidden = !f.hidden; if (!f.hidden) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    } else if (t.hasAttribute('data-install')) { e.preventDefault(); install(); }
    else if (t.hasAttribute('data-install-x')) { store.set('lb_app_x', Date.now()); hideCard(); }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'paForm') { e.preventDefault(); paSave(e.target); }
    else if (e.target.id === 'retForm') { e.preventDefault(); retSend(e.target); }
  });

  // ================================================================ install as an app
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferred = null;
  if ('serviceWorker' in navigator) addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  try {
    if (!sessionStorage.getItem('lb_seen')) { sessionStorage.setItem('lb_seen', '1'); store.set('lb_visits', store.get('lb_visits', 0) + 1); }
  } catch (x) { /* private mode */ }
  function hideCard() { const c = $('#appCard'); if (c) c.remove(); document.body.classList.remove('has-appcard'); }
  function showCard() {
    if (standalone || $('#appCard') || innerWidth > 760) return;
    if (store.get('lb_visits', 0) < 2) return;
    if (Date.now() - store.get('lb_app_x', 0) < 30 * 864e5) return;
    if (!deferred && !ios) return;
    document.body.insertAdjacentHTML('beforeend', "<aside id='appCard' class='app-card' aria-label='Get the app'><img src='/icon-192.png' alt='' width='44' height='44'>" +
      "<div><strong>Get the Luna Belly app</strong><span>" + (deferred ? 'Opens straight from your home screen.' : 'Tap <b>Share</b>, then <b>Add to Home Screen</b>.') + '</span></div>' +
      (deferred ? "<button type='button' class='btn btn-solid' data-install>Install</button>" : '') +
      "<button type='button' class='x' data-install-x aria-label='Not now'>×</button></aside>");
    document.body.classList.add('has-appcard');
  }
  function menuLink() {
    const nav = $('#nav');
    if (!nav || standalone || $('.nav-app', nav) || (!deferred && !ios)) return;
    nav.insertAdjacentHTML('beforeend', "<a class='nav-app' href='#' data-install>Get the app</a>");
  }
  async function install() {
    if (deferred) { deferred.prompt(); const c = await deferred.userChoice; deferred = null; hideCard(); if (c && c.outcome === 'accepted') toast('Installing Luna Belly'); return; }
    if (ios) toast('Tap Share, then Add to Home Screen');
  }
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; showCard(); menuLink(); });
  addEventListener('appinstalled', () => { deferred = null; hideCard(); const l = $('.nav-app'); if (l) l.remove(); });
  setTimeout(() => { showCard(); menuLink(); }, 2500);
})();
