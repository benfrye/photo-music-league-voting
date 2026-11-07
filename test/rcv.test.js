import test from 'node:test';
import assert from 'node:assert/strict';
import { irv, sequentialIRV } from '../docs/rcv.js';

test('majority on first round wins', () => {
  const r = irv([['a'], ['a'], ['b']], ['a', 'b', 'c']);
  assert.equal(r.winner, 'a');
  assert.equal(r.rounds.length, 1);
});

test('transfers from eliminated candidate decide the winner', () => {
  // a:4, b:3, c:2 (c voters prefer b) -> b wins 5-4
  const ballots = [
    ...Array(4).fill(['a']),
    ...Array(3).fill(['b']),
    ...Array(2).fill(['c', 'b']),
  ];
  const r = irv(ballots, ['a', 'b', 'c']);
  assert.equal(r.winner, 'b');
  assert.deepEqual(r.rounds[0].eliminated, ['c']);
});

test('zero-vote candidates are eliminated together', () => {
  const r = irv([['a'], ['b'], ['c', 'a']], ['a', 'b', 'c', 'x', 'y', 'z']);
  assert.deepEqual(r.rounds[0].eliminated.sort(), ['x', 'y', 'z']);
  assert.equal(r.winner, 'a');
});

test('exhausted ballots do not count toward majority', () => {
  // a:2, b:2, c:1 (c ballot exhausts). Eliminate c -> a:2 b:2 of 4 active, tie.
  // Tie on this round and all earlier ones -> Borda: a ranked 2nd by someone.
  const ballots = [['a'], ['a'], ['b'], ['b'], ['c'], ['d', 'a']];
  const r = irv(ballots, ['a', 'b', 'c', 'd']);
  assert.equal(r.winner, 'a');
});

test('sequential IRV picks distinct winners in order', () => {
  const ballots = [
    ['a', 'b', 'c'], ['a', 'c', 'b'], ['b', 'a', 'c'], ['b', 'c', 'a'], ['c', 'b', 'a'],
  ];
  const res = sequentialIRV(ballots, ['a', 'b', 'c', 'd'], 3, 'e1');
  assert.equal(res.winners.length, 3);
  assert.equal(new Set(res.winners).size, 3);
  assert.equal(res.winners[0], 'b'); // c's voter transfers to b
  assert.deepEqual(res.ranking.slice(0, 3), res.winners);
  assert.equal(res.ranking.length, 4);
  assert.equal(res.ranking[3], 'd');
});

test('more seats than candidates and no ballots still resolves deterministically', () => {
  const a = sequentialIRV([], ['p', 'q'], 5, 'seed');
  const b = sequentialIRV([], ['p', 'q'], 5, 'seed');
  assert.equal(a.winners.length, 2);
  assert.deepEqual(a.winners, b.winners);
});

test('ignores unknown and duplicate entries on ballots', () => {
  const res = sequentialIRV([['zzz', 'a', 'a', 'b']], ['a', 'b'], 1);
  assert.equal(res.winners[0], 'a');
});
