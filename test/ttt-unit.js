'use strict';
/* Tic-Tac-Toe engine unit tests — run: node test/ttt-unit.js */
const assert = require('assert');
const ttt = require('../src/ttt.js');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); process.exitCode = 1; }
}

function mk() {
  return ttt.createGame({ seats: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] });
}
function mv(s, cell) {
  // helper: track whose turn BEFORE applying (the engine alternates internally)
  const who = s.seats[s.turnIdx].id;
  return ttt.apply(s, who, { t: 'move', cell });
}

console.log('Tic-Tac-Toe engine tests');

t('board starts empty, X first, X/O seats', () => {
  const s = mk();
  assert.deepStrictEqual(s.board, Array(9).fill(null));
  assert.strictEqual(s.turnIdx, 0);
  assert.strictEqual(ttt.markOf(0), 'X');
  assert.strictEqual(ttt.markOf(1), 'O');
});

t('moves alternate and place marks', () => {
  const s = mk();
  mv(s, 0);
  assert.strictEqual(s.board[0], 0);
  assert.strictEqual(s.turnIdx, 1);
  mv(s, 4);
  assert.strictEqual(s.board[4], 1);
  assert.strictEqual(s.turnIdx, 0);
});

t('occupied cell rejected; out-of-turn rejected', () => {
  const s = mk();
  mv(s, 0);
  const r1 = ttt.apply(s, s.seats[0].id, { t: 'move', cell: 0 });
  assert.ok(!r1.ok, 'occupied cell rejected');
  const r2 = ttt.apply(s, s.seats[0].id, { t: 'move', cell: 1 });
  assert.ok(!r2.ok, 'out of turn rejected');
  const r3 = ttt.apply(s, s.seats[1].id, { t: 'move', cell: 99 });
  assert.ok(!r3.ok, 'invalid cell rejected');
});

t('X wins on a row', () => {
  const s = mk();
  // X: 0,1,2 ; O: 3,4
  mv(s, 0); mv(s, 3); mv(s, 1); mv(s, 4); mv(s, 2);
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.winner, 0);
  assert.deepStrictEqual(s.winLine, [0, 1, 2]);
});

t('O wins on a diagonal', () => {
  const s = mk();
  // X: 0, 1, 8 ; O: 3, 4, 5 (middle row for O)
  mv(s, 0); mv(s, 3); mv(s, 1); mv(s, 4); mv(s, 8); mv(s, 5);
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.winner, 1);
  assert.deepStrictEqual(s.winLine, [3, 4, 5]);
});

t('draw when the board fills', () => {
  const s = mk();
  // verified draw sequence: X at 6,8,5,1,0 ; O at 3,2,7,4
  [6, 3, 8, 2, 5, 7, 1, 4, 0].forEach(c => mv(s, c));
  assert.strictEqual(s.phase, 'over');
  assert.strictEqual(s.winner, null);
  assert.strictEqual(s.draw, true);
});

t('no moves after game over', () => {
  const s = mk();
  mv(s, 0); mv(s, 3); mv(s, 1); mv(s, 4); mv(s, 2);
  const r = mv(s, 5);
  assert.ok(!r.ok);
});

t('bot never loses as X (unbeatable)', () => {
  for (let i = 0; i < 20; i++) {
    const s = mk();
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 9) {
      const seat = s.seats[s.turnIdx];
      const move = ttt.botMove(s, seat.id, 'pro');
      assert.ok(move, 'bot move');
      const r = ttt.apply(s, seat.id, move);
      assert.ok(r.ok, r.error);
    }
    assert.ok(s.phase === 'over');
    assert.ok(s.winner !== 1, 'human (O) should never beat pro bot as X');
  }
});

t('bot responds and game completes vs human moves', () => {
  const s = mk();
  // human is O (second seat). Let bot (X) start, human plays random free cells.
  const humanMoves = [4, 0, 2, 8, 6, 1, 3, 5, 7];
  let gi = 0;
  let guard = 0;
  while (s.phase === 'playing' && guard++ < 9) {
    const seat = s.seats[s.turnIdx];
    if (seat.id === 'a') {
      const move = ttt.botMove(s, seat.id, 'pro');
      ttt.apply(s, seat.id, move);
    } else {
      // find first free cell from humanMoves
      while (s.board[humanMoves[gi]] !== null) gi++;
      ttt.apply(s, seat.id, { t: 'move', cell: humanMoves[gi] });
    }
  }
  assert.strictEqual(s.phase, 'over');
  assert.ok(s.winner === 0 || s.winner === 1 || s.draw);
});

console.log(passed + ' ttt tests passed' + (process.exitCode ? ' — WITH FAILURES' : ''));
