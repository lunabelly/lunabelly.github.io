'use strict';
/* Luna AI: the Studio assistant. Loads after studio.js and reuses its globals (sb, cfg, tab).
   Text chat streams from the luna-chat server function. Live voice talks straight to the AI provider
   (Gemini Live by default, or OpenAI Realtime) with a single-use 10-minute token minted by luna-voice. Business data comes from owner-only database
   functions; any change only happens after the owner presses Confirm. */
(function () {
  if (typeof sb === 'undefined') return;
  const CFG = window.LUNA_CONFIG || {};
  const FN = CFG.url + '/functions/v1/';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };

  const ICON = {
    moon: "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'/><path class='spark' d='M17 3v4M15 5h4'/></svg>",
    plus: "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M12 5v14M5 12h14'/></svg>",
    hist: "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M3 12a9 9 0 1 0 3-6.7L3 8'/><path d='M3 3v5h5M12 7v5l3 2'/></svg>",
    close: "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M6 6l12 12M18 6L6 18'/></svg>",
    send: "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M5 12h13M13 6l6 6-6 6'/></svg>",
    mic: "<svg viewBox='0 0 24 24' aria-hidden='true'><rect x='9' y='3' width='6' height='11' rx='3'/><path d='M5 11a7 7 0 0 0 14 0M12 18v3'/></svg>",
    micOff: "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 5 2.2M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18'/></svg>",
    stop: "<svg viewBox='0 0 24 24' aria-hidden='true'><rect x='7' y='7' width='10' height='10' rx='1.5'/></svg>",
    hand: "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.6-2.2L3.5 15a1.5 1.5 0 0 1 2.3-1.9L8 15'/></svg>",
    keys: "<svg viewBox='0 0 24 24' aria-hidden='true'><rect x='2.5' y='6' width='19' height='12' rx='2'/><path d='M6 10h1M9.5 10h1M13 10h1M16.5 10h1M7 14h10'/></svg>",
    bin: "<svg viewBox='0 0 24 24' aria-hidden='true'><path d='M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'/></svg>",
  };
  const PROMPTS = [
    "Analyse this month's sales.",
    'What are our best-selling products?',
    'Research jewellery trends.',
    'Help me improve Luna Belly.',
    "Let's have a conversation.",
  ];

  // ------------------------------------------------------------------ safe Markdown
  function inline(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "<a href='$2' target='_blank' rel='noopener noreferrer'>$1</a>");
  }
  function md(src) {
    const lines = esc(src).split('\n');
    const out = [];
    let para = [];
    const flush = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
    const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => inline(c.trim()));
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*```/.test(l)) {
        flush();
        const code = [];
        while (++i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i]);
        out.push('<pre><code>' + code.join('\n') + '</code></pre>');
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
        flush();
        const head = cells(l);
        i++;
        const rows = [];
        while (i + 1 < lines.length && /^\s*\|.*\|\s*$/.test(lines[i + 1])) rows.push(cells(lines[++i]));
        out.push("<div class='lu-tbl'><table><thead><tr>" + head.map((c) => '<th>' + c + '</th>').join('') + '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>');
        continue;
      }
      const h = l.match(/^\s*#{1,4}\s+(.*)$/);
      if (h) { flush(); out.push('<h4>' + inline(h[1]) + '</h4>'); continue; }
      if (/^\s*([-*•])\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
        flush();
        const ordered = /^\s*\d+[.)]\s+/.test(l);
        const re = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/;
        const items = [];
        i--;
        while (i + 1 < lines.length && re.test(lines[i + 1])) items.push(inline(lines[++i].replace(re, '')));
        out.push((ordered ? '<ol>' : '<ul>') + items.map((x) => '<li>' + x + '</li>').join('') + (ordered ? '</ol>' : '</ul>'));
        continue;
      }
      if (/^\s*(---|\*\*\*)\s*$/.test(l)) { flush(); out.push('<hr>'); continue; }
      if (!l.trim()) { flush(); continue; }
      para.push(l);
    }
    flush();
    return out.join('');
  }

  // ------------------------------------------------------------------ markup
  document.body.insertAdjacentHTML('beforeend',
    "<button type='button' id='lunaFab' class='lu-fab' aria-label='Open Luna, your AI assistant' aria-controls='lunaPanel' aria-expanded='false' hidden>" + ICON.moon + '<span>Luna</span></button>' +
    "<aside id='lunaPanel' class='lu-panel' role='dialog' aria-label='Luna AI assistant' aria-modal='false' hidden>" +
      "<header class='lu-head'>" +
        "<span class='lu-avatar'>" + ICON.moon + '</span>' +
        "<div class='lu-id'><strong>Luna</strong><span id='lunaStatus' class='lu-status' role='status'>Ready</span></div>" +
        "<button type='button' class='lu-ib' data-lu='new' aria-label='New conversation' title='New conversation'>" + ICON.plus + '</button>' +
        "<button type='button' class='lu-ib' data-lu='hist' aria-label='Conversation history' title='History' aria-pressed='false'>" + ICON.hist + '</button>' +
        "<button type='button' class='lu-ib' data-lu='close' aria-label='Close Luna' title='Close'>" + ICON.close + '</button>' +
      '</header>' +
      "<div id='lunaSetup' class='lu-setup' hidden></div>" +
      "<div id='lunaHist' class='lu-hist' hidden><h3>Your conversations</h3><ul></ul></div>" +
      "<div id='lunaLog' class='lu-log' aria-live='polite'></div>" +
      "<div id='lunaVoice' class='lu-voice' hidden>" +
        "<div class='lu-orb' data-state='idle'><span></span></div>" +
        "<p id='lunaVState' class='lu-vstate'>Connecting…</p>" +
        "<div class='lu-vbtns'>" +
          "<button type='button' class='lu-vb' data-lu='mute' aria-pressed='false'>" + ICON.mic + '<span>Mute</span></button>' +
          "<button type='button' class='lu-vb' data-lu='interrupt'>" + ICON.hand + '<span>Interrupt</span></button>' +
          "<button type='button' class='lu-vb' data-lu='type'>" + ICON.keys + '<span>Type</span></button>' +
          "<button type='button' class='lu-vb lu-end' data-lu='end'>" + ICON.stop + '<span>End</span></button>' +
        '</div>' +
      '</div>' +
      "<form id='lunaForm' class='lu-form'>" +
        "<textarea id='lunaInput' rows='1' placeholder='Ask Luna anything…' aria-label='Message Luna' maxlength='8000'></textarea>" +
        "<button type='button' class='lu-ib lu-mic' data-lu='voice' aria-label='Talk to Luna' title='Talk to Luna'>" + ICON.mic + '</button>' +
        "<button class='lu-ib lu-send' aria-label='Send' title='Send'>" + ICON.send + '</button>' +
      '</form>' +
    '</aside>');

  const fab = $('#lunaFab'), panel = $('#lunaPanel'), log = $('#lunaLog'), input = $('#lunaInput');
  const statusEl = $('#lunaStatus'), setupEl = $('#lunaSetup'), histEl = $('#lunaHist'), form = $('#lunaForm');
  const voiceEl = $('#lunaVoice'), orb = $('.lu-orb', voiceEl), vstate = $('#lunaVState');

  let conv = store.get('luna_conv') || null;
  let busy = false;
  let configured = null;
  let provider = 'gemini';
  let loadedConv = undefined;

  const setStatus = (t) => { statusEl.textContent = t; };
  const scroll = () => { log.scrollTop = log.scrollHeight; };

  async function token() {
    const r = await sb.auth.getSession();
    return r.data && r.data.session ? r.data.session.access_token : '';
  }
  async function callFn(name, body) {
    return fetch(FN + name, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + (await token()), apikey: CFG.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  }

  // Show the button only inside the signed-in Studio.
  const appEl = $('#app');
  const syncFab = () => {
    const on = appEl && !appEl.hidden;
    fab.hidden = !on || !panel.hidden;
    if (!on && !panel.hidden) close();
  };
  if (appEl) new MutationObserver(syncFab).observe(appEl, { attributes: true, attributeFilter: ['hidden'] });
  syncFab();

  // ------------------------------------------------------------------ open / close / setup check
  function open() {
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    fab.hidden = true;
    document.body.classList.add('lu-open');
    if (loadedConv !== conv) loadConv(conv);
    checkSetup();
    setTimeout(() => input.focus(), 50);
  }
  function close() {
    if (voice) endVoice();
    panel.hidden = true;
    fab.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('lu-open');
    syncFab();
    if (appEl && !appEl.hidden) fab.focus();
  }
  async function checkSetup() {
    if (configured === true) return;
    try {
      const r = await callFn('luna-chat', { mode: 'status' });
      const j = await r.json();
      configured = !!j.configured;
      provider = j.provider || provider;
    } catch (e) { configured = null; }
    if (configured === false) {
      setupEl.hidden = false;
      setupEl.innerHTML = provider === 'openai'
        ? '<strong>Luna is not connected yet.</strong> She is set to use OpenAI, which needs an API key with credit. In Supabase, open <em>Edge Functions → Secrets</em> and add <code>OPENAI_API_KEY</code>, or switch back to Google Gemini in Settings → Luna AI.'
        : '<strong>Luna is not connected yet.</strong> She needs a free Google Gemini key. In Supabase, open <em>Edge Functions → Secrets</em> and add <code>GEMINI_API_KEY</code>.';
      setStatus('Not set up');
    } else {
      setupEl.hidden = true;
      if (!busy && !voice) setStatus(configured ? 'Ready' : 'Ready (could not check connection)');
    }
  }

  // ------------------------------------------------------------------ rendering messages
  function empty() {
    log.innerHTML = "<div class='lu-hello'><span class='lu-avatar big'>" + ICON.moon + '</span>' +
      "<h3>Hello, I'm Luna.</h3><p>Ask me about the shop's sales, products and customers, get me to research something, or just chat. I'll always ask before changing anything.</p>" +
      "<div class='lu-chips'>" + PROMPTS.map((p) => "<button type='button' class='lu-chip' data-prompt='" + esc(p) + "'>" + esc(p) + '</button>').join('') + '</div></div>';
  }
  function bubble(role, content, meta, via) {
    const hello = $('.lu-hello', log);
    if (hello) hello.remove();
    const el = document.createElement('div');
    el.className = 'lu-msg ' + (role === 'user' ? 'lu-me' : 'lu-ai') + (via === 'voice' ? ' lu-spoken' : '') + (meta && meta.note ? ' lu-note' : '');
    el.innerHTML = "<div class='lu-act' hidden></div><div class='lu-body'></div><div class='lu-cards'></div><div class='lu-src' hidden></div>";
    log.appendChild(el);
    setBody(el, role, content);
    if (meta) {
      (meta.actions || []).forEach((a) => card(el, a));
      if (meta.sources && meta.sources.length) sources(el, meta.sources);
    }
    scroll();
    return el;
  }
  function setBody(el, role, content) {
    const b = $('.lu-body', el);
    if (role === 'user') b.textContent = content;
    else b.innerHTML = md(content || '');
  }
  function sources(el, list) {
    const s = $('.lu-src', el);
    s.hidden = false;
    s.innerHTML = '<span>Sources</span><ol>' + list.slice(0, 8).map((x) => {
      let host = x.url;
      try { host = new URL(x.url).hostname.replace(/^www\./, ''); } catch (e) { /* keep */ }
      return "<li><a href='" + esc(x.url) + "' target='_blank' rel='noopener noreferrer'>" + esc(x.title || host) + '</a> <small>' + esc(host) + '</small></li>';
    }).join('') + '</ol>';
  }
  function activity(el, text) {
    const a = $('.lu-act', el);
    if (!text) { a.hidden = true; a.textContent = ''; return; }
    a.hidden = false;
    a.innerHTML = "<span class='lu-dots'><i></i><i></i><i></i></span>" + esc(text) + '…';
  }

  // Confirm / Cancel cards. Danger actions need the confirm phrase typed exactly.
  function card(host, a) {
    const box = $('.lu-cards', host);
    const c = document.createElement('div');
    c.className = 'lu-card' + (a.danger ? ' lu-danger' : '');
    c.dataset.luact = a.id;
    box.appendChild(c);
    paintCard(c, a);
    if (a.status === 'pending') refreshCard(c, a);
  }
  async function refreshCard(c, a) {
    const r = await sb.from('ai_actions').select('status,result,created_at').eq('id', a.id).maybeSingle();
    if (!r.data) return;
    const st = r.data.status === 'pending' && Date.now() - new Date(r.data.created_at).getTime() > 3600e3 ? 'expired' : r.data.status;
    if (st !== 'pending') paintCard(c, Object.assign({}, a, { status: st, result: r.data.result }));
  }
  function paintCard(c, a) {
    const head = a.danger ? 'Permanent change, needs your confirmation' : 'Waiting for your confirmation';
    if (a.status === 'pending') {
      c.innerHTML = "<p class='lu-ch'>" + esc(head) + "</p><p class='lu-cs'>" + esc(a.summary) + '</p>' +
        (a.danger ? "<label class='lu-cphrase'>Type <strong>" + esc(a.confirm_phrase) + "</strong> to confirm<input type='text' autocomplete='off' spellcheck='false'></label>" : '') +
        "<div class='lu-cb'><button type='button' class='btn btn-solid' data-lu='confirm'" + (a.danger ? ' disabled' : '') + ">Confirm</button><button type='button' class='btn btn-line' data-lu='cancel'>Cancel</button></div><p class='lu-cr' role='status'></p>";
      const inp = $('input', c);
      if (inp) inp.addEventListener('input', () => {
        $('[data-lu=confirm]', c).disabled = inp.value.trim().toLowerCase() !== String(a.confirm_phrase).trim().toLowerCase();
      });
      c._a = a;
      return;
    }
    const label = { done: 'Done', cancelled: 'Cancelled', failed: 'Did not work', expired: 'Expired (ask Luna again)' }[a.status] || a.status;
    c.className = 'lu-card lu-' + a.status;
    c.innerHTML = "<p class='lu-ch'>" + esc(label) + "</p><p class='lu-cs'>" + esc(a.summary) + '</p>' +
      (a.status === 'failed' && a.result ? "<p class='lu-cr'>" + esc(a.result) + '</p>' : '');
  }
  async function confirmCard(c) {
    const a = c._a;
    const inp = $('input', c);
    const btns = c.querySelectorAll('button');
    btns.forEach((b) => { b.disabled = true; });
    $('.lu-cr', c).textContent = 'Working…';
    const r = await sb.rpc('luna_execute', { p_action: a.id, p_confirm: inp ? inp.value : null });
    const res = r.data || { ok: false, message: r.error ? r.error.message : 'Could not reach the database.' };
    if (res.ok) {
      paintCard(c, Object.assign({}, a, { status: 'done' }));
      tellLuna('(Owner pressed Confirm. Result: ' + res.message + ')');
    } else if (/^Already|expired/i.test(res.message)) {
      refreshCard(c, a);
    } else {
      $('.lu-cr', c).textContent = res.message;
      btns.forEach((b) => { b.disabled = false; });
      if (inp) $('[data-lu=confirm]', c).disabled = inp.value.trim().toLowerCase() !== String(a.confirm_phrase).trim().toLowerCase();
    }
  }
  async function cancelCard(c) {
    await sb.rpc('luna_cancel', { p_action: c._a.id });
    paintCard(c, Object.assign({}, c._a, { status: 'cancelled' }));
    tellLuna('(Owner pressed Cancel on: ' + c._a.summary + ')');
  }
  // Records the outcome in the conversation so Luna knows next turn (and says it out loud in voice mode).
  async function tellLuna(note) {
    if (conv) await sb.from('ai_messages').insert({ conversation_id: conv, role: 'assistant', content: note, meta: { note: true } });
    if (voice) voiceSay(note);
  }

  // ------------------------------------------------------------------ conversations
  async function loadConv(id) {
    loadedConv = id;
    histEl.hidden = true;
    $('[data-lu=hist]').setAttribute('aria-pressed', 'false');
    if (!id) { empty(); return; }
    log.innerHTML = "<p class='lu-loading'>Loading…</p>";
    const r = await sb.from('ai_messages').select('role,content,meta,via').eq('conversation_id', id).order('id');
    if (r.error || !r.data) { conv = null; store.set('luna_conv', null); empty(); return; }
    log.innerHTML = '';
    r.data.forEach((m) => bubble(m.role, m.content, m.meta, m.via));
    if (!r.data.length) empty();
    scroll();
  }
  function newConv() {
    if (busy) return;
    if (voice) endVoice();
    conv = null;
    store.set('luna_conv', null);
    loadConv(null);
    input.focus();
  }
  async function ensureConv(title) {
    if (conv) return conv;
    const r = await sb.from('ai_conversations').insert({ title: title || 'New conversation' }).select('id').single();
    if (r.error) throw new Error(r.error.message);
    conv = r.data.id;
    loadedConv = conv;
    store.set('luna_conv', conv);
    return conv;
  }
  async function showHistory() {
    if (!histEl.hidden) { histEl.hidden = true; $('[data-lu=hist]').setAttribute('aria-pressed', 'false'); return; }
    histEl.hidden = false;
    $('[data-lu=hist]').setAttribute('aria-pressed', 'true');
    const ul = $('ul', histEl);
    ul.innerHTML = "<li class='lu-loading'>Loading…</li>";
    const r = await sb.from('ai_conversations').select('id,title,updated_at').order('updated_at', { ascending: false }).limit(60);
    const rows = r.data || [];
    if (!rows.length) { ul.innerHTML = "<li class='lu-none'>No conversations yet.</li>"; return; }
    ul.innerHTML = rows.map((c) => {
      const d = new Date(c.updated_at);
      return "<li><button type='button' class='lu-hrow" + (c.id === conv ? ' on' : '') + "' data-luconv='" + c.id + "'><span>" + esc(c.title) + '</span><small>' +
        d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
        "</small></button><button type='button' class='lu-ib lu-del' data-ludel='" + c.id + "' aria-label='Delete this conversation' title='Delete'>" + ICON.bin + '</button></li>';
    }).join('');
  }
  async function delConv(btn) {
    if (btn.dataset.sure !== '1') {
      btn.dataset.sure = '1';
      btn.classList.add('sure');
      btn.setAttribute('aria-label', 'Press again to delete');
      btn.title = 'Press again to delete';
      setTimeout(() => { if (btn.isConnected) { btn.dataset.sure = ''; btn.classList.remove('sure'); btn.title = 'Delete'; } }, 3000);
      return;
    }
    const id = btn.dataset.ludel;
    await sb.from('ai_conversations').delete().eq('id', id);
    btn.closest('li').remove();
    if (id === conv) { conv = null; store.set('luna_conv', null); loadedConv = undefined; }
    if (!$('li', histEl)) $('ul', histEl).innerHTML = "<li class='lu-none'>No conversations yet.</li>";
  }

  // ------------------------------------------------------------------ text chat
  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    if (voice) { voiceText(text); return; }
    if (configured === false) { checkSetup(); return; }
    histEl.hidden = true;
    busy = true;
    form.classList.add('busy');
    input.value = '';
    grow();
    bubble('user', text);
    const el = bubble('assistant', '');
    el.classList.add('lu-streaming');
    activity(el, 'Thinking');
    setStatus('Thinking…');
    let full = '';
    let raf = 0;
    const paint = () => { raf = 0; setBody(el, 'assistant', full); scroll(); };
    try {
      const r = await callFn('luna-chat', { conversation_id: conv, message: text });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        if (j.error === 'not_configured') { configured = false; checkSetup(); }
        throw Object.assign(new Error(j.message || j.error || 'Luna could not answer (' + r.status + ').'), { plain: j.error === 'limit' || j.error === 'quota' });
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const x = await reader.read();
        if (x.done) break;
        buf += dec.decode(x.value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 2);
          if (line.indexOf('data: ') !== 0) continue;
          let ev;
          try { ev = JSON.parse(line.slice(6)); } catch (e) { continue; }
          if (ev.t === 'conv') { conv = ev.id; loadedConv = conv; store.set('luna_conv', conv); }
          else if (ev.t === 'activity') { activity(el, ev.text); setStatus(ev.text + '…'); }
          else if (ev.t === 'delta') { activity(el, ''); setStatus('Writing…'); full += ev.text; if (!raf) raf = requestAnimationFrame(paint); }
          else if (ev.t === 'action') card(el, ev.action);
          else if (ev.t === 'sources') sources(el, ev.list);
          else if (ev.t === 'error') { if (!full) full = (ev.code === 'quota' || ev.code === 'busy') ? '_' + ev.message + '_' : '_Sorry, something went wrong: ' + ev.message + '_'; }
        }
      }
    } catch (e) {
      if (!full) full = e.plain ? '_' + e.message + '_' : '_Sorry, ' + String(e.message || e) + '_';
    }
    if (raf) cancelAnimationFrame(raf);
    activity(el, '');
    el.classList.remove('lu-streaming');
    setBody(el, 'assistant', full.trim() || '_No answer came back. Please try again._');
    scroll();
    busy = false;
    form.classList.remove('busy');
    setStatus(configured === false ? 'Not set up' : 'Ready');
  }
  function grow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 160) + 'px';
  }

  // ------------------------------------------------------------------ live voice
  // Two providers share one voice panel: Gemini Live (free, WebSocket + raw audio) and OpenAI Realtime
  // (paid, WebRTC). Both write the transcript into the same conversation, so typing and talking mix freely.
  let voice = null;
  const vsend = (o) => { if (voice && voice.dc && voice.dc.readyState === 'open') voice.dc.send(JSON.stringify(o)); };
  const gsend = (o) => { if (voice && voice.ws && voice.ws.readyState === 1) voice.ws.send(JSON.stringify(o)); };
  function vState(s, text) {
    orb.dataset.state = s;
    vstate.textContent = text;
    setStatus(text);
  }
  const vnote = (text) => bubble('assistant', '_' + text + '_', { note: true });
  async function startVoice() {
    if (voice || busy) return;
    if (configured === false) { checkSetup(); return; }
    if (!navigator.mediaDevices || !window.AudioContext) { vnote("Live voice isn't supported in this browser. Try Chrome, Edge or Safari."); return; }
    histEl.hidden = true;
    voice = { lines: {}, saved: {}, sources: new Set(), playAt: 0 };
    panel.classList.add('lu-voicing');
    voiceEl.hidden = false;
    vState('idle', 'Connecting…');
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!voice) { mic.getTracks().forEach((t) => t.stop()); return; }
      voice.mic = mic;
      await ensureConv('Voice chat');
      const r = await callFn('luna-voice', { conversation_id: conv });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (j.error === 'not_configured') { configured = false; checkSetup(); }
        throw Object.assign(new Error(j.message || j.error || 'Could not start voice.'), { plain: j.error === 'limit' || j.error === 'quota' });
      }
      if (!voice) return;
      voice.kind = j.provider === 'openai' ? 'openai' : 'gemini';
      if (voice.kind === 'gemini') await startGemini(j, mic);
      else await startOpenAI(j, mic);
      voice.timer = setTimeout(() => { if (voice) { vnote('Voice conversations last up to 10 minutes. Press the microphone to carry on talking.'); endVoice(); } }, 595e3);
    } catch (e) {
      const msg = /Permission|NotAllowed/i.test(String(e.name || e.message)) ? 'Luna needs permission to use your microphone. Allow it in your browser and try again.' : String(e.message || e);
      vnote(msg);
      endVoice();
    }
  }

  // ---- Gemini Live (free tier)
  async function startGemini(j, mic) {
    const ctxIn = new AudioContext({ sampleRate: 16000 });
    const ctxOut = new AudioContext({ sampleRate: 24000 });
    voice.ctxIn = ctxIn;
    voice.ctxOut = ctxOut;
    await ctxIn.audioWorklet.addModule('/atelier-7xk2m9/luna-mic.worklet.js');
    if (!voice) return;
    const node = new AudioWorkletNode(ctxIn, 'luna-mic');
    voice.node = node;
    ctxIn.createMediaStreamSource(mic).connect(node);
    node.port.onmessage = (e) => {
      if (!voice || !voice.ready || voice.muted) return;
      gsend({ realtimeInput: { audio: { data: pcm16(e.data), mimeType: 'audio/pcm;rate=16000' } } });
    };
    const ws = new WebSocket(j.url + '?access_token=' + encodeURIComponent(j.token));
    voice.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ setup: { model: 'models/' + j.model } }));
    ws.onmessage = async (e) => {
      let m;
      try { m = JSON.parse(typeof e.data === 'string' ? e.data : await e.data.text()); } catch (err) { return; }
      onGemini(m);
    };
    ws.onclose = (e) => {
      if (!voice || voice.ws !== ws) return;
      if (e.code === 1011 && /quota|exhaust|limit/i.test(e.reason || '')) vnote("Luna has used up today's free Google allowance for voice. It resets at 09:00 Italian time.");
      else if (e.code !== 1000 && e.reason) vnote('Voice ended: ' + e.reason);
      endVoice();
    };
  }
  function pcm16(f32) {
    const out = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) { const s = Math.max(-1, Math.min(1, f32[i])); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
    const bytes = new Uint8Array(out.buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function playPcm(b64) {
    const ctx = voice.ctxOut;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const bin = atob(b64);
    const n = bin.length >> 1;
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) { let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v >= 0x8000) v -= 0x10000; f[i] = v / 32768; }
    const buf = ctx.createBuffer(1, n, 24000);
    buf.copyToChannel(f, 0);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.connect(ctx.destination);
    const at = Math.max(ctx.currentTime + 0.04, voice.playAt);
    s.start(at);
    voice.playAt = at + buf.duration;
    voice.sources.add(s);
    s.onended = () => {
      if (!voice) return;
      voice.sources.delete(s);
      if (!voice.sources.size && !voice.aiId) vState(voice.muted ? 'idle' : 'listening', voice.muted ? 'Muted' : 'Listening');
    };
    vState('speaking', 'Speaking');
  }
  function stopPlayback() {
    if (!voice) return;
    voice.sources.forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } });
    voice.sources.clear();
    voice.playAt = 0;
  }
  function closeUserLine() {
    if (!voice || !voice.userId) return;
    const l = voice.lines[voice.userId];
    if (l) { l._t = l._t.trim(); if (l._t) saveLine(voice.userId, 'user', l._t); else l.remove(); }
    voice.userId = null;
  }
  function closeAiLine() {
    if (!voice || !voice.aiId) return;
    const l = voice.lines[voice.aiId];
    if (l) { l._t = l._t.trim(); if (l._t) saveLine(voice.aiId, 'assistant', l._t); else l.remove(); }
    voice.aiId = null;
  }
  async function onGemini(m) {
    if (!voice) return;
    if (m.setupComplete) { voice.ready = true; vState('listening', 'Listening'); return; }
    if (m.toolCall) {
      closeUserLine();
      const calls = m.toolCall.functionCalls || [];
      const functionResponses = [];
      for (const fc of calls) {
        const out = await voiceTool(fc.name, Object.assign({}, fc.args || {}));
        functionResponses.push({ id: fc.id, name: fc.name, response: { result: out == null ? null : out } });
      }
      if (voice) gsend({ toolResponse: { functionResponses } });
      return;
    }
    const sc = m.serverContent;
    if (!sc) return;
    if (sc.interrupted) { stopPlayback(); voice.drop = false; closeAiLine(); closeUserLine(); vState('listening', 'Listening'); }
    if (sc.inputTranscription && sc.inputTranscription.text) {
      if (!voice.userId) voice.userId = 'u' + Date.now();
      const l = line(voice.userId, 'user');
      l._t += sc.inputTranscription.text;
      setBody(l, 'user', l._t.trim());
      if (!voice.sources.size) vState('listening', 'Listening');
      scroll();
    }
    const parts = (sc.modelTurn && sc.modelTurn.parts) || [];
    for (const p of parts) if (p.inlineData && p.inlineData.data && !voice.drop) playPcm(p.inlineData.data);
    if (sc.outputTranscription && sc.outputTranscription.text && !voice.drop) {
      closeUserLine();
      if (!voice.aiId) voice.aiId = 'a' + Date.now();
      const l = line(voice.aiId, 'assistant');
      l._t += sc.outputTranscription.text;
      setBody(l, 'assistant', l._t);
      scroll();
    }
    if (sc.turnComplete) {
      closeUserLine();
      closeAiLine();
      voice.drop = false;
      if (!voice.sources.size) vState(voice.muted ? 'idle' : 'listening', voice.muted ? 'Muted' : 'Listening');
    }
  }

  // ---- OpenAI Realtime (paid, optional)
  async function startOpenAI(j, mic) {
    const pc = new RTCPeerConnection();
    voice.pc = pc;
    const audio = new Audio();
    audio.autoplay = true;
    voice.audio = audio;
    pc.ontrack = (e) => { audio.srcObject = e.streams[0]; };
    pc.addTrack(mic.getTracks()[0], mic);
    const dc = pc.createDataChannel('oai-events');
    voice.dc = dc;
    dc.onmessage = (e) => { try { onOpenAI(JSON.parse(e.data)); } catch (err) { /* ignore bad frame */ } };
    dc.onopen = () => vState('listening', 'Listening');
    pc.onconnectionstatechange = () => { if (voice && /failed|disconnected/.test(pc.connectionState)) { vState('idle', 'Connection lost'); setTimeout(() => endVoice(), 1200); } };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdp = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST', body: offer.sdp,
      headers: { Authorization: 'Bearer ' + j.key, 'Content-Type': 'application/sdp' },
    });
    if (!sdp.ok) throw new Error('The voice service did not answer (' + sdp.status + ').');
    if (!voice) return;
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdp.text() });
  }
  async function onOpenAI(ev) {
    if (!voice) return;
    switch (ev.type) {
      case 'input_audio_buffer.speech_started': vState('listening', 'Listening'); break;
      case 'input_audio_buffer.speech_stopped': vState('thinking', 'Thinking'); line(ev.item_id, 'user'); break;
      case 'conversation.item.input_audio_transcription.delta': {
        const l = line(ev.item_id, 'user'); l._t += ev.delta || ''; setBody(l, 'user', l._t); scroll(); break;
      }
      case 'conversation.item.input_audio_transcription.completed': {
        const l = line(ev.item_id, 'user'); l._t = (ev.transcript || l._t).trim();
        if (l._t) { setBody(l, 'user', l._t); saveLine(ev.item_id, 'user', l._t); } else l.remove();
        scroll(); break;
      }
      case 'response.output_audio_transcript.delta': case 'response.audio_transcript.delta': {
        const l = line(ev.item_id, 'assistant'); l._t += ev.delta || ''; setBody(l, 'assistant', l._t); scroll(); break;
      }
      case 'response.output_audio_transcript.done': case 'response.audio_transcript.done': {
        const l = line(ev.item_id, 'assistant'); l._t = ev.transcript || l._t; setBody(l, 'assistant', l._t); saveLine(ev.item_id, 'assistant', l._t); break;
      }
      case 'output_audio_buffer.started': vState('speaking', 'Speaking'); break;
      case 'output_audio_buffer.stopped': case 'output_audio_buffer.cleared': vState('listening', 'Listening'); break;
      case 'response.function_call_arguments.done': {
        let args = {};
        try { args = JSON.parse(ev.arguments || '{}'); } catch (e) { /* empty */ }
        const out = await voiceTool(ev.name, args);
        if (!voice) return;
        vsend({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: ev.call_id, output: JSON.stringify(out == null ? null : out).slice(0, 60000) } });
        vsend({ type: 'response.create' });
        break;
      }
      case 'error': if (ev.error && !/no active response|cancel/i.test(ev.error.message || '')) vnote(ev.error.message || 'Voice error'); break;
    }
  }

  // ---- shared by both providers
  function endVoice() {
    if (!voice) return;
    const v = voice;
    stopPlayback();
    closeUserLine();
    closeAiLine();
    voice = null;
    clearTimeout(v.timer);
    try { if (v.ws) v.ws.close(1000); } catch (e) { /* closed */ }
    try { if (v.dc) v.dc.close(); } catch (e) { /* closed */ }
    try { if (v.pc) v.pc.close(); } catch (e) { /* closed */ }
    try { if (v.node) v.node.disconnect(); } catch (e) { /* gone */ }
    try { if (v.ctxIn) v.ctxIn.close(); } catch (e) { /* closed */ }
    try { if (v.ctxOut) v.ctxOut.close(); } catch (e) { /* closed */ }
    if (v.mic) v.mic.getTracks().forEach((t) => t.stop());
    if (v.audio) v.audio.srcObject = null;
    voiceEl.hidden = true;
    panel.classList.remove('lu-voicing');
    const mb = $('[data-lu=mute]');
    mb.setAttribute('aria-pressed', 'false');
    mb.innerHTML = ICON.mic + '<span>Mute</span>';
    setStatus(configured === false ? 'Not set up' : 'Ready');
  }
  function line(id, role) {
    if (!voice.lines[id]) { voice.lines[id] = bubble(role, '', null, 'voice'); voice.lines[id]._t = ''; }
    return voice.lines[id];
  }
  function saveLine(id, role, text) {
    if (!text || !voice || voice.saved[id] || !conv) return;
    voice.saved[id] = 1;
    const c = conv;
    sb.from('ai_messages').insert({ conversation_id: c, role, content: text, via: 'voice' })
      .then(() => sb.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', c));
  }
  async function voiceTool(name, args) {
    let out;
    if (name === 'business_data') {
      vState('thinking', 'Checking the shop data');
      const tool = args.tool; delete args.tool;
      const r = await sb.rpc('luna_query', { p_tool: tool, p_args: args });
      out = r.error ? { error: r.error.message } : r.data;
    } else if (name === 'propose_change') {
      vState('thinking', 'Preparing a change');
      const kind = args.kind; delete args.kind;
      const r = await sb.rpc('luna_propose', { p_kind: kind, p_args: args, p_conversation: conv });
      out = r.error ? { error: r.error.message } : r.data;
      if (out && out.action_id) {
        const a = { id: out.action_id, summary: out.summary, danger: out.danger, confirm_phrase: out.confirm_phrase, status: 'pending' };
        const host = bubble('assistant', '', { actions: [a] }, 'voice');
        host.classList.add('lu-cardonly');
        if (conv) sb.from('ai_messages').insert({ conversation_id: conv, role: 'assistant', content: '', meta: { actions: [a] }, via: 'voice' });
        out.note = 'A Confirm card is now on the owner\'s screen. Nothing changes until they press Confirm.';
      }
    } else if (name === 'search_web') {
      vState('thinking', 'Searching the web');
      const r = await callFn('luna-chat', { mode: 'search', query: args.query });
      out = await r.json().catch(() => ({ error: 'Search failed' }));
      if (out && out.sources && out.sources.length) {
        const host = bubble('assistant', '', { sources: out.sources }, 'voice');
        host.classList.add('lu-cardonly');
        if (conv) sb.from('ai_messages').insert({ conversation_id: conv, role: 'assistant', content: '', meta: { sources: out.sources }, via: 'voice' });
      }
    } else out = { error: 'Unknown tool' };
    return out;
  }
  // Something the owner typed or did (Confirm / Cancel) goes into the live session as text.
  function voiceSay(text) {
    if (!voice) return;
    if (voice.kind === 'gemini') gsend({ realtimeInput: { text } });
    else {
      vsend({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
      vsend({ type: 'response.create' });
    }
  }
  function interrupt() {
    if (!voice) return;
    if (voice.kind === 'gemini') { stopPlayback(); voice.drop = true; closeAiLine(); }
    else { vsend({ type: 'response.cancel' }); vsend({ type: 'output_audio_buffer.clear' }); }
    vState('listening', 'Listening');
  }
  function toggleMute(btn) {
    if (!voice || !voice.mic) return;
    const t = voice.mic.getAudioTracks()[0];
    t.enabled = !t.enabled;
    voice.muted = !t.enabled;
    btn.setAttribute('aria-pressed', String(!t.enabled));
    btn.innerHTML = (t.enabled ? ICON.mic : ICON.micOff) + '<span>' + (t.enabled ? 'Mute' : 'Unmute') + '</span>';
    vState(t.enabled ? 'listening' : 'idle', t.enabled ? 'Listening' : 'Muted');
  }
  // Typing while in voice mode goes into the same live session, so nothing is lost.
  function voiceText(text) {
    input.value = '';
    grow();
    const id = 'typed' + Date.now();
    closeUserLine();
    bubble('user', text);
    saveLine(id, 'user', text);
    voiceSay(text);
    vState('thinking', 'Thinking');
  }

  // ------------------------------------------------------------------ events
  fab.addEventListener('click', open);
  panel.addEventListener('click', (e) => {
    const t = e.target.closest('[data-lu],[data-prompt],[data-luconv],[data-ludel]');
    if (!t) return;
    if (t.dataset.prompt) { send(t.dataset.prompt); return; }
    if (t.dataset.luconv) { if (voice) endVoice(); conv = t.dataset.luconv; store.set('luna_conv', conv); loadConv(conv); return; }
    if (t.dataset.ludel) { delConv(t); return; }
    const c = t.closest('.lu-card');
    switch (t.dataset.lu) {
      case 'close': close(); break;
      case 'new': newConv(); break;
      case 'hist': showHistory(); break;
      case 'voice': startVoice(); break;
      case 'end': endVoice(); break;
      case 'type': endVoice(); input.focus(); break;
      case 'interrupt': interrupt(); break;
      case 'mute': toggleMute(t); break;
      case 'confirm': if (c) confirmCard(c); break;
      case 'cancel': if (c) cancelCard(c); break;
    }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); e.stopPropagation(); send(input.value); });
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });
  window.addEventListener('pagehide', () => { if (voice) endVoice(); });

  // ------------------------------------------------------------------ Settings: Luna AI
  const GVOICES = [
    ['Female-sounding', [['Sulafat', 'warm (recommended)'], ['Achernar', 'soft'], ['Vindemiatrix', 'gentle'], ['Aoede', 'breezy'], ['Despina', 'smooth'],
      ['Erinome', 'clear'], ['Kore', 'firm'], ['Leda', 'youthful'], ['Callirrhoe', 'easy-going'], ['Autonoe', 'bright'], ['Gacrux', 'mature'],
      ['Zephyr', 'bright'], ['Laomedeia', 'upbeat'], ['Pulcherrima', 'forward']]],
    ['Male-sounding', [['Achird', 'friendly'], ['Algieba', 'smooth'], ['Charon', 'informative'], ['Iapetus', 'clear'], ['Umbriel', 'easy-going'],
      ['Schedar', 'even'], ['Sadaltager', 'knowledgeable'], ['Puck', 'upbeat'], ['Orus', 'firm'], ['Fenrir', 'excitable']]],
  ];
  const OVOICES = [
    ['marin', 'Marin: warm, natural female (recommended)'], ['shimmer', 'Shimmer: bright, gentle female'], ['coral', 'Coral: friendly, upbeat female'],
    ['sage', 'Sage: calm, thoughtful'], ['ballad', 'Ballad: soft, expressive'], ['alloy', 'Alloy: neutral, balanced'],
    ['verse', 'Verse: lively, expressive'], ['cedar', 'Cedar: deep, natural male'], ['ash', 'Ash: clear male'], ['echo', 'Echo: steady male'],
  ];
  const FIELDS = {
    provider: 'luna_provider', gvoice: 'luna_gemini_voice', gtext: 'luna_gemini_text_model', gfall: 'luna_gemini_fallbacks', glive: 'luna_gemini_live_model',
    capm: 'luna_cap_messages', capv: 'luna_cap_voice', voice: 'luna_voice', custom: 'luna_custom_voice_id', text: 'luna_text_model', vmodel: 'luna_voice_model',
  };
  const DEFAULTS = {
    provider: 'gemini', gvoice: 'Sulafat', gtext: 'gemini-3.8-flash', gfall: 'gemini-3.5-flash,gemini-flash-latest,gemini-3.5-flash-lite', glive: 'gemini-3.8-live',
    capm: '150', capv: '20', voice: 'marin', custom: '', text: 'gpt-6-astra', vmodel: 'gpt-realtime-2.1',
  };
  const showProvider = (f) => {
    const p = f.elements.provider.value;
    f.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== p; });
  };
  const viewEl = document.getElementById('view');
  if (viewEl) new MutationObserver(async () => {
    if (typeof tab === 'undefined' || tab !== 'settings' || document.getElementById('lunaForm2') || !document.getElementById('setForm')) return;
    const anchor = document.getElementById('payForm') || document.getElementById('setForm');
    anchor.insertAdjacentHTML('afterend',
      "<form id='lunaForm2' class='setf'><h2>Luna AI</h2>" +
      "<p id='lunaConn' class='saved'>Checking connection…</p>" +
      "<label>AI provider<select name='provider'><option value='gemini'>Google Gemini (free tier)</option><option value='openai'>OpenAI (paid, needs credit)</option></select></label>" +
      "<div data-for='gemini'>" +
        "<label>Luna's voice<select name='gvoice'>" + GVOICES.map((g) => "<optgroup label='" + esc(g[0]) + "'>" + g[1].map((v) => "<option value='" + v[0] + "'>" + esc(v[0] + ': ' + v[1]) + '</option>').join('') + '</optgroup>').join('') + '</select></label>' +
        "<p class='saved'>You can listen to every voice in Google AI Studio before choosing.</p>" +
        "<label>Messages per owner per day<input name='capm' type='number' min='1' max='2000' step='1' required></label>" +
        "<label>Voice conversations per owner per day<input name='capv' type='number' min='0' max='200' step='1' required></label>" +
        "<p class='saved'>These limits keep Luna inside Google's free allowance. A voice conversation lasts up to 10 minutes. Web search is not available on the free tier, so Luna answers from what she already knows and says when something may be out of date.</p>" +
        "<details class='lu-adv'><summary>Advanced: AI models</summary>" +
        "<label>Text model<input name='gtext' autocomplete='off' spellcheck='false'></label>" +
        "<label>Back-up models, used when the first is busy (comma separated)<input name='gfall' autocomplete='off' spellcheck='false'></label>" +
        "<label>Voice model<input name='glive' autocomplete='off' spellcheck='false'></label></details>" +
      '</div>' +
      "<div data-for='openai' hidden>" +
        "<label>Luna's voice<select name='voice'>" + OVOICES.map((v) => "<option value='" + v[0] + "'>" + esc(v[1]) + '</option>').join('') + '</select></label>' +
        "<label>Custom voice ID (optional)<input name='custom' autocomplete='off' spellcheck='false' placeholder='Leave empty to use the voice above'></label>" +
        "<details class='lu-adv'><summary>Advanced: AI models</summary>" +
        "<label>Text model<input name='text' autocomplete='off' spellcheck='false'></label>" +
        "<label>Voice model<input name='vmodel' autocomplete='off' spellcheck='false'></label></details>" +
      '</div>' +
      "<button class='btn btn-solid'>Save Luna settings</button><p id='lunaMsg' class='saved' role='status'></p>" +
      "<p class='saved'>Changes apply to Luna's next message and next voice conversation.</p></form>");
    const f = document.getElementById('lunaForm2');
    const r = await sb.from('site_settings').select('key,value').like('key', 'luna_%');
    const s = {};
    (r.data || []).forEach((x) => { s[x.key] = x.value; });
    Object.keys(FIELDS).forEach((k) => { const el = f.elements[k]; if (el) el.value = s[FIELDS[k]] || DEFAULTS[k]; });
    showProvider(f);
    f.elements.provider.addEventListener('change', () => { showProvider(f); paintConn(); });
    paintConn();
  }).observe(viewEl, { childList: true });
  async function paintConn() {
    const conn = document.getElementById('lunaConn');
    const f = document.getElementById('lunaForm2');
    if (!conn || !f) return;
    let st = null;
    try { st = await (await callFn('luna-chat', { mode: 'status' })).json(); } catch (e) { /* unknown */ }
    const chosen = f.elements.provider.value;
    const keyName = chosen === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY';
    const label = chosen === 'gemini' ? 'Google Gemini (free tier)' : 'OpenAI';
    if (!st) conn.textContent = 'Could not check the connection right now.';
    else if (st.provider !== chosen) conn.innerHTML = 'Press <strong>Save Luna settings</strong> to switch to ' + esc(label) + '.';
    else if (st.configured) conn.textContent = 'Connected to ' + label + '.';
    else conn.innerHTML = '<strong>Not connected yet.</strong> Add the secret <code>' + keyName + '</code> in Supabase → Edge Functions → Secrets.';
  }
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'lunaForm2') return;
    e.preventDefault();
    e.stopPropagation();
    const f = e.target, msg = document.getElementById('lunaMsg');
    const v = (k) => String(f.elements[k].value || '').trim();
    const model = /^[A-Za-z0-9._:-]{2,80}$/;
    const models = [v('gtext'), v('glive'), v('text'), v('vmodel')].concat(v('gfall') ? v('gfall').split(',').map((x) => x.trim()) : []);
    if (models.some((m) => !model.test(m))) { msg.textContent = 'Model names can only contain letters, numbers, dots and dashes.'; return; }
    if (v('custom') && !/^[A-Za-z0-9._:-]{2,120}$/.test(v('custom'))) { msg.textContent = 'That voice ID does not look right.'; return; }
    const capm = Math.round(Number(v('capm'))), capv = Math.round(Number(v('capv')));
    if (!(capm >= 1 && capm <= 2000) || !(capv >= 0 && capv <= 200)) { msg.textContent = 'Please check the daily limits.'; return; }
    const now = new Date().toISOString();
    const vals = Object.assign({}, ...Object.keys(FIELDS).map((k) => ({ [k]: v(k) })), { capm: String(capm), capv: String(capv), gfall: v('gfall').split(',').map((x) => x.trim()).filter(Boolean).join(',') });
    const rows = Object.keys(FIELDS).map((k) => ({ key: FIELDS[k], value: vals[k], updated_at: now }));
    const r = await sb.from('site_settings').upsert(rows);
    msg.textContent = r.error ? 'Could not save.' : 'Saved.';
    if (!r.error) { configured = null; paintConn(); }
  }, true);
})();
