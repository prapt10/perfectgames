'use strict';
/* ============================================================
 * Perfect Games — Classic UNO engine (pure logic, no I/O)
 * - 108-card deck: 4 colors x (0, 1-9 x2, Skip x2, Reverse x2,
 *   Draw Two x2) + 4 Wild + 4 Wild Draw Four
 * - Match color, value or play a Wild; draw when you can't play;
 *   after drawing you may play the drawn card (only it)
 * - Skip / Reverse / Draw Two / Wild Draw Four effects
 * - Reverse with 2 players acts as Skip; auto "UNO!" call
 * - Discard pile reshuffles into the deck when it runs out
 * ============================================================ */

const COLORS = ['R', 'Y', 'G', 'B'];
const COLOR_HEX = ['#e63946', '#f4a300', '#2a9d4c', '#2f6fdb'];
const COLOR_NAMES = ['Red', 'Yellow', 'Green', 'Blue'];
const VALUE_LABEL = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  'S': 'SKIP', 'R': 'REV', 'D2': '+2', 'W': 'WILD', 'W4': '+4',
};
const VALUE_SYM = {
  'S': '⊘', 'R': '⟲', 'D2': '+2', 'W': '★', 'W4': '+4',
};

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let uidCounter = 1;
const nextUid = () => 'u' + (uidCounter++);

function buildDeck() {
  const deck = [];
  for (const c of COLORS) {
    deck.push({ uid: nextUid(), color: c, value: '0' });
    for (let i = 1; i <= 9; i++) {
      deck.push({ uid: nextUid(), color: c, value: String(i) });
      deck.push({ uid: nextUid(), color: c, value: String(i) });
    }
    for (const v of ['S', 'R', 'D2']) {
      deck.push({ uid: nextUid(), color: c, value: v });
      deck.push({ uid: nextUid(), color: c, value: v });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ uid: nextUid(), color: null, value: 'W' });
    deck.push({ uid: nextUid(), color: null, value: 'W4' });
  }
  return deck;
}

const isWild = c => c.color === null;
const matches = (card, s) =>
  card.color === null || card.color === s.currentColor || card.value === s.currentValue;

function createGame(cfg) {
  const seats = cfg.seats.map(s => ({ id: s.id, name: s.name, isBot: !!s.isBot, skill: s.skill || 'pro' }));
  const deck = shuffle(buildDeck());
  const hands = {};
  seats.forEach(s => (hands[s.id] = []));
  for (let i = 0; i < 7; i++) {
    for (const s of seats) if (deck.length) hands[s.id].push(deck.pop());
  }
  // flip one card to start the discard pile (skip wilds so the first
  // player always has a fair start)
  let first = deck.pop();
  while (isWild(first)) { deck.unshift(first); first = deck.pop(); }
  return {
    phase: 'playing',
    seats, hands, deck,
    discard: [first],
    turnIdx: 0, dir: 1,
    currentColor: first.color,
    currentValue: first.value,
    drawnUid: null,       // if set, only this card may be played this turn
    winner: null,
    moveNo: 0, log: [], lastAction: null,
  };
}

const turnSeat = s => s.seats[s.turnIdx];
const seatById = (s, id) => s.seats.find(x => x.id === id);

function log(s, text) {
  s.log.push({ text, n: s.moveNo });
  if (s.log.length > 60) s.log.shift();
}

function drawOne(s) {
  if (!s.deck.length) {
    if (s.discard.length <= 1) return null;
    const top = s.discard.pop();
    s.deck = shuffle(s.discard);
    s.discard = [top];
    log(s, 'Deck empty — discard pile reshuffled.');
  }
  return s.deck.pop();
}

function drawCards(s, seatId, count) {
  const hand = s.hands[seatId];
  let got = 0;
  for (let i = 0; i < count; i++) {
    const c = drawOne(s);
    if (!c) break;
    hand.push(c);
    got++;
  }
  if (got) log(s, seatById(s, seatId).name + ' drew ' + got + ' card' + (got > 1 ? 's' : '') + '.');
}

function advanceTurn(s, skipCount) {
  const n = s.seats.length;
  s.turnIdx = (((s.turnIdx + s.dir * (1 + skipCount)) % n) + n) % n;
}

/* ---------------- actions ---------------- */

