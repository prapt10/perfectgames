'use strict';
/* ============================================================
 * Perfect Games — Tambola / Housie engine (pure logic, no I/O)
 *
 * Rules (classic Indian housie):
 *  - Each player gets 1-2 tickets (3 rows x 9 columns, 15 numbers).
 *    Column ranges: 1-9, 10-19, ..., 80-90. Every row has exactly 5
 *    numbers. No two tickets are identical.
 *  - Numbers 1-90 are called one at a time (auto or manual caller).
 *  - Prizes (first valid claim wins each):
 *      Early Five     — first ticket with 5+ marked numbers
 *      Top Line       — all 5 numbers in the top row marked
 *      Middle Line    — all 5 in the middle row
 *      Bottom Line    — all 5 in the bottom row
 *      Full House     — all 15 numbers marked (ends the game)
 *  - Invalid claims are rejected and cost the player a strike.
 * ============================================================ */

const RANGES = [
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
  [30, 31, 32, 33, 34, 35, 36, 37, 38, 39],
  [40, 41, 42, 43, 44, 45, 46, 47, 48, 49],
  [50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
  [60, 61, 62, 63, 64, 65, 66, 67, 68, 69],
  [70, 71, 72, 73, 74, 75, 76, 77, 78, 79],
  [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90],
];

const PRIZES = [
  { key: 'earlyFive', name: 'Early Five' },
  { key: 'topLine', name: 'Top Line' },
  { key: 'midLine', name: 'Middle Line' },
  { key: 'bottomLine', name: 'Bottom Line' },
  { key: 'fullHouse', name: 'Full House' },
];

const TOTAL = 90;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* generate one valid ticket: 3x9, 15 numbers, 5 per row, column ranges */
function genTicket(used) {
  for (let guard = 0; guard < 300; guard++) {
    const counts = [1, 2, 2, 2, 2, 2, 2, 1, 1]; // sum = 15
    // randomize column counts (keep 1..3 per column, sum 15)
    for (let i = 0; i < 40; i++) {
      const ones = [], threes = [];
      counts.forEach((v, c) => { if (v === 1) ones.push(c); if (v === 3) threes.push(c); });
      if (ones.length && threes.length) {
        counts[ones[Math.floor(Math.random() * ones.length)]]++;
        counts[threes[Math.floor(Math.random() * threes.length)]]--;
      }
    }
    const grid = Array.from({ length: 3 }, () => Array(9).fill(null));
    // place columns in random order; each column picks rows with the most
    // remaining capacity so every row ends with exactly 5 numbers
    const cap = [5, 5, 5];
    const colOrder = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    let ok = true;
    for (const c of colOrder) {
      const k = counts[c];
      const rows = [0, 1, 2]
        .sort((x, y) => (cap[y] - cap[x]) || (Math.random() - 0.5))
        .slice(0, k);
      const nums = shuffle(RANGES[c].slice()).slice(0, k).sort((a, b) => a - b);
      rows.sort((a, b) => a - b);
      rows.forEach((r, i) => {
        grid[r][c] = nums[i];
        cap[r]--;
        if (cap[r] < 0) ok = false;
      });
    }
    if (!ok) continue;
    const sig = JSON.stringify(grid);
    if (!used.has(sig)) {
      used.add(sig);
      return grid;
    }
  }
  return null; // practically unreachable
}

function genTickets(count, used) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = genTicket(used);
    if (t) out.push(t);
  }
  return out;
}

function log(g, text) {
  g.log.push({ text, n: g.moveNo });
  if (g.log.length > 60) g.log.shift();
}

function createGame(cfg, now) {
  const seats = cfg.seats.map(s => ({
    id: s.id, name: s.name, isBot: !!s.isBot, skill: s.skill || 'pro', strikes: 0,
  }));
  const tpp = Math.min(2, Math.max(1, +cfg.tickets || 1));
  const used = new Set();
  const tickets = {};
  seats.forEach(s => { tickets[s.id] = genTickets(tpp, used); });
  return {
    phase: 'playing',
    seats,
    tickets,
    called: [],
    calledSet: new Set(),
    prizes: [],
    prizeWon: {},
    winner: null,
    lastNumber: null,
    nextCallAt: now + (cfg.intervalMs || 4000),
    intervalMs: cfg.intervalMs || 4000,
    moveNo: 0,
    log: [],
    local: !!cfg.local,
  };
}

