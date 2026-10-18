/* Research Library - tablet web viewer (read-only).
   Data comes from data/*.json (made by _build/build_viewer.py); the library's own files are read straight from the
   library folder next to this one. Favorites and notes are kept in this browser (localStorage). */
'use strict';

// ===================================================================== small helpers
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fmt = n => (n || 0).toLocaleString('en-US');
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode / full */ } },
};
async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); }
async function getText(u) { const r = await fetch(u); if (!r.ok) throw new Error(r.status + ' ' + u); return r.text(); }
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
function debounce(f, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; }

// ===================================================================== library data
let ITEMS = [], BYPATH = new Map(), INFO = {}, CATS = {}, LIB = '', LIBPATH = '';
const WARDEE = 'recipes/wardee-traditional-cooking-school';
const DOC_TYPES = new Set(['pdf', 'document', 'wiki-book']);
const TYPE_NAMES = { 'repair-guide': 'Repair guide', 'q-and-a': 'Q & A', 'wikipedia-article': 'Wikipedia', 'web-page': 'Web page',
  'wiki-article': 'Wiki article', 'species-profile': 'Species profile', pdf: 'PDF document', 'web-recipe': 'Web recipe',
  'email-recipe': 'Email recipe', document: 'Document', 'wiki-book': 'Book', video: 'Video', 'facebook-post': 'Facebook recipe',
  'course-module': 'Module overview', course: 'Course', 'recipe-card': 'Recipe card', audio: 'Audio lesson', 'lesson-video': 'Lesson video',
  'local-profile': 'Plant', 'local-wildlife': 'Wildlife', 'local-reference': 'Reference', 'local-pest': 'Pest / problem',
  'growing-guide': 'Growing guide', 'local-overview': 'Overview', 'local-guide': 'Local guide', 'local-map': 'Map' };
const TYPE_ICON = { video: '▶', pdf: '📕', document: '📄', 'wiki-book': '📖', 'repair-guide': '🔧', 'q-and-a': '💬', 'species-profile': '🌿',
  'web-recipe': '🍲', 'email-recipe': '✉', 'facebook-post': '🍲', 'recipe-card': '🗂', course: '🎓', 'course-module': '🎓', audio: '🎧',
  'lesson-video': '▶' };
const TILE = ['#3f6f5a', '#8a5a2b', '#4b6584', '#7a4e6d', '#5c6b2f', '#9b5f3a', '#2f6f73', '#6a5a8e', '#7d6b3c', '#4f7a3a'];
const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|svg)$/i;
const JUNK_CAP = /^[\w.-]+\.(jpe?g|png|gif|webp|svg|tiff?|bmp)$|^[A-Za-z0-9]{10,24}$/i;
const tname = t => TYPE_NAMES[t] || (t || 'Item').replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
const nice = c => CATS[c] || (c || '').replace(/-/g, ' ').replace(/\b\w/g, x => x.toUpperCase());
const isCourse = it => it.p.startsWith(WARDEE);
const encPath = p => p.split('/').map(encodeURIComponent).join('/');
const libURL = p => LIB + encPath(p);
const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
function tileColor(key) { let x = 0; for (const ch of key || '') x = (x * 31 + ch.charCodeAt(0)) >>> 0; return TILE[x % TILE.length]; }

// ===================================================================== favorites + course progress (this tablet only)
const Favs = {
  d: {},
  async load() {
    const saved = LS.get('lv.favs', null);
    if (saved) { this.d = saved; return; }
    try { this.d = await getJSON('data/pc_favorites.json'); } catch { this.d = {}; }   // first launch: start with the PC's
    this.save();
  },
  save() { LS.set('lv.favs', this.d); },
  has(it) { return it.p in this.d; },
  toggle(it) {
    if (this.has(it)) delete this.d[it.p];
    else { const n = new Date(); this.d[it.p] = n.toISOString().slice(0, 10) + ' ' + n.toTimeString().slice(0, 5); }
    this.save(); this.paint(it); Nav.counts();
    Views.favorites && (Views.favorites.dirty = true);
  },
  paint(it) {
    const on = this.has(it);
    $$(`[data-sid="${it.id}"]`).forEach(b => {
      if (b.classList.contains('star')) { b.classList.toggle('on', on); b.textContent = on ? '★' : '☆'; b.setAttribute('aria-label', on ? 'Remove from favorites' : 'Add to favorites'); }
      else { b.classList.toggle('fav-on', on); b.textContent = on ? '★ Favorite' : '☆ Add to favorites'; }
    });
  },
};
/* Notes typed on the tablet: {path: {text, updated}}. PC notes (from Library Manager) are read-only files in the library. */
const TabNotes = {
  d: LS.get('lv.notes', {}),
  get(it) { return (this.d[it.p] || {}).text || ''; },
  has(it) { return !!this.get(it).trim(); },
  set(it, text) {
    if (text.trim()) { const n = new Date(); this.d[it.p] = { text, updated: n.toISOString().slice(0, 10) + ' ' + n.toTimeString().slice(0, 5) }; }
    else delete this.d[it.p];
    LS.set('lv.notes', this.d); this.paint(it);
    Views.favorites && (Views.favorites.dirty = true);
  },
  paint(it) {
    const on = !!it.n || this.has(it);
    $$(`.card[data-id="${it.id}"] .pic`).forEach(pic => {
      const b = pic.querySelector('.badge.note');
      if (on && !b) pic.append(h('span', { class: 'badge note', title: 'Has a note' }, '📝'));
      if (!on && b) b.remove();
    });
  },
};
const Progress = {
  d: LS.get('lv.course', { last: '', seen: {} }),
  viewed(it) { this.d.last = it.p; this.d.seen[it.p] = 1; LS.set('lv.course', this.d); },
  seen(it) { return !!this.d.seen[it.p]; },
};

// ===================================================================== full-text search
const Search = {
  meta: null, shards: new Map(), stop: new Set(),
  async init() {
    try { this.meta = await getJSON('data/search/meta.json'); this.stop = new Set(this.meta.stop); this.split = new Set(this.meta.split); }
    catch { this.meta = null; }
  },
  tokens(q) {
    return (q.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z0-9]+/g) || [])
      .filter(t => t.length > 1 && t.length <= 24 && !this.stop.has(t));
  },
  shardKey(w) {
    const k2 = w.slice(0, 2);
    return this.split.has(k2) ? (w.length > 2 ? w.slice(0, 3) : k2 + '_') : k2;
  },
  async shard(key) {
    if (!this.shards.has(key)) this.shards.set(key, getJSON(`data/search/${key}.json`).catch(() => ({})));
    return this.shards.get(key);
  },
  decode(s, cb) {
    let id = 0;
    for (const part of s.split(',')) { id += parseInt(part.slice(0, -1), 36); cb(id, parseInt(part.slice(-1), 36)); }
  },
  /* -> {scores: Map(id -> score), terms: [matched words]} or null when there is nothing to search for.
     Every word must match (exact word, or its singular/plural); the last word also matches longer words starting with it,
     so results appear while you type. Title words count most. */
  async query(q) {
    if (!this.meta) return null;
    const words = [...new Set(this.tokens(q))];
    if (!words.length) return null;
    let total = null; const terms = [];
    for (let wi = 0; wi < words.length; wi++) {
      const w = words[wi], last = wi === words.length - 1;
      const bases = new Set([w]);
      if (w.length > 3 && w.endsWith('ies')) bases.add(w.slice(0, -3) + 'y');
      if (w.length > 4 && w.endsWith('es')) bases.add(w.slice(0, -2));
      if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) bases.add(w.slice(0, -1));
      const cand = new Map();   // term -> weight
      for (const b of bases) {
        const sh = await this.shard(this.shardKey(b));
        for (const v of [b, b + 's', b + 'es']) if (sh[v] && !cand.has(v)) cand.set(v, 1);
        if (b.endsWith('y')) { const v = b.slice(0, -1) + 'ies'; if (sh[v]) cand.set(v, 1); }
      }
      if (last && w.length >= 3) {
        const sh = await this.shard(this.shardKey(w));
        const longer = Object.keys(sh).filter(t => t.length > w.length && t.startsWith(w) && !cand.has(t));
        longer.sort((a, b) => sh[b].length - sh[a].length);
        for (const t of longer.slice(0, 40)) cand.set(t, 0.6);
      }
      const best = new Map();
      for (const [t, wt] of cand) {
        const sh = await this.shard(this.shardKey(t));
        const s = sh[t]; if (!s) continue;
        terms.push(t);
        const df = (s.match(/,/g) || []).length + 1;
        const idf = Math.log(1 + this.meta.docs / df);
        this.decode(s, (id, sc) => { const v = sc * idf * wt; if (v > (best.get(id) || 0)) best.set(id, v); });
      }
      if (total === null) total = best;
      else { const nx = new Map(); for (const [id, v] of best) if (total.has(id)) nx.set(id, total.get(id) + v); total = nx; }
      if (!total.size) break;
    }
    return { scores: total || new Map(), terms };
  },
};

// ===================================================================== cards
function picture(it) {
  if (it.th) return h('img', { src: `data/thumbs/${it.th}.jpg`, loading: 'lazy', alt: '', decoding: 'async' });
  return h('div', { class: 'tile', style: { background: tileColor(it.m || it.c) } }, TYPE_ICON[it.ty] || '📃');
}
function starBtn(it) {
  const on = Favs.has(it);
  return h('button', { class: 'star' + (on ? ' on' : ''), 'data-sid': it.id, 'aria-label': on ? 'Remove from favorites' : 'Add to favorites',
    onclick: e => { e.preventDefault(); e.stopPropagation(); Favs.toggle(it); } }, on ? '★' : '☆');
}
function metaText(it, dateSort) {
  if (dateSort) return tname(it.ty) + '  •  ' + (it.d || 'date unknown');
  if (it.m) return tname(it.ty) + '  •  ' + it.m.replace(/^Module (\d+):.*/, 'Module $1');
  return tname(it.ty) + (it.c && it.c !== 'recipes' ? '  •  ' + nice(it.c) : '');
}
function card(it, o = {}) {
  const pic = h('div', { class: 'pic' }, picture(it), starBtn(it));
  const npics = it.im || (it.ty === 'recipe-card' ? 1 : 0);
  if (npics > 1 && !o.small) pic.append(h('span', { class: 'badge cam' }, '📷 ' + npics));
  if (it.n || TabNotes.has(it)) pic.append(h('span', { class: 'badge note', title: 'Has a note' }, '📝'));
  if (o.seen && Progress.seen(it)) pic.append(h('span', { class: 'badge seen', title: 'Watched / opened' }, '✓'));
  const body = h('div', { class: 'body' }, h('div', { class: 'ttl' }, o.title || it.t), h('div', { class: 'meta' }, o.meta ?? metaText(it, o.dateSort)));
  if (!o.small) body.append(h('div', { class: 'snip' }, o.snip ?? (it.s || '')));
  return h('a', { class: 'card', href: '#/item/' + it.id, 'data-id': it.id }, pic, body);
}

/* Cards are added in batches as you scroll, so even "all 18,000" opens instantly. */
class LazyGrid {
  constructor(parent, opts = {}) {
    this.opts = opts; this.el = h('div', { class: 'grid' + (opts.small ? ' small' : '') });
    this.sent = h('div', { class: 'sentinel' }); this.note = h('div', { class: 'more-note' });
    parent.append(this.el, this.sent, this.note);
    this.io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) this.more(); }, { rootMargin: '1200px' });
    this.io.observe(this.sent);
    this.list = []; this.n = 0;
  }
  set(list) { this.list = list; this.n = 0; this.el.innerHTML = ''; this.more(); }
  more() {
    if (this.n >= this.list.length || this.el.closest('[hidden]')) return;
    const a = this.n, b = Math.min(this.list.length, a + 60), frag = document.createDocumentFragment(), batch = [];
    for (let k = a; k < b; k++) { const it = this.list[k]; frag.append(card(it, this.opts.cardOpts ? this.opts.cardOpts(it) : {})); batch.push(it); }
    this.el.append(frag); this.n = b;
    this.note.textContent = this.n < this.list.length ? `Showing ${fmt(this.n)} of ${fmt(this.list.length)} - more load as you scroll` : '';
    this.opts.onBatch && this.opts.onBatch(batch, this.el);
  }
}

