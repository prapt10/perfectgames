'use strict';
/* ============================================================
 * Perfect Games — Draw & Guess engine (pure logic, no I/O)
 *
 * Rules:
 *  - Humans take turns being the drawer; bots are guessers only.
 *  - Each round the drawer picks one of 3 secret words and draws
 *    it on a shared canvas (normalized strokes, no images).
 *  - Guessers type guesses; first correct guess wins the round.
 *    Guesser points: 100 + 3 × remaining seconds. Drawer: +50 per
 *    correct guesser (max once per round).
 *  - Rounds = human count (clamped 3..8). Highest total score wins.
 *  - Local (same-device) mode: word shown on screen, anyone taps
 *    which player said the word — party style.
 * ============================================================ */

const CHOOSE_SECS = 15;   // drawer has 15s to pick a word
const DRAW_SECS = 80;     // drawing time per round
const REVEAL_SECS = 5;    // pause after the word is revealed
const MAX_STROKES = 250;
const MAX_PTS = 140;      // points per stroke
const MAX_GUESSES = 40;

const WORDS = [
  // animals
  'cat', 'dog', 'elephant', 'lion', 'tiger', 'fish', 'bird', 'horse', 'cow', 'snake',
  'frog', 'rabbit', 'monkey', 'penguin', 'owl', 'butterfly', 'spider', 'crab', 'whale', 'duck',
  'goat', 'bee', 'ant', 'turtle', 'shark', 'giraffe', 'zebra', 'deer', 'fox', 'bear',
  'peacock', 'parrot', 'kangaroo', 'octopus', 'lobster', 'mouse', 'bat', 'hen', 'crow', 'donkey',
  // food
  'pizza', 'burger', 'cake', 'ice cream', 'mango', 'banana', 'apple', 'watermelon', 'grapes', 'orange',
  'lemon', 'tomato', 'carrot', 'potato', 'bread', 'egg', 'chocolate', 'coffee', 'tea', 'samosa',
  'dosa', 'biryani', 'noodles', 'pasta', 'popcorn', 'sandwich', 'cheese', 'milk', 'honey', 'laddoo',
  'pancake', 'prawn', 'corn', 'onion', 'pumpkin', 'coconut', 'chips', 'juice', 'soup', 'salad',
  // objects
  'umbrella', 'key', 'clock', 'phone', 'camera', 'book', 'pen', 'pencil', 'scissors', 'cup',
  'plate', 'bowl', 'spoon', 'fork', 'chair', 'table', 'bed', 'lamp', 'mirror', 'comb',
  'brush', 'toothbrush', 'soap', 'towel', 'bag', 'wallet', 'watch', 'ring', 'balloon', 'kite',
  'glasses', 'hat', 'shoe', 'shirt', 'dress', 'bus', 'car', 'bicycle', 'train', 'airplane',
  'boat', 'rocket', 'robot', 'house', 'castle', 'tent', 'bridge', 'tree', 'flower', 'mountain',
  'sun', 'moon', 'star', 'rainbow', 'cloud', 'rain', 'snow', 'fire', 'river', 'ocean',
  'beach', 'island', 'garden', 'road', 'ladder', 'stairs', 'door', 'window', 'drum', 'guitar',
  'piano', 'violin', 'football', 'cricket bat', 'tennis', 'chess', 'dice', 'ghost', 'dragon', 'mermaid',
  'sword', 'crown', 'treasure', 'candle', 'suitcase', 'newspaper', 'radio', 'television', 'fridge', 'broom',
  'hammer', 'rope', 'ball', 'bottle', 'glass', 'fishing', 'paint', 'gift', 'bell', 'anchor',
  // actions
  'dance', 'sing', 'run', 'jump', 'swim', 'sleep', 'eat', 'drink', 'read', 'write',
  'draw', 'cook', 'clean', 'fly', 'climb', 'cry', 'laugh', 'smile', 'play', 'kick',
  'throw', 'catch', 'hug', 'kiss', 'wave', 'yoga', 'yell', 'whistle', 'push', 'pull',
  // places / nature
  'school', 'hospital', 'temple', 'park', 'zoo', 'market', 'farm', 'village', 'city', 'desert',
  'cave', 'volcano', 'waterfall', 'well', 'pond', 'lake', 'airport', 'hotel', 'restaurant', 'shop',
  'library', 'cinema', 'gym', 'station', 'moon', 'jungle', 'farm',
].filter((v, i, a) => a.indexOf(v) === i);

let strokeCounter = 1;

