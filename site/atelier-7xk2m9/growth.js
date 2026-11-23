'use strict';
/* Studio: Newsletter (TABS.news), Profit and stock (TABS.profit), Dispatch: packing slips and Royal Mail (TABS.dispatch).
   Loads after studio.js and reuses its globals (sb, TABS, esc, empty, when, money). */
(function () {
  if (typeof sb === 'undefined' || typeof TABS === 'undefined') return;
  var V = function () { return document.getElementById('view'); };
  var E = function (s) { return esc(s); };
  var M = function (c) { return money(c || 0); };
  var MS = function (c) { return M(c).replace(/\.00$/, ''); };
  var day = function (d) { return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
  var stamp = function () { return new Date().toISOString().slice(0, 10); };
  var CFG = window.LUNA_CONFIG || {};
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: type || 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function csvLine(arr) {
    return arr.map(function (v) {
      v = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(',');
  }

  // ================================================================ Newsletter
  var AUD = [['all', 'Everyone on the newsletter'], ['buyers', 'Subscribers who have ordered'], ['non_buyers', 'Subscribers who have not ordered yet'], ['vip', 'VIP subscribers']];
  var N = { products: [], tags: [], edit: null };
  function para(t) {
    return E(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(https?:\/\/[^\s<]+)/g, "<a href='$1' target='_blank' rel='noopener'>$1</a>").replace(/\n/g, '<br>');
  }
  function preview(subject, body, ids) {
    var ps = ids.map(function (id) { return N.products.find(function (p) { return p.id === id; }); }).filter(Boolean);
    return "<div class='nl-prev'><div class='nl-card'><p class='nl-logo'>Luna Belly</p><h1>" + (E(subject) || '<span class="muted">Your subject</span>') + '</h1>' +
      (body.trim() ? body.split(/\n{2,}/).map(function (t) { return t.trim() ? '<p>' + para(t.trim()) + '</p>' : ''; }).join('') : "<p class='muted'>Your message appears here.</p>") +
      (ps.length ? "<div class='nl-prods'>" + ps.map(function (p) {
        return '<div>' + (p.image_url ? "<img src='" + E(p.image_url) + "' alt=''>" : '') + '<p>' + E(p.name) + '</p><small>' + MS(p.price_cents) + '</small></div>';
      }).join('') + '</div>' : '') +
      "<p class='nl-btn'><span>Shop the collection</span></p></div><p class='nl-foot'>You are receiving this because you joined the Luna Belly list. Unsubscribe at any time.</p></div>";
  }
  async function audCount(a) {
    var r = await sb.rpc('newsletter_audience', { p_audience: a });
    return r.error ? null : (r.data || []).length;
  }
  TABS.news = async function () {
    var v = V();
    v.innerHTML = empty('Loading…');
    var r = await Promise.all([
      sb.from('campaigns').select('*').order('created_at', { ascending: false }).limit(50),
      sb.from('products').select('id,name,price_cents,image_url,in_stock').order('sort_order'),
      sb.from('crm_customers').select('tags'),
      sb.from('subscribers').select('email', { count: 'exact', head: true }),
    ]);
    if (r[0].error) { v.innerHTML = empty('Could not load newsletters: ' + E(r[0].error.message)); return; }
    N.products = r[1].data || [];
    var t = {}; (r[2].data || []).forEach(function (c) { (c.tags || []).forEach(function (g) { t[g] = 1; }); }); N.tags = Object.keys(t).sort();
    var camps = r[0].data || [];
    var subs = r[3].count || 0;
    v.innerHTML = "<div class='gx'>" +
      "<div class='xintro'><h2>Newsletter</h2><p class='saved'>Write to people who joined your list. Every email has an unsubscribe link, and only subscribers receive it. You have <strong>" + subs + '</strong> subscriber' + (subs === 1 ? '' : 's') + '. The free plan can send up to 250 newsletters a day.</p></div>' +
      "<div class='nl-wrap'><form id='nlForm' class='xcard nl-form'><h3 id='nlTitle'>New newsletter</h3>" +
        "<label>Subject<input name='subject' maxlength='150' required placeholder='e.g. New festive pieces for Diwali'></label>" +
        "<label>Message<textarea name='body' rows='9' placeholder='Write as you would to a friend. Leave an empty line between paragraphs. Put **two stars** around words to make them bold.'></textarea></label>" +
        "<fieldset class='nl-pick'><legend>Pieces to show (up to 6)</legend><div>" + N.products.map(function (p) {
          return "<label class='nl-p'><input type='checkbox' name='prod' value='" + E(p.id) + "'><span>" + E(p.name) + (p.in_stock ? '' : ' <small>(sold out)</small>') + '</span></label>';
        }).join('') + '</div></fieldset>' +
        "<label>Send to<select name='audience'>" + AUD.map(function (a) { return "<option value='" + a[0] + "'>" + a[1] + '</option>'; }).join('') +
          N.tags.map(function (g) { return "<option value='tag:" + E(g) + "'>Subscribers tagged “" + E(g) + "”</option>"; }).join('') + '</select></label>' +
        "<p class='saved' id='nlCount'></p>" +
        "<div class='nl-actions'><button type='submit' class='btn btn-line' data-nl='save'>Save draft</button><button type='button' class='btn btn-line' data-nl='test'>Send me a test</button><button type='button' class='btn btn-solid' data-nl='send'>Send</button></div>" +
        "<p class='err' id='nlMsg' role='status'></p></form>" +
      "<div><p class='eyebrow nl-ptitle'>Preview</p><div id='nlPrev'></div></div></div>" +
      "<section class='xcard'><h3>Sent and drafts</h3>" + (camps.length ? "<div class='tbl'><table><thead><tr><th>Subject</th><th>To</th><th>Status</th><th>Date</th><th></th></tr></thead><tbody>" + camps.map(function (c) {
        var a = AUD.find(function (x) { return x[0] === c.audience; });
        return '<tr><td>' + E(c.subject) + '</td><td>' + E(a ? a[1] : c.audience.replace(/^tag:/, 'Tagged ')) + '</td><td>' +
          (c.status === 'sent' ? "<span class='tag ok'>Sent to " + c.sent_count + '</span>' + (c.fail_count ? " <span class='tag pending'>" + c.fail_count + ' failed</span>' : '') : c.status === 'sending' ? "<span class='tag pending'>Sending</span>" : "<span class='tag'>Draft</span>") +
          '</td><td>' + day(c.sent_at || c.created_at) + '</td><td>' + (c.status === 'draft' ? "<button type='button' class='link' data-nledit='" + E(c.id) + "'>Edit</button> · <button type='button' class='link' data-nldel='" + E(c.id) + "'>Delete</button>" : "<button type='button' class='link' data-nlcopy='" + E(c.id) + "'>Use again</button>") + '</td></tr>';
      }).join('') + '</tbody></table></div>' : "<p class='saved'>Nothing sent yet.</p>") + '</section></div>';
    N.edit = null; N.camps = camps;
    nlPaint();
  };
  function nlData() {
    var f = document.getElementById('nlForm');
    return { subject: f.elements.subject.value.trim(), body: f.elements.body.value, audience: f.elements.audience.value,
      product_ids: Array.prototype.slice.call(f.querySelectorAll('[name=prod]:checked')).map(function (x) { return x.value; }).slice(0, 6) };
  }
  var cT = null;
  function nlPaint() {
    var f = document.getElementById('nlForm'); if (!f) return;
    var d = nlData();
    document.getElementById('nlPrev').innerHTML = preview(d.subject, d.body, d.product_ids);
    var boxes = f.querySelectorAll('[name=prod]'), n = d.product_ids.length;
    Array.prototype.forEach.call(boxes, function (b) { b.disabled = !b.checked && n >= 6; });
    clearTimeout(cT);
    cT = setTimeout(async function () {
      var c = await audCount(d.audience), el = document.getElementById('nlCount');
      if (el) { el.textContent = c == null ? '' : c + ' subscriber' + (c === 1 ? '' : 's') + ' will get it.'; el.dataset.n = c; }
    }, 200);
  }
  function nlLoad(c, copyOf) {
    var f = document.getElementById('nlForm');
    f.elements.subject.value = c.subject; f.elements.body.value = c.body; f.elements.audience.value = c.audience;
    Array.prototype.forEach.call(f.querySelectorAll('[name=prod]'), function (b) { b.checked = (c.product_ids || []).indexOf(b.value) >= 0; });
    N.edit = copyOf ? null : c.id;
    document.getElementById('nlTitle').textContent = copyOf ? 'New newsletter (copy)' : 'Edit draft';
    nlPaint(); f.scrollIntoView({ behavior: 'smooth' });
  }
  async function nlSave() {
    var d = nlData(), msg = document.getElementById('nlMsg');
    if (!d.subject) { msg.textContent = 'Add a subject first.'; return null; }
    var r = N.edit ? await sb.from('campaigns').update(d).eq('id', N.edit).eq('status', 'draft').select('id').maybeSingle()
      : await sb.from('campaigns').insert(d).select('id').single();
    if (r.error || !r.data) { msg.textContent = 'Could not save: ' + E((r.error && r.error.message) || 'it may have been sent already'); return null; }
    N.edit = r.data.id;
    document.getElementById('nlTitle').textContent = 'Edit draft';
    return r.data.id;
  }
  async function nlCall(id, test) {
    var s = await sb.auth.getSession();
    var tok = s.data && s.data.session && s.data.session.access_token;
    var res = await fetch(CFG.url + '/functions/v1/newsletter', { method: 'POST',
      headers: { Authorization: 'Bearer ' + tok, apikey: CFG.key, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, test: !!test }) });
    var j = {}; try { j = await res.json(); } catch (x) { /* empty */ }
    return res.ok ? j : { error: j.error || 'Something went wrong (' + res.status + ').' };
  }

  // ================================================================ Profit and stock
  var P = { days: 90 };
  TABS.profit = async function () {
    var v = V();
    v.innerHTML = empty('Loading…');
    var r = await Promise.all([
      sb.from('products').select('id,name,price_cents,stock_qty,in_stock,image_url').order('sort_order'),
      sb.from('product_costs').select('*'),
      sb.rpc('profit_report', { p_days: P.days }),
    ]);
    if (r[0].error || r[1].error || r[2].error) { v.innerHTML = empty('Could not load: ' + E((r[1].error || r[2].error || r[0].error).message)); return; }
    var cost = {}; (r[1].data || []).forEach(function (c) { cost[c.product_id] = c; });
    var sold = {}; (r[2].data || []).forEach(function (s) { sold[s.product_id] = s; });
    var rows = (r[0].data || []).map(function (p) {
      var c = cost[p.id] || {}, s = sold[p.id] || { sold: 0, revenue_cents: 0, sold_30: 0 };
      var unit = c.cost_cents != null ? p.price_cents - c.cost_cents : null;
      var rate = (s.sold_30 || 0) / 30;
      var daysLeft = p.stock_qty != null && rate > 0 ? Math.floor(p.stock_qty / rate) : null;
      var reorder = p.stock_qty != null && ((c.reorder_at != null && p.stock_qty <= c.reorder_at) || (daysLeft != null && c.lead_days != null && daysLeft <= c.lead_days) || p.stock_qty <= 0);
      return { p: p, c: c, s: s, unit: unit, margin: unit != null && p.price_cents ? Math.round(unit / p.price_cents * 100) : null,
        profit: unit != null ? unit * s.sold : null, daysLeft: daysLeft, reorder: reorder };
    });
    P.rows = rows;
    var rev = rows.reduce(function (n, x) { return n + Number(x.s.revenue_cents || 0); }, 0);
    var known = rows.filter(function (x) { return x.profit != null; });
    var prof = known.reduce(function (n, x) { return n + x.profit; }, 0);
    var revKnown = known.reduce(function (n, x) { return n + Number(x.s.revenue_cents || 0); }, 0);
    var re = rows.filter(function (x) { return x.reorder; });
    var missing = rows.filter(function (x) { return x.c.cost_cents == null; }).length;
    v.innerHTML = "<div class='gx'><div class='xintro pf-head'><div><h2>Profit and stock</h2><p class='saved'>Add what each piece costs you and who supplies it. The Studio then works out your profit, how fast each piece sells and when to reorder. Only you and the shop owner can see this; costs are never shown on the shop.</p></div>" +
      "<div class='pf-tools'><label>Period <select id='pfDays'>" + [[30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 12 months']].map(function (o) { return "<option value='" + o[0] + "'" + (P.days === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + "</select></label><button type='button' class='btn btn-line' data-pfcsv>Download</button></div></div>" +
      "<div class='crm-stats'>" + st(MS(rev), 'sales (items)') + st(known.length ? MS(prof) : '—', 'profit on pieces with a cost') +
        st(revKnown ? Math.round(prof / revKnown * 100) + '%' : '—', 'average margin') + st(re.length, 'to reorder', re.length ? 'warn' : '') + '</div>' +
      (missing ? "<p class='saved'>" + missing + ' piece' + (missing === 1 ? ' has' : 's have') + ' no cost yet. Type it in the Cost column and it saves by itself.</p>' : '') +
      "<div class='tbl'><table class='pf-tbl'><thead><tr><th>Piece</th><th>Price</th><th>Cost</th><th>Profit each</th><th>Sold</th><th>Profit</th><th>Stock</th><th>Supplier</th><th>Reorder at</th><th>Delivery days</th></tr></thead><tbody>" +
      rows.map(function (x) {
        var c = x.c, id = E(x.p.id);
        return "<tr data-pf='" + id + "'" + (x.reorder ? " class='pf-re'" : '') + '><td><strong>' + E(x.p.name) + '</strong>' + (x.reorder ? "<br><span class='tag pending'>Reorder now</span>" : '') + '</td>' +
          '<td>' + MS(x.p.price_cents) + '</td>' +
          "<td><input class='pf-in' inputmode='decimal' data-f='cost' value='" + (c.cost_cents != null ? (c.cost_cents / 100).toFixed(2) : '') + "' placeholder='£' aria-label='Cost of " + E(x.p.name) + "'></td>" +
          '<td>' + (x.unit != null ? MS(x.unit) + " <small class='muted'>" + x.margin + '%</small>' : '—') + '</td>' +
          '<td>' + x.s.sold + '</td><td>' + (x.profit != null ? MS(x.profit) : '—') + '</td>' +
          '<td>' + (x.p.stock_qty == null ? '<small>not tracked</small>' : x.p.stock_qty + (x.daysLeft != null ? " <small class='muted'>~" + x.daysLeft + ' days</small>' : '')) + '</td>' +
          "<td><input class='pf-in wide' data-f='supplier' maxlength='80' value='" + E(c.supplier || '') + "' placeholder='e.g. Jaipur maker' aria-label='Supplier of " + E(x.p.name) + "'>" +
            "<input class='pf-in wide' data-f='supplier_url' maxlength='300' value='" + E(c.supplier_url || '') + "' placeholder='Link or contact (optional)' aria-label='Supplier link for " + E(x.p.name) + "'></td>" +
          "<td><input class='pf-in' inputmode='numeric' data-f='reorder_at' value='" + (c.reorder_at != null ? c.reorder_at : '') + "' placeholder='e.g. 3' aria-label='Reorder level for " + E(x.p.name) + "'></td>" +
          "<td><input class='pf-in' inputmode='numeric' data-f='lead_days' value='" + (c.lead_days != null ? c.lead_days : '') + "' placeholder='e.g. 21' aria-label='Supplier delivery days for " + E(x.p.name) + "'></td></tr>";
      }).join('') + "</tbody></table></div><p class='saved'>Profit uses today's cost for each piece and the price it sold at, before discounts and delivery. <strong>Reorder now</strong> shows when stock reaches your reorder level, or when it would run out before a new delivery arrives.</p></div>";
  };
  function st(n, label, cls) { return "<div class='crm-stat " + (cls || '') + "'><strong>" + n + '</strong><span>' + label + '</span></div>'; }
  async function pfSave(tr) {
    var id = tr.dataset.pf, get = function (f) { return tr.querySelector("[data-f='" + f + "']").value.trim(); };
    var num = function (s, mul) { if (s === '') return null; var n = parseFloat(s.replace(/[£,\s]/g, '')); return isFinite(n) && n >= 0 ? Math.round(n * (mul || 1)) : undefined; };
    var row = { product_id: id, cost_cents: num(get('cost'), 100), supplier: get('supplier') || null, supplier_url: get('supplier_url') || null,
      reorder_at: num(get('reorder_at')), lead_days: num(get('lead_days')), updated_at: new Date().toISOString() };
    if ([row.cost_cents, row.reorder_at, row.lead_days].indexOf(undefined) >= 0) { tr.classList.add('pf-bad'); return; }
    tr.classList.remove('pf-bad');
    var r = await sb.from('product_costs').upsert(row, { onConflict: 'product_id' });
    if (r.error) { alert('Could not save: ' + r.error.message); return; }
    tr.classList.add('pf-saved'); setTimeout(function () { tr.classList.remove('pf-saved'); }, 900);
  }

  // ================================================================ Dispatch
  var COUNTRY = { 'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB', ireland: 'IE',
    italy: 'IT', italia: 'IT', france: 'FR', germany: 'DE', spain: 'ES', netherlands: 'NL', belgium: 'BE', india: 'IN', 'united states': 'US', usa: 'US', canada: 'CA', australia: 'AU' };
  var D = { orders: [], w: {} };
  TABS.dispatch = async function () {
    var v = V();
    v.innerHTML = empty('Loading…');
    var r = await Promise.all([
      sb.from('orders').select('*').in('status', ['pending', 'confirmed']).order('created_at', { ascending: true }).limit(200),
      sb.from('products').select('id,weight_g'),
      sb.from('site_settings').select('value').eq('key', 'packing_g').maybeSingle(),
    ]);
    if (r[0].error) { v.innerHTML = empty('Could not load orders.'); return; }
    D.orders = r[0].data || [];
    D.w = {}; (r[1].data || []).forEach(function (p) { D.w[p.id] = Number(p.weight_g) || 0; });
    D.pack = parseInt((r[2].data && r[2].data.value) || '40', 10) || 40;
    v.innerHTML = "<div class='gx'><div class='xintro'><h2>Dispatch</h2><p class='saved'>Orders waiting to be posted. Tick the ones you are packing, print a packing slip for each (with the gift message on gifts), and download them for Royal Mail Click &amp; Drop so you do not type addresses by hand.</p></div>" +
      (D.orders.length ? "<div class='dp-actions'><label class='crm-check'><input type='checkbox' id='dpAll' checked><span>Select all</span></label>" +
        "<button type='button' class='btn btn-solid' data-dp='print'>Print packing slips</button><button type='button' class='btn btn-line' data-dp='csv'>Download for Royal Mail</button>" +
        "<button type='button' class='btn btn-line' data-dp='ship'>Mark as shipped</button></div>" +
        "<div class='tbl'><table><thead><tr><th></th><th>Order</th><th>Customer</th><th>Pieces</th><th>Weight</th><th>Status</th></tr></thead><tbody>" + D.orders.map(function (o) {
          var n = (o.items || []).reduce(function (s, i) { return s + (i.qty || 1); }, 0);
          return "<tr><td><input type='checkbox' class='dp-sel' value='" + E(o.id) + "' checked aria-label='Select " + E(o.order_number) + "'></td><td><strong>" + E(o.order_number) + '</strong><br><small>' + day(o.created_at) + '</small>' + (o.is_gift ? " <span class='tag'>gift</span>" : '') + '</td>' +
            '<td>' + E(o.customer_name) + '<br><small>' + E([o.city, o.postal_code].filter(Boolean).join(' ')) + '</small></td><td>' + n + '</td><td>' + weight(o) + ' g</td><td><span class="tag ' + E(o.status) + '">' + E(o.status) + '</span></td></tr>';
        }).join('') + "</tbody></table></div><p class='saved'>In Click &amp; Drop choose <strong>Import orders</strong>, pick the downloaded file, and match the columns once; it remembers them. Weights include " + D.pack + " g for packaging.</p>"
        : empty('Nothing waiting. New and confirmed orders appear here until you mark them as shipped.')) + '</div>';
  };
  function weight(o) { return (o.items || []).reduce(function (s, i) { return s + (D.w[i.id] || 0) * (i.qty || 1); }, 0) + D.pack; }
  function picked() {
    var ids = Array.prototype.slice.call(document.querySelectorAll('.dp-sel:checked')).map(function (x) { return x.value; });
    return D.orders.filter(function (o) { return ids.indexOf(o.id) >= 0; });
  }
  function slips(list) {
    return list.map(function (o) {
      var addr = [o.customer_name, o.address_line1, o.address_line2, o.city, o.postal_code, o.country].filter(Boolean).map(E).join('<br>');
      return "<section class='slip'><header><span class='slip-logo'>Luna Belly</span><span>Order <strong>" + E(o.order_number) + '</strong><br>' + day(o.created_at) + '</span></header>' +
        "<div class='slip-cols'><div><p class='slip-l'>Deliver to</p><p>" + addr + '</p></div><div><p class="slip-l">Pieces</p><table>' +
        (o.items || []).map(function (i) { return '<tr><td>' + E(i.name) + '</td><td>× ' + E(i.qty) + '</td>' + (o.is_gift ? '' : '<td>' + MS(i.price_cents * i.qty) + '</td>') + '</tr>'; }).join('') +
        '</table>' + (o.is_gift ? "<p class='slip-gift'>Gift order: no prices included" + (o.gift_wrap ? ', gift wrapped' : '') + '.</p>' : '<p><strong>Total ' + MS(o.total_cents) + '</strong></p>') + '</div></div>' +
        (o.gift_message ? "<div class='slip-msg'><p class='slip-l'>Gift message (write on the card)</p><p>" + E(o.gift_message).replace(/\n/g, '<br>') + '</p></div>' : '') +
        (o.notes ? "<p class='slip-note'><strong>Customer note:</strong> " + E(o.notes) + '</p>' : '') +
        "<footer>Thank you for shopping with Luna Belly. Need to return something? You have 14 days from delivery; see luna-belly.vercel.app/returns.</footer></section>";
    }).join('');
  }
  function rmCsv(list) {
    var head = ['Order reference', 'Full name', 'Address line 1', 'Address line 2', 'Town', 'Postcode', 'Country code', 'Email', 'Phone', 'Weight (g)', 'Package size', 'Product description', 'Quantity', 'Order value (GBP)', 'Special instructions'];
    return [head.join(',')].concat(list.map(function (o) {
      var qty = (o.items || []).reduce(function (s, i) { return s + (i.qty || 1); }, 0);
      return csvLine([o.order_number, o.customer_name, o.address_line1, o.address_line2, o.city, o.postal_code, COUNTRY[String(o.country || 'United Kingdom').trim().toLowerCase()] || o.country,
        o.customer_email, o.customer_phone, weight(o), 'Large letter', (o.items || []).map(function (i) { return i.name + ' x' + i.qty; }).join('; ').slice(0, 120) || 'Jewellery',
        qty, (o.total_cents / 100).toFixed(2), '']);
    })).join('\r\n');
  }

  // ================================================================ events
  document.addEventListener('input', function (e) {
    if (e.target.closest && e.target.closest('#nlForm')) nlPaint();
  });
  document.addEventListener('change', async function (e) {
    var t = e.target;
    if (t.closest && t.closest('#nlForm')) { nlPaint(); return; }
    if (t.id === 'pfDays') { P.days = +t.value; TABS.profit(); return; }
    if (t.classList && t.classList.contains('pf-in')) { pfSave(t.closest('tr')); return; }
    if (t.id === 'dpAll') { Array.prototype.forEach.call(document.querySelectorAll('.dp-sel'), function (b) { b.checked = t.checked; }); }
  });
  document.addEventListener('submit', async function (e) {
    if (e.target.id !== 'nlForm') return;
    e.preventDefault(); e.stopPropagation();
    var id = await nlSave();
    if (id) { document.getElementById('nlMsg').textContent = 'Draft saved.'; }
  }, true);
  document.addEventListener('click', async function (e) {
    var t = e.target.closest('[data-nl],[data-nledit],[data-nldel],[data-nlcopy],[data-pfcsv],[data-dp]');
    if (!t || !document.querySelector('#view .gx')) return;
    var msg = document.getElementById('nlMsg');
    if (t.dataset.nl === 'test' || t.dataset.nl === 'send') {
      e.preventDefault();
      var count = +((document.getElementById('nlCount') || {}).dataset || {}).n || 0;
      if (t.dataset.nl === 'send' && !confirm('Send "' + nlData().subject + '" to ' + count + ' subscriber' + (count === 1 ? '' : 's') + ' now? This cannot be undone.')) return;
      t.disabled = true; msg.textContent = t.dataset.nl === 'test' ? 'Sending a test…' : 'Sending…';
      var id = await nlSave();
      if (!id) { t.disabled = false; return; }
      var r = await nlCall(id, t.dataset.nl === 'test');
      t.disabled = false;
      if (r.error) { msg.textContent = r.error; return; }
      if (t.dataset.nl === 'test') msg.textContent = 'Test sent to ' + r.to + '. It may take a minute, and can land in Promotions or Spam.';
      else { alert('Sent to ' + r.sent + ' subscriber' + (r.sent === 1 ? '' : 's') + (r.failed ? '. ' + r.failed + ' could not be sent.' : '.')); TABS.news(); }
    } else if (t.dataset.nledit || t.dataset.nlcopy) {
      var c = (N.camps || []).find(function (x) { return x.id === (t.dataset.nledit || t.dataset.nlcopy); });
      if (c) nlLoad(c, !!t.dataset.nlcopy);
    } else if (t.dataset.nldel) {
      if (!confirm('Delete this draft?')) return;
      await sb.from('campaigns').delete().eq('id', t.dataset.nldel).eq('status', 'draft');
      TABS.news();
    } else if (t.hasAttribute('data-pfcsv')) {
      var lines = [csvLine(['Piece', 'Price (£)', 'Cost (£)', 'Profit each (£)', 'Margin %', 'Sold (' + P.days + ' days)', 'Profit (£)', 'Stock', 'Days of stock', 'Supplier', 'Supplier link', 'Reorder at', 'Delivery days', 'Reorder now'])]
        .concat((P.rows || []).map(function (x) {
          return csvLine([x.p.name, (x.p.price_cents / 100).toFixed(2), x.c.cost_cents != null ? (x.c.cost_cents / 100).toFixed(2) : '', x.unit != null ? (x.unit / 100).toFixed(2) : '', x.margin != null ? x.margin : '',
            x.s.sold, x.profit != null ? (x.profit / 100).toFixed(2) : '', x.p.stock_qty != null ? x.p.stock_qty : '', x.daysLeft != null ? x.daysLeft : '', x.c.supplier || '', x.c.supplier_url || '',
            x.c.reorder_at != null ? x.c.reorder_at : '', x.c.lead_days != null ? x.c.lead_days : '', x.reorder ? 'yes' : '']);
        }));
      download('luna-belly-profit-' + stamp() + '.csv', lines.join('\r\n'));
    } else if (t.dataset.dp) {
      var list = picked();
      if (!list.length) { alert('Tick at least one order first.'); return; }
      if (t.dataset.dp === 'print') {
        var pa = document.getElementById('printArea');
        if (!pa) { document.body.insertAdjacentHTML('beforeend', "<div id='printArea' aria-hidden='true'></div>"); pa = document.getElementById('printArea'); }
        pa.innerHTML = slips(list);
        document.body.classList.add('printing-slips');
        window.print();
        setTimeout(function () { document.body.classList.remove('printing-slips'); }, 500);
      } else if (t.dataset.dp === 'csv') {
        download('royal-mail-orders-' + stamp() + '.csv', rmCsv(list));
      } else if (t.dataset.dp === 'ship') {
        if (!confirm('Mark ' + list.length + ' order' + (list.length === 1 ? '' : 's') + ' as shipped? Each customer gets their "on its way" email.')) return;
        t.disabled = true;
        var r = await sb.from('orders').update({ status: 'shipped' }).in('id', list.map(function (o) { return o.id; }));
        t.disabled = false;
        if (r.error) { alert('Could not update: ' + r.error.message); return; }
        TABS.dispatch();
      }
    }
  });
})();
