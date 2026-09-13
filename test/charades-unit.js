'use strict';
/* Dumb Charades engine unit tests. Usage: node test/charades-unit.js */
const ch = require('../src/charades.js');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}
function t(name, fn) { try { fn(); } catch (e) { failed++; console.error('  ✗ THREW in "' + name + '":', e.message); } }

const NOW = 1000000;
function mk(seatCfg, opts = {}) {
  return ch.createGame({ seats: seatCfg || [
    { id: 'a', name: 'Ana', team: 0 }, { id: 'b', name: 'Ben', team: 0 },
    { id: 'c', name: 'Cid', team: 1 }, { id: 'd', name: 'Dev', team: 1 },
  ], ...opts }, NOW);
}

t('createGame: two balanced teams, alternation, actor is team A first', () => {
  const g = mk();
  ok(g.teamCount === 2, 'two teams');
  ok(g.teams[0].length === 2 && g.teams[1].length === 2, 'balanced teams');
  ok(g.actor === 'a' && g.teamIdx === 0, 'first actor from team A');
  ok(g.roundsTotal === 6, '3 rounds/team → 6 total');
  ok(g.phase === 'choose' && g.wordOptions.length === 3, 'choose phase with 3 options');
  const cats = g.wordOptions.map(x => x[1]);
  ok(cats.includes('movie') && cats.includes('song'), 'options mix movie + song');
});

t('createGame: honors preset teams, solo when 1 seat', () => {
  const g = mk([{ id: 'x', name: 'X', team: 1 }, { id: 'y', name: 'Y', team: 1 }]);
  ok(g.teams[1].length === 2 && g.teams[0].length === 0, 'preset team honored');
  const s = ch.createGame({ seats: [{ id: 'z', name: 'Z' }] }, NOW);
  ok(s.solo && s.teamCount === 1 && s.roundsTotal === 5, 'solo: 1 team, 5 rounds');
});

t('pickWord: actor only, valid idx, sets act phase + deadline', () => {
  const g = mk();
  let r = ch.apply(g, 'c', { t: 'pickWord', idx: 0 }, NOW);
  ok(!r.ok, 'non-actor cannot pick');
  r = ch.apply(g, 'a', { t: 'pickWord', idx: 5 }, NOW);
  ok(!r.ok, 'invalid idx rejected');
  const pick = ch.apply(g, 'a', { t: 'pickWord', idx: 1 }, NOW);
  ok(pick.ok, 'actor picks');
  ok(g.word && g.category, 'title + category stored');
  ok(g.phase === 'act' && g.roundEndsAt === NOW + ch.ACT_SECS * 1000, 'act phase, 60s deadline');
});

t('guess: only same-team non-actor, fuzzy romanization matching', () => {
  const g = mk();
  g.word = 'kal ho naa ho';           // canonical
  g.category = 'movie';
  g.phase = 'act';
  g.roundEndsAt = NOW + 50000;
  let r = ch.apply(g, 'a', { t: 'guess', text: 'kal ho na ho' }, NOW);
  ok(!r.ok, 'actor cannot guess');
  r = ch.apply(g, 'c', { t: 'guess', text: 'kal ho na ho' }, NOW);
  ok(!r.ok, 'opponent team cannot guess');
  r = ch.apply(g, 'b', { t: 'guess', text: 'kal ho na ho' }, NOW);
  ok(r.ok && r.correct, 'teammate guesses correctly (naa/na fuzzy)');
  ok(g.scores[0] === 1 && g.phase === 'reveal' && g.correctBy === 'b', 'team A +1, reveal phase');
});

t('guess: aliases work (DDLJ)', () => {
  const g = mk();
  g.word = 'dilwale dulhania le jayenge';
  g.phase = 'act';
  let r = ch.apply(g, 'b', { t: 'guess', text: 'ddlj' }, NOW);
  ok(r.ok && r.correct, 'alias ddlj accepted');
});

t('guess: wrong guesses logged, multiple guesses allowed', () => {
  const g = mk();
  g.word = 'sholay'; g.phase = 'act';
  let r = ch.apply(g, 'b', { t: 'guess', text: 'deewar' }, NOW);
  ok(r.ok && !r.correct, 'wrong guess accepted');
  ok(g.guesses.length === 1 && !g.guesses[0].correct, 'wrong guess in feed');
  ok(g.scores[0] === 0, 'no points for wrong');
  r = ch.apply(g, 'b', { t: 'guess', text: 'pk' }, NOW);
  ok(r.ok && !r.correct, 'teammates can guess again after a wrong one');
  r = ch.apply(g, 'b', { t: 'guess', text: 'sholay' }, NOW);
  ok(r.ok && r.correct, 'correct guess on the next try scores');
  ok(g.scores[0] === 1 && g.guesses.length === 3, 'three guesses logged, team scored');
});

t('pass: actor gives up (online)', () => {
  const g = mk();
  g.word = 'don'; g.phase = 'act';
  let r = ch.apply(g, 'c', { t: 'pass' }, NOW);
  ok(!r.ok, 'only actor can pass online');
  r = ch.apply(g, 'a', { t: 'pass' }, NOW);
  ok(r.ok && g.phase === 'reveal' && g.scores[0] === 0 && g.scores[1] === 0, 'pass → reveal, no points');
});

