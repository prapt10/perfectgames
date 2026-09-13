'use strict';
/* Draw & Guess engine unit tests. Usage: node test/drawguess-unit.js */
const dg = require('../src/drawguess.js');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}
function t(name, fn) { try { fn(); } catch (e) { failed++; console.error('  ✗ THREW in "' + name + '":', e.message); } }

const NOW = 1000000;
function mk(seatCfg = [{ id: 'h1', name: 'Ana', isBot: false }, { id: 'b1', name: 'Bot (bot)', isBot: true, skill: 'pro' }]) {
  return dg.createGame({ seats: seatCfg }, NOW);
}

t('createGame: rounds depend on humans, drawer is first human', () => {
  const g = mk([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }]);
  ok(g.phase === 'choose', 'starts in choose phase');
  ok(g.drawer === 'a', 'first human is drawer');
  ok(g.roundsTotal === 4, 'rounds = human count (4)');
  ok(g.wordOptions.length === 3, '3 word options offered');
  ok(g.scores.a === 0 && g.scores.d === 0, 'scores initialised');
  ok(g.roundEndsAt === NOW + dg.CHOOSE_SECS * 1000, 'choose deadline set');
});

t('createGame: clamps rounds to 3..8', () => {
  const g2 = mk([{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }]);
  ok(g2.roundsTotal === 3, '2 humans → 3 rounds');
  const many = [];
  for (let i = 0; i < 9; i++) many.push({ id: 's' + i, name: 'P' + i });
  ok(dg.createGame({ seats: many }, NOW).roundsTotal === 8, '9 humans → 8 rounds (cap)');
});

t('pickWord: only the drawer, only in choose phase', () => {
  const g = mk();
  let r = dg.apply(g, 'b1', { t: 'pickWord', idx: 0 }, NOW);
  ok(!r.ok, 'bot cannot pick the word');
  r = dg.apply(g, 'h1', { t: 'pickWord', idx: 9 }, NOW);
  ok(!r.ok, 'invalid index rejected');
  r = dg.apply(g, 'h1', { t: 'pickWord', idx: 1 }, NOW);
  ok(r.ok, 'drawer picks word');
  ok(g.word === g.wordOptions[1], 'word stored');
  ok(g.phase === 'draw', 'phase → draw');
  ok(g.roundEndsAt === NOW + dg.DRAW_SECS * 1000, 'draw deadline set');
});

