import { $, $$, apiPost, loadPhotos, esc, toast, confetti, lightbox, ask, COLORS } from './common.js';

const phone = localStorage.getItem('phone');
if (!phone) location.replace('index.html');
const showPhoto = lightbox();
let data = null;
let ranking = [];
let editing = false;
const photoById = new Map();
const draftKey = `ballot:${String(phone).replace(/\D/g, '')}`;

const color = (i) => COLORS[i % COLORS.length];

async function load() {
  try {
    const [me, photos] = await Promise.all([apiPost({ action: 'me', phone }), loadPhotos()]);
    data = {
      election: { title: me.league.title, seats: me.league.rounds, status: me.league.status },
      voter: { name: me.voter.name, votedAt: me.voter.voted },
      ballot: me.ranking,
      photos: me.league.status === 'setup' ? [] : photos,
      progress: me.progress,
    };
  } catch (err) {
    $('#greeting').textContent = 'Whoa there, partner';
    $('#main').innerHTML = `<div class="card center"><p class="big-msg">🐴❓</p><p>${esc(err.message)}</p>
      <p><a class="btn white" href="index.html">Try another number</a></p></div>`;
    return;
  }
  data.photos.forEach((p) => photoById.set(p.id, p));
  $('#title').textContent = data.election.title;
  document.title = `Vote · ${data.election.title}`;

  const draft = JSON.parse(localStorage.getItem(draftKey) || 'null');
  ranking = (draft || data.ballot).filter((id) => photoById.has(id));

  const { status } = data.election;
  if (status === 'setup') return renderMessage('🐴💤', "The horses aren't out of the stable yet. Voting hasn't opened. Check back soon!");
  if (status === 'closed') return renderMessage('🏁', 'Voting is closed! The race has been run.', true);
  if (data.voter.votedAt && !editing) return renderDone();
  renderBallot();
}

function renderMessage(emoji, msg, showResults = false) {
  $('#greeting').textContent = `Hey ${data.voter.name}!`;
  $('#tray').hidden = true;
  $('#main').innerHTML = `<div class="card center tilt-l"><p class="big-msg">${emoji}</p><p style="font-size:20px">${esc(msg)}</p>
    ${showResults ? '<p><a class="btn purple" href="results.html">See the race 🏇</a></p>' : ''}</div>`;
}

function renderDone() {
  $('#greeting').textContent = `Nice one, ${data.voter.name}!`;
  $('#tray').hidden = true;
  const { voted, total } = data.progress;
  $('#main').innerHTML = `
    <div class="card done-box">
      <div class="stamp">VOTED!</div>
      <p style="font-size:20px;margin-top:34px">Your ballot is in the saddle. <b>${voted}/${total}</b> people have voted.</p>
      <p>Results unlock the moment the last person votes.</p>
      <div class="actions-row">
        <a class="btn purple" href="results.html">Watch the results page 🏇</a>
        <button class="btn white" id="editBtn">Change my picks</button>
      </div>
      <div class="grid" style="margin-top:40px;grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">
        ${data.ballot.filter((id) => photoById.has(id)).map((id, i) => `
          <div class="ph picked" style="cursor:default"><span class="rank" style="background:${color(i)};width:40px;height:40px;font-size:20px">${i + 1}</span>
          <img src="${esc(photoById.get(id).thumb)}" alt=""></div>`).join('')}
      </div>
    </div>`;
  $('#editBtn').onclick = () => { editing = true; ranking = data.ballot.filter((id) => photoById.has(id)); renderBallot(); };
}

