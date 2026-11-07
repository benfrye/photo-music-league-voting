import { $, $$, apiGet, loadPhotos, esc, confetti, lightbox, COLORS } from './common.js';
import { sequentialIRV } from './rcv.js';
import { horseSVG } from './horse.js';

const showPhoto = lightbox();

// "← Back" returns to whichever page of this site sent you here (check-in or
// your ballot). Opened from a shared link? It goes to the check-in page.
{
  const back = $('#backBtn');
  let from = null;
  try { from = document.referrer ? new URL(document.referrer) : null; } catch { /* ignore */ }
  const sameSite = from && from.origin === location.origin && !from.pathname.endsWith('results.html');
  if (sameSite) {
    back.href = from.pathname.split('/').pop() || 'index.html';
    back.addEventListener('click', (ev) => { if (history.length > 1) { ev.preventDefault(); history.back(); } });
  }
}
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ORD = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]}`;
let data = null;
let photoById = new Map();
let pollTimer = null;

async function load() {
  const [r, photos] = await Promise.all([apiGet('results'), loadPhotos()]);
  data = { title: r.league.title, seats: r.league.rounds, status: r.league.status, voters: r.voters };
  if (r.league.status === 'closed' && r.ballots) {
    // Ranked-choice count happens right here in the browser.
    data.photos = photos;
    data.result = sequentialIRV(r.ballots, photos.map((p) => p.id), r.league.rounds, r.league.seed);
  }
  $('#title').textContent = data.title;
  document.title = `Results · ${data.title}`;
  if (data.status === 'closed' && data.result) {
    clearInterval(pollTimer);
    photoById = new Map(data.photos.map((p) => [p.id, p]));
    renderRace();
  } else {
    renderWaiting();
    if (!pollTimer) pollTimer = setInterval(() => load().catch(() => {}), 4000);
  }
}

// ---------------- waiting room ----------------
function renderWaiting() {
  const voted = data.voters.filter((v) => v.voted).length;
  const total = data.voters.length;
  const left = total - voted;
  $('#subtitle').textContent = data.status === 'setup' ? "The gates aren't open yet" : 'The horses are in the stable';
  const stalls = Math.max(3, Math.min(6, data.seats));
  $('#main').innerHTML = `
    <section class="card center tilt-l">
      <p class="big-msg">${data.status === 'setup' ? 'Voting opens soon!' : left === 0 ? 'Counting...' : `Waiting on ${left} ${left === 1 ? 'rider' : 'riders'}`}</p>
      <div class="stable idle">${Array.from({ length: stalls }, (_, i) => `<div class="stall">${horseSVG({ color: COLORS[i % 6], mane: COLORS[(i + 3) % 6], cap: COLORS[(i + 1) % 6] })}</div>`).join('')}</div>
      <div class="meter"><div style="width:${total ? (voted / total) * 100 : 0}%"></div></div>
      <p class="tagline">${voted} of ${total} ballots in. The race starts the second the last one lands.</p>
      <div class="who">${data.voters.map((v) => `<span class="${v.voted ? 'v' : ''}">${v.voted ? '✓' : '⏳'} ${esc(v.name)}</span>`).join('')}</div>
    </section>`;
}

// ---------------- the race ----------------
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// A stadium-shaped track in a 1000x620 box. s = distance along the centre line,
// starting at the finish line (bottom middle) and running counter-clockwise.
const VB = { w: 1000, h: 620 };
const TRACK = { cx: 500, cy: 338, a: 230, R: 185, W: 150 };
const LAP = 4 * TRACK.a + 2 * Math.PI * TRACK.R;
const RACE = 5; // seconds from "GO!" to the last horse
const HORSE_W = 92; // in track units (bigger on phones, see draw)

function stadiumPath(R) {
  const { cx, cy, a } = TRACK;
  return `M${cx - a} ${cy + R} L${cx + a} ${cy + R} A${R} ${R} 0 0 0 ${cx + a} ${cy - R} L${cx - a} ${cy - R} A${R} ${R} 0 0 0 ${cx - a} ${cy + R} Z`;
}

// Point + direction on the centre line, pushed sideways by d (positive = outside rail).
function trackPoint(s, d) {
  const { cx, cy, a, R } = TRACK;
  s = ((s % LAP) + LAP) % LAP;
  let x, y, tx, ty;
  const arc = Math.PI * R;
  if (s < a) { x = cx + s; y = cy + R; tx = 1; ty = 0; }
  else if (s < a + arc) { const f = (s - a) / R; x = cx + a + R * Math.sin(f); y = cy + R * Math.cos(f); tx = Math.cos(f); ty = -Math.sin(f); }
  else if (s < 3 * a + arc) { x = cx + a - (s - a - arc); y = cy - R; tx = -1; ty = 0; }
  else if (s < 3 * a + 2 * arc) { const f = (s - 3 * a - arc) / R; x = cx - a - R * Math.sin(f); y = cy - R * Math.cos(f); tx = -Math.cos(f); ty = Math.sin(f); }
  else { x = cx - a + (s - 3 * a - 2 * arc); y = cy + R; tx = 1; ty = 0; }
  return { x: x - ty * d, y: y + tx * d, tx };
}

function trackSVG() {
  const { cx, cy, R, W } = TRACK;
  const half = W / 2;
  const deco = [
    `<polygon points="300,215 330,265 270,265" fill="#ffd400" stroke="#111" stroke-width="5"/>`,
    `<circle cx="700" cy="235" r="20" fill="#ff3ea5" stroke="#111" stroke-width="5"/>`,
    `<rect x="660" y="320" width="34" height="34" fill="#00c2c7" stroke="#111" stroke-width="5" transform="rotate(18 677 337)"/>`,
    `<path d="M300 345 q14 -18 28 0 t28 0 t28 0" fill="none" stroke="#7b4dff" stroke-width="7" stroke-linecap="round"/>`,
    `<circle cx="420" cy="350" r="5" fill="#111"/><circle cx="436" cy="350" r="5" fill="#111"/><circle cx="452" cy="350" r="5" fill="#111"/>`,
  ].join('');
  return `
  <svg class="track-svg" viewBox="0 0 ${VB.w} ${VB.h}" aria-hidden="true">
    <defs>
      <pattern id="checker" width="16" height="16" patternUnits="userSpaceOnUse">
        <rect width="16" height="16" fill="#fff"/><rect width="8" height="8" fill="#111"/><rect x="8" y="8" width="8" height="8" fill="#111"/>
      </pattern>
      <pattern id="dirt" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#cf9150"/><circle cx="8" cy="10" r="2.5" fill="#b97a3c"/><circle cx="28" cy="30" r="2" fill="#b97a3c"/><circle cx="30" cy="8" r="1.5" fill="#e0ab6e"/>
      </pattern>
    </defs>
    <rect x="4" y="4" width="${VB.w - 8}" height="${VB.h - 8}" rx="36" fill="#3cb371" stroke="#111" stroke-width="8"/>
    <path d="${stadiumPath(R)}" fill="none" stroke="#111" stroke-width="${W + 12}"/>
    <path d="${stadiumPath(R)}" fill="none" stroke="url(#dirt)" stroke-width="${W}"/>
    <path d="${stadiumPath(R + half)}" fill="none" stroke="#fff" stroke-width="5"/>
    <path d="${stadiumPath(R - half)}" fill="none" stroke="#fff" stroke-width="5"/>
    <path d="${stadiumPath(R)}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-dasharray="14 18"/>
    <path d="${stadiumPath(R - half - 6)}" fill="#47c47f" stroke="#111" stroke-width="6"/>
    <g transform="translate(0 58)">${deco}</g>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-family="Luckiest Guy, Impact, sans-serif" font-size="46" fill="#fff" stroke="#111" stroke-width="3" paint-order="stroke">AND THEY'RE OFF!</text>
    <rect x="${cx - 9}" y="${cy + R - half}" width="18" height="${W}" fill="url(#checker)" stroke="#111" stroke-width="3"/>
    <g transform="translate(${cx - 4} ${cy + R - half - 42})">
      <rect x="-48" y="0" width="104" height="30" rx="8" fill="#ff6a00" stroke="#111" stroke-width="4"/>
      <text x="4" y="23" text-anchor="middle" font-family="Luckiest Guy, Impact, sans-serif" font-size="22" fill="#fff">FINISH</text>
    </g>
  </svg>`;
}

function renderRace() {
  const { result, seats } = data;
  const ranking = result.ranking;
  const nWinners = result.winners.length;

  $('#subtitle').textContent = `${result.ballotsCounted} ballots · ${ranking.length} photos · ${seats} round${seats === 1 ? '' : 's'} to fill`;
  // Starting grid order is shuffled so the winner isn't always out front.
  const grid = ranking.map((id, place) => ({ id, place })).sort((a, b) => hash(`${a.id}grid`) - hash(`${b.id}grid`));
  $('#main').innerHTML = `
    <div class="oval-wrap">
      <div class="oval" id="oval">
        ${trackSVG()}
        ${grid.map((r, k) => `
          <div class="runner" data-id="${esc(r.id)}" data-place="${r.place}" data-slot="${k}">
            <div class="horse-wrap"><span class="dust"></span><span class="dust"></span>
              ${horseSVG({ photo: photoById.get(r.id)?.thumb, color: COLORS[k % 6], mane: COLORS[(k + 3) % 6], cap: COLORS[(k + 2) % 6], num: k + 1 })}
            </div>
          </div>`).join('')}
        <div class="banner"><span id="bannerText"></span></div>
      </div>
      <div class="finish-strip" id="finishStrip" aria-live="polite"></div>
    </div>
    <p class="center"><button class="btn yellow" id="replayBtn">↺ Run it back</button></p>
    <section id="podiumSec" hidden>
      <div class="center"><div class="sub">The winning photos</div></div>
      <div class="podium" id="podium"></div>
      ${ranking.length > nWinners ? `<section class="card tilt-r"><span class="tab">Also ran</span>
        <div class="also">${ranking.slice(nWinners).map((id) => { const p = photoById.get(id); return p ? `<img src="${esc(p.thumb)}" data-zoom="${esc(id)}" alt="">` : ''; }).join('')}</div></section>` : ''}
      <section class="card tilt-l"><span class="tab">The count</span>
        <h2>How ranked choice played out</h2>
        <p>For each round we ran an instant runoff: count everyone's top remaining pick. If nobody has more than half, the last-place photo is knocked out and those ballots move to their next choice. Repeat until someone has a majority. That photo wins the round and is pulled off every ballot before the next round's count.</p>
        ${result.contests.map(renderContest).join('')}
      </section>
    </section>`;

  $('#replayBtn').onclick = () => race();
  $('#main').addEventListener('click', (ev) => {
    const z = ev.target.closest('[data-zoom]');
    if (z) { const p = photoById.get(z.dataset.zoom); showPhoto(p.src, [p.caption, p.contributor && `📸 ${p.contributor}`].filter(Boolean).join(' · ')); }
  });
  addEventListener('resize', () => draw(lastT));
  race();
}

let raf = 0;
let plans = [];
let lastT = 0;

function makePlans() {
  const runners = $$('#oval .runner');
  const nWinners = Math.min(data.result.winners.length, runners.length);
  const gap = Math.min(0.13, 1.05 / Math.max(1, nWinners - 1));
  const PER_ROW = 5;
  return runners.map((el) => {
    const place = Number(el.dataset.place);
    const slot = Number(el.dataset.slot);
    const h = hash(`${el.dataset.id}wob`);
    const col = slot % PER_ROW, row = Math.floor(slot / PER_ROW);
    const wins = place < nWinners;
    return {
      el, wrap: $('.horse-wrap', el), place, wins, crossed: false, facing: 1,
      s0: -(20 + row * 40 + (col % 2) * 16),          // staggered starting grid
      d0: (col - (PER_ROW - 1) / 2) * 27,              // lane across the track
      T: wins ? RACE - 1.1 + place * gap : RACE,       // when it hits the line
      reach: wins ? 1 : Math.max(0.82, 0.985 - 0.004 * (place - nWinners)),
      amp: 0.018 + (h % 9) / 600, freq: 1.6 + (h % 11) / 8, phase: (h % 628) / 100,
      drift: 8 + (h % 7) * 2, dphase: (h % 97) / 15,
    };
  });
}

const ease = (u) => 0.65 * u + 0.35 * u * u * (3 - 2 * u);

function positionAt(p, t) {
  const total = LAP - p.s0;
  const u = Math.min(1, t / p.T);
  const wob = p.amp * Math.sin(p.phase + t * p.freq * 2) * 4 * u * (1 - u); // jostling mid-race
  let s = p.s0 + total * p.reach * (ease(u) + wob);
  if (t > p.T) s += 26 * (1 - Math.exp(-(t - p.T) * 4)); // coast past the line
  const d = Math.max(-62, Math.min(62, p.d0 + p.drift * Math.sin(p.dphase + t * 1.4) * Math.min(1, t)));
  return { s, d };
}

function draw(t) {
  const oval = $('#oval');
  if (!oval) return;
  const k = oval.clientWidth / VB.w;
  const w = HORSE_W * k * (oval.clientWidth < 600 ? 1.3 : 1);
  let leader = null, best = -Infinity;
  for (const p of plans) {
    const { s, d } = positionAt(p, t);
    const pt = trackPoint(s, d);
    if (pt.tx > 0.2) p.facing = 1; else if (pt.tx < -0.2) p.facing = -1;
    const depth = 0.82 + 0.18 * (pt.y / VB.h); // farther side of the oval looks smaller
    p.el.style.width = `${w}px`;
    p.el.style.transform = `translate(${pt.x * k - w / 2}px, ${pt.y * k - w * 0.92}px) scale(${depth})`;
    p.el.style.zIndex = String(Math.round(pt.y));
    p.wrap.style.transform = p.facing < 0 ? 'scaleX(-1)' : '';
    if (!p.crossed && s < LAP && s > best) { best = s; leader = p; }
  }
  for (const p of plans) p.el.classList.toggle('leader', p === leader && t > 0.3);
}

function addFinisher(p) {
  const strip = $('#finishStrip');
  const photo = photoById.get(p.el.dataset.id);
  strip.insertAdjacentHTML('beforeend', `
    <div class="fin" style="--c:${COLORS[p.place % 6]}">
      <span class="fin-n">${p.place === 0 ? '🏆' : ORD(p.place + 1)}</span>
      <img src="${esc(photo?.thumb)}" alt="">
      <span class="fin-r">Round ${p.place + 1}</span>
    </div>`);
}

function race() {
  cancelAnimationFrame(raf);
  plans = makePlans();
  $('#finishStrip').innerHTML = '<span class="fin-label">Finish line:</span>';
  $('#podiumSec').hidden = true;
  $$('.win').forEach((w) => w.classList.remove('in'));
  for (const p of plans) p.el.classList.remove('running', 'leader');
  lastT = 0;
  draw(0);

  if (reduced) {
    lastT = RACE;
    draw(RACE);
    plans.filter((p) => p.wins).sort((a, b) => a.place - b.place).forEach(addFinisher);
    return revealPodium();
  }

  $('#oval').scrollIntoView({ behavior: 'smooth', block: 'center' });
  const banner = $('#bannerText');
  const say = (txt) => { banner.textContent = txt; banner.classList.remove('go'); void banner.offsetWidth; banner.classList.add('go'); };
  say('Ready?');
  setTimeout(() => say('GO!'), 450);
  setTimeout(() => {
    plans.forEach((p) => p.el.classList.add('running'));
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(RACE, (now - t0) / 1000);
      lastT = t;
      draw(t);
      for (const p of plans) {
        if (!p.crossed && t >= p.T && p.wins) { p.crossed = true; addFinisher(p); }
      }
      if (t < RACE) raf = requestAnimationFrame(tick);
      else {
        plans.forEach((p) => p.el.classList.remove('running', 'leader'));
        confetti(160);
        revealPodium();
      }
    };
    raf = requestAnimationFrame(tick);
  }, 650);
}

function revealPodium() {
  const { result } = data;
  const pod = $('#podium');
  pod.innerHTML = result.winners.map((id, k) => {
    const p = photoById.get(id);
    const c = result.contests[k];
    const last = c.rounds[c.rounds.length - 1];
    const pct = last.active ? Math.round((last.counts[id] / last.active) * 100) : 0;
    const how = c.rounds.length === 1 && last.reason === 'majority'
      ? `Won outright with ${pct}% of first choices`
      : last.reason === 'majority' ? `Won after ${c.rounds.length} counts with ${pct}% of the vote`
      : last.reason === 'last one standing' ? `Last one standing after ${c.rounds.length} counts`
      : 'Won on a tie-break';
    return `<div class="win">
      <span class="round" style="background:${COLORS[k % 6]}">Round ${k + 1}</span>
      <img src="${esc(p?.src)}" data-zoom="${esc(id)}" alt="">
      <div class="meta">${[p?.contributor && `📸 ${esc(p.contributor)}`, p?.caption && esc(p.caption)].filter(Boolean).join(' · ')}<small>${how}</small></div>
    </div>`;
  }).join('');
  $('#podiumSec').hidden = false;
  $$('.win').forEach((w, i) => setTimeout(() => w.classList.add('in'), reduced ? 0 : 120 * i));
}

function renderContest(c, k) {
  const thumb = (id) => esc(photoById.get(id)?.thumb || '');
  const rounds = c.rounds.map((r, i) => {
    const max = Math.max(1, ...Object.values(r.counts));
    const entries = Object.entries(r.counts).sort((a, b) => b[1] - a[1]);
    const shown = entries.filter(([, n]) => n > 0);
    const zeros = entries.length - shown.length;
    return `<div class="rnd">Count ${i + 1}${r.exhausted ? ` <span class="muted">(${r.exhausted} ballot${r.exhausted === 1 ? '' : 's'} had no picks left)</span>` : ''}</div>
      ${shown.map(([id, n], j) => `<div class="bar ${r.winner === id ? 'won' : ''} ${r.eliminated.includes(id) ? 'out' : ''}">
        <img src="${thumb(id)}" alt="">
        <div class="fill" style="width:${(n / max) * 60}%;background:${COLORS[j % 6]}"></div>
        <b>${n}</b>${r.winner === id ? ' 🏆' : ''}${r.eliminated.includes(id) ? ' ❌ out' : ''}
      </div>`).join('')}
      ${zeros ? `<div class="muted" style="font-size:14px">${zeros} photo${zeros === 1 ? '' : 's'} with no votes${r.eliminated.length ? ' knocked out' : ''}</div>` : ''}`;
  }).join('');
  return `<details class="count" ${k === 0 ? 'open' : ''}><summary>Round ${k + 1} photo</summary>${rounds}</details>`;
}

load().catch((err) => { $('#main').innerHTML = `<div class="card center">${esc(err.message)}</div>`; });