// ===================================================================== search-result snippets ("…the words in context…")
const TextCache = new Map();
async function itemText(it) {
  if (!it.f) return it.text || '';
  if (TextCache.has(it.p)) return TextCache.get(it.p);
  const p = getText(libURL(it.p)).catch(() => '');
  TextCache.set(it.p, p);
  if (TextCache.size > 80) TextCache.delete(TextCache.keys().next().value);
  return p;
}
function plainMd(s) {
  return s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/^(# .*|\*\*(Source|License|Original|Author|Video|Recipe PDF|Retrieved|Saved)[^\n]*|\*Source.*|Part of .*)$/gim, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]{0,300}>/g, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/[#*_`>|]+/g, ' ').replace(/\s+/g, ' ');
}
function contextHTML(text, terms) {
  if (!terms.length) return null;
  const rx = new RegExp('\\b(' + terms.map(escRe).join('|') + ')\\b', 'i');
  const m = rx.exec(text); if (!m) return null;
  let a = Math.max(0, m.index - 70), b = Math.min(text.length, m.index + 150);
  let s = (a > 0 ? '…' : '') + text.slice(a, b) + (b < text.length ? '…' : '');
  const rxg = new RegExp('\\b(' + terms.map(escRe).join('|') + ')\\b', 'gi');
  return esc(s).replace(rxg, '<mark>$1</mark>');
}
function addContext(batch, gridEl, terms) {
  if (!terms || !terms.length) return;
  const queue = batch.filter(it => it.f || it.text);
  const work = async () => {
    while (queue.length) {
      const it = queue.shift();
      const el = gridEl.querySelector(`.card[data-id="${it.id}"] .snip`);
      if (!el) continue;
      const html = contextHTML(plainMd(await itemText(it)), terms);
      if (html) el.innerHTML = html;
    }
  };
  for (let k = 0; k < 4; k++) work();
}

// ===================================================================== sections
const SECTIONS = {
  recipes: { title: 'Recipes', icon: '🍲', sub: 'Every recipe - web bookmarks, emails, Facebook saves, recipe cards, videos and cookbooks.',
    base: i => i.c === 'recipes' && i.g !== 'course', chips: null, topics: true, unit: 'recipe' },
  local: { title: 'Local Area', icon: '⛰', sub: 'Your local area: pick a topic - plants, wildlife, growing guides, maps and more',
    base: i => i.c === 'local-area', chips: null, topics: true, unit: 'page' },
  docs: { title: 'Documents & Books', icon: '📚', sub: 'PDFs, Word documents and books from every category. Open one to read it or flip through its pages.',
    base: i => DOC_TYPES.has(i.ty) && !isCourse(i), cat: true, chips: null, topics: true, unit: 'document' },
  library: { title: 'Whole Library', icon: '🗂', sub: 'Everything in the library. Search the full text, or narrow it down by category and type.',
    base: i => !isCourse(i), cat: true, type: true, chips: null, topics: true, unit: 'item' },
};
const SORTS = ['Title A–Z', 'Newest added', 'Oldest added'];

// ===================================================================== waypoints + the zoomable map view (Local Area topo maps)
/* data/waypoints.json (from the PC build): the PC's waypoints, and for each map its bounds + a 5x5 grid of where those
   lat/longs fall on the page (fractions of page width/height) - markers are placed by interpolating in that grid. */
const Geo = {
  d: null, byId: new Map(),
  async load() {
    if (!this.d) {
      try { this.d = await getJSON('data/waypoints.json'); } catch { this.d = { waypoints: [], maps: [] }; }
      for (const m of this.d.maps) this.byId.set(m.id, m);
    }
    return this.d;
  },
  map(it) { return it ? this.byId.get(it.id) : null; },
  inside(m, lat, lon) { return lat >= m.s && lat <= m.n && lon >= m.w && lon <= m.e; },
  mapsAt(lat, lon) {   // {detail, regional}: on a shared edge the map whose centre is nearest wins
    const best = {};
    for (const m of (this.d || { maps: [] }).maps) {
      if (!this.inside(m, lat, lon)) continue;
      const dd = Math.abs(lat - (m.s + m.n) / 2) / (m.n - m.s) + Math.abs(lon - (m.w + m.e) / 2) / (m.e - m.w);
      if (!best[m.set] || dd < best[m.set][0]) best[m.set] = [dd, m];
    }
    return { detail: best.detail && best.detail[1], regional: best.regional && best.regional[1] };
  },
  toPage(m, lat, lon) {   // -> [x, y] as fractions of the page
    const N = m.g.length - 1, fi = (lat - m.s) / (m.n - m.s) * N, fj = (lon - m.w) / (m.e - m.w) * N;
    const i = Math.max(0, Math.min(N - 1, Math.floor(fi))), j = Math.max(0, Math.min(N - 1, Math.floor(fj))), u = fi - i, v = fj - j;
    const a = m.g[i][j], b = m.g[i][j + 1], c = m.g[i + 1][j], d = m.g[i + 1][j + 1];
    return [0, 1].map(k => (1 - u) * ((1 - v) * a[k] + v * b[k]) + u * ((1 - v) * c[k] + v * d[k]));
  },
  fromPage(m, fx, fy) {   // page fractions -> [lat, lon]: Newton steps on toPage (the grid is close to linear)
    let lat = (m.s + m.n) / 2, lon = (m.w + m.e) / 2;
    for (let k = 0; k < 12; k++) {
      const [x, y] = this.toPage(m, lat, lon), h = 1e-4;
      const [x1, y1] = this.toPage(m, lat + h, lon), [x2, y2] = this.toPage(m, lat, lon + h);
      const a = (x1 - x) / h, c = (y1 - y) / h, b = (x2 - x) / h, d = (y2 - y) / h, det = a * d - b * c;
      if (!det) break;
      const dx = fx - x, dy = fy - y;
      lat += (d * dx - b * dy) / det; lon += (-c * dx + a * dy) / det;
    }
    return [lat, lon];
  },
  fmt(lat, lon) { return lat.toFixed(5) + ', ' + lon.toFixed(5); },
  link(m, q) { return '#/item/' + m.id + '?' + q; },
  // the offline North America road map (a page inside the library folder; it links back here) - only some libraries have it
  hasNA() { return ITEMS.some(i => i.p.endsWith('/north-america-map.md')); },
  naURL(lat, lon, name) {
    const q = new URLSearchParams({ src: 'tablet', viewer: location.pathname.replace(/[^/]*$/, '') });
    if (lat != null) { q.set('lat', lat.toFixed(6)); q.set('lon', lon.toFixed(6)); if (name) q.set('name', name); }
    return libURL('local-area/maps/north-america/index.html') + '?' + q;
  },
  locate() {   // the tablet's GPS (works offline; the page is on localhost, which the browser allows)
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('This browser cannot read the position.'));
      navigator.geolocation.getCurrentPosition(p => res(p.coords), e => rej(new Error(
        e.code === 1 ? 'Location permission was refused - allow it for this page in the browser settings (and turn Location on).'
          : 'No GPS fix yet - go outside or wait a moment, then try again.')), { enableHighAccuracy: true, timeout: 30000, maximumAge: 15000 });
    });
  },
  async whereAmI(btn) {
    const old = btn.textContent; btn.disabled = true; btn.textContent = 'Finding you…';
    try {
      const c = await this.locate(); await this.load();
      const { detail, regional } = this.mapsAt(c.latitude, c.longitude), m = detail || regional;
      if (!m && this.hasNA()) location.href = this.naURL(c.latitude, c.longitude, `You are here (±${Math.round(c.accuracy)} m)`);   // off the topo maps: the road map
      else if (!m) alert(`You are at ${this.fmt(c.latitude, c.longitude)} - not on any of the library's maps.`);
      else location.hash = this.link(m, 'here=' + c.latitude.toFixed(6) + ',' + c.longitude.toFixed(6) + '&acc=' + Math.round(c.accuracy));
    } catch (e) { alert(e.message); }
    finally { btn.disabled = false; btn.textContent = old; }
  },
};

class WaypointsView {
  constructor() { this.el = h('section', { class: 'view' }); }
  title() { return 'Waypoints'; }
  show() { this.render(); return 'top'; }
  async render() {
    const d = await Geo.load(), el = this.el;
    el.innerHTML = '';
    const here = h('button', { class: 'btn primary', onclick: () => Geo.whereAmI(here) }, '📍 Where am I?');
    el.append(h('p', { class: 'sub' }, 'Your places from the PC - tap one to open the map it is on, zoomed in on it. ',
      'Add or change waypoints in Library Manager on the PC (they come over with the next "Build viewer data"). ',
      '“Where am I?” uses the tablet’s GPS - no internet needed.'),
      h('div', { class: 'rbtns', style: { marginBottom: '14px' } }, here, h('a', { class: 'btn', href: '#/browse/local?topic=' +
        Math.max(0, ((INFO.topics || {}).local || []).findIndex(t => t.n === 'Maps')) }, '🗺 All maps'),
        Geo.hasNA() ? h('a', { class: 'btn', href: Geo.naURL() }, '🌎 North America map') : ''));
    const wps = [...d.waypoints].sort((a, b) => natural(a.name, b.name));
    if (!wps.length) { el.append(h('p', { class: 'empty' }, 'No waypoints yet - add them in Library Manager on the PC (📍 Waypoints).')); return; }
    const list = h('div', { class: 'wplist' });
    for (const w of wps) {
      const { detail, regional } = Geo.mapsAt(w.lat, w.lon), m = detail || regional;
      const mapName = m ? (ITEMS[m.id] || {}).t || '' : 'not on a library map';
      list.append(h('div', { class: 'panel wp' },
        h('div', { class: 'wpname' }, '📍 ', w.name),
        h('div', { class: 'sub', style: { margin: '2px 0 0' } }, Geo.fmt(w.lat, w.lon), ' · ', mapName.replace(/ - USGS 1:([\d,]+) Topographic Map.*/, ' (1:$1)')),
        w.notes ? h('div', { class: 'wpnotes' }, w.notes) : '',
        h('div', { class: 'rbtns', style: { marginTop: '10px' } },
          detail ? h('a', { class: 'btn primary', href: Geo.link(detail, 'wp=' + w.id) }, 'Detailed map') : '',
          regional ? h('a', { class: 'btn', href: Geo.link(regional, 'wp=' + w.id) }, 'Regional map') : '')));
    }
    el.append(list);
  }
}

/* One map page, zoomable: drawn by pdf.js at the zoom level (not just stretched), markers for the waypoints, centred
   on the waypoint / your position it was opened for.  Pinch-zoom of the whole page still works on top of this. */
