'use strict';
/* Perfect Games — Ludo client (vanilla JS) */

const $ = s => document.querySelector(s);

/* board geometry (mirrors the engine) */
const TRACK = [
  [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],[8,14],
  [8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],[14,7],[14,6],
  [13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],[7,0],[6,0],
];
const TRACK_IDX = {};
TRACK.forEach((c, i) => { TRACK_IDX[c[0] + ',' + c[1]] = i; });
const STARTS = [0, 13, 26, 39];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const HOME_COL = [
  [[6,6],[6,7],[7,7]],
  [[6,8],[7,8],[7,7]],
  [[8,8],[8,7],[7,7]],
  [[8,6],[7,6],[7,7]],
];
const BASE_SLOTS = [
  [[1,1],[1,4],[4,1],[4,4]],
  [[1,10],[1,13],[4,10],[4,13]],
  [[10,10],[10,13],[13,10],[13,13]],
  [[10,1],[10,4],[13,1],[13,4]],
];
const COLORS = ['red', 'green', 'yellow', 'blue'];
const HEX = ['#e53e3e', '#38a169', '#dd9b16', '#3182ce']; // display colors (tokens, pills, avatars)
// physical corner slots: 0 TL green, 1 TR yellow, 2 BR blue, 3 BL red (classic board)
const SLOT_HEX = ['#38a169', '#dd9b16', '#3182ce', '#e53e3e'];
const SLOT_COLORS = ['green', 'yellow', 'blue', 'red'];
const HOME_PADS = [[[0,5],[0,5]], [[0,5],[9,14]], [[9,14],[9,14]], [[9,14],[0,5]]];
const COLOR_NAMES = ['Red', 'Green', 'Yellow', 'Blue'];
const DOTS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

const S = {
  ws: null, code: null, seatId: null, name: null, token: null,
  st: null, retries: 0, tab: 'chat', pending: null,
  soundOn: true, botCount: 2, botSkill: 'pro',
  hsNames: ['Player 1', 'Player 2'], hsCount: 2,
  lastMoveNo: 0, prevTokens: null, prevDone: null,
  dispTokens: null, // tokens currently shown (delayed until the die settles)
};

/* ---------------- websocket ---------------- */

function wsUrl() {
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
}

function wsSend(obj) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj));
  else { S.pending = obj; toast('Connecting…'); }
}

