'use strict';
/* Shop additions. Loads after app.js and account.js and reuses their globals (sb, products,
   wish, save, paintWish, toggleWish, openCheckout, byId). app.js is otherwise unchanged.
   1. Handmade badge on the photo of every piece ticked Handmade in the Studio.
   2. Wishlist kept in the customer's account, so it follows them across devices.
   3. Checkout filled in from the customer's saved addresses.
   4. A "Pay now" button after ordering, once the owner adds a payment link in the Studio. */
(function () {
  if (typeof sb === 'undefined') return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var all = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var user = null;
  var ready = sb.auth.getSession().then(function (r) { user = r.data && r.data.session ? r.data.session.user : null; return user; })
    .catch(function () { return null; });

  // Rotating banner: honest wording (most pieces are sourced, not made by the shop).
  if (typeof BAR !== 'undefined' && BAR.length > 1) BAR[1] = function () { return 'Chosen from jewellery makers around the world'; };

  // ---------------------------------------------------------------- 1. Handmade badge
  var handmadeSlugs = function () {
    var out = {};
    (typeof products !== 'undefined' ? products : []).forEach(function (p) { if (p.handmade) out[p.slug] = 1; });
    return out;
  };
  var BADGE = "<span class='hm-badge' aria-label='Handmade'><svg viewBox='0 0 24 24' aria-hidden='true'><path d='M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z'/></svg>Handmade</span>";
  var badges = function () {
    var hm = handmadeSlugs();
    all('a.card-media').forEach(function (a) {
      var slug = decodeURIComponent((a.getAttribute('href') || '').replace(/^\/p\//, ''));
      var has = a.querySelector('.hm-badge');
      if (hm[slug] && !has) a.insertAdjacentHTML('beforeend', BADGE);
      else if (!hm[slug] && has) has.remove();
    });
    var pm = $('#productPage:not([hidden]) .pp-media');
    if (pm) {
      var slug = decodeURIComponent(location.pathname.replace(/^\/p\//, ''));
      var on = location.pathname.indexOf('/p/') === 0 && hm[slug];
      var b = pm.querySelector('.hm-badge');
      if (on && !b) pm.insertAdjacentHTML('beforeend', BADGE);
      else if (!on && b) b.remove();
    }
  };
  var t;
  new MutationObserver(function () { clearTimeout(t); t = setTimeout(badges, 30); })
    .observe(document.body, { childList: true, subtree: true });

  // ---------------------------------------------------------------- 2. Wishlist in the account
  // The account copy is the source of truth while signed in. lb_wish_synced remembers what was
  // last agreed with the account, so additions and removals made on either side both survive.
  var listId = null;
  var syncedKey = function () { return 'lb_wish_synced_' + (user ? user.id : ''); };
  var readSynced = function () { try { return JSON.parse(localStorage.getItem(syncedKey())) || []; } catch (e) { return []; } };
  var writeSynced = function (ids) { try { localStorage.setItem(syncedKey(), JSON.stringify(ids)); } catch (e) { /* private mode */ } };
  var defaultList = async function () {
    if (listId) return listId;
    var r = await sb.from('lists').select('id,is_default,name').eq('user_id', user.id).order('created_at');
    var rows = r.data || [];
    var d = rows.filter(function (l) { return l.is_default; })[0] || rows.filter(function (l) { return l.name === 'Wishlist'; })[0];
    if (!d) {
      var c = await sb.from('lists').insert({ user_id: user.id, name: 'Wishlist', is_default: true }).select('id').maybeSingle();
      d = c.data;
    }
    listId = d ? d.id : null;
    return listId;
  };
  var syncWish = async function () {
    if (!user || typeof wish === 'undefined') return;
    var id = await defaultList();
    if (!id) return;
    var r = await sb.from('list_items').select('product_id').eq('list_id', id);
    if (r.error) return;
    var server = (r.data || []).map(function (x) { return x.product_id; });
    var synced = readSynced();
    var local = wish.slice();
    var added = local.filter(function (x) { return synced.indexOf(x) < 0 && server.indexOf(x) < 0; });
    var removed = synced.filter(function (x) { return local.indexOf(x) < 0 && server.indexOf(x) >= 0; });
    if (added.length) await sb.from('list_items').upsert(added.map(function (p) { return { list_id: id, product_id: p }; }), { onConflict: 'list_id,product_id', ignoreDuplicates: true });
    if (removed.length) await sb.from('list_items').delete().eq('list_id', id).in('product_id', removed);
    var merged = server.filter(function (x) { return removed.indexOf(x) < 0; }).concat(added);
    wish.length = 0;
    merged.forEach(function (x) { wish.push(x); });
    save('lb_wish', wish);
    writeSynced(merged);
    if (typeof paintWish === 'function') paintWish();
  };
  if (typeof toggleWish === 'function') {
    var origToggle = toggleWish;
    toggleWish = async function (pid) { // eslint-disable-line no-global-assign
      origToggle(pid);
      if (!user) return;
      var id = await defaultList();
      if (!id) return;
      var on = wish.indexOf(pid) >= 0;
      var r = on
        ? await sb.from('list_items').upsert({ list_id: id, product_id: pid }, { onConflict: 'list_id,product_id', ignoreDuplicates: true })
        : await sb.from('list_items').delete().eq('list_id', id).eq('product_id', pid);
      if (!r.error) writeSynced(wish.slice());
    };
  }
  ready.then(syncWish);
  if (sb.auth && typeof sb.auth.onAuthStateChange === 'function') sb.auth.onAuthStateChange(function (ev, session) {
    var next = session ? session.user : null;
    if ((next && next.id) === (user && user.id)) return;
    user = next; listId = null;
    if (user) syncWish();
  });

  // ---------------------------------------------------------------- 3. Saved addresses at checkout
  var addrs = [];
  var F = { name: 'name', line1: 'address1', line2: 'address2', city: 'city', postal_code: 'postal', country: 'country', phone: 'phone' };
  var fill = function (form, a, onlyEmpty) {
    Object.keys(F).forEach(function (k) {
      var el = form.elements[F[k]];
      if (!el || a[k] == null || a[k] === '') return;
      if (onlyEmpty && el.value && !(F[k] === 'country' && el.value === 'United Kingdom')) return;
      el.value = a[k];
    });
  };
  var prefill = async function () {
    var form = $('#checkoutForm');
    if (!form) return;
    await ready;
    if (!user) return;
    if (form.elements.email && !form.elements.email.value) form.elements.email.value = user.email || '';
    var r = await sb.from('addresses').select('*').eq('user_id', user.id).order('is_default', { ascending: false }).order('created_at');
    addrs = r.data || [];
    var box = $('#savedAddr');
    if (!addrs.length) { if (box) box.remove(); return; }
    if (!box) {
      form.insertAdjacentHTML('afterbegin', "<label id='savedAddr' class='span'>Deliver to a saved address<select></select></label>");
      box = $('#savedAddr');
      box.querySelector('select').addEventListener('change', function () {
        var a = addrs[+this.value];
        if (a) { fill(form, a, false); return; }
        ['address1', 'address2', 'city', 'postal'].forEach(function (k) { if (form.elements[k]) form.elements[k].value = ''; });
        if (form.elements.address1) form.elements.address1.focus();
      });
    }
    box.querySelector('select').innerHTML = addrs.map(function (a, i) {
      return "<option value='" + i + "'>" + escH((a.label ? a.label + ': ' : '') + [a.name, a.line1, a.city, a.postal_code].filter(Boolean).join(', ')) + '</option>';
    }).join('') + "<option value='-1'>A different address</option>";
    fill(form, addrs[0], true);
  };
  if (typeof openCheckout === 'function') {
    var origOpen = openCheckout;
    openCheckout = function () { origOpen.apply(this, arguments); prefill(); }; // eslint-disable-line no-global-assign
  }

  // ---------------------------------------------------------------- 4. Pay now after ordering
  var payLink = null;
  var getLink = async function () {
    if (payLink !== null) return payLink;
    var r = await sb.from('site_settings').select('value').eq('key', 'payment_link').maybeSingle();
    var v = String((r.data && r.data.value) || '').trim();
    payLink = /^https:\/\//i.test(v) ? v : '';
    return payLink;
  };
  var thanks = $('#thanksView');
  if (thanks) {
    new MutationObserver(async function () {
      var old = $('#payBox');
      if (thanks.hidden) { if (old) old.remove(); return; }
      if (old) return;
      var link = await getLink();
      if (!link || $('#payBox')) return;
      var order = ($('#orderNo') || {}).textContent || '';
      var totalText = ($('#thanksTotal') || {}).textContent || '';
      var amount = (totalText.replace(/[^0-9.,]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.') || '');
      var url = link.replace(/\{amount\}/g, encodeURIComponent(amount)).replace(/\{order\}/g, encodeURIComponent(order));
      var anchor = $('.thanks-box', thanks);
      if (!anchor) return;
      anchor.insertAdjacentHTML('afterend', "<div id='payBox' class='paybox'><p><strong>Pay now</strong> to confirm your order faster. Use your order number <strong>" + escH(order) +
        "</strong> as the payment reference.</p><a class='btn btn-solid' href='" + escH(url) + "' target='_blank' rel='noopener'>Pay " + escH(totalText) + " securely</a>" +
        "<p class='note'>Prefer to wait? The payment link is also in your confirmation email.</p></div>");
    }).observe(thanks, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
