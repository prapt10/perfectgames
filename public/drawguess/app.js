'use strict';
/* Perfect Games — Draw & Guess client (vanilla JS, no storage) */

const $ = s => document.querySelector(s);

const COLORS = ['#1a1a2e', '#e03131', '#1971c2', '#2f9e44', '#f59f00', '#9c36b5', '#8d5524', '#ffffff'];
const COLOR_NAMES = ['Black', 'Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Brown', 'Eraser'];

const S = {
  ws: null,
  code: null,
  seatId: null,
  name: null,
  token: null,
  st: null,
  soundOn: true,
  retries: 0,
  pending: null,
  tab: 'scores',
  botCount: 3,
  botSkill: 'pro',
  hsNames: ['Player 1', 'Player 2', 'Player 3'],
  hsCount: 3,
  strokes: [],       // local mirror of canvas strokes (with ids)
  lastMoveNo: 0,
};

/* ================= websocket ================= */

function wsUrl() {
  return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
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

function wsSend(obj) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(obj));
}

/* ================= flow ================= */

function startFlow() {
  const params = new URLSearchParams(location.search);
  const code = (params.get('r') || '').toUpperCase();
  S.token = params.get('p') || null;
  if (code && code.length >= 4) {
    S.code = code;
    S.name = null;
    openModal('Join game', 'Join', () => {
      S.name = ($('#nameInput').value || guessName()).trim();
      wsSend({ t: 'join', room: S.code, name: S.name, token: S.token });
    });
    $('#modalNote').textContent = 'Joining room ' + code + ' — no sign-up needed.';
  } else {
    $('#modeView').classList.remove('hidden');
  }
}

function modeName() {
  return ($('#modeName').value || guessName()).trim();
}

function createRoomWithFriends() {
  $('#friendsModal').classList.add('hidden');
  const msg = { t: 'create', game: 'drawguess', name: modeName(), token: S.token || makeToken() };
  if (S.ws && S.ws.readyState === 1) wsSend(msg);
  else { S.pending = msg; toast('Connecting…'); }
}

