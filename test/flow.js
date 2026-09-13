'use strict';
/* End-to-end flow test against a running server.
   Usage: node test/flow.js [wsUrl]   (default ws://localhost:8080/ws) */
const WebSocket = require('ws');

const WS_URL = process.argv[2] || 'ws://localhost:8080/ws';
const ok = (cond, msg) => { if (!cond) { console.error('✗ FAIL:', msg); process.exit(1); } console.log('  ✓', msg); };

function client(name, token) {
  const ws = new WebSocket(WS_URL);
  const c = { ws, name, token, states: [], chat: null, lastError: null, waiters: [] };
  ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.t === 'state') { c.states.push(m); }
    if (m.t === 'chat') c.chat = m.chat;
    if (m.t === 'error') c.lastError = m.msg;
    c.waiters = c.waiters.filter(w => !w(m));
  });
  c.send = o => ws.send(JSON.stringify(o));
  c.waitState = (pred, timeoutMs = 15000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(name + ': timeout waiting for state')), timeoutMs);
    const check = m => {
      if (m.t === 'state' && pred(m)) { clearTimeout(t); res(m); return true; }
      return false;
    };
    const s = c.states.find(pred);
    if (s) { clearTimeout(t); return res(s); }
    c.waiters.push(check);
  });
  c.waitChat = (pred, timeoutMs = 10000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(name + ': timeout waiting for chat')), timeoutMs);
    const check = m => {
      if (m.t === 'chat' && pred(m.chat)) { clearTimeout(t); res(m); return true; }
      return false;
    };
    if (c.chat && pred(c.chat)) { clearTimeout(t); return res(c.chat); }
    c.waiters.push(check);
  });
  c.waitErr = (timeoutMs = 10000) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(name + ': timeout waiting for error')), timeoutMs);
    const check = m => {
      if (m.t === 'error') { clearTimeout(t); res(m.msg); return true; }
      return false;
    };
    c.waiters.push(check);
  });
  c.latest = () => c.states[c.states.length - 1];
  c.open = new Promise(res => ws.on('open', res));
  c.close = () => ws.close();
  return c;
}

function findMove(st) {
  const myT = st.seats.find(s => s.id === st.you).team;
  return findMoveFromHand(st, st.hand, myT);
}

function findMoveFromHand(st, hand, myT) {
  for (const card of hand) {
    if (card.kind === 'n') {
      for (let i = 0; i < 100; i++) {
        const c = st.board[i];
        if (!c.corner && c.chip === null && c.key === card.key) return { t: 'play', uid: card.uid, cell: i };
      }
    } else if (card.kind === 'w2') {
      for (let i = 0; i < 100; i++) {
        const c = st.board[i];
        if (!c.corner && c.chip === null) return { t: 'play', uid: card.uid, cell: i };
      }
    } else {
      for (let i = 0; i < 100; i++) {
        const c = st.board[i];
        if (c.chip !== null && c.chip !== myT && !st.locked.includes(i) && !c.corner)
          return { t: 'playJack1', uid: card.uid, cell: i };
      }
      return { t: 'playJack1', uid: card.uid, cell: null };
    }
  }
  return null;
}

