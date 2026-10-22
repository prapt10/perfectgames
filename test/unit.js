'use strict';
/* Engine unit tests — run: node test/unit.js */
const assert = require('assert');
const eng = require('../src/sequence.js');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

function seat(id, name, isBot, skill) { return { id, name, isBot: !!isBot, skill: skill || 'pro' }; }
function mk(n, cfg) {
  const seats = [];
  for (let i = 0; i < n; i++) seats.push(seat('p' + i, 'P' + i, cfg && cfg.botSeats && cfg.botSeats.includes(i)));
  return eng.createGame({ seats });
}
function playableMove(s, seatId) {
  for (const c of s.hands[seatId]) {
    const kind = eng.kindOf(c.key);
    if (kind === 'n') {
      const open = [];
      for (let i = 0; i < 100; i++) {
        const cell = s.board[i];
        if (!cell.corner && cell.chip === null && cell.key === c.key) open.push(i);
      }
      if (open.length) return { t: 'play', uid: c.uid, cell: open[0] };
    } else if (kind === 'w2') {
      for (let i = 0; i < 100; i++) if (!s.board[i].corner && s.board[i].chip === null)
        return { t: 'play', uid: c.uid, cell: i };
    } else {
      for (let i = 0; i < 100; i++) {
        const cell = s.board[i];
        if (cell.chip !== null && cell.chip !== eng.teamOf(s, seatId) && !s.locked.has(i) && !cell.corner)
          return { t: 'playJack1', uid: c.uid, cell: i };
      }
      return { t: 'playJack1', uid: c.uid, cell: null };
    }
  }
  return null;
}
// like playableMove, but only ever returns a move that actually places a chip on
// the board (skips one-eyed Jacks, which just remove/discard and never place) —
// for tests that need to inspect the resulting board cell.
function placingMove(s, seatId) {
  for (const c of s.hands[seatId]) {
    const kind = eng.kindOf(c.key);
    if (kind === 'n') {
      for (let i = 0; i < 100; i++) {
        const cell = s.board[i];
        if (!cell.corner && cell.chip === null && cell.key === c.key) return { t: 'play', uid: c.uid, cell: i };
      }
    } else if (kind === 'w2') {
      for (let i = 0; i < 100; i++) if (!s.board[i].corner && s.board[i].chip === null)
        return { t: 'play', uid: c.uid, cell: i };
    }
  }
  return null;
}

console.log('Sequence engine tests');

t('2 players: 7 cards, 2 teams, 2 sequences to win', () => {
  const s = mk(2);
  assert.strictEqual(s.seats.length, 2);
  assert.strictEqual(s.hands.p0.length, 7);
  assert.strictEqual(s.teamCount, 2);
  assert.strictEqual(s.seqNeeded, 2);
  assert.deepStrictEqual(s.seats.map(x => x.team), [0, 1]);
});

t('3 players: 6 cards, 3 solo teams, 1 sequence to win', () => {
  const s = mk(3);
  assert.strictEqual(s.hands.p0.length, 6);
  assert.strictEqual(s.teamCount, 3);
  assert.strictEqual(s.seqNeeded, 1);
  assert.deepStrictEqual(s.seats.map(x => x.team), [0, 1, 2]);
});

t('4 players: 2v2 teams', () => {
  const s = mk(4);
  assert.deepStrictEqual(s.seats.map(x => x.team), [0, 0, 1, 1]);
  assert.strictEqual(s.seqNeeded, 2);
});

t('6 players: 3v3 teams', () => {
  const s = mk(6);
  assert.deepStrictEqual(s.seats.map(x => x.team), [0, 0, 0, 1, 1, 1]);
});