function startHotseat() {
  while (S.hsNames.length < S.hsCount) S.hsNames.push('');
  S.hsNames.length = S.hsCount;
  const names = S.hsNames.map((n, i) => (n || '').trim() || 'Player ' + (i + 1));
  if (names.length < 2) { toast('Give at least 2 players a name.', true); return; }
  $('#hotseatModal').classList.add('hidden');
  const msg = { t: 'localPlay', game: 'drawguess', names, token: S.token || makeToken() };
  if (S.ws && S.ws.readyState === 1) wsSend(msg);
  else { S.pending = msg; toast('Connecting…'); }
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

function startWithBots() {
  $('#botModal').classList.add('hidden');
  const msg = { t: 'quickPlay', game: 'drawguess', name: modeName(), token: S.token || makeToken(), bots: S.botCount, skill: S.botSkill };
  if (S.ws && S.ws.readyState === 1) wsSend(msg);
  else { S.pending = msg; toast('Connecting…'); }
}

function leaveToMenu() {
  try { S.ws.close(); } catch (e) { /* noop */ }
  S.code = null; S.seatId = null; S.st = null; S.pending = null; S.strokes = [];
  history.replaceState(null, '', location.pathname);
  ['modeView', 'lobbyView', 'gameView', 'winnerOverlay', 'gameOverBar',
   'friendsModal', 'hotseatModal', 'botModal', 'joinModal']
    .forEach(id => $('#' + id).classList.add('hidden'));
  $('#modeView').classList.remove('hidden');
  connect();
}

function guessName() {
  const adj = ['Swift', 'Clever', 'Mighty', 'Sunny', 'Brave', 'Lucky', 'Cosmic', 'Fancy'];
  return (adj[Math.floor(Math.random() * adj.length)] + (10 + Math.floor(Math.random() * 90)));
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

function cleanLink() {
  return location.origin + '/drawguess?r=' + S.code;
}

/* ================= handle messages ================= */

function handle(m) {
  if (m.t === 'state') {
    const prev = S.st;
    S.st = m;
    S.code = m.code;
    if (!S.token) S.token = makeToken();
    syncUrl();
    ['modeView', 'botModal', 'friendsModal', 'hotseatModal'].forEach(id => $('#' + id).classList.add('hidden'));
    // sounds
    if (prev && m.lastAction && m.lastAction.moveNo && m.lastAction.moveNo !== prev.moveNo) {
      if (m.lastAction.type === 'correct' && m.phase === 'reveal') {
        if (m.correctBy === S.st.you) toast('🎉 You got it! +' + (S.st.isLocal ? 150 : 'points'));
        Snd.sequence();
      } else if (m.lastAction.type === 'timeout') {
        Snd.error();
      }
    }
    if (m.phase === 'draw' && m.isDrawer && (!prev || !prev.isDrawer)) Snd.turnChime();
    // strokes sync
    S.strokes = m.strokes ? m.strokes.slice() : [];
    CV.redraw();
    render();
    hideConnBanner();
  } else if (m.t === 'dgStroke') {
    if (S.strokes.some(s => s.id === m.id)) return;
    S.strokes.push({ id: m.id, color: m.color, size: m.size, pts: m.pts });
    CV.redraw();
  } else if (m.t === 'dgUndo') {
    S.strokes = S.strokes.filter(s => s.id !== m.id);
    CV.redraw();
  } else if (m.t === 'dgClear') {
    S.strokes = [];
    CV.redraw();
  } else if (m.t === 'chat') {
    if (S.st) { S.st.chat = m.chat; if (S.tab === 'chat') renderPanel(); }
  } else if (m.t === 'error') {
    toast(m.msg, true);
    Snd.error();
  } else if (m.t === 'kicked') {
    toast(m.msg, true);
    setTimeout(() => { location.href = '/'; }, 1200);
  }
}

/* ================= canvas ================= */

const CV = {
  canvas: null, ctx: null, w: 0, h: 0,
  drawing: false, cur: [],
  color: '#1a1a2e', size: 5,
  redraw() {
    if (!CV.ctx) return;
    CV.ctx.fillStyle = '#ffffff';
    CV.ctx.fillRect(0, 0, CV.w, CV.h);
    for (const st of S.strokes) drawStroke(st);
  },
};

function drawStroke(stroke) {
  if (!stroke.pts || stroke.pts.length < 2) return;
  CV.ctx.strokeStyle = stroke.color;
  CV.ctx.lineWidth = stroke.size;
  CV.ctx.lineCap = 'round';
  CV.ctx.lineJoin = 'round';
  CV.ctx.beginPath();
  stroke.pts.forEach((p, i) => {
    const x = p.x * CV.w, y = p.y * CV.h;
    if (i === 0) CV.ctx.moveTo(x, y); else CV.ctx.lineTo(x, y);
  });
  CV.ctx.stroke();
}

function canDraw() {
  const st = S.st;
  return !!st && st.isDrawer && st.phase === 'draw' && !st.revealed;
}

function initCanvas() {
  CV.canvas = $('#drawCanvas');
  CV.ctx = CV.canvas.getContext('2d');
  resizeCanvas();

  const canvas = CV.canvas;
  canvas.addEventListener('pointerdown', e => {
    if (!canDraw()) return;
    e.preventDefault();
    CV.drawing = true;
    CV.cur = [toNorm(e)];
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  });
  canvas.addEventListener('pointermove', e => {
    if (!CV.drawing) return;
    e.preventDefault();
    const p = toNorm(e);
    const last = CV.cur[CV.cur.length - 1];
    if (CV.cur.length > 1 && Math.hypot(p.x - last.x, p.y - last.y) < 0.006) return;
    CV.cur.push(p);
    // live preview of the in-progress stroke
    CV.ctx.strokeStyle = CV.color;
    CV.ctx.lineWidth = CV.size;
    CV.ctx.lineCap = 'round';
    CV.ctx.lineJoin = 'round';
    CV.ctx.beginPath();
    CV.cur.forEach((pt, i) => {
      const x = pt.x * CV.w, y = pt.y * CV.h;
      if (i === 0) CV.ctx.moveTo(x, y); else CV.ctx.lineTo(x, y);
    });
    CV.ctx.stroke();
  });
  const finish = e => {
    if (!CV.drawing) return;
    CV.drawing = false;
    if (CV.cur.length >= 2) {
      wsSend({ t: 'stroke', pts: CV.cur, color: CV.color, size: CV.size, as: S.st.isLocal ? S.st.drawer : undefined });
    }
    CV.cur = [];
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 300));
}

function toNorm(e) {
  const r = CV.canvas.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
    y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
  };
}

