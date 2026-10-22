'use strict';
/* ============================================================
 * Perfect Games — Sequence engine (pure logic, no I/O)
 * Classic Sequence rules:
 *  - 10x10 board, 4 free corners (count for every team, never placeable)
 *  - 96 card spaces: every card (A-K, all suits, no Jacks) appears twice
 *  - Deck = 2 full decks (104 cards incl. 8 Jacks)
 *  - Two-eyed Jacks (♥J ♦J) = wild, place anywhere open
 *  - One-eyed Jacks (♠J ♣J) = remove an opponent chip (never from a
 *    completed sequence, never a corner)
 *  - Dead card: both matching spaces covered -> swap one per turn
 *  - Win: 2 sequences for 2 players / 2 teams, 1 sequence for 3+ solo
 *  - When the draw pile empties, shuffle the discard pile back in
 * ============================================================ */

const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const SUITS = ['S','H','D','C'];
const SUIT_SYM = { S:'\u2660', H:'\u2665', D:'\u2666', C:'\u2663' };

const isJack = k => k.length === 2 && k[0] === 'J';
const kindOf = k => isJack(k) ? (k[1] === 'H' || k[1] === 'D' ? 'w2' : 'w1') : 'n';
const cardLabel = k => {
  const r = k.length === 2 ? k[0] : '10';
  const s = SUIT_SYM[k[k.length - 1]];
  return r + s;
};

// 48 distinct non-Jack cards, each twice on the board = 96 spaces
const BOARD_KEYS = [];
for (let copy = 0; copy < 2; copy++) {
  for (const r of RANKS) if (r !== 'J') for (const s of SUITS) BOARD_KEYS.push(r + s);
}
// 2 full decks incl. Jacks = 104 cards in the draw pile
const DECK_KEYS = [];
for (let i = 0; i < 2; i++) for (const r of RANKS) for (const s of SUITS) DECK_KEYS.push(r + s);

const CORNERS = new Set([0, 9, 90, 99]);

// All length-5 windows (rows, columns, both diagonals)
const WINDOWS = [];
for (let r = 0; r < 10; r++) for (let c = 0; c <= 5; c++) WINDOWS.push([0,1,2,3,4].map(i => r*10 + c + i));
for (let c = 0; c < 10; c++) for (let r = 0; r <= 5; r++) WINDOWS.push([0,1,2,3,4].map(i => (r+i)*10 + c));
for (let r = 0; r <= 5; r++) for (let c = 0; c <= 5; c++) WINDOWS.push([0,1,2,3,4].map(i => (r+i)*10 + c + i));
for (let r = 0; r <= 5; r++) for (let c = 4; c < 10; c++) WINDOWS.push([0,1,2,3,4].map(i => (r+i)*10 + c - i));

/* ----------------------------------------------------------------------
 * Group every 5-cell window onto its underlying straight line (row,
 * column or either diagonal) so we can tell "6 in a row" (one line,
 * two overlapping windows) apart from two genuinely separate sequences.
 * Official Sequence rule: a chip may be shared by at most one *other*
 * sequence — two windows on the same line only both count if they
 * overlap by at most 1 cell (i.e. their start offsets differ by >= 4).
 * Windows on different lines never share more than a single cell, so
 * they never need this check.
 * ------------------------------------------------------------------- */
const WINDOW_LINES = (() => {
  const groups = new Map(); // lineKey -> [{ idx, start }]
  WINDOWS.forEach((w, idx) => {
    const r0 = Math.floor(w[0] / 10), c0 = w[0] % 10;
    const r4 = Math.floor(w[4] / 10), c4 = w[4] % 10;
    let key, start;
    if (r0 === r4) { key = 'row' + r0; start = c0; }               // horizontal
    else if (c0 === c4) { key = 'col' + c0; start = r0; }          // vertical
    else if (c4 - c0 === 4) { key = 'd1' + (r0 - c0); start = r0; } // ↘ diagonal
    else { key = 'd2' + (r0 + c0); start = r0; }                   // ↙ diagonal
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ idx, start });
  });
  // sort each line's windows by their start offset for the greedy pick below
  for (const arr of groups.values()) arr.sort((a, b) => a.start - b.start);
  return [...groups.values()];
})();

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const handSize = n => (n === 2 ? 7 : n <= 4 ? 6 : 5);

