'use strict';
/* Perfect Games — Tic-Tac-Toe client (vanilla JS) */

const $ = s => document.querySelector(s);

const S = {
  ws: null, code: null, seatId: null, name: null, token: null,
  st: null, retries: 0, tab: 'chat', pending: null,
  soundOn: true, botSkill: 'pro',
  hsNames: ['Player 1', 'Player 2'],
  lastMoveNo: 0,
  scores: { x: 0, o: 0, d: 0 },
  prevWinLine: null,
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

function startWithBot() {
  $('#botModal').classList.add('hidden');
  wsSend({ t: 'quickPlay', game: 'ttt', name: modeName(), token: S.token || makeToken(), bots: 1, skill: S.botSkill });
}

function startHotseat() {
  const names = S.hsNames.map((n, i) => (n || '').trim() || 'Player ' + (i + 1));
  $('#hotseatModal').classList.add('hidden');
  wsSend({ t: 'localPlay', game: 'ttt', names, token: S.token || makeToken() });
}

function leaveToMenu() {
  Snd.stopMusic();
  try { S.ws.close(); } catch (e) { /* noop */ }
  S.code = null; S.seatId = null; S.st = null; S.pending = null;
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

function cleanLink() { return location.origin + '/ttt?r=' + S.code; }

/* ---------------- state handling ---------------- */

function handle(m) {
  if (m.t === 'state') {
    const prev = S.st;
    S.st = m;
    S.code = m.code;
    if (!S.token) S.token = makeToken();
    syncUrl();
    ['modeView', 'botModal', 'friendsModal', 'hotseatModal'].forEach(id => $('#' + id).classList.add('hidden'));
    if (prev && m.moveNo !== prev.moveNo && m.lastAction) onAction(m.lastAction);
    // game end -> scores + effects
    if (prev && prev.phase === 'playing' && m.phase === 'over') {
      if (m.winner === 0) { S.scores.x++; if (S.soundOn) Snd.win(); }
      else if (m.winner === 1) { S.scores.o++; if (S.soundOn) Snd.win(); }
      else { S.scores.d++; }
      if (m.winner != null) confetti();
    }
    // background music
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
    setTimeout(() => { location.href = '/ttt'; }, 1200);
  }
}

function onAction(a) {
  if (!S.soundOn) return;
  if (a.type === 'move') {
    Snd.unoPlay(); // card slap-ish
  }
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
}

function renderHeader() {
  $('#btnSound').innerHTML = iconSVG(S.soundOn ? 'sound' : 'mute', 20);
}

function mySeat() { return S.st.seats.find(s => s.id === S.st.you); }
function isMyTurn() {
  const st = S.st;
  if (st.isLocal) return st.phase === 'playing';
  return st.phase === 'playing' && st.turn === st.you;
}
function myMark() {
  const me = mySeat();
  if (!me) return null;
  return S.st.tttSeats && S.st.tttSeats.find(x => x.id === me.id) ? S.st.tttSeats.find(x => x.id === me.id).mark : null;
}

/* ---------- lobby ---------- */

function renderLobby() {
  const st = S.st;
  const n = st.seats.length;
  $('#seatCount').textContent = n + '/2';
  $('#lobbyTitle').textContent = st.isLocal ? 'Same device · Pass & play' : 'Invite a friend to join';
  $('#lobbySub').textContent = st.isLocal
    ? 'Take turns on this screen — each player plays when it is their turn.'
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
        <span id="waitText">Waiting for a friend to join…</span>
      </div>`;
    const wRow = $('#waitingRow');
    wRow.classList.toggle('ready', n >= 2);
    $('#waitText').textContent = n >= 2 ? 'Ready to start!' : 'Waiting for a friend to join…';
  }

  $('#setupInfo').innerHTML = n < 2
    ? 'Waiting for one more player…'
    : '<span class="small">First player is <b style="color:#63a4ff">X</b>, second is <b style="color:#f6c453">O</b>. Get 3 in a row to win!</span>';

  const list = $('#playerList');
  list.innerHTML = '';
  st.seats.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'prow';
    const mark = i === 0 ? 'X' : 'O';
    const col = i === 0 ? '#63a4ff' : '#f6c453';
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
      <span class="pmeta"><span class="tag" style="color:${col};border:1px solid ${col}55;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:900">${mark}</span>
        ${st.you === st.hostId && s.id !== st.hostId ? `<button class="x-btn" data-remove="${s.id}">✕</button>` : ''}
      </span>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => wsSend({ t: 'removeSeat', seatId: b.dataset.remove }));

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
    if (st.draw) banner.textContent = '🤝 It\'s a draw!';
    else {
      const w = st.tttSeats && st.winner != null ? st.tttSeats[st.winner] : null;
      banner.textContent = '🏆 ' + (w ? w.name : 'Player') + ' wins!';
    }
    banner.className = '';
  } else if (st.isLocal) {
    const cur = (st.tttSeats || []).find(s => s.id === st.turn);
    banner.textContent = '📱 ' + (cur ? cur.name : 'Player') + "'s turn (" + st.turnMark + ') — take your time';
    banner.className = 'your';
  } else if (my) {
    banner.textContent = '🎯 Your turn — place ' + st.turnMark;
    banner.className = 'your';
  } else {
    const cur = (st.tttSeats || []).find(s => s.id === st.turn);
    banner.textContent = 'Waiting for ' + (cur ? cur.name : 'Player') + '…';
    banner.className = '';
  }

  // player strip
  const strip = $('#playerStrip');
  strip.innerHTML = '';
  for (const s of (st.tttSeats || [])) {
    const pill = document.createElement('div');
    pill.className = 'player-pill' + (st.turn === s.id && st.phase === 'playing' ? ' on' : '');
    pill.style.setProperty('--pcolor', s.mark === 'X' ? '#63a4ff' : '#f6c453');
    pill.innerHTML = `<span class="pmark">${s.mark}</span><span>${esc(s.name)}</span>`;
    strip.appendChild(pill);
  }

  renderBoard();
  renderScores();
  renderFeed();
  renderPanel();
  renderWinner();
}

function renderBoard() {
  const st = S.st;
  const board = $('#board');
  board.innerHTML = '';
  const my = isMyTurn();
  const winLine = st.winLine || [];
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'ttt-cell';
    const v = st.board[i];
    if (v === 0) { cell.classList.add('x'); cell.innerHTML = '<span class="mark">✕</span>'; }
    else if (v === 1) { cell.classList.add('o'); cell.innerHTML = '<span class="mark">◯</span>'; }
    else if (st.phase === 'playing' && my) { cell.classList.add('free'); }
    else cell.classList.add('dim');
    if (winLine.includes(i)) cell.classList.add('win');
    if (v === null && st.phase === 'playing' && my) {
      cell.dataset.cell = i;
      cell.onclick = () => {
        Snd.click();
        wsSend({ t: 'tttMove', cell: i, as: st.isLocal ? st.turn : undefined });
      };
    }
    board.appendChild(cell);
  }
}

function renderScores() {
  $('#xWins').textContent = S.scores.x;
  $('#oWins').textContent = S.scores.o;
  $('#drawCount').textContent = S.scores.d;
}

function renderFeed() {
  const feed = $('#feedStrip');
  feed.innerHTML = '';
  for (const l of (S.st.log || []).slice(-5)) {
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
    for (const s of (S.st.tttSeats || [])) {
      const row = document.createElement('div');
      row.className = 'prow';
      const col = s.mark === 'X' ? '#63a4ff' : '#f6c453';
      row.innerHTML = `<span class="avatar" style="background:${col};color:#fff">${s.mark}</span>
        <span class="pinfo"><span class="pname">${esc(s.name)} ${S.st.turn === s.id && S.st.phase === 'playing' ? '▶' : ''}</span>
        <span class="pstatus">plays ${s.mark}</span></span>`;
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
  if (st.phase !== 'over') {
    ov.classList.add('hidden');
    bar.classList.add('hidden');
    return;
  }
  ov.classList.remove('hidden');
  let title, color;
  if (st.draw) {
    title = "It's a draw!";
    color = 'var(--muted)';
    $('#winSub').textContent = 'The board is full — nobody got 3 in a row.';
  } else {
    const w = st.tttSeats[st.winner];
    const name = w ? w.name : 'Player';
    title = name + ' wins!';
    color = st.winner === 0 ? '#63a4ff' : '#f6c453';
    $('#winSub').textContent = name + ' got 3 in a row (' + (st.winner === 0 ? 'X' : 'O') + ').';
  }
  $('#winTitle').textContent = title;
  $('#winTitle').style.color = color;
  const isHost = st.you === st.hostId;
  const rematch = $('#btnRematch');
  rematch.classList.toggle('hidden', !isHost);
  rematch.onclick = () => { ov.classList.add('hidden'); wsSend({ t: 'rematch' }); };
  $('#winClose').onclick = () => {
    ov.classList.add('hidden');
    bar.classList.remove('hidden');
    bar.innerHTML = `<span>${title}</span>
      <span class="go-btns">
        <button id="goReopen" class="ghost small">${iconSVG('trophy', 14)}&nbsp;View result</button>
        ${isHost ? '<button id="goRematch" class="primary small">' + iconSVG('refresh', 14) + '&nbsp;Play again</button>' : ''}
      </span>`;
    $('#goReopen').onclick = () => { bar.classList.add('hidden'); ov.classList.remove('hidden'); };
    const gr = $('#goRematch');
    if (gr) gr.onclick = () => wsSend({ t: 'rematch' });
  };
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
  const colors = ['#63a4ff', '#f6c453', '#ef4444', '#22c55e', '#c084fc'];
  for (let i = 0; i < 50; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.background = colors[i % colors.length];
    el.style.animationDuration = (2 + Math.random() * 2) + 's';
    el.style.animationDelay = (Math.random() * 0.7) + 's';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5200);
  }
}

/* ---------------- mini board art ---------------- */

function buildMini() {
  const board = $('#miniBoard');
  if (!board) return;
  for (let i = 0; i < 9; i++) {
    const el = document.createElement('i');
    const marks = ['✕', '', '◯', '◯', '✕', '', '', '◯', '✕'];
    if (marks[i]) {
      el.textContent = marks[i];
      el.classList.add(marks[i] === '✕' ? 'm-x' : 'm-o');
    }
    board.appendChild(el);
  }
}

/* ---------------- wire up ---------------- */

function wire() {
  $('#btnBots').onclick = () => { $('#botModal').classList.remove('hidden'); };
  $('#btnFriends').onclick = () => { $('#friendsModal').classList.remove('hidden'); };
  $('#diceName').onclick = () => { $('#modeName').value = guessName(); };
  $('#btnHome').onclick = leaveToMenu;
  $('#btnSame').onclick = () => { $('#friendsModal').classList.add('hidden'); buildHsNames(); $('#hotseatModal').classList.remove('hidden'); };
  $('#btnDevices').onclick = () => { $('#friendsModal').classList.add('hidden'); wsSend({ t: 'create', game: 'ttt', name: modeName(), token: S.token || makeToken() }); };
  $('#friendsClose').onclick = () => $('#friendsModal').classList.add('hidden');
  $('#hotseatClose').onclick = () => $('#hotseatModal').classList.add('hidden');
  $('#botClose').onclick = () => $('#botModal').classList.add('hidden');
  ['#friendsModal', '#hotseatModal', '#botModal'].forEach(sel => {
    document.querySelector(sel).addEventListener('click', e => {
      if (e.target === document.querySelector(sel)) document.querySelector(sel).classList.add('hidden');
    });
  });

  $('#hsStart').onclick = startHotseat;
  $('#diffPro').onclick = () => { S.botSkill = 'pro'; $('#diffPro').classList.add('on'); $('#diffChill').classList.remove('on'); };
  $('#diffChill').onclick = () => { S.botSkill = 'chill'; $('#diffChill').classList.add('on'); $('#diffPro').classList.remove('on'); };
  $('#botStart').onclick = startWithBot;

  $('#inviteActions').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'copyCode') copyText(S.code || '').then(ok => toast(ok ? 'Room code ' + S.code + ' copied' : ''));
    else if (b.dataset.act === 'copyLink') copyText(cleanLink()).then(ok => toast(ok ? 'Link copied — send it to friends!' : 'Copy failed.'));
  });

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
  const box = $('#hsNames');
  box.innerHTML = '';
  for (let i = 1; i <= 2; i++) {
    const row = document.createElement('div');
    row.className = 'hs-name-row';
    const num = document.createElement('span');
    num.className = 'hs-num';
    num.textContent = i === 1 ? 'X' : 'O';
    num.style.color = i === 1 ? '#63a4ff' : '#f6c453';
    const inp = document.createElement('input');
    inp.maxLength = 16;
    inp.placeholder = 'Player ' + i;
    inp.value = S.hsNames[i - 1] || 'Player ' + i;
    inp.addEventListener('input', () => { S.hsNames[i - 1] = inp.value; });
    row.append(num, inp);
    box.appendChild(row);
  }
}

function fitBoard() {
  const wrap = $('#boardWrap');
  if (!wrap) return;
  const w = Math.max(180, wrap.clientWidth - 2);
  const cell = Math.max(60, Math.min(150, Math.floor((w - 2 * 14 - 2 * 8) / 3)));
  document.documentElement.style.setProperty('--cell', cell + 'px');
}

/* ---------------- boot ---------------- */

(function boot() {
  wire();
  buildMini();
  mountIcons();
  fitBoard();
  connect();
  const unlock = () => { Snd.unlock(); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
})();