t('board: 96 card spaces + 4 corners, every card exactly twice', () => {
  const s = mk(2);
  const corners = s.board.filter(c => c.corner);
  assert.strictEqual(corners.length, 4);
  const cards = s.board.filter(c => !c.corner);
  assert.strictEqual(cards.length, 96);
  const seen = new Map();
  for (const c of cards) seen.set(c.key, (seen.get(c.key) || 0) + 1);
  assert.strictEqual(seen.size, 48);
  for (const v of seen.values()) assert.strictEqual(v, 2);
});

t('play a normal card: chip placed, card discarded, hand refilled, turn passes', () => {
  const s = mk(3);
  const seatId = eng.turnOf(s);
  const before = s.hands[seatId].length;
  const move = placingMove(s, seatId);
  assert.ok(move);
  const r = eng.apply(s, seatId, move);
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.hands[seatId].length, before);
  const cell = s.board[move.cell];
  assert.strictEqual(cell.chip, eng.teamOf(s, seatId));
  assert.notStrictEqual(eng.turnOf(s), seatId);
  assert.ok(s.discard.length >= 1);
});

t('invalid moves are rejected', () => {
  const s = mk(3);
  const seatId = eng.turnOf(s);
  const hand = s.hands[seatId];
  // use an ordinary numbered card — a wild (two-eyed) jack is legally playable
  // anywhere, so picking one here would make the "mismatched cell" premise false
  const anyCard = hand.find(c => eng.kindOf(c.key) === 'n') || hand[0];
  // play a mismatched cell
  let mismatched = -1;
  for (let i = 0; i < 100; i++) {
    if (!s.board[i].corner && s.board[i].key !== anyCard.key && s.board[i].chip === null) { mismatched = i; break; }
  }
  const r1 = eng.apply(s, seatId, { t: 'play', uid: anyCard.uid, cell: mismatched });
  assert.ok(!r1.ok);
  // not your turn
  const other = s.seats.find(x => x.id !== seatId);
  const r2 = eng.apply(s, other.id, { t: 'play', uid: s.hands[other.id][0].uid, cell: mismatched });
  assert.ok(!r2.ok);
  // bogus uid
  const r3 = eng.apply(s, seatId, { t: 'play', uid: 'nope', cell: 5 });
  assert.ok(!r3.ok);
});

t('two-eyed jack places anywhere open, never on a corner', () => {
  const s = mk(2);
  s.hands.p0 = [{ uid: 'j1', key: 'JH' }];
  const r1 = eng.apply(s, 'p0', { t: 'play', uid: 'j1', cell: 99 }); // corner
  assert.ok(!r1.ok);
  s.hands.p0 = [{ uid: 'j2', key: 'JD' }];
  const r2 = eng.apply(s, 'p0', { t: 'play', uid: 'j2', cell: 55 });
  assert.ok(r2.ok, r2.error);
  assert.strictEqual(s.board[55].chip, 0);
});

t('one-eyed jack removes opponent chip, not own/locked/corner chips', () => {
  const s = mk(2);
  s.board[10].chip = 1; // opponent chip
  s.hands.p0 = [{ uid: 'j1', key: 'JS' }];
  eng.lockAll(s);
  const r = eng.apply(s, 'p0', { t: 'playJack1', uid: 'j1', cell: 10 });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.board[10].chip, null);

  // own chip — reject
  s.board[11].chip = 1; // p1's own team chip
  s.hands.p1 = [{ uid: 'j2', key: 'JC' }];
  const r2 = eng.apply(s, 'p1', { t: 'playJack1', uid: 'j2', cell: 11 });
  assert.ok(!r2.ok);

  // locked (completed sequence) chip — reject
  for (let i = 0; i < 5; i++) s.board[20 + i * 10].chip = 1; // column 20..60 (row 2..6 col 0)
  eng.lockAll(s);
  assert.ok(s.locked.has(20));
  s.hands.p0 = [{ uid: 'j3', key: 'JS' }];
  const r3 = eng.apply(s, 'p0', { t: 'playJack1', uid: 'j3', cell: 20 });
  assert.ok(!r3.ok);
});