async function showMap(reader, box, url, m, focus) {
  const gen = reader.gen;
  const status = h('span', { class: 'sub', style: { margin: 0 } }, 'Opening the map…');
  const zl = h('span', { class: 'sub', style: { margin: 0, minWidth: '46px', textAlign: 'center' } });
  const here = h('button', { class: 'btn', onclick: () => locateHere() }, '📍 Where am I?');
  const wrap = h('div', { class: 'mapwrap' }), inner = h('div', { class: 'mapinner' });
  let canvas = h('canvas', {});
  inner.append(canvas); wrap.append(inner);
  // 📏 Measure: tap points, see each leg's straight-line distance and the total
  const meas = { on: false, pts: [] };
  const measBtn = h('button', { class: 'btn', onclick: () => measureToggle() }, '📏 Measure');
  const mTotal = h('div', { class: 'm-total' });
  const mUndo = h('button', { class: 'btn', onclick: () => { meas.pts.pop(); measurePaint(); } }, '↶ Undo last point');
  const mClear = h('button', { class: 'btn', onclick: () => { meas.pts = []; measurePaint(); } }, 'Clear');
  const helpCard = h('div', { class: 'maphelp', hidden: true, onclick: () => { helpCard.hidden = true; } },
    h('b', {}, 'Zooming and moving'),
    h('ul', {}, h('li', {}, '− / + / Fit (toolbar) zoom the map; it stays centred on the same spot'),
      h('li', {}, 'Swipe to move around a zoomed-in map'),
      h('li', {}, 'Pinching enlarges the whole page (toolbar too), not just the map - use − / + for the map'),
      h('li', {}, 'On a PC: Shift + mouse wheel scrolls sideways')),
    h('b', {}, 'On the map'),
    h('ul', {}, h('li', {}, '📍 Where am I? - your GPS position on this map'),
      h('li', {}, '📏 Measure - tap points: each leg’s straight-line distance and the total'),
      Geo.hasNA() ? h('li', {}, '🌎 North America map (above) - the same spot on the road map') : ''),
    h('div', { class: 'sub', style: { margin: 0 } }, 'Tap this card to close it.'));
  const mStrip = h('div', { class: 'mstrip', hidden: true }, mTotal,
    h('div', { class: 'rbtns' }, mUndo, mClear, h('button', { class: 'btn primary', onclick: () => measureToggle(false) }, 'Done')));
  box.append(h('div', { class: 'pdfbar' },
    h('button', { class: 'btn', 'aria-label': 'Zoom out', onclick: () => setZoom(zoom / 1.5) }, '−'), zl,
    h('button', { class: 'btn', 'aria-label': 'Zoom in', onclick: () => setZoom(zoom * 1.5) }, '+'),
    h('button', { class: 'btn', onclick: () => setZoom(1) }, 'Fit'), here, measBtn,
    h('button', { class: 'btn', 'aria-label': 'How to zoom and move', onclick: () => { helpCard.hidden = !helpCard.hidden; } }, '?'),
    status, h('span', { style: { flex: 1 } }),
    h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, 'Open in another app')), helpCard, mStrip, wrap);
  let render;
  if (m.img) {   // pre-drawn by the PC build (data/maps): instant, and zooming just enlarges it
    const img = h('img', { alt: '', draggable: false });
    const ok = await new Promise(res => { img.onload = () => res(true); img.onerror = () => res(false); img.src = m.img; });
    if (!ok) { status.textContent = 'The map picture could not be loaded.'; return; }
    canvas.replaceWith(img);
    if (gen !== reader.gen || !box.isConnected) return;
    inner.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
    status.textContent = '';
    render = async () => { };
  } else {
    let lib, doc;
    try { lib = await loadPdfJs(); doc = await lib.getDocument({ url }).promise; }
    catch (e) { status.textContent = 'This map could not be shown here - try "Open in another app".'; return; }
    if (gen !== reader.gen || !box.isConnected) { doc.destroy(); return; }
    reader.pdf = doc;
    const page = await doc.getPage(1), v0 = page.getViewport({ scale: 1 });
    inner.style.aspectRatio = `${v0.width} / ${v0.height}`;
    let task = null;
    render = async () => {   // pdf.js: drawn again at each zoom level (slow for these big GeoPDFs)
      const cssW = inner.clientWidth, dpr = Math.min(window.devicePixelRatio || 1, 2);
      let scale = cssW / v0.width * dpr;
      const maxPx = 16e6;   // keep the canvas within what a tablet browser will draw
      if (v0.width * v0.height * scale * scale > maxPx) scale = Math.sqrt(maxPx / (v0.width * v0.height));
      const vp = page.getViewport({ scale });
      if (task) { try { task.cancel(); } catch { } }
      const c = h('canvas', {}); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      status.textContent = 'Drawing…';
      const t = task = page.render({ canvasContext: c.getContext('2d'), viewport: vp });
      try { await t.promise; } catch { return; }
      if (gen !== reader.gen || t !== task) return;
      canvas.replaceWith(c); canvas = c; status.textContent = '';
    };
  }
  let zoom = focus ? 3 : 1, you = null;
  const markers = h('div', { class: 'mapmarks' }); inner.append(markers);
  const SVGNS = 'http://www.w3.org/2000/svg';
  const mSvg = document.createElementNS(SVGNS, 'svg'), mLine = document.createElementNS(SVGNS, 'polyline'), mHalo = document.createElementNS(SVGNS, 'polyline');
  mSvg.setAttribute('class', 'mline'); mSvg.setAttribute('viewBox', '0 0 1 1'); mSvg.setAttribute('preserveAspectRatio', 'none');
  for (const [l, c, w] of [[mHalo, '#fff', 7], [mLine, '#c2185b', 4]]) {
    l.setAttribute('fill', 'none'); l.setAttribute('stroke', c); l.setAttribute('stroke-width', w);
    l.setAttribute('vector-effect', 'non-scaling-stroke'); l.setAttribute('stroke-linejoin', 'round'); mSvg.append(l);
  }
  const mMarks = h('div', { class: 'mapmarks' });
  inner.append(mSvg, mMarks);
  const km = (a, b) => { const r = Math.PI / 180, x = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2;
    return 2 * 6371.0088 * Math.asin(Math.min(1, Math.sqrt(x))); };
  const dist = k => { const mi = k * 0.621371; return mi < 0.2 ? `${Math.round(mi * 5280).toLocaleString()} ft (${Math.round(k * 1000).toLocaleString()} m)`
    : `${mi < 10 ? mi.toFixed(2) : mi.toFixed(1)} mi (${mi < 10 ? k.toFixed(2) : k.toFixed(1)} km)`; };
  function measurePaint() {
    const xy = meas.pts.map(p => Geo.toPage(m, p[0], p[1]));
    const pts = xy.map(([x, y]) => `${x},${y}`).join(' ');
    mLine.setAttribute('points', pts); mHalo.setAttribute('points', pts);
    mMarks.innerHTML = '';
    xy.forEach(([x, y]) => mMarks.append(h('div', { class: 'mpt', style: { left: x * 100 + '%', top: y * 100 + '%' } })));
    let total = 0;
    for (let k = 1; k < xy.length; k++) {
      const d = km(meas.pts[k - 1], meas.pts[k]); total += d;
      mMarks.append(h('div', { class: 'mleg', style: { left: (xy[k - 1][0] + xy[k][0]) * 50 + '%', top: (xy[k - 1][1] + xy[k][1]) * 50 + '%' } }, dist(d)));
    }
    mStrip.hidden = !meas.on && !meas.pts.length;
    mTotal.textContent = meas.pts.length < 2 ? 'Tap points on the map to measure straight-line distances.'
      : `📏 Total ${dist(total)} · ${meas.pts.length - 1} leg${meas.pts.length > 2 ? 's' : ''}`;
    mUndo.disabled = mClear.disabled = !meas.pts.length;
  }
  function measureToggle(on = !meas.on) {
    meas.on = on; measBtn.classList.toggle('on', on); measBtn.textContent = on ? '📏 Measuring…' : '📏 Measure';
    inner.style.cursor = on ? 'crosshair' : ''; measurePaint();
  }
  inner.addEventListener('click', e => {   // a tap (not a drag) while measuring adds a point
    if (!meas.on) return;
    const r = inner.getBoundingClientRect();
    meas.pts.push(Geo.fromPage(m, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
    measurePaint();
  });
  const pin = (x, y, label, cls) => {
    const p = h('div', { class: 'mappin ' + (cls || ''), style: { left: (x * 100) + '%', top: (y * 100) + '%' } }, h('span', {}, label));
    markers.append(p); return p;
  };
  const drawPins = () => {
    markers.innerHTML = '';
    for (const w of Geo.d.waypoints) {
      const [x, y] = Geo.toPage(m, w.lat, w.lon);
      if (x < 0 || x > 1 || y < 0 || y > 1) continue;
      const p = pin(x, y, w.name, focus && focus.id === w.id ? 'focus' : '');
      if (w.notes) p.title = w.notes;
    }
    if (you) { const [x, y] = Geo.toPage(m, you.lat, you.lon); pin(x, y, 'You are here' + (you.acc ? ` (±${you.acc} m)` : ''), 'you'); }
  };
  const centre = () => [(wrap.scrollLeft + wrap.clientWidth / 2) / inner.clientWidth, (wrap.scrollTop + wrap.clientHeight / 2) / inner.clientHeight];
  reader.mapView = () => wrap.isConnected && inner.clientWidth ? centre() : null;   // for the North America map button
  const scrollTo = (fx, fy) => { wrap.scrollLeft = fx * inner.clientWidth - wrap.clientWidth / 2; wrap.scrollTop = fy * inner.clientHeight - wrap.clientHeight / 2; };
  const setZoom = async (z, at) => {
    z = Math.max(1, Math.min(m.img ? 5 : 8, z));   // the picture gets soft past ~5x
    const [fx, fy] = at || centre();
    zoom = z; zl.textContent = z === 1 ? 'Fit' : Math.round(z * 100) + '%';
    inner.style.width = (z * 100) + '%';
    scrollTo(fx, fy);
    await render();
  };
  const locateHere = async () => {
    const old = here.textContent; here.disabled = true; here.textContent = 'Finding you…';
    try {
      const c = await Geo.locate();
      you = { lat: c.latitude, lon: c.longitude, acc: Math.round(c.accuracy) };
      if (!Geo.inside(m, you.lat, you.lon)) {
        const o = Geo.mapsAt(you.lat, you.lon), other = o.detail || o.regional;
        if (other && confirm('You are not on this map. Open the map you are on?')) { location.hash = Geo.link(other, `here=${you.lat.toFixed(6)},${you.lon.toFixed(6)}&acc=${you.acc}`); return; }
        if (!other && !Geo.hasNA()) alert(`You are at ${Geo.fmt(you.lat, you.lon)} - not on any of the library's maps.`);
        else if (!other && confirm(`You are at ${Geo.fmt(you.lat, you.lon)} - not on any topo map in the library. Open the North America road map there?`)) {
          location.href = Geo.naURL(you.lat, you.lon, `You are here (±${you.acc} m)`); return; }
        you = null; return;
      }
      drawPins(); setZoom(Math.max(zoom, 3), Geo.toPage(m, you.lat, you.lon));
    } catch (e) { alert(e.message); }
    finally { here.disabled = false; here.textContent = old; }
  };
  if (focus && focus.here) you = focus;
  drawPins();
  await setZoom(zoom, focus ? Geo.toPage(m, focus.lat, focus.lon) : Geo.toPage(m, (m.s + m.n) / 2, (m.w + m.e) / 2));   // the middle of the map, not the title strip
  if (focus) window.scrollTo(0, window.scrollY + box.getBoundingClientRect().top - 64);   // map fills the screen, under the header
}

// ===================================================================== navigation (sidebar)
// Sections that only some libraries have (a course, a local area, maps) are left out when this library has none.
function hasSection(key) {
  switch (key) {
    case 'course': return ITEMS.some(isCourse);
    case 'waypoints': return !!(Geo.d && (Geo.d.waypoints.length || Geo.d.maps.length));
    case 'browse:recipes': case 'browse:local': case 'browse:docs': return ITEMS.some(SECTIONS[key.slice(7)].base);
    default: return true;
  }
}
const Nav = {
  build() {
    const n = $('#nav');
    const link = (href, ic, label, key) => h('a', { href, 'data-key': key }, h('span', { class: 'ic' }, ic), label, h('span', { class: 'n', 'data-count': key }));
    const links = [['#/browse/recipes', '🍲', 'Recipes', 'browse:recipes'], ['#/course', '🎓', 'Cooking School', 'course'],
      ['#/browse/local', '⛰', 'Local Area', 'browse:local'], ['#/waypoints', '📍', 'Waypoints', 'waypoints'], ['#/browse/docs', '📚', 'Documents & Books', 'browse:docs'],
      ['#/browse/library', '🗂', 'Whole Library', 'browse:library']].filter(l => hasSection(l[3]));
    n.append(link('#/', '⌂', 'Home', 'home'), h('div', { class: 'grp' }, 'BROWSE'), link('#/favorites', '★', 'Favorites', 'favorites'),
      ...links.map(l => link(...l)));
    n.addEventListener('click', e => { if (e.target.closest('a')) document.body.classList.remove('drawer'); });
    $('#menu').onclick = () => document.body.classList.toggle('drawer');
    $('#scrim').onclick = () => document.body.classList.remove('drawer');
    this.counts();
  },
  counts() { const c = $('[data-count="favorites"]'); if (c) c.textContent = Object.keys(Favs.d).length || ''; },
  mark(key) { $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.key === key)); },
};

