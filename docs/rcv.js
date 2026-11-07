// Ranked-choice voting.
//
// We need one photo per Music League round, so we run "sequential IRV":
// run an instant-runoff election, the winner becomes Round 1's photo, take it
// off every ballot, run it again for Round 2, and so on.
//
// Tie-breaks (in order): counts in earlier rounds of the same contest, then a
// Borda score over all ballots (how highly people ranked it overall), then a
// coin flip seeded by the election id so results never change on refresh.

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function bordaScores(ballots, candidates) {
  const n = candidates.length;
  const score = Object.fromEntries(candidates.map((c) => [c, 0]));
  for (const b of ballots) b.forEach((c, i) => { if (c in score) score[c] += n - i; });
  return score;
}

// Higher = stronger. Used only to break ties.
function makeStrength(ballots, candidates, seed) {
  const borda = bordaScores(ballots, candidates);
  return (c) => [borda[c] ?? 0, hash(`${seed}:${c}`)];
}

function cmpStrength(strength, a, b) {
  const sa = strength(a), sb = strength(b);
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i];
  return 0;
}

export function irv(ballots, candidates, { seed = 'seed', strength } = {}) {
  strength ||= makeStrength(ballots, candidates, seed);
  const continuing = new Set(candidates);
  const rounds = [];

  while (continuing.size > 0) {
    const counts = Object.fromEntries([...continuing].map((c) => [c, 0]));
    let exhausted = 0;
    for (const b of ballots) {
      const top = b.find((c) => continuing.has(c));
      if (top) counts[top]++; else exhausted++;
    }
    const active = ballots.length - exhausted;
    const round = { counts, exhausted, active, eliminated: [], winner: null };
    rounds.push(round);

    // Compare by this round, then earlier rounds (latest first), then strength.
    const cmp = (a, b) => {
      for (let i = rounds.length - 1; i >= 0; i--) {
        const d = (rounds[i].counts[a] ?? 0) - (rounds[i].counts[b] ?? 0);
        if (d !== 0) return d;
      }
      return cmpStrength(strength, a, b);
    };
    const ordered = [...continuing].sort(cmp); // weakest first

    const leader = ordered[ordered.length - 1];
    if (continuing.size === 1 || (active > 0 && counts[leader] * 2 > active)) {
      round.winner = leader;
      round.reason = continuing.size === 1 ? 'last one standing' : 'majority';
      return { winner: leader, rounds };
    }

    const zeros = ordered.filter((c) => counts[c] === 0);
    if (zeros.length === continuing.size) {
      // Nobody ranked any of what's left. Fall back to the tie-break.
      round.winner = leader;
      round.reason = 'tie-break';
      return { winner: leader, rounds };
    }
    const out = zeros.length > 0 ? zeros : [ordered[0]];
    for (const c of out) continuing.delete(c);
    round.eliminated = out;
  }
  return { winner: null, rounds };
}

// seats = how many Music League rounds need a photo.
export function sequentialIRV(rawBallots, candidates, seats, seed = 'seed') {
  const valid = new Set(candidates);
  const ballots = rawBallots.map((b) => [...new Set(b)].filter((c) => valid.has(c)));
  const strength = makeStrength(ballots, candidates, seed);

  const winners = [];
  const contests = [];
  let remaining = [...candidates];
  const total = Math.min(seats, candidates.length);
  for (let k = 0; k < total; k++) {
    const res = irv(ballots, remaining, { strength });
    winners.push(res.winner);
    contests.push({ seat: k + 1, ...res });
    remaining = remaining.filter((c) => c !== res.winner);
  }

  // Full finishing order (for the horse race): winners, then everyone else
  // ordered by how long they survived in the last contest.
  const last = contests[contests.length - 1];
  const survived = {};
  if (last) last.rounds.forEach((r, i) => {
    for (const c of Object.keys(r.counts)) survived[c] = [i, r.counts[c]];
  });
  const rest = remaining.slice().sort((a, b) => {
    const sa = survived[a] || [-1, 0], sb = survived[b] || [-1, 0];
    return (sb[0] - sa[0]) || (sb[1] - sa[1]) || cmpStrength(strength, b, a);
  });

  return { winners, contests, ranking: [...winners, ...rest], ballotsCounted: ballots.filter((b) => b.length).length };
}