t('one-eyed jack with no target just discards', () => {
  const s = mk(2);
  s.board.forEach(c => { if (!c.corner) c.chip = c.chip; }); // keep board as is (empty)
  s.hands.p0 = [{ uid: 'j1', key: 'JC' }];
  const r = eng.apply(s, 'p0', { t: 'playJack1', uid: 'j1', cell: null });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.hands.p0.length, 1); // drew a replacement
});

t('dead card swap: trades, keeps turn, once per turn', () => {
  const s = mk(2);
  // cover both copies of a chosen card
  const target = s.hands.p0.find(c => eng.kindOf(c.key) === 'n');
  const copies = [];
  for (let i = 0; i < 100; i++) if (s.board[i].key === target.key && !s.board[i].corner) copies.push(i);
  copies.forEach(i => (s.board[i].chip = 1));
  const r = eng.apply(s, 'p0', { t: 'swap', uid: target.uid });
  assert.ok(r.ok, r.error);
  assert.strictEqual(eng.turnOf(s), 'p0'); // still your turn
  assert.strictEqual(s.hands.p0.length, 7);
  assert.ok(!s.hands.p0.some(c => c.uid === target.uid)); // old card gone

  // make a second card dead and confirm the one-per-turn limit
  const second = s.hands.p0.find(c => eng.kindOf(c.key) === 'n');
  const copies2 = [];
  for (let i = 0; i < 100; i++) if (s.board[i].key === second.key && !s.board[i].corner) copies2.push(i);
  copies2.forEach(i => (s.board[i].chip = 1));
  const r2 = eng.apply(s, 'p0', { t: 'swap', uid: second.uid });
  assert.ok(!r2.ok);

  // swapping a playable card is rejected
  const playable = s.hands.p0.find(c => eng.kindOf(c.key) === 'n');
  const r3 = eng.apply(s, 'p0', { t: 'swap', uid: playable.uid });
  assert.ok(!r3.ok);
});

t('win detection: 5-in-a-row completes the game', () => {
  const s = mk(3); // solo, 1 sequence wins
  // craft 4 chips in column 5 for team 0, and hand a card matching the 5th
  for (let i = 0; i < 4; i++) s.board[5 + i * 10].chip = 0;
  s.board[45].key = 'QH';
  s.hands.p0 = [{ uid: 'w', key: 'QH' }];
  const r = eng.apply(s, 'p0', { t: 'play', uid: 'w', cell: 45 });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.winner, 0);
  // completed chips are locked
  assert.ok(s.locked.has(45));
});

t('two sequences needed for 2-player games', () => {
  const s = mk(2);
  s.board[50].key = '5H'; s.board[60].key = '5H';
  // give p0 a card matching an open cell
  let target = -1;
  for (let i = 0; i < 100; i++) if (!s.board[i].corner && s.board[i].chip === null) { target = i; break; }
  s.hands.p0 = [{ uid: 'a', key: s.board[target].key }];
  const r = eng.apply(s, 'p0', { t: 'play', uid: 'a', cell: target });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.phase, 'playing'); // one chip alone never wins
});

t('6 in a row is only ONE sequence, not two (2-player game must not win)', () => {
  const s = mk(2); // 2 teams, needs 2 sequences
  // pre-place 5 team-0 chips in a row (row 2, cols 1-5): one complete sequence
  const row = 2;
  for (let c = 1; c <= 5; c++) s.board[row * 10 + c].chip = 0;
  eng.recomputeSeqCount(s);
  assert.strictEqual(s.seqCount[0], 1, 'sanity: 5-in-a-row is exactly 1 sequence');

  // extend it to 6-in-a-row by playing the 6th consecutive cell (col 6)
  const cell = row * 10 + 6;
  s.board[cell].key = '7H';
  s.hands.p0 = [{ uid: 'ext', key: '7H' }];
  const r = eng.apply(s, 'p0', { t: 'play', uid: 'ext', cell });
  assert.ok(r.ok, r.error);

  assert.strictEqual(s.seqCount[0], 1, '6 consecutive chips still count as only 1 sequence');
  assert.strictEqual(s.phase, 'playing', '6-in-a-row must NOT win a 2-sequence game');
  assert.strictEqual(s.winner, null);
});

