import { API_URL } from './config.js';

// Shared helpers for every page.
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

// The photo list lives next to the site (written by `npm run sync`).
export async function loadPhotos() {
  const res = await fetch(`photos.json?_=${Date.now()}`);
  if (!res.ok) return [];
  const list = await res.json();
  return list.filter((p) => !p.hidden);
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
  lb.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure>';
  document.body.appendChild(lb);
  lb.addEventListener('click', () => lb.classList.remove('show'));
  addEventListener('keydown', (e) => { if (e.key === 'Escape') lb.classList.remove('show'); });
  return (src, caption = '') => {
    $('img', lb).src = src;
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
