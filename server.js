'use strict';
/* ============================================================
 * Perfect Games — server (multi-game)
 * In-memory rooms only: no database, no files, no accounts.
 * Rooms die when everyone leaves. Full state is pushed to
 * clients after every change (small payloads, dead simple sync).
 * Games: sequence, ludo
 * ============================================================ */

const path = require('path');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const seq = require('./src/sequence.js');
const ludo = require('./src/ludo.js');
const uno = require('./src/uno.js');
const ttt = require('./src/ttt.js');
const dg = require('./src/drawguess.js');
const ch = require('./src/charades.js');
const tb = require('./src/tambola.js');

const PORT = process.env.PORT || 8080;

const app = express();
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.get(['/sequence', '/sequence/'], (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'sequence', 'index.html')));
app.get(['/ludo', '/ludo/'], (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'ludo', 'index.html')));
app.get(['/uno', '/uno/'], (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'uno', 'index.html')));
app.get(['/ttt', '/ttt/'], (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'ttt', 'index.html')));
app.get(['/tambola', '/tambola/'], (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'tambola', 'index.html')));
app.get(['/charades', '/charades/'], (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'charades', 'index.html')));
app.get(['/drawguess', '/drawguess/'], (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'drawguess', 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/* ---------------- rooms ---------------- */

const rooms = new Map(); // code -> room
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_SEATS = 6;

function newCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += CODE_ALPHA[Math.floor(Math.random() * CODE_ALPHA.length)];
  return c;
}

function createRoom(type) {
  let code;
  do { code = newCode(); } while (rooms.has(code));
  const room = {
    code,
    type: ['sequence', 'ludo', 'uno', 'ttt', 'drawguess', 'charades', 'tambola'].includes(type) ? type : 'sequence',
    seats: [],          // {id, name, isBot, skill, token, ws|null, disconnected, autoPilot, team}
    hostId: null,
    game: null,         // engine state
    chat: [],
    botTimer: null,
    local: false,       // hotseat: all seats share this one device
    createdAt: Date.now(),
    lastActive: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

const seatOf = (room, seatId) => room.seats.find(x => x.id === seatId);

function sanitizeName(raw) {
  let n = String(raw || '').replace(/[<>&"']/g, '').trim().slice(0, 16);
  if (!n) n = 'Guest' + Math.floor(10 + Math.random() * 90);
  return n;
}

/* default lobby teams (sequence only): even count -> split halves, odd -> solo (-1) */
function assignDefaultTeams(room) {
  if (room.type !== 'sequence') return;
  const n = room.seats.length;
  if (n % 2 === 0 && n >= 2) {
    room.seats.forEach((s, i) => { s.team = i < n / 2 ? 0 : 1; });
  } else {
    room.seats.forEach(s => { s.team = -1; });
  }
}

let seatCounter = 1;
function newSeatId() { return 's' + seatCounter++; }
let botCounter = 1;
const BOT_NAMES = ['Nova', 'Chip', 'Ace', 'Pixel', 'Rex', 'Momo', 'Ziggy', 'Onyx', 'Bolt', 'Sage'];

function addBot(room, skill) {
  if (room.type === 'charades') return { ok: false, error: 'Charades is human-only — no bots. Invite a friend!' };
  if (room.seats.length >= MAX_SEATS) return { ok: false, error: 'Room is full.' };
  const id = 'bot' + botCounter++;
  room.seats.push({
    id, name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] + ' (bot)',
    isBot: true, skill: skill || 'pro', ws: null, disconnected: false, autoPilot: false, team: -1,
  });
  return { ok: true };
}

function broadcast(room) {
  for (const s of room.seats) {
    if (!s.isBot && s.ws && s.ws.readyState === 1) {
      s.ws.send(JSON.stringify(viewerState(room, s.id)));
    }
  }
}

/* ---------------- per-game state builders ---------------- */

function seqPub(room) {
  const g = room.game;
  if (!g) return { board: null, hand: null, turn: null, winner: null, locked: [], lastAction: null, log: [] };
  return {
    teams: g.seats.reduce((acc, s) => {
      if (!acc[s.team]) acc[s.team] = [];
      acc[s.team].push(s.name);
      return acc;
    }, []),
    teamCount: g.teamCount,
    seqNeeded: g.seqNeeded,
    seqCount: g.seqCount,
    board: g.board.map(c => ({ key: c.key, chip: c.chip, corner: c.corner })),
    deckCount: g.deck.length,
    discardCount: g.discard.length,
    locked: Array.from(g.locked),
    turn: seq.turnOf(g),
    winner: g.winner,
    lastAction: g.lastAction,
    log: g.log,
  };
}

function ludoPub(room) {
  const g = room.game;
  if (!g) return { board: null, turn: null, winner: null, lastAction: null, log: [] };
  const pub = ludo.publicState(g);
  return {
    board: null,
    turn: pub.turn,
    winner: pub.winner,
    lastAction: pub.lastAction,
    log: pub.log,
    die: pub.die,
    rollsLeft: pub.rollsLeft,
    sixes: pub.sixes,
    pending: pub.pending,
    legal: pub.legal,
    tokens: pub.tokens,
    ludoSeats: pub.seats,
    colorHex: ludo.COLOR_HEX,
  };
}

function unoPub(room) {
  const g = room.game;
  if (!g) return { board: null, turn: null, winner: null, lastAction: null, log: [] };
  return {
    discardTop: g.discard[g.discard.length - 1] || null,
    currentColor: g.currentColor,
    currentValue: g.currentValue,
    direction: g.dir,
    deckCount: g.deck.length,
    drawnUid: g.drawnUid,
    unoSeats: g.seats.map(x => ({ id: x.id, name: x.name, isBot: x.isBot, skill: x.skill, handCount: g.hands[x.id].length })),
    turn: g.seats[g.turnIdx].id,
    winner: g.winner,
    lastAction: g.lastAction,
    log: g.log,
  };
}

function tttPub(room) {
  const g = room.game;
  if (!g) return { board: null, turn: null, winner: null, lastAction: null, log: [] };
  const pub = ttt.publicState(g);
  return {
    board: pub.board,
    turn: pub.turn,
    turnMark: pub.turnMark,
    winner: pub.winner,
    draw: pub.draw,
    winLine: pub.winLine,
    lastAction: pub.lastAction,
    log: pub.log,
    tttSeats: pub.seats,
  };
}

function pubState(room) {
  const isLobby = !room.game;
  const st = {
    t: 'state',
    code: room.code,
    gameType: room.type,
    phase: isLobby ? 'lobby' : room.game.phase,
    you: null, // filled per viewer below
    hostId: room.hostId,
    seats: room.seats.map(s => ({
      id: s.id, name: s.name, isBot: s.isBot, skill: s.skill,
      connected: s.isBot ? true : (room.local ? true : !!(s.ws && s.ws.readyState === 1)),
      autoPilot: !s.isBot && s.disconnected && !!room.game,
      team: s.team,
      color: room.type === 'ludo' ? ludo.colorFor(room.seats.length, room.seats.indexOf(s)) : undefined,
    })),
    chat: room.chat.slice(-50),
    moveNo: room.game ? room.game.moveNo : 0,
    isLocal: !!room.local,
    canSwitchTeams: (room.type === 'sequence' && !room.game && room.seats.length % 2 === 0 && room.seats.length >= 4) ||
      (room.type === 'charades' && !room.game && room.seats.length >= 2),
  };
  if (room.type === 'ludo') return Object.assign(st, ludoPub(room));
  if (room.type === 'uno') return Object.assign(st, unoPub(room));
  if (room.type === 'ttt') return Object.assign(st, tttPub(room));
  if (room.type === 'drawguess' || room.type === 'charades' || room.type === 'tambola') return st; // per-viewer fields added in viewerState
  return Object.assign(st, seqPub(room));
}

function viewerState(room, viewerSeatId) {
  const st = pubState(room);
  st.you = viewerSeatId;
  if (room.type === 'ludo') {
    st.hand = [];
    st.yourTurn = room.game ? room.game.phase === 'playing' && st.turn === viewerSeatId : false;
    if (room.game && room.local) st.yourTurn = room.game.phase === 'playing';
    return st;
  }
  if (room.type === 'uno') {
    st.hand = [];
    st.yourTurn = false;
    if (room.game) {
      if (room.local) {
        st.localHands = {};
        for (const x of room.game.seats) {
          st.localHands[x.id] = room.game.hands[x.id].map(c => ({ uid: c.uid, color: c.color, value: c.value }));
        }
        st.yourTurn = room.game.phase === 'playing';
      } else {
        st.hand = room.game.hands[viewerSeatId].map(c => ({ uid: c.uid, color: c.color, value: c.value }));
        st.yourTurn = room.game.phase === 'playing' && st.turn === viewerSeatId;
      }
    }
    return st;
  }
  if (room.type === 'ttt') {
    st.hand = [];
    st.yourTurn = room.game ? room.game.phase === 'playing' && st.turn === viewerSeatId : false;
    if (room.game && room.local) st.yourTurn = room.game.phase === 'playing';
    return st;
  }
  if (room.type === 'drawguess') {
    const d = dgViewer(room, viewerSeatId);
    st.hand = [];
    st.yourTurn = false;
    return Object.assign(st, d);
  }
  if (room.type === 'charades') {
    const c = chViewer(room, viewerSeatId);
    st.hand = [];
    st.yourTurn = false;
    return Object.assign(st, c);
  }
  if (room.type === 'tambola') {
    const tv = tbViewer(room, viewerSeatId);
    st.hand = [];
    st.yourTurn = false;
    return Object.assign(st, tv);
  }
  // sequence
  if (room.game) {
    if (room.local) {
      st.localHands = {};
      for (const s of room.game.seats) {
        st.localHands[s.id] = room.game.hands[s.id].map(c => ({
          uid: c.uid, key: c.key, kind: seq.kindOf(c.key),
          dead: seq.deadCards(room.game, s.id).includes(c.uid),
        }));
      }
      st.yourTurn = room.game.phase === 'playing';
      st.hand = [];
    } else {
      const pub = seq.publicState(room.game, viewerSeatId);
      st.hand = pub.hand;
      st.yourTurn = pub.yourTurn;
    }
  } else {
    st.hand = [];
    st.yourTurn = false;
  }
  return st;
}

function dgViewer(room, viewerSeatId) {
  const st = { isDrawer: false, canGuess: false, wordOptions: [], word: null, strokes: [], guesses: [], scores: [] };
  if (!room.game) return st;
  const pub = dg.publicState(room.game, viewerSeatId);
  return Object.assign(st, pub);
}

function chViewer(room, viewerSeatId) {
  const st = { isActor: false, canGuess: false, wordOptions: [], word: null, guesses: [], scores: [], teams: [], solo: false };
  if (!room.game) return st;
  const pub = ch.publicState(room.game, viewerSeatId);
  return Object.assign(st, pub);
}

function tbViewer(room, viewerSeatId) {
  const st = { phase: 'lobby', called: [], lastNumber: null, nextCallAt: 0, intervalMs: 4000,
    prizes: [], tickets: [], canClaim: [], allTickets: null, canClaimBySeat: null, winner: null, log: [] };
  const g = room.game;
  if (!g) return st; // base st.seats (populated by pubState) is preserved
  st.phase = g.phase;
  st.called = g.called;
  st.lastNumber = g.lastNumber;
  st.nextCallAt = g.nextCallAt;
  st.intervalMs = g.intervalMs;
  st.prizes = g.prizes;
  st.winner = g.winner;
  st.log = g.log.slice(-30);
  st.seats = g.seats.map(s => ({
    id: s.id, name: s.name, isBot: s.isBot, skill: s.skill, strikes: s.strikes,
    ticketCount: (g.tickets[s.id] || []).length,
    marks: (g.tickets[s.id] || []).reduce((acc, t) => acc + tb.marksOn(g, t), 0),
  }));
  if (g.local) {
    st.allTickets = {};
    st.canClaimBySeat = {};
    for (const s of g.seats) {
      st.allTickets[s.id] = g.tickets[s.id];
      st.canClaimBySeat[s.id] = tb.eligible(g, s.id);
    }
  } else {
    st.tickets = g.tickets[viewerSeatId] || [];
    st.canClaim = tb.eligible(g, viewerSeatId);
  }
  return st;
}

function sendTo(room, seatId) {
  const seat = seatOf(room, seatId);
  if (seat && !seat.isBot && seat.ws && seat.ws.readyState === 1) {
    seat.ws.send(JSON.stringify(viewerState(room, seatId)));
  }
}

function sendErr(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'error', msg }));
}

/* ---------------- bot scheduling ---------------- */

function currentSeat(room) {
  if (!room.game || room.game.phase !== 'playing') return null;
  if (room.type === 'ludo') return room.game.seats[room.game.turnIdx];
  if (room.type === 'uno') return room.game.seats[room.game.turnIdx];
  if (room.type === 'ttt') return room.game.seats[room.game.turnIdx];
  const id = seq.turnOf(room.game);
  return room.game.seats.find(x => x.id === id);
}

function isBotTurn(room) {
  const s = currentSeat(room);
  return s && (s.isBot || (s.disconnected && !!room.game));
}

function seqBotStep(room) {
  const s = currentSeat(room);
  const g = room.game;
  const dead = seq.deadCards(g, s.id);
  if (dead.length) {
    const r = seq.apply(g, s.id, { t: 'swap', uid: dead[0] });
    if (r.ok) { broadcast(room); scheduleBot(room); return; }
  }
  const move = seq.botMove(g, s.id, s.skill);
  if (!move) { scheduleBot(room); return; }
  const r = seq.apply(g, s.id, move);
  if (r.ok) {
    broadcast(room);
    if (g.phase === 'playing') scheduleBot(room);
  } else {
    seq.skipTurn(g);
    broadcast(room);
    scheduleBot(room);
  }
}

function ludoBotStep(room) {
  const s = currentSeat(room);
  const g = room.game;
  const move = ludo.botMove(g, s.id, s.skill);
  if (!move) { scheduleBot(room); return; }
  const r = ludo.apply(g, s.id, move);
  if (r.ok) {
    broadcast(room);
    if (g.phase === 'playing') scheduleBot(room);
  } else {
    scheduleBot(room);
  }
}

function unoBotStep(room) {
  const s = currentSeat(room);
  const g = room.game;
  const move = uno.botMove(g, s.id, s.skill);
  if (!move) { scheduleBot(room); return; }
  const r = uno.apply(g, s.id, move);
  if (r.ok) {
    broadcast(room);
    if (g.phase === 'playing') scheduleBot(room);
  } else {
    scheduleBot(room);
  }
}

function tttBotStep(room) {
  const s = currentSeat(room);
  const g = room.game;
  const move = ttt.botMove(g, s.id, s.skill);
  if (!move) { scheduleBot(room); return; }
  const r = ttt.apply(g, s.id, move);
  if (r.ok) {
    broadcast(room);
    if (g.phase === 'playing') scheduleBot(room);
  } else {
    scheduleBot(room);
  }
}

function scheduleBot(room) {
  if (room.type === 'drawguess' || room.type === 'charades' || room.type === 'tambola') return; // no bot turns for these
  if (room.botTimer || !isBotTurn(room)) return;
  const delay = 700 + Math.random() * 900;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!isBotTurn(room)) return;
    if (room.type === 'ludo') ludoBotStep(room);
    else if (room.type === 'uno') unoBotStep(room);
    else if (room.type === 'ttt') tttBotStep(room);
    else seqBotStep(room);
  }, delay);
}