function connect() {
  S.ws = new WebSocket(wsUrl());
  S.ws.onopen = () => {
    S.retries = 0;
    hideConnBanner();
    if (S.pending) { wsSend(S.pending); S.pending = null; }
    if (!S.code) startFlow();
    else wsSend({ t: 'join', room: S.code, name: S.name, token: S.token });
  };
  S.ws.onmessage = e => { try { handle(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  S.ws.onclose = () => {
    showConnBanner();
    const delay = Math.min(800 * Math.pow(1.6, S.retries++), 6000);
    setTimeout(connect, delay);
  };
}

/* ---------------- flow ---------------- */

function startFlow() {
  const params = new URLSearchParams(location.search);
  const code = (params.get('r') || '').toUpperCase();
  S.token = params.get('p') || null;
  if (code && code.length >= 4) {
    S.code = code;
    openModal('Join game', 'Join', () => {
      S.name = ($('#nameInput').value || guessName()).trim();
      wsSend({ t: 'join', room: S.code, name: S.name, token: S.token });
    });
    $('#modalNote').textContent = 'Joining room ' + code + ' — no sign-up needed.';
  } else {
    $('#modeView').classList.remove('hidden');
  }
}

function guessName() {
  const adj = ['Swift', 'Clever', 'Mighty', 'Sunny', 'Brave', 'Lucky', 'Cosmic', 'Fancy'];
  return adj[Math.floor(Math.random() * adj.length)] + (10 + Math.floor(Math.random() * 90));
}

function modeName() { return ($('#modeName').value || guessName()).trim(); }

function startWithBots() {
  $('#botModal').classList.add('hidden');
  wsSend({ t: 'quickPlay', game: 'ludo', name: modeName(), token: S.token || makeToken(), bots: S.botCount, skill: S.botSkill });
}

function startHotseat() {
  while (S.hsNames.length < S.hsCount) S.hsNames.push('');
  S.hsNames.length = S.hsCount;
  const names = S.hsNames.map((n, i) => (n || '').trim() || 'Player ' + (i + 1));
  $('#hotseatModal').classList.add('hidden');
  wsSend({ t: 'localPlay', game: 'ludo', names, token: S.token || makeToken() });
}

function leaveToMenu() {
  Snd.stopMusic();
  try { S.ws.close(); } catch (e) { /* noop */ }
  S.code = null; S.seatId = null; S.st = null; S.pending = null;
  S.dispTokens = null;
  history.replaceState(null, '', location.pathname);
  ['modeView', 'lobbyView', 'gameView', 'winnerOverlay', 'gameOverBar', 'friendsModal', 'hotseatModal', 'botModal', 'joinModal']
    .forEach(id => $('#' + id).classList.add('hidden'));
  $('#modeView').classList.remove('hidden');
  connect();
}

function openModal(title, actionLabel, onAction) {
  $('#modalTitle').textContent = title;
  $('#modalAction').textContent = actionLabel;
  $('#nameInput').value = S.name || guessName();
  $('#joinModal').classList.remove('hidden');
  const go = () => {
    if (!$('#nameInput').value.trim()) return;
    $('#joinModal').classList.add('hidden');
    onAction();
  };
  $('#modalAction').onclick = go;
  $('#nameInput').onkeydown = e => { if (e.key === 'Enter') go(); };
  setTimeout(() => $('#nameInput').focus(), 60);
}

function makeToken() {
  let t = '';
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  for (let i = 0; i < 8; i++) t += A[Math.floor(Math.random() * A.length)];
  return t;
}

function syncUrl() {
  const params = new URLSearchParams();
  params.set('r', S.code);
  if (S.token) params.set('p', S.token);
  history.replaceState(null, '', location.pathname + '?' + params.toString());
}

function cleanLink() { return location.origin + '/ludo?r=' + S.code; }

/* ---------------- state handling ---------------- */

function handle(m) {
  if (m.t === 'state') {
    const prev = S.st;
    S.st = m;
    S.code = m.code;
    if (!S.token) S.token = makeToken();
    syncUrl();
    ['modeView', 'botModal', 'friendsModal', 'hotseatModal'].forEach(id => $('#' + id).classList.add('hidden'));
    if (prev && m.moveNo !== prev.moveNo && m.lastAction) onAction(m.lastAction, prev);
    if (prev && prev.phase !== 'over' && m.phase === 'over' && m.winner != null) onWin(m.winner);
    // ---- smooth token movement: keep old positions until the die has
    // finished tumbling and the number is clearly shown, then glide in ----
    const isAnim = m.phase === 'playing' && m.lastAction &&
      (m.lastAction.type === 'roll' || m.lastAction.type === 'move');
    if (m.phase === 'over' || !prev || m.moveNo === 0) {
      S.dispTokens = m.tokens; // fresh game / finished — show immediately
    } else if (isAnim) {
      clearTimeout(S._dispTimer);
      const targetMoveNo = m.moveNo;
      S._dispTimer = setTimeout(() => {
        if (S.st && S.st.moveNo === targetMoveNo && S.st.phase === 'playing') {
          S.dispTokens = S.st.tokens;
          renderTokens();
        }
      }, 1050); // die tumble (~0.9s) + settle, then tokens move
    }

    // soft background music while playing; silence in lobby/over
    if (m.phase === 'playing') Snd.startMusic();
    else Snd.stopMusic();
    render();
    hideConnBanner();
  } else if (m.t === 'chat') {
    S.st.chat = m.chat;
    if (S.tab === 'chat') renderPanel();
  } else if (m.t === 'error') {
    toast(m.msg, true);
    Snd.error();
  } else if (m.t === 'kicked') {
    toast(m.msg, true);
    setTimeout(() => { location.href = '/ludo'; }, 1200);
  }
}

function onAction(a, prev) {
  if (!S.soundOn) return;
  if (a.type === 'roll') {
    Snd.roll();
    if (a.die === 6) setTimeout(Snd.rollExtra, 320);
    rollDieAnim(a.die);
    // flash the rolled number on screen
    flashRoll(a.die);
  } else if (a.type === 'move') {
    setTimeout(Snd.tokenStep, 60);
    // capture detection
    if (prev && prev.tokens) {
      for (const c of COLORS) {
        const before = prev.tokens[c].filter(t => t.state === 'base').length;
        const after = S.st.tokens[c].filter(t => t.state === 'base').length;
        if (after > before) { setTimeout(Snd.capture, 350); break; }
      }
    }
    if (prev && prev.tokens) {
      const doneBefore = prev.tokens[COLORS[a.color]].filter(t => t.state === 'done').length;
      const doneAfter = S.st.tokens[COLORS[a.color]].filter(t => t.state === 'done').length;
      if (doneAfter > doneBefore) setTimeout(Snd.tokenHome, 350);
    }
    // token entrance pop (base -> track)
    if (prev && prev.tokens) {
      const before = prev.tokens[COLORS[a.color]].filter(t => t.state === 'base').length;
      const after = S.st.tokens[COLORS[a.color]].filter(t => t.state === 'base').length;
      if (after < before) setTimeout(() => {
        const t = document.querySelector('#tokenLayer .tok:not(.dim)');
        if (t) { t.classList.add('entered'); setTimeout(() => t.classList.remove('entered'), 700); }
      }, 250);
    }
  }
}

function flashRoll(v) {
  let el = $('#rollFlash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'rollFlash';
    document.body.appendChild(el);
  }
  el.textContent = v;
  el.classList.toggle('six', v === 6);
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(S._rollFlashT);
  S._rollFlashT = setTimeout(() => el.classList.remove('show'), 1400);
}

function onWin(colorIdx) {
  if (S.soundOn) Snd.win();
  confetti();
}

/* ---------------- render ---------------- */

function render() {
  renderHeader();
  const phase = S.st.phase;
  $('#lobbyView').classList.toggle('hidden', phase !== 'lobby');
  $('#gameView').classList.toggle('hidden', phase === 'lobby');
  $('#btnLeave').classList.toggle('hidden', !S.code);
  if (phase === 'lobby') renderLobby();
  else renderGame();
  fitBoard();
  requestAnimationFrame(fitBoard);
}

function renderHeader() {
  $('#btnSound').innerHTML = iconSVG(S.soundOn ? 'sound' : 'mute', 20);
}

function seatColorOf(seat) { return HEX[seat.color % 4]; }

function mySeat() { return S.st.seats.find(s => s.id === S.st.you); }

function isMyTurn() {
  const st = S.st;
  if (st.isLocal) return st.phase === 'playing';
  return st.phase === 'playing' && st.turn === st.you;
}

/* ---------- lobby ---------- */

function renderLobby() {
  const st = S.st;
  const n = st.seats.length;
  $('#seatCount').textContent = n + '/4';
  $('#lobbyTitle').textContent = st.isLocal ? 'Same device · Pass & play' : 'Invite a friend to join';
  $('#lobbySub').textContent = st.isLocal
    ? 'Take turns on this screen — each player rolls when it is their turn.'
    : 'Share the room code — friends enter it on their screen to join.';

  const actions = $('#inviteActions');
  if (st.isLocal) {
    actions.innerHTML = `<p class="pass-note">📱 <b>Pass &amp; play</b> — everyone sits together and takes turns on this device.</p>`;
  } else {
    actions.innerHTML = `
      <div class="code-hero">
        <span class="code-label">Room code</span>
        <span class="code-big" id="lobbyCodeBig">${esc(S.code || '------')}</span>
        <button class="ghost code-copy-btn" data-act="copyCode">${iconSVG('copy', 14)}&nbsp;Copy</button>
      </div>
      <div class="invite-divider"><span>or share the invite link</span></div>
      <div class="invite-bar">
        <input id="inviteLink" readonly spellcheck="false" value="${esc(cleanLink())}">
        <button class="primary copy-btn" data-act="copyLink">${iconSVG('copy', 15)}&nbsp;Copy</button>
      </div>
      <div class="waiting-row" id="waitingRow">
        <span class="wdot"></span><span class="wdot"></span><span class="wdot"></span>
        <span id="waitText">Waiting for friends to join…</span>
      </div>`;
    const wRow = $('#waitingRow');
    wRow.classList.toggle('ready', n >= 2);
    $('#waitText').textContent = n >= 2 ? 'Ready to start!' : 'Waiting for friends to join…';
  }

  // color assignment preview
  const colorNames = st.seats.map(s => `<span style="color:${seatColorOf(s)};font-weight:800">● ${COLOR_NAMES[s.color % 4]}</span>`).join(' ');
  $('#setupInfo').innerHTML = n < 2
    ? 'Waiting for one more player…'
    : `${colorNames}<br><span class="small">First to bring all <b>4 tokens</b> home wins!</span>`;

  // players
  const list = $('#playerList');
  list.innerHTML = '';
  st.seats.forEach(s => {
    const row = document.createElement('div');
    row.className = 'prow';
    const col = seatColorOf(s);
    const initials = s.name.replace(/\s*\(bot\)\s*$/i, '').slice(0, 2).toUpperCase();
    const avatar = s.isBot
      ? `<span class="avatar bot-avatar" style="background:${col}">${iconSVG('bot', 18)}</span>`
      : `<span class="avatar" style="background:${col};color:#fff">${esc(initials)}</span>`;
    let status = '';
    if (s.id === st.you) status += '<span class="you-tag">You</span>';
    if (s.id === st.hostId && !s.isBot) status += (status ? ' · ' : '') + '<span class="host-tag">Host</span>';
    if (s.isBot) status += (status ? ' · ' : '') + `<span class="bot-tag">${s.skill === 'chill' ? 'Chill bot' : 'Pro bot'}</span>`;
    if (!status) status = s.connected ? 'Connected' : 'Offline';
    row.innerHTML = `${avatar}
      <span class="pinfo"><span class="pname">${esc(s.name)}</span><span class="pstatus">${status}</span></span>
      <span class="pmeta">
        <span class="tag" style="color:${col};border:1px solid ${col}55;border-radius:999px;padding:3px 9px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em">${COLOR_NAMES[s.color % 4]}</span>
        ${s.isBot ? `<button class="skill-btn" data-seat="${s.id}">${s.skill === 'chill' ? '😴' : '🧠'}</button>` : ''}
        ${st.you === st.hostId && s.id !== st.hostId ? `<button class="x-btn" data-remove="${s.id}">✕</button>` : ''}
      </span>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => wsSend({ t: 'removeSeat', seatId: b.dataset.remove }));
  list.querySelectorAll('[data-seat]').forEach(b => {
    b.onclick = () => {
      const seat = st.seats.find(x => x.id === b.dataset.seat);
      wsSend({ t: 'setBotSkill', seatId: b.dataset.seat, skill: seat.skill === 'chill' ? 'pro' : 'chill' });
    };
  });

  // controls
  const ctrl = $('#lobbyControls');
  ctrl.innerHTML = '';
  if (st.you === st.hostId) {
    const addBot = document.createElement('button');
    addBot.className = 'ghost add-bot-btn';
    addBot.innerHTML = iconSVG('bot', 16) + '&nbsp;+ Add bot';
    addBot.onclick = () => wsSend({ t: 'addBot', skill: 'pro' });
    const start = document.createElement('button');
    start.className = 'primary start-btn';
    start.innerHTML = iconSVG('play', 15) + '&nbsp;' + (n >= 2 ? 'Start game' : 'Start game');
    start.disabled = n < 2;
    start.onclick = () => wsSend({ t: 'start' });
    ctrl.append(addBot, start);
  } else {
    const w = document.createElement('span');
    w.className = 'muted small';
    w.textContent = 'Waiting for the host to start…';
    ctrl.appendChild(w);
  }
}

/* ---------- game ---------- */

function renderGame() {
  const st = S.st;
  const my = isMyTurn();

  // banner
  const banner = $('#turnBanner');
  if (st.phase === 'over') {
    banner.textContent = st.winner != null ? '🏆 ' + COLOR_NAMES[st.winner] + ' wins!' : 'Game over';
    banner.className = '';
  } else if (st.isLocal) {
    const cur = st.ludoSeats.find(s => s.id === st.turn);
    banner.textContent = '📱 ' + (cur ? cur.name : 'Player') + "'s turn — take your time";
    banner.className = 'your';
  } else if (my) {
    if (st.pending) {
      banner.textContent = '🎲 Rolled ' + st.die + ' — tap a glowing token to move it';
      banner.className = 'your';
    } else if (st.die === 6) {
      banner.textContent = '🎉 Rolled 6 — roll again!';
      banner.className = 'your';
    } else {
      banner.textContent = '🎲 Your turn — tap Roll';
      banner.className = 'your';
    }
  } else {
    const cur = st.ludoSeats.find(s => s.id === st.turn);
    banner.textContent = 'Waiting for ' + (cur ? cur.name : 'Player') + '…';
    banner.className = '';
    if (cur) banner.style.color = seatColorOf(cur);
  }
  if (!my && !st.isLocal) banner.style.color = '';

  // player strip
  const strip = $('#playerStrip');
  strip.innerHTML = '';
  for (const s of st.ludoSeats) {
    const pill = document.createElement('div');
    pill.className = 'player-pill' + (st.turn === s.id && st.phase === 'playing' ? ' on' : '');
    pill.style.setProperty('--pcolor', seatColorOf(s));
    let dots = '';
    for (let i = 0; i < s.done; i++) dots += '<i class="on"></i>';
    for (let i = s.done; i < 4; i++) dots += '<i></i>';
    pill.innerHTML = `<span class="pdot"></span><span>${esc(s.name)}</span><span class="pmeter">${dots}</span>`;
    strip.appendChild(pill);
  }

  renderBoard();
  renderDie();
  renderFeed();
  renderPanel();
  renderWinner();
}

function renderBoard() {
  const board = $('#board');
  board.innerHTML = '';
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const cell = document.createElement('div');
      cell.className = 'bcell';
      const type = cellType(r, c);
      if (type.t === 'track') {
        cell.classList.add('track');
        if (type.isStart) { cell.style.setProperty('--c', HEX[type.startColor]); cell.classList.add('start'); }
        if (type.isSafe) cell.classList.add('safe');
      } else if (type.t === 'col') {
        cell.classList.add('col');
        cell.style.setProperty('--c', SLOT_HEX[type.color]);
        if (type.step === 2) cell.classList.add('center');
        else cell.innerHTML = '<span class="col-step"></span>';
      } else if (type.t === 'center') {
        cell.classList.add('center-cell');
        if (r === 7 && c === 7) cell.innerHTML = '<span class="center-flag">🏆</span>';
      } else if (type.t === 'home') {
        // base cells are transparent — the unified modern panel shows through
        cell.classList.add('home');
      } else {
        cell.classList.add('empty');
      }
      board.appendChild(cell);
    }
  }
  // modern unified base panels (one smooth rounded panel per corner)
  [[0, 0], [1, 60], [2, 60], [3, 0]].forEach(([slot, leftPct]) => {
    const panel = document.createElement('div');
    panel.className = 'base-panel bp-' + SLOT_COLORS[slot] + ' pos-' + slot;
    panel.style.left = leftPct + '%';
    [[25, 25], [25, 75], [75, 25], [75, 75]].forEach(([x, y]) => {
      const s = document.createElement('span');
      s.className = 'bp-slot';
      s.style.left = x + '%';
      s.style.top = y + '%';
      panel.appendChild(s);
    });
    board.appendChild(panel);
  });

  renderTokens();
}

function cellType(r, c) {
  if (r <= 5 && c <= 5) return homeCell(0, r, c);   // red — top-left
  if (r <= 5 && c >= 9) return homeCell(1, r, c);   // green — top-right
  if (r >= 9 && c >= 9) return homeCell(2, r, c);   // yellow — bottom-right
  if (r >= 9 && c <= 5) return homeCell(3, r, c);   // blue — bottom-left
  // home columns first — they live inside the 3×3 center area
  // (step 2 is the shared center cell — handled below)
  for (let ci = 0; ci < 4; ci++) {
    for (let step = 0; step < 2; step++) {
      const [cr, cc] = HOME_COL[ci][step];
      if (cr === r && cc === c) return { t: 'col', color: ci, step };
    }
  }
  if (r === 7 && c === 7) return { t: 'center' };
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return { t: 'center' };
  const idx = TRACK_IDX[r + ',' + c];
  if (idx != null) {
    const si = STARTS.indexOf(idx);
    return { t: 'track', idx, isStart: si >= 0, startColor: si, isSafe: SAFE.has(idx) };
  }
  return { t: 'empty' };
}

function homeCell(colorIdx, r, c) {
  const [r0, r1] = HOME_PADS[colorIdx][0];
  const [c0, c1] = HOME_PADS[colorIdx][1];
  const isPad = r >= r0 && r <= r1 && c >= c0 && c <= c1;
  const isSlot = BASE_SLOTS[colorIdx].some(([sr, sc]) => sr === r && sc === c);
  return { t: 'home', color: colorIdx, isPad, isSlot };
}

// classic corner-square geometry: every 6x6 corner is a solid colored base
function isCornerBase(r, c) {
  return (r <= 5 && c <= 5) || (r <= 5 && c >= 9) || (r >= 9 && c >= 9) || (r >= 9 && c <= 5);
}

function renderTokens() {
  let layer = $('#tokenLayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'tokenLayer';
    $('#board').appendChild(layer);
  }
  layer.innerHTML = '';
  const st = S.st;
  if (!st.tokens) return;
  // render the *display* tokens (delayed until the die settles)
  const toks = S.dispTokens || st.tokens;
  // only the current player's color can have legal moves
  const curColor = st.ludoSeats && st.ludoSeats.find(s => s.id === st.turn);
  const legal = st.pending && isMyTurn() && curColor ? st.legal : [];
  const legalColor = curColor ? curColor.color : -1;
  const cellCounts = {};
  for (const color of COLORS) {
    const colorIdx = COLORS.indexOf(color);
    for (const tk of toks[color]) {
      const key = tk.cell[0] + ',' + tk.cell[1];
      cellCounts[key] = (cellCounts[key] || 0) + 1;
    }
  }
  const placed = {};
  for (const color of COLORS) {
    const colorIdx = COLORS.indexOf(color);
    for (const tk of toks[color]) {
      const el = document.createElement('div');
      el.className = 'tok';
      el.style.setProperty('--c', HEX[colorIdx]);
      el.textContent = tk.idx + 1;
      // offset when sharing a cell
      const key = tk.cell[0] + ',' + tk.cell[1];
      const n = cellCounts[key];
      placed[key] = (placed[key] || 0) + 1;
      const off = n > 1 ? (placed[key] - 1 - (n - 1) / 2) * 14 : 0;
      const px = ((tk.cell[1] + 0.5) / 15) * 100;
      const py = ((tk.cell[0] + 0.5) / 15) * 100;
      el.style.left = `calc(${px}% + ${off * 0.6}%)`;
      el.style.top = `calc(${py}% + ${off * 0.6}%)`;
      el.style.transform = 'translate(-50%, -50%)';
      if (tk.state === 'done') el.classList.add('dim');
      if (colorIdx === curColor.color && st.phase === 'playing') {
        el.classList.add('active-turn');
      }
      if (colorIdx === legalColor && legal.includes(tk.idx)) {
        el.classList.add('can-move');
        el.dataset.token = tk.idx;
      }
      layer.appendChild(el);
    }
  }
  layer.onclick = e => {
    const t = e.target.closest('.tok.can-move');
    if (!t) return;
    const token = +t.dataset.token;
    const st2 = S.st;
    wsSend({ t: 'move', token, as: st2.isLocal ? st2.turn : undefined });
    Snd.click();
  };
}

/* ---------- die ---------- */

function renderDie() {
  const st = S.st;
  const die = $('#die3d');
  const dots = die.querySelectorAll('i');
  const v = st.die || 0;
  dots.forEach((d, i) => d.classList.toggle('on', DOTS[v] ? DOTS[v].includes(i) : false));
  const my = isMyTurn();
  die.classList.toggle('your-turn', my && !st.pending && st.phase === 'playing');
  const rollBtn = $('#btnRoll');
  rollBtn.classList.toggle('pulse', my && !st.pending && st.phase === 'playing');
  rollBtn.disabled = !(my && !st.pending && st.phase === 'playing');
  rollBtn.innerHTML = iconSVG('dice', 16) + '&nbsp;' + (st.pending ? 'Roll' : 'Roll');
  const status = $('#dieStatus');
  if (st.phase === 'over') {
    status.textContent = st.winner != null ? '🏆 ' + COLOR_NAMES[st.winner] + ' wins!' : 'Game over';
  } else if (st.pending) {
    status.textContent = 'You rolled ' + st.die + ' — move a token';
  } else if (st.die === 6) {
    status.textContent = 'Rolled 6 — extra roll!';
  } else if (my) {
    status.textContent = 'Tap Roll to shake the dice';
  } else {
    status.textContent = st.die ? 'Last roll: ' + st.die : 'Waiting for the roll…';
  }
  rollBtn.onclick = () => {
    if (rollBtn.disabled) return;
    wsSend({ t: 'roll', as: st.isLocal ? st.turn : undefined });
    Snd.click();
  };
}

function rollDieAnim(v) {
  const die = $('#die3d');
  die.classList.remove('rolling');
  void die.offsetWidth;
  die.classList.add('rolling');
  // tumble 3D cube for the shake, then settle and light the right face
  setTimeout(() => {
    die.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', DOTS[v] ? DOTS[v].includes(i) : false));
    die.classList.add('landed');
    setTimeout(() => {
      die.classList.remove('rolling');
      setTimeout(() => die.classList.remove('landed'), 500);
    }, 750);
  }, 650);
}

/* ---------- feed / panel / winner ---------- */

function renderFeed() {
  const feed = $('#feedStrip');
  feed.innerHTML = '';
  const logs = S.st.log || [];
  for (const l of logs.slice(-5)) {
    const item = document.createElement('div');
    item.className = 'feed-item' + (l.n === S.st.moveNo ? ' hot' : '');
    item.textContent = l.text;
    feed.appendChild(item);
  }
}

function setTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.panel-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  renderPanel();
}

function renderPanel() {
  const body = $('#panelBody');
  body.innerHTML = '';
  if (S.tab === 'players') {
    for (const s of (S.st.ludoSeats || [])) {
      const row = document.createElement('div');
      row.className = 'prow';
      const col = seatColorOf(s);
      row.innerHTML = `<span class="avatar" style="background:${col};color:#fff">${esc(s.name.slice(0, 2).toUpperCase())}</span>
        <span class="pinfo"><span class="pname">${esc(s.name)} ${S.st.turn === s.id ? '▶' : ''}</span>
        <span class="pstatus">${s.inBase} in base · ${s.done}/4 home</span></span>`;
      body.appendChild(row);
    }
  } else if (S.tab === 'moves') {
    const logs = S.st.log || [];
    if (!logs.length) { body.innerHTML = '<div class="muted small">No moves yet.</div>'; return; }
    for (const l of logs.slice(-40)) {
      const line = document.createElement('div');
      line.className = 'move-line';
      line.textContent = l.text;
      body.appendChild(line);
    }
  } else {
    renderChat();
  }
}

function renderChat() {
  const body = $('#panelBody');
  body.innerHTML = '';
  const log = document.createElement('div');
  log.className = 'chat-log';
  for (const c of (S.st.chat || [])) {
    const msg = document.createElement('div');
    msg.className = 'msg' + (c.name === S.name ? ' me' : '');
    msg.innerHTML = `<span class="who">${esc(c.name)}</span><span class="when">${new Date(c.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><br>${esc(c.text)}`;
    log.appendChild(msg);
  }
  body.appendChild(log);
  const row = document.createElement('div');
  row.className = 'chat-input-row';
  row.innerHTML = `<input id="chatInput" maxlength="200" placeholder="Say hi…"><button class="primary small">Send</button>`;
  body.appendChild(row);
  const inp = row.querySelector('input');
  const send = () => {
    const v = inp.value.trim();
    if (!v) return;
    wsSend({ t: 'chat', text: v });
    inp.value = '';
  };
  row.querySelector('button').onclick = send;
  inp.onkeydown = e => { if (e.key === 'Enter') send(); };
  body.scrollTop = body.scrollHeight;
}

function renderWinner() {
  const ov = $('#winnerOverlay');
  const st = S.st;
  const bar = $('#gameOverBar');
  if (st.phase !== 'over' || st.winner == null) {
    ov.classList.add('hidden');
    bar.classList.add('hidden');
    return;
  }
  ov.classList.remove('hidden');
  const who = COLOR_NAMES[st.winner];
  const col = HEX[st.winner];
  $('#winTitle').textContent = who + ' wins!';
  $('#winTitle').style.color = col;
  $('#winSub').textContent = 'All 4 tokens reached home first. Close this to review the board.';
  const isHost = st.you === st.hostId;
  const rematch = $('#btnRematch');
  rematch.classList.toggle('hidden', !isHost);
  rematch.onclick = () => { ov.classList.add('hidden'); wsSend({ t: 'rematch' }); };
  $('#winClose').onclick = () => {
    ov.classList.add('hidden');
    bar.classList.remove('hidden');
    bar.innerHTML = `<span>🏆 ${who} wins!</span>
      <span class="go-btns">
        <button id="goReopen" class="ghost small">${iconSVG('trophy', 14)}&nbsp;View result</button>
        ${isHost ? '<button id="goRematch" class="primary small">' + iconSVG('refresh', 14) + '&nbsp;Play again</button>' : ''}
      </span>`;
    $('#goReopen').onclick = () => { bar.classList.add('hidden'); ov.classList.remove('hidden'); };
    const gr = $('#goRematch');
    if (gr) gr.onclick = () => wsSend({ t: 'rematch' });
  };
}

/* ---------------- board sizing ---------------- */

function fitBoard() {
  const wrap = $('#boardWrap');
  if (!wrap) return;
  const w = Math.max(200, wrap.clientWidth - 2);
  const availH = Math.max(320, window.innerHeight - 210);
  const cell = Math.max(18, Math.min(56, Math.floor(Math.min(w / 15.3, availH / 15.3))));
  document.documentElement.style.setProperty('--cell', cell + 'px');
}

/* ---------------- misc ---------------- */

function toast(msg, isErr) {
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' err' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
function showConnBanner() { $('#connBanner').classList.remove('hidden'); }
function hideConnBanner() { $('#connBanner').classList.add('hidden'); }

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) { return false; }
  ta.remove();
  return true;
}

function confetti() {
  const colors = ['#f6c453', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#c084fc'];
  for (let i = 0; i < 70; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.background = colors[i % colors.length];
    el.style.animationDuration = (2.2 + Math.random() * 2.2) + 's';
    el.style.animationDelay = (Math.random() * 0.8) + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5600);
  }
}

/* ---------------- mini board art (first page) ---------------- */

function buildMiniBoard() {
  const board = $('#miniBoard');
  if (!board) return;
  for (let r = 0; r < 15; r++) {
    for (let c = 0; c < 15; c++) {
      const el = document.createElement('i');
      const type = cellType(r, c);
      if (type.t === 'home' || type.t === 'col') {
        el.classList.add('home-' + SLOT_COLORS[type.color][0]);
      } else if (type.t === 'track') {
        if (type.isStart) { el.classList.add('start'); el.style.setProperty('--c', SLOT_HEX[type.startColor]); }
        else el.classList.add('track');
      } else if (type.t === 'center') {
        el.classList.add('track');
      }
      board.appendChild(el);
    }
  }
}

/* ---------------- wire up ---------------- */

function wire() {
  $('#btnBots').onclick = () => { $('#botModal').classList.remove('hidden'); };
  $('#btnFriends').onclick = () => { $('#friendsModal').classList.remove('hidden'); };
  $('#diceName').onclick = () => { $('#modeName').value = guessName(); };
  $('#btnHome').onclick = leaveToMenu;
  $('#btnSame').onclick = () => { $('#friendsModal').classList.add('hidden'); buildHsNames(); $('#hotseatModal').classList.remove('hidden'); };
  $('#btnDevices').onclick = () => { $('#friendsModal').classList.add('hidden'); wsSend({ t: 'create', game: 'ludo', name: modeName(), token: S.token || makeToken() }); };
  $('#friendsClose').onclick = () => $('#friendsModal').classList.add('hidden');
  $('#hotseatClose').onclick = () => $('#hotseatModal').classList.add('hidden');
  $('#botClose').onclick = () => $('#botModal').classList.add('hidden');
  ['#friendsModal', '#hotseatModal', '#botModal'].forEach(sel => {
    document.querySelector(sel).addEventListener('click', e => {
      if (e.target === document.querySelector(sel)) document.querySelector(sel).classList.add('hidden');
    });
  });

  // hotseat setup
  const hsRow = $('#hsCountRow');
  S.hsNames = ['Player 1', 'Player 2'];
  S.hsCount = 2;
  for (let n = 2; n <= 4; n++) {
    const b = document.createElement('button');
    b.textContent = n;
    b.dataset.n = n;
    if (n === S.hsCount) b.classList.add('on');
    b.onclick = () => {
      S.hsCount = n;
      hsRow.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.n === n));
      Snd.click();
      buildHsNames();
    };
    hsRow.appendChild(b);
  }
  $('#hsStart').onclick = startHotseat;

  // bot setup
  const bcRow = $('#botCountRow');
  for (let n = 1; n <= 3; n++) {
    const b = document.createElement('button');
    b.textContent = n;
    b.dataset.n = n;
    if (n === S.botCount) b.classList.add('on');
    b.onclick = () => {
      S.botCount = n;
      bcRow.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.n === n));
      Snd.click();
    };
    bcRow.appendChild(b);
  }
  $('#diffPro').onclick = () => { S.botSkill = 'pro'; $('#diffPro').classList.add('on'); $('#diffChill').classList.remove('on'); };
  $('#diffChill').onclick = () => { S.botSkill = 'chill'; $('#diffChill').classList.add('on'); $('#diffPro').classList.remove('on'); };
  $('#botStart').onclick = startWithBots;

  // lobby actions
  $('#inviteActions').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'copyCode') copyText(S.code || '').then(ok => toast(ok ? 'Room code ' + S.code + ' copied' : ''));
    else if (b.dataset.act === 'copyLink') copyText(cleanLink()).then(ok => toast(ok ? 'Link copied — send it to friends!' : 'Copy failed.'));
  });

  // join by code
  const joinWithCode = () => {
    const code = ($('#joinCodeInput').value || '').trim().toUpperCase();
    if (code.length < 4) { toast('Enter a valid room code.', true); Snd.error(); return; }
    S.code = code;
    S.token = S.token || makeToken();
    wsSend({ t: 'join', room: code, name: modeName(), token: S.token });
  };
  $('#joinCodeBtn').onclick = joinWithCode;
  $('#joinCodeInput').onkeydown = e => { if (e.key === 'Enter') joinWithCode(); };

  $('#btnSound').onclick = () => {
    S.soundOn = !S.soundOn;
    Snd.setEnabled(S.soundOn);
    $('#btnSound').innerHTML = iconSVG(S.soundOn ? 'sound' : 'mute', 20);
    if (S.soundOn) Snd.click();
  };
  $('#btnLeave').onclick = leaveToMenu;
  $('#btnNewRoom').onclick = leaveToMenu;
  const TAB_NAMES = { players: 'Players', moves: 'Moves', chat: 'Chat' };
  document.querySelectorAll('.panel-tabs button').forEach(b => {
    b.title = TAB_NAMES[b.dataset.tab] || '';
    b.onclick = () => setTab(b.dataset.tab);
  });
  window.addEventListener('resize', fitBoard);
  window.addEventListener('orientationchange', () => setTimeout(fitBoard, 300));
}

function buildHsNames() {
  while (S.hsNames.length < S.hsCount) S.hsNames.push('');
  S.hsNames.length = S.hsCount;
  const box = $('#hsNames');
  box.innerHTML = '';
  for (let i = 1; i <= S.hsCount; i++) {
    const row = document.createElement('div');
    row.className = 'hs-name-row';
    const num = document.createElement('span');
    num.className = 'hs-num';
    num.textContent = i;
    const inp = document.createElement('input');
    inp.maxLength = 16;
    inp.placeholder = 'Player ' + i;
    inp.value = S.hsNames[i - 1] || 'Player ' + i;
    inp.addEventListener('input', () => { S.hsNames[i - 1] = inp.value; });
    row.append(num, inp);
    box.appendChild(row);
  }
}

/* ---------------- boot ---------------- */

(function boot() {
  wire();
  buildMiniBoard();
  mountIcons();
  fitBoard();
  connect();
  const unlock = () => { Snd.unlock(); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
})();