function resizeCanvas() {
  const wrap = $('#canvasWrap');
  if (!wrap || !CV.canvas || !CV.ctx) return;
  const w = Math.max(220, wrap.clientWidth - 2);
  const h = Math.max(230, Math.min(360, w * 0.72));
  const dpr = window.devicePixelRatio || 1;
  CV.canvas.width = Math.round(w * dpr);
  CV.canvas.height = Math.round(h * dpr);
  CV.canvas.style.height = h + 'px';
  CV.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  CV.w = w; CV.h = h;
  CV.redraw();
}

/* ================= render ================= */

function render() {
  renderHeader();
  const phase = S.st.phase;
  $('#lobbyView').classList.toggle('hidden', phase !== 'lobby');
  $('#gameView').classList.toggle('hidden', phase === 'lobby');
  if (phase === 'lobby') renderLobby();
  else renderGame();
  $('#btnLeave').classList.toggle('hidden', !S.code);
}

function renderHeader() {
  $('#btnSound').innerHTML = iconSVG(S.soundOn ? 'sound' : 'mute', 20);
}

function drawerName() {
  const st = S.st;
  if (!st) return 'Player';
  const s = (st.seats || []).find(x => x.id === st.drawer);
  return s ? s.name : st.drawerName || 'Player';
}

/* ---------- lobby ---------- */