function endBotChain(room) {
  if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
}

/* ---------------- draw & guess timers ---------------- */

function dgStopTimers(room) {
  if (room.dgTimer) { clearTimeout(room.dgTimer); room.dgTimer = null; }
  if (room.dgBotTimer) { clearInterval(room.dgBotTimer); room.dgBotTimer = null; }
}

function dgSchedule(room) {
  if (room.dgTimer) clearTimeout(room.dgTimer);
  room.dgTimer = null;
  const g = room.game;
  if (!g || g.phase === 'over') return;
  const delay = Math.max(200, g.roundEndsAt - Date.now());
  room.dgTimer = setTimeout(() => {
    room.dgTimer = null;
    const g2 = room.game;
    if (!g2 || g2.phase === 'over') return;
    if (g2.phase === 'choose') {
      dg.autoPick(g2, Date.now());          // drawer didn't pick — pick for them
      broadcast(room);
      dgSchedule(room);
    } else if (g2.phase === 'draw') {
      dg.reveal(g2, Date.now());            // time's up
      broadcast(room);
      dgSchedule(room);
    } else if (g2.phase === 'reveal') {
      dg.nextRound(g2, Date.now());         // next round or game over
      broadcast(room);
      if (g2.phase === 'over') dgStopTimers(room);
      else dgSchedule(room);
    }
  }, delay);
}

