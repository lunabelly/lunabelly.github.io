'use strict';
/* Invoices and receipts. One layout, used by the Studio (invoice for any order) and the shop
   (receipt or order summary for the customer). Seller details come from Studio > Settings >
   Business details; anything left empty is simply left off. */
(function () {
  var e = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); };
  var KEYS = ['business_name', 'business_address', 'business_email', 'company_number', 'vat_number'];
  function money(c, cur) { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur || 'GBP' }).format((c || 0) / 100); }
  function day(d) { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  window.lbDoc = {
    seller: async function (sb) {
      var s = {};
      try { var r = await sb.from('site_settings').select('key,value').in('key', KEYS); (r.data || []).forEach(function (x) { s[x.key] = String(x.value || '').trim(); }); } catch (x) { /* blank */ }
      return s;
    },
    // kind: 'invoice' (Studio) or 'customer' (shop: receipt once paid, order summary before).
    html: function (o, s, kind) {
      var cur = o.currency || 'GBP', m = function (c) { return money(c, cur); };
      var paid = o.payment_status === 'paid';
      var title = kind === 'invoice' ? 'Invoice' : paid ? 'Receipt' : 'Order summary';
      var items = o.items || [];
      var goods = items.reduce(function (n, i) { return n + (i.price_cents || 0) * (i.qty || 1); }, 0);
      var row = function (label, val, cls) { return "<tr class='" + (cls || '') + "'><td colspan='3'>" + label + '</td><td>' + val + '</td></tr>'; };
      var less = function (label, c) { return c ? row(label, '−' + m(c)) : ''; };
      var seller = [s.business_address ? e(s.business_address).replace(/\n/g, '<br>') : '', s.business_email ? e(s.business_email) : '',
        s.company_number ? 'Company no. ' + e(s.company_number) : '', s.vat_number ? 'VAT no. ' + e(s.vat_number) : ''].filter(Boolean).join('<br>');
      var to = [o.customer_name, o.address_line1, o.address_line2, [o.city, o.postal_code].filter(Boolean).join(' '), o.country].filter(Boolean).map(e).join('<br>');
      var vat = s.vat_number ? Math.round(((o.total_cents || 0) + (o.gift_cents || 0)) / 6) : 0;
      return "<article class='doc'><header class='doc-head'><div><p class='doc-logo'>" + e(s.business_name || 'Luna Belly') + '</p>' +
        (seller ? "<p class='doc-small'>" + seller + '</p>' : '') + '</div>' +
        "<div class='doc-meta'><h1>" + title + '</h1><p><b>' + (kind === 'invoice' ? 'Invoice no.' : 'Order') + '</b> ' + e(o.order_number) + '</p><p><b>Date</b> ' + day(o.created_at) + '</p>' +
        '<p><b>Payment</b> ' + (paid ? 'Paid' : 'Not yet paid') + '</p></div></header>' +
        "<section class='doc-to'><p class='doc-l'>" + (kind === 'invoice' ? 'Bill to' : 'Delivered to') + '</p><p>' + to + (o.customer_email ? '<br>' + e(o.customer_email) : '') + '</p></section>' +
        "<table class='doc-table'><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>" +
        items.map(function (i) { return '<tr><td>' + e(i.name) + '</td><td>' + e(i.qty) + '</td><td>' + m(i.price_cents) + '</td><td>' + m((i.price_cents || 0) * (i.qty || 1)) + '</td></tr>'; }).join('') +
        '</tbody><tfoot>' + row('Items', m(goods)) + less('Bundle saving', o.bundle_cents) + less(o.discount_code ? 'Discount (' + e(o.discount_code) + ')' : 'Discount', o.discount_cents) +
        (o.wrap_cents ? row('Gift wrapping', m(o.wrap_cents)) : '') + row('Delivery', o.shipping_cents ? m(o.shipping_cents) : 'Free') +
        less('Paid by gift card', o.gift_cents) + row('<b>Total' + (paid ? ' paid' : ' to pay') + '</b>', '<b>' + m(o.total_cents) + '</b>', 'doc-total') +
        (vat ? row('Includes VAT at 20%', m(vat), 'doc-vat') : '') + '</tfoot></table>' +
        "<footer class='doc-foot'><p>Thank you for shopping with " + e(s.business_name || 'Luna Belly') + '. You have 14 days from delivery to change your mind; see ' + e(location.host) + '/returns.</p></footer></article>';
    },
    print: function (html) {
      var a = document.getElementById('docPrint');
      if (!a) { document.body.insertAdjacentHTML('beforeend', "<div id='docPrint' aria-hidden='true'></div>"); a = document.getElementById('docPrint'); }
      a.innerHTML = html;
      document.body.classList.add('printing-doc');
      var done = function () { document.body.classList.remove('printing-doc'); window.removeEventListener('afterprint', done); };
      window.addEventListener('afterprint', done);
      window.print();
      setTimeout(done, 1500);
    },
  };
})();