function renderBallot() {
  const seats = data.election.seats;
  $('#greeting').textContent = `Hey ${data.voter.name}! Pick your ponies`;
  $('#main').innerHTML = `
    <div class="how">
      <div><b>1</b> Tap photos in order. First tap = your #1 favorite.</div>
      <div><b>2</b> Rank as many as you like. We're picking ${seats} round${seats === 1 ? '' : 's'}, so try for at least ${seats}.</div>
      <div><b>3</b> Drag in your ballot tray to reorder, then lock it in!</div>
    </div>
    <div class="grid" id="grid">
      ${data.photos.map((p) => `
        <div class="ph" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="Photo ${esc(p.caption || '')}">
          <img src="${esc(p.thumb)}" loading="lazy" alt="${esc(p.caption || '')}">
          <button class="zoom" data-zoom="${esc(p.id)}" aria-label="Look closer">🔍</button>
          <div class="cap">${esc(p.contributor ? `📸 ${p.contributor}` : p.caption || '')}</div>
        </div>`).join('')}
    </div>`;
  $('#tray').hidden = false;
  paint();
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
    <div class="slot" data-id="${esc(id)}" style="background-image:url('${esc(photoById.get(id).thumb)}')" title="Drag to reorder, tap to remove">
      <span class="n" style="background:${color(i)}">${i + 1}</span>
    </div>`);
  for (let i = ranking.length; i < seats; i++) slots.push(`<div class="slot empty"><span class="n" style="background:${color(i)}">${i + 1}</span></div>`);
  $('#slots').innerHTML = slots.join('') || '';
  $('#submitBtn').disabled = ranking.length === 0;
  $('#clearBtn').hidden = ranking.length === 0;
  $('#submitBtn').textContent = editing ? 'Update ballot!' : 'Lock it in!';
}

function toggle(id) {
  const i = ranking.indexOf(id);
  if (i >= 0) ranking.splice(i, 1); else ranking.push(id);
  paint();
}

$('#main').addEventListener('click', (ev) => {
  const z = ev.target.closest('[data-zoom]');
  if (z) { const p = photoById.get(z.dataset.zoom); showPhoto(p.src, [p.caption, p.contributor && `📸 ${p.contributor}`].filter(Boolean).join(' · ')); return; }
  const card = ev.target.closest('#grid .ph');
  if (card) toggle(card.dataset.id);
});
$('#main').addEventListener('keydown', (ev) => {
  const card = ev.target.closest('#grid .ph');
  if (card && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); toggle(card.dataset.id); }
});

// ----- tray: tap to remove, drag (mouse or touch) to reorder -----
// The picked-up photo lifts and follows the pointer; the others slide aside to
// open a gap where it will land. Works the same in both directions.
const slotsEl = $('#slots');
let drag = null;

function filledSlots() { return $$('.slot:not(.empty)', slotsEl); }

function travelled(d) { return d.dx + (slotsEl.scrollLeft - d.scroll0); }

function targetIndex(d) {
  return Math.max(0, Math.min(d.count - 1, d.from + Math.round(travelled(d) / d.step)));
}

function layout(d) {
  const to = targetIndex(d);
  d.to = to;
  d.slots.forEach((el, i) => {
    if (i === d.from) return;
    let shift = 0;
    if (d.from < to && i > d.from && i <= to) shift = -d.step;   // slide left to fill
    if (to < d.from && i >= to && i < d.from) shift = d.step;    // slide right to make room
    el.style.transform = shift ? `translateX(${shift}px)` : '';
    // Live rank numbers: where each photo ends up if dropped now.
    const rank = i + Math.sign(shift);
    const n = $('.n', el); n.textContent = rank + 1; n.style.background = color(rank);
  });
  const n = $('.n', d.el); n.textContent = to + 1; n.style.background = color(to);
  d.el.style.transform = `translate(${travelled(d)}px, ${d.dy}px) scale(1.18) rotate(-5deg)`;
}

// Drag near the tray's edge to scroll it (long ballots).
function autoScroll() {
  if (!drag || !drag.moved) return;
  const r = slotsEl.getBoundingClientRect();
  const edge = 40;
  let v = 0;
  if (drag.x < r.left + edge) v = -Math.ceil((r.left + edge - drag.x) / 4);
  else if (drag.x > r.right - edge) v = Math.ceil((drag.x - (r.right - edge)) / 4);
  if (v) { slotsEl.scrollLeft += v; layout(drag); }
  drag.raf = requestAnimationFrame(autoScroll);
}

slotsEl.addEventListener('pointerdown', (ev) => {
  const el = ev.target.closest('.slot:not(.empty)');
  if (!el || drag) return;
  const slots = filledSlots();
  const step = slots.length > 1 ? slots[1].offsetLeft - slots[0].offsetLeft : el.offsetWidth + 10;
  drag = {
    el, slots, step, from: slots.indexOf(el), to: slots.indexOf(el), count: slots.length,
    x0: ev.clientX, y0: ev.clientY, x: ev.clientX, dx: 0, dy: 0, scroll0: slotsEl.scrollLeft, moved: false,
  };
  try { el.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
});

slotsEl.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  drag.x = ev.clientX;
  drag.dx = ev.clientX - drag.x0;
  drag.dy = Math.max(-10, Math.min(10, (ev.clientY - drag.y0) * 0.3));
  if (!drag.moved) {
    if (Math.hypot(drag.dx, ev.clientY - drag.y0) < 6) return;
    drag.moved = true;
    slotsEl.classList.add('sorting');
    drag.el.classList.add('lifted');
    navigator.vibrate?.(8);
    drag.raf = requestAnimationFrame(autoScroll);
  }
  layout(drag);
});

function drop() {
  const d = drag;
  drag = null;
  if (!d) return;
  cancelAnimationFrame(d.raf);
  if (!d.moved) { toggle(d.el.dataset.id); return; }
  // Glide into the gap, then commit the new order.
  d.el.classList.remove('lifted');
  d.el.classList.add('landing');
  d.el.style.transform = `translate(${(d.to - d.from) * d.step}px, 0)`;
  const id = d.el.dataset.id;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    ranking.splice(d.from, 1);
    ranking.splice(d.to, 0, id);
    slotsEl.classList.remove('sorting');
    const keep = slotsEl.scrollLeft;
    paint();
    slotsEl.scrollLeft = keep;
  };
  d.el.addEventListener('transitionend', finish, { once: true });
  setTimeout(finish, 260);
}

slotsEl.addEventListener('pointerup', drop);
slotsEl.addEventListener('pointercancel', drop);
slotsEl.addEventListener('dragstart', (ev) => ev.preventDefault());

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
  const btn = $('#submitBtn'); // ev.currentTarget is null after an await
  const seats = data.election.seats;
  if (ranking.length < seats && !(await ask({
    title: `Only ${ranking.length} ranked`,
    body: `We're picking ${seats} round photos. Ranking more keeps your vote counting in later rounds.`,
    yes: 'Submit anyway', no: 'Rank more',
  }))) return;
  btn.disabled = true;
  try {
    const r = await apiPost({ action: 'vote', phone, ranking });
    localStorage.removeItem(draftKey);
    confetti();
    editing = false;
    if (r.closed) { toast("You were the last vote! To the races! 🏁"); setTimeout(() => (location.href = 'results.html'), 1600); return; }
    toast('Yeehaw! Ballot saved 🤠');
    await load();
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
  }
};

load();
