'use strict';
// Unsubscribe links from Luna Belly emails:
//   /unsubscribe?t=<token>  newsletter
//   /unsubscribe?w=<token>  price drop alerts
(function () {
  const out = document.getElementById('unsubMsg');
  const q = new URLSearchParams(location.search);
  const t = (q.get('t') || '').trim(), w = (q.get('w') || '').trim();
  const ok = (s) => /^[0-9a-f-]{36}$/i.test(s);
  if ((!ok(t) && !ok(w)) || !window.supabase || !window.LUNA_CONFIG) {
    out.textContent = 'This unsubscribe link is not complete. Please use the link in the email, or contact us and we will remove you.';
    return;
  }
  const sb = window.supabase.createClient(window.LUNA_CONFIG.url, window.LUNA_CONFIG.key);
  if (ok(w)) {
    document.querySelector('.eyebrow').textContent = 'Price alerts';
    sb.rpc('price_watch_stop', { p_token: w }).then(function (r) {
      out.textContent = r.error ? 'Something went wrong. Please try again, or contact us and we will stop them.'
        : 'Done. You will not get any more price drop alerts from us.';
    });
    return;
  }
  sb.rpc('unsubscribe', { p_token: t }).then(function (r) {
    out.textContent = r.error ? 'Something went wrong. Please try again, or contact us and we will remove you.'
      : r.data ? 'You are unsubscribed. You will not get any more newsletters from us.'
      : 'You are already unsubscribed. You will not get any more newsletters from us.';
  });
})();
