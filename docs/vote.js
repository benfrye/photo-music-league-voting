import { $, $$, apiGet, apiPost, loadAlbum, loadPhotoUrls, cachedAlbum, remember, recall, forget, phoneKey, picHTML, photoUrl, esc, toast, confetti, lightbox, ask, COLORS } from './common.js?v=mw6g0r3r';

const phone = localStorage.getItem('phone');
if (!phone) location.replace('index.html');
const showPhoto = lightbox();
let data = null;
let ranking = [];
let editing = false;
const photoById = new Map();
const draftKey = `ballot:${String(phone).replace(/\D/g, '')}`;

const color = (i) => COLORS[i % COLORS.length];

const meKey = `me:${phoneKey(phone)}`;
let rendered = null; // which screen is up: 'skeleton' | 'setup' | 'closed' | 'done' | 'ballot' | 'error'

function setData(me, album) {
  data = {
    election: { title: me.league.title, seats: me.league.rounds, status: me.league.status },
    voter: { name: me.voter.name, votedAt: me.voter.voted },
    ballot: me.ranking,
    photos: me.league.status === 'setup' ? [] : album.photos,
    progress: me.progress,
  };
  photoById.clear();
  data.photos.forEach((p) => photoById.set(p.id, p));
  $('#title').textContent = data.election.title;
  document.title = `Vote · ${data.election.title}`;
}

const screenFor = () => {
  const { status } = data.election;
  if (status === 'setup') return 'setup';
  if (status === 'closed') return 'closed';
  return data.voter.votedAt && !editing ? 'done' : 'ballot';
};

function show() {
  const screen = screenFor();
  if (screen === 'setup') renderMessage('🐴💤', "The horses aren't out of the stable yet. Voting hasn't opened. Check back soon!");
  else if (screen === 'closed') renderMessage('🏁', 'Voting is closed! The race has been run.', true);
  else if (screen === 'done') renderDone();
  else {
    if (rendered !== 'ballot') {
      const draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
      ranking = (draft || data.ballot).filter((id) => photoById.has(id));
    } else {
      ranking = ranking.filter((id) => photoById.has(id)); // keep picks; drop any photo that left the album
    }
    renderBallot();
  }
  rendered = screen;
  performance.mark(`screen:${screen}`);
}

// Before we know anything: shimmering boxes, so the page never sits blank.
function renderSkeleton(album) {
  $('#greeting').textContent = 'Checking you in…';
  $('#tray').hidden = true;
  const ids = album ? album.photos.map((p) => p.id) : Array.from({ length: 12 }, () => '');
  $('#main').innerHTML = `<div class="grid" style="margin-top:26px">${ids.map((id) => `
    <div class="ph" style="cursor:default">${id ? picHTML(id) : '<div class="pic"></div>'}<div class="cap">&nbsp;</div></div>`).join('')}</div>`;
  rendered = 'skeleton';
  performance.mark('screen:skeleton');
}

function renderError(err) {
  $('#greeting').textContent = 'Whoa there, partner';
  $('#tray').hidden = true;
  $('#main').innerHTML = `<div class="card center"><p class="big-msg">🐴❓</p><p>${esc(err.message)}</p>
    <p><a class="btn white" href="index.html">Try another number</a></p></div>`;
  rendered = 'error';
}

const fingerprint = () => data && JSON.stringify([data.election.status, data.election.seats, data.voter.votedAt ? 1 : 0,
  data.voter.name, data.photos.map((p) => p.id).join()]);

async function load() {
  // 1) Draw immediately from last time, if we have it.
  const meCached = recall(meKey);
  const albumCached = cachedAlbum();
  if (meCached && albumCached) { setData(meCached, albumCached); show(); } else renderSkeleton(albumCached);

  // 2) Fetch fresh data and update only what changed.
  let me, album;
  try {
    [me, album] = await Promise.all([apiPost({ action: 'me', phone }), loadAlbum()]);
  } catch (err) {
    if (/guest list|whole phone/i.test(err.message)) { // wrong number: back to check-in
      localStorage.removeItem('phone');
      forget(meKey);
      return renderError(err);
    }
    if (rendered === 'skeleton') return renderError(err);
    toast(`Couldn't refresh: ${err.message}`, true);
    return;
  }
  remember(meKey, me);
  const before = rendered === 'skeleton' ? null : fingerprint();
  const wasDone = rendered === 'done';
  setData(me, album);
  if (!before || before !== fingerprint()) show();
  else if (wasDone) updateCount();
  if (me.league.status !== 'setup') loadPhotoUrls(album);
  // Warm the results page so it opens instantly.
  apiGet('results').then((r) => remember('results', r)).catch(() => {});
}

