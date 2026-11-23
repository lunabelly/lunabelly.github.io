'use strict';
/* Journal tab for the studio. Loads after studio.js and reuses its client, helpers and
   photo upload. studio.js is not modified: this file owns its own tab button and forms.
   Sign-in and the admin check are untouched, and every write here is also enforced by
   the "admin manage posts" policy in the database. */
(function () {
  var tabBtn = document.querySelector('[data-journal]');
  var viewEl = document.getElementById('view');
  if (!tabBtn || !viewEl || typeof sb === 'undefined') return;

  var slugify = function (s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  };

  async function show() {
    viewEl.innerHTML = empty('Loading…');
    var r = await sb.from('posts').select('*').order('created_at', { ascending: false });
    if (r.error) { viewEl.innerHTML = empty('Could not load the journal.'); return; }
    viewEl.innerHTML =
      "<form id='newPost' class='newp'><input name='title' placeholder='New article title' required maxlength='140' aria-label='New article title'><button class='btn btn-solid'>Add article</button></form>" +
      "<p class='saved'>New articles start as drafts. Tick Published and save when one is ready. Leave a blank line between paragraphs.</p>" +
      (r.data.length ? r.data.map(function (p) {
        return "<form class='prod' data-post='" + esc(p.id) + "'><div class='thumb'>" +
          (p.cover_url ? "<img src='" + esc(p.cover_url) + "' alt=''>" : '') + "</div><div class='pf'>" +
          "<input name='title' value='" + esc(p.title) + "' required maxlength='140' aria-label='Title'>" +
          "<textarea name='excerpt' rows='2' maxlength='300' placeholder='One or two sentences shown on the journal page' aria-label='Summary'>" + esc(p.excerpt) + '</textarea>' +
          "<textarea name='body' rows='12' placeholder='The article. Leave a blank line between paragraphs.' aria-label='Article'>" + esc(p.body) + '</textarea>' +
          "<div class='rowf'><label>Cover photo (optional)<input name='cover' type='file' accept='image/*'></label>" +
          (p.cover_url ? "<button type='button' class='link' data-nocover='" + esc(p.id) + "'>Remove cover</button>" : '') +
          "<label class='chk'><input name='published' type='checkbox'" + (p.published ? ' checked' : '') + '> Published</label></div>' +
          "<div class='rowf'><button class='btn btn-solid'>Save</button>" +
          (p.published ? "<a class='link' href='/blog/" + encodeURIComponent(p.slug) + "' target='_blank' rel='noopener'>View article</a>" : "<span class='saved'>Draft, not visible on the site</span>") +
          "<button type='button' class='link' data-delpost='" + esc(p.id) + "'>Delete</button>" +
          "<span class='saved' role='status'></span></div></div></form>";
      }).join('') : empty('No articles yet.'));
  }

  tabBtn.addEventListener('click', function () {
    clearInterval(poll); conv = null; tab = 'journal';
    document.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.remove('on'); });
    tabBtn.classList.add('on');
    show();
  });
  document.addEventListener('click', async function (e) {
    if (e.target.closest('[data-tab]')) { tabBtn.classList.remove('on'); return; }
    var t = e.target.closest('[data-delpost],[data-nocover]');
    if (!t) return;
    if (t.dataset.delpost) {
      if (!window.confirm('Delete this article? This cannot be undone.')) return;
      var r = await sb.from('posts').delete().eq('id', t.dataset.delpost);
      if (!r.error) show();
    } else if (t.dataset.nocover) {
      await sb.from('posts').update({ cover_url: null }).eq('id', t.dataset.nocover);
      show();
    }
  });

  viewEl.addEventListener('submit', async function (e) {
    var f = e.target;
    if (f.id === 'newPost') {
      e.preventDefault();
      var title = String(new FormData(f).get('title')).trim();
      if (!title) return;
      var slug = (slugify(title) || 'article') + '-' + Date.now().toString(36);
      var r = await sb.from('posts').insert({ slug: slug, title: title });
      if (!r.error) show();
      return;
    }
    if (f.dataset && f.dataset.post) {
      e.preventDefault();
      var id = f.dataset.post;
      var note = f.querySelector('.saved[role=status]');
      var d = new FormData(f);
      note.textContent = 'Saving…';
      var cur = (await sb.from('posts').select('published,published_at').eq('id', id).maybeSingle()).data || {};
      var pub = d.get('published') === 'on';
      var up = {
        title: String(d.get('title')).trim(),
        excerpt: String(d.get('excerpt') || '').trim(),
        body: String(d.get('body') || '').trim(),
        published: pub,
        updated_at: new Date().toISOString()
      };
      if (pub && !cur.published_at) up.published_at = new Date().toISOString();
      var file = d.get('cover');
      if (file && file.size) {
        note.textContent = 'Uploading photo…';
        var url = await uploadImage(file, 'journal-' + id);
        if (!url) { note.textContent = 'Photo upload failed.'; return; }
        up.cover_url = url;
      }
      var s = await sb.from('posts').update(up).eq('id', id);
      if (s.error) { note.textContent = 'Could not save.'; return; }
      show();
    }
  });
})();