// ===================================================================== views
const Views = {};
class HomeView {
  constructor() { this.el = h('section', { class: 'view' }); this.built = false; }
  title() { return 'Research Library'; }
  show() {
    if (this.built && !this.dirty) return 'keep';
    this.built = true; this.dirty = false; this.el.innerHTML = '';
    const items = ITEMS.filter(i => !isCourse(i)), course = ITEMS.filter(isCourse);
    const by = {}; for (const i of items) by[i.c] = (by[i.c] || 0) + 1;
    const docs = items.filter(i => DOC_TYPES.has(i.ty)).length, lessons = course.filter(i => i.ty === 'lesson-video' || i.ty === 'audio').length;
    const q = h('input', { type: 'search', placeholder: 'Search the whole library (every word of every page)…', enterkeyhint: 'search', 'aria-label': 'Search' });
    const go = () => { if (q.value.trim()) location.hash = '#/browse/library?q=' + encodeURIComponent(q.value.trim()); };
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { q.blur(); go(); } });
    const panel = h('div', { class: 'panel hero' },
      h('div', { class: 'search' }, h('span', {}, '🔍'), q, h('button', { class: 'btn primary', onclick: go }, 'Search')),
      h('div', { class: 'stats' }, ...[[items.length, 'items in the library'], [by.recipes, 'recipes'], [docs, 'documents & books'],
        ...(lessons ? [[lessons, 'Cooking School lessons']] : []), [Object.keys(Favs.d).length, 'favorites']].map(([n, t]) => h('div', {}, h('b', {}, fmt(n)), h('span', {}, t)))));
    this.el.append(panel);
    const cont = continueLink();
    const tiles = h('div', { class: 'tiles' },
      ...[['#/browse/recipes', '🍲', 'Recipes', fmt(ITEMS.filter(SECTIONS.recipes.base).length) + ' recipes', 'browse:recipes'],
        ['#/course', '🎓', 'Cooking School', fmt(lessons) + ' lessons & audio', 'course'],
        ['#/browse/local', '⛰', 'Local Area', fmt(ITEMS.filter(SECTIONS.local.base).length) + ' pages', 'browse:local'],
        ['#/browse/docs', '📚', 'Documents & Books', fmt(docs) + ' documents', 'browse:docs'],
        ['#/browse/library', '🗂', 'Whole Library', fmt(items.length) + ' items'],
        ['#/favorites', '★', 'Favorites', fmt(Object.keys(Favs.d).length) + ' starred']]
        .filter(t => hasSection(t[4])).map(([href, ic, t, s]) => h('a', { class: 'stile', href }, h('span', { class: 'ic' }, ic), h('div', {}, h('b', {}, t), h('span', {}, s)))));
    this.el.append(h('h2', { class: 'sec' }, 'Browse'), cont || '', tiles);
    const recent = [...items].sort((a, b) => (b.mt || 0) - (a.mt || 0)).slice(0, 12);
    this.el.append(h('h2', { class: 'sec' }, 'Recently added'), h('div', { class: 'grid small' }, recent.map(it => card(it, { small: true }))));
    const cats = Object.keys(CATS).sort((a, b) => nice(a).localeCompare(nice(b)));
    this.el.append(h('h2', { class: 'sec' }, 'Categories', h('small', {}, `${cats.length} categories`)),
      h('div', { class: 'panel cats' }, cats.map(c => h('a', { href: '#/browse/library?cat=' + encodeURIComponent(c) }, nice(c), h('span', {}, fmt(by[c] || 0))))));
    const arch = INFO.archives || [];
    if (arch.length) {
      const big = [...arch].sort((a, b) => b.gb - a.gb);
      this.el.append(h('h2', { class: 'sec' }, 'Offline Archives', h('small', {}, `${arch.length} archives · open them in the Kiwix app`)),
        h('div', { class: 'panel' },
          h('p', { class: 'sub' }, 'Wikipedia, Project Gutenberg, iFixit, MedlinePlus, WikEM, Stack Exchange and more are on the SD card in the ',
            h('b', {}, 'Kiwix'), ' folder (if they were copied). Open them with the free Kiwix app: in Kiwix, add the files from the card\'s Kiwix folder ',
            '(see the README). They work fully offline, with search and pictures.'),
          h('div', { class: 'cats' }, big.map(a => h('span', { class: 'archive' }, a.n + (a.d ? ' (' + a.d + ')' : ''), h('span', {}, a.gb + ' GB'))))));
    }
    this.el.append(h('p', { class: 'sub', style: { marginTop: '18px' } }, `Library data built ${INFO.built || '?'} • ${fmt(INFO.items)} items. Favorites are saved on this tablet.`));
    return 'top';
  }
}

function continueLink() {
  const it = BYPATH.get(Progress.d.last);
  if (!it || !Course.where.has(it.id)) return null;
  return h('a', { class: 'continue', href: '#/item/' + it.id }, h('span', { style: { fontSize: '22px' } }, '▶'),
    h('div', {}, h('b', {}, 'Continue the Cooking School'), h('small', {}, Course.disp.get(it.id) || it.t)));
}

class BrowseView {
  constructor(key) {
    this.key = key; this.sk = key; /* section name - the router later sets .key to 'browse:<name>' */
    this.sec = SECTIONS[key]; this.items = ITEMS.filter(this.sec.base); this.gen = 0; this.state = null;
    this.el = h('section', { class: 'view' });
    this.el.append(h('p', { class: 'sub' }, this.sec.sub));
    this.q = h('input', { type: 'search', placeholder: `Search ${this.sec.title.toLowerCase()} - every word…`, enterkeyhint: 'search', 'aria-label': 'Search' });
    const clear = h('button', { class: 'clear', 'aria-label': 'Clear search', onclick: () => { this.q.value = ''; this.setState({ q: '' }); } }, '✕');
    const bar = h('div', { class: 'bar' }, h('div', { class: 'search' }, h('span', {}, '🔍'), this.q, clear));
    const onType = debounce(() => this.setState({ q: this.q.value.trim() }), 450);
    this.q.addEventListener('input', onType);
    this.q.addEventListener('keydown', e => { if (e.key === 'Enter') { this.q.blur(); this.setState({ q: this.q.value.trim() }); } });
    if (this.sec.cat) {
      this.catSel = h('select', { 'aria-label': 'Category', onchange: () => this.setState({ cat: this.catSel.value }) },
        h('option', { value: '' }, 'All categories'), ...Object.keys(CATS).sort((a, b) => nice(a).localeCompare(nice(b))).map(c => h('option', { value: c }, nice(c))));
      bar.append(this.catSel);
    }
    if (this.sec.type) {
      const types = [...new Set(this.items.map(i => i.ty).filter(Boolean))].sort((a, b) => tname(a).localeCompare(tname(b)));
      this.typeSel = h('select', { 'aria-label': 'Type', onchange: () => this.setState({ type: this.typeSel.value }) },
        h('option', { value: '' }, 'All types'), ...types.map(t => h('option', { value: t }, tname(t))));
      bar.append(this.typeSel);
    }
    this.sortSel = h('select', { 'aria-label': 'Sort', onchange: () => { const s = LS.get('lv.sort', {}); s[this.key] = this.sortSel.value; LS.set('lv.sort', s); this.refilter(); window.scrollTo(0, 0); } });
    bar.append(this.sortSel);
    this.el.append(bar);
    this.chipBox = h('div', { class: 'chips' });
    if (this.sec.chips) {
      for (const [name] of this.sec.chips) this.chipBox.append(h('button', { class: 'chip', 'data-chip': name, onclick: () => this.setState({ chip: name === this.sec.chips[0][0] ? '' : name }) }, name));
      this.el.append(this.chipBox);
    }
    this.count = h('p', { class: 'count' }, '');
    this.el.append(this.count);
    this.grid = new LazyGrid(this.el, { cardOpts: () => ({ dateSort: this.sortSel.value && this.sortSel.value !== SORTS[0] && this.sortSel.value !== 'best' }),
      onBatch: (batch, el) => addContext(batch, el, this.terms) });
  }
  title() { return this.sec.title; }
  show(parts, params) {
    const st = { q: params.get('q') || '', cat: params.get('cat') || '', type: params.get('type') || '', chip: params.get('chip') || '' };
    if (this.state && JSON.stringify(st) === JSON.stringify(this.state)) return 'keep';
    this.state = st; this.paintControls(); this.refilter();
    return 'top';
  }
  setState(ch) {
    this.state = { ...this.state, ...ch };
    const p = new URLSearchParams(); for (const [k, v] of Object.entries(this.state)) if (v) p.set(k, v);
    history.replaceState(null, '', '#/browse/' + this.sk + (p.toString() ? '?' + p : ''));
    this.paintControls(); this.refilter(); window.scrollTo(0, 0);
  }
  paintControls() {
    const s = this.state;
    if (document.activeElement !== this.q) this.q.value = s.q;
    if (this.catSel) this.catSel.value = s.cat;
    if (this.typeSel) this.typeSel.value = s.type;
    $$('.chip', this.chipBox).forEach(c => c.classList.toggle('on', c.dataset.chip === (s.chip || (this.sec.chips && this.sec.chips[0][0]))));
    const saved = LS.get('lv.sort', {})[this.key] || SORTS[0];
    const opts = (s.q ? [['best', 'Best match']] : []).concat(SORTS.map(x => [x, x]));
    this.sortSel.innerHTML = ''; opts.forEach(([v, t]) => this.sortSel.append(h('option', { value: v }, 'Sort: ' + t)));
    this.sortSel.value = s.q ? (this.sortChosenWithQ ? saved : 'best') : saved;
    this.sortSel.onfocus = () => { this.sortChosenWithQ = true; };
  }
  async refilter() {
    const gen = ++this.gen, s = this.state;
    const chipF = this.sec.chips && s.chip ? (this.sec.chips.find(c => c[0] === s.chip) || [])[1] : null;
    let list = this.items.filter(i => (!s.cat || i.c === s.cat) && (!s.type || i.ty === s.type) && (!chipF || chipF(i)));
    const filtered = list.length;
    let sort = this.sortSel.value, scores = null;
    this.terms = null;
    if (s.q) {
      this.count.textContent = 'Searching…';
      const res = await Search.query(s.q);
      if (gen !== this.gen) return;
      if (res) { scores = res.scores; this.terms = res.terms; list = list.filter(i => scores.has(i.id)); }
      else { const ws = s.q.toLowerCase().split(/\s+/); list = list.filter(i => ws.every(w => (i.t + ' ' + (i.pub || '')).toLowerCase().includes(w))); }
    }
    if (sort === 'best' && scores) list.sort((a, b) => scores.get(b.id) - scores.get(a.id) || natural(a.t, b.t));
    else if (sort === SORTS[1] || sort === SORTS[2]) {
      const dated = list.filter(i => i.d).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : natural(a.t, b.t)) * (sort === SORTS[1] ? -1 : 1));
      list = dated.concat(list.filter(i => !i.d));
    }
    const total = this.items.length;
    let txt = s.q ? `${fmt(list.length)} match${list.length === 1 ? '' : 'es'} for “${s.q}”` + (filtered !== total ? ` (in ${fmt(filtered)} items)` : '')
      : (list.length !== total ? `${fmt(list.length)} of ${fmt(total)} items` : `${fmt(total)} items`);
    if (!list.length) txt += '  -  nothing matches';
    else if (sort === SORTS[1] || sort === SORTS[2]) { const u = list.filter(i => !i.d).length; txt += `  •  ${sort === SORTS[1] ? 'newest' : 'oldest'} first` + (u ? ` (${fmt(u)} with no known date at the end)` : ''); }
    this.count.textContent = txt;
    this.grid.set(list);
  }
}