function updateCount() {
  const c = $('#doneCount');
  if (c && data) c.textContent = `${data.progress.voted}/${data.progress.total}`;
}

function renderMessage(emoji, msg, showResults = false) {
  $('#greeting').textContent = `Hey ${data.voter.name}!`;
  $('#tray').hidden = true;
  $('#main').innerHTML = `<div class="card center tilt-l"><p class="big-msg">${emoji}</p><p style="font-size:20px">${esc(msg)}</p>
    ${showResults ? '<p><a class="btn purple" href="results.html">See the race 🏇</a></p>' : ''}</div>`;
}

function renderDone(saveState = '') {
  $('#greeting').textContent = `Nice one, ${data.voter.name}!`;
  $('#tray').hidden = true;
  const { voted, total } = data.progress;
  $('#main').innerHTML = `
    <div class="card done-box">
      <div class="stamp">VOTED!</div>
      ${saveState ? `<div><span class="save-chip ${saveState}" id="saveChip">${saveState === 'saving' ? 'Saving your ballot…' : 'Saved ✓'}</span></div>` : ''}
      <p style="font-size:20px;margin-top:${saveState ? 14 : 34}px">Your ballot is in the saddle. <b id="doneCount">${voted}/${total}</b> people have voted.</p>
      <p>Results unlock the moment the last person votes.</p>
      <div class="actions-row">
        <a class="btn purple" href="results.html">Watch the results page 🏇</a>
        <button class="btn white" id="editBtn">Change my picks</button>
      </div>
      <div class="grid" style="margin-top:40px;grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">
        ${data.ballot.filter((id) => photoById.has(id)).map((id, i) => `
          <div class="ph picked" style="cursor:default"><span class="rank" style="background:${color(i)};width:40px;height:40px;font-size:20px">${i + 1}</span>
          ${picHTML(id)}</div>`).join('')}
      </div>
    </div>`;
  $('#editBtn').onclick = () => { editing = true; ranking = data.ballot.filter((id) => photoById.has(id)); renderBallot(); rendered = 'ballot'; };
  rendered = 'done';
  performance.mark(`screen:done${saveState ? `-${saveState}` : ''}`);
}

function renderBallot() {
  const seats = data.election.seats;
  $('#greeting').textContent = `Hey ${data.voter.name}! Pick your ponies`;
  $('#main').innerHTML = `
    <div class="how">
      <div><b>1</b> Tap photos in order. First tap = your #1 favorite.</div>
      <div><b>2</b> Rank as many as you like. We're picking ${seats} round${seats === 1 ? '' : 's'}, so try for at least ${seats}.</div>
      <div><b>3</b> Reorder in your ballot tray (press &amp; hold on phones), then lock it in!</div>
    </div>
    <div class="grid" id="grid">
      ${data.photos.map((p) => `
        <div class="ph" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="Photo ${esc(p.caption || '')}">
          ${picHTML(p.id, p.caption)}
          <button class="zoom" data-zoom="${esc(p.id)}" aria-label="Look closer">🔍</button>
          <div class="cap">${esc(p.contributor ? `📸 ${p.contributor}` : p.caption || '')}</div>
        </div>`).join('')}
    </div>`;
  $('#tray').hidden = false;
  paint();
  setSheet(sheetState);
}

function paint() {
  localStorage.setItem(draftKey, JSON.stringify(ranking));
  const pos = new Map(ranking.map((id, i) => [id, i]));
  for (const card of $$('#grid .ph')) {
    const i = pos.get(card.dataset.id);
    card.classList.toggle('picked', i !== undefined);
    const badge = $('.rank', card);
    if (badge && i !== undefined && badge.textContent === String(i + 1)) continue;
    badge?.remove();
    if (i !== undefined) card.insertAdjacentHTML('afterbegin', `<span class="rank" style="background:${color(i)}">${i + 1}</span>`);
  }
  const seats = data.election.seats;
  $('#trayCount').textContent = ranking.length ? `(${ranking.length})` : '';
  const slots = ranking.map((id, i) => `
    <div class="slot" data-id="${esc(id)}" data-bg-photo="${esc(id)}" style="${photoUrl(id) ? `background-image:url('${esc(photoUrl(id))}')` : ''}" title="Drag to reorder, tap to remove">
      <span class="n" style="background:${color(i)}">${i + 1}</span>
    </div>`);
  for (let i = ranking.length; i < seats; i++) slots.push(`<div class="slot empty"><span class="n" style="background:${color(i)}">${i + 1}</span></div>`);
  $('#slots').innerHTML = slots.join('') || '';
  $('#submitBtn').disabled = ranking.length === 0;
  $('#clearBtn').hidden = ranking.length === 0;
  $('#submitBtn').textContent = editing ? 'Update ballot!' : 'Lock it in!';
  if (sheetState === 'full' && !$('#tray').hidden) setSheet('full'); // tall sheet fits its picks
}

