'use strict';
/* Shop search: a search box above the shop filters, and a search button in the header.
   Matches every word typed against each piece's name, description, material, tags and labels.
   Wraps app.js renderGrid (globals: products, filter, renderGrid, paintWish, esc). Address: /?q=pearl#shop */
(function () {
  if (typeof renderGrid !== 'function' || typeof products === 'undefined') return;
  const $ = (s, r) => (r || document).querySelector(s);
  const shop = $('#shop'), filters = $('#shop .filters');
  if (!shop || !filters) return;
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9£ ]+/g, ' ');
  const SYN = { belt: 'kamarbandh', kamarband: 'kamarbandh', kamarbandh: 'kamarbandh', bell: 'bell', bells: 'bell', coin: 'coin', coins: 'coin', wedding: 'bridal', bride: 'bridal', simple: 'minimal', dainty: 'minimal', bold: 'statement', party: 'festive', diwali: 'festive', eid: 'festive', pearls: 'pearl' };
  const hay = (p) => norm([p.name, p.description, p.material, (p.tags || []).join(' '), (p.labels || []).join(' '), p.handmade ? 'handmade hand made' : ''].join(' '));
  const stem = (w) => (w.length > 4 ? w.replace(/(es|s)$/, '') : w);
  function matches(p, q) {
    const h = hay(p), hw = h.split(/\s+/).map(stem);
    return norm(q).split(/\s+/).filter(Boolean).every((w) => {
      const t = stem(SYN[w] || w);
      return h.indexOf(t) >= 0 || hw.some((x) => x.indexOf(t) === 0);
    });
  }

  filters.insertAdjacentHTML('beforebegin',
    "<form id='shopSearch' class='ssearch' role='search' autocomplete='off'>" +
    "<svg viewBox='0 0 24 24' aria-hidden='true'><circle cx='11' cy='11' r='6.5'/><path d='M16 16l4.5 4.5'/></svg>" +
    "<input id='shopQ' type='search' maxlength='60' placeholder='Search pearl, temple, bells…' aria-label='Search the shop'>" +
    "<button type='button' class='ssearch-x' aria-label='Clear search' hidden><svg viewBox='0 0 24 24' aria-hidden='true'><path d='M6 6l12 12M18 6L6 18'/></svg></button></form>");
  const form = $('#shopSearch'), input = $('#shopQ'), clearBtn = $('.ssearch-x', form);
  let q = (location.search.match(/[?&]q=([^&#]*)/) || [])[1];
  q = q ? decodeURIComponent(q.replace(/\+/g, ' ')).slice(0, 60) : '';
  input.value = q;

  const base = renderGrid;
  renderGrid = function () { // eslint-disable-line no-global-assign
    const term = q.trim();
    let bar = $('#searchBar');
    if (!term) { if (bar) bar.remove(); clearBtn.hidden = true; return base.apply(this, arguments); }
    clearBtn.hidden = false;
    const every = products;
    const list = every.filter((p) => matches(p, term));
    products = list; // eslint-disable-line no-global-assign
    try { base.apply(this, arguments); } finally { products = every; } // eslint-disable-line no-global-assign
    if (typeof paintWish === 'function') paintWish();
    const grid = $('#grid');
    if (!grid || !every.length) return;
    if (!bar) { grid.insertAdjacentHTML('beforebegin', "<p id='searchBar' class='ssearch-count' role='status'></p>"); bar = $('#searchBar'); }
    const n = grid.querySelectorAll('.card').length;
    if (!n) {
      grid.innerHTML = "<div class='empty'><p>Nothing matches “" + esc(term) + "”. Try another word, like pearl, temple or bells, or ask us in the chat.</p><button type='button' class='btn btn-line' data-sclear>Clear search</button></div>";
      bar.textContent = '';
    } else bar.innerHTML = n + (n === 1 ? ' piece' : ' pieces') + ' for “<strong>' + esc(term) + '</strong>”';
  };

  function setUrl() {
    try {
      const u = new URL(location.href);
      if (q.trim()) u.searchParams.set('q', q.trim()); else u.searchParams.delete('q');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    } catch (x) { /* ignore */ }
  }
  function allChips() {
    if (typeof filter === 'undefined' || filter === 'all') return;
    filter = 'all'; // eslint-disable-line no-global-assign
    document.querySelectorAll('#shop .chip[data-filter]').forEach((b) => { const on = b.dataset.filter === 'all'; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  }
  let t = null;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { q = input.value; if (q.trim()) allChips(); setUrl(); renderGrid(); }, 160);
  });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); clearTimeout(t); q = input.value; if (q.trim()) allChips(); setUrl(); renderGrid(); input.blur(); });
  const clear = () => { q = ''; input.value = ''; setUrl(); renderGrid(); input.focus(); };
  clearBtn.addEventListener('click', clear);
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && input.value) { ev.preventDefault(); clear(); } });
  document.addEventListener('click', (ev) => { if (ev.target.closest('[data-sclear]')) { ev.preventDefault(); clear(); } });
  if (q.trim() && products.length) renderGrid(); // the shop may have loaded before this script ran

  // Header button: on the home page it jumps to the box; on other pages it goes to the shop and opens it.
  const tools = $('header.top .tools');
  if (tools) {
    tools.insertAdjacentHTML('afterbegin', "<button type='button' class='icon-btn search-btn' aria-label='Search the shop'><svg viewBox='0 0 24 24' aria-hidden='true'><circle cx='11' cy='11' r='6.5'/><path d='M16 16l4.5 4.5'/></svg></button>");
    $('.search-btn', tools).addEventListener('click', () => {
      const home = $('#home');
      if (home && !home.hidden && home.offsetParent !== null) { form.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => input.focus({ preventScroll: true }), 350); }
      else location.href = '/#search';
    });
  }
  if (location.hash === '#search') setTimeout(() => { form.scrollIntoView({ block: 'center' }); input.focus({ preventScroll: true }); }, 400);
})();
