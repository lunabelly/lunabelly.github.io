'use strict';
/* Studio: "Top bar messages" card under Settings, and the night mode switch. Loads after studio.js and wraps TABS.settings.
   Saves site_settings.bar_messages (a list of short messages the shop's top bar takes turns showing). */
(function () {
  if (typeof sb === 'undefined' || typeof TABS === 'undefined' || typeof TABS.settings !== 'function') return;
  var DEFAULTS = ['Free delivery on orders over {free}', 'Chosen from jewellery makers in India, Hong Kong and beyond', 'Gift wrapping and a handwritten card for {wrap}', '10% off your first order with the code WELCOME10'];
  var MAX = 5;
  var base = TABS.settings;
  TABS.settings = function () {
    var r = base.apply(this, arguments);
    draw();
    return r;
  };
  function fill(s) {
    var pounds = function (k, d) { var n = parseInt((typeof SET !== 'undefined' && SET[k]) || d, 10); return '£' + (n / 100).toFixed(2).replace(/\.00$/, ''); };
    return esc(s).replace(/\{free\}/gi, pounds('free_shipping_cents', 5000)).replace(/\{wrap\}/gi, pounds('wrap_cents', 350));
  }
  async function draw() {
    var r = await sb.from('site_settings').select('value').eq('key', 'bar_messages').maybeSingle();
    var list = DEFAULTS;
    try { var v = JSON.parse(r.data.value); if (Array.isArray(v) && v.length) list = v; } catch (x) { /* defaults */ }
    var view = document.getElementById('view');
    if (!view || tab !== 'settings' || document.getElementById('barForm')) return;
    var rows = [];
    for (var i = 0; i < MAX; i++) rows.push(list[i] || '');
    view.insertAdjacentHTML('beforeend', "<form id='barForm' class='setf barf'><h2>Top bar messages</h2>" +
      "<p class='saved'>The thin burgundy strip at the very top of the shop takes turns showing these, one every 6 seconds. Keep each one short. Leave a box empty to drop it.</p>" +
      rows.map(function (m, i) { return '<label>Message ' + (i + 1) + "<input name='m' maxlength='90' value='" + esc(m) + "' placeholder='" + (i === 0 ? 'e.g. New festive pieces are in' : 'Optional') + "'></label>"; }).join('') +
      "<p class='saved'>Write <strong>{free}</strong> to show your free-delivery amount and <strong>{wrap}</strong> for the gift-wrap price. They update by themselves when you change them above.</p>" +
      "<div class='bar-prev' aria-label='Preview'></div>" +
      "<div class='barf-actions'><button class='btn btn-solid'>Save messages</button><button type='button' class='btn btn-line' data-bar-reset>Use the original messages</button></div>" +
      "<p id='barMsgSaved' class='saved' role='status'></p></form>");
    preview();
  }
  function values() {
    var f = document.getElementById('barForm');
    return Array.prototype.map.call(f.querySelectorAll('[name=m]'), function (x) { return x.value.trim(); }).filter(Boolean);
  }
  function preview() {
    var p = document.querySelector('#barForm .bar-prev');
    if (!p) return;
    var v = values();
    p.innerHTML = v.length ? v.map(function (m) { return "<span class='bar-pill'>" + fill(m) + '</span>'; }).join('') : "<span class='muted'>No messages: the top bar will keep the original ones.</span>";
  }
  document.addEventListener('input', function (e) { if (e.target.closest && e.target.closest('#barForm')) preview(); });
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('[data-bar-reset]')) return;
    var f = document.getElementById('barForm');
    Array.prototype.forEach.call(f.querySelectorAll('[name=m]'), function (x, i) { x.value = DEFAULTS[i] || ''; });
    preview();
    document.getElementById('barMsgSaved').textContent = 'Press Save messages to keep this.';
  });
  document.addEventListener('submit', async function (e) {
    if (e.target.id !== 'barForm') return;
    e.preventDefault(); e.stopPropagation();
    var v = values(), out = document.getElementById('barMsgSaved');
    if (!v.length) { out.textContent = 'Keep at least one message.'; return; }
    var r = await sb.from('site_settings').upsert({ key: 'bar_messages', value: JSON.stringify(v), updated_at: new Date().toISOString() });
    out.textContent = r.error ? 'Could not save: ' + r.error.message : 'Saved. The shop shows them on the next page load.';
  }, true);
  // Night mode switch next to Sign out (theme.js does the switching; the choice is shared with the shop).
  (function () {
    var out = document.querySelector(".adm .top [data-action='signout']");
    if (!out || !window.lbTheme) return;
    var root = document.documentElement;
    out.insertAdjacentHTML('beforebegin', "<button type='button' class='st-theme'><svg viewBox='0 0 24 24' aria-hidden='true'><path class='i-moon' d='M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'/><g class='i-sun'><circle cx='12' cy='12' r='4'/><path d='M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4'/></g></svg></button>");
    var btn = out.previousElementSibling;
    var paint = function () {
      var dark = root.getAttribute('data-theme') === 'dark';
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', dark ? 'Switch to day mode' : 'Switch to night mode');
      btn.title = dark ? 'Day mode' : 'Night mode';
    };
    paint();
    btn.addEventListener('click', function () { window.lbTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); paint(); });
    new MutationObserver(paint).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  })();
})();