// --------------------------------------------------------------------- topic tiles first (same tiles and buttons as Library Manager:
// Recipes, Documents & Books, Whole Library, Local Area). Items carry tp = {section: [[tile indexes], ['tile.button', ...]]}.
class TopicBrowseView extends BrowseView {
  constructor(key) {
    super(key);
    this.all = this.items;
    this.topics = ((INFO.topics || {})[this.sk] || []);
    this.tiles = h('div', { class: 'tiles' });
    this.el.insertBefore(this.tiles, this.count);
    this.el.insertBefore(this.chipBox, this.count);
  }
  show(parts, params) {
    const st = { q: params.get('q') || '', cat: params.get('cat') || '', type: params.get('type') || '', chip: params.get('chip') || '',
      topic: params.get('topic') || '' };
    if (this.state && JSON.stringify(st) === JSON.stringify(this.state)) return 'keep';
    this.state = st; this.paintControls(); this.refilter();
    return 'top';
  }
  mark(i) { return (i.tp && i.tp[this.sk]) || [[], []]; }
  inTopic(i, t) { return this.mark(i)[0].includes(t); }
  paintControls() {
    const s = this.state, t = s.topic === '' ? -1 : +s.topic;
    if (t >= 0 && this.topics[t]) {
      const subs = this.topics[t].subs.map((n, si) => [n, i => (this.mark(i)[1] || []).includes(t + '.' + si)])
        .filter(([n, f]) => this.all.some(i => this.inTopic(i, t) && f(i)));
      this.sec.chips = subs.length ? [['All', null]].concat(subs) : null;
    } else this.sec.chips = null;
    this.chipBox.innerHTML = '';
    if (t >= 0 || s.cat) this.chipBox.append(h('button', { class: 'chip', onclick: () => { location.hash = '#/browse/' + this.sk; } }, '◀ All topics'),
      h('b', { style: { margin: '0 8px' } }, t >= 0 ? (this.topics[t] || {}).n || '' : nice(s.cat)));
    if (this.sec.chips) for (const [name] of this.sec.chips)
      this.chipBox.append(h('button', { class: 'chip', 'data-chip': name, onclick: () => this.setState({ chip: name === 'All' ? '' : name }) }, name));
    super.paintControls();
  }
  refilter() {
    const s = this.state, t = s.topic === '' ? -1 : +s.topic;
    const tiles = t < 0 && !s.q && !s.cat && !s.type;
    this.tiles.hidden = !tiles; this.grid.el && (this.grid.el.hidden = tiles);
    if (tiles) {
      this.tiles.innerHTML = '';
      this.topics.forEach((tp, ti) => {
        const mine = this.all.filter(i => this.inTopic(i, ti));
        if (!mine.length) return;
        const href = mine.length === 1 ? '#/item/' + mine[0].id : null;
        this.tiles.append(h('a', { class: 'stile', href: href || 'javascript:void 0', onclick: href ? null : (e => { e.preventDefault(); location.hash = '#/browse/' + this.sk + '?topic=' + ti; }) },
          h('span', { class: 'ic' }, tp.ic), h('div', {}, h('b', {}, tp.n), h('span', {}, fmt(mine.length) + ' ' + (this.sec.unit || 'item') + (mine.length === 1 ? '' : 's') + ' · ' + tp.b))));
      });
      this.count.textContent = `Pick a topic, or search all of ${this.sec.title} above.`;
      this.grid.set([]);
      return;
    }
    this.items = t >= 0 ? this.all.filter(i => this.inTopic(i, t)) : this.all;
    return super.refilter();
  }
}

// --------------------------------------------------------------------- Cooking School (course order, same as Library Manager)
const Course = {
  mods: [], seq: [], where: new Map(), disp: new Map(),
  build(raw) {
    const I = id => ITEMS[id];
    this.mods = raw.map(m => ({ ...m, page: m.page != null ? I(m.page) : null,
      ...Object.fromEntries(['materials', 'start', 'more', 'audio', 'qa', 'other'].map(k => [k, m[k].map(I)])),
      lessons: m.lessons.map(ls => ({ ...ls, parts: ls.parts.map(I) })) }));
    const add = (it, m, ctx) => { this.where.set(it.id, [this.seq.length, m, ctx]); this.seq.push(it); };
    for (const m of this.mods) {
      m.materials.forEach(it => add(it, m, 'Course materials'));
      m.start.forEach(it => add(it, m, 'Start here'));
      for (const ls of m.lessons) {
        const n = ls.parts.length;
        ls.parts.forEach((it, k) => {
          add(it, m, `Lesson ${ls.num} · ${ls.title}` + (n > 1 ? `  (part ${k + 1} of ${n})` : ''));
          this.disp.set(it.id, ls.title + (n > 1 || ls.caps[k] === 'Audio' ? ' — ' + ls.caps[k] : ''));
        });
      }
      for (const [k, name] of [['more', 'More videos'], ['audio', 'Audio'], ['qa', 'Q&A and bonus videos'], ['other', 'Other files']])
        m[k].forEach(it => add(it, m, name));
    }
  },
  neighbors(it) {
    const w = this.where.get(it.id); if (!w) return null;
    const [i, m, ctx] = w;
    return { prev: this.seq[i - 1] || null, next: this.seq[i + 1] || null, ctx: (m.num ? `Module ${m.num} · ` : '') + m.short + '  ›  ' + ctx };
  },
};

class CourseView {
  constructor() {
    this.el = h('section', { class: 'view' }); this.cur = null; this.q = ''; this.gen = 0;
    this.el.append(h('p', { class: 'sub' }, "Wardee Harmon's Traditional Cooking School, in its learning order: work through the modules top to bottom, lesson by lesson."));
    const wrap = h('div', { class: 'course' });
    this.outline = h('div', { class: 'panel outline' });
    this.right = h('div', {});
    wrap.append(this.outline, this.right);
    this.input = h('input', { type: 'search', placeholder: 'Search the course…', enterkeyhint: 'search', 'aria-label': 'Search the course' });
    const run = debounce(() => { this.q = this.input.value.trim(); this.render(); window.scrollTo(0, 0); }, 400);
    this.input.addEventListener('input', run);
    this.input.addEventListener('keydown', e => { if (e.key === 'Enter') this.input.blur(); });
    this.contBox = h('div', {});
    this.modsel = h('div', { class: 'chips modsel' });
    this.el.append(h('div', { class: 'bar' }, h('div', { class: 'search' }, h('span', {}, '🔍'), this.input)), this.contBox, this.modsel, wrap);
    this.buildOutline();
  }
  title() { return 'Cooking School'; }
  buildOutline() {
    const o = this.outline; o.innerHTML = ''; this.rows = new Map();
    o.append(h('div', { class: 'olabel' }, 'MODULES'));
    let extras = false;
    for (const m of Course.mods) {
      if (!m.num && !extras) { extras = true; o.append(h('div', { class: 'olabel' }, 'EXTRAS')); }
      const r = h('button', { class: 'modrow', onclick: () => this.select(m, true) }, h('span', { class: 'num' }, m.num || '•'),
        h('span', { class: 'nm' }, m.short), h('span', { class: 'ct' }, m.lessons.length || m.materials.length));
      o.append(r); this.rows.set(m.dir, r);
      const chip = h('button', { class: 'chip', 'data-dir': m.dir, onclick: () => this.select(m, true) }, (m.num ? m.num + '. ' : '') + m.short);
      this.modsel.append(chip);
    }
    o.append(h('p', { class: 'sub', style: { fontSize: '12px', margin: '10px 8px 0' } }, 'Numbers on the right = lessons (or eBooks for the extras).'));
  }
  select(m, user) {
    this.cur = m;
    if (user) { this.q = ''; this.input.value = ''; history.replaceState(null, '', '#/course/' + encodeURIComponent(m.dir)); }
    this.render();
    if (user) window.scrollTo(0, 0);
  }
  show(parts) {
    this.contBox.innerHTML = ''; const c = continueLink(); if (c) this.contBox.append(c);
    const want = parts[1] ? Course.mods.find(m => m.dir === decodeURIComponent(parts[1])) : null;
    const back = this.lastOpened; this.lastOpened = null;
    if (back && Course.where.has(back.id) && !this.q) {   // back from the reader: show where Next/Previous got to
      const m = Course.where.get(back.id)[1];
      if (m !== this.cur) { this.cur = m; this.render(); history.replaceState(null, '', '#/course/' + encodeURIComponent(m.dir)); }
      else this.refreshSeen();
      requestAnimationFrame(() => {
        const el = this.right.querySelector(`.card[data-id="${back.id}"]`);
        if (el) { const r = el.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center' }); }
      });
      return 'restore-then';
    }
    if (want && want !== this.cur) { this.cur = want; this.render(); return 'top'; }
    if (!this.cur) { this.cur = Course.mods[0]; this.render(); return 'top'; }
    this.refreshSeen();
    return 'keep';
  }
  refreshSeen() {
    $$('.card[data-id]', this.right).forEach(c => {
      const it = ITEMS[+c.dataset.id];
      if (Progress.seen(it) && !c.querySelector('.badge.seen') && Course.where.has(it.id)) c.querySelector('.pic').append(h('span', { class: 'badge seen' }, '✓'));
    });
  }
  paintOutline() {
    for (const [d, r] of this.rows) r.classList.toggle('on', !this.q && this.cur && d === this.cur.dir);
    $$('.chip', this.modsel).forEach(c => c.classList.toggle('on', !this.q && this.cur && c.dataset.dir === this.cur.dir));
    const on = $('.chip.on', this.modsel); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
  tiles(items, caps) {
    return h('div', { class: 'grid small' }, items.map((it, k) => {
      const title = caps ? caps[k] : (Course.disp.get(it.id) || it.t), meta = it.ty === 'lesson-video' ? 'Video' : tname(it.ty);
      return card(it, { small: true, seen: true, title, meta: title === meta || (title === 'Audio' && it.ty === 'audio') ? '' : meta });
    }));
  }
  async render() {
    this.paintOutline();
    const r = this.right; r.innerHTML = '';
    if (this.q) return this.renderSearch(++this.gen);
    const m = this.cur; if (!m) return;
    const nv = m.lessons.reduce((s, ls) => s + ls.parts.filter(p => p.ty !== 'audio').length, 0) + m.more.length + m.qa.length + m.start.length;
    const na = m.lessons.reduce((s, ls) => s + ls.parts.filter(p => p.ty === 'audio').length, 0) + m.audio.length;
    const bits = [m.lessons.length && `${m.lessons.length} lessons`, nv && `${nv} videos`, na && `${na} audio`, m.materials.length && `${m.materials.length} eBooks & handouts`].filter(Boolean);
    const first = (m.materials.length ? m.materials : m.start.length ? m.start : m.lessons.length ? m.lessons[0].parts : [])[0];
    r.append(h('div', { class: 'panel modhead' }, m.num ? h('div', { class: 'kick' }, 'MODULE ' + m.num) : '', h('h2', {}, m.short),
      h('div', { class: 'sub', style: { margin: 0 } }, bits.join('  •  ')),
      h('div', { class: 'rbtns', style: { marginTop: '12px' } }, first && m.lessons.length ? h('a', { class: 'btn primary', href: '#/item/' + first.id }, '▶ Start this module') : '',
        m.page ? h('a', { class: 'btn', href: '#/item/' + m.page.id }, 'Module page') : '')));
    if (m.materials.length) {
      r.append(h('h2', { class: 'sec' }, 'Course materials', h('small', {}, m.materials.length)),
        h('div', { class: 'grid' }, m.materials.map(it => card(it, { seen: true, snip: '' }))));
    }
    if (m.start.length) r.append(h('h2', { class: 'sec' }, 'Start here', h('small', {}, m.start.length)), this.tiles(m.start));
    if (m.lessons.length) {
      r.append(h('h2', { class: 'sec' }, 'Lessons', h('small', {}, m.lessons.length)));
      for (const ls of m.lessons) {
        const nv = ls.parts.filter(p => p.ty !== 'audio').length, na = ls.parts.length - nv;
        r.append(h('div', { class: 'lesson' }, h('div', { class: 'ln' }, h('small', {}, 'LESSON'), h('b', {}, ls.num)),
          h('div', {}, h('h4', {}, ls.title), h('div', { class: 'lm' }, [nv && `${nv} video${nv !== 1 ? 's' : ''}`, na && `${na} audio`].filter(Boolean).join('  •  ')),
            this.tiles(ls.parts, ls.caps))));
      }
    }
    for (const [k, name] of [['more', 'More videos'], ['audio', 'Audio'], ['qa', 'Q&A and bonus videos'], ['other', 'Other files']])
      if (m[k].length) r.append(h('h2', { class: 'sec' }, name, h('small', {}, m[k].length)), this.tiles(m[k]));
  }
  async renderSearch(gen) {
    const r = this.right, q = this.q;
    r.append(h('p', { class: 'count' }, 'Searching…'));
    const ws = q.toLowerCase().split(/\s+/);
    const hit = new Set(Course.seq.filter(it => ws.every(w => ((Course.disp.get(it.id) || '') + ' ' + it.t + ' ' + it.p).toLowerCase().includes(w))).map(i => i.id));
    const res = await Search.query(q);
    if (gen !== this.gen) return;
    if (res) for (const id of res.scores.keys()) if (Course.where.has(id)) hit.add(id);
    r.innerHTML = '';
    r.append(h('h2', { class: 'sec' }, 'Search results', h('small', {}, hit.size)));
    if (!hit.size) r.append(h('p', { class: 'empty' }, 'Nothing in the course matches that.'));
    for (const m of Course.mods) {
      const its = Course.seq.filter(it => hit.has(it.id) && Course.where.get(it.id)[1] === m);
      if (its.length) r.append(h('h3', { class: 'grp' }, (m.num ? `Module ${m.num}: ` : '') + m.short), this.tiles(its.slice(0, 120)));
    }
  }
}

class FavoritesView {
  constructor() {
    this.el = h('section', { class: 'view' }); this.mode = 'By section'; this.dirty = true;
    this.el.append(h('p', { class: 'sub' }, 'Everything you have starred, grouped. Tap ☆ on any card (or in the reader) to add it here. Favorites are saved on this tablet.'));
    this.chips = h('div', { class: 'chips' }, ['By section', 'By category', 'Newest first', '📝 Notes'].map(n => h('button', { class: 'chip', 'data-chip': n, onclick: () => { this.mode = n; this.render(); } }, n)));
    this.body = h('div', {});
    const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: () => this.importFile(file) });
    this.tools = h('div', { class: 'rbtns', style: { marginTop: '26px' } },
      h('button', { class: 'btn', onclick: () => this.exportFile() }, '⬇ Save favorites & notes to a file'),
      h('button', { class: 'btn', onclick: () => file.click() }, '⬆ Load favorites & notes from a file'),
      h('button', { class: 'btn', onclick: () => this.addPC() }, '＋ Add the PC’s favorites'), file);
    this.el.append(this.chips, this.body, this.tools);
  }
  title() { return 'Favorites'; }
  show() { if (this.dirty) { this.render(); return 'top'; } return 'keep'; }
  group(it) {
    if (this.mode === 'By category') return [isCourse(it) ? 'Cooking School' : (it.c ? nice(it.c) : 'Other'), ''];
    if (isCourse(it)) return ['Cooking School', it.m || ''];
    if (it.c === 'recipes') return ['Recipes', { web: 'Web recipes', email: 'Email recipes', facebook: 'Facebook', cards: 'Recipe cards', videos: 'Recipe videos', books: 'Cookbooks & documents' }[it.g] || ''];
    if (DOC_TYPES.has(it.ty)) return ['Documents & Books', nice(it.c)];
    return ['Library', nice(it.c)];
  }
  render() {
    this.dirty = false;
    $$('.chip', this.chips).forEach(c => c.classList.toggle('on', c.dataset.chip === this.mode));
    const b = this.body; b.innerHTML = '';
    if (this.mode === '📝 Notes') return this.renderNotes(b);
    const favs = Favs.d, items = Object.keys(favs).map(p => BYPATH.get(p)).filter(Boolean);
    if (!items.length) { b.append(h('div', { class: 'panel empty' }, h('h3', {}, '☆ No favorites yet'), 'Tap the star on any recipe, document or lesson to add it here. Tap it again to remove it.')); return; }
    let groups;
    if (this.mode === 'Newest first') groups = [[['Newest first', ''], items.sort((a, b) => (favs[b.p] > favs[a.p] ? 1 : -1))]];
    else {
      const gm = new Map();
      for (const it of items) { const g = this.group(it), k = g.join('\u0001'); if (!gm.has(k)) gm.set(k, [g, []]); gm.get(k)[1].push(it); }
      const order = { Recipes: 0, 'Cooking School': 1, 'Documents & Books': 2 };
      groups = [...gm.values()].sort((x, y) => ((order[x[0][0]] ?? 3) - (order[y[0][0]] ?? 3)) || x[0][0].localeCompare(y[0][0]) || natural(x[0][1], y[0][1]));
      groups.forEach(g => g[1].sort((a, b) => natural(a.t, b.t)));
    }
    let last = null;
    for (const [[main, sub], its] of groups) {
      if (main !== last) { b.append(h('h2', { class: 'sec' }, main, h('small', {}, groups.filter(g => g[0][0] === main).reduce((s, g) => s + g[1].length, 0)))); last = main; }
      if (sub) b.append(h('h3', { class: 'grp' }, sub));
      b.append(h('div', { class: 'grid' }, its.map(it => card(it))));
    }
  }
  renderNotes(b) {
    const its = Object.keys(TabNotes.d).map(p => BYPATH.get(p)).filter(it => it && TabNotes.has(it))
      .sort((x, y) => (TabNotes.d[y.p].updated > TabNotes.d[x.p].updated ? 1 : -1));
    const pc = ITEMS.filter(it => it.n && !TabNotes.has(it));
    b.append(h('p', { class: 'sub' }, 'Notes you typed on this tablet, newest first. To copy them onto the PC: "Save favorites & notes to a file" below, then "Import tablet notes" on the PC.'));
    if (!its.length) b.append(h('div', { class: 'panel empty' }, 'No tablet notes yet. Open any item and use its Note tab.'));
    else b.append(h('h2', { class: 'sec' }, 'Tablet notes', h('small', {}, its.length)),
      h('div', { class: 'grid' }, its.map(it => card(it, { snip: TabNotes.get(it).slice(0, 160) }))));
    if (pc.length) b.append(h('h2', { class: 'sec' }, 'Notes from the PC', h('small', {}, pc.length)), h('div', { class: 'grid' }, pc.map(it => card(it))));
  }
  exportFile() {
    const n = new Date(), stamp = n.toISOString().slice(0, 10);
    const data = { kind: 'research-library-tablet', saved: stamp + ' ' + n.toTimeString().slice(0, 5), items: Favs.d, notes: TabNotes.d };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `library-favorites-and-notes-${stamp}.json` }); document.body.append(a); a.click(); a.remove();
  }
  async importFile(input) {
    const f = input.files[0]; if (!f) return;
    let d;
    try { d = JSON.parse(await f.text()); } catch { alert('That file is not a favorites file.'); input.value = ''; return; }
    input.value = '';
    let added = 0;
    for (const [p, v] of Object.entries(d.notes || {})) {   // notes: add missing ones; keep both texts if they differ
      if (!BYPATH.has(p) || !v || !(v.text || '').trim()) continue;
      const cur = (TabNotes.d[p] || {}).text || '';
      if (cur.includes(v.text.trim())) continue;
      TabNotes.d[p] = { text: cur.trim() ? cur.trim() + '\n\n' + v.text.trim() : v.text, updated: v.updated || '' }; added++;
    }
    LS.set('lv.notes', TabNotes.d);
    this.merge(d.items || (d.notes ? {} : d), added);
  }
  async addPC() { try { this.merge(await getJSON('data/pc_favorites.json')); } catch { alert('No PC favorites were included in this build.'); } }
  merge(d, notes = 0) {
    let n = 0; for (const [p, t] of Object.entries(d || {})) if (!(p in Favs.d) && BYPATH.has(p)) { Favs.d[p] = t; n++; }
    Favs.save(); Nav.counts(); this.render();
    const parts = [n && `${n} favorite${n === 1 ? '' : 's'}`, notes && `${notes} note${notes === 1 ? '' : 's'}`].filter(Boolean);
    alert(parts.length ? 'Added ' + parts.join(' and ') + '.' : 'Nothing new to add - it is all here already.');
  }
}

