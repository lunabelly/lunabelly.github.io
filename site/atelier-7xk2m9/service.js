'use strict';
/* Studio service features. Loads after studio.js and the other Studio scripts; reuses its globals
   (sb, TABS, tab, esc, empty, money).
   - Returns (TABS.returns): approve, reject, mark received (optionally back into stock), refund.
   - Invoices: an "Invoice" button on every order in Orders and Dispatch (uses /invoice.js).
   - Business details card in Settings (name, address, company and VAT numbers, returns address).
   - Studio as an app: install button, and the number of new orders on the app icon. */
(function () {
  if (typeof sb === 'undefined' || typeof TABS === 'undefined') return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var E = function (s) { return esc(s); };
  var V = function () { return document.getElementById('view'); };
  var day = function (d) { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
  var REASON = { changed_mind: 'Changed their mind', faulty: 'Faulty', damaged: 'Arrived damaged', wrong_item: 'Wrong item sent', other: 'Something else' };
  var STATUS = { requested: 'New request', approved: 'Approved, on its way back', received: 'Received, to refund', refunded: 'Refunded', rejected: 'Rejected' };

  // ================================================================ Returns
  var R = { filter: 'open', rows: [] };
  TABS.returns = async function () {
    var v = V();
    v.innerHTML = empty('Loading…');
    var r = await sb.from('returns').select('*').order('created_at', { ascending: false }).limit(200);
    if (r.error) { v.innerHTML = empty('Could not load returns: ' + E(r.error.message)); return; }
    R.rows = r.data || [];
    draw();
  };
  function draw() {
    var v = V();
    if (!v || tab !== 'returns') return;
    var open = R.rows.filter(function (x) { return ['requested', 'approved', 'received'].indexOf(x.status) >= 0; });
    var list = R.filter === 'open' ? open : R.rows;
    var n = function (s) { return R.rows.filter(function (x) { return x.status === s; }).length; };
    v.innerHTML = "<div class='gx rt'><div class='xintro'><h2>Returns</h2><p class='saved'>Customers start a return from their order page. Approve it and they get an email with your returns address (set it in Settings, under Business details). When it arrives, mark it received; once you have sent the money back the way they paid, mark it refunded. Each step emails the customer.</p></div>" +
      "<div class='crm-stats'>" + stat(n('requested'), 'new requests', n('requested') ? 'warn' : '') + stat(n('approved'), 'on the way back') + stat(n('received'), 'to refund', n('received') ? 'warn' : '') + stat(n('refunded'), 'refunded') + '</div>' +
      "<div class='rt-filters'><button type='button' class='chip" + (R.filter === 'open' ? ' on' : '') + "' data-rtf='open'>Open " + open.length + "</button><button type='button' class='chip" + (R.filter === 'all' ? ' on' : '') + "' data-rtf='all'>All " + R.rows.length + '</button></div>' +
      (list.length ? list.map(card).join('') : empty(R.filter === 'open' ? 'No open returns. New requests appear here and are emailed to you.' : 'No returns yet.')) + '</div>';
  }
  function stat(n, label, cls) { return "<div class='crm-stat " + (cls || '') + "'><strong>" + n + '</strong><span>' + label + '</span></div>'; }
  function card(x) {
    var total = (x.items || []).reduce(function (s, i) { return s + (i.price_cents || 0) * (i.qty || 1); }, 0);
    var act = '';
    if (x.status === 'requested') {
      act = "<button type='button' class='btn btn-solid' data-rt='approved'>Approve</button><button type='button' class='btn btn-line' data-rt='rejected'>Reject</button>";
    } else if (x.status === 'approved') {
      act = "<label class='crm-check'><input type='checkbox' name='restock' checked><span>Put back in stock</span></label><button type='button' class='btn btn-solid' data-rt='received'>Mark as received</button>";
    } else if (x.status === 'received') {
      act = "<label class='rt-amt'>Refund £<input name='refund' inputmode='decimal' value='" + (total / 100).toFixed(2) + "'></label>" +
        (x.restocked ? '' : "<label class='crm-check'><input type='checkbox' name='restock'><span>Put back in stock</span></label>") +
        "<button type='button' class='btn btn-solid' data-rt='refunded'>Mark as refunded</button>";
    }
    var done = x.status === 'refunded' || x.status === 'rejected';
    return "<article class='xcard rt-card' data-rid='" + E(x.id) + "'><header><div><strong>" + E(x.ref) + "</strong> <span class='rt-st st-" + E(x.status) + "'>" + E(STATUS[x.status] || x.status) + '</span>' +
      '<br><small>Order ' + E(x.order_number) + ' · ' + day(x.created_at) + '</small></div>' +
      "<div class='rt-who'>" + E(x.customer_name || '') + '<br><small>' + E(x.customer_email) + '</small></div></header>' +
      "<ul class='rt-items'>" + (x.items || []).map(function (i) { return '<li><span>' + E(i.name) + ' × ' + E(i.qty) + '</span><span>' + money((i.price_cents || 0) * (i.qty || 1)) + '</span></li>'; }).join('') + '</ul>' +
      '<p><b>Reason:</b> ' + E(REASON[x.reason] || x.reason) + '</p>' + (x.note ? "<blockquote class='rt-note'>" + E(x.note) + '</blockquote>' : '') +
      (x.refund_cents != null && x.status === 'refunded' ? '<p><b>Refunded:</b> ' + money(x.refund_cents) + (x.restocked ? ' · put back in stock' : '') + '</p>' : '') +
      (x.owner_note ? "<p class='saved'><b>Your message to them:</b> " + E(x.owner_note) + '</p>' : '') +
      (done ? '' : "<label class='rt-msg'>Message to the customer (optional, added to the email)<textarea name='note' rows='2' maxlength='1000'></textarea></label><div class='rt-acts'>" + act + '</div>') +
      "<p class='err' role='status'></p></article>";
  }
  async function act(btn) {
    var c = btn.closest('.rt-card'), to = btn.dataset.rt, err = $('.err', c);
    var row = R.rows.find(function (x) { return x.id === c.dataset.rid; });
    var note = ($('[name=note]', c) || {}).value || '';
    var restock = !!($('[name=restock]', c) || {}).checked;
    var refund = null;
    if (to === 'refunded') {
      var n = parseFloat(String(($('[name=refund]', c) || {}).value || '').replace(/[£,\s]/g, ''));
      if (!isFinite(n) || n < 0) { err.textContent = 'Type the amount you refunded.'; return; }
      refund = Math.round(n * 100);
      if (!confirm('Mark ' + row.ref + ' as refunded (' + money(refund) + ')? The customer is emailed that the money is on its way.')) return;
    }
    if (to === 'rejected' && !note.trim() && !confirm('Reject without a message? The customer will be asked to reply for an explanation.')) return;
    btn.disabled = true; err.textContent = '';
    var r = await sb.rpc('return_set_status', { p_id: row.id, p_status: to, p_refund: refund, p_note: note, p_restock: restock });
    btn.disabled = false;
    if (r.error) { err.textContent = 'Could not save: ' + r.error.message; return; }
    TABS.returns();
  }

  // ================================================================ Invoices on Orders and Dispatch
  var seller = null;
  function invoiceButtons() {
    if (tab !== 'orders' && tab !== 'dispatch') return;
    $$('#view tbody tr').forEach(function (tr) {
      var td = tr.querySelector('td'), s = td && td.querySelector('strong');
      if (tab === 'dispatch') { td = tr.children[1]; s = td && td.querySelector('strong'); }
      if (!s || !/^LB-/i.test(s.textContent.trim()) || td.querySelector('.inv-btn')) return;
      td.insertAdjacentHTML('beforeend', "<br><button type='button' class='link inv-btn' data-inv='" + E(s.textContent.trim()) + "'>Invoice</button>");
    });
  }
  async function printInvoice(num) {
    if (!window.lbDoc) return;
    var r = await sb.from('orders').select('*').eq('order_number', num).maybeSingle();
    if (r.error || !r.data) { alert('Could not load that order.'); return; }
    seller = seller || await window.lbDoc.seller(sb);
    window.lbDoc.print(window.lbDoc.html(r.data, seller, 'invoice'));
  }

  // ================================================================ Business details (Settings)
  var BIZ = [['business_name', 'Business name', 'e.g. Luna Belly Ltd', false], ['business_address', 'Business address', 'Street, town, postcode', true],
    ['business_email', 'Contact email', 'hello@…', false], ['company_number', 'Company number (leave empty if a sole trader)', '', false],
    ['vat_number', 'VAT number (only if VAT registered)', '', false], ['returns_address', 'Returns address (if different from the business address)', '', true]];
  if (typeof TABS.settings === 'function') {
    var baseSettings = TABS.settings;
    TABS.settings = function () { var r = baseSettings.apply(this, arguments); bizCard(); return r; };
  }
  async function bizCard() {
    var r = await sb.from('site_settings').select('key,value').in('key', BIZ.map(function (b) { return b[0]; }));
    var val = {}; (r.data || []).forEach(function (x) { val[x.key] = x.value || ''; });
    var view = V();
    if (!view || tab !== 'settings' || $('#bizForm')) return;
    var html = "<form id='bizForm' class='setf barf'><h2>Business details</h2><p class='saved'>Printed on invoices and receipts, and the returns address is sent to customers when you approve a return. UK law also expects these on the shop's Contact page.</p>" +
      BIZ.map(function (b) {
        return '<label>' + b[1] + (b[3] ? "<textarea name='" + b[0] + "' rows='3' maxlength='300' placeholder='" + E(b[2]) + "'>" + E(val[b[0]] || '') + '</textarea>'
          : "<input name='" + b[0] + "' maxlength='120' value='" + E(val[b[0]] || '') + "' placeholder='" + E(b[2]) + "'>") + '</label>';
      }).join('') + "<button class='btn btn-solid'>Save business details</button><p id='bizSaved' class='saved' role='status'></p></form>";
    var bar = $('#barForm');
    if (bar) bar.insertAdjacentHTML('beforebegin', html); else view.insertAdjacentHTML('beforeend', html);
  }
  document.addEventListener('submit', async function (e) {
    if (e.target.id !== 'bizForm') return;
    e.preventDefault(); e.stopPropagation();
    var f = e.target, rows = BIZ.map(function (b) { return { key: b[0], value: f.elements[b[0]].value.trim(), updated_at: new Date().toISOString() }; });
    var r = await sb.from('site_settings').upsert(rows);
    $('#bizSaved').textContent = r.error ? 'Could not save: ' + r.error.message : 'Saved.';
    seller = null;
  }, true);

  // ================================================================ Studio as an app
  var standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var deferred = null;
  if ('serviceWorker' in navigator) addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; installBtn(); });
  addEventListener('appinstalled', function () { deferred = null; var b = $('.st-install'); if (b) b.remove(); });
  function installBtn() {
    var out = $(".adm .top [data-action='signout']");
    if (!out || standalone || $('.st-install') || (!deferred && !ios)) return;
    var t = out.previousElementSibling && out.previousElementSibling.classList.contains('st-theme') ? out.previousElementSibling : out;
    t.insertAdjacentHTML('beforebegin', "<button type='button' class='st-install' title='Add Studio to your home screen'>Get the app</button>");
  }
  // New orders (not yet confirmed) on the app icon, where the phone or computer supports it.
  async function badge() {
    var app = document.getElementById('app');
    if (!app || app.hidden || !('setAppBadge' in navigator)) return;
    var r = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending');
    if (r.error) return;
    try { if (r.count) navigator.setAppBadge(r.count); else navigator.clearAppBadge(); } catch (x) { /* not supported */ }
  }
  setInterval(badge, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) badge(); });

  // ================================================================ Studio home: badges on the Returns tile, app hint
  async function homeExtras() {
    var home = $('.shome');
    if (!home || home.dataset.svc) return;
    home.dataset.svc = '1';
    var tile = $(".tile[data-go='returns']");
    if (tile && !tile.dataset.svc) {
      tile.dataset.svc = '1';
      var r = await sb.from('returns').select('id', { count: 'exact', head: true }).in('status', ['requested', 'received']);
      if (!r.error && r.count && !$('.tbadge', tile)) { tile.insertAdjacentHTML('beforeend', "<span class='tbadge' title='Returns to act on'>" + r.count + '</span>'); tile.setAttribute('aria-label', 'Returns, ' + r.count + ' to act on'); }
    }
    var head = $('.shome-head');
    if (head && !$('.st-apphint', head) && !standalone && ios && innerWidth <= 760) {
      head.insertAdjacentHTML('beforeend', "<p class='st-apphint'>Tip: tap <b>Share</b>, then <b>Add to Home Screen</b>, to keep Studio on your phone like an app.</p>");
    }
    installBtn();
    badge();
  }
  var view = V();
  if (view) new MutationObserver(function () { invoiceButtons(); homeExtras(); }).observe(view, { childList: true, subtree: true });

  // ================================================================ events
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-rt],[data-rtf],[data-inv],.st-install');
    if (!t) return;
    if (t.dataset.rt) act(t);
    else if (t.dataset.rtf) { R.filter = t.dataset.rtf; draw(); }
    else if (t.dataset.inv) printInvoice(t.dataset.inv);
    else if (t.classList.contains('st-install')) {
      if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; t.remove(); }); }
      else if (ios) alert('Tap Share, then Add to Home Screen.');
    }
  });
})();