let uidCounter = 1;
const nextUid = () => 'c' + (uidCounter++);

function createGame(cfg) {
  const seats = cfg.seats.map(s => ({
    id: s.id, name: s.name, isBot: !!s.isBot, skill: s.skill || 'pro',
    team: (s.team === 0 || s.team === 1) ? s.team : -1, // honor lobby-chosen teams
  }));
  const n = seats.length;
  const teamCount = n % 2 === 0 ? 2 : n;               // even -> 2 teams, odd -> everyone solo
  seats.forEach((s, i) => {
    if (teamCount === 2) {
      if (s.team === -1) s.team = i < n / 2 ? 0 : 1;    // default: split halves
    } else {
      s.team = i;                                       // solo
    }
  });
  // safety: keep 2-team games perfectly balanced
  if (teamCount === 2) {
    let c0 = seats.filter(s => s.team === 0).length;
    while (Math.abs(c0 - (n - c0)) > 1) {
      if (c0 > n - c0) {
        for (let i = n - 1; i >= 0; i--) if (seats[i].team === 0) { seats[i].team = 1; break; }
      } else {
        for (let i = n - 1; i >= 0; i--) if (seats[i].team === 1) { seats[i].team = 0; break; }
      }
      c0 = seats.filter(s => s.team === 0).length;
    }
  }
  const seqNeeded = teamCount === 2 ? 2 : 1;

  // turn order: in 2-team games the teams strictly alternate (official rule —
  // teammates never play two turns in a row). Solo games keep seat order.
  const turnOrder = [];
  if (teamCount === 2) {
    const t0 = seats.filter(s => s.team === 0);
    const t1 = seats.filter(s => s.team === 1);
    for (let i = 0; i < Math.max(t0.length, t1.length); i++) {
      if (t0[i]) turnOrder.push(t0[i].id);
      if (t1[i]) turnOrder.push(t1[i].id);
    }
  } else {
    seats.forEach(s => turnOrder.push(s.id));
  }

  // board
  const keys = shuffle(BOARD_KEYS.slice());
  const board = [];
  for (let i = 0; i < 100; i++) {
    board.push({ key: CORNERS.has(i) ? null : keys.pop(), chip: null, corner: CORNERS.has(i) });
  }

  // deck & hands
  const deck = shuffle(DECK_KEYS.slice());
  const hands = {};
  seats.forEach(s => (hands[s.id] = []));
  const hs = handSize(n);
  for (let round = 0; round < hs; round++) {
    for (const s of seats) {
      if (deck.length) hands[s.id].push({ uid: nextUid(), key: deck.pop() });
    }
  }

  return {
    phase: 'playing',        // 'playing' | 'over'
    seats, teamCount, seqNeeded, turnOrder,
    board, deck, discard: [],
    hands,
    turnIdx: 0,
    seqCount: Array(teamCount).fill(0),
    locked: new Set(),       // cell indices whose chips are protected
    winner: null,
    moveNo: 0,
    swapped: {},             // seatId -> swaps used this turn
    log: [],
    lastAction: null,
  };
}

const turnOf = s => s.turnOrder[s.turnIdx];
const teamOf = (s, seatId) => s.seats.find(x => x.id === seatId).team;
const covered = (cell, team) => cell.corner || cell.chip === team;

function windowsFor(board, team) {
  const out = [];
  for (const w of WINDOWS) if (w.every(i => covered(board[i], team))) out.push(w);
  return out;
}

// True sequence count for a team: counts how many *non-overlapping-by-more-
// than-1-cell* 5-chip windows exist. This is what actually decides a win —
// e.g. 6 chips in a row only ever forms ONE sequence (the two raw windows
// you can draw through it share 4 cells), while 9+ in a row can form two.
function countSequences(board, team) {
  let total = 0;
  for (const line of WINDOW_LINES) {
    let lastStart = -Infinity;
    for (const { idx, start } of line) {
      if (!WINDOWS[idx].every(i => covered(board[i], team))) continue;
      if (start - lastStart >= 4) { total++; lastStart = start; }
    }
  }
  return total;
}