class HelpView {
  constructor() {
    this.el = h('section', { class: 'view help' }, h('div', { class: 'panel', html: `
<h2 style="margin-top:0">How to use this viewer</h2>
<p>This is a read-only copy of the Research Library for the tablet. It works with no internet: everything comes from the SD card.
To <b>add</b> or <b>delete</b> things, use Library Manager on the PC, then rebuild and copy the viewer again.</p>
<h3>Finding things</h3>
<ul><li><b>Search</b> looks through every word of every page, not just titles. All the words you type must appear. The last word also
finds longer words that start with it, so results show up while you type. Choose <i>Sort: Best match</i> to see the closest matches first.</li>
<li>The sections in the menu (☰) work like Library Manager's: <b>Recipes</b>, <b>Local Area</b>, <b>Documents &amp; Books</b> and the <b>Whole Library</b>.
Recipes, Documents &amp; Books, Whole Library and Local Area open on the same <b>topic tiles</b> as Library Manager - tap one, then use its buttons to narrow the list; <b>◀ All topics</b> or Back returns to the tiles.</li></ul>
<h3>Reading</h3>
<ul><li>Tap a card to open it. The <b>Read</b> tab shows the page, <b>Pictures</b> shows every photo (swipe or use the arrows), <b>Pages</b> shows the original PDF,
<b>Note</b> shows the PC's note and has a box for your own tablet note (saved as you type).</li>
<li>Videos and audio play right in the page. <b>A−</b>/<b>A+</b> changes the text size.</li>
<li>The tablet's Back button (or ← Back) returns to the list exactly where you were.</li></ul>
<h3>Favorites</h3>
<p>Tap ☆ to star anything. Favorites are kept in this browser on this tablet. They started with the PC's favorites. Use
<i>Save favorites &amp; notes to a file</i> on the Favorites page to keep a backup.</p>
<h3>Notes</h3>
<p>Every item's <b>Note</b> tab has a box for your own note. It is saved on this tablet as you type, and the card gets a 📝.
Favorites → <i>📝 Notes</i> lists them all. To put tablet notes onto the PC: <i>Save favorites &amp; notes to a file</i>, copy that file to the PC
(USB cable, the SD card, or email it to yourself), and double-click <b>Import tablet notes.bat</b> in the LibraryViewer folder.</p>
<h3>Maps &amp; waypoints</h3>
<p>Local Area → Maps has the topographic maps. A map's <b>Pages</b> tab can be zoomed with <b>−</b>/<b>+</b> and dragged around.
<b>📍 Waypoints</b> in the menu lists the places saved in Library Manager on the PC - tap one to open its map, zoomed in on a red pin.
<b>📍 Where am I?</b> uses the tablet's GPS (no internet needed) to open the map you are standing on with a blue “You are here” dot -
the first time, allow location for this page when the browser asks.</p>
<h3>Web pages</h3><p>Links marked ↗ and <i>Web page</i> buttons go to the internet, so they only work when the tablet is online.</p>` }));
  }
  title() { return 'How to use'; }
  show() { return 'top'; }
}