function dgBotTick(room) {
  const g = room.game;
  if (!g || g.phase !== 'draw' || g.revealed) return;
  const now = Date.now();
  for (const s of room.seats) {
    if (!s.isBot || s.id === g.drawer) continue;
    const text = dg.botGuess(g, s.id, s.skill, now);
    if (text) {
      const r = dg.apply(g, s.id, { t: 'guess', text }, now);
      if (r.ok) {
        room.lastActive = Date.now();
        broadcast(room);
        if (g.phase === 'reveal') dgSchedule(room); // someone's got it — fast-forward
      }
    }
  }
}

function dgStartTimers(room) {
  dgStopTimers(room);
  dgSchedule(room);
  if (room.seats.some(s => s.isBot)) {
    room.dgBotTimer = setInterval(() => dgBotTick(room), 2600);
  }
}

/* ---------------- charades timers (same phase-clock pattern) ---------------- */

function chStopTimers(room) {
  if (room.chTimer) { clearTimeout(room.chTimer); room.chTimer = null; }
}

function chSchedule(room) {
  if (room.chTimer) clearTimeout(room.chTimer);
  room.chTimer = null;
  const g = room.game;
  if (!g || g.phase === 'over') return;
  const delay = Math.max(200, g.roundEndsAt - Date.now());
  room.chTimer = setTimeout(() => {
    room.chTimer = null;
    const g2 = room.game;
    if (!g2 || g2.phase === 'over') return;
    if (g2.phase === 'choose') {
      ch.autoPick(g2, Date.now());
      broadcast(room);
      chSchedule(room);
    } else if (g2.phase === 'act') {
      ch.reveal(g2, Date.now());
      broadcast(room);
      chSchedule(room);
    } else if (g2.phase === 'reveal') {
      ch.nextRound(g2, Date.now());
      broadcast(room);
      if (g2.phase === 'over') chStopTimers(room);
      else chSchedule(room);
    }
  }, delay);
}