t('9 in a row legitimately makes two sequences (1-cell overlap allowed)', () => {
  const s = mk(2);
  const row = 3;
  // pre-place 8 team-0 chips in a row (cols 0-7)
  for (let c = 0; c <= 7; c++) s.board[row * 10 + c].chip = 0;
  eng.recomputeSeqCount(s);
  assert.strictEqual(s.seqCount[0], 1, 'sanity: 8-in-a-row is still only 1 sequence');

  // the 9th chip (col 8) creates windows [0-4] and [4-8], sharing exactly 1 cell — legal
  const cell = row * 10 + 8;
  s.board[cell].key = '9S';
  s.hands.p0 = [{ uid: 'ninth', key: '9S' }];
  const r = eng.apply(s, 'p0', { t: 'play', uid: 'ninth', cell });
  assert.ok(r.ok, r.error);

  assert.strictEqual(s.seqCount[0], 2, '9-in-a-row forms 2 valid (1-overlap) sequences');
  assert.strictEqual(s.phase, 'over', '9-in-a-row should complete a 2-sequence win');
  assert.strictEqual(s.winner, 0);
});

t('6 in a diagonal (↘) is only ONE sequence, not two', () => {
  const s = mk(2);
  // pre-place 5 team-0 chips diagonally (down-right): 11,22,33,44,55
  for (const cell of [11, 22, 33, 44]) s.board[cell].chip = 0;
  s.board[55].key = '8C';
  s.hands.p0 = [{ uid: 'd5', key: '8C' }];
  let r = eng.apply(s, 'p0', { t: 'play', uid: 'd5', cell: 55 });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.seqCount[0], 1, 'sanity: 5-in-a-diagonal is exactly 1 sequence');
  assert.strictEqual(s.phase, 'playing');

  // extend to 6-in-a-diagonal by playing cell 66 (next turn is p1's — place directly then recompute)
  s.board[66].chip = 0;
  eng.recomputeSeqCount(s);
  assert.strictEqual(s.seqCount[0], 1, '6 consecutive diagonal chips still count as only 1 sequence');
  assert.notStrictEqual(s.phase, 'over', '6-in-a-diagonal must NOT win a 2-sequence game');
});

t('6 in a diagonal (↙) is only ONE sequence, not two', () => {
  const s = mk(2);
  // down-left diagonal: 18,27,36,45,54,63
  for (const cell of [18, 27, 36, 45, 54, 63]) s.board[cell].chip = 0;
  eng.recomputeSeqCount(s);
  assert.strictEqual(s.seqCount[0], 1, '6 consecutive anti-diagonal chips still count as only 1 sequence');
  assert.notStrictEqual(s.phase, 'over');
});

t('crossing row + column sharing exactly 1 chip legitimately makes two sequences', () => {
  const s = mk(2);
  // row 5, cols 0-4
  for (const cell of [50, 51, 52, 53, 54]) s.board[cell].chip = 0;
  // column 2, rows 3-7 (shares cell 52 with the row above) — different direction, 1-cell overlap, legal
  for (const cell of [32, 42, 72]) s.board[cell].chip = 0;
  s.board[62].key = '4D';
  s.hands.p0 = [{ uid: 'cross', key: '4D' }];
  const r = eng.apply(s, 'p0', { t: 'play', uid: 'cross', cell: 62 });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.seqCount[0], 2, 'row+column crossing at 1 shared chip legitimately forms 2 sequences');
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.winner, 0);
});