function renderLobby() {
  const st = S.st;
  const n = st.seats.length;
  $('#seatCount').textContent = n + '/6';
  $('#lobbyTitle').textContent = st.isLocal ? 'Same device · Party mode' : 'Invite a friend to join';
  $('#lobbySub').textContent = st.isLocal
    ? 'One screen — the drawer hides the phone, everyone shouts guesses, you tap who got it.'
    : 'Share the room code — friends enter it on their screen to join.';
  const actions = $('#inviteActions');
  if (st.isLocal) {
    actions.innerHTML = `<p class="pass-note">📱 <b>Party mode</b> — everyone sits together. The word appears on screen; the drawer sketches while others shout guesses out loud. Tap the player who gets it right!</p>`;
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

  $('#setupInfo').innerHTML = st.isLocal
    ? `${n} players on this screen · each player draws once (${Math.max(3, Math.min(8, n))} rounds)`
    : `${n} players · every human draws once (${Math.max(3, Math.min(8, st.seats.filter(s => !s.isBot).length || 1))} rounds) · bots guess`;

  const list = $('#playerList');
  list.innerHTML = '';
  st.seats.forEach(s => list.appendChild(playerRow(st, s)));

  list.querySelectorAll('[data-remove]').forEach(b => {
    b.onclick = () => wsSend({ t: 'removeSeat', seatId: b.dataset.remove });
  });
  list.querySelectorAll('[data-seat]').forEach(b => {
    b.onclick = () => {
      const seat = st.seats.find(x => x.id === b.dataset.seat);
      wsSend({ t: 'setBotSkill', seatId: b.dataset.seat, skill: seat.skill === 'chill' ? 'pro' : 'chill' });
    };
  });

  const ctrl = $('#lobbyControls');
  ctrl.innerHTML = '';
  if (st.you === st.hostId) {
    const addPro = document.createElement('button');
    addPro.className = 'ghost add-bot-btn';
    addPro.innerHTML = iconSVG('bot', 16) + '&nbsp;+ Add bot guesser';
    addPro.onclick = () => wsSend({ t: 'addBot', skill: 'pro' });
    const start = document.createElement('button');
    start.className = 'primary start-btn';
    start.innerHTML = iconSVG('play', 15) + '&nbsp;Start game';
    start.disabled = n < 2;
    start.onclick = () => wsSend({ t: 'start' });
    ctrl.append(addPro, start);
  } else {
    const w = document.createElement('span');
    w.className = 'muted small waiting-note';
    w.innerHTML = iconSVG('info', 13) + '&nbsp; Waiting for the host to start…';
    ctrl.appendChild(w);
  }
}

function playerRow(st, s) {
  const row = document.createElement('div');
  row.className = 'prow';
  const initials = s.name.replace(/\s*\(bot\)\s*$/i, '').slice(0, 2).toUpperCase();
  const avatar = s.isBot
    ? `<span class="avatar bot-avatar">${iconSVG('bot', 18)}</span>`
    : `<span class="avatar">${esc(initials)}</span>`;
  let status = '';
  if (s.id === st.you) status += '<span class="you-tag">You</span>';
  if (s.id === st.hostId && !s.isBot) status += (status ? ' · ' : '') + '<span class="host-tag">Host</span>';
  if (s.isBot) status += (status ? ' · ' : '') + `<span class="bot-tag">${s.skill === 'chill' ? 'Chill bot' : 'Pro bot'}</span>`;
  if (!status) status = s.connected ? 'Connected' : 'Offline';
  row.innerHTML = `${avatar}
    <span class="pinfo">
      <span class="pname">${esc(s.name)}</span>
      <span class="pstatus">${status}</span>
    </span>
    <span class="pmeta">
      ${s.isBot ? `<button class="skill-btn" data-seat="${s.id}" title="Toggle bot level">${s.skill === 'chill' ? '😴' : '🧠'}</button>` : ''}
      ${st.you === st.hostId && s.id !== st.hostId ? `<button class="x-btn" data-remove="${s.id}" title="Remove">✕</button>` : ''}
    </span>`;
  return row;
}

/* ---------- game ---------- */

function mySeat() {
  return (S.st.seats || []).find(s => s.id === S.st.you) || null;
}

function renderGame() {
  const st = S.st;
  const local = !!st.isLocal;

  // round + timer
  $('#roundLabel').textContent = st.round + '/' + st.roundsTotal;
  const tEl = $('#dgTimer');
  tEl.classList.remove('warn');
  if (st.phase === 'lobby') { tEl.textContent = '—'; }
  else if (st.phase === 'over') { tEl.textContent = '0:00'; }
  else {
    const rem = Math.max(0, Math.ceil((st.roundEndsAt - Date.now()) / 1000));
    const mm = Math.floor(rem / 60), ss = rem % 60;
    tEl.textContent = mm + ':' + String(ss).padStart(2, '0');
    if (rem <= 15) tEl.classList.add('warn');
  }

  // banner
  const banner = $('#turnBanner');
  if (st.phase === 'choose') {
    banner.textContent = st.isDrawer ? '🎨 Pick a word to draw' : '🎨 ' + drawerName() + ' is picking a word…';
    banner.className = st.isDrawer ? 'your' : '';
  } else if (st.phase === 'draw') {
    banner.textContent = st.isDrawer ? '✏️ Your turn to draw — make it clear!' : '✏️ ' + drawerName() + ' is drawing…';
    banner.className = st.isDrawer ? 'your' : '';
  } else if (st.phase === 'reveal') {
    const who = st.correctBy ? (st.seats.find(s => s.id === st.correctBy) || {}).name || 'Someone' : null;
    banner.textContent = who
      ? '💡 ' + who + ' got it! The word was “' + (st.word || '?') + '”'
      : '⏰ Time’s up! The word was “' + (st.word || '?') + '”';
    banner.className = who ? 'win-banner' : '';
  } else {
    banner.textContent = '';
    banner.className = '';
  }

  // word bar (drawer sees the word; local mode shows it to everyone)
  const wordBar = $('#wordBar');
  const wordText = $('#wordText');
  const wordPick = $('#wordPick');
  if (st.phase === 'choose' && st.isDrawer) {
    wordBar.classList.remove('hidden');
    wordText.textContent = 'Pick a word:';
    wordPick.classList.remove('hidden');
    wordPick.innerHTML = '';
    st.wordOptions.forEach((w, i) => {
      const b = document.createElement('button');
      b.className = 'word-opt';
      b.textContent = w.toUpperCase();
      b.onclick = () => {
        wsSend({ t: 'pickWord', idx: i, as: local ? st.drawer : undefined });
        Snd.click();
      };
      wordPick.appendChild(b);
    });
  } else if (st.phase === 'draw' && st.word && (st.isDrawer || local)) {
    wordBar.classList.remove('hidden');
    wordText.innerHTML = st.isDrawer ? 'Your word:' : 'Word (everyone sees it):';
    wordPick.classList.add('hidden');
    wordPick.innerHTML = '';
  } else if (st.phase === 'reveal' && st.word) {
    wordBar.classList.remove('hidden');
    wordText.textContent = 'The word was';
    wordPick.classList.add('hidden');
    wordPick.innerHTML = '';
  } else {
    wordBar.classList.add('hidden');
  }
  if (st.word) wordBar.dataset.word = st.word;
  else delete wordBar.dataset.word;

  renderScoreStrip();
  renderCanvasUI();
  renderFeed();
  renderPanel();
  renderWinner();
}

function renderScoreStrip() {
  const strip = $('#scoreStrip');
  strip.innerHTML = '';
  const st = S.st;
  const scores = (st.scores || []).slice().sort((a, b) => b.score - a.score);
  const leader = scores.length ? scores[0].score : 0;
  for (const s of scores) {
    const pill = document.createElement('div');
    pill.className = 'score-chip';
    if (s.id === st.drawer && st.phase !== 'over') pill.classList.add('drawer');
    if (s.score === leader && s.score > 0) pill.classList.add('lead');
    if (s.id === st.you) pill.classList.add('me');
    pill.innerHTML = `<span class="sc-name">${esc(s.name)}</span><span class="sc-pts">${s.score}</span>`;
    strip.appendChild(pill);
  }
}

function renderCanvasUI() {
  const st = S.st;
  const local = !!st.isLocal;
  const drawerActive = st.phase === 'draw' && !st.revealed;

  // toolbar: only the drawer (or anyone in local mode? no — drawer draws)
  const toolbar = $('#toolbar');
  toolbar.classList.toggle('hidden', !(drawerActive && st.isDrawer));

  // lock overlay for non-drawers
  const lock = $('#canvasLock');
  const showLock = st.phase === 'lobby' || (st.phase !== 'over' && !st.isDrawer && !local);
  lock.classList.toggle('hidden', !showLock);
  if (showLock) {
    $('#canvasLockText').textContent = st.phase === 'draw'
      ? drawerName() + ' is drawing…'
      : (st.phase === 'choose' ? drawerName() + ' is picking a word…' : '');
  }

  // guess row: guessers only, online mode only
  const guessRow = $('#guessRow');
  guessRow.classList.toggle('hidden', !(st.canGuess));
  if (st.canGuess) {
    const inp = $('#guessInput');
    inp.disabled = false;
    // keep focus without yanking it from other fields
    const ae = document.activeElement;
    if (!ae || ae === document.body || ae === inp) inp.focus();
  }

  // local mode award bar
  const award = $('#localAward');
  if (local && drawerActive) {
    award.classList.remove('hidden');
    award.innerHTML = '<div class="la-title">Shouted the right word? Tap who got it:</div><div class="la-btns"></div>';
    const btns = award.querySelector('.la-btns');
    (st.seats || []).forEach(s => {
      if (s.isBot || s.id === st.drawer) return;
      const b = document.createElement('button');
      b.className = 'la-player';
      b.textContent = '✅ ' + esc(s.name);
      b.onclick = () => { wsSend({ t: 'localGotIt', by: s.id }); Snd.sequence(); };
      btns.appendChild(b);
    });
    const skip = document.createElement('button');
    skip.className = 'la-skip';
    skip.textContent = '⏭ No one got it — skip';
    skip.onclick = () => wsSend({ t: 'skip' });
    btns.appendChild(skip);
  } else {
    award.classList.add('hidden');
  }
}

function renderFeed() {
  const feed = $('#feedStrip');
  feed.innerHTML = '';
  const guesses = (S.st.guesses || []).slice(-5);
  if (!guesses.length) {
    feed.innerHTML = '<div class="feed-empty">Guesses will appear here — no pressure!</div>';
    return;
  }
  for (const g of guesses) {
    const item = document.createElement('div');
    item.className = 'feed-item' + (g.correct ? ' correct' : '');
    item.innerHTML = `<span class="fg-name">${esc(g.name)}</span>${g.correct ? ' 🎉 ' : ': '}${esc(g.text)}`;
    feed.appendChild(item);
  }
}

/* ---------- side panel ---------- */

function setTab(tab) {
  S.tab = tab;
  document.querySelectorAll('.panel-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  renderPanel();
}

function renderPanel() {
  const body = $('#panelBody');
  body.innerHTML = '';
  if (S.tab === 'scores') {
    const scores = (S.st.scores || []).slice().sort((a, b) => b.score - a.score);
    if (!scores.length) return;
    const medals = ['🥇', '🥈', '🥉'];
    scores.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'prow';
      row.innerHTML = `<span class="rank">${medals[i] || (i + 1) + '.'}</span>
        <span class="pname">${esc(s.name)} ${s.id === S.st.you ? '<span class="you-tag">You</span>' : ''}</span>
        <span class="pmeta"><b>${s.score}</b> pts</span>`;
      body.appendChild(row);
    });
  } else if (S.tab === 'guesses') {
    const guesses = S.st.guesses || [];
    if (!guesses.length) { body.innerHTML = '<div class="muted small">No guesses yet.</div>'; return; }
    for (const g of guesses.slice(-40)) {
      const line = document.createElement('div');
      line.className = 'move-line' + (g.correct ? ' correct' : '');
      line.textContent = g.name + ': ' + g.text;
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
  const chat = S.st.chat || [];
  for (const c of chat) {
    const msg = document.createElement('div');
    msg.className = 'msg' + (c.name === S.name ? ' me' : '');
    const when = new Date(c.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    msg.innerHTML = `<span class="who">${esc(c.name)}</span><span class="when">${when}</span><br>${esc(c.text)}`;
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

/* ---------- winner overlay ---------- */

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
  const winner = st.seats.find(s => s.id === st.winner);
  const wname = winner ? winner.name : 'Nobody';
  $('#winTitle').textContent = wname + ' wins!';
  const isHost = S.st.you === S.st.hostId;
  const rematch = $('#btnRematch');
  rematch.classList.toggle('hidden', !isHost);
  rematch.onclick = () => { ov.classList.add('hidden'); wsSend({ t: 'rematch' }); };

  const fs = $('#finalScores');
  fs.innerHTML = '';
  const scores = (st.scores || []).slice().sort((a, b) => b.score - a.score);
  const medals = ['🥇', '🥈', '🥉'];
  scores.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'fs-row' + (s.id === st.winner ? ' champ' : '');
    row.innerHTML = `<span>${medals[i] || (i + 1) + '.'} ${esc(s.name)}</span><b>${s.score}</b>`;
    fs.appendChild(row);
  });

  $('#winClose').onclick = () => {
    ov.classList.add('hidden');
    bar.classList.remove('hidden');
    bar.innerHTML = `<span>${iconSVG('crown', 18)}&nbsp;${esc(wname)} wins!</span>
      <span class="go-btns">
        <button id="goReopen" class="ghost small">${iconSVG('trophy', 14)}&nbsp;View result</button>
        ${isHost ? '<button id="goRematch" class="primary small">' + iconSVG('refresh', 14) + '&nbsp;Play again</button>' : ''}
      </span>`;
    $('#goReopen').onclick = () => { bar.classList.add('hidden'); ov.classList.remove('hidden'); };
    const gr = $('#goRematch');
    if (gr) gr.onclick = () => wsSend({ t: 'rematch' });
  };
}

/* ================= misc UI ================= */

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

/* ================= wire up UI ================= */

function wire() {
  $('#btnBots').onclick = () => { $('#botModal').classList.remove('hidden'); };
  $('#btnFriends').onclick = () => { $('#friendsModal').classList.remove('hidden'); };
  $('#diceName').onclick = () => { $('#modeName').value = guessName(); };
  $('#btnHome').onclick = leaveToMenu;

  $('#btnSame').onclick = () => {
    $('#friendsModal').classList.add('hidden');
    buildHsNames();
    $('#hotseatModal').classList.remove('hidden');
  };
  $('#btnDevices').onclick = createRoomWithFriends;
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
  for (let n = 2; n <= 6; n++) {
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

  // bot setup modal
  const bcRow = $('#botCountRow');
  for (let n = 1; n <= 5; n++) {
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
  const setDiff = d => {
    S.botSkill = d;
    $('#diffPro').classList.toggle('on', d === 'pro');
    $('#diffChill').classList.toggle('on', d === 'chill');
  };
  $('#diffPro').onclick = () => setDiff('pro');
  $('#diffChill').onclick = () => setDiff('chill');
  $('#botStart').onclick = startWithBots;

  // lobby copy
  $('#inviteActions').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'copyCode') {
      copyText(S.code || '').then(ok => toast(ok ? 'Room code ' + S.code + ' copied' : ''));
    } else if (b.dataset.act === 'copyLink') {
      copyText(cleanLink()).then(ok => toast(ok ? 'Link copied — send it to friends!' : 'Copy failed — select the link manually.'));
    }
  });

  const joinWithCode = () => {
    const code = ($('#joinCodeInput').value || '').trim().toUpperCase();
    if (code.length < 4) { toast('Enter a valid room code.', true); Snd.error(); return; }
    S.code = code;
    S.token = S.token || makeToken();
    const msg = { t: 'join', room: code, name: modeName(), token: S.token };
    if (S.ws && S.ws.readyState === 1) wsSend(msg);
    else S.pending = msg;
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
  document.querySelectorAll('.panel-tabs button').forEach(b => {
    b.onclick = () => setTab(b.dataset.tab);
  });

  // guess input
  const sendGuess = () => {
    const inp = $('#guessInput');
    const v = inp.value.trim();
    if (!v || !S.st || !S.st.canGuess) return;
    wsSend({ t: 'guess', text: v });
    inp.value = '';
    inp.focus();
  };
  $('#guessBtn').onclick = sendGuess;
  $('#guessInput').onkeydown = e => { if (e.key === 'Enter') sendGuess(); };

  // toolbar
  const colorRow = $('#colorRow');
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'color-dot' + (i === 0 ? ' on' : '');
    b.style.background = c === '#ffffff' ? 'linear-gradient(135deg,#fff 45%,#e03131 45%,#e03131 55%,#fff 55%)' : c;
    b.title = COLOR_NAMES[i];
    b.onclick = () => {
      CV.color = c;
      colorRow.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      Snd.click();
    };
    colorRow.appendChild(b);
  });
  $('#btnUndo').onclick = () => {
    if (!canDraw() || !S.strokes.length) return;
    wsSend({ t: 'undoStroke', as: S.st.isLocal ? S.st.drawer : undefined });
    Snd.click();
  };
  $('#btnClear').onclick = () => {
    if (!canDraw() || !S.strokes.length) return;
    wsSend({ t: 'clearStrokes', as: S.st.isLocal ? S.st.drawer : undefined });
    Snd.click();
  };

  // countdown loop
  setInterval(() => {
    const tEl = $('#dgTimer');
    if (!tEl || !S.st || S.st.phase === 'lobby' || S.st.phase === 'over') return;
    const rem = Math.max(0, Math.ceil((S.st.roundEndsAt - Date.now()) / 1000));
    const mm = Math.floor(rem / 60), ss = rem % 60;
    const txt = mm + ':' + String(ss).padStart(2, '0');
    if (tEl.textContent !== txt) tEl.textContent = txt;
    tEl.classList.toggle('warn', rem <= 15);
  }, 400);
}