function apply(s, seatId, action) {
  if (s.phase !== 'playing') return { ok: false, error: 'The game is over.' };
  if (turnSeat(s).id !== seatId) return { ok: false, error: 'It is not your turn.' };
  const seat = turnSeat(s);
  const hand = s.hands[seatId];

  if (action.t === 'draw') {
    if (s.drawnUid) return { ok: false, error: 'Play the drawn card or pass first.' };
    const card = drawOne(s);
    if (!card) { advanceTurn(s, 0); s.moveNo++; return { ok: true }; }
    hand.push(card);
    s.moveNo++;
    s.lastAction = { type: 'draw', by: seatId, uid: card.uid };
    log(s, seat.name + ' drew a card.');
    if (matches(card, s)) {
      s.drawnUid = card.uid; // may play just this card
    } else {
      advanceTurn(s, 0);
    }
    return { ok: true };
  }

  if (action.t === 'pass') {
    if (!s.drawnUid) return { ok: false, error: 'Nothing to pass on.' };
    s.drawnUid = null;
    s.moveNo++;
    s.lastAction = { type: 'pass', by: seatId };
    log(s, seat.name + ' passed.');
    advanceTurn(s, 0);
    return { ok: true };
  }

  if (action.t === 'playCard') {
    const card = hand.find(c => c.uid === action.uid);
    if (!card) return { ok: false, error: 'Card not in your hand.' };
    if (s.drawnUid && card.uid !== s.drawnUid) return { ok: false, error: 'You may only play the card you just drew.' };
    if (!matches(card, s)) return { ok: false, error: 'That card does not match the discard pile.' };

    // wild color choice
    if (isWild(card)) {
      const color = action.color;
      if (!COLORS.includes(color)) return { ok: false, error: 'Choose a color for the wild card.' };
      s.currentColor = color;
      s.currentValue = null;
    } else {
      s.currentColor = card.color;
      s.currentValue = card.value;
    }

    hand.splice(hand.indexOf(card), 1);
    s.discard.push(card);
    s.drawnUid = null;
    s.moveNo++;
    s.lastAction = { type: 'play', by: seatId, uid: card.uid, color: card.color, value: card.value, wildColor: isWild(card) ? s.currentColor : null };

    // effects
    const n = s.seats.length;
    if (card.value === 'S') {
      advanceTurn(s, 1);
    } else if (card.value === 'R') {
      s.dir *= -1;
      advanceTurn(s, n === 2 ? 1 : 0);
    } else if (card.value === 'D2') {
      const nextIdx = (((s.turnIdx + s.dir) % n) + n) % n;
      drawCards(s, s.seats[nextIdx].id, 2);
      advanceTurn(s, 1);
    } else if (card.value === 'W4') {
      const nextIdx = (((s.turnIdx + s.dir) % n) + n) % n;
      drawCards(s, s.seats[nextIdx].id, 4);
      advanceTurn(s, 1);
    } else {
      advanceTurn(s, 0);
    }

    const label = VALUE_LABEL[card.value];
    if (card.value === 'W' || card.value === 'W4') {
      log(s, seat.name + ' played ' + label + ' → ' + COLOR_NAMES[COLORS.indexOf(s.currentColor)]);
    } else {
      log(s, seat.name + ' played ' + label);
    }

    if (hand.length === 0) {
      s.phase = 'over';
      s.winner = s.seats.indexOf(seat);
      log(s, seat.name + ' empties their hand — UNO! ' + seat.name + ' wins!');
    } else if (hand.length === 1) {
      s.moveNo++;
      s.lastAction = { type: 'uno', by: seatId };
      log(s, 'UNO! ' + seat.name + ' has one card left.');
    }
    return { ok: true };
  }

  return { ok: false, error: 'Unknown action.' };
}

/* ---------------- bot AI ---------------- */

function bestColor(s, seatId) {
  const counts = { R: 0, Y: 0, G: 0, B: 0 };
  for (const c of s.hands[seatId]) if (c.color) counts[c.color]++;
  let best = 'R', bestN = -1;
  for (const k of COLORS) if (counts[k] > bestN) { bestN = counts[k]; best = k; }
  return best;
}

function botMove(s, seatId, skill) {
  if (turnSeat(s).id !== seatId) return null;
  const chill = skill !== 'pro';
  const hand = s.hands[seatId];

  // after drawing: play the drawn card if possible, else pass
  if (s.drawnUid) {
    const dc = hand.find(c => c.uid === s.drawnUid);
    if (dc) return { t: 'playCard', uid: dc.uid, color: bestColor(s, seatId) };
    return { t: 'pass' };
  }

  const playable = hand.filter(c => matches(c, s));
  if (!playable.length) return { t: 'draw' };

  // opponent pressure: use W4 when someone is about to win
  const oppMin = s.seats
    .filter(x => x.id !== seatId)
    .reduce((m, x) => Math.min(m, s.hands[x.id].length), 99);
  const w4 = hand.find(c => c.value === 'W4');
  const wild = hand.find(c => c.value === 'W');

  // score candidates
  let best = null, bestScore = -1e9;
  for (const c of playable) {
    let score = Math.random() * 15;
    if (c.color === s.currentColor) score += 60;          // keep the color train
    else if (c.value === s.currentValue) score += 25;
    if (c.value === '0') score -= 5;
    if (c.value === 'S' || c.value === 'R' || c.value === 'D2') score += 8;
    if (isWild(c)) {
      if (c.value === 'W') score += 5;                    // hold wilds unless needed
      else {
        score = oppMin <= 2 ? 120 : 30;                   // W4: big when opponent close
      }
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (chill && Math.random() < 0.3) {
    best = playable[Math.floor(Math.random() * playable.length)];
    if (isWild(best) && best.value === 'W4' && w4 && oppMin > 2 && wild) best = wild;
  }
  return { t: 'playCard', uid: best.uid, color: bestColor(s, seatId) };
}

/* ---------------- public state ---------------- */

function publicState(s, viewerSeatId) {
  const hand = s.hands[viewerSeatId].map(c => ({ uid: c.uid, color: c.color, value: c.value }));
  return {
    phase: s.phase,
    seats: s.seats.map(x => ({ id: x.id, name: x.name, isBot: x.isBot, skill: x.skill, handCount: s.hands[x.id].length })),
    turn: turnSeat(s).id,
    yourTurn: s.phase === 'playing' && turnSeat(s).id === viewerSeatId,
    discardTop: s.discard[s.discard.length - 1] || null,
    currentColor: s.currentColor,
    currentValue: s.currentValue,
    direction: s.dir,
    deckCount: s.deck.length,
    drawnUid: s.drawnUid,
    hand,
    winner: s.winner,
    lastAction: s.lastAction,
    log: s.log.slice(-30),
    moveNo: s.moveNo,
  };
}

module.exports = {
  COLORS, COLOR_HEX, COLOR_NAMES, VALUE_LABEL, VALUE_SYM,
  isWild, matches, buildDeck,
  createGame, apply, botMove, publicState,
};