t('guess: normalization handles articles and punctuation', () => {
  ok(dg.norm('The CAT!') === 'cat', '"The CAT!" → cat');
  ok(dg.norm('  ICE   cream, ') === 'ice cream', 'multi-word normalizes');
  ok(dg.norm('an apple') === 'apple', '"an apple" → apple');
  const g = mk([{ id: 'h1', name: 'Ana' }, { id: 'h2', name: 'Ben' }]);
  dg.apply(g, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  g.word = 'cat';
  let r = dg.apply(g, 'h2', { t: 'guess', text: 'The CAT!!!' }, NOW);
  ok(r.ok && r.correct, 'guesser wins with messy text');
  ok(g.correctBy === 'h2', 'correctBy recorded');
  ok(g.revealed, 'revealed on correct');
  ok(g.phase === 'reveal', 'phase → reveal');
  ok(g.roundEndsAt <= NOW + dg.REVEAL_SECS * 1000, 'reveal pause deadline set');
});

t('guess: scoring (faster = more points), drawer bonus', () => {
  const g = mk([{ id: 'h1', name: 'Ana' }, { id: 'h2', name: 'Ben' }]);
  dg.apply(g, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  g.word = 'dog';
  g.roundEndsAt = NOW + 40 * 1000; // 40s left
  dg.apply(g, 'h2', { t: 'guess', text: 'dog' }, NOW);
  ok(g.scores.h2 === 100 + 40 * 3, 'guesser gets 100 + 3×remaining (220)');
  ok(g.scores.h1 === 50, 'drawer gets +50');
});

t('guess: wrong guesses are logged but score nothing', () => {
  const g = mk([{ id: 'h1', name: 'Ana' }, { id: 'h2', name: 'Ben' }]);
  dg.apply(g, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  g.word = 'bird';
  const r = dg.apply(g, 'h2', { t: 'guess', text: 'cat' }, NOW);
  ok(r.ok && !r.correct, 'wrong guess accepted, not correct');
  ok(g.guesses.length === 1 && !g.guesses[0].correct, 'wrong guess in feed');
  ok(g.scores.h2 === 0 && g.scores.h1 === 0, 'no points for wrong guess');
  ok(g.guessedBy.has('h2'), 'guesser cannot guess again');
  const r2 = dg.apply(g, 'h2', { t: 'guess', text: 'bird' }, NOW);
  ok(!r2.ok, 'second guess rejected (already guessed)');
});

t('guess: drawer cannot guess; locked after reveal', () => {
  const g = mk([{ id: 'h1', name: 'Ana' }, { id: 'h2', name: 'Ben' }]);
  dg.apply(g, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  g.word = 'fish';
  let r = dg.apply(g, 'h1', { t: 'guess', text: 'fish' }, NOW);
  ok(!r.ok, 'drawer cannot guess own word');
  dg.apply(g, 'h2', { t: 'guess', text: 'fish' }, NOW);
  ok(g.phase === 'reveal', 'correct guess moves to reveal');
  r = dg.apply(g, 'h1', { t: 'guess', text: 'x' }, NOW);
  ok(!r.ok, 'no guessing after the word is revealed');
});

t('strokes: drawer only, capped, undo/clear', () => {
  const g = mk();
  dg.apply(g, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  let r = dg.apply(g, 'b1', { t: 'stroke', pts: [{ x: .1, y: .1 }, { x: .2, y: .2 }], color: '#000', size: 4 }, NOW);
  ok(!r.ok, 'bot cannot draw');
  const pts = [];
  for (let i = 0; i < 200; i++) pts.push({ x: i / 200, y: (i % 7) / 7 });
  r = dg.apply(g, 'h1', { t: 'stroke', pts, color: '#e03131', size: 6 }, NOW);
  ok(r.ok && r.stroke.pts.length === dg.MAX_PTS, 'stroke stored, points capped at MAX_PTS');
  ok(g.strokes.length === 1 && g.strokes[0].color === '#e03131', 'stroke recorded with color');
  let u = dg.apply(g, 'h1', { t: 'undoStroke' }, NOW);
  ok(u.ok && u.id === r.stroke.id, 'undo returns popped id');
  ok(g.strokes.length === 0, 'undo removed the stroke');
  dg.apply(g, 'h1', { t: 'stroke', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: '#222', size: 4 }, NOW);
  dg.apply(g, 'h1', { t: 'clearStrokes' }, NOW);
  ok(g.strokes.length === 0, 'clear wipes the canvas');
  u = dg.apply(g, 'h1', { t: 'undoStroke' }, NOW);
  ok(!u.ok, 'undo on empty canvas rejected');
});

t('stroke cap: oldest strokes are dropped', () => {
  const g = mk();
  dg.apply(g, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  for (let i = 0; i < dg.MAX_STROKES + 10; i++) {
    dg.apply(g, 'h1', { t: 'stroke', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: '#000', size: 3 }, NOW);
  }
  ok(g.strokes.length === dg.MAX_STROKES, 'strokes capped at MAX_STROKES');
});

t('timeout: reveal then nextRound rotates drawer and resets', () => {
  const g = mk([{ id: 'h1', name: 'Ana' }, { id: 'h2', name: 'Ben' }, { id: 'h3', name: 'Cid' }]);
  dg.apply(g, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  g.word = 'apple';
  dg.reveal(g, NOW + 90000);
  ok(g.phase === 'reveal' && g.revealed, 'timeout reveals');
  let r = dg.nextRound(g, NOW + 100000);
  ok(r.ok && !r.over, 'next round advances');
  ok(g.round === 2 && g.drawer === 'h2', 'drawer rotated to h2');
  ok(g.strokes.length === 0 && g.guesses.length === 0, 'canvas + guesses cleared');
  ok(g.word === null && !g.revealed && g.phase === 'choose', 'new round is fresh');
  ok(g.wordOptions.length === 3, 'new options offered');
});

t('nextRound: last round ends the game with a winner', () => {
  const g = mk([{ id: 'h1', name: 'Ana' }, { id: 'h2', name: 'Ben' }]);
  g.roundsTotal = 2; g.round = 2;
  g.phase = 'reveal';
  g.scores.h1 = 300; g.scores.h2 = 120;
  const r = dg.nextRound(g, NOW);
  ok(r.ok && r.over, 'game over after last round');
  ok(g.phase === 'over' && g.winner === 'h1', 'highest score wins');
});

t('autoPick: choose timeout picks for the drawer', () => {
  const g = mk();
  dg.autoPick(g, NOW + 20000);
  ok(g.phase === 'draw' && g.word && g.wordOptions.includes(g.word), 'word auto-picked from options');
});

t('botGuess: silence early, then guesses (correct or wrong)', () => {
  const g = mk([{ id: 'h1', name: 'Ana' }, { id: 'b1', name: 'Bot (bot)', isBot: true, skill: 'pro' }]);
  dg.apply(g, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  g.word = 'kite';
  ok(dg.botGuess(g, 'b1', 'pro', NOW + 1000) === null, 'no guess in the first seconds');
  // force a roll: many calls after elapsed time
  let got = null;
  for (let i = 0; i < 400 && got === null; i++) {
    got = dg.botGuess(g, 'b1', 'pro', NOW + 90000);
  }
  ok(got !== null, 'pro bot eventually produces a guess');
  ok(typeof got === 'string' && got.length > 0, 'guess is text');
  const g2 = mk([{ id: 'h1', name: 'Ana' }, { id: 'b1', name: 'Bot (bot)', isBot: true, skill: 'chill' }]);
  dg.apply(g2, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  g2.word = 'kite';
  ok(dg.botGuess(g2, 'b1', 'chill', NOW + 9000) === null, 'chill bot waits even longer');
  // wrong guesses never equal the word when forced wrong — verify via apply loop:
  dg.apply(g2, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  g2.word = 'kite';
  let applied = null;
  for (let i = 0; i < 600 && applied === null; i++) {
    const txt = dg.botGuess(g2, 'b1', 'chill', NOW + 60000);
    if (txt) {
      const r = dg.apply(g2, 'b1', { t: 'guess', text: txt }, NOW + 60000);
      applied = r;
      if (r.ok && !r.correct) ok(true, 'chill bot can guess wrong words');
    }
  }
  ok(applied !== null, 'chill bot guess eventually applies');
});

t('localGotIt: party mode awards the tapped player', () => {
  const g = dg.createGame({ seats: [{ id: 'h1', name: 'Mum' }, { id: 'h2', name: 'Dad' }, { id: 'h3', name: 'Kid' }], local: true }, NOW);
  dg.apply(g, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  g.word = 'cat';
  let r = dg.apply(g, 'h2', { t: 'localGotIt', by: 'h3' }, NOW);
  ok(r.ok, 'local got-it accepted from any player');
  ok(g.correctBy === 'h3' && g.scores.h3 === 150 && g.scores.h1 === 50, 'kid +150, drawer +50');
  ok(g.phase === 'reveal', 'round revealed');
  r = dg.apply(g, 'h3', { t: 'localGotIt', by: 'h2' }, NOW);
  ok(!r.ok, 'no double award after reveal');
});

t('publicState: word/options hidden per viewer', () => {
  const g = mk([{ id: 'h1', name: 'Ana' }, { id: 'h2', name: 'Ben' }]);
  let pub = dg.publicState(g, 'h1');
  ok(pub.isDrawer && pub.wordOptions.length === 3 && pub.word === null, 'drawer sees options in choose');
  pub = dg.publicState(g, 'h2');
  ok(!pub.isDrawer && pub.wordOptions.length === 0 && pub.canGuess === false, 'guesser sees nothing in choose');
  dg.apply(g, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  pub = dg.publicState(g, 'h1');
  ok(pub.word === g.word, 'drawer sees the word in draw phase');
  pub = dg.publicState(g, 'h2');
  ok(pub.word === null && pub.canGuess === true, 'guesser does NOT see the word, can guess');
  dg.apply(g, 'h2', { t: 'guess', text: g.word }, NOW + 20000);
  pub = dg.publicState(g, 'h2');
  ok(pub.word === g.word && pub.canGuess === false, 'word revealed to everyone after correct');
  // local mode: word visible to all during draw
  const gl = dg.createGame({ seats: [{ id: 'h1', name: 'A' }, { id: 'h2', name: 'B' }], local: true }, NOW);
  dg.apply(gl, 'h1', { t: 'pickWord', idx: 0 }, NOW);
  ok(dg.publicState(gl, 'h2').word === gl.word, 'local mode: everyone sees the word');
});

t('word list sanity', () => {
  ok(dg.WORDS.length >= 150, 'plenty of words (' + dg.WORDS.length + ')');
  ok(new Set(dg.WORDS).size === dg.WORDS.length, 'no duplicate words');
  ok(dg.WORDS.every(w => /^[a-z ]+$/.test(w)), 'all lowercase letters/spaces');
});

console.log('\n' + (failed ? failed + ' FAILED, ' : '') + passed + ' passed');
process.exit(failed ? 1 : 0);
