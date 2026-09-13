'use strict';
/* UNO engine unit tests — run: node test/uno-unit.js */
const assert = require('assert');
const uno = require('../src/uno.js');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

function mk(n) {
  const seats = [];
  for (let i = 0; i < n; i++) seats.push({ id: 'p' + i, name: 'P' + i });
  return uno.createGame({ seats });
}

function forceHand(s, seatId, cards) {
  s.hands[seatId] = cards.map(c => ({ uid: 'x' + Math.random().toString(36).slice(2, 8), color: c.color, value: c.value }));
}

function play(s, seatId, uid, color) {
  return uno.apply(s, seatId, { t: 'playCard', uid, color: color || null });
}

console.log('UNO engine tests');

t('deck has 108 cards with correct distribution', () => {
  const deck = uno.buildDeck();
  assert.strictEqual(deck.length, 108);
  const byVal = {};
  for (const c of deck) byVal[c.value] = (byVal[c.value] || 0) + 1;
  assert.strictEqual(byVal['0'], 4);
  assert.strictEqual(byVal['5'], 8);
  assert.strictEqual(byVal['S'], 8);
  assert.strictEqual(byVal['R'], 8);
  assert.strictEqual(byVal['D2'], 8);
  assert.strictEqual(byVal['W'], 4);
  assert.strictEqual(byVal['W4'], 4);
});

t('each player dealt 7 cards, discard starts non-wild', () => {
  const s = mk(4);
  for (const p of ['p0', 'p1', 'p2', 'p3']) assert.strictEqual(s.hands[p].length, 7);
  assert.strictEqual(s.discard.length, 1);
  assert.ok(s.discard[0].color !== null, 'first card is not a wild');
  assert.strictEqual(s.currentColor, s.discard[0].color);
  assert.strictEqual(s.currentValue, s.discard[0].value);
});

t('playing a matching color works and advances turn', () => {
  const s = mk(3);
  s.currentColor = 'R'; s.currentValue = '5';
  forceHand(s, 'p0', [{ color: 'R', value: '9' }]);
  const r = play(s, 'p0', s.hands.p0[0].uid);
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.discard[s.discard.length - 1].value, '9');
  assert.strictEqual(s.currentColor, 'R');
  assert.strictEqual(s.turnIdx, 1);
});

t('matching value works, non-matching rejected', () => {
  const s = mk(2);
  s.currentColor = 'R'; s.currentValue = '5';
  forceHand(s, 'p0', [{ color: 'G', value: '5' }, { color: 'B', value: '7' }]);
  const r1 = play(s, 'p0', s.hands.p0[0].uid);
  assert.ok(r1.ok, r1.error);
  // new turn for p1
  forceHand(s, 'p1', [{ color: 'G', value: '5' }]); // still matches value 5? currentValue is '5' — yes
  const r2 = play(s, 'p1', s.hands.p1[0].uid);
  assert.ok(r2.ok, r2.error);
  // reject mismatch
  forceHand(s, 'p0', [{ color: 'B', value: '9' }]);
  const r3 = play(s, 'p0', s.hands.p0[0].uid);
  assert.ok(!r3.ok, 'mismatch should be rejected');
});

t('wild changes color (with choice) and wild without choice rejected', () => {
  const s = mk(2);
  s.currentColor = 'R'; s.currentValue = '5';
  forceHand(s, 'p0', [{ color: null, value: 'W' }]);
  const r1 = play(s, 'p0', s.hands.p0[0].uid, 'G');
  assert.ok(r1.ok, r1.error);
  assert.strictEqual(s.currentColor, 'G');
  // no color -> reject
  const s2 = mk(2);
  s2.currentColor = 'R'; s2.currentValue = '5';
  forceHand(s2, 'p0', [{ color: null, value: 'W' }]);
  const r2 = play(s2, 'p0', s2.hands.p0[0].uid, null);
  assert.ok(!r2.ok, 'wild needs a color');
});

t('skip skips the next player', () => {
  const s = mk(3);
  s.currentColor = 'R'; s.currentValue = '5';
  forceHand(s, 'p0', [{ color: 'R', value: 'S' }]);
  const r = play(s, 'p0', s.hands.p0[0].uid);
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.turnIdx, 2, 'p1 skipped, p2 is next');
});

t('reverse flips direction; 2 players acts as skip', () => {
  const s = mk(3);
  s.currentColor = 'R'; s.currentValue = '5';
  forceHand(s, 'p0', [{ color: 'R', value: 'R' }]);
  const r = play(s, 'p0', s.hands.p0[0].uid);
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.dir, -1);
  assert.strictEqual(s.turnIdx, 2, 'reversed to p2');
  // 2 players
  const s2 = mk(2);
  s2.currentColor = 'R'; s2.currentValue = '5';
  forceHand(s2, 'p0', [{ color: 'R', value: 'R' }]);
  const r2 = play(s2, 'p0', s2.hands.p0[0].uid);
  assert.ok(r2.ok, r2.error);
  assert.strictEqual(s2.turnIdx, 0, 'reverse with 2 players = skip back to same player');
});