/* draw the next uncalled number */
function callNumber(g, now) {
  if (g.phase !== 'playing') return { ok: false, error: 'The game is not in progress.' };
  const uncalled = [];
  for (let n = 1; n <= TOTAL; n++) if (!g.calledSet.has(n)) uncalled.push(n);
  if (!uncalled.length) { g.phase = 'over'; return { ok: false, error: 'All 90 numbers have been called.' }; }
  const n = uncalled[Math.floor(Math.random() * uncalled.length)];
  g.called.push(n);
  g.calledSet.add(n);
  g.lastNumber = n;
  g.moveNo++;
  g.nextCallAt = now + g.intervalMs;
  log(g, 'Number ' + n + ' called.');
  return { ok: true, number: n };
}

/* ---------- marks & prize detection ---------- */

function ticketNumbers(ticket) {
  const out = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) if (ticket[r][c] != null) out.push(ticket[r][c]);
  return out;
}

function marksOn(g, ticket) {
  return ticketNumbers(ticket).filter(n => g.calledSet.has(n)).length;
}

function rowComplete(g, ticket, r) {
  for (let c = 0; c < 9; c++) {
    const n = ticket[r][c];
    if (n != null && !g.calledSet.has(n)) return false;
  }
  return true;
}

function prizeComplete(g, seatId, ticketIdx, key) {
  const ticket = (g.tickets[seatId] || [])[ticketIdx];
  if (!ticket) return false;
  switch (key) {
    case 'earlyFive': return marksOn(g, ticket) >= 5;
    case 'topLine': return rowComplete(g, ticket, 0);
    case 'midLine': return rowComplete(g, ticket, 1);
    case 'bottomLine': return rowComplete(g, ticket, 2);
    case 'fullHouse': return marksOn(g, ticket) >= 15;
    default: return false;
  }
}

/* prizes this seat may claim right now (unclaimed + complete) */
function eligible(g, seatId) {
  const out = [];
  const tickets = g.tickets[seatId] || [];
  for (let ti = 0; ti < tickets.length; ti++) {
    for (const p of PRIZES) {
      if (g.prizeWon[p.key]) continue;
      if (prizeComplete(g, seatId, ti, p.key)) out.push({ prize: p.key, name: p.name, ticketIdx: ti });
    }
  }
  return out;
}

/* ---------- actions ---------- */

function applyClaim(g, seatId, action, now) {
  const seat = g.seats.find(s => s.id === seatId);
  if (!seat) return { ok: false, error: 'Not in the game.' };
  if (g.phase !== 'playing') return { ok: false, error: 'The game is over.' };
  const key = String(action.prize || '');
  const def = PRIZES.find(p => p.key === key);
  if (!def) return { ok: false, error: 'Unknown prize.' };
  if (g.prizeWon[key]) {
    return { ok: false, error: def.name + ' was already claimed by ' + g.prizeWon[key].byName + '!' };
  }
  const ticketIdx = Math.max(0, +action.ticketIdx || 0);
  if (!(g.tickets[seatId] || [])[ticketIdx]) return { ok: false, error: 'Invalid ticket.' };
  if (!prizeComplete(g, seatId, ticketIdx, key)) {
    seat.strikes++;
    return {
      ok: false,
      error: 'Invalid claim! ' + def.name + ' isn\u2019t complete on that ticket. Strike ' + seat.strikes + ' of 3.',
    };
  }
  g.prizeWon[key] = { by: seatId, byName: seat.name, at: now };
  g.prizes.push({ key, name: def.name, by: seatId, byName: seat.name, ticketIdx, at: now, n: ++g.moveNo });
  log(g, seat.name + ' claimed ' + def.name + '!');
  if (key === 'fullHouse') {
    g.phase = 'over';
    g.winner = seatId;
    log(g, seat.name + ' wins with FULL HOUSE! 🎉');
  }
  return { ok: true, prize: def.name };
}

/* bots claim the first eligible prize on their first eligible ticket */
function botCheck(g, now) {
  const claimed = [];
  for (const s of g.seats) {
    if (!s.isBot) continue;
    const list = eligible(g, s.id);
    if (list.length) {
      const r = applyClaim(g, s.id, { prize: list[0].prize, ticketIdx: list[0].ticketIdx }, now);
      if (r.ok) claimed.push(r);
    }
  }
  return claimed;
}

module.exports = {
  RANGES, PRIZES, TOTAL,
  genTicket, genTickets, createGame, callNumber,
  ticketNumbers, marksOn, rowComplete, prizeComplete, eligible,
  applyClaim, botCheck,
};
