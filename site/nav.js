'use strict';
/* Right-side slide-out menu.
   app.js already owns the hamburger: it toggles .open on #nav and keeps
   aria-expanded in step, and it closes the panel when a link inside is clicked.
   This file does not touch any of that. It only adds the overlay, the X button
   and Escape, and mirrors the panel's open state onto the overlay. */
(function () {
  var nav = document.getElementById('nav');
  if (!nav) return;

  var scrim = document.createElement('div');
  scrim.className = 'navscrim';
  scrim.setAttribute('aria-hidden', 'true');
  document.body.appendChild(scrim);

  var btn = document.querySelector('.menu-btn');

  function close() {
    if (!nav.classList.contains('open')) return;
    nav.classList.remove('open');
    if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
  }

  /* Whoever changes .open — app.js or close() above — the overlay follows. */
  new MutationObserver(function () {
    var open = nav.classList.contains('open');
    scrim.classList.toggle('on', open);
    document.body.classList.toggle('navlocked', open);
    if (open) {
      var x = nav.querySelector('.navx');
      if (x) x.focus();
    }
  }).observe(nav, { attributes: true, attributeFilter: ['class'] });

  scrim.addEventListener('click', close);
  nav.addEventListener('click', function (e) {
    if (e.target.closest('.navx')) { e.preventDefault(); close(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') close();
  });
})();