// --------------------------------------------------------------------- reader
class ReaderView {
  constructor() { this.el = h('section', { class: 'view' }); this.pdf = null; this.gen = 0; }
  title() { return this.it ? this.it.t : 'Reader'; }
  hide() { this.closePdf(); $$('video,audio', this.el).forEach(m => m.pause()); }
  closePdf() { if (this.pdf) { try { this.pdf.destroy(); } catch { } this.pdf = null; } if (this.pdfIO) { this.pdfIO.disconnect(); this.pdfIO = null; } }
  show(parts, params) {
    const it = ITEMS[+parts[1]];
    if (!it) { this.el.innerHTML = '<p class="empty">That item is not in this build of the library.</p>'; return 'top'; }
    const ps = params.toString();
    if (this.it === it && this.built && ps === this.ps) return 'keep';
    this.ps = ps;
    this.focus = null;   // opened from a waypoint (?wp=id) or from 'Where am I?' (?here=lat,lon&acc=m): zoom in on it
    if (Geo.map(it)) {
      const w = params.get('wp') && Geo.d.waypoints.find(x => x.id === params.get('wp'));
      const hp = (params.get('here') || '').split(',').map(Number);
      if (w) this.focus = w;
      else if (hp.length === 2 && hp.every(isFinite)) this.focus = { lat: hp[0], lon: hp[1], acc: +params.get('acc') || 0, here: true };
    }
    this.open(it, this.focus ? 'Pages' : params.get('tab'));
    return 'top';
  }
  async open(it, tab) {
    const gen = ++this.gen;
    this.closePdf();
    this.it = it; this.built = true;
    $('#ptitle').textContent = it.t;
    const el = this.el; el.innerHTML = '';
    const nb = Course.neighbors(it);
    if (nb) { Progress.viewed(it); Views.course && (Views.course.lastOpened = it); }
    const back = h('button', { class: 'btn', onclick: () => Router.back() }, '← Back');
    const top = h('div', { class: 'rtop' }, back, h('span', { class: 'where' }, nb ? nb.ctx : (it.m || (it.c ? nice(it.c) : ''))));
    if (nb) {
      top.append(h('button', { class: 'btn', disabled: !nb.prev, onclick: () => nb.prev && Router.replace('#/item/' + nb.prev.id) }, '‹ Previous'),
        h('button', { class: 'btn primary', disabled: !nb.next, onclick: () => nb.next && Router.replace('#/item/' + nb.next.id) }, 'Next ›'));
    }
    el.append(top);
    // header
    const pic = h('div', { class: 'rpic' }, picture(it));
    const chips = h('div', { class: 'rchips' });
    const cat = it.m || (it.c ? nice(it.c) : '');
    if (cat) chips.append(h('span', { class: 'rchip cat' }, cat));
    chips.append(h('span', { class: 'rchip typ' }, tname(it.ty)));
    if (it.pub && !it.m) chips.append(h('span', { class: 'rchip' }, it.pub.slice(0, 40)));
    if (it.w) chips.append(h('span', { class: 'rchip' }, fmt(it.w) + ' words'));
    if (it.d) chips.append(h('span', { class: 'rchip' }, 'Added ' + it.d));
    if (it.n || TabNotes.has(it)) chips.append(h('span', { class: 'rchip note', onclick: () => this.setTab('Note') }, '📝 Note'));
    const btns = h('div', { class: 'rbtns' });
    const favOn = Favs.has(it);
    btns.append(h('button', { class: 'btn' + (favOn ? ' fav-on' : ''), 'data-sid': it.id, onclick: () => Favs.toggle(it) }, favOn ? '★ Favorite' : '☆ Add to favorites'));
    if (it.pdf) btns.append(h('a', { class: 'btn', href: libURL(it.pdf), target: '_blank', rel: 'noopener' }, 'Open PDF in another app'));
    if (Geo.map(it)) {   // a topo map: the same spot on the other scale, and the waypoint list
      const f = this.focus, o = f ? Geo.mapsAt(f.lat, f.lon) : {}, other = Geo.map(it).set === 'detail' ? o.regional : o.detail;
      if (f && other) btns.append(h('a', { class: 'btn', href: Geo.link(other, f.here ? `here=${f.lat},${f.lon}&acc=${f.acc}` : 'wp=' + f.id) },
        'Same spot on the ' + (other.set === 'detail' ? 'detailed' : 'regional') + ' map'));
      if (Geo.hasNA()) btns.append(h('button', { class: 'btn', onclick: () => {   // the road map at the same spot
        const m = Geo.map(it), v = this.mapView && this.mapView();   // the middle of the screen, if the Pages tab is showing
        const p = f ? [f.lat, f.lon] : v ? Geo.fromPage(m, v[0], v[1]) : [(m.s + m.n) / 2, (m.w + m.e) / 2];
        location.href = Geo.naURL(p[0], p[1], f ? (f.here ? 'You were here' : f.name) : it.t.replace(/ - USGS .*/, '') + (v ? ' (centre of the view)' : ' (centre of the sheet)'));
      } }, '🌎 North America map'));
      btns.append(h('a', { class: 'btn', href: '#/waypoints' }, '📍 Waypoints'));
    }
    if (it.p.endsWith('/north-america-map.md')) {   // the offline road map is a page of its own
      btns.prepend(h('a', { class: 'btn primary', href: Geo.naURL() }, '🌎 Open the North America map'));
    }
    if (it.o && ![it.pdf, it.vid, it.aud].includes(it.o)) {
      const ext = (it.o.split('.').pop() || '').toUpperCase();
      btns.append(h('a', { class: 'btn', href: libURL(it.o), target: '_blank', rel: 'noopener' }, it.ty === 'recipe-card' ? 'Open picture' : `Open original (${ext})`));
    }
    if ((it.u || '').startsWith('http')) btns.append(h('a', { class: 'btn', href: it.u, target: '_blank', rel: 'noopener' }, 'Web page ↗ (needs internet)'));
    const title = Course.disp.get(it.id) || it.t;
    el.append(h('div', { class: 'panel rhead' }, pic, h('div', {}, h('h2', {}, title), chips, it.s ? h('p', { class: 'rdesc' }, it.s) : '', btns)));
    if (it.vid || it.aud) {
      const media = it.vid ? h('video', { controls: true, preload: 'metadata', playsinline: true, src: libURL(it.vid) })
        : h('audio', { controls: true, preload: 'metadata', src: libURL(it.aud) });
      el.append(h('div', { class: 'media' }, media));
    }
    // tabs
    this.tabsEl = h('div', { class: 'tabs' }); this.body = h('div', { class: 'tabbody' });
    el.append(this.tabsEl, this.body);
    this.mdEl = null; this.gallery = [];
    let mdText = '';
    if (it.f) { this.body.innerHTML = '<p class="loading">Loading…</p>'; mdText = await itemText(it); if (gen !== this.gen) return; }
    this.mdEl = it.f ? renderMarkdown(mdText, it) : null;
    this.gallery = buildGallery(it, this.mdEl);
    const tabs = [];
    if (it.f || it.text) tabs.push('Read');
    if (this.gallery.length) tabs.push('Pictures');
    if (it.pdf) tabs.push('Pages');
    tabs.push('Note');   // always: you can write a tablet note on anything
    for (const n of tabs) this.tabsEl.append(h('button', { class: 'tab', 'data-tab': n, onclick: () => this.setTab(n) }, n === 'Pictures' ? `Pictures (${this.gallery.length})` : n));
    this.tabsEl.append(h('span', { style: { flex: 1 } }),
      h('button', { class: 'tab', 'aria-label': 'Smaller text', onclick: () => fontStep(-1) }, 'A−'),
      h('button', { class: 'tab', 'aria-label': 'Larger text', onclick: () => fontStep(1) }, 'A+'));
    if (!tabs.includes(tab)) tab = !it.f && !it.text && !this.gallery.length && !it.pdf ? (it.n || TabNotes.has(it) ? 'Note' : null) : it.pdf && tabs.includes('Pages') && (DOC_TYPES.has(it.ty) || (it.w || 0) < 400) ? 'Pages'
      : this.gallery.length && (it.ty === 'species-profile' || it.ty === 'recipe-card') ? 'Pictures' : tabs[0];
    this.setTab(tab);
  }
  setTab(n) {
    const it = this.it, b = this.body;
    if (!b) return;
    $$('.tab[data-tab]', this.tabsEl).forEach(t => t.classList.toggle('on', t.dataset.tab === n));
    if (n !== 'Pages') this.closePdf();
    b.innerHTML = '';
    b.hidden = !n;
    if (!n) return;
    if (n === 'Read') {
      if (this.mdEl) b.append(this.mdEl);
      else b.append(h('div', { class: 'md' }, h('h2', {}, it.t), h('pre', {}, it.text || '')));
    } else if (n === 'Pictures') {
      b.append(h('div', { class: 'gal' }, this.gallery.map((g, k) => h('button', { onclick: () => Lightbox.open(this.gallery, k), 'aria-label': g.cap || 'Picture ' + (k + 1) },
        h('img', { src: g.url, loading: 'lazy', alt: g.cap || '' })))));
    } else if (n === 'Pages') {
      const m = Geo.map(it);
      if (m) showMap(this, b, libURL(it.pdf), m, this.focus);
      else this.showPdf(b, libURL(it.pdf));
    } else if (n === 'Note') {
      this.renderNote(b);
    }
  }
  renderNote(b) {
    const it = this.it;
    let pcText = '';
    const ta = h('textarea', { class: 'note-edit', rows: 8, placeholder: 'Type a note about this item. It is saved on this tablet as you type.' });
    ta.value = TabNotes.get(it);
    const stat = h('span', { class: 'sub', style: { margin: 0 } }, TabNotes.has(it) ? 'Saved on this tablet ' + ((TabNotes.d[it.p] || {}).updated || '') : '');
    const onPC = h('div', { class: 'panel', hidden: true, style: { background: 'var(--ok-bg)', color: 'var(--ok-fg)', margin: '10px 0' } });
    const checkOnPC = () => {   // after "Import tablet notes" on the PC + rebuild, the PC note holds the tablet text too
      const mine = ta.value.trim().replace(/\r/g, '');
      const there = !!mine && pcText.replace(/\r/g, '').includes(mine);
      onPC.hidden = !there; onPC.innerHTML = '';
      if (there) onPC.append('✓ This tablet note has been copied into the PC note above. ',
        h('button', { class: 'btn', onclick: () => { ta.value = ''; save(); } }, 'Remove the tablet copy'));
    };
    const save = () => {
      TabNotes.set(it, ta.value);
      stat.textContent = ta.value.trim() ? 'Saved on this tablet ' + TabNotes.d[it.p].updated : (stat.textContent ? 'Note removed' : '');
      checkOnPC();
    };
    if (it.n) {
      const t = h('div', { class: 'note-text' }, 'Loading…');
      b.append(h('h3', { class: 'notehead' }, '📝 Note from the PC'), h('p', { class: 'sub' }, 'Written in Library Manager - change it there.'), t);
      getText(libURL(it.n)).then(s => { pcText = s; t.textContent = s.trim() || '(empty note)'; checkOnPC(); })
        .catch(() => { t.textContent = 'The note file could not be read.'; });
    }
    const later = debounce(save, 700);
    ta.addEventListener('input', () => { stat.textContent = 'Saving…'; later(); });
    ta.addEventListener('blur', save);
    const del = h('button', { class: 'btn', onclick: () => { if (ta.value.trim() && !confirm('Delete your tablet note for this item?')) return; ta.value = ''; save(); } }, '🗑 Delete tablet note');
    b.append(h('h3', { class: 'notehead' }, '📝 Your tablet note'), ta, h('div', { class: 'rbtns', style: { alignItems: 'center', marginTop: '8px' } }, del, stat), onPC);
  }
  async showPdf(box, url) {
    const gen = this.gen;
    const status = h('span', { class: 'sub', style: { margin: 0 } }, 'Opening the PDF…');
    const pageIn = h('input', { type: 'number', min: 1, value: 1, 'aria-label': 'Page number', inputmode: 'numeric' });
    const pages = h('div', { class: 'pdfpages' });
    box.append(h('div', { class: 'pdfbar' }, h('span', {}, 'Page'), pageIn, status, h('span', { style: { flex: 1 } }),
      h('a', { class: 'btn', href: url, target: '_blank', rel: 'noopener' }, 'Open in another app')), pages);
    let lib, doc;
    try { lib = await loadPdfJs(); doc = await lib.getDocument({ url }).promise; }
    catch (e) { status.textContent = 'This PDF could not be shown here - try "Open in another app".'; return; }
    if (gen !== this.gen || !box.isConnected) { doc.destroy(); return; }
    this.pdf = doc;
    const N = doc.numPages; status.textContent = `of ${fmt(N)}`; pageIn.max = N;
    const p1 = await doc.getPage(1), vp1 = p1.getViewport({ scale: 1 });
    const ratio = vp1.height / vp1.width;
    const els = [];
    for (let k = 1; k <= N; k++) {
      const d = h('div', { class: 'pdfpage', 'data-n': k, style: { aspectRatio: `1 / ${ratio}` } }, h('span', { class: 'pn' }, k));
      els.push(d); pages.append(d);
    }
    const rendered = new Set(); let cur = 1;
    const render = async d => {
      const k = +d.dataset.n; if (rendered.has(k) || !this.pdf) return; rendered.add(k);
      try {
        const pg = await doc.getPage(k), v0 = pg.getViewport({ scale: 1 });
        d.style.aspectRatio = `${v0.width} / ${v0.height}`;
        const scale = (d.clientWidth || 800) / v0.width * Math.min(window.devicePixelRatio || 1, 2);
        const vp = pg.getViewport({ scale });
        const c = d.querySelector('canvas') || d.insertBefore(h('canvas', {}), d.firstChild);
        c.width = vp.width; c.height = vp.height;
        await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      } catch { rendered.delete(k); }
      if (rendered.size > 14) {   // let go of pages far away, to keep memory low on the tablet
        const far = [...rendered].sort((a, b) => Math.abs(b - cur) - Math.abs(a - cur))[0];
        const fc = els[far - 1].querySelector('canvas'); if (fc) fc.remove(); rendered.delete(far);
      }
    };
    this.pdfIO = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) { render(e.target); }
    }, { rootMargin: '1500px 0px' });
    const curIO = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) { cur = +e.target.dataset.n; if (document.activeElement !== pageIn) pageIn.value = cur; }
    }, { rootMargin: '-45% 0px -45% 0px' });
    els.forEach(d => { this.pdfIO.observe(d); curIO.observe(d); });
    const oldClose = this.closePdf.bind(this);
    this.closePdf = () => { curIO.disconnect(); oldClose(); this.closePdf = oldClose; };
    pageIn.addEventListener('change', () => { const n = Math.max(1, Math.min(N, +pageIn.value || 1)); els[n - 1].scrollIntoView({ block: 'start' }); window.scrollBy(0, -120); });
  }
}

