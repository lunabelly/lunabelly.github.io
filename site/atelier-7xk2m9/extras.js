'use strict';
/* Studio extras. Loads after studio.js / insights.js and reuses their globals (sb, TABS, tab, esc, empty, when).
   - Bundles: build "Complete the look" sets with a saving (applied in the cart and at checkout).
   - Waiting lists: customers waiting for sold-out pieces; they are emailed automatically when it is back.
   - Products: a short video per piece.
   - Reviews: customer photos and the Verified purchase label. */
(function () {
  if (typeof sb === 'undefined' || typeof TABS === 'undefined') return;
  var $v = function () { return document.getElementById('view'); };
  var E = function (s) { return esc(s); };
  var money = function (c) { return '£' + (c / 100).toFixed(2).replace(/\.00$/, ''); };

  // ---------------------------------------------------------------- Bundles
  TABS.looks = async function () {
    var v = $v();
    v.innerHTML = empty('Loading…');
    var r = await Promise.all([
      sb.from('looks').select('*').order('sort_order').order('created_at'),
      sb.from('products').select('id,name,image_url,price_cents,in_stock').order('sort_order'),
    ]);
    if (r[0].error || r[1].error) { v.innerHTML = empty('Could not load bundles.'); return; }
    var looks = r[0].data || [], prods = r[1].data || [];
    var byId = {};
    prods.forEach(function (p) { byId[p.id] = p; });
    v.innerHTML =
      "<div class='xintro'><h2>Bundles</h2><p class='saved'>A bundle is 2 to 4 pieces that look good together. On each piece's page customers see <strong>Complete the look</strong> with the set price, and when every piece of the bundle is in their cart the saving is taken off automatically, in the cart and at checkout. A piece can belong to one bundle at a time.</p></div>" +
      "<form id='lookForm' class='xcard'><h3>New bundle</h3><div class='rowf'><label>Name<input name='name' required maxlength='80' placeholder='For example: The bridal set'></label>" +
      "<label>Saving (%)<input name='percent' type='number' min='5' max='40' step='1' value='10' required></label></div>" +
      "<fieldset class='xpick'><legend>Choose 2 to 4 pieces</legend>" + prods.map(function (p) {
        return "<label class='xpiece'><input type='checkbox' name='p' value='" + E(p.id) + "'><span class='xthumb'>" + (p.image_url ? "<img src='" + E(p.image_url) + "' alt=''>" : '') + "</span><span>" + E(p.name) + '<small>' + money(p.price_cents) + (p.in_stock ? '' : ' · sold out') + '</small></span></label>';
      }).join('') + "</fieldset><button class='btn btn-solid'>Create bundle</button><p id='lookMsg' class='saved' role='status'></p></form>" +
      (looks.length ? "<div class='xlist'>" + looks.map(function (l) {
        var pieces = (l.product_ids || []).map(function (id) { return byId[id]; }).filter(Boolean);
        var full = pieces.reduce(function (n, p) { return n + p.price_cents; }, 0);
        return "<div class='xcard xrow" + (l.active ? '' : ' off') + "'><div class='xpics'>" + pieces.map(function (p) { return "<span class='xthumb'>" + (p.image_url ? "<img src='" + E(p.image_url) + "' alt=''>" : '') + '</span>'; }).join('') + '</div>' +
          "<div class='xinfo'><strong>" + E(l.name) + '</strong><small>' + pieces.map(function (p) { return E(p.name); }).join(' + ') + '</small><small>' + l.percent + '% off: ' + money(full) + ' → ' + money(full - Math.floor(full * l.percent / 100)) + (l.active ? '' : ' · switched off') + '</small></div>' +
          "<div class='stackf'><button class='link' data-looktoggle='" + E(l.id) + "' data-on='" + (l.active ? '1' : '') + "'>" + (l.active ? 'Switch off' : 'Switch on') + "</button><button class='link' data-lookdel='" + E(l.id) + "'>Delete</button></div></div>";
      }).join('') + '</div>' : empty('No bundles yet. Create the first one above.'));
  };
  document.addEventListener('submit', async function (e) {
    if (e.target.id !== 'lookForm') return;
    e.preventDefault();
    e.stopPropagation();
    var f = e.target, msg = document.getElementById('lookMsg');
    var ids = Array.prototype.map.call(f.querySelectorAll("input[name='p']:checked"), function (c) { return c.value; });
    if (ids.length < 2 || ids.length > 4) { msg.textContent = 'Choose between 2 and 4 pieces.'; return; }
    var taken = await sb.from('looks').select('name,product_ids').eq('active', true);
    var clash = (taken.data || []).find(function (l) { return (l.product_ids || []).some(function (id) { return ids.indexOf(id) >= 0; }); });
    if (clash) { msg.textContent = 'One of these pieces is already in the bundle "' + clash.name + '". Switch that one off first.'; return; }
    var pct = Math.round(Number(f.elements.percent.value));
    msg.textContent = 'Saving…';
    var r = await sb.from('looks').insert({ name: f.elements.name.value.trim(), product_ids: ids, percent: pct });
    if (r.error) { msg.textContent = 'Could not save: ' + r.error.message; return; }
    TABS.looks();
  }, true);
  document.addEventListener('click', async function (e) {
    var t = e.target.closest('[data-looktoggle],[data-lookdel]');
    if (!t) return;
    if (t.dataset.lookdel) {
      if (!window.confirm('Delete this bundle? The pieces themselves are not affected.')) return;
      await sb.from('looks').delete().eq('id', t.dataset.lookdel);
    } else {
      await sb.from('looks').update({ active: !t.dataset.on }).eq('id', t.dataset.looktoggle);
    }
    TABS.looks();
  });

  // ---------------------------------------------------------------- Waiting lists
  TABS.waits = async function () {
    var v = $v();
    v.innerHTML = empty('Loading…');
    var r = await Promise.all([
      sb.from('stock_alerts').select('product_id,email,created_at,notified_at').order('created_at', { ascending: false }).limit(1000),
      sb.from('products').select('id,name,in_stock,image_url'),
    ]);
    if (r[0].error || r[1].error) { v.innerHTML = empty('Could not load waiting lists.'); return; }
    var byId = {};
    (r[1].data || []).forEach(function (p) { byId[p.id] = p; });
    var groups = {};
    (r[0].data || []).forEach(function (a) {
      var g = groups[a.product_id] || (groups[a.product_id] = { waiting: [], told: 0 });
      if (a.notified_at) g.told++; else g.waiting.push(a);
    });
    var ids = Object.keys(groups).sort(function (a, b) { return groups[b].waiting.length - groups[a].waiting.length; });
    v.innerHTML = "<div class='xintro'><h2>Waiting lists</h2><p class='saved'>When a piece is sold out, customers can leave their email on its page. As soon as you mark it <strong>in stock</strong> again in Products, everyone waiting gets one email automatically. Nobody is emailed twice.</p></div>" +
      (ids.length ? "<div class='xlist'>" + ids.map(function (id) {
        var g = groups[id], p = byId[id] || { name: 'A deleted piece' };
        return "<div class='xcard xrow'><div class='xpics'><span class='xthumb'>" + (p.image_url ? "<img src='" + E(p.image_url) + "' alt=''>" : '') + '</span></div>' +
          "<div class='xinfo'><strong>" + E(p.name) + '</strong><small>' + (p.in_stock ? 'In stock' : 'Sold out') + ' · ' + g.waiting.length + ' waiting' + (g.told ? ' · ' + g.told + ' already told' : '') + '</small>' +
          (g.waiting.length ? "<details><summary>Show emails</summary><small>" + g.waiting.map(function (a) { return E(a.email) + ' (' + when(a.created_at) + ')'; }).join('<br>') + '</small></details>' : '') + '</div></div>';
      }).join('') + '</div>' : empty('Nobody is waiting for a piece at the moment.'));
  };

  // ---------------------------------------------------------------- Products: video
  var vidBusy = false;
  new MutationObserver(async function () {
    if (tab !== 'products' || vidBusy) return;
    var forms = Array.prototype.filter.call(document.querySelectorAll('form[data-prod]'), function (f) { return !f.querySelector('.xvideo'); });
    if (!forms.length) return;
    vidBusy = true;
    var r = await sb.from('products').select('id,video_url');
    vidBusy = false;
    var vids = {};
    (r.data || []).forEach(function (p) { vids[p.id] = p.video_url; });
    forms.forEach(function (f) {
      if (f.querySelector('.xvideo')) return;
      var id = f.dataset.prod, cur = vids[id];
      var html = "<div class='xvideo' data-vid='" + E(id) + "'><span class='xvlabel'>Video</span>" +
        (cur ? "<a href='" + E(cur) + "' target='_blank' rel='noopener'>Watch</a> <button type='button' class='link' data-vidrm='" + E(id) + "'>Remove</button>" : "<span class='saved'>None yet</span>") +
        "<label class='link xvup'>" + (cur ? 'Replace' : 'Add a short video') + "<input type='file' accept='video/mp4,video/webm,video/quicktime' data-vidup='" + E(id) + "' hidden></label><span class='saved xvmsg' role='status'></span>" +
        "<small class='saved'>A few seconds of the piece moving, MP4, under 20 MB. Shown as \"Watch it move\" on the product page.</small></div>";
      var anchor = f.querySelector('.hmmsg') || f.querySelector('.rowf');
      if (anchor) anchor.insertAdjacentHTML('afterend', html); else f.insertAdjacentHTML('beforeend', html);
    });
  }).observe(document.getElementById('view'), { childList: true, subtree: true });
  document.addEventListener('change', async function (e) {
    var inp = e.target;
    if (!inp.matches || !inp.matches('[data-vidup]')) return;
    var file = inp.files && inp.files[0], id = inp.dataset.vidup;
    var box = inp.closest('.xvideo'), msg = box.querySelector('.xvmsg');
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { msg.textContent = 'That file is over 20 MB. Please use a shorter clip.'; return; }
    msg.textContent = 'Uploading…';
    var ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    var path = id + '-video-' + Date.now() + '.' + ext;
    var u = await sb.storage.from('products').upload(path, file, { contentType: file.type || 'video/mp4', cacheControl: '31536000' });
    if (u.error) { msg.textContent = 'Upload failed: ' + u.error.message; return; }
    var url = sb.storage.from('products').getPublicUrl(path).data.publicUrl;
    var r = await sb.from('products').update({ video_url: url }).eq('id', id);
    msg.textContent = r.error ? 'Could not save.' : 'Saved. The video now shows on the product page.';
    if (!r.error) box.querySelector('.xvlabel').insertAdjacentHTML('afterend', " <a href='" + E(url) + "' target='_blank' rel='noopener'>Watch</a>");
  });
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-vidrm]');
    if (!b) return;
    if (!window.confirm('Remove the video from this piece?')) return;
    var r = await sb.from('products').update({ video_url: null }).eq('id', b.dataset.vidrm);
    var box = b.closest('.xvideo');
    box.querySelector('.xvmsg').textContent = r.error ? 'Could not remove.' : 'Removed.';
    if (!r.error) { var a = box.querySelector('a'); if (a) a.remove(); b.remove(); }
  });

  // ---------------------------------------------------------------- Reviews: photos and verified
  var revBusy = false;
  new MutationObserver(async function () {
    if (tab !== 'revs' || revBusy) return;
    var btns = Array.prototype.filter.call(document.querySelectorAll('[data-revdel]'), function (b) { return !b.closest('tr').dataset.x; });
    if (!btns.length) return;
    revBusy = true;
    var ids = btns.map(function (b) { return b.dataset.revdel; });
    var r = await sb.from('reviews').select('id,photos,verified').in('id', ids);
    revBusy = false;
    var info = {};
    (r.data || []).forEach(function (x) { info[x.id] = x; });
    btns.forEach(function (b) {
      var tr = b.closest('tr');
      if (tr.dataset.x) return;
      tr.dataset.x = '1';
      var x = info[b.dataset.revdel], cell = tr.children[1];
      if (!x || !cell) return;
      if (x.verified) cell.insertAdjacentHTML('afterbegin', "<span class='xverified'>Verified purchase</span><br>");
      if ((x.photos || []).length) cell.insertAdjacentHTML('beforeend', "<div class='xrevpics'>" + x.photos.map(function (u) { return "<a href='" + E(u) + "' target='_blank' rel='noopener'><img src='" + E(u) + "' alt='Customer photo'></a>"; }).join('') + '</div>');
    });
  }).observe(document.getElementById('view'), { childList: true, subtree: true });
})();
