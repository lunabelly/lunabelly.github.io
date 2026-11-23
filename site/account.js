'use strict';
/* Customer accounts for Luna Belly.
   Loads after app.js and reuses its Supabase client, so the storefront and the account
   area share one session. Kept in its own file so the checkout path in app.js is not
   touched. Admin sign-in lives in atelier-7xk2m9/studio.js and is untouched by this:
   an account here is an ordinary user with no row in `admins`, so is_admin() is false
   and every admin policy denies it. */
(function () {
  var box = document.getElementById('accountPage');
  if (!box || typeof sb === 'undefined') return;

  var ACC = location.pathname.replace(/\/+$/, '') === '/account';
  var Q = new URLSearchParams(location.search);
  var RECOVER = Q.get('recover') === '1';
  var CONFIRMED = Q.get('confirmed') === '1';
  var SITE = location.origin;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return '&#' + c.charCodeAt(0) + ';';
    });
  };
  var money = function (c) {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((c || 0) / 100);
  };
  var when = function (d) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  var emailOk = function (e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || '').trim()); };
  var say = function (m) { if (typeof toast === 'function') toast(m); };

  var view = 'signin';
  var busy = false;
  var me = null;
  var notice = '';
  var data = { orders: [], loyalty: null, lists: [], items: [], addresses: [], products: [] };

  /* Supabase returns technical strings; customers get plain English. */
  function friendly(msg) {
    var m = String(msg || '');
    if (/Invalid login credentials/i.test(m)) return 'That email and password do not match. Check both, or reset your password below.';
    if (/Email not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox for the link we sent you.';
    if (/already registered|already been registered|User already/i.test(m)) return 'There is already an account with that email. Try signing in, or reset your password.';
    if (/Password should be at least|weak.?password/i.test(m)) return 'That password is too short. Please use at least 8 characters.';
    if (/For security purposes|after \d+ seconds/i.test(m)) return 'Please wait a few seconds before trying that again.';
    if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a few minutes and try again.';
    if (/redirect|not allowed/i.test(m)) return 'This site is not yet allowed to send you back here. Tell us and we will fix it.';
    return 'Something went wrong. Please try again, and tell us if it keeps happening.';
  }

  function head(title, lead) {
    return "<a class='back' href='/#shop'>← All pieces</a>" +
      "<p class='eyebrow'>Luna Belly</p><h1>" + esc(title) + '</h1>' +
      (lead ? "<p class='lede sm'>" + lead + '</p>' : '');
  }
  function msgBlock() {
    return notice ? "<p class='authnote'>" + esc(notice) + '</p>' : '';
  }
  function errLine() { return "<p id='accErr' class='err' role='alert'></p>"; }

  function signinView() {
    return "<div class='authwrap'>" + head('Sign in', 'Your orders, your saved pieces and your addresses, all in one place.') +
      msgBlock() +
      "<form id='accForm' class='setf' novalidate>" +
      "<label>Email<input name='email' type='email' autocomplete='email' required></label>" +
      "<label>Password<input name='password' type='password' autocomplete='current-password' required></label>" +
      errLine() +
      "<button class='btn btn-solid' type='submit'>Sign in</button>" +
      '</form>' +
      "<p class='authalt'><button class='link' data-go='forgot'>Forgotten your password?</button></p>" +
      "<p class='authalt'>New here? <button class='link' data-go='signup'>Create an account</button></p>" +
      "<p class='note'>You do not need an account to order. <a href='/track'>Track an order</a> with your order number instead.</p>" +
      '</div>';
  }

  function signupView() {
    return "<div class='authwrap'>" + head('Create an account', 'So your orders, wishlist and addresses are waiting for you next time.') +
      msgBlock() +
      "<form id='accForm' class='setf' novalidate>" +
      "<label>Your name<input name='name' autocomplete='name' maxlength='120' required></label>" +
      "<label>Email<input name='email' type='email' autocomplete='email' required></label>" +
      "<label>Password<input name='password' type='password' autocomplete='new-password' required minlength='8'>" +
      "<span class='hint'>At least 8 characters.</span></label>" +
      "<label>Confirm password<input name='password2' type='password' autocomplete='new-password' required></label>" +
      errLine() +
      "<button class='btn btn-solid' type='submit'>Create account</button>" +
      '</form>' +
      "<p class='authalt'>Already have one? <button class='link' data-go='signin'>Sign in</button></p>" +
      "<p class='note verifynote'>Email verification is switched off for the moment while we finish setting up our email. " +
      'Your account works straight away, and no confirmation link will arrive. ' +
      'Do keep your order number, as it is what we use to find an order.</p>' +
      "<p class='note'>By creating an account you agree to our <a href='/terms'>terms of sale</a> and <a href='/privacy'>privacy policy</a>.</p>" +
      '</div>';
  }

  function sentView(addr) {
    return "<div class='authwrap'>" + head('Check your inbox') +
      "<div class='authsent'><svg viewBox='0 0 24 24' aria-hidden='true'><rect x='3' y='5' width='18' height='14' rx='2'/><path d='m3 7 9 6 9-6'/></svg>" +
      '<p>We have sent a confirmation link to <strong>' + esc(addr) + '</strong>.</p>' +
      '<p>Open it and your account is ready. The link lasts 24 hours.</p></div>' +
      "<p class='note'>Nothing after a few minutes? Check your spam folder. If it is not there, " +
      "<button class='link' data-go='signin'>try signing in</button> and we will send another, or message us in the chat.</p>" +
      '</div>';
  }

  function forgotView() {
    return "<div class='authwrap'>" + head('Reset your password', 'We will email you a link to set a new one.') +
      "<form id='accForm' class='setf' novalidate>" +
      "<label>Email<input name='email' type='email' autocomplete='email' required></label>" +
      errLine() +
      "<button class='btn btn-solid' type='submit'>Send the link</button>" +
      '</form>' +
      "<p class='authalt'><button class='link' data-go='signin'>Back to sign in</button></p>" +
      '</div>';
  }

  function forgotSentView(addr) {
    return "<div class='authwrap'>" + head('Check your inbox') +
      "<div class='authsent'><svg viewBox='0 0 24 24' aria-hidden='true'><rect x='3' y='5' width='18' height='14' rx='2'/><path d='m3 7 9 6 9-6'/></svg>" +
      '<p>If there is an account for <strong>' + esc(addr) + '</strong>, a reset link is on its way.</p>' +
      '<p>Open it and you can choose a new password.</p></div>' +
      "<p class='note'>We do not say whether an address has an account, so nobody can use this page to find out who shops with us.</p>" +
      "<p class='authalt'><button class='link' data-go='signin'>Back to sign in</button></p>" +
      '</div>';
  }

  function resetView() {
    return "<div class='authwrap'>" + head('Choose a new password') +
      "<form id='accForm' class='setf' novalidate>" +
      "<label>New password<input name='password' type='password' autocomplete='new-password' required minlength='8'>" +
      "<span class='hint'>At least 8 characters.</span></label>" +
      "<label>Confirm new password<input name='password2' type='password' autocomplete='new-password' required></label>" +
      errLine() +
      "<button class='btn btn-solid' type='submit'>Save new password</button>" +
      '</form></div>';
  }

  function orderRows() {
    if (!data.orders.length) {
      return "<div class='empty'><p>No orders on this account yet.</p></div>";
    }
    return "<ul class='acclist'>" + data.orders.map(function (o) {
      var lines = (o.items || []).map(function (i) {
        return esc(i.name) + ' × ' + esc(i.qty);
      }).join('<br>');
      return "<li class='accorder'><div><strong>" + esc(o.order_number) + '</strong>' +
        "<span class='tag " + esc(o.status) + "'>" + esc(o.status) + '</span>' +
        '<br><small>' + when(o.created_at) + '</small></div>' +
        '<div><small>' + lines + '</small></div>' +
        '<div><strong>' + money(o.total_cents) + '</strong><br>' +
        "<a class='link' href='/track?o=" + encodeURIComponent(o.order_number) + '&e=' +
        encodeURIComponent(o.customer_email || '') + "'>Track</a></div></li>";
    }).join('') + '</ul>';
  }

  function listBlocks() {
    if (!data.lists.length) return '';
    return data.lists.map(function (l) {
      var ids = data.items.filter(function (i) { return i.list_id === l.id; })
        .map(function (i) { return i.product_id; });
      var prods = ids.map(function (id) {
        return data.products.find(function (p) { return p.id === id; });
      }).filter(Boolean);
      return "<div class='acclistbox'><h3>" + esc(l.name) +
        (l.is_default ? " <span class='tag'>default</span>" : '') + '</h3>' +
        (prods.length
          ? "<ul class='acclist'>" + prods.map(function (p) {
              return "<li class='accitem'><a href='/p/" + encodeURIComponent(p.slug) + "'>" + esc(p.name) + '</a>' +
                '<span>' + money(p.price_cents) + '</span>' +
                "<button class='link' data-unlist='" + esc(l.id) + '|' + esc(p.id) + "'>Remove</button></li>";
            }).join('') + '</ul>'
          : "<p class='note'>Nothing saved here yet.</p>") +
        '</div>';
    }).join('');
  }

  function addressBlocks() {
    if (!data.addresses.length) return "<p class='note'>No saved addresses yet.</p>";
    return "<ul class='acclist'>" + data.addresses.map(function (a) {
      return "<li class='accitem'><span>" + esc(a.name) + '<br><small>' +
        esc([a.line1, a.line2, a.city, a.postal_code, a.country].filter(Boolean).join(', ')) +
        '</small></span>' + (a.is_default ? "<span class='tag'>default</span>" : '') +
        "<button class='link' data-deladdr='" + esc(a.id) + "'>Remove</button></li>";
    }).join('') + '</ul>';
  }

  function accountView() {
    var l = data.loyalty || {};
    var name = (me && me.user_metadata && me.user_metadata.name) || '';
    return "<a class='back' href='/#shop'>← All pieces</a>" +
      "<div class='acchead'><div><p class='eyebrow'>Your account</p><h1>" +
      esc(name || 'Hello') + '</h1><p class=\'note\'>' + esc(me ? me.email : '') + '</p></div>' +
      "<button class='btn btn-line' data-go='signout'>Sign out</button></div>" +
      msgBlock() +
      "<div class='points'>" + esc(l.points || 0) + ' Luna point' + ((l.points === 1) ? '' : 's') +
      ' · ' + esc(l.tier || 'Pearl') + ' level' +
      (l.linked ? '' : ' · place an order to start earning') + '</div>' +
      "<section class='accsec' id='orders'><h2>Your orders</h2>" + orderRows() +
      "<details class='rev-form'><summary>Add an order you placed before signing up</summary>" +
      "<form id='claimForm' class='setf'>" +
      "<label>Order number<input name='o' required placeholder='LB-XXXXXXXX'></label>" +
      "<label>Email on the order<input name='e' type='email' required></label>" +
      "<button class='btn btn-line'>Add it to my account</button>" +
      "<p id='claimMsg' role='status'></p>" +
      "<p class='note'>We ask for both so nobody can add an order that is not theirs.</p>" +
      '</form></details></section>' +
      "<section class='accsec'><h2>Saved pieces</h2>" + listBlocks() +
      "<form id='listForm' class='promo'><input name='name' placeholder='New list name' maxlength='60' required aria-label='New list name'>" +
      "<button class='btn btn-line'>Create list</button></form></section>" +
      "<section class='accsec'><h2>Addresses</h2>" + addressBlocks() +
      "<details class='rev-form'><summary>Add an address</summary><form id='addrForm' class='setf'>" +
      "<label>Full name<input name='name' required maxlength='120'></label>" +
      "<label>Address<input name='line1' required maxlength='200'></label>" +
      "<label>Apartment, suite (optional)<input name='line2' maxlength='200'></label>" +
      "<label>City<input name='city' required maxlength='100'></label>" +
      "<label>Postcode<input name='postal_code' required maxlength='20'></label>" +
      "<label>Country<input name='country' value='United Kingdom' required maxlength='60'></label>" +
      "<label class='chk'><input type='checkbox' name='is_default'> Use this by default</label>" +
      "<button class='btn btn-line'>Save address</button><p id='addrMsg' role='status'></p>" +
      '</form></details></section>';
  }

  function render() {
    if (!ACC) return;
    var v = {
      signin: signinView, signup: signupView, forgot: forgotView,
      reset: resetView, account: accountView
    };
    if (view === 'sent') box.innerHTML = sentView(notice);
    else if (view === 'forgotsent') box.innerHTML = forgotSentView(notice);
    else box.innerHTML = (v[view] || signinView)();
    document.title = (view === 'account' ? 'Your account' : 'Sign in') + ' | Luna Belly';
  }

  function fail(m) {
    var e = box.querySelector('#accErr');
    if (e) e.textContent = m;
    else { notice = m; render(); }
  }

  async function loadData() {
    var r = await Promise.all([
      sb.from('orders').select('order_number,customer_email,items,total_cents,status,created_at')
        .order('created_at', { ascending: false }),
      sb.rpc('my_loyalty'),
      sb.from('lists').select('id,name,is_default').order('created_at'),
      sb.from('list_items').select('list_id,product_id'),
      sb.from('addresses').select('*').order('created_at'),
      sb.from('products').select('id,slug,name,price_cents')
    ]);
    data.orders = r[0].error ? [] : (r[0].data || []);
    data.loyalty = r[1].error ? null : r[1].data;
    data.lists = r[2].error ? [] : (r[2].data || []);
    data.items = r[3].error ? [] : (r[3].data || []);
    data.addresses = r[4].error ? [] : (r[4].data || []);
    data.products = r[5].error ? [] : (r[5].data || []);
  }

  async function afterSignIn() {
    if (RECOVER) { view = 'reset'; render(); return; }
    try {
      await sb.rpc('ensure_account', {
        p_name: (me && me.user_metadata && me.user_metadata.name) || null
      });
    } catch (e) { /* the account still works without the profile row */ }
    await loadData();
    if (CONFIRMED && !notice) notice = 'Your email is confirmed. Welcome to Luna Belly.';
    view = 'account';
    render();
    markHeader();
  }

  function markHeader() {
    var a = document.querySelector('[data-account]');
    if (a) a.classList.toggle('on', !!me);
  }

  /* ---------- actions ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go],[data-unlist],[data-deladdr]');
    if (!t || !box.contains(t)) return;
    e.preventDefault();
    var d = t.dataset;
    if (d.go === 'signout') {
      sb.auth.signOut().then(function () {
        me = null; notice = ''; view = 'signin'; render(); markHeader(); say('Signed out.');
      });
    } else if (d.go) { notice = ''; view = d.go; render(); }
    else if (d.unlist) {
      var parts = d.unlist.split('|');
      sb.from('list_items').delete().eq('list_id', parts[0]).eq('product_id', parts[1])
        .then(function () { loadData().then(render); });
    } else if (d.deladdr) {
      sb.from('addresses').delete().eq('id', d.deladdr)
        .then(function () { loadData().then(render); });
    }
  });

  box.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (busy) return;
    var f = e.target;
    var d = new FormData(f);
    var email = String(d.get('email') || '').trim().toLowerCase();
    var pw = String(d.get('password') || '');
    var pw2 = String(d.get('password2') || '');
    busy = true;
    var btn = f.querySelector('button[type=submit],button:not([type])');
    var label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }
    var done = function () { busy = false; if (btn) { btn.disabled = false; btn.textContent = label; } };

    try {
      if (f.id === 'accForm' && view === 'signin') {
        if (!emailOk(email)) { fail('Please enter a valid email address.'); return done(); }
        if (!pw) { fail('Please enter your password.'); return done(); }
        var si = await sb.auth.signInWithPassword({ email: email, password: pw });
        if (si.error) { fail(friendly(si.error.message)); return done(); }
        done();
        return; // onAuthStateChange takes it from here
      }

      if (f.id === 'accForm' && view === 'signup') {
        var nm = String(d.get('name') || '').trim();
        if (!nm) { fail('Please tell us your name.'); return done(); }
        if (!emailOk(email)) { fail('Please enter a valid email address.'); return done(); }
        if (pw.length < 8) { fail('Your password needs at least 8 characters.'); return done(); }
        if (pw !== pw2) { fail('The two passwords do not match.'); return done(); }
        var su = await sb.auth.signUp({
          email: email, password: pw,
          options: { emailRedirectTo: SITE + '/account?confirmed=1', data: { name: nm } }
        });
        if (su.error) { fail(friendly(su.error.message)); return done(); }
        done();
        if (su.data && su.data.session) { me = su.data.user; afterSignIn(); return; }
        notice = email; view = 'sent'; render();
        return;
      }

      if (f.id === 'accForm' && view === 'forgot') {
        if (!emailOk(email)) { fail('Please enter a valid email address.'); return done(); }
        await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE + '/account?recover=1' });
        done();
        notice = email; view = 'forgotsent'; render();
        return;
      }

      if (f.id === 'accForm' && view === 'reset') {
        if (pw.length < 8) { fail('Your password needs at least 8 characters.'); return done(); }
        if (pw !== pw2) { fail('The two passwords do not match.'); return done(); }
        var up = await sb.auth.updateUser({ password: pw });
        if (up.error) { fail(friendly(up.error.message)); return done(); }
        done();
        notice = 'Your password is updated.';
        history.replaceState({}, '', '/account');
        await loadData();
        view = 'account'; render();
        return;
      }

      if (f.id === 'claimForm') {
        var cm = box.querySelector('#claimMsg');
        cm.textContent = 'Checking…';
        var cr = await sb.rpc('claim_order', {
          p_number: String(d.get('o') || ''), p_email: String(d.get('e') || '')
        });
        done();
        if (cr.error || !cr.data) { cm.textContent = 'We could not add that order. Please try again.'; return; }
        if (!cr.data.ok) { cm.textContent = cr.data.reason; return; }
        cm.textContent = '';
        await loadData(); render(); say('Order ' + cr.data.order_number + ' added.');
        return;
      }

      if (f.id === 'listForm') {
        var ln = String(d.get('name') || '').trim();
        done();
        if (!ln) return;
        var lr = await sb.from('lists').insert({ name: ln, user_id: me.id });
        if (!lr.error) { await loadData(); render(); say('List created.'); }
        else say('Could not create that list.');
        return;
      }

      if (f.id === 'addrForm') {
        var am = box.querySelector('#addrMsg');
        var row = {
          user_id: me.id,
          name: String(d.get('name') || '').trim(),
          line1: String(d.get('line1') || '').trim(),
          line2: String(d.get('line2') || '').trim() || null,
          city: String(d.get('city') || '').trim(),
          postal_code: String(d.get('postal_code') || '').trim(),
          country: String(d.get('country') || '').trim() || 'United Kingdom',
          is_default: d.get('is_default') === 'on'
        };
        done();
        if (!row.name || !row.line1 || !row.city || !row.postal_code) {
          am.textContent = 'Please fill in name, address, city and postcode.'; return;
        }
        if (row.is_default) await sb.from('addresses').update({ is_default: false }).eq('user_id', me.id);
        var ar = await sb.from('addresses').insert(row);
        am.textContent = ar.error ? 'Could not save that address.' : '';
        if (!ar.error) { await loadData(); render(); say('Address saved.'); }
        return;
      }
      done();
    } catch (err) {
      done();
      fail('Something went wrong. Please try again.');
    }
  });

  /* ---------- boot ---------- */
  if (ACC) {
    document.getElementById('home').hidden = true;
    box.hidden = false;
    box.innerHTML = "<div class='authwrap'><p class='note'>Loading…</p></div>";
    var m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex, nofollow';
    document.head.appendChild(m);
  }

  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'PASSWORD_RECOVERY') {
      me = session && session.user; view = 'reset'; render(); return;
    }
    if (session && session.user) {
      me = session.user;
      markHeader();
      if (ACC && view !== 'reset' && view !== 'account') afterSignIn();
    } else {
      me = null; markHeader();
      if (ACC && view === 'account') { view = 'signin'; notice = ''; render(); }
    }
  });

  sb.auth.getSession().then(function (r) {
    var s = r && r.data && r.data.session;
    if (s && s.user) { me = s.user; markHeader(); if (ACC) afterSignIn(); }
    else if (ACC) {
      if (CONFIRMED) notice = 'Your email is confirmed. Please sign in.';
      view = RECOVER ? 'reset' : 'signin';
      render();
    }
  });
})();