let pdfjsReady = null;
function loadPdfJs() {
  if (!pdfjsReady) pdfjsReady = new Promise((res, rej) => {
    const s = h('script', { src: 'vendor/pdf.min.js' });
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js'; res(window.pdfjsLib); };
    s.onerror = () => { pdfjsReady = null; rej(new Error('pdf.js')); };
    document.head.append(s);
  });
  return pdfjsReady;
}

function fontStep(d) {
  const v = Math.max(-3, Math.min(6, LS.get('lv.font', 0) + d)); LS.set('lv.font', v); applyFont();
}
function applyFont() {
  const v = LS.get('lv.font', 0);
  let st = $('#fontstyle'); if (!st) { st = h('style', { id: 'fontstyle' }); document.head.append(st); }
  st.textContent = `.md, .note-text, .note-edit { font-size: ${17 + v * 1.5}px; }`;
}

/* Page text: Markdown -> HTML, with every picture/link pointed at the library folder on the card. */
function renderMarkdown(src, it) {
  src = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const div = h('div', { class: 'md' });
  try { div.innerHTML = marked.parse(src, { gfm: true }); } catch { div.textContent = src; }
  $$('script,style,iframe,object,embed,form', div).forEach(e => e.remove());
  for (const e of $$('*', div)) for (const a of [...e.attributes]) if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) e.removeAttribute(a.name);
  const base = new URL(LIB + encPath(dirOf(it.p)) + '/', location.href);
  const toLib = raw => { try { return new URL(raw, base); } catch { return null; } };
  const libPathOf = u => { const p = decodeURIComponent(u.pathname); return p.startsWith(LIBPATH) ? p.slice(LIBPATH.length) : null; };
  for (const img of $$('img', div)) {
    const raw = img.getAttribute('src') || '';
    img.loading = 'lazy'; img.decoding = 'async';
    if (/^(https?:)?\/\//i.test(raw)) { img.addEventListener('error', () => img.remove()); continue; }   // internet pictures: hidden when offline
    if (raw.startsWith('data:')) continue;
    const u = toLib(raw); if (u) img.src = u.href;
    img.addEventListener('error', () => img.remove());
  }
  for (const m of $$('video[src],audio[src],source[src]', div)) { const u = toLib(m.getAttribute('src')); if (u) m.src = u.href; }
  for (const v of $$('video', div)) { v.controls = true; v.setAttribute('playsinline', ''); v.preload = 'metadata'; }
  for (const a of $$('a[href]', div)) {
    const raw = a.getAttribute('href');
    if (!raw || raw.startsWith('#') || /^(mailto|tel):/i.test(raw)) continue;
    if (/^https?:/i.test(raw)) { a.target = '_blank'; a.rel = 'noopener'; a.classList.add('ext'); continue; }
    const u = toLib(raw); if (!u) continue;
    const lp = libPathOf(u);
    const target = lp && BYPATH.get(lp);
    if (target) { a.href = '#/item/' + target.id; continue; }
    if (lp && lp === it.pdf) { a.href = '#'; a.addEventListener('click', e => { e.preventDefault(); Views.reader.setTab('Pages'); window.scrollTo(0, Views.reader.tabsEl.offsetTop - 70); }); continue; }
    if (lp && IMG_RE.test(lp)) {
      a.href = u.href;
      a.addEventListener('click', e => { const g = Views.reader.gallery, k = g.findIndex(x => x.url === u.href); if (k >= 0) { e.preventDefault(); Lightbox.open(g, k); } });
      continue;
    }
    a.href = u.href; a.target = '_blank'; a.rel = 'noopener';
  }
  div.addEventListener('click', e => {
    const img = e.target.closest('img'); if (!img || img.closest('a')) return;
    const g = Views.reader.gallery, k = g.findIndex(x => x.url === img.src);
    if (k >= 0) Lightbox.open(g, k);
  });
  return div;
}

/* Every picture that belongs to an item, in page order: a photo saved beside it, the pictures in its text, its _images folder. */
function buildGallery(it, mdEl) {
  const out = [], seen = new Set();
  const add = (url, cap) => { if (seen.has(url)) return; seen.add(url); out.push({ url, cap: cap && !JUNK_CAP.test(cap.trim()) ? cap.trim() : '' }); };
  for (const [p, cap] of it.gp || []) add(new URL(libURL(p), location.href).href, cap || (it.ty === 'recipe-card' ? it.t : ''));
  if (mdEl) for (const img of $$('img', mdEl)) {
    const src = img.src || '';
    if (src.startsWith(location.origin) && IMG_RE.test(decodeURIComponent(new URL(src).pathname))) add(src, img.alt);
  }
  for (const [p, cap] of it.gx || []) add(new URL(libURL(p), location.href).href, cap);
  return out;
}

// --------------------------------------------------------------------- picture viewer
const Lightbox = {
  list: [], k: 0, open(list, k) {
    this.list = list; this.k = k; $('#lightbox').hidden = false; document.body.style.overflow = 'hidden';
    history.pushState({ lb: 1 }, ''); this.show();
  },
  show() {
    const g = this.list[this.k]; if (!g) return;
    $('#lb-img').src = g.url; $('#lb-full').href = g.url; $('#lb-cap').textContent = g.cap || '';
    $('#lb-count').textContent = `${this.k + 1} / ${this.list.length}`;
    $$('.lb-nav').forEach(b => { b.hidden = this.list.length < 2; });
  },
  go(d) { if (this.list.length) { this.k = (this.k + d + this.list.length) % this.list.length; this.show(); } },
  close(fromHistory) {
    if ($('#lightbox').hidden) return;
    $('#lightbox').hidden = true; document.body.style.overflow = ''; $('#lb-img').src = '';
    if (!fromHistory) history.back();
  },
  init() {
    const lb = $('#lightbox');
    lb.addEventListener('click', e => {
      const a = e.target.closest('[data-lb]'); if (!a) return;
      ({ close: () => this.close(), prev: () => this.go(-1), next: () => this.go(1) })[a.dataset.lb]();
    });
    let x0 = null, y0 = 0;
    const st = $('.lb-stage');
    st.addEventListener('touchstart', e => { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } else x0 = null; }, { passive: true });
    st.addEventListener('touchend', e => {
      if (x0 == null || (window.visualViewport && visualViewport.scale > 1.05)) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) this.go(dx < 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener('keydown', e => {
      if (lb.hidden) return;
      if (e.key === 'Escape') this.close(); else if (e.key === 'ArrowLeft') this.go(-1); else if (e.key === 'ArrowRight') this.go(1);
    });
  },
};

// ===================================================================== router (hash URLs, so Back works everywhere)
const Router = {
  current: null, depth: 0,
  parse() {
    const raw = location.hash.slice(1) || '/';
    const [path, qs] = raw.split('?');
    return { parts: path.split('/').filter(Boolean), params: new URLSearchParams(qs || '') };
  },
  viewFor(parts) {
    const p0 = parts[0];
    if (!p0) return ['home', () => new HomeView()];
    if (p0 === 'browse' && SECTIONS[parts[1]]) return ['browse:' + parts[1], () => SECTIONS[parts[1]].topics ? new TopicBrowseView(parts[1]) : new BrowseView(parts[1])];
    if (p0 === 'course') return ['course', () => new CourseView()];
    if (p0 === 'favorites') return ['favorites', () => new FavoritesView()];
    if (p0 === 'item') return ['reader', () => new ReaderView()];
    if (p0 === 'help') return ['help', () => new HelpView()];
    if (p0 === 'waypoints') return ['waypoints', () => new WaypointsView()];
    return ['home', () => new HomeView()];
  },
  async go() {
    if (!$('#lightbox').hidden) Lightbox.close(true);
    const { parts, params } = this.parse();
    const [key, make] = this.viewFor(parts);
    const prev = this.current;
    if (prev) { prev.scroll = window.scrollY; if (prev.key !== key) { prev.el.hidden = true; prev.hide && prev.hide(); } }
    let v = Views[key.startsWith('browse:') ? key : key];
    if (!v) { v = make(); v.key = key; Views[key] = v; $('#view').append(v.el); }
    if (key === 'reader') Views.reader = v;
    if (key === 'course') Views.course = v;
    if (key === 'favorites') Views.favorites = v;
    v.el.hidden = false; this.current = v;
    Nav.mark(key === 'reader' ? (prev && prev.key) || '' : key);
    const how = v.show(parts, params);
    $('#ptitle').textContent = v.title();
    document.title = v.title() + ' - Research Library';
    if (how === 'keep') requestAnimationFrame(() => window.scrollTo(0, v.scroll || 0));
    else if (how === 'restore-then') window.scrollTo(0, v.scroll || 0);
    else window.scrollTo(0, 0);
  },
  back() { if (this.depth > 0) history.back(); else location.hash = '#/'; },
  replace(hash) { location.replace(hash); },
};

// ===================================================================== start-up
async function boot() {
  const theme = LS.get('lv.theme', '');
  if (theme) document.documentElement.dataset.theme = theme;
  $('#theme').onclick = () => {
    const order = ['', 'light', 'dark'], cur = document.documentElement.dataset.theme || '';
    const nx = order[(order.indexOf(cur) + 1) % 3];
    if (nx) document.documentElement.dataset.theme = nx; else delete document.documentElement.dataset.theme;
    LS.set('lv.theme', nx);
  };
  applyFont();
  try {
    const [items, course, info] = await Promise.all([getJSON('data/items.json'), getJSON('data/course.json'), getJSON('data/info.json')]);
    ITEMS = items; INFO = info; CATS = info.categories || {};
    LIB = window.LIB || ('../' + encodeURIComponent(info.library_folder || 'Research') + '/');
    LIBPATH = decodeURIComponent(new URL(LIB, location.href).pathname);
    for (const it of ITEMS) BYPATH.set(it.p, it);
    Course.build(course);
  } catch (e) {
    $('#boot').innerHTML = `<b>The library data could not be loaded.</b><br>${esc(e.message)}<br><br>` +
      (location.protocol === 'file:' ? 'This page was opened straight from the file. Open it through the web-server app instead (see the README).' :
        'Check that the LibraryViewer folder was copied completely (it needs its <code>data</code> folder).');
    return;
  }
  await Favs.load();
  await Geo.load();
  Search.init();
  $('#built').textContent = fmt(ITEMS.filter(i => !isCourse(i)).length) + ' items';
  $('#boot').remove();
  Nav.build(); Lightbox.init();
  window.addEventListener('hashchange', () => { Router.depth++; Router.go(); });
  window.addEventListener('popstate', e => { if (!$('#lightbox').hidden) Lightbox.close(true); });
  const tt = $('#totop');
  window.addEventListener('scroll', () => { tt.hidden = window.scrollY < 1200; }, { passive: true });
  tt.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  // a quick check that the library folder is where we expect it
  fetch(LIB + 'CATALOG.json', { method: 'HEAD' }).then(r => { if (!r.ok) throw 0; }).catch(() => {
    const warn = h('div', { class: 'panel', style: { background: 'var(--warn-bg)', color: 'var(--warn-fg)', marginBottom: '14px' } },
      h('b', {}, 'The library folder was not found. '), `Pages, pictures and PDFs will not open. Put the "${INFO.library_folder || 'Research'}" folder next to the LibraryViewer folder, and start the web-server app from the folder that holds both.`);
    $('#view').prepend(warn);
  });
  Router.go();
}
boot();