async function main() {
  console.log('E2E flow test →', WS_URL);
  const A = client('Alice', 'tokA');
  const B = client('Bob', 'tokB');
  await Promise.all([A.open, B.open]);

  // create + join
  A.send({ t: 'create', name: 'Alice', token: 'tokA' });
  const stA0 = await A.waitState(s => s.phase === 'lobby');
  const code = stA0.code;
  ok(code && code.length === 6, 'room created with 6-char code ' + code);

  B.send({ t: 'join', room: code, name: 'Bob', token: 'tokB' });
  await A.waitState(s => s.seats.length === 2);
  ok(true, 'Bob joined the room');

  // host adds a bot, starts
  A.send({ t: 'addBot', skill: 'pro' });
  await A.waitState(s => s.seats.length === 3);
  ok(true, 'bot added');
  A.send({ t: 'start' });
  const stP = await A.waitState(s => s.phase === 'playing');
  ok(stP.seats.length === 3, 'game started with 3 players');

  // play up to 20 rounds: humans move on their own turns, bots move themselves
  const handSizes = {};
  for (const s of stP.seats) handSizes[s.id] = s.handCount;
  const aliceId = stP.you;
  const bobId = stP.seats.find(s => s.name === 'Bob').id;
  let cur = stP;
  let rounds = 0;
  for (let step = 0; step < 20 && cur.phase === 'playing'; step++) {
    const mover = cur.seats.find(s => s.id === cur.turn);
    if (mover.id === aliceId) {
      await A.waitState(s => s.moveNo >= cur.moveNo);
      const mv = findMove(A.latest());
      ok(mv, 'Alice found a legal move');
      A.send(mv);
    } else if (mover.id === bobId) {
      await B.waitState(s => s.moveNo >= cur.moveNo);
      const mv = findMove(B.latest());
      ok(mv, 'Bob found a legal move');
      B.send(mv);
    }
    // wait for the next move (bot plays itself)
    cur = await A.waitState(s => s.moveNo > cur.moveNo);
    rounds++;
    for (const s of cur.seats) {
      if (handSizes[s.id] !== undefined)
        ok(s.handCount === handSizes[s.id], 'hand size stable for ' + s.name + ' (round ' + rounds + ')');
    }
  }
  ok(rounds >= 5, 'played ' + rounds + ' rounds of moves with humans + bot');

  // chat round trip
  A.send({ t: 'chat', text: 'hello from Alice' });
  const gotChat = await Promise.race([
    A.waitChat(c => c.some(m => m.text === 'hello from Alice')),
    B.waitChat(c => c.some(m => m.text === 'hello from Alice')),
  ]);
  ok(!!gotChat, 'chat delivered');

  // reconnect with token: Bob drops, rejoins, reclaims same seat
  const bobSeatId = stP.seats[1].id; // B joined second → seat 1
  B.close();
  await new Promise(r => setTimeout(r, 400));
  const B2 = client('Bob', 'tokB');
  await B2.open;
  B2.send({ t: 'join', room: code, name: 'Bob', token: 'tokB' });
  const stB2 = await B2.waitState(s => s.you != null);
  ok(stB2.you === bobSeatId, 'reconnect reclaimed same seat (' + stB2.you + ')');

  // invalid action rejected
  B2.send({ t: 'play', uid: 'bogus', cell: 0 });
  const err = await B2.waitErr();
  ok(err && err.length > 0, 'invalid action rejected: "' + err + '"');

  // join a non-existent room fails gracefully
  const C = client('Carol', 'tokC');
  await C.open;
  C.send({ t: 'join', room: 'ZZZZZZ', name: 'Carol' });
  const err2 = await C.waitErr();
  ok(err2.includes('Room not found'), 'bad room code rejected: "' + err2 + '"');

  // quickPlay: "Play with bots" — room created + started with bots in one step
  const D = client('Dave', 'tokD');
  await D.open;
  D.send({ t: 'quickPlay', name: 'Dave', token: 'tokD', bots: 3, skill: 'chill' });
  const stQ = await D.waitState(s => s.phase === 'playing');
  ok(stQ.seats.length === 4, 'quickPlay started a 4-seat game (1 human + 3 bots)');
  ok(stQ.seats.filter(s => s.isBot).length === 3, 'quickPlay filled the room with 3 bots');
  const daveSeat = stQ.seats.find(s => s.name === 'Dave');
  ok(!!daveSeat && daveSeat.connected !== false, 'quickPlay: human seat connected');
  // the game is live: a bot moves on its own, or the game waits on Dave
  let live = false;
  for (let i = 0; i < 8 && !live; i++) {
    const cur = D.latest();
    if (cur.moveNo > stQ.moveNo) { live = true; break; }
    if (cur.yourTurn) {
      const mv = findMove(cur);
      if (!mv) break;
      D.send(mv);
      await new Promise(r => setTimeout(r, 600)); // let the move land
    } else {
      const s = await D.waitState(x => x.moveNo > cur.moveNo, 10000);
      live = s.moveNo > cur.moveNo;
    }
  }
  ok(live, 'quickPlay: game is live (bots play, Dave can move)');
  D.close();

  // team switching: host creates a room and adds 3 bots → 4 seats, teams switchable
  const F = client('Fred', 'tokF');
  await F.open;
  F.send({ t: 'create', name: 'Fred', token: 'tokF' });
  await F.waitState(s => s.phase === 'lobby');
  F.send({ t: 'addBot', skill: 'pro' });
  F.send({ t: 'addBot', skill: 'pro' });
  F.send({ t: 'addBot', skill: 'pro' });
  const stF4 = await F.waitState(s => s.phase === 'lobby' && s.seats.length === 4);
  ok(stF4.canSwitchTeams === true, '4 players: teams can be switched');
  const before = stF4.seats.map(s => s.team).sort();
  ok(before.join() === [0, 0, 1, 1].join(), 'default teams are 2v2 (' + before.join() + ')');
  const bot1 = stF4.seats.find(s => s.isBot && s.team === 1);
  ok(!!bot1, 'found a bot on team 1');
  F.send({ t: 'setTeam', seatId: bot1.id, team: 0 });
  const stF4b = await F.waitState(s => s.seats.some(x => x.id === bot1.id) && s.seats.find(x => x.id === bot1.id).team === 0);
  const c0 = stF4b.seats.filter(s => s.team === 0).length;
  ok(c0 === 2, 'teams stay balanced after switch (2/2)');
  // non-host cannot move others
  F.send({ t: 'setTeam', seatId: F.states[F.states.length - 1].seats.find(s => s.id !== F.states[F.states.length - 1].you).id, team: 1 });
  // (Fred is host — so use a non-host: skip; host moving others is allowed)
  F.close();

  // localPlay: "same device" hotseat — 3 local seats, all hands exposed
  const E = client('Host', 'tokE');
  await E.open;
  E.send({ t: 'localPlay', names: ['Ann', 'Bob', 'Cy'], token: 'tokE' });
  const stL0 = await E.waitState(s => s.phase === 'lobby' && s.isLocal === true);
  ok(stL0.seats.length === 3, 'localPlay created a 3-seat hotseat lobby');
  ok(stL0.seats.every(s => s.connected), 'local seats all show connected');
  E.send({ t: 'start' });
  const stL = await E.waitState(s => s.phase === 'playing' && s.isLocal);
  ok(stL.localHands && Object.keys(stL.localHands).length === 3, 'localPlay exposes all hands');
  for (const s of stL.seats) ok((stL.localHands[s.id] || []).length === 6, 'hand for ' + s.name + ' has 6 cards');

  // drive 3 moves on behalf of whoever's turn it is (device plays for all)
  let curL = stL;
  let movedLocal = 0;
  for (let i = 0; i < 3; i++) {
    const hand = curL.localHands[curL.turn];
    const mv = findMoveFromHand(curL, hand, curL.turn);
    ok(mv, 'local move found for ' + curL.turn);
    E.send(Object.assign({ as: curL.turn }, mv));
    curL = await E.waitState(s => s.moveNo > curL.moveNo);
    movedLocal++;
  }
  ok(movedLocal === 3, 'local hotseat played 3 moves via device (as=seat)');
  E.close();

  console.log('\nAll E2E checks passed ✔');
  A.close(); B2.close(); C.close();
  process.exit(0);
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