// recompute sequence counts for every team
function recomputeSeqCount(s) {
  for (let t = 0; t < s.teamCount; t++) s.seqCount[t] = countSequences(s.board, t);
}

// recompute protected chips for every team
function lockAll(s) {
  s.locked.clear();
  for (let t = 0; t < s.teamCount; t++) {
    for (const w of windowsFor(s.board, t)) for (const i of w) if (s.board[i].chip === t) s.locked.add(i);
  }
}

function log(s, text) {
  s.log.push({ text, n: s.moveNo });
  if (s.log.length > 60) s.log.shift();
}

function draw(s, seatId) {
  if (s.deck.length === 0) {
    if (s.discard.length === 0) return null; // nothing to draw (shouldn't happen with 104 cards)
    s.deck = shuffle(s.discard);
    s.discard = [];
    log(s, 'Draw pile empty — discards reshuffled into a new deck.');
  }
  const k = s.deck.pop();
  s.hands[seatId].push({ uid: nextUid(), key: k });
  return k;
}

// cells still open for a card key / a wild
const openFor = (s, key) => {
  const out = [];
  for (let i = 0; i < 100; i++) {
    const c = s.board[i];
    if (c.chip !== null) continue;
    if (c.corner) continue;
    if (kindOf(key) === 'n') { if (c.key === key) out.push(i); }
    else out.push(i);
  }
  return out;
};

function deadCards(s, seatId) {
  const out = [];
  for (const card of s.hands[seatId]) {
    if (kindOf(card.key) !== 'n') continue;
    if (openFor(s, card.key).length === 0) out.push(card.uid);
  }
  return out;
}

function removeCard(s, seatId, uid) {
  const hand = s.hands[seatId];
  const idx = hand.findIndex(c => c.uid === uid);
  if (idx === -1) return null;
  const [card] = hand.splice(idx, 1);
  s.discard.push(card.key);
  return card;
}

function skipTurn(s) {
  s.turnIdx = (s.turnIdx + 1) % s.turnOrder.length;
  s.swapped = {};
}

function finishMove(s, seatId, event) {
  s.moveNo++;
  s.lastAction = { ...event, moveNo: s.moveNo };
  const t = teamOf(s, seatId);
  recomputeSeqCount(s);
  if (event.type === 'place' && s.seqCount[t] >= s.seqNeeded) {
    s.phase = 'over';
    s.winner = t;
    lockAll(s);
    log(s, 'Winning sequence completed!');
    return;
  }
  lockAll(s);
  skipTurn(s);
}

/* ---------------- actions ---------------- */

