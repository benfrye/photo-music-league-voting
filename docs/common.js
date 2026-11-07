import { API_URL } from './config.js?v=mw6gc5yw';

// Shared helpers for every page.
// Self-update: each publish writes version.json. If this page is an older
// copy the browser kept (GitHub Pages allows 10 minutes), reload once from a
// fresh address so everyone runs the current site.
{
  const pageV = new URL(import.meta.url).searchParams.get('v');
  fetch(`version.json?_=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((cur) => {
      if (!pageV || !cur?.v || cur.v === pageV || sessionStorage.getItem(`reloaded:${cur.v}`)) return;
      sessionStorage.setItem(`reloaded:${cur.v}`, '1');
      const u = new URL(location.href);
      u.searchParams.set('v', cur.v);
      location.replace(u);
    })
    .catch(() => {});
}

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const COLORS = ['#ff3ea5', '#00c2c7', '#ff6a00', '#7b4dff', '#9be22d', '#ffd400'];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
export function toast(msg, isErr = false) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.toggle('err', isErr);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

async function parse(res) {
  const data = await res.json().catch(() => ({ error: `The vote server sent back something odd (${res.status}).` }));
  if (data.error) throw new Error(data.error);
  return data;
}

function checkConfigured() {
  if (API_URL.startsWith('PASTE')) throw new Error('This site is not hooked up to the Google Sheet yet. Paste the Apps Script URL into config.js.');
}

// Reads from the Apps Script backend.
export async function apiGet(action, params = {}) {
  checkConfigured();
  const q = new URLSearchParams({ action, ...params, _: Date.now() });
  return parse(await fetch(`${API_URL}?${q}`));
}

// Writes go as text/plain so the browser doesn't need a CORS preflight (Apps Script can't answer those).
export async function apiPost(body) {
  checkConfigured();
  return parse(await fetch(API_URL, { method: 'POST', body: JSON.stringify(body) }));
}

export function confetti(n = 120) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    const shape = i % 3;
    p.style.left = `${Math.random() * 100}vw`;
    p.style.background = COLORS[i % COLORS.length];
    if (shape === 1) { p.style.borderRadius = '50%'; p.style.width = p.style.height = '14px'; }
    if (shape === 2) { p.style.width = '22px'; p.style.height = '8px'; }
    p.style.setProperty('--dx', `${(Math.random() - .5) * 300}px`);
    p.style.setProperty('--rot', `${(Math.random() - .5) * 1440}deg`);
    p.style.animationDuration = `${1.8 + Math.random() * 1.8}s`;
    p.style.animationDelay = `${Math.random() * .5}s`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4500);
}

export function lightbox() {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = '<figure><img alt=""><video muted loop playsinline controls hidden></video><figcaption></figcaption></figure>';
  document.body.appendChild(lb);
  const vid = $('video', lb);
  const close = () => { lb.classList.remove('show'); vid.pause(); };
  lb.addEventListener('click', (e) => { if (e.target !== vid) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  // video: optional looping clip shown instead of the still (GIFs, album videos)
  return (src, caption = '', video = '') => {
    $('img', lb).hidden = !!video;
    vid.hidden = !video;
    if (video) {
      vid.poster = src; vid.src = video; vid.muted = true;
      vid.play().catch(() => { /* blocked: the controls let them start it */ });
    } else {
      $('img', lb).src = src;
    }
    $('figcaption', lb).textContent = caption;
    lb.classList.add('show');
  };
}

// Playful replacement for window.confirm(). Resolves true/false.
export function ask({ title = 'Are you sure?', body = '', yes = 'Yes', no = 'Never mind', danger = false } = {}) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'ask-back';
    back.innerHTML = `
      <div class="ask" role="alertdialog" aria-modal="true" aria-labelledby="askTitle">
        <div class="ask-title" id="askTitle">${esc(title)}</div>
        ${body ? `<p class="ask-body">${esc(body)}</p>` : ''}
        <div class="ask-row">
          <button class="btn white small" data-a="no">${esc(no)}</button>
          <button class="btn ${danger ? 'orange' : ''} small" data-a="yes">${esc(yes)}</button>
        </div>
      </div>`;
    const close = (val) => {
      removeEventListener('keydown', onKey);
      back.classList.add('out');
      setTimeout(() => back.remove(), 160);
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true); };
    back.addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (b) close(b.dataset.a === 'yes');
      else if (e.target === back) close(false);
    });
    addEventListener('keydown', onKey);
    document.body.appendChild(back);
    back.querySelector('[data-a="no"]').focus();
  });
}

// ---------------------------------------------------------------- photos
// Photos come live from the iCloud album named in the sheet's "Album link",
// through the Apps Script. The photo list (usually with every image link
// bundled in) arrives first so pages can draw every box; any links that
// weren't cached stream in afterwards and get dropped into the boxes.

const urlCache = new Map(); // id -> { thumb, src, video? }
export const photoUrl = (id, size = 'thumb') => urlCache.get(id)?.[size] || '';

// GIFs and videos: a silent loop laid over the still frame. iPhones play these
// automatically (unlike GIFs, which a phone setting can freeze); if autoplay is
// blocked, the still frame simply stays.
function videoHTML(url) {
  return `<video class="loop" src="${esc(url)}" muted loop playsinline autoplay preload="auto" disablepictureinpicture aria-hidden="true"></video>`;
}
function startLoops(root = document) {
  for (const v of root.querySelectorAll('video.loop')) {
    v.muted = true;
    v.play?.().catch(() => { /* autoplay blocked: still frame shows */ });
  }
}
document.addEventListener('playing', (e) => { if (e.target.classList?.contains('loop')) e.target.classList.add('on'); }, true);

export function applyUrls(urls) {
  for (const [id, u] of Object.entries(urls || {})) {
    urlCache.set(id, u);
    const sel = CSS.escape(id);
    for (const img of document.querySelectorAll(`img[data-photo="${sel}"]`)) {
      const want = u[img.dataset.size || 'thumb'];
      if (want && img.getAttribute('src') !== want) img.src = want;
      const pic = img.closest('.pic');
      if (u.video && pic && !pic.querySelector('video.loop')) { pic.insertAdjacentHTML('beforeend', videoHTML(u.video)); startLoops(pic); }
    }
    for (const el of document.querySelectorAll(`[data-bg-photo="${sel}"]`)) {
      if (u.thumb) el.style.backgroundImage = `url("${u.thumb}")`;
    }
  }
}

export function picHTML(id, alt = '', size = 'thumb') {
  const u = photoUrl(id, size);
  const video = photoUrl(id, 'video');
  queueMicrotask(() => startLoops()); // iOS wants play() called on inserted videos
  return `<div class="pic${video ? ' has-video' : ''}"><img data-photo="${esc(id)}" data-size="${size}" ${u ? `src="${esc(u)}"` : ''} alt="${esc(alt)}" decoding="async">${video ? videoHTML(video) : ''}</div>`;
}

// A photo we truly can't show gets a "couldn't load" face instead of shimmering forever.
export function markMissing(id) {
  for (const img of document.querySelectorAll(`img[data-photo="${CSS.escape(id)}"]`)) {
    img.closest('.pic')?.classList.add('missing');
  }
}

// Fade each photo in as it lands; if a link has expired, fetch a fresh one once.
document.addEventListener('load', (e) => {
  const t = e.target;
  if (t.tagName === 'IMG' && t.dataset.photo) { t.classList.add('loaded'); t.closest('.pic')?.classList.remove('missing'); }
}, true);
const retried = new Set();
document.addEventListener('error', async (e) => {
  const t = e.target;
  if (t.tagName !== 'IMG' || !t.dataset.photo || !t.getAttribute('src')) return;
  const id = t.dataset.photo;
  if (retried.has(id)) { markMissing(id); return; }
  retried.add(id);
  const before = photoUrl(id, t.dataset.size || 'thumb');
  try { applyUrls((await apiGet('photoUrls', { ids: id, fresh: '1' })).urls); } catch { /* fall through */ }
  if (photoUrl(id, t.dataset.size || 'thumb') === before) markMissing(id); // no fresh link to try
}, true);

// Apple's public link doesn't serve GIFs, so those live in gifs/ (named by
// their Apple ID). A GIF in the album that isn't there is left off the ballot,
// the same way on every page.
async function loadHostedGifs() {
  try {
    const res = await fetch(`gifs/index.json?_=${Date.now()}`);
    return res.ok ? await res.json() : {};
  } catch { return {}; }
}

// ---------------------------------------------------------------- remember & refresh
// Pages draw instantly from what this phone saw last time, then quietly fetch
// fresh data and update. Nothing here is trusted for counting votes; it only
// avoids blank screens while the Apps Script (~1.5s per request) answers.
export function remember(key, value) {
  try { localStorage.setItem(`c:${key}`, JSON.stringify({ t: Date.now(), d: value })); } catch { /* storage full/blocked */ }
}
export function recall(key, maxAgeMs = Infinity) {
  try {
    const c = JSON.parse(localStorage.getItem(`c:${key}`) || 'null');
    if (c && Date.now() - c.t <= maxAgeMs) return c.d;
  } catch { /* ignore */ }
  return null;
}
export function forget(key) { try { localStorage.removeItem(`c:${key}`); } catch { /* ignore */ } }
export const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-10);

const LINK_FRESH_MS = 8 * 60 * 1000; // Apple's image links last ~20 min; reuse only recent ones

function rememberAlbum(photos) {
  remember('album', { photos, urls: Object.fromEntries(urlCache) });
}

// The photo list from last time (or null). Hosted GIF clips are always reusable;
// Apple's image links only if they're recent (an expired one re-fetches itself anyway).
export function cachedAlbum() {
  const c = recall('album');
  if (!c) return null;
  const fresh = recall('album', LINK_FRESH_MS);
  const urls = fresh ? c.urls : Object.fromEntries(Object.entries(c.urls || {}).filter(([, u]) => String(u.thumb || '').startsWith('gifs/')));
  applyUrls(urls);
  return { photos: c.photos, cached: true };
}

export async function loadAlbum() {
  const [a, gifs] = await Promise.all([apiGet('album'), loadHostedGifs()]);
  applyUrls(a.urls); // usually all of them, straight from the cache
  applyUrls(Object.fromEntries(Object.entries(gifs).map(([id, f]) => [id, typeof f === 'string'
    ? { thumb: f, src: f }
    : { thumb: f.poster, src: f.poster, video: f.video }])));
  const photos = a.photos.filter((p) => p.img !== false || gifs[p.id]);
  rememberAlbum(photos);
  return { photos };
}

// Fetch any image links the album call didn't include, in small parallel batches.
export async function loadPhotoUrls(album, { batch = 12, onProgress } = {}) {
  const ids = album.photos.map((p) => p.id).filter((id) => !urlCache.has(id));
  let done = album.photos.length - ids.length;
  const chunks = [];
  for (let i = 0; i < ids.length; i += batch) chunks.push(ids.slice(i, i + batch));
  await Promise.all(chunks.map(async (c) => {
    try { applyUrls((await apiGet('photoUrls', { ids: c.join(',') })).urls); } catch (err) { console.warn(err); }
    done += c.length;
    onProgress?.(done, album.photos.length);
  }));
  for (const p of album.photos) if (!photoUrl(p.id)) markMissing(p.id);
  if (ids.length) rememberAlbum(album.photos);
}