function toggle(id) {
  const i = ranking.indexOf(id);
  if (i >= 0) ranking.splice(i, 1); else ranking.push(id);
  paint();
  if (sheetState === 'peek') { const c = $('#trayCount'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
}

$('#main').addEventListener('click', (ev) => {
  const z = ev.target.closest('[data-zoom]');
  if (z) { const p = photoById.get(z.dataset.zoom); showPhoto(photoUrl(p.id, 'src') || photoUrl(p.id), [p.caption, p.contributor && `📸 ${p.contributor}`].filter(Boolean).join(' · '), photoUrl(p.id, 'video')); return; }
  const card = ev.target.closest('#grid .ph');
  if (card) toggle(card.dataset.id);
});
$('#main').addEventListener('keydown', (ev) => {
  const card = ev.target.closest('#grid .ph');
  if (card && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); toggle(card.dataset.id); }
});

// ----- tray: tap to remove, drag (mouse or touch) to reorder -----
// The tray wraps into rows. The picked-up photo lifts and follows the pointer;
// the others glide to where they'll end up, across rows if needed.
// Mouse: drag right away. Touch: swipe scrolls the tray, press-and-hold lifts.
const slotsEl = $('#slots');
let drag = null;

function filledSlots() { return $$('.slot:not(.empty)', slotsEl); }

// Pointer position inside the tray's scrollable content.
function contentPoint(x, y) {
  const r = slotsEl.getBoundingClientRect();
  return { x: x - r.left - slotsEl.clientLeft + slotsEl.scrollLeft, y: y - r.top - slotsEl.clientTop + slotsEl.scrollTop };
}

function layout(d) {
  const pt = contentPoint(d.x, d.y);
  const cx = pt.x + d.grab.x, cy = pt.y + d.grab.y; // where the lifted photo's centre is
  let to = d.from, best = Infinity;
  d.homes.forEach((h, i) => { const dist = (h.x - cx) ** 2 + (h.y - cy) ** 2; if (dist < best) { best = dist; to = i; } });
  d.to = to;
  d.slots.forEach((el, i) => {
    if (i === d.from) return;
    let j = i;                                   // where this photo will sit
    if (d.from < to && i > d.from && i <= to) j = i - 1;
    if (to < d.from && i >= to && i < d.from) j = i + 1;
    const dx = d.homes[j].x - d.homes[i].x, dy = d.homes[j].y - d.homes[i].y;
    el.style.transform = dx || dy ? `translate(${dx}px, ${dy}px)` : '';
    const n = $('.n', el); n.textContent = j + 1; n.style.background = color(j);
  });
  const n = $('.n', d.el); n.textContent = to + 1; n.style.background = color(to);
  const home = d.homes[d.from];
  d.el.style.transform = `translate(${cx - home.x}px, ${cy - home.y}px) scale(1.18) rotate(-5deg)`;
}

// Drag near an edge of the tray to scroll it.
function autoScroll() {
  if (!drag || !drag.lifted) return;
  const r = slotsEl.getBoundingClientRect();
  const edge = 36;
  const speed = (over) => Math.ceil(over / 3);
  let vx = 0, vy = 0;
  if (drag.y < r.top + edge) vy = -speed(r.top + edge - drag.y);
  else if (drag.y > r.bottom - edge) vy = speed(drag.y - (r.bottom - edge));
  if (drag.x < r.left + edge) vx = -speed(r.left + edge - drag.x);
  else if (drag.x > r.right - edge) vx = speed(drag.x - (r.right - edge));
  if (vx || vy) {
    const before = [slotsEl.scrollLeft, slotsEl.scrollTop];
    slotsEl.scrollLeft += vx; slotsEl.scrollTop += vy;
    if (before[0] !== slotsEl.scrollLeft || before[1] !== slotsEl.scrollTop) layout(drag);
  }
  drag.raf = requestAnimationFrame(autoScroll);
}

slotsEl.addEventListener('pointerdown', (ev) => {
  const el = ev.target.closest('.slot:not(.empty)');
  if (!el || drag) return;
  const slots = filledSlots();
  const homes = slots.map((s) => ({ x: s.offsetLeft + s.offsetWidth / 2, y: s.offsetTop + s.offsetHeight / 2 }));
  const from = slots.indexOf(el);
  const pt = contentPoint(ev.clientX, ev.clientY);
  drag = {
    el, slots, homes, from, to: from, touch: ev.pointerType === 'touch',
    grab: { x: homes[from].x - pt.x, y: homes[from].y - pt.y }, // keep the photo where you grabbed it
    x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, lifted: false,
  };
  try { el.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
  if (drag.touch) drag.hold = setTimeout(() => lift(drag), 200);
});

function lift(d) {
  if (!d || d !== drag || d.lifted) return;
  d.lifted = true;
  slotsEl.classList.add('sorting');
  d.el.classList.add('lifted');
  navigator.vibrate?.(8);
  layout(d);
  d.raf = requestAnimationFrame(autoScroll);
}

// Once a photo is lifted, stop the finger from scrolling the page/tray.
slotsEl.addEventListener('touchmove', (ev) => { if (drag?.lifted) ev.preventDefault(); }, { passive: false });

slotsEl.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  drag.x = ev.clientX;
  drag.y = ev.clientY;
  const far = Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) >= 8;
  if (!drag.lifted) {
    if (!far) return;
    if (drag.touch) { clearTimeout(drag.hold); drag = null; return; } // it's a swipe: let it scroll
    lift(drag);
    return;
  }
  layout(drag);
});