/* ================= mini art (first page) ================= */

function buildMiniArt() {
  const art = $('#miniArt');
  if (!art) return;
  const canvas = document.createElement('canvas');
  canvas.width = 220; canvas.height = 130;
  art.prepend(canvas);
  const ctx = canvas.getContext('2d');
  // little scribble: sun, house, tree
  ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.fillStyle = '#f59f00';
  ctx.beginPath(); ctx.arc(180, 26, 12, 0, 7); ctx.fill();
  ctx.strokeStyle = '#8d5524';
  ctx.beginPath(); ctx.moveTo(30, 110); ctx.lineTo(55, 55); ctx.lineTo(80, 110); ctx.stroke();
  ctx.strokeStyle = '#2f9e44';
  ctx.beginPath(); ctx.arc(55, 48, 18, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#1a1a2e';
  ctx.beginPath(); ctx.moveTo(100, 110); ctx.lineTo(100, 70); ctx.lineTo(140, 70); ctx.lineTo(140, 110); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(95, 75); ctx.lineTo(120, 45); ctx.lineTo(145, 75); ctx.stroke();
  ctx.strokeStyle = '#1971c2';
  ctx.beginPath(); ctx.arc(120, 88, 5, 0, 7); ctx.stroke();
}

/* ================= boot ================= */

(function boot() {
  wire();
  buildMiniArt();
  mountIcons();
  initCanvas();
  connect();
  const unlock = () => { Snd.unlock(); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
})();
