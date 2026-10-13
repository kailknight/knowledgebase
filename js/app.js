/* Knowledge Base — list / view / add / edit articles stored in Supabase (table kb_articles).
   Routes: #/ (list), #/a/<id> (view), #/new, #/edit/<id> */
(() => {
  const $ = (id) => document.getElementById(id);
  const cfg = window.KB_CONFIG || {};
  const API = String(cfg.supabaseUrl || '').replace(/\/+$/, '') + '/rest/v1/kb_articles';
  const KEY = String(cfg.supabaseAnonKey || '').trim();
  const MAX_IMAGE_WIDTH = 1600;       // pasted pictures are scaled down to this width…
  const KEEP_ORIGINAL_BELOW = 150e3;  // …unless they're already small (bytes)

  // ---------- helpers ----------
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) if (c !== null && c !== undefined && c !== false) node.append(c);
    return node;
  }
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  const when = (t) => t ? new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const fmtBytes = (n) => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

  // Everything shown or saved goes through DOMPurify (articles are editable by anyone with the link).
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') || '')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener');
    }
    // Pasted Word/Outlook images point at local files (file:///…) that nobody else can see.
    if (node.tagName === 'IMG' && !/^(data:image\/|https:)/i.test(node.getAttribute('src') || '')) node.remove();
  });
  const clean = (html) => DOMPurify.sanitize(html, {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
    FORBID_ATTR: ['style', 'class', 'id', 'width', 'height']
  });

  // ---------- name & theme ----------
  const getName = () => { try { return localStorage.getItem('kb_name') || ''; } catch { return ''; } };
  function askName() {
    const name = (prompt('Your name (shown on articles you add or edit):', getName()) || '').trim();
    if (name) { try { localStorage.setItem('kb_name', name); } catch { /* storage blocked */ } }
    renderName();
    return getName();
  }
  function renderName() { $('nameBtn').textContent = `👤 ${getName() || 'Set your name'}`; }
  $('nameBtn').onclick = askName;

  function renderTheme() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('themeBtn').textContent = dark ? '☀️ Light' : '🌙 Dark';
  }
  $('themeBtn').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('kb_theme', next); } catch { /* storage blocked */ }
    renderTheme();
  };
  $('newBtn').onclick = () => { location.hash = '#/new'; };

  // ---------- data (Supabase REST) ----------
  async function api(method, query = '', body, prefer) {
    const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
    if (prefer) headers.Prefer = prefer;
    const res = await fetch(`${API}${query}`, { method, headers, body: body && JSON.stringify(body), cache: 'no-store' });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
    return json;
  }
  const listArticles = () => api('GET', '?select=id,title,category,tags,body_text,updated_by,updated_at&order=updated_at.desc');
  const getArticle = (id) => api('GET', `?select=*&id=eq.${encodeURIComponent(id)}`).then(r => r[0]);

  function configError() {
    if (!/^https:\/\//i.test(cfg.supabaseUrl || '') || !KEY) return 'The Knowledge Base isn\'t connected yet: add the Supabase URL and anon key to js/config.js (see README).';
    try {
      if (JSON.parse(atob(KEY.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role') {
        return 'js/config.js contains a service_role key — replace it with the anon key (and rotate the service_role key in Supabase).';
      }
    } catch { /* not a JWT — let the API decide */ }
    return '';
  }

  // ---------- pages ----------
  const app = $('app');
  let listCache = null;
  let leaveGuard = null; // returns true when it's OK to leave the editor

  async function route() {
    if (leaveGuard && !leaveGuard()) { history.replaceState(null, '', currentHash); return; }
    leaveGuard = null;
    currentHash = location.hash || '#/';
    const [, page, id] = currentHash.match(/^#\/(a|edit|new)?\/?(\d+)?/) || [];
    window.scrollTo(0, 0);
    const problem = configError();
    if (problem) return renderMessage(problem, true);
    try {
      if (page === 'a' && id) await renderView(id);
      else if (page === 'edit' && id) await renderEditor(await getArticle(id));
      else if (page === 'new') await renderEditor(null);
      else await renderList();
    } catch (err) {
      renderMessage(`Something went wrong: ${err.message}`, true);
    }
  }
  let currentHash = location.hash || '#/';

  function renderMessage(text, isError) {
    app.replaceChildren(el('div', { class: `notice${isError ? ' error' : ''}`, text }));
  }

  // List: search + category filter, newest first.
  async function renderList() {
    app.replaceChildren(el('div', { class: 'muted', text: 'Loading…' }));
    listCache = await listArticles();
    const params = new URLSearchParams(currentHash.split('?')[1] || '');
    let q = params.get('q') || '', cat = params.get('cat') || '';

    const search = el('input', { type: 'search', class: 'search', placeholder: 'Search titles, tags and text…', value: q });
    const cats = [...new Set(listCache.map(a => a.category || 'General'))].sort((a, b) => a.localeCompare(b));
    const chips = el('div', { class: 'chips' });
    const results = el('div', { class: 'cards' });
    const count = el('div', { class: 'muted count' });

    const draw = () => {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const hits = listCache.filter(a => (!cat || (a.category || 'General') === cat) &&
        words.every(w => `${a.title} ${(a.tags || []).join(' ')} ${a.category} ${a.body_text}`.toLowerCase().includes(w)));
      count.textContent = `${hits.length} article${hits.length === 1 ? '' : 's'}${q || cat ? ' found' : ''}`;
      chips.replaceChildren(...['', ...cats].map(c => el('button', {
        type: 'button', class: `chip${c === cat ? ' active' : ''}`, text: c || 'All',
        onclick: () => { cat = c; sync(); draw(); }
      })));
      results.replaceChildren(...(hits.length ? hits.map(card) : [el('div', { class: 'empty', text: listCache.length
        ? 'No articles match your search.' : 'No articles yet — click “+ New article” to write the first one.' })]));
    };
    const sync = () => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (cat) p.set('cat', cat);
      currentHash = `#/${p.toString() ? '?' + p : ''}`;
      history.replaceState(null, '', currentHash);
    };
    search.oninput = () => { q = search.value; sync(); draw(); };

    const card = (a) => el('a', { class: 'card', href: `#/a/${a.id}` }, [
      el('div', { class: 'card-cat', text: a.category || 'General' }),
      el('h3', { text: a.title }),
      el('p', { class: 'snippet', text: (a.body_text || '').slice(0, 180) + ((a.body_text || '').length > 180 ? '…' : '') }),
      (a.tags || []).length ? el('div', { class: 'tags' }, a.tags.map(t => el('span', { class: 'tag', text: t }))) : null,
      el('div', { class: 'meta', text: `Updated ${when(a.updated_at)}${a.updated_by ? ' by ' + a.updated_by : ''}` })
    ]);

    app.replaceChildren(el('div', { class: 'list-head' }, [search, count]), chips, results);
    draw();
    search.focus();
  }

  async function renderView(id) {
    app.replaceChildren(el('div', { class: 'muted', text: 'Loading…' }));
    const a = await getArticle(id);
    if (!a) return renderMessage('This article no longer exists.', true);
    const body = el('div', { class: 'article-body' });
    body.innerHTML = clean(a.content);
    body.querySelectorAll('img').forEach(img => { img.onclick = () => openLightbox(img.src); });

    const del = el('button', { class: 'btn btn-danger', type: 'button', text: 'Delete', onclick: async () => {
      if (!confirm(`Delete "${a.title}"? This can't be undone.`)) return;
      try {
        await api('DELETE', `?id=eq.${a.id}`);
        toast('Article deleted');
        location.hash = '#/';
      } catch (err) { toast(`Delete failed: ${err.message}`); }
    } });

    app.replaceChildren(el('article', { class: 'article' }, [
      el('div', { class: 'article-actions' }, [
        el('a', { class: 'btn', href: '#/', text: '← All articles' }),
        el('span', { class: 'spacer' }),
        el('a', { class: 'btn btn-primary', href: `#/edit/${a.id}`, text: '✏️ Edit' }),
        del
      ]),
      el('div', { class: 'card-cat', text: a.category || 'General' }),
      el('h1', { text: a.title }),
      el('div', { class: 'meta', text: `Updated ${when(a.updated_at)}${a.updated_by ? ' by ' + a.updated_by : ''}` +
        (a.created_by && a.created_by !== a.updated_by ? ` · created by ${a.created_by}` : '') }),
      (a.tags || []).length ? el('div', { class: 'tags' }, a.tags.map(t => el('a', { class: 'tag', href: `#/?q=${encodeURIComponent(t)}`, text: t }))) : null,
      body
    ]));
    document.title = `${a.title} — Knowledge Base`;
  }

  // ---------- editor ----------
  async function renderEditor(a) {
    if (!listCache) { try { listCache = await listArticles(); } catch { listCache = []; } }
    const editing = !!a;
    const title = el('input', { class: 'title-input', placeholder: 'Article title', value: a?.title || '' });
    const category = el('input', { placeholder: 'Category, e.g. Patching', value: a?.category || '', list: 'kbCats' });
    const cats = el('datalist', { id: 'kbCats' }, [...new Set(listCache.map(x => x.category).filter(Boolean))].map(c => el('option', { value: c })));
    const tags = el('input', { placeholder: 'Tags, comma separated — e.g. windows, edge, va', value: (a?.tags || []).join(', ') });
    const editor = el('div', { class: 'editor article-body', contenteditable: 'true', 'data-placeholder': 'Write here… paste screenshots with Ctrl+V' });
    editor.innerHTML = clean(a?.content || '');
    const status = el('span', { class: 'muted' });
    let dirty = false;
    const markDirty = () => { dirty = true; status.textContent = 'Unsaved changes'; };
    [title, category, tags].forEach(i => i.addEventListener('input', markDirty));
    editor.addEventListener('input', markDirty);
    leaveGuard = () => !dirty || confirm('Leave without saving your changes?');
    window.onbeforeunload = () => (dirty ? true : undefined);

    // Toolbar (execCommand still works in every current browser for contenteditable).
    const cmd = (command, value = null) => { editor.focus(); document.execCommand(command, false, value); markDirty(); };
    const tool = (label, title, fn) => el('button', { type: 'button', class: 'tool', title, text: label,
      onmousedown: (e) => e.preventDefault(), onclick: fn }); // mousedown: keep the editor selection
    const filePick = el('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
    filePick.onchange = async () => { for (const f of filePick.files) await insertImage(f); filePick.value = ''; };
    const toolbar = el('div', { class: 'toolbar' }, [
      tool('B', 'Bold (Ctrl+B)', () => cmd('bold')),
      tool('I', 'Italic (Ctrl+I)', () => cmd('italic')),
      tool('U', 'Underline (Ctrl+U)', () => cmd('underline')),
      el('span', { class: 'sep' }),
      tool('H2', 'Heading', () => cmd('formatBlock', 'h2')),
      tool('H3', 'Sub-heading', () => cmd('formatBlock', 'h3')),
      tool('¶', 'Normal text', () => cmd('formatBlock', 'p')),
      el('span', { class: 'sep' }),
      tool('• List', 'Bulleted list', () => cmd('insertUnorderedList')),
      tool('1. List', 'Numbered list', () => cmd('insertOrderedList')),
      tool('❝', 'Quote / note', () => cmd('formatBlock', 'blockquote')),
      tool('</>', 'Code block', () => cmd('formatBlock', 'pre')),
      el('span', { class: 'sep' }),
      tool('🔗 Link', 'Link selected text', () => {
        const url = (prompt('Link address (https://…):', 'https://') || '').trim();
        if (/^https?:\/\/\S+/i.test(url)) cmd('createLink', url);
      }),
      tool('🖼 Image', 'Insert a picture from a file (or just paste one)', () => filePick.click()),
      tool('⌫ Clear', 'Remove formatting from selection', () => cmd('removeFormat')),
      filePick
    ]);

    // Paste: pictures are compressed and embedded; other content is cleaned of Word/Outlook styling.
    editor.addEventListener('paste', async (e) => {
      const data = e.clipboardData;
      const images = [...data.items].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile());
      const html = data.getData('text/html');
      const hasText = (html && new DOMParser().parseFromString(html, 'text/html').body.textContent.trim()) || data.getData('text/plain').trim();
      if (images.length && !hasText) {
        e.preventDefault();
        for (const f of images) await insertImage(f);
      } else if (html) {
        e.preventDefault();
        cmd('insertHTML', clean(html));
      }
      // plain text only: let the browser paste it
    });
    editor.addEventListener('drop', async (e) => {
      const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      for (const f of files) await insertImage(f);
    });

    async function insertImage(file) {
      status.textContent = 'Adding picture…';
      try {
        const src = await compressImage(file);
        cmd('insertHTML', `<img src="${src}" alt="">`);
        status.textContent = 'Picture added — unsaved changes';
      } catch (err) {
        status.textContent = `Couldn't add the picture (${err.message})`;
      }
    }

    const save = el('button', { class: 'btn btn-primary', type: 'button', text: editing ? 'Save changes' : 'Publish article' });
    save.onclick = async () => {
      const name = getName() || askName();
      if (!name) { status.textContent = 'Please set your name first.'; return; }
      if (!title.value.trim()) { status.textContent = 'Please add a title.'; title.focus(); return; }
      const content = clean(editor.innerHTML);
      // Plain-text copy for search/snippets; a space after each block so words don't run together.
      const holder = el('div');
      holder.innerHTML = content.replace(/(<\/(?:p|div|h[1-6]|li|td|th|pre|blockquote)>|<br\s*\/?>)/gi, '$1 ');
      const row = {
        title: title.value.trim(),
        category: category.value.trim() || 'General',
        tags: tags.value.split(',').map(t => t.trim()).filter(Boolean),
        content,
        body_text: holder.textContent.replace(/\s+/g, ' ').trim(),
        updated_by: name,
        updated_at: new Date().toISOString()
      };
      const size = new Blob([content]).size;
      if (size > 20e6) { status.textContent = `This article is ${fmtBytes(size)} — too big. Remove some pictures.`; return; }
      save.disabled = true;
      status.textContent = `Saving${size > 1e6 ? ` (${fmtBytes(size)})` : ''}…`;
      try {
        let saved;
        if (editing) {
          // Only save if nobody else changed it since it was opened.
          saved = (await api('PATCH', `?id=eq.${a.id}&updated_at=eq.${encodeURIComponent(a.updated_at)}`, row, 'return=representation'))[0];
          if (!saved) {
            const overwrite = confirm('Someone else saved this article while you were editing.\n\nOK = overwrite with your version\nCancel = keep editing (copy your text, then reload to see theirs)');
            if (!overwrite) { status.textContent = 'Not saved — the article was changed by someone else.'; return; }
            saved = (await api('PATCH', `?id=eq.${a.id}`, row, 'return=representation'))[0];
          }
        } else {
          saved = (await api('POST', '', { ...row, created_by: name }, 'return=representation'))[0];
        }
        dirty = false;
        window.onbeforeunload = null;
        toast(editing ? '✔ Saved' : '✔ Published');
        location.hash = `#/a/${saved.id}`;
      } catch (err) {
        status.textContent = `✖ Save failed: ${err.message}`;
      } finally {
        save.disabled = false;
      }
    };
    const cancel = el('a', { class: 'btn', href: editing ? `#/a/${a.id}` : '#/', text: 'Cancel' });

    app.replaceChildren(el('div', { class: 'edit' }, [
      el('h2', { class: 'edit-head', text: editing ? 'Edit article' : 'New article' }),
      title,
      el('div', { class: 'edit-row' }, [category, tags, cats]),
      toolbar,
      editor,
      el('div', { class: 'edit-actions' }, [save, cancel, status])
    ]));
    (editing ? editor : title).focus();
    document.title = `${editing ? 'Edit' : 'New'} — Knowledge Base`;
  }

  // Scale large pictures down and re-encode (WebP, else JPEG) so articles stay small.
  async function compressImage(file) {
    const readAsDataUrl = (blob) => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
    if (file.size <= KEEP_ORIGINAL_BELOW) return readAsDataUrl(file);
    // Decode with createImageBitmap, else an <img>; if both fail or hang, keep the original picture.
    const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    const viaImg = () => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('unsupported picture'));
      img.src = URL.createObjectURL(file);
    });
    let bitmap;
    try { bitmap = await withTimeout(createImageBitmap(file), 8000); } catch {
      try { bitmap = await withTimeout(viaImg(), 8000); } catch { return readAsDataUrl(file); }
    }
    const scale = Math.min(1, MAX_IMAGE_WIDTH / bitmap.width);
    const canvas = el('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let url = canvas.toDataURL('image/webp', 0.85);
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', 0.85);
    return url;
  }

  // ---------- lightbox ----------
  function openLightbox(src) {
    const box = $('lightbox');
    box.querySelector('img').src = src;
    box.hidden = false;
  }
  $('lightbox').onclick = () => { $('lightbox').hidden = true; };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('lightbox').hidden = true; });

  window.addEventListener('hashchange', route);
  renderName();
  renderTheme();
  route();
})();
