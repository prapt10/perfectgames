'use strict';
/* Tambola / Housie engine unit tests. Usage: node test/tambola-unit.js */
const tb = require('../src/tambola.js');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}
function t(name, fn) { try { fn(); } catch (e) { failed++; console.error('  ✗ THREW in "' + name + '":', e.message); } }

const NOW = 1000000;
function mk(seatCfg, opts = {}) {
  return tb.createGame({ seats: seatCfg || [
    { id: 'a', name: 'Ana' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cid' },
  ], ...opts }, NOW);
}

t('ticket structure: 3x9, 15 numbers, 5 per row, column ranges, no dups', () => {
  const used = new Set();
  for (let i = 0; i < 25; i++) {
    const tk = tb.genTicket(used);
    ok(tk.length === 3 && tk[0].length === 9, 'ticket is 3x9');
    let total = 0;
    const seen = new Set();
    for (let r = 0; r < 3; r++) {
      let rowNums = 0;
      for (let c = 0; c < 9; c++) {
        const n = tk[r][c];
        if (n != null) {
          rowNums++; total++; seen.add(n);
          ok(RANGES_HAS(c, n), 'col ' + c + ' holds ' + n);
        }
      }
      ok(rowNums === 5, 'row ' + r + ' has exactly 5 numbers');
    }
    ok(total === 15 && seen.size === 15, '15 distinct numbers on ticket');
  }
});
function RANGES_HAS(c, n) {
  const rng = tb.RANGES[c];
  return rng.indexOf(n) !== -1;
}

t('genTickets: all distinct', () => {
  const used = new Set();
  const tickets = tb.genTickets(12, used);
  ok(tickets.length === 12, '12 tickets generated');
  const sigs = new Set(tickets.map(JSON.stringify));
  ok(sigs.size === 12, 'no two tickets identical');
});

t('createGame: tickets assigned, fresh state, interval', () => {
  const g = mk(undefined, { tickets: 2, intervalMs: 3000 });
  ok(g.called.length === 0 && g.prizes.length === 0, 'fresh board');
  ok(g.tickets.a.length === 2 && g.tickets.b.length === 2, '2 tickets per player');
  ok(g.intervalMs === 3000 && g.nextCallAt === NOW + 3000, 'call cadence set');
  ok(g.seats.every(s => s.strikes === 0), 'no strikes yet');
});

t('callNumber: unique 1-90 numbers, cadence, exhaustion', () => {
  const g = mk();
  const seen = new Set();
  let t = NOW;
  for (let i = 0; i < 60; i++) {
    const r = tb.callNumber(g, t);
    ok(r.ok && r.number >= 1 && r.number <= 90, 'call ' + (i + 1) + ' valid');
    ok(!seen.has(r.number), 'no repeats');
    seen.add(r.number);
    ok(g.nextCallAt === t + g.intervalMs, 'nextCallAt advanced');
    t += g.intervalMs;
  }
  ok(seen.size === 60 && g.called.length === 60 && g.lastNumber === g.called[59], '60 called, last tracked');
  // exhaust
  while (tb.callNumber(g, t).ok) t += g.intervalMs;
  ok(g.called.length === 90, 'all 90 called');
  const r2 = tb.callNumber(g, t);
  ok(!r2.ok, 'no calls after exhaustion');
  ok(g.phase === 'over', 'game ends when the deck runs out');
});

t('marks & lines: detection after calls', () => {
  const g = mk();
  // craft a ticket where we control the numbers (valid: 5/5/5 rows)
  const tk = [
    [1, 10, 20, 30, 40, null, null, null, null],
    [null, null, null, null, 45, 52, 60, 70, 80],
    [2, 11, 21, 31, 41, null, null, null, null],
  ];
  g.tickets.a = [tk];
  g.calledSet = new Set([1, 10, 20, 30, 40, 2, 11, 21]);
  ok(tb.marksOn(g, tk) === 8, '8 marks counted');
  ok(tb.rowComplete(g, tk, 0), 'top row complete');
  ok(!tb.rowComplete(g, tk, 1), 'middle row not complete (45,52,60,70,80 uncalled)');
  ok(!tb.rowComplete(g, tk, 2), 'bottom row not complete yet');
  g.calledSet.add(31); g.calledSet.add(41);
  ok(tb.rowComplete(g, tk, 2), 'bottom row complete after 31 & 41');
  ok(tb.prizeComplete(g, 'a', 0, 'topLine'), 'topLine prize complete');
  ok(tb.prizeComplete(g, 'a', 0, 'earlyFive'), 'earlyFive complete (10 marks)');
  ok(tb.prizeComplete(g, 'a', 0, 'fullHouse') === false, 'not full house yet');
  g.calledSet = new Set(tb.ticketNumbers(tk));
  ok(tb.prizeComplete(g, 'a', 0, 'fullHouse'), 'full house when all 15 called');
});

t('applyClaim: valid early five, then duplicate rejected', () => {
  const g = mk();
  const tk = [
    [1, 10, 20, 30, 40, null, null, null, null],
    [null, null, null, null, 45, 52, 60, 70, 80],
    [2, 11, 21, 31, 41, null, null, null, null],
  ];
  g.tickets.a = [tk];
  g.calledSet = new Set([1, 10, 20, 30, 40, 2]);
  let r = tb.applyClaim(g, 'b', { prize: 'earlyFive', ticketIdx: 0 }, NOW);
  ok(!r.ok, 'Ben has no ticket with 5 marks (his ticket is fresh)');
  ok(g.prizes.length === 0, 'no prize recorded');
  r = tb.applyClaim(g, 'a', { prize: 'earlyFive', ticketIdx: 0 }, NOW);
  ok(r.ok && r.prize === 'Early Five', 'Ana claims Early Five');
  ok(g.prizes.length === 1 && g.prizeWon.earlyFive.by === 'a', 'prize recorded');
  r = tb.applyClaim(g, 'a', { prize: 'earlyFive', ticketIdx: 0 }, NOW);
  ok(!r.ok && /already claimed/.test(r.error), 'duplicate claim rejected');
});

t('applyClaim: invalid claim costs a strike', () => {
  const g = mk();
  g.calledSet = new Set([1, 2, 3]);
  let r = tb.applyClaim(g, 'a', { prize: 'topLine', ticketIdx: 0 }, NOW);
  ok(!r.ok && r.error.includes('Strike 1'), 'false claim rejected with strike 1');
  ok(g.seats.find(s => s.id === 'a').strikes === 1, 'strike counted');
});

t('applyClaim: full house ends the game with a winner', () => {
  const g = mk();
  const tk = [
    [1, 10, 20, 30, 40, null, null, null, null],
    [null, null, null, null, 45, 52, 60, 70, 80],
    [2, 11, 21, 31, 41, null, null, null, null],
  ];
  g.tickets.a = [tk];
  g.calledSet = new Set(tb.ticketNumbers(tk));
  const r = tb.applyClaim(g, 'a', { prize: 'fullHouse', ticketIdx: 0 }, NOW);
  ok(r.ok, 'full house claim accepted');
  ok(g.phase === 'over' && g.winner === 'a', 'game over, winner Ana');
  const r2 = tb.applyClaim(g, 'a', { prize: 'topLine', ticketIdx: 0 }, NOW);
  ok(!r2.ok, 'no claims after the game is over');
});

t('eligible: only unclaimed complete prizes, with ticketIdx', () => {
  const g = mk(undefined, { tickets: 2 });
  const tk = [
    [1, 10, 20, 30, 40, null, null, null, null],
    [null, null, null, null, 45, 52, 60, 70, 80],
    [2, 11, 21, 31, 41, null, null, null, null],
  ];
  g.tickets.a = [tk, tb.genTicket(new Set([JSON.stringify(tk)]))];
  g.calledSet = new Set([1, 10, 20, 30, 40, 2, 11]);
  let list = tb.eligible(g, 'a');
  ok(list.some(e => e.prize === 'earlyFive' && e.ticketIdx === 0), 'earlyFive eligible on ticket 0');
  ok(list.some(e => e.prize === 'topLine' && e.ticketIdx === 0), 'topLine eligible on ticket 0');
  ok(!list.some(e => e.prize === 'fullHouse'), 'full house not eligible');
  tb.applyClaim(g, 'a', { prize: 'earlyFive', ticketIdx: 0 }, NOW);
  list = tb.eligible(g, 'a');
  ok(!list.some(e => e.prize === 'earlyFive'), 'claimed prize no longer eligible');
});

t('botCheck: bots claim automatically (incl. full house)', () => {
  const g = mk();
  const tk = [
    [1, 10, 20, 30, 40, null, null, null, null],
    [null, null, null, null, 45, 52, 60, 70, 80],
    [2, 11, 21, 31, 41, null, null, null, null],
  ];
  g.tickets.b = [tk]; // Ben is human; make a bot
  g.seats[1].isBot = true;
  g.calledSet = new Set([1, 10, 20, 30, 40, 2, 11, 21, 31, 41, 45, 52, 60, 70, 80, 5]);
  let total = 0;
  for (let i = 0; i < 6 && g.phase !== 'over'; i++) {
    total += tb.botCheck(g, NOW + 1000).length;
  }
  ok(total >= 1, 'bot claimed prizes across checks (got ' + total + ')');
  ok(g.prizeWon.fullHouse && g.phase === 'over' && g.winner === 'b', 'bot took full house and won');
});

t('local flag preserved; two seats get distinct tickets', () => {
  const g = mk(undefined, { local: true });
  ok(g.local, 'local flag kept');
  const a = JSON.stringify(g.tickets.a[0]), b = JSON.stringify(g.tickets.b[0]);
  ok(a !== b, 'players get different tickets');
});

console.log('\n' + (failed ? failed + ' FAILED, ' : '') + passed + ' passed');
process.exit(failed ? 1 : 0);