/* normalize a guess: lowercase, strip punctuation & filler words */
function norm(t) {
  return String(t || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|is|are|it's|its|of|to)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickWords(n) {
  const pool = WORDS.slice();
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

function createGame(cfg, now) {
  const seats = cfg.seats.map(s => ({
    id: s.id, name: s.name, isBot: !!s.isBot, skill: s.skill || 'pro',
  }));
  const humans = seats.filter(s => !s.isBot);
  const drawerOrder = (humans.length ? humans : seats).map(s => s.id);
  const roundsTotal = Math.max(3, Math.min(8, drawerOrder.length));
  const scores = {};
  seats.forEach(s => { scores[s.id] = 0; });
  return {
    phase: 'choose',          // choose -> draw -> reveal -> (repeat) -> over
    seats,
    drawerOrder,
    roundsTotal,
    round: 1,
    drawIdx: 0,
    drawer: drawerOrder[0],
    wordOptions: pickWords(3),
    word: null,
    revealed: false,
    correctBy: null,
    scores,
    strokes: [],
    guesses: [],
    guessedBy: new Set(),
    roundStartedAt: now,
    roundEndsAt: now + CHOOSE_SECS * 1000,
    winner: null,
    lastAction: null,
    moveNo: 0,
    local: !!cfg.local,
    strokeN: 0,
  };
}

function drawScores(g, seatId, pts) {
  g.scores[seatId] = (g.scores[seatId] || 0) + pts;
}

function apply(g, seatId, action, now) {
  const seat = g.seats.find(s => s.id === seatId);
  if (!seat) return { ok: false, error: 'Not in the game.' };
  const t = action.t;

  if (t === 'pickWord') {
    if (g.phase !== 'choose') return { ok: false, error: 'No word to pick right now.' };
    if (seatId !== g.drawer) return { ok: false, error: 'Only the drawer picks the word.' };
    const idx = +action.idx;
    if (!g.wordOptions[idx]) return { ok: false, error: 'Invalid choice.' };
    g.word = g.wordOptions[idx];
    g.phase = 'draw';
    g.roundStartedAt = now;
    g.roundEndsAt = now + DRAW_SECS * 1000;
    g.lastAction = { type: 'word', by: seatId, moveNo: ++g.moveNo };
    return { ok: true };
  }

  if (t === 'stroke') {
    if (g.phase !== 'draw' || g.revealed) return { ok: false };
    if (seatId !== g.drawer) return { ok: false };
    if (!Array.isArray(action.pts) || action.pts.length < 2) return { ok: false };
    const pts = action.pts.slice(0, MAX_PTS).map(p => ({
      x: Math.round(+(p.x) * 1000) / 1000,
      y: Math.round(+(p.y) * 1000) / 1000,
    }));
    const stroke = {
      id: 'st' + (++g.strokeN),
      color: String(action.color || '#222222').slice(0, 16),
      size: Math.min(40, Math.max(1, +action.size || 4)),
      pts,
    };
    g.strokes.push(stroke);
    if (g.strokes.length > MAX_STROKES) g.strokes.shift();
    return { ok: true, stroke };
  }

  if (t === 'undoStroke') {
    if (g.phase !== 'draw' || seatId !== g.drawer) return { ok: false };
    if (!g.strokes.length) return { ok: false };
    const popped = g.strokes.pop();
    return { ok: true, id: popped.id };
  }

  if (t === 'clearStrokes') {
    if (g.phase !== 'draw' || seatId !== g.drawer) return { ok: false };
    g.strokes = [];
    return { ok: true };
  }

  if (t === 'guess') {
    if (g.phase !== 'draw' || g.revealed) return { ok: false, error: 'No guessing right now.' };
    if (seatId === g.drawer) return { ok: false, error: 'You are the drawer!' };
    if (g.guessedBy.has(seatId)) return { ok: false, error: 'You already guessed!' };
    const text = String(action.text || '').replace(/[<>&]/g, '').trim().slice(0, 40);
    if (!text) return { ok: false };
    const entry = { name: seat.name, text, correct: false, at: now };
    g.guesses.push(entry);
    if (g.guesses.length > MAX_GUESSES) g.guesses.shift();
    g.guessedBy.add(seatId);
    if (norm(text) === norm(g.word)) {
      entry.correct = true;
      g.correctBy = seatId;
      g.revealed = true;
      const rem = Math.max(0, Math.ceil((g.roundEndsAt - now) / 1000));
      drawScores(g, seatId, 100 + rem * 3);
      drawScores(g, g.drawer, 50);
      g.lastAction = { type: 'correct', by: seatId, word: g.word, moveNo: ++g.moveNo };
      g.phase = 'reveal';
      g.roundEndsAt = now + REVEAL_SECS * 1000;
      return { ok: true, correct: true };
    }
    return { ok: true, correct: false };
  }

  if (t === 'localGotIt') {
    if (!g.local) return { ok: false };
    if (g.phase !== 'draw' || g.revealed) return { ok: false, error: 'No one can get it right now.' };
    const by = g.seats.find(s => s.id === action.by && !s.isBot && s.id !== g.drawer);
    if (!by) return { ok: false, error: 'Pick a player.' };
    g.revealed = true;
    g.correctBy = by.id;
    g.guessedBy.add(by.id);
    drawScores(g, by.id, 150);
    drawScores(g, g.drawer, 50);
    g.guesses.push({ name: by.name, text: 'got it!', correct: true, at: now });
    g.lastAction = { type: 'correct', by: by.id, word: g.word, moveNo: ++g.moveNo };
    g.phase = 'reveal';
    g.roundEndsAt = now + REVEAL_SECS * 1000;
    return { ok: true };
  }

  return { ok: false, error: 'Unknown action.' };
}

/* choose-phase timeout: server picks a random word for the drawer */
function autoPick(g, now) {
  if (g.phase !== 'choose') return;
  g.word = g.wordOptions[Math.floor(Math.random() * g.wordOptions.length)];
  g.phase = 'draw';
  g.roundStartedAt = now;
  g.roundEndsAt = now + DRAW_SECS * 1000;
  g.lastAction = { type: 'word', by: g.drawer, auto: true, moveNo: ++g.moveNo };
}

/* draw-phase timeout: reveal the word */
function reveal(g, now) {
  if (g.phase !== 'draw') return { ok: false };
  g.revealed = true;
  g.phase = 'reveal';
  g.roundEndsAt = now + REVEAL_SECS * 1000;
  g.lastAction = { type: 'timeout', word: g.word, moveNo: ++g.moveNo };
  return { ok: true };
}

/* advance after the reveal pause — next round or game over */
function nextRound(g, now) {
  if (g.phase !== 'reveal') return { ok: false };
  if (g.round >= g.roundsTotal) {
    g.phase = 'over';
    let best = null;
    for (const s of g.seats) {
      const sc = g.scores[s.id] || 0;
      if (best === null || sc > best.score) best = { id: s.id, score: sc };
    }
    g.winner = best ? best.id : null;
    return { ok: true, over: true };
  }
  g.round++;
  g.drawIdx = (g.drawIdx + 1) % g.drawerOrder.length;
  g.drawer = g.drawerOrder[g.drawIdx];
  g.wordOptions = pickWords(3);
  g.word = null;
  g.revealed = false;
  g.correctBy = null;
  g.strokes = [];
  g.guesses = [];
  g.guessedBy.clear();
  g.phase = 'choose';
  g.roundEndsAt = now + CHOOSE_SECS * 1000;
  return { ok: true, over: false };
}

/* bot guesser: returns a guess text or null. Pro bots guess sooner and are
   more likely to nail the word; chill bots are slow and often wrong. */
function botGuess(g, seatId, skill, now) {
  if (g.phase !== 'draw' || g.revealed) return null;
  if (seatId === g.drawer || g.guessedBy.has(seatId)) return null;
  const seat = g.seats.find(s => s.id === seatId);
  if (!seat || !seat.isBot) return null;
  const elapsed = (now - g.roundStartedAt) / 1000;
  const pro = skill !== 'chill';
  if (elapsed < (pro ? 8 : 18)) return null;
  if (Math.random() >= (pro ? 0.10 : 0.05)) return null;
  if (Math.random() < (pro ? 0.7 : 0.4)) return g.word;
  const wrong = pickWords(2).filter(w => w !== g.word)[0];
  return wrong || g.word;
}

/* per-viewer state */
function publicState(g, viewerSeatId) {
  return {
    phase: g.phase,
    round: g.round,
    roundsTotal: g.roundsTotal,
    roundEndsAt: g.roundEndsAt,
    drawer: g.drawer,
    drawerName: (g.seats.find(s => s.id === g.drawer) || {}).name || '',
    isDrawer: g.drawer === viewerSeatId,
    canGuess: g.phase === 'draw' && !g.revealed && g.drawer !== viewerSeatId && !g.guessedBy.has(viewerSeatId),
    wordOptions: g.phase === 'choose' && g.drawer === viewerSeatId ? g.wordOptions.slice() : [],
    word: g.phase !== 'choose' && (g.revealed || g.drawer === viewerSeatId || g.local) ? g.word : null,
    strokes: g.strokes,
    guesses: g.guesses,
    scores: g.seats.map(s => ({ id: s.id, name: s.name, isBot: s.isBot, score: g.scores[s.id] || 0 })),
    winner: g.winner,
    revealed: g.revealed,
    correctBy: g.correctBy,
    local: !!g.local,
    lastAction: g.lastAction,
  };
}

module.exports = {
  WORDS, CHOOSE_SECS, DRAW_SECS, REVEAL_SECS, MAX_STROKES, MAX_PTS,
  norm, pickWords, createGame, apply, autoPick, reveal, nextRound, botGuess, publicState,
};
