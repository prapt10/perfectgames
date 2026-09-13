'use strict';
/* ============================================================
 * Perfect Games — Classic Ludo engine (pure logic, no I/O)
 * - 15x15 board, 52-cell track, 4 tokens per player (2-4 players)
 * - Enter on a 6; safe squares (stars); capture on landing;
 *   home column (2 cells + center); first to get all 4 home wins
 * - Rolling 6 grants an extra roll (3 sixes in a row = turn passes)
 * - One legal move after a roll is executed automatically
 * ============================================================ */

const COLORS = ['red', 'green', 'yellow', 'blue'];
// classic board layout (like the reference board): green top-left, yellow top-right,
// blue bottom-right, red bottom-left. Slot = physical corner (0 TL, 1 TR, 2 BR, 3 BL).
const COLOR_HEX = ['#e53e3e', '#38a169', '#dd9b16', '#3182ce'];
const SLOT_OF = c => (c + 3) % 4; // display color -> physical corner slot

// 52-cell clockwise track (row, col). Starts: red 0, green 13, blue 26, yellow 39
const TRACK = [
  [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],
  [8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],
  [13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0],
];
const STARTS = [0, 13, 26, 39];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const TRACK_IDX = {};
TRACK.forEach((c, i) => { TRACK_IDX[c[0] + ',' + c[1]] = i; });

// home columns: 2 colored cells then the shared center (7,7)
const HOME_COL = [
  [[6,6],[6,7],[7,7]],
  [[6,8],[7,8],[7,7]],
  [[8,8],[8,7],[7,7]],
  [[8,6],[7,6],[7,7]],
];
// base token positions: the four 6x6 corner squares (top-left red, top-right green,
// bottom-right yellow, bottom-left blue — classic Ravensburger layout)
const BASE_SLOTS = [
  [[1,1],[1,4],[4,1],[4,4]],
  [[1,10],[1,13],[4,10],[4,13]],
  [[10,10],[10,13],[13,10],[13,13]],
  [[10,1],[10,4],[13,1],[13,4]],
];

const colorFor = (n, i) => (n === 2 ? [0, 2][i] : n === 3 ? [0, 1, 2][i] : i); // 2p = red vs yellow (opposite corners)

const cellOf = (colorIdx, tk) => {
  const slot = SLOT_OF(colorIdx);
  if (tk.state === 'base') return BASE_SLOTS[slot][tk.idx];
  if (tk.state === 'track') return TRACK[(STARTS[slot] + tk.dist) % 52];
  if (tk.state === 'home') return HOME_COL[slot][tk.dist];
  return [7, 7]; // done
};

const key = c => c[0] + ',' + c[1];

function createGame(cfg) {
  const seats = cfg.seats.map((s, i) => ({
    id: s.id, name: s.name, isBot: !!s.isBot, skill: s.skill || 'pro',
    color: colorFor(cfg.seats.length, i),
  }));
  const tokens = {};
  for (const c of COLORS) {
    tokens[c] = [0, 1, 2, 3].map(idx => ({ idx, state: 'base', dist: -1 }));
  }
  return {
    phase: 'playing', seats, tokens,
    turnIdx: 0, die: 0, rollsLeft: 0, sixes: 0,
    pending: false, legal: [],
    winner: null, moveNo: 0, log: [], lastAction: null,
  };
}

const turnSeat = s => s.seats[s.turnIdx];

let rollFn = () => 1 + Math.floor(Math.random() * 6);
const _setRoll = fn => { rollFn = fn; };

function ownOnCell(state, colorIdx, cell) {
  const k = key(cell);
  for (const tk of state.tokens[COLORS[colorIdx]]) {
    if (tk.state === 'done') continue;
    if (key(cellOf(colorIdx, tk)) === k) return true;
  }
  return false;
}

