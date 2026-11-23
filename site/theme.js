'use strict';
/* Night mode. Loaded in <head> so the page never flashes light before turning dark.
   A choice made with the moon button is remembered; otherwise it follows the phone or computer setting. */
(function () {
  var root = document.documentElement, mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  var saved = null;
  try { saved = localStorage.getItem('lb_theme'); } catch (e) { /* private mode */ }
  function apply(t) {
    root.setAttribute('data-theme', t);
    var m = document.querySelector("meta[name='theme-color']");
    if (m) m.setAttribute('content', t === 'dark' ? '#170d0c' : '#6e1f2c');
  }
  apply(saved === 'dark' || saved === 'light' ? saved : (mq && mq.matches ? 'dark' : 'light'));
  if (mq && mq.addEventListener) mq.addEventListener('change', function (e) {
    var s = null; try { s = localStorage.getItem('lb_theme'); } catch (x) { /* ignore */ }
    if (s !== 'dark' && s !== 'light') apply(e.matches ? 'dark' : 'light');
  });
  window.lbTheme = function (t) {
    try { localStorage.setItem('lb_theme', t); } catch (e) { /* ignore */ }
    apply(t);
  };
  document.addEventListener('DOMContentLoaded', function () { apply(root.getAttribute('data-theme')); });
})();