function chStartTimers(room) {
  chStopTimers(room);
  chSchedule(room);
}

/* ---------------- tambola timers (auto caller + bot claims) ---------------- */

function tbStopTimers(room) {
  if (room.tbTimer) { clearTimeout(room.tbTimer); room.tbTimer = null; }
  if (room.tbBotTimer) { clearInterval(room.tbBotTimer); room.tbBotTimer = null; }
}

function tbSchedule(room) {
  if (room.tbTimer) clearTimeout(room.tbTimer);
  room.tbTimer = null;
  const g = room.game;
  if (!g || g.phase !== 'playing') return;
  const delay = Math.max(250, g.nextCallAt - Date.now());
  room.tbTimer = setTimeout(() => {
    room.tbTimer = null;
    const g2 = room.game;
    if (!g2 || g2.phase !== 'playing') return;
    const r = tb.callNumber(g2, Date.now());
    if (r.ok) {
      room.lastActive = Date.now();
      broadcast(room);
      tbSchedule(room);
    } else {
      broadcast(room); // deck exhausted
    }
  }, delay);
}

function tbStartTimers(room) {
  tbStopTimers(room);
  tbSchedule(room);
  if (room.seats.some(s => s.isBot)) {
    room.tbBotTimer = setInterval(() => {
      const g = room.game;
      if (!g || g.phase !== 'playing') return;
      const claimed = tb.botCheck(g, Date.now());
      if (claimed.length) {
        room.lastActive = Date.now();
        broadcast(room);
      }
    }, 2000);
  }
}

/* ---------------- game lifecycle ---------------- */

function startGame(room) {
  const seats = room.seats.map(s => ({ id: s.id, name: s.name, isBot: s.isBot, skill: s.skill, team: s.team }));
  room.game = room.type === 'ludo' ? ludo.createGame({ seats })
    : room.type === 'uno' ? uno.createGame({ seats })
    : room.type === 'ttt' ? ttt.createGame({ seats })
    : room.type === 'drawguess' ? dg.createGame({ seats, local: room.local }, Date.now())
    : room.type === 'charades' ? ch.createGame({ seats, local: room.local, roundsPerTeam: room.roundsPerTeam || 3 }, Date.now())
    : room.type === 'tambola' ? tb.createGame({ seats, local: room.local, tickets: room.ticketsPerPlayer || 1, intervalMs: room.tbSpeed || 4000 }, Date.now())
    : seq.createGame({ seats });
  if (room.type === 'sequence') {
    room.seats.forEach((s, i) => { s.team = room.game.seats[i].team; });
  }
  if (room.type === 'charades') {
    room.seats.forEach((s, i) => { s.team = room.game.seats[i].team; });
  }
  room.chat = [];
  endBotChain(room);
  if (room.type === 'drawguess') { dgStartTimers(room); return; }
  if (room.type === 'charades') { chStartTimers(room); return; }
  if (room.type === 'tambola') { tbStartTimers(room); return; }
  scheduleBot(room);
}