function drop(ev) {
  const d = drag;
  drag = null;
  if (!d) return;
  clearTimeout(d.hold);
  cancelAnimationFrame(d.raf);
  if (!d.lifted) { if (ev.type === 'pointerup') toggle(d.el.dataset.id); return; } // a tap removes it
  // Glide into the gap, then commit the new order.
  const home = d.homes[d.from], dest = d.homes[d.to];
  d.el.classList.remove('lifted');
  d.el.classList.add('landing');
  d.el.style.transform = `translate(${dest.x - home.x}px, ${dest.y - home.y}px)`;
  const id = d.el.dataset.id;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    ranking.splice(d.from, 1);
    ranking.splice(d.to, 0, id);
    slotsEl.classList.remove('sorting');
    const keep = [slotsEl.scrollLeft, slotsEl.scrollTop];
    paint();
    [slotsEl.scrollLeft, slotsEl.scrollTop] = keep;
  };
  d.el.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 260);
}

slotsEl.addEventListener('pointerup', drop);
slotsEl.addEventListener('pointercancel', drop);
slotsEl.addEventListener('dragstart', (ev) => ev.preventDefault());

// ----- bottom sheet: drag the handle/header up or down, or tap to tuck it away -----
const trayEl = $('#tray');
const grabEl = $('#sheetGrab');
let sheetState = sessionStorage.getItem('sheet') || 'half';
let sheetDrag = null;

function sheetSnaps() {
  const peek = grabEl.offsetHeight + 6;
  const row = innerWidth <= 640 ? 60 : 74;
  const half = Math.min(peek + row * 2 + 30, innerHeight * 0.5);
  // Tall mode grows to fit your picks, up to 80% of the screen.
  const content = peek + $('#slots').scrollHeight + 8;
  const full = Math.max(half + 40, Math.min(innerHeight * 0.8, content));
  return { peek, half, full };
}

function setSheet(state) {
  const snaps = sheetSnaps();
  sheetState = snaps[state] ? state : 'half';
  const h = Math.round(snaps[sheetState]);
  document.documentElement.style.setProperty('--sheet-h', `${h}px`);
  trayEl.style.height = '';
  trayEl.classList.toggle('collapsed', sheetState === 'peek');
  $('#sheetHandle').setAttribute('aria-expanded', String(sheetState !== 'peek'));
  sessionStorage.setItem('sheet', sheetState);
}