t('draw pile reshuffles discard when empty', () => {
  const s = mk(2);
  s.deck = [];
  s.discard = ['AS', 'KH', '7C'];
  s.hands.p0 = [{ uid: 'x', key: '9D' }];
  // find an open cell for 9D
  let cell = -1;
  for (let i = 0; i < 100; i++) if (s.board[i].key === '9D' && s.board[i].chip === null && !s.board[i].corner) { cell = i; break; }
  const r = eng.apply(s, 'p0', { t: 'play', uid: 'x', cell });
  assert.ok(r.ok, r.error);
  assert.strictEqual(s.hands.p0.length, 1); // drew the reshuffled replacement
  assert.strictEqual(s.deck.length, 3);     // 3 of 4 discards moved back
  assert.strictEqual(s.discard.length, 0);
});

t('bots always return a valid playable action', () => {
  for (let n = 2; n <= 6; n++) {
    const s = mk(n, { botSeats: [0] });
    for (let turn = 0; turn < 20; turn++) {
      if (s.phase !== 'playing') break;
      const seatId = eng.turnOf(s);
      const isBot = s.seats.find(x => x.id === seatId).isBot;
      let action = null;
      if (isBot) action = eng.botMove(s, seatId, 'pro');
      else {
        // human in a bot test — let it also use botMove for speed
        action = eng.botMove(s, seatId, 'chill');
      }
      assert.ok(action, 'no action for ' + n + ' players, turn ' + turn);
      const r = eng.apply(s, seatId, action);
      assert.ok(r.ok, n + 'p turn ' + turn + ': ' + (r.error || '') + ' ' + JSON.stringify(action));
    }
  }
});

t('turn order strictly alternates teams in a 2v2 game', () => {
  const s = mk(4);
  const seq = [];
  for (let i = 0; i < 4; i++) {
    const seatId = eng.turnOf(s);
    seq.push(eng.teamOf(s, seatId));
    const move = playableMove(s, seatId);
    const r = eng.apply(s, seatId, move);
    assert.ok(r.ok, r.error);
  }
  assert.deepStrictEqual(seq, [0, 1, 0, 1], 'teams alternate every turn: ' + seq.join(','));
});

t('turn order alternates teams in a 3v3 game', () => {
  const s = mk(6);
  const seq = [];
  for (let i = 0; i < 6; i++) {
    const seatId = eng.turnOf(s);
    seq.push(eng.teamOf(s, seatId));
    const move = playableMove(s, seatId);
    const r = eng.apply(s, seatId, move);
    assert.ok(r.ok, r.error);
  }
  assert.deepStrictEqual(seq, [0, 1, 0, 1, 0, 1], '3v3 alternates: ' + seq.join(','));
});

t('solo (3-player) games keep seat order', () => {
  const s = mk(3);
  const seq = [];
  for (let i = 0; i < 3; i++) {
    const seatId = eng.turnOf(s);
    seq.push(seatId);
    const move = playableMove(s, seatId);
    const r = eng.apply(s, seatId, move);
    assert.ok(r.ok, r.error);
  }
  assert.deepStrictEqual(seq, ['p0', 'p1', 'p2']);
});

t('full bot-vs-bot game finishes with a winner', () => {
  const s = mk(2, { botSeats: [0, 1] });
  let guard = 0;
  while (s.phase === 'playing' && guard++ < 600) {
    const seatId = eng.turnOf(s);
    const dead = eng.deadCards(s, seatId);
    if (dead.length) {
      const r = eng.apply(s, seatId, { t: 'swap', uid: dead[0] });
      assert.ok(r.ok, r.error);
    }
    const move = eng.botMove(s, seatId, 'pro');
    assert.ok(move, 'no move at guard ' + guard);
    const r = eng.apply(s, seatId, move);
    assert.ok(r.ok, r.error);
  }
  assert.strictEqual(s.phase, 'over', 'game did not finish in 600 moves');
  assert.ok(s.winner != null);
  console.log('    (finished in', guard, 'moves, winner team', s.winner, ')');
});

console.log(passed + ' tests passed' + (process.exitCode ? ' — WITH FAILURES' : ''));
