'use strict';
/* Studio: Suppliers and incoming stock (TABS.suppliers), Expenses and accounts (TABS.expenses),
   Scan and stickers (TABS.scan): QR stickers for every piece, scan to pack an order, scan to count stock.
   Loads after studio.js and the other Studio scripts; reuses their globals (sb, TABS, esc, empty, money).
   Owner-only tables: suppliers, purchase_orders, purchase_order_lines, expenses.
   Database functions: po_receive, finance_summary, finance_ledger.
   The two QR libraries are only loaded when needed. */
(function () {
  if (typeof sb === 'undefined' || typeof TABS === 'undefined') return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var V = function () { return document.getElementById('view'); };
  var E = function (s) { return esc(s); };
  var MS = function (c) { return money(c || 0).replace(/\.00$/, ''); };
  var M2 = function (c) { return money(c || 0); };
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var ymd = function (d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var today = function () { return ymd(new Date()); };
  var addDays = function (s, n) { var d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
  var day = function (s) { return s ? new Date(String(s).length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  var daysBetween = function (a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5); };
  var pounds = function (s) {
    s = String(s == null ? '' : s).replace(/[£,\s]/g, '');
    if (s === '') return 0;
    var n = Number(s);
    return isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
  };
  var pv = function (c) { return c ? (c / 100).toFixed(2).replace(/\.00$/, '') : ''; };
  var svg = function (d) { return "<svg viewBox='0 0 24 24' aria-hidden='true'>" + d + '</svg>'; };
  function go(t) { var b = document.querySelector(".tabs [data-tab='" + t + "']"); if (b) b.click(); }
  // QR libraries come from jsDelivr (already used for the database library), pinned to one version and checked by hash.
  var LIBS = {
    qr: { src: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js', sri: 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k' },
    scan: { src: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js', sri: 'sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx' },
  };
  var LOADED = {};
  function loadScript(key) {
    var lib = LIBS[key] || { src: key };
    if (!LOADED[key]) LOADED[key] = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = lib.src;
      if (lib.sri) { s.integrity = lib.sri; s.crossOrigin = 'anonymous'; }
      s.onload = function () { res(); };
      s.onerror = function () { delete LOADED[key]; s.remove(); rej(new Error('load')); };
      document.head.appendChild(s);
    });
    return LOADED[key];
  }
  function dlg(html) {
    var d = $('#stDlg');
    if (!d) { document.body.insertAdjacentHTML('beforeend', "<dialog id='stDlg' class='st-dlg'></dialog>"); d = $('#stDlg'); }
    d.innerHTML = "<button type='button' class='x' data-stclose aria-label='Close'>×</button>" + html;
    if (!d.open) d.showModal();
    return d;
  }
  function closeDlg() { var d = $('#stDlg'); if (d && d.open) d.close(); }
  function st(n, label, cls) { return "<div class='crm-stat " + (cls || '') + "'><strong>" + n + '</strong><span>' + label + '</span></div>'; }
  function csvLine(arr) {
    return arr.map(function (v) {
      v = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',');
  }
  function download(name, text) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ================================================================ Suppliers and incoming stock
  var S = { sup: [], pos: [], prods: [] };
  var PO_LABEL = { ordered: 'Ordered', on_the_way: 'On the way', arrived: 'Arrived', cancelled: 'Cancelled' };
  var poTotal = function (po) { return (po.purchase_order_lines || []).reduce(function (s, l) { return s + l.qty * l.unit_cost_cents; }, 0) + po.shipping_cents + po.duties_cents; };
  var prodById = function (id) { return S.prods.find(function (p) { return p.id === id; }); };
  var supById = function (id) { return S.sup.find(function (s) { return s.id === id; }); };
  var isOpen = function (po) { return po.status === 'ordered' || po.status === 'on_the_way'; };
  var isLate = function (po) { return isOpen(po) && po.expected_on && po.expected_on < today(); };
  function lineName(l) { var p = l.product_id && prodById(l.product_id); return p ? p.name : (l.description || 'Item'); }

  TABS.suppliers = async function () {
    var v = V();
    v.innerHTML = empty('Loading…');
    var r = await Promise.all([
      sb.from('suppliers').select('*').order('name'),
      sb.from('purchase_orders').select('*, purchase_order_lines(*)').order('ordered_on', { ascending: false }).order('created_at', { ascending: false }).limit(300),
      sb.from('products').select('id,name,slug,stock_qty').order('sort_order'),
    ]);
    if (r[0].error || r[1].error) { v.innerHTML = empty('Could not load: ' + E((r[0].error || r[1].error).message)); return; }
    S.sup = r[0].data || []; S.pos = r[1].data || []; S.prods = r[2].data || [];
    var open = S.pos.filter(isOpen), late = open.filter(isLate);
    var yearAgo = addDays(today(), -365);
    var spent = S.pos.filter(function (p) { return p.status === 'arrived' && p.ordered_on >= yearAgo; }).reduce(function (s, p) { return s + poTotal(p); }, 0);
    var shown = open.concat(S.pos.filter(function (p) { return !isOpen(p); }).slice(0, 20));
    v.innerHTML = "<div class='gx sp'><div class='xintro pf-head'><div><h2>Suppliers and incoming stock</h2><p class='saved'>Keep your makers in one place and note every order you place with them. When a parcel arrives, press <strong>Arrived</strong>: the pieces are added to your stock, the cost prices in Profit and stock are updated, and the spend goes into Expenses.</p></div>" +
      "<div class='pf-tools'><button type='button' class='btn btn-solid' data-po-new>New stock order</button><button type='button' class='btn btn-line' data-sup-new>Add a supplier</button></div></div>" +
      "<div class='crm-stats'>" + st(open.length, 'order' + (open.length === 1 ? '' : 's') + ' on the way') + st(MS(open.reduce(function (s, p) { return s + poTotal(p); }, 0)), 'value on the way') +
        st(late.length, 'late', late.length ? 'warn' : '') + st(MS(spent), 'stock bought in the last 12 months') + '</div>' +
      '<h3>Stock orders</h3>' +
      (shown.length ? "<div class='po-list'>" + shown.map(poCard).join('') + '</div>' : empty(S.sup.length ? 'No stock orders yet. Press New stock order when you order from a maker.' : 'Add your first supplier, then note each order you place with them here.')) +
      '<h3>Suppliers</h3>' +
      (S.sup.length ? "<div class='sup-list'>" + S.sup.map(supCard).join('') + '</div>' : empty('No suppliers yet.')) + '</div>';
  };
  function poCard(po) {
    var s = supById(po.supplier_id), lines = po.purchase_order_lines || [], extra = po.shipping_cents + po.duties_cents;
    var when = po.status === 'arrived' ? 'arrived ' + day(po.arrived_at) :
      po.status === 'cancelled' ? 'cancelled' :
      po.expected_on ? 'expected ' + day(po.expected_on) + (isLate(po) ? '' : ' (in ' + Math.max(0, daysBetween(today(), po.expected_on)) + ' days)') : 'no expected date';
    var acts = isOpen(po) ? "<button type='button' class='btn btn-solid' data-po-arrive='" + E(po.id) + "'>Arrived</button>" +
        (po.status === 'ordered' ? "<button type='button' class='btn btn-line' data-po-way='" + E(po.id) + "'>On the way</button>" : '') +
        "<button type='button' class='link' data-po-edit='" + E(po.id) + "'>Edit</button><button type='button' class='link' data-po-cancel='" + E(po.id) + "'>Cancel order</button>" :
      "<button type='button' class='btn btn-line' data-po-again='" + E(po.id) + "'>Order again</button>" +
        (po.status === 'cancelled' ? "<button type='button' class='link' data-po-del='" + E(po.id) + "'>Delete</button>" : '');
    return "<article class='po-card" + (isLate(po) ? ' po-late' : '') + (isOpen(po) ? '' : ' po-done') + "'><header><strong>" + E(po.ref) + '</strong>' +
      "<span class='tag po-" + E(po.status) + "'>" + PO_LABEL[po.status] + '</span>' + (isLate(po) ? "<span class='tag pending'>Late</span>" : '') + '</header>' +
      "<p class='po-sup'>" + E(s ? s.name : 'No supplier') + ' · ordered ' + day(po.ordered_on) + ' · ' + when + '</p>' +
      "<ul class='po-lines'>" + lines.map(function (l) { return '<li><span>' + E(lineName(l)) + ' × ' + l.qty + '</span><small>' + (l.unit_cost_cents ? MS(l.unit_cost_cents) + ' each' : '') + '</small></li>'; }).join('') + '</ul>' +
      "<p class='po-tot'>Total <strong>" + MS(poTotal(po)) + '</strong>' + (extra ? ' <small>incl. ' + MS(extra) + ' delivery and duty</small>' : '') + '</p>' +
      (po.tracking ? "<p class='po-note'>Tracking: " + E(po.tracking) + '</p>' : '') + (po.notes ? "<p class='po-note'>" + E(po.notes) + '</p>' : '') +
      "<div class='po-act'>" + acts + '</div></article>';
  }
  function safeUrl(u) { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; try { var x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } }
  function supCard(s) {
    var mine = S.pos.filter(function (p) { return p.supplier_id === s.id; });
    var spent = mine.filter(function (p) { return p.status === 'arrived'; }).reduce(function (n, p) { return n + poTotal(p); }, 0);
    var c = String(s.contact || ''), url = safeUrl(s.website);
    var contact = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c) ? "<a href='mailto:" + E(c) + "'>" + E(c) + '</a>' : E(c);
    return "<article class='sup-card'><h4>" + E(s.name) + (s.country ? ' <small>' + E(s.country) + '</small>' : '') + '</h4>' +
      (c ? '<p>' + contact + '</p>' : '') + (url ? "<p><a href='" + E(url) + "' target='_blank' rel='noopener noreferrer'>" + E(url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')) + '</a></p>' : '') +
      (s.lead_days != null ? '<p>Usually takes ' + s.lead_days + ' days</p>' : '') + (s.notes ? "<p class='po-note'>" + E(s.notes) + '</p>' : '') +
      "<p class='saved'>" + mine.length + ' order' + (mine.length === 1 ? '' : 's') + ' · ' + MS(spent) + ' received</p>' +
      "<div class='po-act'><button type='button' class='btn btn-line' data-po-new='" + E(s.id) + "'>New order</button><button type='button' class='link' data-sup-edit='" + E(s.id) + "'>Edit</button><button type='button' class='link' data-sup-del='" + E(s.id) + "'>Delete</button></div></article>";
  }
  function supForm(s) {
    s = s || {};
    dlg("<form id='supForm' class='st-form' data-id='" + E(s.id || '') + "'><h3>" + (s.id ? 'Edit supplier' : 'Add a supplier') + '</h3>' +
      "<label>Name<input name='name' required maxlength='120' value='" + E(s.name || '') + "' placeholder='e.g. Meena, Jaipur'></label>" +
      "<div class='st-row'><label>Country<input name='country' maxlength='80' value='" + E(s.country || '') + "' placeholder='India'></label>" +
      "<label>Usually takes (days)<input name='lead_days' inputmode='numeric' value='" + (s.lead_days != null ? s.lead_days : '') + "' placeholder='21'></label></div>" +
      "<label>Contact: email, phone or WhatsApp<input name='contact' maxlength='300' value='" + E(s.contact || '') + "'></label>" +
      "<label>Website or shop link<input name='website' maxlength='300' value='" + E(s.website || '') + "'></label>" +
      "<label>Notes<textarea name='notes' rows='3' maxlength='2000' placeholder='Minimum order, payment method, what they make well…'>" + E(s.notes || '') + '</textarea></label>' +
      "<p class='err' id='supErr' role='alert'></p><button class='btn btn-solid'>Save supplier</button></form>");
  }
  function lastCost(pid) {
    for (var i = 0; i < S.pos.length; i++) {
      var l = (S.pos[i].purchase_order_lines || []).find(function (x) { return x.product_id === pid && x.unit_cost_cents; });
      if (l) return l.unit_cost_cents;
    }
    return 0;
  }
  function lineRow(l) {
    l = l || { product_id: S.prods[0] ? S.prods[0].id : null, qty: 1, unit_cost_cents: S.prods[0] ? lastCost(S.prods[0].id) : 0 };
    var other = !l.product_id;
    return "<div class='po-line'><select class='pl-prod' aria-label='Piece'>" + S.prods.map(function (p) { return "<option value='" + E(p.id) + "'" + (p.id === l.product_id ? ' selected' : '') + '>' + E(p.name) + '</option>'; }).join('') +
      "<option value='__other'" + (other ? ' selected' : '') + '>Something else (packaging, samples…)</option></select>' +
      "<input class='pl-desc' maxlength='200' placeholder='What is it?' aria-label='Description' value='" + E(l.description || '') + "'" + (other ? '' : ' hidden') + '>' +
      "<label class='pl-n'>Qty<input class='pl-qty' inputmode='numeric' value='" + l.qty + "'></label>" +
      "<label class='pl-n'>£ each<input class='pl-cost' inputmode='decimal' value='" + pv(l.unit_cost_cents) + "' placeholder='0.00'></label>" +
      "<button type='button' class='pl-rm' data-pl-rm aria-label='Remove this line'>×</button></div>";
  }
  function poForm(po, opts) {
    opts = opts || {};
    if (!S.sup.length) { supForm(); $('#supErr').textContent = 'Add the supplier first, then you can note the order.'; return; }
    po = po || { supplier_id: opts.supplier || S.sup[0].id, ordered_on: today(), shipping_cents: 0, duties_cents: 0, purchase_order_lines: null };
    var s = supById(po.supplier_id);
    var exp = po.expected_on || (!po.id && s && s.lead_days != null ? addDays(po.ordered_on, s.lead_days) : '');
    dlg("<form id='poForm' class='st-form' data-id='" + E(po.id || '') + "'><h3>" + (po.id ? 'Edit ' + E(po.ref) : 'New stock order') + '</h3>' +
      "<label>Supplier<select name='supplier_id' required>" + S.sup.map(function (x) { return "<option value='" + E(x.id) + "'" + (x.id === po.supplier_id ? ' selected' : '') + '>' + E(x.name) + '</option>'; }).join('') + '</select></label>' +
      "<div class='st-row'><label>Ordered on<input type='date' name='ordered_on' required value='" + E(po.ordered_on) + "'></label><label>Expected by<input type='date' name='expected_on' value='" + E(exp) + "'></label></div>" +
      "<p class='st-l'>What you ordered</p><div id='poLines'>" + ((po.purchase_order_lines && po.purchase_order_lines.length) ? po.purchase_order_lines.map(lineRow).join('') : lineRow()) + '</div>' +
      "<button type='button' class='link' data-pl-add>+ Add another line</button>" +
      "<div class='st-row'><label>Delivery £<input name='shipping' inputmode='decimal' value='" + pv(po.shipping_cents) + "' placeholder='0.00'></label>" +
      "<label>Import duty and VAT £<input name='duties' inputmode='decimal' value='" + pv(po.duties_cents) + "' placeholder='0.00'></label></div>" +
      "<label>Tracking number (optional)<input name='tracking' maxlength='200' value='" + E(po.tracking || '') + "'></label>" +
      "<label>Notes (optional)<textarea name='notes' rows='2' maxlength='2000'>" + E(po.notes || '') + '</textarea></label>' +
      "<p class='po-sum' id='poSum'></p><p class='err' id='poErr' role='alert'></p><button class='btn btn-solid'>Save order</button></form>");
    poSum();
  }
  function readLines() {
    return $$('#poLines .po-line').map(function (row) {
      var pid = $('.pl-prod', row).value, other = pid === '__other';
      return { product_id: other ? null : pid, description: other ? $('.pl-desc', row).value.trim() : null,
        qty: Number($('.pl-qty', row).value.trim()), unit_cost_cents: pounds($('.pl-cost', row).value) };
    });
  }
  function poSum() {
    var f = $('#poForm'); if (!f) return;
    var lines = readLines(), goods = lines.reduce(function (s, l) { return s + ((l.qty > 0 && l.unit_cost_cents >= 0) ? l.qty * l.unit_cost_cents : 0); }, 0);
    var extra = (pounds(f.elements.shipping.value) || 0) + (pounds(f.elements.duties.value) || 0);
    var units = lines.reduce(function (s, l) { return s + (l.qty > 0 && l.product_id ? l.qty : 0); }, 0);
    $('#poSum').innerHTML = 'Pieces ' + MS(goods) + (extra ? ' + delivery and duty ' + MS(extra) : '') + ' = <strong>' + MS(goods + extra) + '</strong>' + (units ? ' · ' + units + ' piece' + (units === 1 ? '' : 's') + ' for the shop' : '');
  }
  async function poSave(f) {
    var err = $('#poErr'), lines = readLines(), id = f.dataset.id;
    var bad = lines.find(function (l) { return !(Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= 100000) || isNaN(l.unit_cost_cents) || (!l.product_id && !l.description); });
    if (!lines.length) { err.textContent = 'Add at least one line.'; return; }
    if (bad) { err.textContent = bad.product_id || bad.description ? 'Check the quantities and prices: whole numbers for quantity, and a price like 12.50.' : 'Say what the "something else" line is.'; return; }
    var row = { supplier_id: f.elements.supplier_id.value, ordered_on: f.elements.ordered_on.value, expected_on: f.elements.expected_on.value || null,
      shipping_cents: pounds(f.elements.shipping.value), duties_cents: pounds(f.elements.duties.value),
      tracking: f.elements.tracking.value.trim() || null, notes: f.elements.notes.value.trim() || null };
    if (isNaN(row.shipping_cents) || isNaN(row.duties_cents)) { err.textContent = 'Delivery and duty need to be amounts like 12.50.'; return; }
    if (row.expected_on && row.expected_on < row.ordered_on) { err.textContent = 'The expected date is before the order date.'; return; }
    f.querySelector('button.btn-solid').disabled = true;
    var r;
    if (id) r = await sb.from('purchase_orders').update(row).eq('id', id).select('id').single();
    else r = await sb.from('purchase_orders').insert(row).select('id').single();
    if (r.error) { err.textContent = 'Could not save: ' + r.error.message; f.querySelector('button.btn-solid').disabled = false; return; }
    var pid = r.data.id;
    if (id) { var d = await sb.from('purchase_order_lines').delete().eq('po_id', pid); if (d.error) { err.textContent = 'Could not save the lines: ' + d.error.message; return; } }
    var ins = await sb.from('purchase_order_lines').insert(lines.map(function (l) { l.po_id = pid; return l; }));
    if (ins.error) {
      if (!id) await sb.from('purchase_orders').delete().eq('id', pid);
      err.textContent = 'Could not save the lines: ' + ins.error.message; f.querySelector('button.btn-solid').disabled = false; return;
    }
    closeDlg(); TABS.suppliers();
  }
  async function supSave(f) {
    var err = $('#supErr'), ld = f.elements.lead_days.value.trim();
    var row = { name: f.elements.name.value.trim(), country: f.elements.country.value.trim() || null, contact: f.elements.contact.value.trim() || null,
      website: f.elements.website.value.trim() || null, notes: f.elements.notes.value.trim() || null, lead_days: ld === '' ? null : Number(ld) };
    if (!row.name) { err.textContent = 'Give the supplier a name.'; return; }
    if (row.lead_days != null && !(Number.isInteger(row.lead_days) && row.lead_days >= 0 && row.lead_days <= 365)) { err.textContent = 'Days should be a whole number, like 21.'; return; }
    var id = f.dataset.id;
    var r = id ? await sb.from('suppliers').update(row).eq('id', id) : await sb.from('suppliers').insert(row);
    if (r.error) { err.textContent = 'Could not save: ' + r.error.message; return; }
    closeDlg(); TABS.suppliers();
  }
  function arriveDlg(po) {
    var lines = po.purchase_order_lines || [], tot = lines.reduce(function (s, l) { return s + l.qty * l.unit_cost_cents; }, 0);
    var units = lines.reduce(function (s, l) { return s + l.qty; }, 0), extra = po.shipping_cents + po.duties_cents;
    var untracked = [];
    var li = lines.map(function (l) {
      var p = l.product_id && prodById(l.product_id);
      if (!p) return '<li>' + E(lineName(l)) + ' × ' + l.qty + " <small class='muted'>not a shop piece, stock not changed</small></li>";
      var landed = l.unit_cost_cents + (tot > 0 ? Math.round(extra * l.unit_cost_cents / tot) : units ? Math.round(extra / units) : 0);
      if (p.stock_qty == null) untracked.push(p.name + ' (' + l.qty + ')');
      return '<li><strong>' + E(p.name) + '</strong> +' + l.qty + ' ' + (p.stock_qty == null ? "<small class='muted'>stock not counted for this piece</small>" : "<small class='muted'>" + p.stock_qty + ' → ' + (p.stock_qty + l.qty) + '</small>') +
        "<br><small class='muted'>Landed cost " + M2(landed) + ' each</small></li>';
    }).join('');
    dlg("<div class='st-form' id='arrBox'><h3>" + E(po.ref) + ' has arrived</h3><p>This adds the pieces to your stock:</p><ul class="arr-list">' + li + '</ul>' +
      "<label class='chk'><input type='checkbox' id='arrCosts' checked> Update cost prices in Profit and stock to the landed cost (what you paid for the piece plus its share of delivery and duty)</label>" +
      (tot + extra ? "<label class='chk'><input type='checkbox' id='arrLog' checked> Add " + MS(tot + extra) + ' to Expenses as Stock</label>' : '') +
      (untracked.length ? "<label class='chk'><input type='checkbox' id='arrTrack'> Start counting stock for " + E(untracked.join(', ')) + '</label>' : '') +
      "<p class='saved'>If a piece was sold out, anyone on its waiting list is emailed automatically.</p>" +
      "<p class='err' id='arrErr' role='alert'></p><button type='button' class='btn btn-solid' data-po-confirm='" + E(po.id) + "'>Confirm arrival</button></div>");
  }
  async function arrive(id) {
    var btn = $('[data-po-confirm]'); btn.disabled = true;
    var r = await sb.rpc('po_receive', { p_id: id, p_update_costs: !!($('#arrCosts') && $('#arrCosts').checked),
      p_log_expense: !!($('#arrLog') && $('#arrLog').checked), p_track: !!($('#arrTrack') && $('#arrTrack').checked) });
    if (r.error) { $('#arrErr').textContent = /already/.test(r.error.message) ? 'This order was already marked as arrived.' : 'Could not mark it as arrived: ' + r.error.message; btn.disabled = false; return; }
    var d = r.data || {};
    var msg = [d.added ? d.added + ' piece' + (d.added === 1 ? '' : 's') + ' added to stock.' : 'No stock numbers changed.'];
    if (d.started && d.started.length) msg.push('Now counting stock for ' + d.started.join(', ') + '.');
    if (d.untracked && d.untracked.length) msg.push(d.untracked.join(', ') + (d.untracked.length === 1 ? ' is' : ' are') + ' not stock-counted, so ' + (d.untracked.length === 1 ? 'its' : 'their') + ' number did not change.');
    if (d.costs) msg.push('Cost prices updated for ' + d.costs + ' piece' + (d.costs === 1 ? '' : 's') + '.');
    if (d.logged) msg.push(MS(d.total_cents) + ' added to Expenses.');
    $('#arrBox').innerHTML = '<h3>Done</h3><p>' + E(msg.join(' ')) + "</p><button type='button' class='btn btn-solid' data-stclose>Close</button>";
    TABS.suppliers();
  }
  function wayDlg(po) {
    dlg("<form id='wayForm' class='st-form' data-id='" + E(po.id) + "'><h3>" + E(po.ref) + ' is on the way</h3>' +
      "<label>Tracking number (optional)<input name='tracking' maxlength='200' value='" + E(po.tracking || '') + "'></label>" +
      "<label>Expected by<input type='date' name='expected_on' value='" + E(po.expected_on || '') + "'></label>" +
      "<p class='err' id='wayErr' role='alert'></p><button class='btn btn-solid'>Save</button></form>");
  }

  // ================================================================ Expenses and accounts
  var CATS = [['stock', 'Stock (pieces to sell)'], ['packaging', 'Packaging'], ['postage', 'Postage'], ['advertising', 'Advertising'], ['software', 'Website and software'],
    ['photography', 'Photography'], ['fees', 'Bank and payment fees'], ['travel', 'Travel'], ['other', 'Other']];
  var CAT = {}; CATS.forEach(function (c) { CAT[c[0]] = c[1]; });
  function taxYear(back) {
    var t = new Date(), y = t.getFullYear();
    var start = (t.getMonth() > 3 || (t.getMonth() === 3 && t.getDate() >= 6)) ? y : y - 1;
    start -= back;
    return { from: start + '-04-06', to: (start + 1) + '-04-05', label: 'Tax year ' + start + '/' + String(start + 1).slice(2) + ' (6 Apr to 5 Apr)' };
  }
  function periods() {
    var y = new Date().getFullYear();
    return { tax: taxYear(0), taxlast: taxYear(1), cal: { from: y + '-01-01', to: y + '-12-31', label: 'Calendar year ' + y }, callast: { from: (y - 1) + '-01-01', to: (y - 1) + '-12-31', label: 'Calendar year ' + (y - 1) },
      m3: { from: addDays(today(), -90), to: today(), label: 'Last 3 months' } };
  }
  var X = { key: 'tax', from: null, to: null };
  function period() {
    if (X.key === 'custom' && X.from && X.to) return { from: X.from, to: X.to, label: day(X.from) + ' to ' + day(X.to) };
    return periods()[X.key] || periods().tax;
  }
  TABS.expenses = async function () {
    var v = V(), P = period(), to = P.to > today() ? today() : P.to;
    v.innerHTML = empty('Loading…');
    if (P.from > to) { to = P.from; }
    var r = await Promise.all([
      sb.rpc('finance_summary', { p_from: P.from, p_to: to }),
      sb.from('expenses').select('*').gte('spent_on', P.from).lte('spent_on', to).order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(1000),
      sb.from('orders').select('id', { count: 'exact', head: true }).neq('status', 'cancelled').neq('payment_status', 'paid').gte('created_at', P.from + 'T00:00:00').lte('created_at', to + 'T23:59:59'),
    ]);
    if (r[0].error || r[1].error) { v.innerHTML = empty('Could not load: ' + E((r[0].error || r[1].error).message)); return; }
    var sum = r[0].data || { months: [], by_category: {} }, list = r[1].data || [], unpaid = r[2].count || 0;
    var T = sum.months.reduce(function (a, m) { a.sales += m.sales_cents; a.ref += m.refunds_cents; a.exp += m.expenses_cents; a.vat += m.vat_cents; a.orders += m.orders; return a; }, { sales: 0, ref: 0, exp: 0, vat: 0, orders: 0 });
    var profit = T.sales - T.ref - T.exp;
    var max = sum.months.reduce(function (m, x) { return Math.max(m, x.sales_cents, x.expenses_cents); }, 0) || 1;
    var cats = Object.keys(sum.by_category || {}).map(function (k) { return [k, sum.by_category[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var cmax = cats.length ? cats[0][1] : 1;
    var ps = periods();
    v.innerHTML = "<div class='gx ex'><div class='xintro pf-head'><div><h2>Expenses and accounts</h2><p class='saved'>Note what the business spends, see your real profit month by month, and download one tidy file for your accountant. Stock orders marked Arrived in Suppliers are added here by themselves.</p></div>" +
      "<div class='pf-tools'><label>Period <select id='exPeriod'>" + Object.keys(ps).map(function (k) { return "<option value='" + k + "'" + (X.key === k ? ' selected' : '') + '>' + E(ps[k].label) + '</option>'; }).join('') +
        "<option value='custom'" + (X.key === 'custom' ? ' selected' : '') + '>Choose dates…</option></select></label>' +
        "<span id='exCustom' class='ex-custom'" + (X.key === 'custom' ? '' : ' hidden') + "><input type='date' id='exFrom' aria-label='From' value='" + E(P.from) + "'><input type='date' id='exTo' aria-label='To' value='" + E(P.to) + "'><button type='button' class='btn btn-line' data-ex-apply>Show</button></span>" +
        "<button type='button' class='btn btn-solid' data-ex-dl>Download for accountant</button></div></div>" +
      "<div class='crm-stats'>" + st(MS(T.sales), 'sales from ' + T.orders + ' order' + (T.orders === 1 ? '' : 's')) + st(MS(T.ref), 'refunds') + st(MS(T.exp), 'expenses') +
        st(MS(profit), 'profit after expenses', profit < 0 ? 'warn' : '') + (T.vat ? st(MS(T.vat), 'VAT included in expenses') : '') + '</div>' +
      "<p class='saved'>Sales count every order that was not cancelled" + (unpaid ? ', including <strong>' + unpaid + ' not marked as paid</strong>' : '') + '. Sales include delivery charged to customers. This is a simple cash view to help you and your accountant; it is not a tax return.</p>' +
      "<div class='ex-grid'><form id='exForm' class='xcard st-form'><h3>Add an expense</h3>" +
        "<div class='st-row'><label>Date<input type='date' name='spent_on' required value='" + today() + "'></label><label>Type<select name='category'>" + CATS.map(function (c) { return "<option value='" + c[0] + "'" + (c[0] === 'packaging' ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select></label></div>' +
        "<label>What was it?<input name='description' required maxlength='200' placeholder='e.g. 200 jewellery boxes'></label>" +
        "<label>Paid to (optional)<input name='payee' maxlength='120' placeholder='e.g. Royal Mail'></label>" +
        "<div class='st-row'><label>Amount £<input name='amount' required inputmode='decimal' placeholder='0.00'></label><label>VAT included £ (optional)<input name='vat' inputmode='decimal' placeholder='0.00'></label></div>" +
        "<p class='err' id='exErr' role='alert'></p><button class='btn btn-solid'>Add expense</button></form>" +
        "<div class='xcard'><h3>Where the money went</h3>" + (cats.length ? "<ul class='ex-cats'>" + cats.map(function (c) {
          return '<li><span>' + E(CAT[c[0]] || c[0]) + '</span><strong>' + MS(c[1]) + "</strong><i class='ex-bar' data-w='" + Math.max(2, Math.round(c[1] / cmax * 100)) + "'></i></li>";
        }).join('') + '</ul>' : "<p class='saved'>Nothing spent in this period yet.</p>") + '</div></div>' +
      '<h3>Month by month</h3>' + (sum.months.length ? "<div class='tbl'><table class='ex-months'><thead><tr><th>Month</th><th>Orders</th><th>Sales</th><th>Refunds</th><th>Expenses</th><th>Profit</th><th class='ex-chart'><span class='ex-key'><i class='k-in'></i>sales <i class='k-out'></i>expenses</span></th></tr></thead><tbody>" +
        sum.months.map(function (m) {
          var p = m.sales_cents - m.refunds_cents - m.expenses_cents;
          var label = new Date(m.month + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
          return '<tr><td>' + label + '</td><td>' + m.orders + '</td><td>' + MS(m.sales_cents) + '</td><td>' + (m.refunds_cents ? MS(m.refunds_cents) : '—') + '</td><td>' + MS(m.expenses_cents) + '</td><td' + (p < 0 ? " class='ex-neg'" : '') + '>' + MS(p) + '</td>' +
            "<td class='ex-chart'><i class='ex-in' data-w='" + Math.round(m.sales_cents / max * 100) + "'></i><i class='ex-out' data-w='" + Math.round(m.expenses_cents / max * 100) + "'></i></td></tr>";
        }).join('') + '</tbody></table></div>' : empty('No months in this period.')) +
      '<h3>Expenses in this period</h3>' + (list.length ? "<div class='tbl'><table><thead><tr><th>Date</th><th>Type</th><th>What</th><th>Paid to</th><th>Amount</th><th>VAT</th><th></th></tr></thead><tbody>" +
        list.map(function (x) {
          return '<tr><td>' + day(x.spent_on) + '</td><td>' + E(CAT[x.category] || x.category) + '</td><td>' + E(x.description) + '</td><td>' + E(x.payee || '') + '</td><td>' + M2(x.amount_cents) + '</td><td>' + (x.vat_cents ? M2(x.vat_cents) : '') + '</td>' +
            "<td><button type='button' class='link' data-ex-del='" + E(x.id) + "' aria-label='Delete " + E(x.description) + "'>Delete</button></td></tr>";
        }).join('') + '</tbody></table></div>' : empty('No expenses in this period.')) + '</div>';
    $$('[data-w]', v).forEach(function (el) { el.style.width = el.dataset.w + '%'; });
  };
  async function exAdd(f) {
    var err = $('#exErr'), amt = pounds(f.elements.amount.value), vat = pounds(f.elements.vat.value);
    var row = { spent_on: f.elements.spent_on.value, category: f.elements.category.value, description: f.elements.description.value.trim(), payee: f.elements.payee.value.trim() || null, amount_cents: amt, vat_cents: vat };
    if (!row.description) { err.textContent = 'Say what the expense was.'; return; }
    if (isNaN(amt) || !f.elements.amount.value.trim()) { err.textContent = 'Type the amount, like 24.99.'; return; }
    if (isNaN(vat)) { err.textContent = 'VAT needs to be an amount like 4.17, or left empty.'; return; }
    if (vat > amt) { err.textContent = 'VAT is part of the amount, so it cannot be more than it.'; return; }
    var r = await sb.from('expenses').insert(row);
    if (r.error) { err.textContent = 'Could not save: ' + r.error.message; return; }
    TABS.expenses();
  }
  async function exportLedger() {
    var P = period(), to = P.to > today() ? today() : P.to;
    var r = await sb.rpc('finance_ledger', { p_from: P.from, p_to: to });
    if (r.error) { alert('Could not make the file: ' + r.error.message); return; }
    var rows = r.data || [], inn = 0, out = 0, vat = 0;
    var lines = [csvLine(['Date', 'Type', 'Reference', 'Description', 'Category', 'Money in (GBP)', 'Money out (GBP)', 'VAT included (GBP)', 'Payment status'])];
    rows.forEach(function (x) {
      inn += x.money_in; out += x.money_out; vat += x.vat;
      lines.push(csvLine([x.day, x.kind, x.ref, x.description, x.category === 'sales' ? 'Sales' : x.category === 'refunds' ? 'Refunds' : (CAT[x.category] || x.category),
        x.money_in ? (x.money_in / 100).toFixed(2) : '', x.money_out ? (x.money_out / 100).toFixed(2) : '', x.vat ? (x.vat / 100).toFixed(2) : '', x.paid || '']));
    });
    lines.push('');
    lines.push(csvLine(['', 'Totals', '', P.from + ' to ' + to, '', (inn / 100).toFixed(2), (out / 100).toFixed(2), (vat / 100).toFixed(2), '']));
    lines.push(csvLine(['', 'Money in minus money out', '', '', '', ((inn - out) / 100).toFixed(2), '', '', '']));
    download('luna-belly-accounts-' + P.from + '-to-' + to + '.csv', lines.join('\r\n'));
  }

  // ================================================================ Scan and stickers
  var Q = { mode: 'pack', prods: [], orders: [], order: null, packed: {}, counts: {}, pre: null };
  var SC = { stream: null, raf: 0, det: null, last: '', lastAt: 0, busy: false, t: 0, cv: null };
  var store = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (x) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (x) { /* private mode */ } },
  };
  var bySlug = function (s) { s = String(s || '').trim().toLowerCase(); return Q.prods.find(function (p) { return p.slug === s; }); };
  function parseCode(code) {
    code = String(code || '').trim();
    var m = code.match(/\/p\/([^/?#\s]+)/);
    var slug = m ? decodeURIComponent(m[1]) : code;
    var p = bySlug(slug);
    if (!p && !m && code.length >= 3) {
      var q = code.toLowerCase(), hits = Q.prods.filter(function (x) { return x.name.toLowerCase().indexOf(q) >= 0 || x.slug.indexOf(q) >= 0; });
      if (hits.length === 1) p = hits[0];
    }
    return p;
  }
  TABS.scan = async function () {
    var v = V();
    v.innerHTML = empty('Loading…');
    var r = await Promise.all([
      sb.from('products').select('id,name,slug,price_cents,stock_qty,image_url').order('sort_order'),
      sb.from('orders').select('id,order_number,customer_name,items,status,is_gift,created_at').in('status', ['pending', 'confirmed']).order('created_at', { ascending: true }).limit(200),
    ]);
    if (r[0].error) { v.innerHTML = empty('Could not load: ' + E(r[0].error.message)); return; }
    Q.prods = r[0].data || []; Q.orders = r[1].data || [];
    Q.counts = store.get('lb_stockcount', {}) || {};
    if (Q.pre) { Q.mode = 'pack'; Q.order = Q.orders.find(function (o) { return o.id === Q.pre; }) || null; Q.packed = {}; Q.pre = null; }
    else if (Q.order) Q.order = Q.orders.find(function (o) { return o.id === Q.order.id; }) || null;
    drawScan();
  };
  function drawScan() {
    camStop();
    var v = V(), m = Q.mode;
    var seg = [['pack', 'Pack an order'], ['count', 'Count stock'], ['stickers', 'Print stickers']].map(function (x) {
      return "<button type='button' class='seg" + (m === x[0] ? ' on' : '') + "' data-qmode='" + x[0] + "' aria-pressed='" + (m === x[0]) + "'>" + x[1] + '</button>';
    }).join('');
    v.innerHTML = "<div class='gx sc'><div class='xintro'><h2>Scan and stickers</h2><p class='saved'>Put a small QR sticker on each piece's bag. Then scan with your phone's camera here to check you packed the right pieces, or to count your stock in a minute. Scanning a sticker with any phone camera opens that piece on your shop.</p></div>" +
      "<div class='segs' role='group' aria-label='What to do'>" + seg + '</div>' +
      (m === 'stickers' ? stickersPane() : "<div class='sc-grid'>" + (m === 'pack' ? packPane() : countPane()) + camPane() + '</div>') + '</div>';
    if (m === 'stickers') qrPreview();
  }
  function camPane() {
    return "<div class='xcard sc-cam'><div class='scan-box' id='scBox'><video id='scVideo' playsinline muted></video><span class='scan-frame' aria-hidden='true'></span>" +
      "<p class='scan-idle'>" + svg("<path d='M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3'/><path d='M8 12h8'/>") + 'Camera is off</p></div>' +
      "<p id='scMsg' class='scan-msg' role='status' aria-live='polite'>" + (Q.mode === 'pack' && !Q.order ? 'Choose an order first.' : 'Start the camera and hold a sticker up to it.') + '</p>' +
      "<div class='sc-btns'><button type='button' class='btn btn-solid' data-scstart>Start camera</button></div>" +
      "<form id='scManual' class='sc-manual'><input name='code' placeholder='No camera? Type the code under the QR' aria-label='Sticker code'><button class='btn btn-line'>Add</button></form></div>";
  }
  // ---------------- pack
  function orderUnits(o) { return (o.items || []).reduce(function (s, i) { return s + (i.qty || 1); }, 0); }
  function packPane() {
    var o = Q.order;
    return "<div class='xcard'><h3>Pack an order</h3><label>Order<select id='pkOrder'><option value=''>Choose an order…</option>" +
      Q.orders.map(function (x) {
        return "<option value='" + E(x.id) + "'" + (o && o.id === x.id ? ' selected' : '') + '>' + E(x.order_number) + ' · ' + E(String(x.customer_name || '').split(' ')[0]) + ' · ' + orderUnits(x) + ' piece' + (orderUnits(x) === 1 ? '' : 's') + (x.status === 'pending' ? ' · not confirmed yet' : '') + '</option>';
      }).join('') + '</select></label>' +
      (Q.orders.length ? '' : "<p class='saved'>No orders waiting to be packed.</p>") + "<div id='pkList'>" + packList() + '</div></div>';
  }
  function packList() {
    var o = Q.order; if (!o) return '';
    var done = 0, total = orderUnits(o);
    var li = (o.items || []).map(function (it, i) {
      var n = Q.packed[i] || 0, q = it.qty || 1; done += Math.min(n, q);
      return "<li class='pk-item" + (n >= q ? ' ok' : '') + "'><span class='pk-tick' aria-hidden='true'>" + (n >= q ? '✓' : '') + "</span><span class='pk-n'>" + E(it.name) + "</span><span class='pk-c'>" + n + ' of ' + q + '</span>' +
        (n < q ? "<button type='button' class='link' data-pk-plus='" + i + "' aria-label='Mark one " + E(it.name) + " as packed without scanning'>+1</button>" : '') + '</li>';
    }).join('');
    var all = done >= total;
    return "<div class='pk-prog'><i data-w='" + Math.round(done / (total || 1) * 100) + "'></i></div><p class='pk-sum'>" + done + ' of ' + total + ' packed' + (o.is_gift ? ' · <strong>gift order</strong>: no prices in the parcel' : '') + '</p>' +
      "<ul class='pk-list'>" + li + '</ul>' +
      (all ? "<div class='pk-done'><p><strong>All packed.</strong> " + E(o.order_number) + " is ready to post.</p><button type='button' class='btn btn-solid' data-go-dispatch>Go to Dispatch</button></div>" : '');
  }
  function paintPack() { var b = $('#pkList'); if (b) { b.innerHTML = packList(); $$('[data-w]', b).forEach(function (el) { el.style.width = el.dataset.w + '%'; }); } }
  function packScan(p) {
    var o = Q.order;
    if (!o) { say('Choose an order first.', 'bad'); return; }
    var items = o.items || [], i = items.findIndex(function (it, k) { return it.id === p.id && (Q.packed[k] || 0) < (it.qty || 1); });
    if (i < 0) {
      var inOrder = items.some(function (it) { return it.id === p.id; });
      say(inOrder ? 'You already have enough ' + p.name + ' for this order.' : p.name + ' is not in this order. Put it back.', 'bad');
      return;
    }
    Q.packed[i] = (Q.packed[i] || 0) + 1;
    paintPack();
    var left = orderUnits(o) - items.reduce(function (s, it, k) { return s + Math.min(Q.packed[k] || 0, it.qty || 1); }, 0);
    say(p.name + ' packed. ' + (left ? left + ' to go.' : 'All done.'), 'good');
  }
  // ---------------- count
  function countPane() {
    var ids = Object.keys(Q.counts).filter(function (id) { return Q.prods.some(function (p) { return p.id === id; }); });
    var rows = ids.map(function (id) {
      var p = Q.prods.find(function (x) { return x.id === id; }), n = Q.counts[id], cur = p.stock_qty, diff = cur == null ? null : n - cur;
      return '<tr><td>' + E(p.name) + "</td><td class='ct-n'><button type='button' class='ct-b' data-ct='" + E(id) + "' data-d='-1' aria-label='One less " + E(p.name) + "'>−</button><strong>" + n + "</strong><button type='button' class='ct-b' data-ct='" + E(id) + "' data-d='1' aria-label='One more " + E(p.name) + "'>+</button></td>" +
        '<td>' + (cur == null ? '<small>not counted before</small>' : cur) + '</td><td' + (diff ? " class='ex-neg'" : '') + '>' + (diff == null ? '' : diff === 0 ? 'matches' : (diff > 0 ? '+' : '') + diff) + '</td></tr>';
    }).join('');
    return "<div class='xcard'><h3>Count stock</h3><p class='saved'>Scan every piece you have, one sticker at a time. Move each sticker away before the next one, so it counts once. Then press Save. Only the pieces you counted change.</p>" +
      (ids.length ? "<div class='tbl'><table class='ct-tbl'><thead><tr><th>Piece</th><th>Counted</th><th>In Studio now</th><th>Difference</th></tr></thead><tbody>" + rows + '</tbody></table></div>' +
        "<div class='sc-btns'><button type='button' class='btn btn-solid' data-ct-save>Save counts</button><button type='button' class='link' data-ct-clear>Start again</button></div>" : "<p class='saved'>Nothing counted yet.</p>") + '</div>';
  }
  function countScan(p) {
    Q.counts[p.id] = (Q.counts[p.id] || 0) + 1; store.set('lb_stockcount', Q.counts);
    var pane = $('.sc-grid > .xcard'); if (pane) pane.outerHTML = countPane();
    say(p.name + ': ' + Q.counts[p.id] + ' counted.', 'good');
  }
  async function countSave() {
    var ids = Object.keys(Q.counts);
    if (!ids.length) return;
    if (!confirm('Set the stock for ' + ids.length + ' piece' + (ids.length === 1 ? '' : 's') + ' to what you counted? Pieces you did not scan are not changed.')) return;
    var fails = [];
    for (var i = 0; i < ids.length; i++) {
      var n = Q.counts[ids[i]];
      var r = await sb.from('products').update({ stock_qty: n, in_stock: n > 0 }).eq('id', ids[i]);
      if (r.error) fails.push(ids[i]);
    }
    if (fails.length) { alert('Some counts could not be saved. Please try again.'); return; }
    Q.counts = {}; store.set('lb_stockcount', {});
    await TABS.scan();
    say('Stock saved for ' + ids.length + ' piece' + (ids.length === 1 ? '' : 's') + '.', 'good');
  }
  // ---------------- stickers
  var STK = { s: { label: 'Small, 40 per sheet', per: 40 }, m: { label: 'Medium, 21 per sheet', per: 21 }, l: { label: 'Large, 8 per sheet', per: 8 } };
  function stickersPane() {
    var size = store.get('lb_qrsize', 'm'), price = store.get('lb_qrprice', true);
    return "<div class='sc-grid'><div class='xcard'><h3>Print stickers</h3><p class='saved'>Choose how many stickers you need for each piece. Sizes match standard A4 label sheets (for example Avery L7160 has 21). Print one page on plain paper first and hold it against a label sheet to check it lines up.</p>" +
      "<div class='st-row'><label>Sticker size<select id='qrSize'>" + Object.keys(STK).map(function (k) { return "<option value='" + k + "'" + (k === size ? ' selected' : '') + '>' + STK[k].label + '</option>'; }).join('') + '</select></label>' +
      "<label class='chk qr-pr'><input type='checkbox' id='qrPrice'" + (price ? ' checked' : '') + '> Show the price</label></div>' +
      "<div class='tbl'><table class='qr-tbl'><thead><tr><th><input type='checkbox' id='qrAll' checked aria-label='All pieces'></th><th>Piece</th><th>Code</th><th>How many</th></tr></thead><tbody>" +
      Q.prods.map(function (p) {
        return "<tr><td><input type='checkbox' class='qr-sel' value='" + E(p.id) + "' checked aria-label='Print " + E(p.name) + "'></td><td>" + E(p.name) + '</td><td><code>' + E(p.slug) + "</code></td><td><input class='qr-n' data-id='" + E(p.id) + "' inputmode='numeric' value='" + (p.stock_qty > 0 ? Math.min(p.stock_qty, 200) : 1) + "' aria-label='How many stickers for " + E(p.name) + "'></td></tr>";
      }).join('') + '</tbody></table></div>' +
      "<div class='sc-btns'><button type='button' class='btn btn-solid' data-qr-print>Print stickers</button><span id='qrCount' class='saved'></span></div></div>" +
      "<div class='xcard'><h3>How a sticker looks</h3><div id='qrPrev' class='qr-prev'></div><p class='saved'>The code under the QR is what you type if the camera can't read a sticker.</p></div></div>";
  }
  function qrUrl(p) { return location.origin + '/p/' + encodeURIComponent(p.slug); }
  function qrSvg(text) {
    var q = window.qrcode(0, 'M'); q.addData(text); q.make();
    var n = q.getModuleCount(), d = '';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return "<svg class='qr' viewBox='-2 -2 " + (n + 4) + ' ' + (n + 4) + "' shape-rendering='crispEdges' aria-hidden='true'><rect x='-2' y='-2' width='" + (n + 4) + "' height='" + (n + 4) + "' fill='#fff'/><path d='" + d + "' fill='#000'/></svg>";
  }
  function label(p, price) {
    return "<div class='qr-lab'>" + qrSvg(qrUrl(p)) + "<div class='qr-t'><p class='qr-name'>" + E(p.name) + "</p><p class='qr-code'>" + E(p.slug) + '</p>' + (price ? "<p class='qr-price'>" + MS(p.price_cents) + '</p>' : '') + '</div></div>';
  }
  function picks() {
    return $$('.qr-sel:checked').map(function (b) {
      var p = Q.prods.find(function (x) { return x.id === b.value; }), n = parseInt(($(".qr-n[data-id='" + b.value + "']") || {}).value, 10);
      return { p: p, n: isFinite(n) ? Math.max(0, Math.min(500, n)) : 0 };
    }).filter(function (x) { return x.p && x.n > 0; });
  }
  async function qrPreview() {
    try { await loadScript('qr'); } catch (e) { var b0 = $('#qrPrev'); if (b0) b0.textContent = 'Could not load the QR maker. Check your connection.'; return; }
    var box = $('#qrPrev'); if (!box || !Q.prods[0]) return;
    var size = ($('#qrSize') || {}).value || 'm';
    box.className = 'qr-prev qr-' + size;
    box.innerHTML = label(Q.prods[0], $('#qrPrice') && $('#qrPrice').checked);
    qrCount();
  }
  function qrCount() {
    var list = picks(), n = list.reduce(function (s, x) { return s + x.n; }, 0), per = STK[($('#qrSize') || {}).value || 'm'].per;
    var c = $('#qrCount'); if (c) c.textContent = n ? n + ' sticker' + (n === 1 ? '' : 's') + ', ' + Math.ceil(n / per) + ' sheet' + (Math.ceil(n / per) === 1 ? '' : 's') : 'Nothing chosen';
  }
  async function qrPrint() {
    try { await loadScript('qr'); } catch (e) { alert('Could not load the QR maker. Check your connection.'); return; }
    var list = picks(); if (!list.length) { alert('Choose at least one piece.'); return; }
    var size = $('#qrSize').value, per = STK[size].per, price = $('#qrPrice').checked, labs = [];
    list.forEach(function (x) { var one = label(x.p, price); for (var i = 0; i < x.n; i++) labs.push(one); });
    var pages = []; for (var i = 0; i < labs.length; i += per) pages.push("<div class='qr-page'>" + labs.slice(i, i + per).join('') + '</div>');
    var pa = $('#qrPrint');
    if (!pa) { document.body.insertAdjacentHTML('beforeend', "<div id='qrPrint' aria-hidden='true'></div>"); pa = $('#qrPrint'); }
    pa.className = 'qr-' + size; pa.innerHTML = pages.join('');
    document.body.classList.add('printing-qr');
    var done = function () { document.body.classList.remove('printing-qr'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 60000);
  }
  // ---------------- camera
  var beepCtx = null;
  function beep(ok) {
    try {
      beepCtx = beepCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = beepCtx.createOscillator(), g = beepCtx.createGain();
      o.frequency.value = ok ? 880 : 200; o.type = ok ? 'sine' : 'square'; g.gain.value = 0.08;
      o.connect(g); g.connect(beepCtx.destination); o.start(); o.stop(beepCtx.currentTime + (ok ? 0.09 : 0.25));
    } catch (e) { /* no sound */ }
    if (navigator.vibrate) navigator.vibrate(ok ? 40 : [80, 60, 80]);
  }
  function say(t, kind) {
    var m = $('#scMsg'); if (m) { m.textContent = t; m.className = 'scan-msg ' + (kind || ''); }
    var b = $('#scBox'); if (b && kind) { b.classList.remove('flash-good', 'flash-bad'); void b.offsetWidth; b.classList.add('flash-' + kind); }
    if (kind) beep(kind === 'good');
  }
  function onCode(code) {
    var p = parseCode(code);
    if (!p) { say('That is not one of your Luna Belly stickers.', 'bad'); return; }
    if (Q.mode === 'pack') packScan(p); else if (Q.mode === 'count') countScan(p);
  }
  async function camStart() {
    var vid = $('#scVideo'); if (!vid) return;
    if (SC.stream) { camStop(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say('This browser cannot use the camera. Type the code instead.', 'bad'); return; }
    var btn = $('[data-scstart]');
    try { SC.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }); }
    catch (x) { say(x && x.name === 'NotAllowedError' ? 'The camera was not allowed. Allow it for this site in your browser settings, or type the code instead.' : 'Could not start the camera. You can type the code instead.', 'bad'); return; }
    vid.srcObject = SC.stream;
    try { await vid.play(); } catch (e) { /* autoplay */ }
    SC.det = null;
    if ('BarcodeDetector' in window) {
      try { var f = await window.BarcodeDetector.getSupportedFormats(); if (f.indexOf('qr_code') >= 0) SC.det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { SC.det = null; }
    }
    if (!SC.det) { try { await loadScript('scan'); } catch (e) { say('Could not load the scanner. Check your connection.', 'bad'); camStop(); return; } }
    var box = $('#scBox'); if (box) box.classList.add('on');
    if (btn) btn.textContent = 'Stop camera';
    say(Q.mode === 'pack' && !Q.order ? 'Choose an order first.' : 'Ready. Hold a sticker up to the camera.', '');
    SC.raf = requestAnimationFrame(tick);
  }
  function camStop() {
    cancelAnimationFrame(SC.raf); SC.raf = 0;
    if (SC.stream) { SC.stream.getTracks().forEach(function (t) { t.stop(); }); SC.stream = null; }
    var vid = $('#scVideo'); if (vid) vid.srcObject = null;
    var box = $('#scBox'); if (box) box.classList.remove('on');
    var btn = $('[data-scstart]'); if (btn) btn.textContent = 'Start camera';
  }
  async function decode(vid) {
    if (SC.det) { var r = await SC.det.detect(vid); return r && r[0] ? r[0].rawValue : ''; }
    if (!window.jsQR || !vid.videoWidth) return '';
    var w = Math.min(640, vid.videoWidth), h = Math.round(vid.videoHeight * w / vid.videoWidth);
    SC.cv = SC.cv || document.createElement('canvas');
    SC.cv.width = w; SC.cv.height = h;
    var ctx = SC.cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(vid, 0, 0, w, h);
    var img = ctx.getImageData(0, 0, w, h), q = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
    return q ? q.data : '';
  }
  async function tick(ts) {
    var vid = $('#scVideo');
    if (!vid || !SC.stream) { camStop(); return; }
    if (!SC.busy && ts - SC.t > 140 && vid.readyState >= 2) {
      SC.t = ts; SC.busy = true;
      try {
        var code = await decode(vid);
        if (code) {
          var now = Date.now();
          if (code === SC.last && now - SC.lastAt < 1500) SC.lastAt = now;
          else { SC.last = code; SC.lastAt = now; onCode(code); }
        }
      } catch (e) { /* skip frame */ }
      SC.busy = false;
    }
    if (SC.stream) SC.raf = requestAnimationFrame(tick);
  }
  // Leaving the screen switches the camera off.
  var view = document.getElementById('view');
  if (view) new MutationObserver(function () {
    if (SC.stream && !document.getElementById('scVideo')) camStop();
    var acts = document.querySelector('.dp-actions');
    if (acts && !acts.querySelector('[data-dp-scan]')) acts.insertAdjacentHTML('beforeend', "<button type='button' class='btn btn-line' data-dp-scan>Scan to pack</button>");
  }).observe(view, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', function () { if (document.hidden) camStop(); });

  // ================================================================ events
  document.addEventListener('click', async function (e) {
    var t = e.target.closest('[data-stclose],[data-po-new],[data-sup-new],[data-sup-edit],[data-sup-del],[data-po-edit],[data-po-again],[data-po-cancel],[data-po-del],[data-po-arrive],[data-po-confirm],[data-po-way],[data-pl-add],[data-pl-rm],' +
      '[data-ex-dl],[data-ex-apply],[data-ex-del],[data-qmode],[data-scstart],[data-pk-plus],[data-go-dispatch],[data-ct],[data-ct-save],[data-ct-clear],[data-qr-print],[data-dp-scan]');
    if (!t) return;
    var d = t.dataset, po;
    if ('stclose' in d) closeDlg();
    else if ('poNew' in d) poForm(null, { supplier: d.poNew || null });
    else if ('supNew' in d) supForm();
    else if (d.supEdit) supForm(supById(d.supEdit));
    else if (d.supDel) {
      if (S.pos.some(function (p) { return p.supplier_id === d.supDel; })) { alert('This supplier has stock orders, so it is kept for your records. You can edit its details instead.'); return; }
      if (!confirm('Delete this supplier?')) return;
      var r0 = await sb.from('suppliers').delete().eq('id', d.supDel);
      if (r0.error) alert('Could not delete: ' + r0.error.message); else TABS.suppliers();
    } else if (d.poEdit) poForm(S.pos.find(function (p) { return p.id === d.poEdit; }));
    else if (d.poAgain) {
      po = S.pos.find(function (p) { return p.id === d.poAgain; });
      poForm({ supplier_id: po.supplier_id, ordered_on: today(), shipping_cents: po.shipping_cents, duties_cents: 0,
        purchase_order_lines: (po.purchase_order_lines || []).map(function (l) { return { product_id: l.product_id, description: l.description, qty: l.qty, unit_cost_cents: l.unit_cost_cents }; }) });
    } else if (d.poCancel) {
      if (!confirm('Cancel this stock order? Nothing is added to stock or expenses.')) return;
      var r1 = await sb.from('purchase_orders').update({ status: 'cancelled' }).eq('id', d.poCancel);
      if (r1.error) alert('Could not cancel: ' + r1.error.message); else TABS.suppliers();
    } else if (d.poDel) {
      if (!confirm('Delete this cancelled order for good?')) return;
      var r2 = await sb.from('purchase_orders').delete().eq('id', d.poDel);
      if (r2.error) alert('Could not delete: ' + r2.error.message); else TABS.suppliers();
    } else if (d.poArrive) arriveDlg(S.pos.find(function (p) { return p.id === d.poArrive; }));
    else if (d.poConfirm) arrive(d.poConfirm);
    else if (d.poWay) wayDlg(S.pos.find(function (p) { return p.id === d.poWay; }));
    else if ('plAdd' in d) { $('#poLines').insertAdjacentHTML('beforeend', lineRow()); poSum(); }
    else if ('plRm' in d) { if ($$('#poLines .po-line').length > 1) { t.closest('.po-line').remove(); poSum(); } }
    else if ('exDl' in d) exportLedger();
    else if ('exApply' in d) {
      var f1 = $('#exFrom').value, f2 = $('#exTo').value;
      if (!f1 || !f2 || f2 < f1) { alert('Choose a start date and an end date after it.'); return; }
      if (daysBetween(f1, f2) > 800) { alert('Choose a period of up to two years.'); return; }
      X.key = 'custom'; X.from = f1; X.to = f2; TABS.expenses();
    } else if (d.exDel) {
      if (!confirm('Delete this expense?')) return;
      var r3 = await sb.from('expenses').delete().eq('id', d.exDel);
      if (r3.error) alert('Could not delete: ' + r3.error.message); else TABS.expenses();
    } else if (d.qmode) { Q.mode = d.qmode; drawScan(); }
    else if ('scstart' in d) camStart();
    else if (d.pkPlus != null) {
      var it = Q.order && Q.order.items[+d.pkPlus];
      if (it) { Q.packed[+d.pkPlus] = (Q.packed[+d.pkPlus] || 0) + 1; paintPack(); say(it.name + ' marked as packed.', ''); }
    } else if ('goDispatch' in d) go('dispatch');
    else if (d.ct) {
      Q.counts[d.ct] = Math.max(0, (Q.counts[d.ct] || 0) + Number(d.d));
      store.set('lb_stockcount', Q.counts);
      var pane = $('.sc-grid > .xcard'); if (pane) pane.outerHTML = countPane();
    } else if ('ctSave' in d) countSave();
    else if ('ctClear' in d) { if (confirm('Clear what you have counted so far?')) { Q.counts = {}; store.set('lb_stockcount', {}); drawScan(); } }
    else if ('qrPrint' in d) qrPrint();
    else if ('dpScan' in d) {
      var sel = document.querySelector('.dp-sel:checked');
      Q.pre = sel ? sel.value : null; Q.mode = 'pack'; Q.order = null; Q.packed = {};
      go('scan');
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.classList.contains('pl-prod')) {
      var row = t.closest('.po-line'), other = t.value === '__other';
      $('.pl-desc', row).hidden = !other;
      var c = $('.pl-cost', row); if (!other && !c.value) c.value = pv(lastCost(t.value));
      poSum();
    } else if (t.name === 'supplier_id' && t.form && t.form.id === 'poForm') {
      var s = supById(t.value), f = t.form;
      if (s && s.lead_days != null && !f.dataset.id) f.elements.expected_on.value = addDays(f.elements.ordered_on.value || today(), s.lead_days);
    } else if (t.id === 'exPeriod') {
      if (t.value === 'custom') { $('#exCustom').hidden = false; return; }
      X.key = t.value; TABS.expenses();
    } else if (t.id === 'pkOrder') {
      Q.order = Q.orders.find(function (o) { return o.id === t.value; }) || null; Q.packed = {};
      paintPack(); say(Q.order ? 'Scan each piece as it goes into the parcel.' : 'Choose an order first.', '');
    } else if (t.id === 'qrSize') { store.set('lb_qrsize', t.value); qrPreview(); }
    else if (t.id === 'qrPrice') { store.set('lb_qrprice', t.checked); qrPreview(); }
    else if (t.id === 'qrAll') { $$('.qr-sel').forEach(function (b) { b.checked = t.checked; }); qrCount(); }
    else if (t.classList.contains('qr-sel')) qrCount();
  });
  document.addEventListener('input', function (e) {
    if (e.target.closest && e.target.closest('#poForm')) poSum();
    if (e.target.classList && e.target.classList.contains('qr-n')) qrCount();
  });
  document.addEventListener('submit', async function (e) {
    var f = e.target, id = f.id;
    if (['poForm', 'supForm', 'wayForm', 'exForm', 'scManual'].indexOf(id) < 0) return;
    e.preventDefault(); e.stopPropagation();
    if (id === 'poForm') poSave(f);
    else if (id === 'supForm') supSave(f);
    else if (id === 'exForm') exAdd(f);
    else if (id === 'scManual') { var c = f.elements.code.value.trim(); if (c) { onCode(c); f.elements.code.value = ''; } }
    else if (id === 'wayForm') {
      var r = await sb.from('purchase_orders').update({ status: 'on_the_way', tracking: f.elements.tracking.value.trim() || null, expected_on: f.elements.expected_on.value || null }).eq('id', f.dataset.id);
      if (r.error) { $('#wayErr').textContent = 'Could not save: ' + r.error.message; return; }
      closeDlg(); TABS.suppliers();
    }
  }, true);
})();