grabEl.addEventListener('pointerdown', (ev) => {
  if (ev.button > 0 || ev.target.closest('button:not(.sheet-handle)')) return; // let Clear / Lock it in work
  sheetDrag = { y0: ev.clientY, h0: trayEl.offsetHeight, lastY: ev.clientY, lastT: performance.now(), v: 0, moved: false };
  try { grabEl.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
});

grabEl.addEventListener('pointermove', (ev) => {
  const d = sheetDrag;
  if (!d) return;
  const dy = ev.clientY - d.y0;
  if (!d.moved && Math.abs(dy) < 5) return;
  if (!d.moved) { d.moved = true; trayEl.classList.add('resizing'); }
  const { peek, full } = sheetSnaps();
  let h = d.h0 - dy;
  if (h < peek) h = peek - (peek - h) * 0.25;   // a little rubber-band past the ends
  if (h > full) h = full + (h - full) * 0.25;
  trayEl.style.height = `${h}px`;
  const now = performance.now();
  d.v = (ev.clientY - d.lastY) / Math.max(1, now - d.lastT); // px/ms, + is downward
  d.lastY = ev.clientY; d.lastT = now;
});

function endSheetDrag(ev) {
  const d = sheetDrag;
  sheetDrag = null;
  if (!d) return;
  trayEl.classList.remove('resizing');
  if (!d.moved) {
    if (ev.type === 'pointerup') setSheet(sheetState === 'peek' ? 'half' : 'peek'); // tap toggles
    return;
  }
  const h = trayEl.offsetHeight;
  const snaps = sheetSnaps();
  const order = ['peek', 'half', 'full'];
  let target;
  if (d.v < -0.45) target = order.find((k) => snaps[k] > h + 8) || 'full';          // flicked up
  else if (d.v > 0.45) target = [...order].reverse().find((k) => snaps[k] < h - 8) || 'peek'; // flicked down
  else target = order.reduce((a, k) => (Math.abs(snaps[k] - h) < Math.abs(snaps[a] - h) ? k : a), 'half');
  // Animate from where the finger left it to the snap point.
  trayEl.style.height = `${h}px`;
  void trayEl.offsetHeight;
  setSheet(target);
}
grabEl.addEventListener('pointerup', endSheetDrag);
grabEl.addEventListener('pointercancel', endSheetDrag);
$('#sheetHandle').addEventListener('keydown', (ev) => {
  if (ev.key === 'ArrowUp') { ev.preventDefault(); setSheet(sheetState === 'peek' ? 'half' : 'full'); }
  if (ev.key === 'ArrowDown') { ev.preventDefault(); setSheet(sheetState === 'full' ? 'half' : 'peek'); }
});
addEventListener('resize', () => { if (!trayEl.hidden) setSheet(sheetState); });

$('#clearBtn').onclick = async () => {
  const ok = await ask({
    title: 'Clear your whole ballot?',
    body: `All ${ranking.length} of your picks will be removed. You'll have to start over.`,
    yes: 'Yes, clear it', no: 'Keep my picks', danger: true,
  });
  if (!ok) return;
  ranking = [];
  paint();
  toast('Ballot cleared. Fresh start! 🐴');
};

$('#submitBtn').onclick = async () => {
  const seats = data.election.seats;
  if (ranking.length < seats && !(await ask({
    title: `Only ${ranking.length} ranked`,
    body: `We're picking ${seats} round photos. Ranking more keeps your vote counting in later rounds.`,
    yes: 'Submit anyway', no: 'Rank more',
  }))) return;

  // Show the VOTED screen right away; save in the background; undo if it fails.
  const undo = { ballot: data.ballot, votedAt: data.voter.votedAt, voted: data.progress.voted, ranking: [...ranking], editing };
  const firstTime = !data.voter.votedAt;
  data.ballot = [...ranking];
  data.voter.votedAt = new Date().toISOString();
  if (firstTime) data.progress.voted += 1;
  editing = false;
  localStorage.removeItem(draftKey);
  renderDone('saving');
  confetti();
  try {
    const r = await apiPost({ action: 'vote', phone, ranking: data.ballot });
    const chip = $('#saveChip');
    if (chip) { chip.className = 'save-chip saved'; chip.textContent = 'Saved ✓'; }
    const meCached = recall(meKey);
    if (meCached) {
      remember(meKey, { ...meCached, ranking: data.ballot, voter: { ...meCached.voter, voted: data.voter.votedAt }, progress: data.progress });
    }
    if (r.closed) { toast('You were the last vote! To the races! 🏁'); setTimeout(() => (location.href = 'results.html'), 1600); return; }
    // Exact vote count in the background.
    apiPost({ action: 'me', phone }).then((me) => { remember(meKey, me); data.progress = me.progress; updateCount(); }).catch(() => {});
  } catch (err) {
    data.ballot = undo.ballot;
    data.voter.votedAt = undo.votedAt;
    data.progress.voted = undo.voted;
    ranking = undo.ranking;
    editing = !!undo.votedAt;
    localStorage.setItem(draftKey, JSON.stringify(ranking));
    renderBallot();
    rendered = 'ballot';
    toast(`Couldn't save your ballot: ${err.message}`, true);
  }
};

load();
