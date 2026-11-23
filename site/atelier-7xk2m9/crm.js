'use strict';
/* Studio: Customers (the CRM). Loads after studio.js and reuses its globals (sb, TABS, esc, empty, when, money).
   One row per customer, built by crm_list() from orders, subscribers, loyalty, accounts, chats and waiting lists.
   Owner-only data: tags + VIP (crm_customers), notes (crm_notes), follow-up tasks (crm_tasks). */
(function () {
  if (typeof sb === 'undefined' || typeof TABS === 'undefined') return;
  var V = function () { return document.getElementById('view'); };
  var E = function (s) { return esc(s); };
  var M = function (c) { return typeof money === 'function' ? money(c || 0) : '£' + ((c || 0) / 100).toFixed(2); };
  var day = function (d) { return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
  var today = function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  var daysAgo = function (d) { return d ? Math.floor((Date.now() - new Date(d).getTime()) / 864e5) : Infinity; };
  var VIP_SPEND = 15000; // £150 lifetime counts as a top customer in the "Top customers" view

  var S = { rows: [], q: '', seg: 'all', tag: '', sort: 'last', open: null };
  var SEGS = [
    ['all', 'Everyone'], ['buyers', 'Have ordered'], ['repeat', 'Ordered 2+ times'], ['vip', 'VIP'],
    ['top', 'Spent £150+'], ['new', 'New this month'], ['lapsed', 'No order in 90 days'],
    ['subs', 'Subscribed, never ordered'], ['tasks', 'Follow-ups to do'],
  ];
  function inSeg(r, seg) {
    switch (seg) {
      case 'buyers': return r.orders > 0;
      case 'repeat': return r.orders >= 2;
      case 'vip': return r.vip;
      case 'top': return r.spent_cents >= VIP_SPEND;
      case 'new': return r.first_order && daysAgo(r.first_order) <= 30;
      case 'lapsed': return r.orders > 0 && daysAgo(r.last_order) > 90;
      case 'subs': return r.subscribed && !r.orders;
      case 'tasks': return r.open_tasks > 0;
      default: return true;
    }
  }
  function filtered() {
    var q = S.q.trim().toLowerCase();
    var list = S.rows.filter(function (r) {
      if (!inSeg(r, S.seg)) return false;
      if (S.tag && (r.tags || []).indexOf(S.tag) < 0) return false;
      if (!q) return true;
      return [r.name, r.email, r.phone, r.city, r.country, (r.tags || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    var by = {
      last: function (a, b) { return (new Date(b.last_order || 0)) - (new Date(a.last_order || 0)) || a.name.localeCompare(b.name); },
      spent: function (a, b) { return b.spent_cents - a.spent_cents; },
      orders: function (a, b) { return b.orders - a.orders || b.spent_cents - a.spent_cents; },
      name: function (a, b) { return a.name.localeCompare(b.name); },
      due: function (a, b) { return (a.next_due || '9999') < (b.next_due || '9999') ? -1 : (a.next_due || '9999') > (b.next_due || '9999') ? 1 : 0; },
    };
    return list.sort(by[S.sort] || by.last);
  }
  var initial = function (n) { return E(String(n || '?').trim().charAt(0).toUpperCase()); };

  // ---------------------------------------------------------------- list
  TABS.crm = async function () {
    S.open = null;
    var v = V();
    v.innerHTML = empty('Loading customers…');
    var r = await Promise.all([sb.rpc('crm_list'), sb.from('crm_tasks').select('id,customer_email,title,due_date,done').eq('done', false).order('due_date', { ascending: true, nullsFirst: false }).limit(50)]);
    if (r[0].error) { v.innerHTML = empty('Could not load customers: ' + E(r[0].error.message)); return; }
    S.rows = (r[0].data || []).map(function (x) { x.orders = x.orders || 0; x.spent_cents = Number(x.spent_cents) || 0; x.tags = x.tags || []; return x; });
    S.tasks = r[1].data || [];
    drawList();
  };
  function drawList() {
    var v = V();
    var rows = S.rows, t = today();
    var buyers = rows.filter(function (r) { return r.orders > 0; });
    var repeat = rows.filter(function (r) { return r.orders >= 2; }).length;
    var revenue = buyers.reduce(function (n, r) { return n + r.spent_cents; }, 0);
    var due = S.tasks.filter(function (x) { return x.due_date && x.due_date <= t; });
    var nameOf = {};
    rows.forEach(function (r) { nameOf[r.email] = r.name; });
    var tags = {};
    rows.forEach(function (r) { (r.tags || []).forEach(function (g) { tags[g] = (tags[g] || 0) + 1; }); });
    var tagList = Object.keys(tags).sort();

    v.innerHTML =
      "<div class='crm'>" +
      "<div class='xintro crm-head'><div><h2>Customers</h2><p class='saved'>Everyone who has ordered, signed up to the newsletter or made an account. Open someone to see their orders and chats, and to add notes, tags and follow-ups. Only you and the shop owner can see this.</p></div>" +
      "<button type='button' class='btn btn-line' data-crmexport>Download list</button></div>" +
      "<div class='crm-stats'>" +
        stat(rows.length, 'customers') + stat(buyers.length, 'have ordered') + stat(repeat, 'ordered 2+ times') +
        stat(buyers.length ? M(Math.round(revenue / buyers.length)) : '—', 'average spent per buyer') +
        stat(due.length, 'follow-ups due', due.length ? 'warn' : '') +
      '</div>' +
      (S.tasks.length ? "<div class='xcard crm-due'><h3>Follow-ups</h3><ul>" + S.tasks.slice(0, 8).map(function (x) {
        var late = x.due_date && x.due_date < t, now = x.due_date === t;
        return "<li><label class='crm-check'><input type='checkbox' data-taskdone='" + E(x.id) + "'><span>" + E(x.title) + '</span></label>' +
          "<button type='button' class='link' data-crmopen='" + E(x.customer_email) + "'>" + E(nameOf[String(x.customer_email).toLowerCase()] || x.customer_email) + '</button>' +
          "<span class='crm-when" + (late ? ' late' : now ? ' now' : '') + "'>" + (x.due_date ? (late ? 'Overdue · ' : now ? 'Today · ' : '') + day(x.due_date) : 'No date') + '</span></li>';
      }).join('') + '</ul>' + (S.tasks.length > 8 ? "<p class='saved'>" + (S.tasks.length - 8) + " more. Choose <strong>Follow-ups to do</strong> below to see them all.</p>" : '') + '</div>' : '') +
      "<div class='crm-tools'><input type='search' id='crmQ' placeholder='Search name, email, phone, town or tag' value='" + E(S.q) + "' aria-label='Search customers'>" +
      "<label class='crm-sort'>Sort <select id='crmSort'>" + [['last', 'Latest order'], ['spent', 'Most spent'], ['orders', 'Most orders'], ['name', 'Name A–Z'], ['due', 'Next follow-up']].map(function (o) {
        return "<option value='" + o[0] + "'" + (S.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></label></div>' +
      "<div class='crm-segs'>" + SEGS.map(function (s) {
        var n = rows.filter(function (r) { return inSeg(r, s[0]); }).length;
        return "<button type='button' class='chip" + (S.seg === s[0] ? ' on' : '') + "' data-crmseg='" + s[0] + "'>" + s[1] + ' <small>' + n + '</small></button>';
      }).join('') + '</div>' +
      (tagList.length ? "<div class='crm-segs crm-tags'><span>Tags</span>" + tagList.map(function (g) {
        return "<button type='button' class='tagchip" + (S.tag === g ? ' on' : '') + "' data-crmtag='" + E(g) + "'>" + E(g) + ' <small>' + tags[g] + '</small></button>';
      }).join('') + '</div>' : '') +
      "<div id='crmList'></div></div>";
    drawRows();
  }
  function stat(n, label, cls) { return "<div class='crm-stat " + (cls || '') + "'><strong>" + n + '</strong><span>' + label + '</span></div>'; }
  function drawRows() {
    var el = document.getElementById('crmList');
    if (!el) return;
    var list = filtered(), t = today();
    if (!list.length) { el.innerHTML = empty(S.rows.length ? 'Nobody matches. Try another search or view.' : 'No customers yet. They appear here after their first order or newsletter sign-up.'); return; }
    el.innerHTML = "<p class='saved crm-count'>" + list.length + (list.length === 1 ? ' customer' : ' customers') + '</p>' +
      "<div class='tbl'><table class='crm-tbl'><thead><tr><th>Customer</th><th>Orders</th><th>Spent</th><th>Last order</th><th>Tags</th><th>Follow-up</th></tr></thead><tbody>" +
      list.map(function (r) {
        return "<tr data-crmopen='" + E(r.email) + "' tabindex='0'><td><div class='crm-who'><span class='crm-av" + (r.vip ? ' vip' : '') + "'>" + initial(r.name) + '</span><span><strong>' + E(r.name) + (r.vip ? " <span class='crm-vip'>VIP</span>" : '') + '</strong><small>' + E(r.email) + '</small>' +
          "<span class='crm-marks'>" + (r.subscribed ? "<span title='Gets the newsletter'>Newsletter</span>" : '') + (r.account ? "<span title='Has a customer account'>Account</span>" : '') + (r.chats ? '<span>' + r.chats + (r.chats === 1 ? ' chat' : ' chats') + '</span>' : '') + (r.waiting ? '<span>Waiting for ' + r.waiting + '</span>' : '') + '</span></span></div></td>' +
          '<td>' + (r.orders || '—') + '</td><td>' + (r.spent_cents ? M(r.spent_cents) : '—') + '</td><td>' + (r.last_order ? day(r.last_order) : '—') + '</td>' +
          "<td>" + (r.tags || []).map(function (g) { return "<span class='tagchip sm'>" + E(g) + '</span>'; }).join(' ') + '</td>' +
          '<td>' + (r.open_tasks ? "<span class='crm-when" + (r.next_due && r.next_due < t ? ' late' : r.next_due === t ? ' now' : '') + "'>" + (r.next_due ? day(r.next_due) : 'To do') + (r.open_tasks > 1 ? ' +' + (r.open_tasks - 1) : '') + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ---------------------------------------------------------------- one customer
  async function openCustomer(email) {
    email = String(email || '').toLowerCase();
    S.open = email;
    var v = V();
    v.innerHTML = empty('Loading…');
    window.scrollTo(0, 0);
    if (!S.rows.length) { var l = await sb.rpc('crm_list'); S.rows = (l.data || []).map(function (x) { x.spent_cents = Number(x.spent_cents) || 0; x.tags = x.tags || []; return x; }); }
    var r = S.rows.find(function (x) { return x.email === email; }) || { email: email, name: email.split('@')[0], orders: 0, spent_cents: 0, tags: [], vip: false };
    var p = await sb.rpc('crm_profile', { p_email: email });
    if (p.error || S.open !== email) { if (!p.error) return; v.innerHTML = empty('Could not load this customer.'); return; }
    var d = p.data || {};
    var t = today();
    var avg = r.orders ? Math.round(r.spent_cents / r.orders) : 0;
    var place = [r.city, r.country].filter(Boolean).join(', ');
    v.innerHTML =
      "<div class='crm crm-one'>" +
      "<button type='button' class='link crm-back' data-crmback>← All customers</button>" +
      "<div class='crm-hero'><span class='crm-av lg" + (r.vip ? ' vip' : '') + "'>" + initial(r.name) + '</span><div><h2>' + E(r.name) + '</h2>' +
        "<p class='crm-contact'><a href='mailto:" + E(r.email) + "'>" + E(r.email) + '</a>' + (r.phone ? " · <a href='tel:" + E(String(r.phone).replace(/\s+/g, '')) + "'>" + E(r.phone) + '</a>' : '') + (place ? ' · ' + E(place) : '') + '</p>' +
        "<p class='crm-marks'>" + (d.subscribed ? '<span>Newsletter since ' + day(d.subscribed) + '</span>' : '<span class="off">Not on the newsletter</span>') +
          (d.account ? '<span>Account since ' + day(d.account) + '</span>' : '') + (r.points ? '<span>' + r.points + ' loyalty points' + (r.tier ? ' · ' + E(r.tier) : '') + '</span>' : '') + '</p></div>' +
        "<label class='crm-vipbtn'><input type='checkbox' id='crmVip'" + (r.vip ? ' checked' : '') + '> VIP</label></div>' +
      "<div class='crm-stats'>" + stat(r.orders || 0, (r.orders === 1 ? 'order' : 'orders')) + stat(r.spent_cents ? M(r.spent_cents) : '£0', 'spent in total') +
        stat(avg ? M(avg) : '—', 'average order') + stat(r.last_order ? day(r.last_order) : '—', 'last order') + stat(r.first_order ? day(r.first_order) : '—', 'first order') + '</div>' +
      "<div class='crm-cols'><div>" +
        // tags
        "<section class='xcard'><h3>Tags</h3><div class='crm-tagedit'>" + (r.tags || []).map(function (g) {
          return "<span class='tagchip'>" + E(g) + "<button type='button' data-tagdel='" + E(g) + "' aria-label='Remove tag " + E(g) + "'>×</button></span>";
        }).join('') + "<form id='crmTagForm' class='crm-inline'><input name='tag' maxlength='30' placeholder='Add a tag, e.g. bride 2027' list='crmTagList' autocomplete='off'><datalist id='crmTagList'>" + allTags().map(function (g) { return "<option value='" + E(g) + "'>"; }).join('') + "</datalist><button class='btn btn-line'>Add</button></form></div></section>" +
        // tasks
        "<section class='xcard'><h3>Follow-ups</h3>" + ((d.tasks || []).length ? "<ul class='crm-tasks'>" + d.tasks.map(function (x) {
          var late = !x.done && x.due && x.due < t, now = !x.done && x.due === t;
          return "<li class='" + (x.done ? 'done' : '') + "'><label class='crm-check'><input type='checkbox' data-taskdone='" + E(x.id) + "'" + (x.done ? ' checked' : '') + '><span>' + E(x.title) + '</span></label>' +
            "<span class='crm-when" + (late ? ' late' : now ? ' now' : '') + "'>" + (x.due ? (late ? 'Overdue · ' : now ? 'Today · ' : '') + day(x.due) : 'No date') + '</span>' +
            "<button type='button' class='link' data-taskdel='" + E(x.id) + "'>Delete</button></li>";
        }).join('') + '</ul>' : "<p class='saved'>Nothing to do for this customer.</p>") +
        "<form id='crmTaskForm' class='crm-inline'><input name='title' required maxlength='140' placeholder='e.g. Send a thank-you with 10% off'><input name='due' type='date' value='" + t + "' aria-label='Due date'><button class='btn btn-line'>Add</button></form>" +
        "<p class='saved'>Due follow-ups show at the top of Customers and in the morning email.</p></section>" +
        // notes
        "<section class='xcard'><h3>Notes</h3><form id='crmNoteForm'><textarea name='body' rows='3' maxlength='2000' required placeholder='Anything worth remembering: sizes, preferences, what they asked for…'></textarea><button class='btn btn-solid'>Save note</button></form>" +
        ((d.notes || []).length ? "<ul class='crm-notes'>" + d.notes.map(function (n) {
          return '<li><p>' + E(n.body).replace(/\n/g, '<br>') + "</p><small>" + when(n.at) + " · <button type='button' class='link' data-notedel='" + E(n.id) + "'>Delete</button></small></li>";
        }).join('') + '</ul>' : '') + '</section>' +
      '</div><div>' +
        // orders
        "<section class='xcard'><h3>Orders</h3>" + ((d.orders || []).length ? "<ul class='crm-orders'>" + d.orders.map(function (o) {
          return "<li><div><span class='crm-line'><strong>" + E(o.number) + '</strong><span class="crm-st st-' + E(o.status) + '">' + E(o.status) + '</span>' + (o.gift ? '<span class="crm-st">gift</span>' : '') + '</span><small>' + when(o.at) + (o.tracking ? ' · tracking ' + E(o.tracking) : '') + '</small>' +
            '<small>' + (o.items || []).map(function (i) { return E(i.name) + ' × ' + E(i.qty); }).join(', ') + '</small></div><strong>' + M(o.total) + '</strong></li>';
        }).join('') + "</ul><button type='button' class='link' data-crmgo='orders'>Manage orders →</button>" : "<p class='saved'>No orders yet.</p>") + '</section>' +
        // chats
        ((d.chats || []).length ? "<section class='xcard'><h3>Chats</h3><ul class='crm-orders'>" + d.chats.map(function (c) {
          return "<li><div><small>" + when(c.last || c.at) + (c.status === 'closed' ? ' · resolved' : '') + '</small><span>' + E(c.preview || '') + "</span></div><button type='button' class='link' data-crmchat='" + E(c.id) + "'>Open</button></li>";
        }).join('') + '</ul></section>' : '') +
        ((d.waiting || []).length ? "<section class='xcard'><h3>Waiting lists</h3><ul class='crm-orders'>" + d.waiting.map(function (w) {
          return '<li><div><span>' + E(w.product) + '</span><small>Signed up ' + day(w.at) + (w.notified ? ' · emailed ' + day(w.notified) : ' · still waiting') + '</small></div></li>';
        }).join('') + '</ul></section>' : '') +
        ((d.giftcards || []).length ? "<section class='xcard'><h3>Gift cards received</h3><ul class='crm-orders'>" + d.giftcards.map(function (g) {
          return '<li><div><span>' + E(g.code) + '</span><small>' + M(g.balance) + ' left of ' + M(g.initial) + (g.active ? '' : ' · switched off') + '</small></div></li>';
        }).join('') + '</ul></section>' : '') +
        ((d.addresses || []).length ? "<section class='xcard'><h3>Saved addresses</h3><ul class='crm-orders'>" + d.addresses.map(function (a) {
          return '<li><div><span>' + E(a.label || 'Address') + (a['default'] ? ' · default' : '') + '</span><small>' + E(a.line) + (a.phone ? ' · ' + E(a.phone) : '') + '</small></div></li>';
        }).join('') + '</ul></section>' : '') +
      '</div></div></div>';
  }
  function allTags() {
    var s = {};
    S.rows.forEach(function (r) { (r.tags || []).forEach(function (g) { s[g] = 1; }); });
    ['VIP list', 'bride', 'wholesale', 'repeat', 'gift buyer'].forEach(function (g) { s[g] = s[g] || 1; });
    return Object.keys(s).sort();
  }
  async function saveCustomer(email, patch) {
    var r = S.rows.find(function (x) { return x.email === email; }) || {};
    var row = { email: email, tags: patch.tags != null ? patch.tags : (r.tags || []), vip: patch.vip != null ? patch.vip : !!r.vip, updated_at: new Date().toISOString() };
    var res = await sb.from('crm_customers').upsert(row, { onConflict: 'email' });
    if (res.error) { alert('Could not save: ' + res.error.message); return false; }
    r.tags = row.tags; r.vip = row.vip;
    return true;
  }
  async function refreshRow(email) {
    var l = await sb.rpc('crm_list');
    if (!l.error) S.rows = (l.data || []).map(function (x) { x.spent_cents = Number(x.spent_cents) || 0; x.tags = x.tags || []; return x; });
    return openCustomer(email);
  }

  // ---------------------------------------------------------------- CSV export
  function csv() {
    var cell = function (v) { v = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = ['Name', 'Email', 'Phone', 'Town', 'Country', 'Orders', 'Spent (£)', 'First order', 'Last order', 'Newsletter', 'Account', 'VIP', 'Tags', 'Open follow-ups', 'Next follow-up'];
    var lines = [head.join(',')].concat(filtered().map(function (r) {
      return [r.name, r.email, r.phone, r.city, r.country, r.orders, (r.spent_cents / 100).toFixed(2), r.first_order ? r.first_order.slice(0, 10) : '', r.last_order ? r.last_order.slice(0, 10) : '',
        r.subscribed ? 'yes' : 'no', r.account ? 'yes' : 'no', r.vip ? 'yes' : 'no', (r.tags || []).join('; '), r.open_tasks || 0, r.next_due || ''].map(cell).join(',');
    }));
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'luna-belly-customers-' + today() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', async function (e) {
    if (!document.querySelector('#view .crm')) return;
    var t = e.target.closest('[data-crmopen],[data-crmback],[data-crmseg],[data-crmtag],[data-crmexport],[data-tagdel],[data-taskdel],[data-notedel],[data-crmchat],[data-crmgo]');
    if (!t || e.target.closest('input[type=checkbox]')) return;
    var d = t.dataset;
    if (d.crmopen) { e.preventDefault(); openCustomer(d.crmopen); }
    else if (t.hasAttribute('data-crmback')) TABS.crm();
    else if (d.crmseg) { S.seg = d.crmseg; drawList(); }
    else if (d.crmtag !== undefined) { S.tag = S.tag === d.crmtag ? '' : d.crmtag; drawList(); }
    else if (t.hasAttribute('data-crmexport')) csv();
    else if (d.tagdel) {
      var r = S.rows.find(function (x) { return x.email === S.open; }) || { tags: [] };
      if (await saveCustomer(S.open, { tags: (r.tags || []).filter(function (g) { return g !== d.tagdel; }) })) openCustomer(S.open);
    } else if (d.taskdel) {
      if (!confirm('Delete this follow-up?')) return;
      await sb.from('crm_tasks').delete().eq('id', d.taskdel);
      refreshRow(S.open);
    } else if (d.notedel) {
      if (!confirm('Delete this note?')) return;
      await sb.from('crm_notes').delete().eq('id', d.notedel);
      refreshRow(S.open);
    } else if (d.crmchat) {
      var btn = document.querySelector("[data-tab='chats']");
      if (btn) btn.click();
      setTimeout(function () { var c = document.querySelector("[data-conv='" + d.crmchat + "']"); if (c) c.click(); }, 700);
    } else if (d.crmgo) { var b = document.querySelector("[data-tab='" + d.crmgo + "']"); if (b) b.click(); }
  });
  document.addEventListener('keydown', function (e) {
    var row = e.target.closest && e.target.closest('tr[data-crmopen]');
    if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCustomer(row.dataset.crmopen); }
  });
  document.addEventListener('change', async function (e) {
    var el = e.target;
    if (el.id === 'crmSort') { S.sort = el.value; drawRows(); return; }
    if (el.id === 'crmVip') { if (!(await saveCustomer(S.open, { vip: el.checked }))) el.checked = !el.checked; else openCustomer(S.open); return; }
    if (el.dataset && el.dataset.taskdone) {
      var r = await sb.from('crm_tasks').update({ done: el.checked }).eq('id', el.dataset.taskdone);
      if (r.error) { el.checked = !el.checked; alert('Could not save.'); return; }
      if (S.open) refreshRow(S.open); else TABS.crm();
    }
  });
  var qT = null;
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'crmQ') return;
    clearTimeout(qT);
    qT = setTimeout(function () { S.q = e.target.value; drawRows(); }, 150);
  });
  document.addEventListener('submit', async function (e) {
    var f = e.target;
    if (['crmTagForm', 'crmTaskForm', 'crmNoteForm'].indexOf(f.id) < 0) return;
    e.preventDefault();
    e.stopPropagation();
    var email = S.open;
    if (!email) return;
    var btn = f.querySelector('button'); if (btn) btn.disabled = true;
    try {
      if (f.id === 'crmTagForm') {
        var g = f.elements.tag.value.trim().replace(/\s+/g, ' ').slice(0, 30);
        if (!g) return;
        var r = S.rows.find(function (x) { return x.email === email; }) || { tags: [] };
        var tags = (r.tags || []).slice();
        if (tags.map(function (x) { return x.toLowerCase(); }).indexOf(g.toLowerCase()) < 0) tags.push(g);
        if (await saveCustomer(email, { tags: tags })) openCustomer(email);
      } else if (f.id === 'crmTaskForm') {
        var res = await sb.from('crm_tasks').insert({ customer_email: email, title: f.elements.title.value.trim(), due_date: f.elements.due.value || null });
        if (res.error) { alert('Could not save: ' + res.error.message); return; }
        refreshRow(email);
      } else {
        var res2 = await sb.from('crm_notes').insert({ customer_email: email, body: f.elements.body.value.trim() });
        if (res2.error) { alert('Could not save: ' + res2.error.message); return; }
        refreshRow(email);
      }
    } finally { if (btn) btn.disabled = false; }
  }, true);

  // Let other Studio screens open a customer: window.openCustomer('someone@example.com')
  window.openCustomer = function (email) {
    var b = document.querySelector("[data-tab='crm']");
    if (b) b.click();
    setTimeout(function () { openCustomer(email); }, 200);
  };
})();
