'use strict';
/* Blog (The Luna Journal), About us, and the photographs in The Luna Edit.
   Loads after app.js and reuses its Supabase client. Kept in its own file so the
   shop and checkout code in app.js is not touched. */
(function () {
  var box = document.getElementById('pagePage');
  if (!box || typeof sb === 'undefined') return;

  var PATH = location.pathname.replace(/\/+$/, '') || '/';
  var isBlog = PATH === '/blog';
  var postSlug = (PATH.match(/^\/blog\/(.+)$/) || [])[1];
  var isAbout = PATH === '/about';
  var MINE = isBlog || postSlug || isAbout;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return '&#' + c.charCodeAt(0) + ';';
    });
  };
  var when = function (d) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  var isUrl = function (u) { return String(u || '').indexOf('https://') === 0; };
  function meta(title, desc, path) {
    document.title = title + ' | Luna Belly';
    var d = document.querySelector("meta[name='description']");
    if (d && desc) d.setAttribute('content', desc);
    var c = document.querySelector("link[rel='canonical']");
    if (c) c.setAttribute('href', location.origin + path);
  }

  /* highlight the current page in the header */
  var links = document.querySelectorAll('.mainnav a');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href');
    var on = href === '/' ? PATH === '/' : PATH === href || PATH.indexOf(href + '/') === 0;
    if (on) links[i].setAttribute('aria-current', 'page');
  }

  /* ---------- blog list ---------- */
  async function renderBlog() {
    meta('The Luna Journal', 'Styling notes, sizing help and honest jewellery care from Luna Belly.', '/blog');
    box.innerHTML = "<p class='eyebrow'>The Luna Journal</p><h1>Notes on wearing it well</h1>" +
      "<p class='lede sm'>Styling, sizing and care, written by us.</p><p class='note'>Loading…</p>";
    var r = await sb.from('posts').select('slug,title,excerpt,cover_url,published_at')
      .eq('published', true).order('published_at', { ascending: false });
    var posts = r.error ? [] : (r.data || []);
    box.innerHTML = "<p class='eyebrow'>The Luna Journal</p><h1>Notes on wearing it well</h1>" +
      "<p class='lede sm'>Styling, sizing and care, written by us.</p>" +
      (r.error
        ? "<div class='empty'><p>We could not load the journal. Please refresh the page.</p></div>"
        : posts.length
          ? "<div class='postgrid'>" + posts.map(function (p) {
              return "<article class='postcard'><a href='/blog/" + encodeURIComponent(p.slug) + "'>" +
                (isUrl(p.cover_url) ? "<img src='" + esc(p.cover_url) + "' alt='' loading='lazy' decoding='async'>" : '') +
                "<p class='postdate'>" + when(p.published_at) + '</p>' +
                '<h2>' + esc(p.title) + '</h2>' +
                '<p>' + esc(p.excerpt) + '</p>' +
                "<span class='postmore'>Read it</span></a></article>";
            }).join('') + '</div>'
          : "<div class='empty'><p>Nothing published yet. Come back soon.</p></div>");
  }

  /* ---------- single post ---------- */
  async function renderPost() {
    var slug = postSlug;
    try { slug = decodeURIComponent(postSlug); } catch (e) {}
    box.innerHTML = "<a class='back' href='/blog'>← The Luna Journal</a><p class='note'>Loading…</p>";
    var r = await sb.from('posts').select('*').eq('slug', slug).eq('published', true).maybeSingle();
    var p = r.error ? null : r.data;
    if (!p) {
      meta('Article not found', '', '/blog');
      box.innerHTML = "<a class='back' href='/blog'>← The Luna Journal</a>" +
        "<div class='empty mid'><h1>That article has moved</h1>" +
        "<a class='btn btn-solid' href='/blog'>See all articles</a></div>";
      return;
    }
    meta(p.title, p.excerpt, '/blog/' + encodeURIComponent(p.slug));
    var paras = String(p.body || '').split(/\n\s*\n/).map(function (t) { return t.trim(); })
      .filter(Boolean).map(function (t) { return '<p>' + esc(t).replace(/\n/g, '<br>') + '</p>'; }).join('');
    box.innerHTML = "<a class='back' href='/blog'>← The Luna Journal</a>" +
      "<article class='post'><p class='postdate'>" + when(p.published_at || p.created_at) + '</p>' +
      '<h1>' + esc(p.title) + '</h1>' +
      (p.excerpt ? "<p class='lede sm'>" + esc(p.excerpt) + '</p>' : '') +
      (isUrl(p.cover_url) ? "<img class='postcover' src='" + esc(p.cover_url) + "' alt=''>" : '') +
      "<div class='postbody'>" + paras + '</div>' +
      "<p class='postend'><a class='btn btn-line' href='/#shop'>Browse the collection</a> " +
      "<a class='link' href='/kamarbandh'>Kamarbandh guide</a> <a class='link' href='/size-guide'>Size guide</a> <a class='link' href='/care'>Jewellery care</a></p></article>";
    if (document.querySelector('script[data-ssr]')) return;
    var ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'Article', headline: p.title,
      description: p.excerpt || undefined, datePublished: p.published_at || p.created_at,
      author: { '@type': 'Organization', name: 'Luna Belly' },
      image: isUrl(p.cover_url) ? p.cover_url : undefined
    });
    document.head.appendChild(ld);
  }

  /* ---------- about ---------- */
  function renderAbout() {
    meta('About us', 'Luna Belly is a small shop for waist chains and kamarbandhs, chosen from jewellery makers in India, Hong Kong and beyond, with a separate handmade collection.', '/about');
    box.innerHTML = "<div class='about'><p class='eyebrow'>About us</p><h1>Waist jewellery, gathered from around the world</h1>" +
      "<p class='lede'>Luna Belly is a small online shop based in Birmingham, UK. We look for one thing: beautiful chains for the waist. We are not connected to other shops or brands with a similar name.</p>" +
      "<div class='aboutcols'><div>" +
      '<h2>Why the waist</h2>' +
      '<p>The kamarbandh has been worn for centuries, at weddings, at festivals and on ordinary evenings. It is the piece that finishes a saree and the one that moves when you do. We think it deserves the same attention as a necklace, and far more than it usually gets.</p>' +
      '<h2>Where our pieces come from</h2>' +
      '<p>We do not pretend to make everything we sell. Most of our pieces come from jewellery makers and suppliers in India, Hong Kong and elsewhere. We choose each design for how it sits and how it moves, check it when it arrives, and describe it as it is: the base metal, the plating and the stones.</p>' +
      '<h2>Handmade pieces</h2>' +
      "<p>Some pieces are made by hand. Those carry a Handmade badge on their photo and live together in our <a href='/c/handmade'>Handmade collection</a>, so you always know which is which. Because each one is made individually, no two are exactly alike.</p>" +
      '</div><div>' +
      '<h2>What we promise, and what we do not</h2>' +
      "<p>Every product page lists the base metal and the plating. We do not claim that plated jewellery lasts forever or that nobody will ever react to it. We would rather tell you what a piece is made of and how to look after it. Our <a href='/care'>care page</a> does exactly that.</p>" +
      '<h2>Talk to us</h2>' +
      "<p>There is a chat on every page, and a person answers it. Ask about sizing, about a gift, or about a piece you cannot decide on. You can also find the details on our <a href='/contact'>contact page</a>.</p>" +
      '</div></div>' +
      "<div class='aboutstory'><h2>Our story</h2>" +
      '<p>Luna Belly began with a simple observation: the kamarbandh is one of the most beautiful pieces of jewellery there is, and one of the hardest to find outside India. Good ones were scattered across markets and makers on the other side of the world.</p>' +
      '<p>So we started gathering them in one place. We are new and we are small, and we are building the collection one piece at a time. If there is a style you are looking for and cannot find here, tell us in the chat. We may well be able to find it for you.</p></div>' +
      "<p class='aboutcta'><a class='btn btn-solid' href='/#shop'>Shop the collection</a> <a class='btn btn-line' href='/blog'>Read the journal</a></p></div>";
  }

  /* ---------- The Luna Edit: fill each look with a matching product photo ---------- */
  async function fillEdit() {
    var cards = document.querySelectorAll('[data-look]');
    if (!cards.length) return;
    var r = await sb.from('products').select('id,name,slug,image_url,tags,sort_order').order('sort_order');
    if (r.error || !r.data) return;
    var used = {};
    for (var i = 0; i < cards.length; i++) {
      var tag = cards[i].getAttribute('data-look');
      var pick = r.data.filter(function (p) {
        return !used[p.id] && isUrl(p.image_url) && (p.tags || []).indexOf(tag) >= 0;
      })[0];
      if (!pick) continue;
      used[pick.id] = 1;
      var img = document.createElement('img');
      if (window.lbOpt) window.lbOpt.setImg(img, pick.image_url, [640, 828, 1080], '(max-width: 760px) 100vw, 50vw'); else img.src = pick.image_url;
      img.alt = pick.name;
      img.loading = 'lazy';
      img.decoding = 'async';
      var media = cards[i].querySelector('.lookmedia');
      if (media) { media.textContent = ''; media.appendChild(img); }
      var cap = cards[i].querySelector('.lookpiece');
      if (cap) { cap.textContent = 'Shown: ' + pick.name; cap.setAttribute('href', '/p/' + encodeURIComponent(pick.slug)); cap.hidden = false; }
    }
  }

  /* ---------- local pages: link Birmingham and the Midlands from the shop footer ---------- */
  var shopLinks = document.querySelector("footer .foot-links[aria-label='Shop information']");
  if (shopLinks && !shopLinks.querySelector("a[href='/birmingham']")) {
    var bl = document.createElement('a');
    bl.href = '/birmingham'; bl.textContent = 'Birmingham';
    var ml = document.createElement('a');
    ml.href = '/midlands'; ml.textContent = 'Delivery across the Midlands';
    shopLinks.appendChild(bl); shopLinks.appendChild(ml);
  }
  if (shopLinks && !shopLinks.querySelector("a[href='/kamarbandh']")) {
    var gl = document.createElement('a');
    gl.href = '/kamarbandh'; gl.textContent = 'Kamarbandh guide';
    shopLinks.appendChild(gl);
  }

  /* ---------- boot ---------- */
  if (MINE) {
    document.getElementById('home').hidden = true;
    box.hidden = false;
    if (isBlog) renderBlog();
    else if (postSlug) renderPost();
    else renderAbout();
  } else if (PATH === '/') {
    fillEdit();
  }
})();