function captureAt(state, colorIdx, cell) {
  const k = key(cell);
  const isSafe = SAFE.has(TRACK_IDX[k]);
  if (isSafe) return false;
  let captured = false;
  for (let oc = 0; oc < 4; oc++) {
    if (oc === colorIdx) continue;
    for (const tk of state.tokens[COLORS[oc]]) {
      if (tk.state === 'track' && key(cellOf(oc, tk)) === k) {
        tk.state = 'base'; tk.dist = -1;
        captured = true;
      }
    }
  }
  return captured;
}

function legalMovesFor(state, colorIdx) {
  const out = [];
  const die = state.die;
  for (const tk of state.tokens[COLORS[colorIdx]]) {
    if (tk.state === 'done') continue;
    if (tk.state === 'base') {
      if (die === 6) out.push(tk.idx); // start square is safe — stacking allowed
      continue;
    }
    if (tk.state === 'track') {
      const target = tk.dist + die;
      if (target <= 51) {
        const cell = TRACK[(STARTS[SLOT_OF(colorIdx)] + target) % 52];
        if (!ownOnCell(state, colorIdx, cell)) out.push(tk.idx);
      } else if (target - 52 <= 2) {
        out.push(tk.idx);
      }
    } else { // home column
      if (tk.dist + die === 2) out.push(tk.idx);
    }
  }
  return out;
}

function log(s, text) {
  s.log.push({ text, n: s.moveNo });
  if (s.log.length > 60) s.log.shift();
}

function passTurn(s, note) {
  s.pending = false; s.legal = []; s.rollsLeft = 0; s.sixes = 0;
  s.turnIdx = (s.turnIdx + 1) % s.seats.length;
  // keep s.die — the last rolled number stays visible until the next roll
  if (note) log(s, note);
}

function doMove(state, colorIdx, tokenIdx) {
  const tk = state.tokens[COLORS[colorIdx]][tokenIdx];
  const die = state.die;
  if (tk.state === 'base') {
    tk.state = 'track'; tk.dist = 0;
    captureAt(state, colorIdx, TRACK[STARTS[SLOT_OF(colorIdx)]]); // start is safe → no-op but keep simple
    log(state, 'Token enters the board.');
  } else if (tk.state === 'track') {
    const target = tk.dist + die;
    if (target <= 51) {
      tk.dist = target;
      const cell = TRACK[(STARTS[SLOT_OF(colorIdx)] + target) % 52];
      if (captureAt(state, colorIdx, cell)) log(state, 'Captured an opponent token!');
    } else {
      const steps = target - 52;
      if (steps === 2) { tk.state = 'done'; tk.dist = -1; log(state, 'Token reached home!'); }
      else { tk.state = 'home'; tk.dist = steps; }
    }
  } else { // home
    tk.dist += die;
    if (tk.dist === 2) { tk.state = 'done'; tk.dist = -1; log(state, 'Token reached home!'); }
  }
  state.moveNo++;
  state.lastAction = { type: 'move', by: turnSeat(state).id, color: colorIdx, token: tokenIdx, die };
  // win check
  const allDone = state.tokens[COLORS[colorIdx]].every(t => t.state === 'done');
  if (allDone) {
    state.phase = 'over'; state.winner = colorIdx;
    state.pending = false; state.legal = [];
    log(state, 'All four tokens home — ' + COLORS[colorIdx] + ' wins!');
    return;
  }
  if (state.rollsLeft > 0) {
    state.rollsLeft = 0; // extra roll from the 6
    state.pending = false; state.legal = [];
  } else {
    passTurn(state);
  }
}

/* ---------------- actions ---------------- */

