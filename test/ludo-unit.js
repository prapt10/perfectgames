'use strict';
/* Ludo engine unit tests — run: node test/ludo-unit.js */
const assert = require('assert');
const ludo = require('../src/ludo.js');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

function mk(n) {
  const seats = [];
  for (let i = 0; i < n; i++) seats.push({ id: 'p' + i, name: 'P' + i });
  return ludo.createGame({ seats });
}

function setDie(s, v) { s.die = v; }

console.log('Ludo engine tests');

t('2 players get opposite colors, 4 players get all colors', () => {
  const s2 = mk(2);
  assert.deepStrictEqual(s2.seats.map(x => x.color), [0, 2], '2p: red vs yellow (opposite corners)');
  const s4 = mk(4);
  assert.deepStrictEqual(s4.seats.map(x => x.color), [0, 1, 2, 3], '4p: all colors');
});

t('each player starts with 4 tokens in base', () => {
  const s = mk(4);
  for (const c of ['red', 'green', 'yellow', 'blue']) {
    assert.strictEqual(s.tokens[c].length, 4);
    assert.ok(s.tokens[c].every(t => t.state === 'base'));
  }
});

t('track has 52 cells with starts at 0/13/26/39', () => {
  assert.strictEqual(ludo.TRACK.length, 52);
  assert.deepStrictEqual(ludo.STARTS, [0, 13, 26, 39]);
  // loop closes: last cell adjacent to first
  const last = ludo.TRACK[51], first = ludo.TRACK[0];
  assert.ok(Math.abs(last[0] - first[0]) + Math.abs(last[1] - first[1]) <= 2, 'track loop closes');
});

t('rolling enters a token on 6', () => {
  const s = mk(4);
  s.die = 6;
  s.pending = false;
  const legal = ludo.legalMovesFor(s, 0);
  assert.deepStrictEqual(legal, [0, 1, 2, 3], 'all base tokens can enter on 6');
  // apply entry via roll+auto path: force die 6 with only entry possible
  const s2 = mk(4);
  s2.die = 6;
  s2.legal = [0];
  s2.pending = true;
  const r = ludo.apply(s2, 'p0', { t: 'move', token: 0 });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s2.tokens.red[0].state, 'track');
  assert.strictEqual(s2.tokens.red[0].dist, 0);
  assert.deepStrictEqual(ludo.cellOf(0, s2.tokens.red[0]), [13, 6], 'red (bottom-left) enters at (13,6)');
  // green base slot is top-left, its start is (6,1)
  assert.deepStrictEqual(ludo.cellOf(1, s2.tokens.green[0]), [1, 1], 'green sits in the top-left base');
  s2.tokens.green[0].state = 'track'; s2.tokens.green[0].dist = 0;
  assert.deepStrictEqual(ludo.cellOf(1, s2.tokens.green[0]), [6, 1], 'green (top-left) starts at (6,1)');
});

t('entering requires a 6', () => {
  const s = mk(4);
  s.die = 5;
  const legal = ludo.legalMovesFor(s, 0);
  assert.deepStrictEqual(legal, [], 'no entry without a 6');
});

t('roll with no legal moves passes the turn', () => {
  const s = mk(4);
  ludo._setRoll(() => 3); // no tokens on board, die not 6 → no legal moves
  s.pending = false;
  s.turnIdx = 0;
  const before = s.turnIdx;
  const r = ludo.apply(s, 'p0', { t: 'roll' });
  assert.ok(r.ok, r.error);
  assert.notStrictEqual(s.turnIdx, before, 'turn advanced');
});