t('localGotIt: party mode, teammate only, +1 team', () => {
  const g = mk(undefined, { local: true });
  g.word = 'pk'; g.phase = 'act';
  let r = ch.apply(g, 'c', { t: 'localGotIt', by: 'c' }, NOW);
  ok(!r.ok, 'opponent team member cannot be awarded');
  r = ch.apply(g, 'a', { t: 'localGotIt', by: 'a' }, NOW);
  ok(!r.ok, 'actor cannot self-award');
  r = ch.apply(g, 'a', { t: 'localGotIt', by: 'b' }, NOW);
  ok(r.ok && g.scores[0] === 1 && g.correctBy === 'b', 'teammate tapped → team A +1');
});

t('soloGotIt: solo practice scores a point', () => {
  const g = ch.createGame({ seats: [{ id: 'z', name: 'Z' }] }, NOW);
  g.word = 'lagaan'; g.phase = 'act';
  const r = ch.apply(g, 'z', { t: 'soloGotIt' }, NOW);
  ok(r.ok && g.scores[0] === 1 && g.phase === 'reveal', 'solo got-it scores');
});

t('timeouts: autoPick then reveal then nextRound rotates team + actor', () => {
  const g = mk();
  ch.autoPick(g, NOW + 25000);
  ok(g.phase === 'act' && g.word, 'auto-pick moved to act with a title');
  ch.reveal(g, NOW + 90000);
  ok(g.phase === 'reveal' && g.revealed, 'timeout reveals');
  const r = ch.nextRound(g, NOW + 100000);
  ok(r.ok && !r.over, 'next round');
  ok(g.round === 2 && g.teamIdx === 1 && g.actor === 'c', 'team B up, first B actor');
  ok(!g.word && !g.revealed && g.guesses.length === 0, 'fresh round');
  // after B's round, actor rotation within B: next B actor is d
  g.phase = 'act'; g.word = 'jai ho';
  ch.reveal(g, NOW + 90000);
  ch.nextRound(g, NOW + 100000);
  ok(g.teamIdx === 0 && g.actor === 'b', 'team A up again, next A actor is b');
});

t('nextRound: final round → winner (and ties)', () => {
  const g = mk();
  g.round = g.roundsTotal; g.phase = 'reveal';
  g.scores = [4, 2];
  let r = ch.nextRound(g, NOW);
  ok(r.ok && r.over && g.winnerTeam === 0, 'team A wins');
  const g2 = mk();
  g2.round = g2.roundsTotal; g2.phase = 'reveal';
  g2.scores = [3, 3];
  ch.nextRound(g2, NOW);
  ok(g2.winnerTeam === null, 'tie → no winner');
});

t('publicState: per-viewer visibility', () => {
  const g = mk();
  let pub = ch.publicState(g, 'a');
  ok(pub.isActor && pub.wordOptions.length === 3, 'actor sees options in choose');
  ok(pub.word === null, 'title hidden in choose');
  pub = ch.publicState(g, 'c');
  ok(!pub.isActor && pub.wordOptions.length === 0, 'opponent sees nothing in choose');
  g.phase = 'act'; g.word = 'sholay'; g.category = 'movie';
  pub = ch.publicState(g, 'a');
  ok(pub.word === 'sholay' && pub.isActor, 'actor sees the title during act');
  pub = ch.publicState(g, 'b');
  ok(pub.word === null && pub.canGuess === true, 'teammate: title hidden, can guess');
  pub = ch.publicState(g, 'c');
  ok(pub.word === null && pub.canGuess === false, 'opponent: title hidden, cannot guess');
  g.revealed = true; g.phase = 'reveal';
  pub = ch.publicState(g, 'c');
  ok(pub.word === 'sholay', 'title revealed to everyone');
  // local party: everyone sees the title during act (for memorize)
  const gl = mk(undefined, { local: true });
  gl.phase = 'act'; gl.word = 'pk'; gl.category = 'movie';
  pub = ch.publicState(gl, 'c');
  ok(pub.word === 'pk', 'party mode: title visible for memorizing');
});

t('title list sanity', () => {
  ok(ch.TITLES.length >= 180, 'plenty of titles (' + ch.TITLES.length + ')');
  const movies = ch.TITLES.filter(x => x[1] === 'movie').length;
  const songs = ch.TITLES.filter(x => x[1] === 'song').length;
  ok(movies >= 90 && songs >= 90, 'both categories well stocked (' + movies + ' movies, ' + songs + ' songs)');
  const titles = ch.TITLES.map(x => x[0]);
  const dupCat = ch.TITLES.some((x, i) => ch.TITLES.findIndex(y => y[0] === x[0] && y[1] === x[1]) !== i);
  ok(!dupCat, 'no duplicate titles within a category');
  ok(ch.TITLES.every(x => /^[a-z0-9 .&'\-]+$/.test(x[0])), 'titles are clean lowercase text');
  ok(ch.norm('The KAL HO NAA HO!') === 'kal ho na ho', 'norm folds romanization');
  ok(ch.norm('DEEWAR') === ch.norm('diwar'), 'deewar === diwar after norm');
});

console.log('\n' + (failed ? failed + ' FAILED, ' : '') + passed + ' passed');
process.exit(failed ? 1 : 0);