t('draw two: next player draws 2 and is skipped', () => {
  const s = mk(3);
  s.currentColor = 'R'; s.currentValue = '5';
  forceHand(s, 'p0', [{ color: 'R', value: 'D2' }]);
  const before = s.hands.p1.length;
  const r = play(s, 'p0', s.hands.p0[0].uid);
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.hands.p1.length, before + 2);
  assert.strictEqual(s.turnIdx, 2, 'p1 drew and was skipped');
});

t('wild draw four: next player draws 4 and is skipped', () => {
  const s = mk(3);
  s.currentColor = 'R'; s.currentValue = '5';
  forceHand(s, 'p0', [{ color: null, value: 'W4' }]);
  const before = s.hands.p1.length;
  const r = play(s, 'p0', s.hands.p0[0].uid, 'B');
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.hands.p1.length, before + 4);
  assert.strictEqual(s.currentColor, 'B');
  assert.strictEqual(s.turnIdx, 2);
});

t('draw when nothing playable adds a card and passes', () => {
  const s = mk(2);
  s.currentColor = 'R'; s.currentValue = '5';
  forceHand(s, 'p0', [{ color: 'G', value: '9' }, { color: 'B', value: '3' }]);
  s.deck = [{ uid: 'd', color: 'G', value: '3' }]; // guaranteed non-matching draw
  const before = s.hands.p0.length;
  const r = uno.apply(s, 'p0', { t: 'draw' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.hands.p0.length, before + 1);
  assert.strictEqual(s.turnIdx, 1, 'turn passed after drawing unplayable card');
});

t('after drawing a playable card, may play only the drawn card', () => {
  const s = mk(2);
  s.currentColor = 'R'; s.currentValue = '5';
  forceHand(s, 'p0', [{ color: 'G', value: '9' }]);
  // draw: deck may give any card; force the drawn card to be playable by
  // peeking — simpler: craft deck so top card matches
  s.deck.push({ uid: 'drawn', color: 'R', value: '7' });
  const r = uno.apply(s, 'p0', { t: 'draw' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.drawnUid, 'drawn');
  assert.strictEqual(s.turnIdx, 0, 'still p0\'s turn');
  // play a non-drawn card -> reject
  const r2 = play(s, 'p0', s.hands.p0[0].uid);
  assert.ok(!r2.ok, 'can only play the drawn card');
  // play the drawn card -> ok
  const r3 = play(s, 'p0', 'drawn');
  assert.ok(r3.ok, r3.error);
  assert.strictEqual(s.turnIdx, 1);
});

t('pass after drawing advances the turn', () => {
  const s = mk(2);
  s.currentColor = 'R'; s.currentValue = '5';
  s.deck.push({ uid: 'drawn', color: 'R', value: '7' });
  forceHand(s, 'p0', [{ color: 'G', value: '9' }]);
  uno.apply(s, 'p0', { t: 'draw' });
  const r = uno.apply(s, 'p0', { t: 'pass' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.turnIdx, 1);
  assert.strictEqual(s.drawnUid, null);
});

t('UNO is called when a player drops to one card', () => {
  const s = mk(2);
  s.currentColor = 'R'; s.currentValue = '5';
  forceHand(s, 'p0', [{ color: 'R', value: '2' }, { color: 'R', value: '8' }]);
  const r = play(s, 'p0', s.hands.p0[0].uid);
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.hands.p0.length, 1);
  const last = s.lastAction;
  assert.ok(s.log.some(l => l.text.includes('UNO!')));
  assert.strictEqual(s.phase, 'playing');
});

t('win when hand empties', () => {
  const s = mk(2);
  s.currentColor = 'R'; s.currentValue = '5';
  forceHand(s, 'p0', [{ color: 'R', value: '2' }]);
  const r = play(s, 'p0', s.hands.p0[0].uid);
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.winner, 0);
});

t('discard reshuffles when the deck runs out', () => {
  const s = mk(2);
  s.currentColor = 'R'; s.currentValue = '5';
  s.deck = [];
  // put several cards in the discard
  s.discard = [{ uid: 'top', color: 'R', value: '5' }, { uid: 'a', color: 'G', value: '2' }, { uid: 'b', color: 'B', value: '9' }];
  forceHand(s, 'p0', [{ color: 'G', value: '9' }]);
  const before = s.hands.p0.length;
  const r = uno.apply(s, 'p0', { t: 'draw' });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.hands.p0.length, before + 1, 'drew from reshuffled discard');
  assert.strictEqual(s.discard.length, 1, 'only top card stays');
});

t('bots play a full 4-player game to completion', () => {
  const s = mk(4);
  let guard = 0;
  while (s.phase === 'playing' && guard++ < 600) {
    const seat = s.seats[s.turnIdx];
    const action = uno.botMove(s, seat.id, 'pro');
    assert.ok(action, 'bot action at guard ' + guard);
    const r = uno.apply(s, seat.id, action);
    assert.ok(r.ok, 'guard ' + guard + ': ' + (r.error || ''));
  }
  assert.strictEqual(s.phase, 'over', 'game finished');
  assert.ok(s.winner != null);
  console.log('    (finished in', guard, 'moves, winner P' + s.winner + ')');
});

console.log(passed + ' uno tests passed' + (process.exitCode ? ' — WITH FAILURES' : ''));
