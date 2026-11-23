'use strict';
/* Shop looks. Loads after app.js and the other shop scripts; app.js is not edited.
   - Fly to cart: the piece's photo floats into the cart and the counter bounces (wraps addToCart).
   - Loading placeholders for the blog, articles, account and shared lists (the shop grid and product page already had them).
   - Top bar messages written in Studio (setting bar_messages; refills app.js's BAR list).
   - Bottom bar on phones: Home, Search, Wishlist, Cart.
   - Night mode switch in the header (theme.js does the switching). */
(function () {
  if (typeof sb === 'undefined') return;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const svg = (d) => "<svg viewBox='0 0 24 24' aria-hidden='true'>" + d + '</svg>';
  const ICON = {
    home: "<path d='M3.5 11 12 4l8.5 7'/><path d='M5.5 9.5V20h13V9.5'/><path d='M10 20v-5.5h4V20'/>",
    search: "<circle cx='11' cy='11' r='6.5'/><path d='M16 16l4.5 4.5'/>",
    wish: "<path d='M12 20.6 4.3 12.9a5 5 0 0 1 7.1-7l.6.6.6-.6a5 5 0 0 1 7.1 7z'/>",
    cart: "<path d='M5 8h14l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z'/><path d='M9 8V6a3 3 0 0 1 6 0v2'/>",
    moon: "<path class='i-moon' d='M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'/>",
    sun: "<g class='i-sun'><circle cx='12' cy='12' r='4'/><path d='M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4'/></g>",
  };

  // ================================================================ night mode switch
  const tools = $('header.top .tools');
  const root = document.documentElement;
  if (tools && window.lbTheme) {
    const acc = $('[data-account]', tools);
    const html = "<button type='button' class='icon-btn theme-btn' aria-pressed='false'>" + svg(ICON.moon + ICON.sun) + '</button>';
    if (acc) acc.insertAdjacentHTML('beforebegin', html); else tools.insertAdjacentHTML('beforeend', html);
    const btn = $('.theme-btn', tools);
    const paint = () => {
      const dark = root.getAttribute('data-theme') === 'dark';
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', dark ? 'Switch to day mode' : 'Switch to night mode');
      btn.title = dark ? 'Day mode' : 'Night mode';
    };
    paint();
    btn.addEventListener('click', () => { window.lbTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); paint(); });
    new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // ================================================================ bottom bar on phones
  document.body.insertAdjacentHTML('beforeend', "<nav class='bnav' aria-label='Shop shortcuts'>" +
    "<a href='/' data-bn='home'>" + svg(ICON.home) + '<span>Home</span></a>' +
    "<button type='button' data-bn='search'>" + svg(ICON.search) + '<span>Search</span></button>' +
    "<a href='/wishlist' data-bn='wish'><i>" + svg(ICON.wish) + "<b class='bn-n' id='bnWish' hidden>0</b></i><span>Wishlist</span></a>" +
    "<button type='button' data-bn='cart' data-action='cart-open' aria-label='Cart'><i>" + svg(ICON.cart) + "<b class='bn-n' id='bnCart' hidden>0</b></i><span>Cart</span></button></nav>");
  document.body.classList.add('has-bnav');
  const bnav = $('.bnav');
  function counts() {
    [['#wishCount', '#bnWish'], ['#cartCount', '#bnCart']].forEach((p) => {
      const from = $(p[0]), to = $(p[1]);
      if (!from || !to) return;
      const n = parseInt(from.textContent, 10) || 0;
      to.textContent = n > 99 ? '99+' : n;
      to.hidden = n < 1;
    });
  }
  ['#wishCount', '#cartCount'].forEach((s) => { const el = $(s); if (el) new MutationObserver(counts).observe(el, { childList: true, characterData: true, subtree: true }); });
  counts();
  function current() {
    const p = location.pathname.replace(/\/$/, '') || '/';
    const on = p === '/' ? 'home' : p === '/wishlist' ? 'wish' : '';
    $$('[data-bn]', bnav).forEach((a) => { if (a.dataset.bn === on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  current();
  addEventListener('popstate', current);
  document.addEventListener('click', () => setTimeout(current, 60));
  $("[data-bn='search']", bnav).addEventListener('click', () => {
    const b = $('header.top .search-btn');
    if (b) b.click(); else location.href = '/#search';
  });
  // Hide the bar while typing, so it does not sit on top of the phone keyboard.
  const typing = (el) => el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]),textarea,select');
  document.addEventListener('focusin', (e) => { if (typing(e.target)) document.body.classList.add('kb'); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!typing(document.activeElement)) document.body.classList.remove('kb'); }, 80));

  // ================================================================ fly to cart
  let src = null;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const box = b.closest('.card,.pp,.ctl,.share-item,.look,.bundle,li,article') || null;
    src = box ? $$('img', box).find(visible) || null : null;
  }, true);
  function bump() {
    $$('#cartCount,#bnCart,.bnav [data-bn=cart] svg,.cart-btn > svg').forEach((el) => {
      el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    });
  }
  document.addEventListener('animationend', (e) => { if (e.target.classList && e.target.classList.contains('bump')) e.target.classList.remove('bump'); });
  function target() {
    const b = $(".bnav [data-bn='cart']");
    if (visible(b)) return b;
    return $('.cart-btn');
  }
  function fly(img) {
    const t = target();
    if (!img || !t || reduce || !img.complete) { bump(); return; }
    const a = img.getBoundingClientRect(), b = t.getBoundingClientRect();
    if (!a.width || a.bottom < 0 || a.top > innerHeight) { bump(); return; }
    const c = img.cloneNode(false);
    c.removeAttribute('loading'); c.removeAttribute('srcset'); c.alt = ''; c.className = 'fly-img'; c.setAttribute('aria-hidden', 'true');
    c.style.left = a.left + 'px'; c.style.top = a.top + 'px'; c.style.width = a.width + 'px'; c.style.height = a.height + 'px';
    document.body.appendChild(c);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const end = Math.max(22 / a.width, 0.05);
    const anim = c.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1, borderRadius: '16px' },
      { transform: 'translate(' + dx * 0.45 + 'px,' + (dy * 0.45 - 70) + 'px) scale(.42)', opacity: 0.95, borderRadius: '40%', offset: 0.5 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + end + ')', opacity: 0.25, borderRadius: '50%' },
    ], { duration: 760, easing: 'cubic-bezier(.45,0,.25,1)' });
    const done = () => { c.remove(); bump(); };
    anim.onfinish = done; anim.oncancel = done;
  }
  if (typeof addToCart === 'function') {
    const base = addToCart;
    addToCart = function () { // eslint-disable-line no-global-assign
      const img = src; src = null;
      const r = base.apply(this, arguments);
      try { fly(img); } catch (x) { bump(); }
      return r;
    };
  }

  // ================================================================ more loading placeholders
  const line = (cls) => "<div class='sk sk-line" + (cls ? ' ' + cls : '') + "'></div>";
  const SK_POSTS = "<div class='sk-posts'>" + [1, 2, 3].map(() => "<div class='sk-post'><div class='sk sk-cover'></div>" + line('lg') + line() + line('sm') + '</div>').join('') + '</div>';
  const SK_TEXT = "<div class='sk-text'>" + line('lg') + line() + line() + line('sm') + "<div class='sk sk-block'></div>" + line() + line('sm') + '</div>';
  const SK_CARDS = "<div class='grid sk-grid'>" + [1, 2, 3, 4].map(() => "<div class='card skel'><div class='sk sk-media'></div>" + line() + line('sm') + '</div>').join('') + '</div>';
  function placeholders(box) {
    $$('p.note', box).forEach((p) => {
      if (p.textContent.trim() !== 'Loading…') return;
      const blogList = box.id === 'pagePage' && /^\/blog\/?$/.test(location.pathname);
      p.outerHTML = "<div class='sk-wrap' role='status' aria-label='Loading'>" + (blogList ? SK_POSTS : SK_TEXT) + '</div>';
    });
    const h = $('h1', box);
    if (box.id === 'wishPage' && h && h.textContent.trim() === 'Loading…' && !$('.sk-wrap', box) && SK_CARDS) {
      h.classList.add('sk-h'); h.insertAdjacentHTML('afterend', "<div class='sk-wrap' role='status' aria-label='Loading'>" + SK_CARDS + '</div>');
    }
  }
  ['#pagePage', '#accountPage', '#wishPage'].forEach((s) => {
    const box = $(s);
    if (!box) return;
    placeholders(box);
    new MutationObserver(() => placeholders(box)).observe(box, { childList: true, subtree: true });
  });

  // ================================================================ top bar messages from Studio
  if (typeof BAR !== 'undefined' && Array.isArray(BAR)) {
    // app.js's built-in list said the pieces are handcrafted in Birmingham, which is not true of most of them.
    // Swap that line straight away, so it never shows even if the Studio messages fail to load.
    BAR.forEach((f, i) => { try { if (/small batches/i.test(f())) BAR[i] = () => 'Chosen from jewellery makers in India, Hong Kong and beyond'; } catch (x) { /* ignore */ } });
    Promise.resolve(sb.from('site_settings').select('value').eq('key', 'bar_messages').maybeSingle()).then((r) => {
      let list = [];
      try { list = JSON.parse(r.data.value); } catch (x) { return; }
      if (!Array.isArray(list)) return;
      list = list.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 6);
      if (!list.length) return;
      const fill = (s) => esc(s)
        .replace(/\{free\}/gi, () => "<span data-free>" + short(FREE_SHIP) + '</span>')
        .replace(/\{wrap\}/gi, () => "<span data-wrap>" + short(WRAP) + '</span>');
      BAR.length = 0;
      list.forEach((s) => BAR.push(() => fill(s)));
      try { barAt = 0; } catch (x) { /* not reachable */ }
      const el = $('#barMsg');
      if (el) el.innerHTML = BAR[0]();
    }).catch(() => {});
  }
})();