function apply(s, seatId, action) {
  if (s.phase !== 'playing') return { ok: false, error: 'The game is over.' };
  if (turnOf(s) !== seatId) return { ok: false, error: 'It is not your turn.' };
  const seat = s.seats.find(x => x.id === seatId);
  const t = seat.team;
  const hand = s.hands[seatId];
  const card = hand.find(c => c.uid === action.uid);
  if (!card) return { ok: false, error: 'Card not in your hand.' };

  const act = action.t;

  if (act === 'swap') {
    const kind = kindOf(card.key);
    if (kind !== 'n') return { ok: false, error: 'Only ordinary dead cards can be swapped.' };
    if (openFor(s, card.key).length > 0) return { ok: false, error: 'That card can still be played.' };
    if ((s.swapped[seatId] || 0) >= 1) return { ok: false, error: 'You may swap only one dead card per turn.' };
    removeCard(s, seatId, card.uid);
    draw(s, seatId);
    s.swapped[seatId] = (s.swapped[seatId] || 0) + 1;
    s.moveNo++;
    s.lastAction = { type: 'swap', by: seatId, cardKey: card.key, moveNo: s.moveNo };
    log(s, seat.name + ' traded a dead card (' + cardLabel(card.key) + ') for a new one.');
    return { ok: true };
  }

  if (act === 'play' || act === 'playJack1') {
    const kind = kindOf(card.key);
    const cell = action.cell;

    if (act === 'play') {
      if (kind === 'w1') return { ok: false, error: 'One-eyed Jacks remove a chip — use the remove action.' };
      if (cell == null || cell < 0 || cell > 99 || s.board[cell].corner) return { ok: false, error: 'Invalid space.' };
      if (s.board[cell].chip !== null) return { ok: false, error: 'That space is already taken.' };
      if (kind === 'n' && s.board[cell].key !== card.key) return { ok: false, error: 'That card does not match that space.' };
      removeCard(s, seatId, card.uid);
      s.board[cell].chip = t;
      const drawn = draw(s, seatId);
      finishMove(s, seatId, { type: 'place', by: seatId, team: t, cell, cardKey: card.key });
      log(s, seat.name + ' played ' + cardLabel(card.key) + (drawn ? '' : ' (no cards left to draw)') + '.');
      return { ok: true };
    }

    // one-eyed jack
    if (kind !== 'w1') return { ok: false, error: 'Only one-eyed Jacks can remove chips.' };
    if (cell != null) {
      const c = s.board[cell];
      if (!c || c.corner) return { ok: false, error: 'Invalid target.' };
      if (c.chip === null) return { ok: false, error: 'There is no chip there.' };
      if (c.chip === t) return { ok: false, error: 'You cannot remove your own chip.' };
      if (s.locked.has(cell)) return { ok: false, error: 'That chip is part of a completed sequence.' };
      removeCard(s, seatId, card.uid);
      const targetTeam = c.chip;
      c.chip = null;
      const drawn = draw(s, seatId);
      finishMove(s, seatId, { type: 'remove', by: seatId, team: t, cell, cardKey: card.key });
      const victim = s.seats.find(x => x.team === targetTeam);
      log(s, seat.name + ' used a one-eyed Jack to remove ' + (victim ? victim.name + "'s" : 'an opponent') + ' chip!');
      return { ok: true };
    }
    // no target chosen -> just discard the jack
    removeCard(s, seatId, card.uid);
    const drawn = draw(s, seatId);
    finishMove(s, seatId, { type: 'discard', by: seatId, cardKey: card.key, moveNo: 0 });
    log(s, seat.name + ' discarded a one-eyed Jack (no chips to remove).');
    return { ok: true };
  }

  return { ok: false, error: 'Unknown action.' };
}

/* ---------------- bot AI ---------------- */