function apply(s, seatId, action) {
  if (s.phase !== 'playing') return { ok: false, error: 'The game is over.' };
  if (turnSeat(s).id !== seatId) return { ok: false, error: 'It is not your turn.' };
  const colorIdx = turnSeat(s).color;

  if (action.t === 'roll') {
    if (s.pending) return { ok: false, error: 'Choose a token to move first.' };
    s.die = rollFn();
    s.moveNo++;
    s.lastAction = { type: 'roll', by: seatId, die: s.die };
    log(s, turnSeat(s).name + ' rolled a ' + s.die + '.');
    if (s.die === 6) {
      s.sixes++;
      s.rollsLeft = 1;
      if (s.sixes >= 3) { passTurn(s, 'Three sixes in a row — turn passes.'); return { ok: true }; }
    } else {
      s.sixes = 0; s.rollsLeft = 0;
    }
    const legal = legalMovesFor(s, colorIdx);
    s.legal = legal;
    if (legal.length === 0) {
      passTurn(s, 'No legal moves — turn passes.');
    } else if (legal.length === 1) {
      doMove(s, colorIdx, legal[0]); // auto-move
    } else {
      s.pending = true;
    }
    return { ok: true };
  }

  if (action.t === 'move') {
    const tokenIdx = parseInt(action.token, 10);
    if (!s.pending) return { ok: false, error: 'Roll the die first.' };
    if (!s.legal.includes(tokenIdx)) return { ok: false, error: 'That token cannot move.' };
    s.pending = false; s.legal = [];
    doMove(s, colorIdx, tokenIdx);
    return { ok: true };
  }

  return { ok: false, error: 'Unknown action.' };
}

/* ---------------- bot AI ---------------- */

function botMove(s, seatId, skill) {
  if (!s.pending) return { t: 'roll' };
  const seat = turnSeat(s);
  if (seat.id !== seatId) return null;
  const colorIdx = seat.color;
  const legal = s.legal.slice();
  if (!legal.length) return null;
  const chill = skill !== 'pro';

  // simulate each move: capture = top priority
  let best = legal[0], bestScore = -1e9;
  for (const ti of legal) {
    // clone-ish eval: count opponent tokens capturable
    let score = Math.random() * 20;
    const tk = s.tokens[COLORS[colorIdx]][ti];
    if (tk.state === 'track') {
      const target = tk.dist + s.die;
      if (target <= 51) {
        const cell = TRACK[(STARTS[SLOT_OF(colorIdx)] + target) % 52];
        if (!SAFE.has(TRACK_IDX[key(cell)])) {
          for (let oc = 0; oc < 4; oc++) {
            if (oc === colorIdx) continue;
            for (const ot of s.tokens[COLORS[oc]]) {
              if (ot.state === 'track' && key(cellOf(oc, ot)) === key(cell)) score += 120;
            }
          }
        }
        score += (51 - target) * 0.15; // closer to home is better
      } else {
        score += 60 + (target - 52) * 5; // entering home column
      }
    } else if (tk.state === 'base') {
      score += 30; // get tokens out
    } else {
      score += 80; // finish a token
    }
    if (score > bestScore) { bestScore = score; best = ti; }
  }
  if (chill && Math.random() < 0.3) best = legal[Math.floor(Math.random() * legal.length)];
  return { t: 'move', token: best };
}

/* ---------------- public state ---------------- */

function publicState(s) {
  const seats = s.seats.map(x => ({
    id: x.id, name: x.name, isBot: x.isBot, skill: x.skill, color: x.color,
    inBase: s.tokens[COLORS[x.color]].filter(t => t.state === 'base').length,
    done: s.tokens[COLORS[x.color]].filter(t => t.state === 'done').length,
  }));
  const tokens = {};
  for (const c of COLORS) {
    tokens[c] = s.tokens[c].map(t => ({
      idx: t.idx, state: t.state, dist: t.dist, cell: cellOf(COLORS.indexOf(c), t),
    }));
  }
  const turn = turnSeat(s).id;
  return {
    phase: s.phase, seats, turn, yourTurn: false, // filled per viewer
    die: s.die, rollsLeft: s.rollsLeft, sixes: s.sixes,
    pending: s.pending, legal: s.legal.slice(),
    tokens, winner: s.winner, moveNo: s.moveNo,
    lastAction: s.lastAction, log: s.log.slice(-30),
  };
}

module.exports = {
  COLORS, COLOR_HEX, TRACK, STARTS, SAFE, HOME_COL, BASE_SLOTS,
  colorFor, createGame, apply, botMove, publicState, legalMovesFor, cellOf,
  _setRoll,
};
