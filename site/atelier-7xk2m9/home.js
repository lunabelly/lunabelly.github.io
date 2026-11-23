'use strict';
/* Studio home. Loads after studio.js and journal.js and changes neither: the row of tabs
   is hidden by home.css and each tile presses the matching hidden tab button, so every
   section still opens through the code that already runs it. Sign-in and the admin check
   are untouched; this file only decides what is drawn after studio.js lets someone in. */
(function () {
  var viewEl = document.getElementById('view');
  var appEl = document.getElementById('app');
  var where = document.getElementById('where');
  var whereName = document.getElementById('whereName');
  if (!viewEl || !appEl || typeof sb === 'undefined') return;

  var svg = function (d) {
    return "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>" + d + '</svg>';
  };
  var HOME_ICON = svg("<path d='M3 11l9-7 9 7'/><path d='M5 10v10h14V10'/><path d='M10 20v-6h4v6'/>");
  var SECTIONS = [
    ['orders', 'Orders', 'See new orders and mark them confirmed, shipped or delivered.', "<path d='M4 8l8-4 8 4v8l-8 4-8-4z'/><path d='M4 8l8 4 8-4'/><path d='M12 12v8'/>"],
    ['dispatch', 'Dispatch', 'Packing slips, Royal Mail labels and marking orders as posted.', "<path d='M3 7h11v10H3z'/><path d='M14 10h4l3 3v4h-7'/><circle cx='7' cy='18' r='1.6'/><circle cx='17' cy='18' r='1.6'/>"],
    ['returns', 'Returns', 'Return requests from customers: approve, receive and refund.', "<path d='M9 14 4 9l5-5'/><path d='M4 9h10.5a5.5 5.5 0 0 1 0 11H11'/>"],
    ['crm', 'Customers', 'Everyone who has ordered or signed up, with notes, tags and follow-ups.', "<circle cx='9' cy='8' r='3.2'/><path d='M3.5 19c.5-3.4 2.7-5.2 5.5-5.2s5 1.8 5.5 5.2'/><circle cx='17' cy='9' r='2.4'/><path d='M15.8 13.9c2.4-.2 4.2 1.3 4.7 4.1'/>"],
    ['chats', 'Messages', 'Read and answer customer chats.', "<path d='M4 5h16v11H9l-5 4z'/><path d='M8 9h8M8 12h5'/>"],
    ['products', 'Products', 'Add pieces, photos, prices and stock.', "<path d='M6 4h12l3 5-9 11L3 9z'/><path d='M3 9h18'/><path d='M9 4l3 5 3-5'/>"],
    ['profit', 'Profit and stock', 'Costs, suppliers, profit per piece and what to reorder.', "<path d='M4 19h16'/><path d='M6 15l4-4 3 3 5-6'/><path d='M15 8h3v3'/>"],
    ['suppliers', 'Suppliers', 'Your makers, stock you have ordered and what is on the way.', "<path d='M3 7h11v10H3z'/><path d='M14 10h4l3 3v4h-7'/><path d='M6 10h5M6 13h3'/>"],
    ['expenses', 'Expenses', 'What the business spends, real profit and a file for your accountant.', "<rect x='4' y='3' width='16' height='18' rx='1'/><path d='M8 8h8M8 12h8M8 16h4'/>"],
    ['scan', 'Scan and stickers', 'QR stickers for your pieces, scan to pack orders and count stock.', "<path d='M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3'/><rect x='8' y='8' width='8' height='8'/>"],
    ['revs', 'Reviews', 'Approve, hide or remove customer reviews.', "<path d='M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z'/>"],
    ['codes', 'Discounts', 'Create and switch off discount codes.', "<path d='M11 3H4v7l10 10 7-7z'/><circle cx='8' cy='8' r='1.4'/>"],
    ['gifts', 'Gift cards', 'Issue gift cards and check balances.', "<rect x='3' y='8' width='18' height='12'/><path d='M3 12h18M12 8v12'/><path d='M12 8c-1.5-4-6-3.5-4.5-.8C8.3 8.4 12 8 12 8zM12 8c1.5-4 6-3.5 4.5-.8C15.7 8.4 12 8 12 8z'/>"],
    ['loyal', 'Loyalty', 'Customer points and thank-you rewards.', "<path d='M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z'/>"],
    ['colls', 'Collections', 'Group pieces into collections.', "<rect x='4' y='4' width='7' height='7'/><rect x='13' y='4' width='7' height='7'/><rect x='4' y='13' width='7' height='7'/><rect x='13' y='13' width='7' height='7'/>"],
    ['looks', 'Bundles', 'Sell matching pieces together as a look, with a saving.', "<path d='M7 7h10v13H7z'/><path d='M4 4h10v3M17 10h3v10h-3'/><path d='M10 12h4M10 15h4'/>"],
    ['waits', 'Waiting lists', 'Customers waiting for sold-out pieces to come back.', "<circle cx='12' cy='13' r='7'/><path d='M12 9v4l2.5 2M9 3h6'/>"],
    ['journal', 'Journal', 'Write and publish blog articles.', "<path d='M5 4h11l3 3v13H5z'/><path d='M8 9h7M8 12.500h8M8 16h5'/>"],
    ['subs', 'Subscribers', 'People signed up to the newsletter.', "<rect x='3' y='5' width='18' height='14'/><path d='M3 6l9 7 9-7'/>"],
    ['news', 'Newsletter', 'Write and send emails to your subscribers.', "<path d='M4 6h16v12H4z'/><path d='M4 7l8 6 8-6'/><path d='M8 16h3'/>"],
    ['stats', 'Visitors', 'How many people visit, what they look at and where they come from.', "<path d='M4 20V10M10 20V4M16 20v-7M22 20H2'/>"],
    ['health', 'Site health', 'Daily check, errors, emails sent and low-stock alerts.', "<path d='M3 12h4l2-5 4 10 2-5h6'/>"],
    ['settings', 'Settings', 'Shipping, gift wrap, emails and site details.', "<path d='M4 7h10M18 7h2M4 12h3M11 12h9M4 17h8M16 17h4'/><circle cx='16' cy='7' r='2'/><circle cx='9' cy='12' r='2'/><circle cx='14' cy='17' r='2'/>"],
    ['account', 'Account', 'Your studio sign-in and password.', "<circle cx='12' cy='8.5' r='3.5'/><path d='M5 20c.6-4 3.4-6 7-6s6.4 2 7 6'/>"]
  ];
  var NAMES = {};
  SECTIONS.forEach(function (s) { NAMES[s[0]] = s[1]; });

  var atHome = false;
  var nudgeSky = function () { setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 60); };

  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }
  function draw() {
    viewEl.innerHTML = "<div class='shome'><div class='shome-head'><p class='eyebrow'>Luna Belly Studio</p><h1>" + greeting() +
      "</h1><p>Choose a section to open it.</p></div><div class='tiles'>" +
      SECTIONS.map(function (s) {
        return "<button type='button' class='tile' data-go='" + s[0] + "'><span class='tic'>" + svg(s[3]) +
          "</span><span class='tname'>" + s[1] + "</span><span class='tdesc'>" + s[2] + '</span></button>';
      }).join('') + '</div></div>';
    dueBadge();
  }
  // Follow-ups due today or earlier show as a number on the Customers tile.
  function dueBadge() {
    var d = new Date(), t = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    Promise.resolve(sb.from('crm_tasks').select('id', { count: 'exact', head: true }).eq('done', false).lte('due_date', t)).then(function (r) {
      var tile = viewEl.querySelector(".tile[data-go='crm']");
      if (!tile || !r || r.error || !r.count) return;
      tile.insertAdjacentHTML('beforeend', "<span class='tbadge' title='Follow-ups due'>" + r.count + '</span>');
      tile.setAttribute('aria-label', 'Customers, ' + r.count + ' follow-up' + (r.count === 1 ? '' : 's') + ' due');
    }).catch(function () {});
  }
  function home() {
    atHome = true;
    clearInterval(poll); conv = null; tab = 'home';
    document.querySelectorAll('[data-tab],[data-journal]').forEach(function (b) { b.classList.remove('on'); });
    if (where) where.hidden = true;
    document.title = 'Studio';
    draw();
    window.scrollTo(0, 0);
    nudgeSky();
    // A section that was still loading can start its refresh timer after we left it.
    setTimeout(function () { if (atHome) clearInterval(poll); }, 2500);
  }
  function entered(key) {
    atHome = false;
    if (where) where.hidden = false;
    if (whereName) whereName.textContent = NAMES[key] || '';
    document.title = (NAMES[key] ? NAMES[key] + ' · ' : '') + 'Studio';
    window.scrollTo(0, 0);
  }

  // While home is showing, a section that finishes loading late must not replace it.
  new MutationObserver(function () {
    if (atHome && !viewEl.querySelector('.shome')) { clearInterval(poll); draw(); }
    nudgeSky();
  }).observe(viewEl, { childList: true });

  // studio.js opens Orders straight after sign-in; show home instead.
  new MutationObserver(function () { if (!appEl.hidden) home(); })
    .observe(appEl, { attributes: true, attributeFilter: ['hidden'] });

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go],[data-home],[data-tab],[data-journal]');
    if (!t) return;
    if (t.dataset.home !== undefined) { e.preventDefault(); home(); return; }
    if (t.dataset.go) {
      var sel = t.dataset.go === 'journal' ? '[data-journal]' : "[data-tab='" + t.dataset.go + "']";
      var b = document.querySelector('.tabs ' + sel);
      if (b) b.click();
      return;
    }
    entered(t.dataset.tab || 'journal');
  }, true);

  var hb = document.querySelector('.homebtn');
  if (hb) hb.insertAdjacentHTML('afterbegin', HOME_ICON);
  if (!appEl.hidden) home();
})();
