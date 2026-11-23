'use strict';
/* Luna shop helper: a small automated helper for customers. No AI service is used; it answers from the
   shop's own products, settings and FAQ page. Anything it cannot answer goes to the real chat with the
   shop (app.js chatOpen). Loads after app.js and reuses its globals (products, SHIP, FREE_SHIP, WRAP,
   money, short, link, esc, chatOpen, chatToken). */
(function () {
  if (typeof chatOpen !== 'function') return;
  const $ = (s, r) => (r || document).querySelector(s);
  const fab = $('.chat-fab');
  if (!fab) return;
  const e = (s) => esc(s);

  // ------------------------------------------------------------------ knowledge
  let FAQ = [];
  fetch('/faq', { credentials: 'same-origin' }).then((r) => r.text()).then((html) => {
    const m = html.match(/<script type=['"]application\/ld\+json['"]>([\s\S]*?)<\/script>/);
    if (!m) return;
    const d = JSON.parse(m[1]);
    FAQ = (d.mainEntity || []).map((q) => ({ q: q.name, a: (q.acceptedAnswer || {}).text || '' }));
  }).catch(() => { /* the built-in answers still work */ });
  const faq = (re) => FAQ.find((x) => re.test(x.q));
  const placeholder = (t) => /\[[^\]]+\]/.test(t);
  const STOP = new Set('a an and are as at be but by can do does for from have how i if in is it its me my of on or our so that the this to was we what when where which who why will with you your yours please could would should get there any about'.split(' '));
  const words = (t) => t.toLowerCase().replace(/[^a-z0-9£ ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
  const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
  const has = (t, list) => list.some((k) => (k instanceof RegExp ? k.test(t) : t.indexOf(k) >= 0));
  const inStock = () => (typeof products !== 'undefined' ? products : []).filter((p) => p.in_stock);
  const all = () => (typeof products !== 'undefined' ? products : []);
  const pLink = (p) => "<a href='" + link(p) + "'>" + e(p.name) + '</a>';
  const fits = (p) => (p.adjust_min_cm && p.adjust_max_cm ? p.adjust_min_cm + '–' + p.adjust_max_cm + ' cm' : '');

  function findProduct(t) {
    const tw = words(t).map(stem);
    let best = null, score = 0;
    all().forEach((p) => {
      const pw = words(p.name).map(stem).filter((w) => w.length > 2 && ['chain', 'waist', 'belly'].indexOf(w) < 0);
      const hit = pw.filter((w) => tw.indexOf(w) >= 0).length;
      const s = hit / Math.max(pw.length, 1) + hit;
      if (hit && s > score) { score = s; best = p; }
    });
    return score >= 1 ? best : null;
  }
  function waistCm(t) {
    if (/£|\b(under|below|less than|budget|price|cost|pounds?|gbp)\b/i.test(t)) return null;
    const m = t.match(/(\d{2,3}(?:\.\d)?)\s*(cm|centimet|in\b|inch|inches|")?/i);
    if (!m) return null;
    let n = parseFloat(m[1]);
    const unit = (m[2] || '').toLowerCase();
    if (unit.startsWith('in') || unit === '"' || (!unit && n >= 20 && n <= 55)) n = Math.round(n * 2.54);
    return n >= 45 && n <= 170 ? n : null;
  }

  // Each answer: { html, support?: bool, chips?: [] }
  const SUPPORT = { support: true };
  function answer(raw) {
    const t = ' ' + raw.toLowerCase().trim() + ' ';
    if (has(t, [/\b(human|person|someone|agent|staff|real people|speak to|talk to|call you|phone)\b/])) {
      return { html: "Of course. Tap <strong>Chat with us</strong> below and the team will reply themselves.", support: true };
    }
    if (has(t, [/^\s*(hi|hello|hey|hiya|good (morning|afternoon|evening))\b/]) && words(t).length <= 3) {
      return { html: 'Hello! Ask me about sizes, materials, delivery, returns, gifts, or a particular piece.', chips: ['Find my size', 'Gift ideas', 'Delivery'] };
    }
    if (has(t, [/\b(thanks|thank you|cheers|ta)\b/])) return { html: "You're welcome! Anything else I can help with?" };

    const p = findProduct(t);
    const cm = waistCm(t);

    if (cm && (has(t, ['size', 'fit', 'waist', 'measure', 'cm', 'inch', 'hips', '"']) || /^\s*\d{2,3}(\.\d)?\s*$/.test(t))) {
      const ok = inStock().filter((x) => x.adjust_min_cm && x.adjust_max_cm && cm >= x.adjust_min_cm && cm <= x.adjust_max_cm);
      const snug = ok.filter((x) => cm > x.adjust_max_cm - 3);
      if (p) {
        const f = p.adjust_min_cm && p.adjust_max_cm && cm >= p.adjust_min_cm && cm <= p.adjust_max_cm;
        return { html: f ? pLink(p) + ' fits a ' + cm + ' cm waist (it adjusts ' + fits(p) + ').' + (cm > p.adjust_max_cm - 3 ? ' You are near the top of its range, so it will sit at its longest.' : '')
          : pLink(p) + ' adjusts ' + (fits(p) || 'with an extender chain') + ", so it may not suit a " + cm + ' cm waist. Want me to suggest pieces that fit?' };
      }
      if (!ok.length) return { html: "I couldn't find a piece in stock that adjusts to " + cm + ' cm. The team can check sizing for you, or advise on custom lengths.', support: true };
      return { html: 'For a waist of about <strong>' + cm + ' cm</strong>, these adjust to fit:<ul>' + ok.slice(0, 6).map((x) => '<li>' + pLink(x) + ' <small>(' + fits(x) + ', ' + short(x.price_cents) + ')</small></li>').join('') + '</ul>' +
        (snug.length ? '<small>Pieces where you are near the top of the range sit at their longest; the size guide explains more.</small>' : '') +
        "<p class='lh-more'><a href='/?fit=" + cm + "#shop'>See every piece in your size →</a></p>" };
    }
    if (has(t, ['size', 'fit', 'measure', 'waist', 'too big', 'too small', 'length', 'long is', 'adjust', 'plus'])) {
      if (p) return { html: pLink(p) + ' adjusts ' + (fits(p) ? 'to fit a waist of ' + fits(p) : 'with an extender chain') + ". Tell me your waist measurement and I'll check it fits." };
      return { html: 'Every chain is adjustable. Measure where you want it to sit (snug, one finger underneath), then tell me the number in cm or inches and I will list the pieces that fit. <a href="/size-guide">How to measure</a>', chips: ['My waist is 80 cm', 'My waist is 32 inches'] };
    }
    if (p) {
      return { html: '<strong>' + pLink(p) + '</strong>: ' + short(p.price_cents) + '. ' + (p.in_stock ? (p.stock_qty != null && p.stock_qty <= 3 ? 'Only ' + e(p.stock_qty) + ' left.' : 'In stock.') : 'Sold out at the moment; on its page you can ask to be emailed when it is back.') +
        (fits(p) ? ' Fits a waist of ' + fits(p) + '.' : '') + (p.material ? ' Material: ' + e(p.material) + '.' : '') + (p.handmade ? ' Handmade.' : '') };
    }
    const under = t.match(/(?:under|below|less than|up to|max|budget)\s*£?\s*(\d{1,4})/);
    if (under || has(t, ['cheap', 'affordable', 'budget', 'price'])) {
      const cap = under ? parseInt(under[1], 10) * 100 : null;
      const list = inStock().filter((x) => !cap || x.price_cents <= cap).sort((a, b) => a.price_cents - b.price_cents).slice(0, 5);
      if (!list.length) return { html: 'Nothing in stock under ' + short(cap) + ' right now, sorry.' };
      return { html: (cap ? 'Pieces under ' + short(cap) + ':' : 'Our most affordable pieces:') + '<ul>' + list.map((x) => '<li>' + pLink(x) + ' <small>' + short(x.price_cents) + '</small></li>').join('') + '</ul>' };
    }
    if (has(t, ['abroad', 'international', 'outside the uk', 'outside uk', 'overseas', 'worldwide', 'europe', 'usa', 'america', 'india', 'canada', 'australia', 'italy', 'france', 'germany', 'ireland'])) {
      const f = faq(/outside the UK/i);
      return { html: f && !placeholder(f.a) ? e(f.a) : 'For delivery outside the UK, please ask the team first and they will confirm the cost.', support: true };
    }
    if (has(t, ['deliver', 'delivery', 'shipping', 'ship ', 'postage', 'post ', 'arrive', 'dispatch', 'how long', 'when will'])) {
      return { html: 'We post from Birmingham across the UK. Delivery is ' + short(SHIP) + ', and free on orders over ' + short(FREE_SHIP) + '. Every piece comes boxed in a cotton pouch. Dispatch times are on our <a href="/returns">delivery and returns page</a>.', chips: ['Track my order', 'Returns'] };
    }
    if (has(t, ['return', 'refund', 'exchange', 'send back', 'change my mind', 'cancel'])) {
      return { html: 'You have <strong>14 days from delivery</strong> to change your mind. Send the piece back unworn in its packaging and we refund the item and standard delivery. Faulty or wrong items are covered for longer. Full details: <a href="/returns">delivery and returns</a>.' };
    }
    if (has(t, ['track', 'where is my order', 'order status', 'my order', 'not arrived', 'hasn\'t arrived', 'parcel'])) {
      return { html: 'You can follow your order on our <a href="/track">order tracking page</a> with your order number and email. If something looks wrong, the team will help.', support: true };
    }
    if (has(t, ['handmade', 'hand made', 'hand-made', 'made by hand', 'artisan'])) {
      const f = faq(/handmade/i);
      return { html: (f ? e(f.a) : 'Some pieces are handmade; they carry a Handmade badge.') + ' <a href="/c/handmade">See the handmade pieces</a>.' };
    }
    if (has(t, ['gift', 'present', 'wrap', 'birthday', 'anniversary', 'wedding', 'bride', 'bridal', 'for her', 'for my'])) {
      const finder = typeof window.lunaGiftFinder === 'function';
      return { html: 'Lovely! Tick <strong>This is a gift</strong> at checkout for gift wrapping (' + short(WRAP) + ') and a handwritten card; no prices go in the parcel. <a href="/gift-cards">Gift cards</a> are available too.' + (finder ? " Want help choosing? <button type='button' class='lh-link' data-lh-finder>Open the gift finder</button>" : '') };
    }
    if (has(t, ['allerg', 'nickel', 'skin', 'irritat', 'react', 'sensitive', 'rash'])) {
      const f = faq(/made of/i);
      return { html: (f ? e(f.a) : 'Each product page lists its base metal and plating.') + ' <a href="/care#allergy">Read more about materials</a>.', support: true };
    }
    if (has(t, ['clean', 'care', 'tarnish', 'shower', 'swim', 'water', 'perfume', 'storing', 'store it', 'store them', 'darken', 'fade'])) {
      return { html: 'Keep pieces dry, put them on after perfume and lotion, wipe with a soft dry cloth after wearing, and store them in their pouch. Plating wears with time, faster with moisture and friction. <a href="/care">Care guide</a>.' };
    }
    if (has(t, ['every day', 'everyday', 'daily', 'all the time', 'sleep'])) {
      const f = faq(/every day/i);
      if (f) return { html: e(f.a) };
    }
    if (has(t, ['material', 'made of', 'gold', 'silver', 'brass', 'steel', 'metal', 'real gold', 'plated', 'kundan', 'pearl'])) {
      const f = faq(/made of/i);
      return { html: (f ? e(f.a) : 'Each product page lists its base metal and plating.') + ' <a href="/care">Materials and care</a>.' };
    }
    if (has(t, ['discount', 'code', 'promo', 'coupon', 'voucher', 'offer', 'sale', 'deal', 'bundle', /\bsets?\b/])) {
      return { html: 'If you have a code, enter it in your cart before checkout. Some pieces are sold as a <strong>complete look</strong> with a saving when you buy the set; look for it on product pages. Joining our newsletter is the best way to hear about offers.' };
    }
    if (has(t, ['account', 'sign in', 'log in', 'login', 'register', 'password', 'wishlist', 'favourite', 'favorite', 'saved'])) {
      return { html: 'You do not need an account to order. With one, your wishlist and addresses are saved across devices. Tap the heart on any piece to save it, and see them all on your <a href="/wishlist">wishlist</a>. <a href="/account">Your account</a>.' };
    }
    if (has(t, ['how do i order', 'how to order', 'how to buy', 'how do i buy', 'checkout', 'place an order', 'add to cart', 'basket', 'cart'])) {
      return { html: 'It takes a minute:<ol><li>Open a piece and tap <strong>Add to cart</strong>.</li><li>Open the cart (top right) and tap <strong>Checkout</strong>.</li><li>Fill in your name, email and address, then <strong>Place order</strong>.</li></ol>You get an email confirming everything.' };
    }
    if (has(t, ['pay', 'payment', 'card', 'paypal', 'klarna', 'apple pay'])) {
      const f = faq(/pay/i);
      if (f && !placeholder(f.a)) return { html: e(f.a) };
      return { html: 'The team can explain payment options.', support: true };
    }
    if (has(t, ['custom', 'personalis', 'personaliz', 'bespoke', 'made to order', 'engrav'])) {
      return { html: 'For custom pieces or lengths, please ask the team with what you have in mind.', support: true };
    }
    if (has(t, ['package', 'packaging', 'box', 'pouch'])) {
      const f = faq(/packaged/i);
      if (f) return { html: e(f.a) };
    }
    // Last try: the closest FAQ question by shared words.
    const tw = words(t).map(stem);
    let best = null, bs = 0;
    FAQ.forEach((x) => {
      const qw = words(x.q + ' ' + x.a.slice(0, 120)).map(stem);
      const s = tw.filter((w) => w.length > 2 && qw.indexOf(w) >= 0).length;
      if (s > bs) { bs = s; best = x; }
    });
    if (best && bs >= 2 && !placeholder(best.a)) return { html: '<strong>' + e(best.q) + '</strong><br>' + e(best.a) + ' <a href="/faq">More answers</a>' };
    return { html: "I'm not sure about that one, but the team can help. They reply themselves, usually within the day.", support: true };
  }

  // ------------------------------------------------------------------ panel
  document.body.insertAdjacentHTML('beforeend',
    "<section id='lunaHelp' class='lh' role='dialog' aria-label='Shop helper' hidden>" +
      "<header class='lh-head'><span class='lh-av' aria-hidden='true'><svg viewBox='0 0 24 24'><path d='M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'/></svg></span>" +
      "<div class='lh-id'><strong>Luna</strong><small>Automated shop helper</small></div>" +
      "<button type='button' class='lh-x' data-lh-close aria-label='Close'><svg viewBox='0 0 24 24'><path d='M6 6l12 12M18 6L6 18'/></svg></button></header>" +
      "<div class='lh-log' aria-live='polite'></div>" +
      "<div class='lh-resolve' hidden><span>Did we resolve your issue?</span><button type='button' data-lh-yes>Yes</button><button type='button' data-lh-no>No</button></div>" +
      "<form class='lh-form'><input type='text' maxlength='300' placeholder='Ask about sizes, delivery, gifts…' aria-label='Your question' autocomplete='off'><button class='lh-send' aria-label='Send'><svg viewBox='0 0 24 24'><path d='M5 12h13M13 6l6 6-6 6'/></svg></button></form>" +
      "<button type='button' class='lh-human' data-lh-human>Chat with us, a real person</button>" +
    '</section>');
  const box = $('#lunaHelp'), log = $('.lh-log', box), form = $('.lh-form', box), input = $('input', form), resolveBar = $('.lh-resolve', box);
  const scroll = () => { log.scrollTop = log.scrollHeight; };

  // The conversation is kept in this browser until the customer says it is resolved (or 7 days pass),
  // so moving between pages never loses it.
  const KEY = 'lb_luna', DAYS = 7;
  let hist = [];
  const store = {
    get() { try { const v = JSON.parse(localStorage.getItem(KEY)); return v && Date.now() - v.t < DAYS * 864e5 && Array.isArray(v.items) ? v.items : []; } catch (x) { return []; } },
    set() { try { localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), items: hist.slice(-60) })); } catch (x) { /* private mode */ } },
    clear() { try { localStorage.removeItem(KEY); sessionStorage.removeItem('lb_luna_open'); } catch (x) { /* ignore */ } },
    openFlag(v) { try { if (v) sessionStorage.setItem('lb_luna_open', '1'); else sessionStorage.removeItem('lb_luna_open'); } catch (x) { /* ignore */ } },
    wasOpen() { try { return sessionStorage.getItem('lb_luna_open') === '1'; } catch (x) { return false; } },
  };
  function paint(who, html, extra) {
    const d = document.createElement('div');
    d.className = 'lh-msg ' + (who === 'me' ? 'lh-me' : 'lh-bot');
    if (who === 'me') d.textContent = html; else d.innerHTML = html;
    log.appendChild(d);
    if (extra && extra.support) log.insertAdjacentHTML('beforeend', "<div class='lh-cta'><span>Need a person?</span><button type='button' class='btn btn-solid' data-lh-human>Chat with customer support</button></div>");
    if (extra && extra.chips) log.insertAdjacentHTML('beforeend', "<div class='lh-chips'>" + extra.chips.map((c) => "<button type='button' class='lh-chip' data-lh-ask='" + e(c) + "'>" + e(c) + '</button>').join('') + '</div>');
  }
  const asked = () => hist.some((h) => h.who === 'me');
  const say = (who, html, extra) => {
    paint(who, html, extra);
    hist.push({ who, html, extra: extra ? { support: !!extra.support, chips: extra.chips || null } : null });
    store.set();
    resolveBar.hidden = !asked();
    scroll();
  };
  const greet = () => say('bot', "Hi, I'm Luna, the shop's automated helper. I can answer quick questions about sizes, materials, delivery, returns and gifts.", { chips: ['Find my size', 'Delivery', 'Returns', 'Gift ideas', 'Care and materials', 'Track my order'] });
  hist = store.get();
  hist.forEach((h) => paint(h.who, h.html, h.extra));
  let started = hist.length > 0;
  resolveBar.hidden = !asked();
  function open() {
    box.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    store.openFlag(true);
    if (!started) { started = true; greet(); }
    scroll();
    if (window.innerWidth > 700) setTimeout(() => input.focus(), 30);
  }
  function close() { box.hidden = true; fab.setAttribute('aria-expanded', 'false'); store.openFlag(false); }
  function ask(q) {
    q = String(q || '').trim();
    if (!q) return;
    say('me', q);
    const a = answer(q === 'Find my size' ? 'size' : q === 'Gift ideas' ? 'gift' : q === 'Care and materials' ? 'care' : q === 'Track my order' ? 'track my order' : q);
    setTimeout(() => say('bot', a.html, a), 220);
  }
  function resolved() {
    hist = [];
    store.clear();
    log.innerHTML = '';
    resolveBar.hidden = true;
    paint('bot', "Wonderful, I'm glad that helped. This conversation is now cleared. Press <strong>Chat</strong> any time if you need anything else.");
    started = false;
    setTimeout(() => { close(); log.innerHTML = ''; }, 2200);
  }
  window.lunaHelp = { answer, open };

  // The Chat button opens the helper first, unless a conversation with the team is already going.
  const chatting = () => {
    const dot = document.getElementById('chatDot');
    return (typeof chatToken !== 'undefined' && chatToken) || (dot && !dot.hidden) || document.getElementById('chat').classList.contains('open');
  };
  fab.addEventListener('click', (ev) => {
    if (chatting()) { close(); return; }
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (box.hidden) open(); else close();
  }, true);
  box.addEventListener('click', (ev) => {
    const t = ev.target.closest('[data-lh-close],[data-lh-human],[data-lh-ask],[data-lh-finder],[data-lh-yes],[data-lh-no],a');
    if (!t) return;
    if (t.hasAttribute('data-lh-close')) close();
    else if (t.hasAttribute('data-lh-human')) { close(); chatOpen(true); }
    else if (t.dataset.lhAsk) ask(t.dataset.lhAsk);
    else if (t.hasAttribute('data-lh-finder')) { close(); window.lunaGiftFinder(); }
    else if (t.hasAttribute('data-lh-yes')) resolved();
    else if (t.hasAttribute('data-lh-no')) say('bot', "Sorry about that. Try asking another way, or a real person can help.", { support: true });
  });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); const q = input.value; input.value = ''; ask(q); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !box.hidden) close(); });
  // Reopen after moving to another page if it was open (on larger screens, so it never covers a phone screen).
  if (started && store.wasOpen() && window.innerWidth > 700 && !chatting()) open();

  // ------------------------------------------------------------------ "See all that fit": /?fit=80
  const fitCm = (() => { const m = location.search.match(/[?&]fit=(\d{2,3})/); const n = m ? +m[1] : 0; return n >= 45 && n <= 170 ? n : 0; })();
  if (fitCm && typeof renderGrid === 'function') {
    const baseGrid = renderGrid;
    let scrolled = false;
    renderGrid = function () { // eslint-disable-line no-global-assign
      const every = products;
      const list = every.filter((p) => p.adjust_min_cm && p.adjust_max_cm && fitCm >= p.adjust_min_cm && fitCm <= p.adjust_max_cm);
      products = list; // eslint-disable-line no-global-assign
      try { baseGrid.apply(this, arguments); } finally { products = every; } // eslint-disable-line no-global-assign
      if (typeof paintWish === 'function') paintWish();
      const grid = document.getElementById('grid');
      if (!grid || !every.length) return;
      let bar = document.getElementById('fitBar');
      if (!bar) { grid.insertAdjacentHTML('beforebegin', "<div id='fitBar' class='fitbar' role='status'></div>"); bar = document.getElementById('fitBar'); }
      const n = grid.querySelectorAll('.card').length;
      bar.innerHTML = '<span>' + (list.length ? 'Showing <strong>' + n + '</strong> ' + (n === 1 ? 'piece' : 'pieces') + ' that fit a <strong>' + fitCm + ' cm</strong> waist' : 'No pieces adjust to ' + fitCm + ' cm yet. The team can help in the chat.') + "</span><a class='btn btn-line' href='/#shop'>Show everything</a>";
      if (!scrolled) { scrolled = true; setTimeout(() => { const s = document.getElementById('shop'); if (s) s.scrollIntoView({ block: 'start' }); }, 60); }
    };
    if (products.length) renderGrid(); // the shop may have loaded before this script ran
  }

  // ------------------------------------------------------------------ "Did we resolve your issue?" in the chat with the team
  const chat = document.getElementById('chat'), chatForm = document.getElementById('chatForm'), chatLog = document.getElementById('chatLog');
  if (chat && chatForm && chatLog) {
    chatForm.insertAdjacentHTML('beforebegin', "<div id='chatResolve' class='lh-resolve chat-resolve' hidden><span>Did we resolve your issue?</span><button type='button' data-cr='yes'>Yes</button><button type='button' data-cr='no'>No</button></div>");
    const bar = document.getElementById('chatResolve');
    const saidNo = () => { try { return sessionStorage.getItem('lb_cr_no') === String(chatToken); } catch (x) { return false; } };
    const sync = () => { bar.hidden = !(typeof chatToken !== 'undefined' && chatToken && chatLog.querySelector('.msg.me') && !saidNo()); };
    new MutationObserver(sync).observe(chatLog, { childList: true });
    sync();
    bar.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-cr]');
      if (!b) return;
      if (b.dataset.cr === 'no') {
        try { sessionStorage.setItem('lb_cr_no', String(chatToken)); } catch (x) { /* ignore */ }
        bar.hidden = true;
        toast('No problem, the chat stays open. Tell us more and we will reply here.');
        const i = document.getElementById('chatInput'); if (i) i.focus();
        return;
      }
      b.disabled = true;
      const r = await sb.rpc('chat_resolve', { p_token: chatToken });
      b.disabled = false;
      if (r.error) { toast('That did not go through. Please try again.'); return; }
      chatToken = null; save('lb_chat', null); // eslint-disable-line no-global-assign
      chatSeen = 0; save('lb_chat_seen', 0); chatCount = -1; // eslint-disable-line no-global-assign
      const dot = document.getElementById('chatDot'); if (dot) dot.hidden = true;
      chatOpen(false);
      chatLog.innerHTML = '';
      bar.hidden = true;
      toast('Thank you! This chat is closed. Press Chat any time to start again.');
    });
  }
})();