function botMove(s, seatId, skill) {
  const seat = s.seats.find(x => x.id === seatId);
  const t = seat.team;
  const hand = s.hands[seatId];
  const oppTeams = [];
  for (let i = 0; i < s.teamCount; i++) if (i !== t) oppTeams.push(i);

  const needed = s.seqNeeded;
  const chill = skill !== 'pro';

  const oppStats = () => {
    let maxSeq = 0, imminent = 0; // imminent: a 4-covered window with an open cell
    for (const o of oppTeams) {
      let seq = 0;
      for (const w of WINDOWS) {
        let cov = 0, open = 0;
        for (const i of w) {
          if (covered(s.board[i], o)) cov++;
          else if (s.board[i].chip === null) open++;
        }
        if (cov === 5) seq++;
        else if (cov === 4 && open === 1) imminent++;
      }
      maxSeq = Math.max(maxSeq, seq);
    }
    return { maxSeq, imminent };
  };
  const myWindows = () => countSequences(s.board, t);
  const myThreats = () => { // open cells that would complete a window for me
    let n = 0;
    for (let i = 0; i < 100; i++) {
      if (s.board[i].chip !== null || s.board[i].corner) continue;
      s.board[i].chip = t;
      let completes = 0;
      for (const w of WINDOWS) if (w.includes(i) && w.every(j => covered(s.board[j], t))) completes++;
      s.board[i].chip = null;
      n += Math.min(completes, 1);
    }
    return n;
  };

  const base = () => ({
    seq: myWindows(),
    opp: oppStats(),
    threats: myThreats(),
  });

  const scorePlace = (cellIdx, isWild) => {
    const before = base();
    const c = s.board[cellIdx];
    if (c.chip !== null || c.corner) return -1e9;
    c.chip = t;
    const after = base();
    c.chip = null;

    let score = 0;
    const gained = after.seq - before.seq;
    if (before.seq + gained >= needed && gained > 0) score += 1e9;           // win now
    score += gained * 4000;
    if (after.opp.imminent > 0 && before.opp.imminent > after.opp.imminent) score += 3500 * (before.opp.imminent - after.opp.imminent); // blocked an imminent win
    else if (after.opp.imminent > 0) score -= 2200 * after.opp.imminent;     // left a threat
    score -= after.opp.maxSeq * 900;
    score += after.threats * 160;                                            // created threats
    score += Math.random() * 140;
    if (isWild) score -= 300;                                                // don't waste wilds casually
    return score;
  };

  const scoreRemove = cellIdx => {
    const before = base();
    const c = s.board[cellIdx];
    if (c.chip === null || c.chip === t || s.locked.has(cellIdx) || c.corner) return -1e9;
    const victim = c.chip;
    c.chip = null;
    const after = base();
    c.chip = victim;
    let score = 0;
    if (before.opp.imminent > 0 && after.opp.imminent < before.opp.imminent) score += 4000 * (before.opp.imminent - after.opp.imminent);
    score += (before.opp.maxSeq - after.opp.maxSeq) * 5000;
    score -= after.opp.imminent * 1500;
    score += Math.random() * 140;
    return score;
  };

  // build candidates
  const cands = [];
  for (const card of hand) {
    const kind = kindOf(card.key);
    if (kind === 'n') {
      for (const i of openFor(s, card.key)) cands.push({ card, cell: i, score: scorePlace(i, false) });
    } else if (kind === 'w2') {
      const opens = [];
      for (let i = 0; i < 100; i++) if (s.board[i].chip === null && !s.board[i].corner) opens.push(i);
      const top = opens
        .map(i => ({ i, sc: scorePlace(i, true) }))
        .sort((a, b) => b.sc - a.sc)
        .slice(0, 6);
      for (const o of top) cands.push({ card, cell: o.i, score: o.sc });
    } else {
      const chips = [];
      for (let i = 0; i < 100; i++) {
        const c = s.board[i];
        if (c.chip !== null && c.chip !== t && !s.locked.has(i) && !c.corner) chips.push({ i, sc: scoreRemove(i) });
      }
      chips.sort((a, b) => b.sc - a.sc);
      const top = chips.slice(0, 6);
      if (top.length === 0) cands.push({ card, cell: null, score: -500 + Math.random() * 100 }); // just discard
      for (const o of top) cands.push({ card, cell: o.i, score: o.sc });
    }
  }

  if (cands.length === 0) return null;
  cands.sort((a, b) => b.score - a.score);
  let pick;
  if (chill) {
    const shortlist = cands.slice(0, Math.min(4, cands.length));
    pick = shortlist[Math.floor(Math.random() * shortlist.length)];
  } else {
    pick = cands[0];
  }
  const kind = kindOf(pick.card.key);
  if (kind === 'w1') return { t: 'playJack1', uid: pick.card.uid, cell: pick.cell };
  return { t: 'play', uid: pick.card.uid, cell: pick.cell };
}

/* ---------------- public state for a viewer ---------------- */

function publicState(s, viewerSeatId) {
  const seats = s.seats.map(x => ({
    id: x.id, name: x.name, isBot: x.isBot, skill: x.skill, team: x.team,
    handCount: s.hands[x.id] ? s.hands[x.id].length : 0,
  }));
  const dead = deadCards(s, viewerSeatId);
  const hand = (s.hands[viewerSeatId] || []).map(c => ({
    uid: c.uid, key: c.key, kind: kindOf(c.key), dead: dead.includes(c.uid),
  }));
  return {
    phase: s.phase,
    seats,
    teamCount: s.teamCount,
    seqNeeded: s.seqNeeded,
    seqCount: s.seqCount.slice(),
    board: s.board.map(c => ({ key: c.key, chip: c.chip, corner: c.corner })),
    deckCount: s.deck.length,
    discardCount: s.discard.length,
    hand,
    locked: Array.from(s.locked),
    turn: turnOf(s),
    yourTurn: turnOf(s) === viewerSeatId,
    winner: s.winner,
    lastAction: s.lastAction,
    log: s.log.slice(-30),
    moveNo: s.moveNo,
  };
}

module.exports = {
  RANKS, SUITS, SUIT_SYM, WINDOWS, CORNERS,
  kindOf, cardLabel, handSize,
  createGame, apply, botMove, deadCards, publicState, windowsFor, countSequences,
  turnOf, teamOf, lockAll, recomputeSeqCount, skipTurn,
};
