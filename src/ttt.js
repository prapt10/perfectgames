'use strict';
/* ============================================================
 * Perfect Games — Tic-Tac-Toe engine (pure logic)
 * - 3x3 grid, X starts, alternate turns
 * - Win by 3 in a row (8 lines); draw when the board fills
 * ============================================================ */

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],   // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8],   // cols
  [0, 4, 8], [2, 4, 6],              // diagonals
];

function createGame(cfg) {
  const seats = cfg.seats.map(s => ({ id: s.id, name: s.name, isBot: !!s.isBot, skill: s.skill || 'pro' }));
  // 2 seats only — X and O
  return {
    phase: 'playing',
    seats,
    board: Array(9).fill(null), // null | 0 (X) | 1 (O)
    turnIdx: 0,                 // 0 = X
    winner: null,               // 0 | 1 | null
    draw: false,
    moveNo: 0, log: [], lastAction: null,
  };
}

const turnSeat = s => s.seats[s.turnIdx];
const markOf = idx => (idx === 0 ? 'X' : 'O');

function checkResult(board) {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] !== null && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every(c => c !== null)) return { draw: true };
  return null;
}

function log(s, text) {
  s.log.push({ text, n: s.moveNo });
  if (s.log.length > 40) s.log.shift();
}

function apply(s, seatId, action) {
  if (s.phase !== 'playing') return { ok: false, error: 'The game is over.' };
  if (turnSeat(s).id !== seatId) return { ok: false, error: 'It is not your turn.' };
  const cell = parseInt(action.cell, 10);
  if (isNaN(cell) || cell < 0 || cell > 8) return { ok: false, error: 'Invalid cell.' };
  if (s.board[cell] !== null) return { ok: false, error: 'That cell is already taken.' };

  s.board[cell] = s.turnIdx;
  s.moveNo++;
  s.lastAction = { type: 'move', by: seatId, cell, mark: markOf(s.turnIdx) };
  const seat = turnSeat(s);

  const res = checkResult(s.board);
  if (res) {
    if (res.winner != null) {
      s.phase = 'over';
      s.winner = res.winner;
      s.winLine = res.line;
      log(s, markOf(res.winner) + ' — ' + seat.name + ' wins!');
    } else {
      s.phase = 'over';
      s.draw = true;
      log(s, "It's a draw!");
    }
    return { ok: true };
  }

  s.turnIdx = 1 - s.turnIdx;
  log(s, seat.name + ' placed ' + markOf(1 - s.turnIdx === 0 ? 1 : 0) + '.');
  return { ok: true };
}

/* ---------------- bot AI (minimax with randomness) ---------------- */

function minimax(board, me, opp, turn, depth) {
  const res = checkResult(board);
  if (res) {
    if (res.winner === me) return 10 - depth;
    if (res.winner === opp) return depth - 10;
    return 0;
  }
  if (depth > 8) return 0;
  let best;
  if (turn === me) {
    best = -Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = turn;
        best = Math.max(best, minimax(board, me, opp, 1 - turn, depth + 1));
        board[i] = null;
      }
    }
  } else {
    best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        board[i] = turn;
        best = Math.min(best, minimax(board, me, opp, 1 - turn, depth + 1));
        board[i] = null;
      }
    }
  }
  return best;
}

function botMove(s, seatId, skill) {
  if (turnSeat(s).id !== seatId || s.phase !== 'playing') return null;
  const me = s.turnIdx;
  const opp = 1 - me;
  const chill = skill !== 'pro';

  let bestCells = [];
  let bestScore = -Infinity;
  for (let i = 0; i < 9; i++) {
    if (s.board[i] === null) {
      s.board[i] = me;
      let score = minimax(s.board, me, opp, opp, 1);
      if (chill && Math.random() < 0.4) score += Math.random() * 4 - 2;
      s.board[i] = null;
      if (score > bestScore) { bestScore = score; bestCells = [i]; }
      else if (score === bestScore) bestCells.push(i);
    }
  }
  if (!bestCells.length) return null;
  const pick = bestCells[Math.floor(Math.random() * bestCells.length)];
  return { t: 'move', cell: pick };
}

/* ---------------- public state ---------------- */

function publicState(s) {
  return {
    phase: s.phase,
    seats: s.seats.map(x => ({ id: x.id, name: x.name, isBot: x.isBot, skill: x.skill, mark: x === s.seats[0] ? 'X' : 'O' })),
    board: s.board.slice(),
    turn: turnSeat(s).id,
    turnMark: markOf(s.turnIdx),
    winner: s.winner,
    draw: s.draw,
    winLine: s.winLine ? s.winLine.slice() : null,
    lastAction: s.lastAction,
    log: s.log.slice(-30),
    moveNo: s.moveNo,
  };
}

module.exports = { LINES, createGame, apply, botMove, publicState, markOf };