t('roll with exactly one legal move auto-moves', () => {
  const s = mk(4);
  ludo._setRoll(() => 2);
  s.tokens.red[0].state = 'track';
  s.tokens.red[0].dist = 5;
  s.pending = false;
  const r = ludo.apply(s, 'p0', { t: 'roll' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.tokens.red[0].dist, 7, 'auto-moved 2 steps');
  assert.strictEqual(s.pending, false);
});

t('capture sends opponent back to base (not on safe squares)', () => {
  const s = mk(4);
  // red token lands on green token's cell
  s.tokens.red[0].state = 'track'; s.tokens.red[0].dist = 10; // TRACK[10] = [0,6]
  s.tokens.green[0].state = 'track'; s.tokens.green[0].dist = 50; // green at TRACK[(13+50)%52]=[0,7]
  s.die = 1;
  // red moves 1: dist 11 → TRACK[11] = [0,7] (safe? SAFE has 8,21,34,47 + starts — 11 not safe)
  s.legal = [0];
  s.pending = true;
  const r = ludo.apply(s, 'p0', { t: 'move', token: 0 });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.tokens.green[0].state, 'base', 'green captured');
  // safe-square test: green on safe idx8, red lands there
  const s2 = mk(4);
  s2.tokens.red[0].state = 'track'; s2.tokens.red[0].dist = 7;
  s2.tokens.green[0].state = 'track'; s2.tokens.green[0].dist = 8; // safe
  s2.die = 1;
  s2.legal = [0];
  s2.pending = true;
  const r2 = ludo.apply(s2, 'p0', { t: 'move', token: 0 });
  assert.ok(r2.ok, r2.error);
  assert.strictEqual(s2.tokens.green[0].state, 'track', 'no capture on safe square');
});

t('token travels the full loop then enters home column', () => {
  const s = mk(4);
  s.tokens.red[0].state = 'track';
  s.tokens.red[0].dist = 51; // last track cell before start
  s.die = 1;
  s.legal = [0];
  s.pending = true;
  const r = ludo.apply(s, 'p0', { t: 'move', token: 0 });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.tokens.red[0].state, 'home');
  assert.strictEqual(s.tokens.red[0].dist, 0);
  assert.deepStrictEqual(ludo.cellOf(0, s.tokens.red[0]), [8, 6], 'red home column bottom of center (8,6)');
});

t('token reaches center and finishes', () => {
  const s = mk(4);
  s.tokens.red[0].state = 'home';
  s.tokens.red[0].dist = 1;
  s.die = 1;
  s.legal = [0];
  s.pending = true;
  const r = ludo.apply(s, 'p0', { t: 'move', token: 0 });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.tokens.red[0].state, 'done');
});

t('overshoot in home column is illegal', () => {
  const s = mk(4);
  s.tokens.red[0].state = 'home';
  s.tokens.red[0].dist = 1;
  s.die = 3;
  const legal = ludo.legalMovesFor(s, 0);
  assert.deepStrictEqual(legal, [], 'cannot overshoot the center');
});

t('three sixes in a row lose the turn', () => {
  const s = mk(4);
  ludo._setRoll(() => 6);
  s.tokens.red[0].state = 'track'; s.tokens.red[0].dist = 3;
  s.turnIdx = 0;
  s.sixes = 2;
  s.pending = false;
  const r = ludo.apply(s, 'p0', { t: 'roll' });
  assert.ok(r.ok, r.error);
  assert.notStrictEqual(s.turnIdx, 0, 'turn passed after 3 sixes');
});

t('win when all four tokens are home', () => {
  const s = mk(4);
  s.tokens.red[0].state = 'done';
  s.tokens.red[1].state = 'done';
  s.tokens.red[2].state = 'done';
  s.tokens.red[3].state = 'home';
  s.tokens.red[3].dist = 1;
  s.die = 1;
  s.legal = [3];
  s.pending = true;
  const r = ludo.apply(s, 'p0', { t: 'move', token: 3 });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.winner, 0);
});

t('bots produce valid actions for a full 4-player game', () => {
  const s = mk(4);
  let guard = 0;
  while (s.phase === 'playing' && guard++ < 400) {
    const seat = s.seats[s.turnIdx];
    const action = ludo.botMove(s, seat.id, 'pro');
    assert.ok(action, 'bot action at guard ' + guard);
    const r = ludo.apply(s, seat.id, action);
    assert.ok(r.ok, 'guard ' + guard + ': ' + (r.error || ''));
  }
  assert.strictEqual(s.phase, 'over', 'game finished');
  assert.ok(s.winner != null);
  console.log('    (finished in', guard, 'moves, winner', ['red','green','yellow','blue'][s.winner], ')');
});

console.log(passed + ' ludo tests passed' + (process.exitCode ? ' — WITH FAILURES' : ''));
