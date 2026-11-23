'use strict';
/* Studio: the Today panel and the monthly sales goal on the home screen, and "Write with Luna"
   on every product. Loads after studio.js and home.js; reuses their globals (sb, tab, esc, money).
   Numbers come from studio_today() (owner only); descriptions from the luna-write function. */
(function () {
  if (typeof sb === 'undefined') return;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var E = function (s) { return esc(s); };
  var M = function (c) { return money(c || 0).replace(/\.00$/, ''); };
  var CFG = window.LUNA_CONFIG || {};
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var svg = function (d) { return "<svg viewBox='0 0 24 24' aria-hidden='true'>" + d + '</svg>'; };

  // ================================================================ Today panel
  var T = null;
  function card(go, n, label, sub, icon, alert) {
    return "<button type='button' class='td-card" + (n ? (alert ? ' td-alert' : '') : ' td-zero') + "' data-go='" + go + "'>" + svg(icon) +
      '<strong>' + n + '</strong><span>' + label + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</button>';
  }
  function render(home) {
    var d = T, box = $('.today', home);
    if (!box) return;
    var low = d.low_stock || [];
    var cards = "<button type='button' class='td-card td-sales' data-go='orders'>" + svg("<path d='M4 19h16'/><path d='M6 15l4-4 3 3 5-6'/>") +
        '<strong>' + M(d.today_cents) + "</strong><span>sales today</span><small>" + d.today_orders + ' order' + (d.today_orders === 1 ? '' : 's') + ' · yesterday ' + M(d.yesterday_cents) + '</small></button>' +
      card('orders', d.pending, 'new order' + (d.pending === 1 ? '' : 's') + ' to confirm', d.to_post ? d.to_post + ' confirmed, waiting to be posted' : '', "<path d='M4 8l8-4 8 4v8l-8 4-8-4z'/><path d='M4 8l8 4 8-4'/>", true) +
      card('chats', d.chats, 'message' + (d.chats === 1 ? '' : 's') + ' waiting', '', "<path d='M4 5h16v11H9l-5 4z'/>", true) +
      card('returns', d.returns, 'return' + (d.returns === 1 ? '' : 's') + ' to act on', '', "<path d='M9 14 4 9l5-5'/><path d='M4 9h10.5a5.5 5.5 0 0 1 0 11H11'/>", true) +
      card('products', low.length, 'piece' + (low.length === 1 ? '' : 's') + ' low on stock', low.slice(0, 2).map(function (p) { return E(p.name) + ' (' + p.qty + ')'; }).join(', '), "<path d='M6 4h12l3 5-9 11L3 9z'/>", true) +
      card('crm', d.followups, 'follow-up' + (d.followups === 1 ? '' : 's') + ' due', '', "<circle cx='12' cy='13' r='7'/><path d='M12 9v4l2.5 2'/>", true);
    var waiting = d.pending + d.chats + d.returns + d.followups;
    box.innerHTML = "<div class='td-head'><h2>Today</h2><span>" + (waiting ? waiting + ' thing' + (waiting === 1 ? '' : 's') + ' waiting for you' : 'All clear. Nothing waiting for you.') + '</span></div>' +
      "<div class='td-cards'>" + cards + '</div>' + goal();
  }
  function goal() {
    var d = T, now = new Date(), month = MONTHS[now.getMonth()];
    var left = Math.max(0, d.days_in_month - d.day_of_month + 1);
    var vs = d.last_month_same_cents ? Math.round((d.month_cents - d.last_month_same_cents) / d.last_month_same_cents * 100) : null;
    var best = (d.best || []).map(function (b, i) {
      return "<li><span class='td-rank'>" + (i + 1) + '</span><span>' + E(b.name) + '</span><small>' + b.sold + ' sold</small><strong>' + M(b.cents) + '</strong></li>';
    }).join('');
    var head = "<div class='td-goal'><div class='td-ghead'><h3>" + month + ' sales</h3>' +
      "<button type='button' class='link' data-goal-edit>" + (d.goal_cents ? 'Change goal' : 'Set a goal') + '</button></div>';
    var bar = '';
    if (d.goal_cents) {
      var pct = Math.min(100, Math.round(d.month_cents / d.goal_cents * 100));
      var need = Math.max(0, d.goal_cents - d.month_cents);
      var timePct = Math.round((d.day_of_month - 0.5) / d.days_in_month * 100);
      bar = "<p class='td-big'><strong>" + M(d.month_cents) + '</strong> of ' + M(d.goal_cents) + ' <span>' + pct + '%</span></p>' +
        "<div class='td-bar' role='progressbar' aria-valuemin='0' aria-valuemax='100' aria-valuenow='" + pct + "' aria-label='Progress to this month&#39;s goal'><i class='td-fill' data-w='" + pct + "'></i><i class='td-now' data-w='" + timePct + "' title='Where you would be at an even pace'></i></div>" +
        "<p class='td-pace'>" + (need ? 'About <b>' + M(Math.ceil(need / left / 100) * 100) + '</b> a day for the last ' + left + ' day' + (left === 1 ? '' : 's') + ' reaches it.' : '<b>Goal reached.</b> Well done.') +
        (pct >= timePct || !need ? ' You are on track.' : ' A little behind the pace line.') + '</p>';
    } else {
      bar = "<p class='td-big'><strong>" + M(d.month_cents) + '</strong> so far from ' + d.month_orders + ' order' + (d.month_orders === 1 ? '' : 's') + '</p>' +
        "<p class='td-pace'>Set a monthly goal to see a progress bar and the pace you need.</p>";
    }
    var cmp = vs == null ? '' : "<p class='td-cmp'>" + (vs >= 0 ? vs + '% more' : Math.abs(vs) + '% less') + ' than at this point last month.</p>';
    return head + bar + cmp + "<form id='goalForm' class='td-gform' hidden><label>Monthly goal £<input name='goal' inputmode='decimal' value='" + (d.goal_cents ? d.goal_cents / 100 : '') + "' placeholder='e.g. 1500'></label><button class='btn btn-solid'>Save</button><button type='button' class='link' data-goal-cancel>Cancel</button></form>" +
      (best ? "<h4>Best pieces this month</h4><ol class='td-best'>" + best + '</ol>' : "<p class='td-cmp'>Your best pieces this month will show here after the first orders.</p>") + '</div>';
  }
  function widths(root) { $$('[data-w]', root).forEach(function (el) { el.style.width = el.dataset.w + '%'; if (el.classList.contains('td-now')) { el.style.width = ''; el.style.left = el.dataset.w + '%'; } }); }
  async function load(home) {
    if (!home || home.dataset.today) return;
    home.dataset.today = '1';
    var head = $('.shome-head', home);
    if (!head) return;
    head.insertAdjacentHTML('afterend', "<section class='today' aria-label='Today'><div class='sk sk-line'></div><div class='sk sk-block'></div></section>");
    var r = await sb.rpc('studio_today');
    var box = $('.today', home);
    if (r.error || !r.data) { if (box) box.remove(); return; }
    T = r.data;
    render(home); widths(home);
  }
  var view = document.getElementById('view');
  if (view) new MutationObserver(function () { var h = $('.shome'); if (h) load(h); addWriters(); }).observe(view, { childList: true, subtree: true });

  // ================================================================ Write with Luna (Products)
  function addWriters() {
    if (tab !== 'products') return;
    $$('form[data-prod] textarea[name=description]').forEach(function (ta) {
      if (ta.nextElementSibling && ta.nextElementSibling.classList.contains('lw-row')) return;
      ta.insertAdjacentHTML('afterend', "<div class='lw-row'><input class='lw-notes' maxlength='300' placeholder='Notes for Luna (optional), e.g. for brides, sits low on the hips' aria-label='Notes for Luna'>" +
        "<button type='button' class='btn btn-line lw-btn'>" + svg("<path d='M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z'/>") + 'Write with Luna</button>' +
        "<button type='button' class='link lw-undo' hidden>Undo</button><span class='lw-msg' role='status'></span></div>");
    });
  }
  async function write(btn) {
    var f = btn.closest('form[data-prod]'), row = btn.closest('.lw-row'), ta = $('textarea[name=description]', f), msg = $('.lw-msg', row);
    var val = function (n) { var el = f.elements[n]; return el ? String(el.value || '').trim() : ''; };
    if (!val('name')) { msg.textContent = 'Give the piece a name first.'; return; }
    btn.disabled = true; msg.textContent = 'Luna is writing…';
    var p = await sb.from('products').select('tags,handmade').eq('id', f.dataset.prod).maybeSingle();
    var s = await sb.auth.getSession();
    var tok = s.data && s.data.session && s.data.session.access_token;
    var out = {};
    try {
      var res = await fetch(CFG.url + '/functions/v1/luna-write', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, apikey: CFG.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: val('name'), material: val('material'), dimensions: val('dimensions'), tags: ((p.data && p.data.tags) || []).join(', '),
          handmade: !!(p.data && p.data.handmade), notes: $('.lw-notes', row).value, current: ta.value }) });
      out = await res.json().catch(function () { return {}; });
      if (!res.ok && !out.error) out.error = 'Something went wrong (' + res.status + ').';
    } catch (x) { out = { error: 'No connection. Please try again.' }; }
    btn.disabled = false;
    if (out.error || !out.text) { msg.textContent = out.error || 'Luna could not write it just now.'; return; }
    row.dataset.before = ta.value;
    ta.value = out.text;
    ta.rows = Math.max(ta.rows, 5);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    $('.lw-undo', row).hidden = false;
    msg.textContent = 'Written. Read it through, change anything you like, then save the product.';
    ta.focus();
  }

  // ================================================================ events
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-goal-edit],[data-goal-cancel],.lw-btn,.lw-undo');
    if (!t) return;
    if (t.hasAttribute('data-goal-edit')) { var f = $('#goalForm'); f.hidden = false; f.elements.goal.focus(); }
    else if (t.hasAttribute('data-goal-cancel')) $('#goalForm').hidden = true;
    else if (t.classList.contains('lw-btn')) write(t);
    else if (t.classList.contains('lw-undo')) {
      var row = t.closest('.lw-row'), ta = row.previousElementSibling;
      ta.value = row.dataset.before || ''; t.hidden = true; $('.lw-msg', row).textContent = 'Back to what it was.';
    }
  });
  document.addEventListener('submit', async function (e) {
    if (e.target.id !== 'goalForm') return;
    e.preventDefault(); e.stopPropagation();
    var raw = String(e.target.elements.goal.value || '').replace(/[£,\s]/g, '');
    var n = raw === '' ? null : Math.round(parseFloat(raw) * 100);
    if (raw !== '' && (!isFinite(n) || n < 0)) return;
    var r = await sb.from('site_settings').upsert({ key: 'sales_goal_cents', value: n == null ? '' : String(n), updated_at: new Date().toISOString() });
    if (r.error) { alert('Could not save: ' + r.error.message); return; }
    T.goal_cents = n;
    var home = $('.shome'); render(home); widths(home);
  }, true);
})();