function rematch(room) {
  if (!room.game || room.game.phase !== 'over') return { ok: false, error: 'No finished game to restart.' };
  startGame(room);
  broadcast(room);
  return { ok: true };
}

function hostTransfer(room) {
  const humans = room.seats.filter(s => !s.isBot && !s.disconnected);
  if (humans.length) room.hostId = humans[0].id;
  else room.hostId = null;
}

function destroyRoom(room) {
  endBotChain(room);
  dgStopTimers(room);
  chStopTimers(room);
  tbStopTimers(room);
  for (const s of room.seats) {
    if (s.ws && s.ws.readyState === 1) {
      s.ws.send(JSON.stringify({ t: 'kicked', msg: 'Room closed.' }));
      try { s.ws.close(); } catch (e) { /* noop */ }
    }
  }
  rooms.delete(room.code);
}

// rooms with no humans and no fresh activity get swept
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const humans = room.seats.filter(s => !s.isBot && s.ws && s.ws.readyState === 1);
    if (humans.length === 0 && now - room.lastActive > 5 * 60 * 1000) destroyRoom(room);
  }
}, 60 * 1000);

/* ---------------- websocket handling ---------------- */

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const room = rooms.get(ws.roomCode);
    const mySeat = room && ws.seatId ? seatOf(room, ws.seatId) : null;

    switch (msg.t) {
      case 'create': {
        if (ws.roomCode) return;
        const room = createRoom(msg.game);
        const id = newSeatId();
        room.seats.push({ id, name: sanitizeName(msg.name), isBot: false, skill: 'pro', token: msg.token || null, ws, disconnected: false, autoPilot: false, team: -1 });
        room.hostId = id;
        ws.roomCode = room.code;
        ws.seatId = id;
        assignDefaultTeams(room);
        sendTo(room, id);
        break;
      }
      case 'join': {
        if (ws.roomCode) return;
        const room = rooms.get(String(msg.room || '').toUpperCase());
        if (!room) { sendErr(ws, 'Room not found. Double-check the code.'); return; }
        const name = sanitizeName(msg.name);
        const token = msg.token || null;

        // reclaim own seat after a refresh: match reconnect token, then name
        let existing = token ? room.seats.find(s => !s.isBot && s.disconnected && s.token === token) : null;
        if (!existing) existing = room.seats.find(s => !s.isBot && s.disconnected && !s.autoPilot && s.name === name && !s.token);
        if (!existing && !token) existing = room.seats.find(s => !s.isBot && s.disconnected && s.name === name);
        if (existing) {
          existing.ws = ws; existing.disconnected = false; existing.autoPilot = false; existing.token = token || existing.token;
          ws.roomCode = room.code; ws.seatId = existing.id;
          room.lastActive = Date.now();
          sendTo(room, existing.id);
          broadcast(room);
          return;
        }
        if (room.game) { sendErr(ws, 'Game in progress — the room is locked until a rematch.'); return; }
        if (room.seats.length >= MAX_SEATS) { sendErr(ws, 'Room is full (6 players max).'); return; }
        const id = newSeatId();
        room.seats.push({ id, name, isBot: false, skill: 'pro', token, ws, disconnected: false, autoPilot: false, team: -1 });
        if (!room.hostId) room.hostId = id;
        ws.roomCode = room.code;
        ws.seatId = id;
        room.lastActive = Date.now();
        assignDefaultTeams(room);
        broadcast(room);
        break;
      }
      case 'setTeam': {
        if (!room || !mySeat || room.game) return;
        if (room.type !== 'sequence' && room.type !== 'charades') return;
        const n = room.seats.length;
        if (room.type === 'sequence' && (n % 2 !== 0 || n < 4)) return; // solo mode or 1v1 — no switching
        if (room.type === 'charades' && n < 2) return;
        const target = msg.team === 1 ? 1 : 0;
        const seat = msg.seatId ? seatOf(room, String(msg.seatId)) : mySeat;
        if (!seat) return;
        if (msg.seatId && msg.seatId !== mySeat.id && mySeat.id !== room.hostId) {
          sendErr(ws, 'Only the host can move other players.');
          return;
        }
        if (seat.team === target) return;
        seat.team = target;
        if (room.type === 'sequence') {
          // keep teams balanced: if a team is now bigger, swap its newest member back
          const c = t => room.seats.filter(s => s.team === t).length;
          if (c(0) !== c(1)) {
            const bigger = c(0) > c(1) ? 0 : 1;
            for (let i = room.seats.length - 1; i >= 0; i--) {
              const s = room.seats[i];
              if (s.team === bigger && s.id !== seat.id) { s.team = 1 - bigger; break; }
            }
          }
        }
        broadcast(room);
        break;
      }
      case 'setName': {
        if (!room || !mySeat || room.game) return;
        mySeat.name = sanitizeName(msg.name);
        broadcast(room);
        break;
      }
      case 'addBot': {
        if (!room || !mySeat || mySeat.id !== room.hostId || room.game) return;
        const skill = msg.skill === 'chill' ? 'chill' : 'pro';
        const r = addBot(room, skill);
        if (!r.ok) sendErr(ws, r.error);
        else { assignDefaultTeams(room); broadcast(room); }
        break;
      }
      case 'setBotSkill': {
        if (!room || !mySeat || mySeat.id !== room.hostId || room.game) return;
        const s = seatOf(room, msg.seatId);
        if (s && s.isBot) { s.skill = msg.skill === 'chill' ? 'chill' : 'pro'; broadcast(room); }
        break;
      }
      case 'removeSeat': {
        if (!room || !mySeat || mySeat.id !== room.hostId || room.game || msg.seatId === room.hostId) return;
        const idx = room.seats.findIndex(x => x.id === msg.seatId);
        if (idx > -1) {
          const s = room.seats[idx];
          if (s.ws && s.ws.readyState === 1) { try { s.ws.close(); } catch (e) { /* noop */ } }
          room.seats.splice(idx, 1);
          assignDefaultTeams(room);
          broadcast(room);
        }
        break;
      }
      case 'start': {
        if (!room || !mySeat || mySeat.id !== room.hostId || room.game) return;
        if (room.seats.length < 2) { sendErr(ws, 'Need at least 2 players (add a bot or share the link).'); return; }
        startGame(room);
        broadcast(room);
        break;
      }
      case 'quickPlay': {
        // "Play with bots": create a room, fill it with bots, start instantly
        if (ws.roomCode) return;
        const room = createRoom(msg.game);
        const id = newSeatId();
        room.seats.push({ id, name: sanitizeName(msg.name), isBot: false, skill: 'pro', token: msg.token || null, ws, disconnected: false, autoPilot: false, team: -1 });
        room.hostId = id;
        ws.roomCode = room.code;
        ws.seatId = id;
        const maxBots = room.type === 'ludo' ? 3 : room.type === 'ttt' ? 1 : room.type === 'charades' ? 0 : 5; // ludo=4p max, ttt=2p max, charades=no bots
        const wantBots = parseInt(msg.bots, 10);
        const bots = Math.min(maxBots, Math.max(room.type === 'charades' ? 0 : 1, Number.isFinite(wantBots) ? wantBots : (room.type === 'charades' ? 0 : 2)));
        const skill = msg.skill === 'chill' ? 'chill' : 'pro';
        for (let i = 0; i < bots; i++) addBot(room, skill);
        if (room.type === 'tambola') {
          room.ticketsPerPlayer = Math.min(2, Math.max(1, +msg.tickets || 1));
          room.tbSpeed = [2000, 4000, 6000].includes(+msg.speed) ? +msg.speed : 4000;
        }
        startGame(room);
        sendTo(room, id);
        break;
      }
      case 'localPlay': {
        // "Same device" hotseat: every seat is controlled by this one device
        if (ws.roomCode) return;
        const names = (Array.isArray(msg.names) ? msg.names : [])
          .map(sanitizeName).filter(Boolean).slice(0, MAX_SEATS);
        if (names.length < 2) { sendErr(ws, 'Need at least 2 players.'); return; }
        const room = createRoom(msg.game);
        room.local = true;
        if (msg.rounds) room.roundsPerTeam = Math.max(1, Math.min(5, +msg.rounds || 3));
        if (room.type === 'tambola') {
          room.ticketsPerPlayer = Math.min(2, Math.max(1, +msg.tickets || 1));
          room.tbSpeed = [2000, 4000, 6000].includes(+msg.speed) ? +msg.speed : 4000;
        }
        const token = msg.token || null;
        names.forEach((nm, i) => {
          room.seats.push({
            id: newSeatId(), name: nm, isBot: false, skill: 'pro', token,
            ws: i === 0 ? ws : null, disconnected: false, autoPilot: false,
            team: (Array.isArray(msg.teams) && (msg.teams[i] === 0 || msg.teams[i] === 1)) ? msg.teams[i] : -1,
          });
        });
        room.hostId = room.seats[0].id;
        ws.roomCode = room.code;
        ws.seatId = room.seats[0].id;
        assignDefaultTeams(room);
        sendTo(room, room.seats[0].id); // lobby — host reviews, then starts
        break;
      }
      case 'rematch': {
        if (!room || !mySeat || mySeat.id !== room.hostId) return;
        rematch(room);
        break;
      }
      // ---- sequence actions ----
      case 'play':
      case 'playJack1':
      case 'swap': {
        if (!room || !mySeat || !room.game || room.type !== 'sequence') return;
        let seatId = mySeat.id;
        if (room.local && msg.as) {
          const asSeat = seatOf(room, String(msg.as));
          if (asSeat && seq.turnOf(room.game) === asSeat.id) seatId = asSeat.id;
        }
        const action = { t: msg.t, uid: msg.uid, cell: msg.cell != null ? msg.cell : null };
        const r = seq.apply(room.game, seatId, action);
        if (!r.ok) { sendErr(ws, r.error); return; }
        room.lastActive = Date.now();
        broadcast(room);
        scheduleBot(room);
        break;
      }
      // ---- ludo actions ----
      case 'roll':
      case 'move': {
        if (!room || !mySeat || !room.game || room.type !== 'ludo') return;
        let seatId = mySeat.id;
        if (room.local && msg.as) {
          const asSeat = seatOf(room, String(msg.as));
          if (asSeat && room.game.turnIdx >= 0 && room.game.seats[room.game.turnIdx].id === asSeat.id) seatId = asSeat.id;
        }
        const action = msg.t === 'roll' ? { t: 'roll' } : { t: 'move', token: msg.token };
        const r = ludo.apply(room.game, seatId, action);
        if (!r.ok) { sendErr(ws, r.error); return; }
        room.lastActive = Date.now();
        broadcast(room);
        scheduleBot(room);
        break;
      }
      // ---- uno actions ----
      case 'playCard':
      case 'draw':
      case 'pass': {
        if (!room || !mySeat || !room.game || room.type !== 'uno') return;
        let seatId = mySeat.id;
        if (room.local && msg.as) {
          const asSeat = seatOf(room, String(msg.as));
          if (asSeat && room.game.seats[room.game.turnIdx].id === asSeat.id) seatId = asSeat.id;
        }
        const action = msg.t === 'playCard'
          ? { t: 'playCard', uid: msg.uid, color: msg.color || null }
          : { t: msg.t };
        const r = uno.apply(room.game, seatId, action);
        if (!r.ok) { sendErr(ws, r.error); return; }
        room.lastActive = Date.now();
        broadcast(room);
        scheduleBot(room);
        break;
      }
      // ---- tic-tac-toe actions ----
      case 'tttMove': {
        if (!room || !mySeat || !room.game || room.type !== 'ttt') return;
        let seatId = mySeat.id;
        if (room.local && msg.as) {
          const asSeat = seatOf(room, String(msg.as));
          if (asSeat && room.game.seats[room.game.turnIdx].id === asSeat.id) seatId = asSeat.id;
        }
        const r = ttt.apply(room.game, seatId, { t: 'move', cell: msg.cell });
        if (!r.ok) { sendErr(ws, r.error); return; }
        room.lastActive = Date.now();
        broadcast(room);
        scheduleBot(room);
        break;
      }
      // ---- draw & guess actions ----
      case 'pickWord': {
        if (!room || !mySeat || !room.game || room.type !== 'drawguess') return;
        let seatId = mySeat.id;
        if (room.local && msg.as) {
          const asSeat = seatOf(room, String(msg.as));
          if (asSeat && room.game.drawer === asSeat.id) seatId = asSeat.id;
        }
        const r = dg.apply(room.game, seatId, { t: 'pickWord', idx: msg.idx }, Date.now());
        if (!r.ok) { sendErr(ws, r.error); return; }
        room.lastActive = Date.now();
        broadcast(room);
        dgSchedule(room);
        break;
      }
      case 'stroke': {
        if (!room || !mySeat || !room.game || room.type !== 'drawguess') return;
        let seatId = mySeat.id;
        if (room.local && msg.as) {
          const asSeat = seatOf(room, String(msg.as));
          if (asSeat && room.game.drawer === asSeat.id) seatId = asSeat.id;
        }
        const r = dg.apply(room.game, seatId, {
          t: 'stroke', pts: msg.pts, color: msg.color, size: msg.size,
        }, Date.now());
        if (!r.ok) return; // throttled/ignored silently
        room.lastActive = Date.now();
        const m = JSON.stringify({
          t: 'dgStroke', id: r.stroke.id, color: r.stroke.color, size: r.stroke.size, pts: r.stroke.pts,
        });
        for (const s of room.seats) if (!s.isBot && s.ws && s.ws.readyState === 1) s.ws.send(m);
        break;
      }
      case 'undoStroke': {
        if (!room || !mySeat || !room.game || room.type !== 'drawguess') return;
        let seatId = mySeat.id;
        if (room.local && msg.as) {
          const asSeat = seatOf(room, String(msg.as));
          if (asSeat && room.game.drawer === asSeat.id) seatId = asSeat.id;
        }
        const r = dg.apply(room.game, seatId, { t: 'undoStroke' }, Date.now());
        if (!r.ok) return;
        room.lastActive = Date.now();
        for (const s of room.seats) if (!s.isBot && s.ws && s.ws.readyState === 1) {
          s.ws.send(JSON.stringify({ t: 'dgUndo', id: r.id }));
        }
        break;
      }
      case 'clearStrokes': {
        if (!room || !mySeat || !room.game || room.type !== 'drawguess') return;
        let seatId = mySeat.id;
        if (room.local && msg.as) {
          const asSeat = seatOf(room, String(msg.as));
          if (asSeat && room.game.drawer === asSeat.id) seatId = asSeat.id;
        }
        const r = dg.apply(room.game, seatId, { t: 'clearStrokes' }, Date.now());
        if (!r.ok) return;
        room.lastActive = Date.now();
        for (const s of room.seats) if (!s.isBot && s.ws && s.ws.readyState === 1) {
          s.ws.send(JSON.stringify({ t: 'dgClear' }));
        }
        break;
      }
      case 'guess': {
        if (!room || !mySeat || !room.game || room.type !== 'drawguess') return;
        const r = dg.apply(room.game, mySeat.id, { t: 'guess', text: msg.text }, Date.now());
        if (!r.ok) { sendErr(ws, r.error); return; }
        room.lastActive = Date.now();
        broadcast(room);
        if (r.correct) dgSchedule(room); // fast-forward to the reveal pause
        break;
      }
      case 'localGotIt': {
        if (!room || !mySeat || !room.game || room.type !== 'drawguess' || !room.local) return;
        const r = dg.apply(room.game, mySeat.id, { t: 'localGotIt', by: msg.by }, Date.now());
        if (!r.ok) { sendErr(ws, r.error); return; }
        room.lastActive = Date.now();
        broadcast(room);
        dgSchedule(room);
        break;
      }
      case 'skip': {
        // same-device mode: anyone can reveal the word early
        if (!room || !mySeat || !room.game || room.type !== 'drawguess' || !room.local) return;
        if (room.game.phase !== 'draw') return;
        dg.reveal(room.game, Date.now());
        room.lastActive = Date.now();
        broadcast(room);
        dgSchedule(room);
        break;
      }
      // ---- dumb charades actions ----
      case 'pickTitle': {
        if (!room || !mySeat || !room.game || room.type !== 'charades') return;
        let seatId = mySeat.id;
        if (room.local && msg.as) {
          const asSeat = seatOf(room, String(msg.as));
          if (asSeat && room.game.actor === asSeat.id) seatId = asSeat.id;
        }
        const r = ch.apply(room.game, seatId, { t: 'pickWord', idx: msg.idx }, Date.now());
        if (!r.ok) { sendErr(ws, r.error); return; }
        room.lastActive = Date.now();
        broadcast(room);
        chSchedule(room);
        break;
      }
      case 'chGuess': {
        if (!room || !mySeat || !room.game || room.type !== 'charades') return;
        const r = ch.apply(room.game, mySeat.id, { t: 'guess', text: msg.text }, Date.now());
        if (!r.ok) { sendErr(ws, r.error); return; }
        room.lastActive = Date.now();
        broadcast(room);
        if (r.correct) chSchedule(room);
        break;
      }
      case 'chGotIt': {
        if (!room || !mySeat || !room.game || room.type !== 'charades') return;
        if (room.local) {
          const r = ch.apply(room.game, mySeat.id, { t: 'localGotIt', by: msg.by }, Date.now());
          if (!r.ok) { sendErr(ws, r.error); return; }
          room.lastActive = Date.now();
          broadcast(room);
          chSchedule(room);
        } else if (room.game.solo) {
          const r = ch.apply(room.game, mySeat.id, { t: 'soloGotIt' }, Date.now());
          if (!r.ok) { sendErr(ws, r.error); return; }
          room.lastActive = Date.now();
          broadcast(room);
          chSchedule(room);
        }
        break;
      }
      case 'chPass': {
        if (!room || !mySeat || !room.game || room.type !== 'charades') return;
        const r = ch.apply(room.game, mySeat.id, { t: 'pass' }, Date.now());
        if (!r.ok) { sendErr(ws, r.error); return; }
        room.lastActive = Date.now();
        broadcast(room);
        chSchedule(room);
        break;
      }
      // ---- tambola actions ----
      case 'tambolaClaim': {
        if (!room || !mySeat || !room.game || room.type !== 'tambola') return;
        const r = tb.applyClaim(room.game, mySeat.id, {
          prize: String(msg.prize || ''), ticketIdx: +msg.ticketIdx || 0,
        }, Date.now());
        if (!r.ok) { sendErr(ws, r.error); return; }
        room.lastActive = Date.now();
        broadcast(room);
        break;
      }
      case 'tambolaNext': {
        if (!room || !mySeat || !room.game || room.type !== 'tambola') return;
        if (!room.local && mySeat.id !== room.hostId) { sendErr(ws, 'Only the host can call the next number.'); return; }
        const r = tb.callNumber(room.game, Date.now());
        if (!r.ok) { sendErr(ws, r.error); return; }
        room.lastActive = Date.now();
        broadcast(room);
        tbSchedule(room);
        break;
      }
      case 'chat': {
        if (!room || !mySeat) return;
        const text = String(msg.text || '').replace(/[<>&]/g, '').trim().slice(0, 200);
        if (!text) return;
        const now = Date.now();
        if (mySeat._lastChat && now - mySeat._lastChat < 700) return; // anti-spam
        mySeat._lastChat = now;
        room.chat.push({ name: mySeat.name, text, at: now });
        if (room.chat.length > 60) room.chat.shift();
        const m = JSON.stringify({ t: 'chat', chat: room.chat.slice(-50) });
        for (const s of room.seats) if (!s.isBot && s.ws && s.ws.readyState === 1) s.ws.send(m);
        break;
      }
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.roomCode);
    if (!room) return;
    const seat = ws.seatId ? seatOf(room, ws.seatId) : null;
    if (!seat || seat.ws !== ws) return;
    seat.ws = null;
    seat.disconnected = true;

    if (!room.game) {
      // lobby: keep the seat briefly so a refresh reclaims it (host stays host)
      if (seat.id === room.hostId) hostTransfer(room);
      broadcast(room);
      if (room.seats.every(s => s.isBot)) destroyRoom(room);
    } else {
      // in-game: bot auto-pilot takes over; game continues
      room.lastActive = Date.now();
      broadcast(room);
      scheduleBot(room);
      if (room.seats.every(s => s.isBot)) {
        setTimeout(() => { if (!rooms.has(room.code)) return; if (room.seats.every(s => s.isBot)) destroyRoom(room); }, 10 * 60 * 1000);
      }
    }
  });
});

// keep-alive
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { try { ws.terminate(); } catch (e) { /* noop */ } continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* noop */ }
  }
}, 30 * 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Perfect Games running on http://0.0.0.0:${PORT}`);
});
