'use strict';
/* Perfect Games — Tambola / Housie client (vanilla JS, no storage) */

const $ = s => document.querySelector(s);

const PRIZE_KEYS = ['earlyFive', 'topLine', 'midLine', 'bottomLine', 'fullHouse'];
const PRIZE_ICON = { earlyFive: '5️⃣', topLine: '⬆️', midLine: '〰️', bottomLine: '⬇️', fullHouse: '🏠' };
const PRIZE_SHORT = { earlyFive: 'EARLY FIVE', topLine: 'TOP LINE', midLine: 'MID LINE', bottomLine: 'BOTTOM LINE', fullHouse: 'FULL HOUSE' };
const SPEED_MS = { slow: 6000, normal: 4000, fast: 2000 };

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
  tab: 'players',
  botCount: 3,
  botSkill: 'pro',
  ticketsPerPlayer: 1,
  speed: 'normal',
  hsNames: [],
  hsCount: 3,
  prevLastNumber: null,
  pendingClaim: false,
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

function startWithBots() {
  $('#botModal').classList.add('hidden');
  const msg = {
    t: 'quickPlay', game: 'tambola', name: modeName(), token: S.token || makeToken(),
    bots: S.botCount, skill: S.botSkill, tickets: S.ticketsPerPlayer, speed: SPEED_MS[S.speed],
  };
  if (S.ws && S.ws.readyState === 1) wsSend(msg);
  else { S.pending = msg; toast('Connecting…'); }
}

function createRoomWithFriends() {
  $('#friendsModal').classList.add('hidden');
  const msg = { t: 'create', game: 'tambola', name: modeName(), token: S.token || makeToken() };
  if (S.ws && S.ws.readyState === 1) wsSend(msg);
  else { S.pending = msg; toast('Connecting…'); }
}

function startHotseat() {
  while (S.hsNames.length < S.hsCount) S.hsNames.push('');
  S.hsNames.length = S.hsCount;
  const names = S.hsNames.map((n, i) => (n || '').trim() || 'Player ' + (i + 1));
  if (names.length < 2) { toast('Give at least 2 players a name.', true); return; }
  $('#hotseatModal').classList.add('hidden');
  const msg = {
    t: 'localPlay', game: 'tambola', names, token: S.token || makeToken(),
    tickets: S.ticketsPerPlayer, speed: SPEED_MS[S.speed],
  };
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

/* shared setup controls (tickets per player + speed) — injected into modals */
function buildCommonSetup() {
  document.querySelectorAll('#commonSetup').forEach(host => {
    host.innerHTML = `
      <p class="muted small" style="margin-bottom:8px">Tickets per player</p>
      <div class="ticket-row" id="ticketRow">
        <button data-n="1" class="on">1</button><button data-n="2">2</button>
      </div>
      <p class="muted small" style="margin-bottom:8px">Caller speed</p>
      <div class="speed-row" id="speedRow">
        <button data-s="slow">🐢 Slow</button><button data-s="normal" class="on">⏱ Normal</button><button data-s="fast">⚡ Fast</button>
      </div>`;
    host.querySelectorAll('#ticketRow button').forEach(b => {
      b.onclick = () => {
        S.ticketsPerPlayer = +b.dataset.n;
        host.querySelectorAll('#ticketRow button').forEach(x => x.classList.toggle('on', x === b));
        Snd.click();
      };
    });
    host.querySelectorAll('#speedRow button').forEach(b => {
      b.onclick = () => {
        S.speed = b.dataset.s;
        host.querySelectorAll('#speedRow button').forEach(x => x.classList.toggle('on', x === b));
        Snd.click();
      };
    });
  });
}

function leaveToMenu() {
  try { S.ws.close(); } catch (e) { /* noop */ }
  S.code = null; S.seatId = null; S.st = null; S.pending = null; S.pendingClaim = false;
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
  return location.origin + '/tambola?r=' + S.code;
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

    // new number called → flash + ding
    if (m.phase === 'playing' && m.lastNumber != null && m.lastNumber !== S.prevLastNumber) {
      S.prevLastNumber = m.lastNumber;
      flashCall(m.lastNumber);
      Snd.bingoCall();
    }
    // full house claim → fanfare
    if (prev && m.prizes && m.prizes.length > (prev.prizes || []).length) {
      const latest = m.prizes[m.prizes.length - 1];
      if (latest && latest.key === 'fullHouse') Snd.win();
      else Snd.sequence();
    }
    if (m.phase === 'over' && prev && prev.phase !== 'over') Snd.win();
    render();
    hideConnBanner();
  } else if (m.t === 'chat') {
    if (S.st) { S.st.chat = m.chat; if (S.tab === 'chat') renderPanel(); }
  } else if (m.t === 'error') {
    toast(m.msg, true);
    Snd.error();
    S.pendingClaim = false;
  } else if (m.t === 'kicked') {
    toast(m.msg, true);
    setTimeout(() => { location.href = '/'; }, 1200);
  }
}

/* big flashing number when a call happens */
function flashCall(n) {
  const el = $('#callFlash');
  const num = $('#callFlashNum');
  num.textContent = n;
  el.classList.remove('hidden');
  // restart the animation
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  el.classList.remove('hidden');
  clearTimeout(S._flashT);
  S._flashT = setTimeout(() => el.classList.add('hidden'), 1500);
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

/* ---------- lobby ---------- */

function renderLobby() {
  const st = S.st;
  const n = st.seats.length;
  $('#seatCount').textContent = n + '/6';
  $('#lobbyTitle').textContent = st.isLocal ? 'Same device · House party' : 'Invite a friend to join';
  $('#lobbySub').textContent = st.isLocal
    ? 'Everyone watches one screen — each player gets their own ticket(s) and claims their prizes.'
    : 'Share the room code — friends enter it on their screen to join.';
  const actions = $('#inviteActions');
  if (st.isLocal) {
    actions.innerHTML = `<p class="pass-note">📱 <b>House party mode</b> — all tickets on one screen. Numbers call automatically; when your ticket completes a prize, tap <b>Claim</b> before anyone else!</p>`;
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

  $('#setupInfo').innerHTML = `${n} players · each gets their own ticket${S.ticketsPerPlayer > 1 ? 's' : ''} · prizes: Early Five, 3 Lines & Full House`;

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
    addPro.innerHTML = iconSVG('bot', 16) + '&nbsp;+ Add bot';
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

function renderGame() {
  const st = S.st;

  // header
  $('#callCount').textContent = st.called.length + '/90';
  const lastEl = $('#tbLast');
  if (st.lastNumber != null) {
    lastEl.textContent = st.lastNumber;
    lastEl.classList.add('live');
  } else {
    lastEl.textContent = '—';
    lastEl.classList.remove('live');
  }
  $('#btnNext').classList.toggle('hidden', !(st.phase === 'playing' && (st.isLocal || S.st.you === S.st.hostId)));
  $('#btnNext').onclick = () => { wsSend({ t: 'tambolaNext' }); Snd.click(); };

  renderPrizeStrip();
  renderCallBoard();
  renderTickets();
  renderFeed();
  renderPanel();
  renderWinner();
}

function renderPrizeStrip() {
  const strip = $('#prizeStrip');
  strip.innerHTML = '';
  const st = S.st;
  const won = {};
  (st.prizes || []).forEach(p => { won[p.key] = p; });
  for (const key of PRIZE_KEYS) {
    const chip = document.createElement('div');
    chip.className = 'prize-chip' + (won[key] ? ' won' : '') + (key === 'fullHouse' ? ' house' : '');
    chip.innerHTML = `<span class="pc-ico">${PRIZE_ICON[key]}</span>
      <span class="pc-name">${PRIZE_SHORT[key]}</span>
      <span class="pc-who">${won[key] ? esc(won[key].byName) : '…'}</span>`;
    strip.appendChild(chip);
  }
}

function renderCallBoard() {
  const board = $('#callBoard');
  const st = S.st;
  const frag = document.createDocumentFragment();
  for (let n = 1; n <= 90; n++) {
    const cell = document.createElement('div');
    cell.className = 'cnum';
    cell.textContent = n;
    if (st.called.indexOf(n) !== -1) {
      cell.classList.add('hit');
      if (n === st.lastNumber) cell.classList.add('last');
    }
    frag.appendChild(cell);
  }
  board.innerHTML = '';
  board.appendChild(frag);
}

function renderTickets() {
  const wrap = $('#tickets');
  wrap.innerHTML = '';
  const st = S.st;
  if (st.isLocal) {
    // house party: everyone's tickets on one screen
    for (const s of st.seats) {
      const tickets = (st.allTickets && st.allTickets[s.id]) || [];
      const eligible = (st.canClaimBySeat && st.canClaimBySeat[s.id]) || [];
      tickets.forEach((tk, ti) => {
        wrap.appendChild(ticketCard(s, tk, ti, eligible.filter(e => e.ticketIdx === ti), true));
      });
    }
  } else {
    const me = st.seats.find(s => s.id === st.you);
    const tickets = st.tickets || [];
    tickets.forEach((tk, ti) => {
      wrap.appendChild(ticketCard(me || { name: 'You' }, tk, ti, (st.canClaim || []).filter(e => e.ticketIdx === ti), false));
    });
    if (!tickets.length) {
      wrap.innerHTML = '<div class="muted small center" style="padding:14px">Waiting for the game…</div>';
    }
  }
}

function ticketCard(seat, ticket, ticketIdx, eligible, party) {
  const card = document.createElement('div');
  card.className = 'ticket-card' + (eligible.length ? ' claimable' : '');
  const marks = ticketNumbers(ticket).filter(n => (S.st.called || []).indexOf(n) !== -1).length;
  card.innerHTML = `<div class="tc-head">
      <span class="tc-owner">${esc(seat.name || 'You')}${party ? ' · Ticket ' + (ticketIdx + 1) : ''}</span>
      <span class="tc-marks">${marks}/15</span>
    </div>
    <div class="ticket-grid"></div>
    <div class="tc-claims"></div>`;
  const grid = card.querySelector('.ticket-grid');
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      const n = ticket[r][c];
      const cell = document.createElement('div');
      cell.className = 'tcell' + (n == null ? ' empty' : '');
      if (n != null) {
        cell.textContent = n;
        if ((S.st.called || []).indexOf(n) !== -1) {
          cell.classList.add('hit');
          if (n === S.st.lastNumber) cell.classList.add('just');
        }
      }
      grid.appendChild(cell);
    }
  }
  const claims = card.querySelector('.tc-claims');
  if (eligible.length) {
    for (const e of eligible) {
      const b = document.createElement('button');
      b.className = 'claim-btn';
      b.textContent = '🏆 CLAIM ' + PRIZE_SHORT[e.prize];
      b.disabled = S.pendingClaim;
      b.onclick = () => {
        if (S.pendingClaim) return;
        S.pendingClaim = true;
        wsSend({ t: 'tambolaClaim', prize: e.prize, ticketIdx: e.ticketIdx });
      };
      claims.appendChild(b);
    }
  }
  return card;
}

function ticketNumbers(ticket) {
  const out = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) if (ticket[r][c] != null) out.push(ticket[r][c]);
  return out;
}

function renderFeed() {
  const feed = $('#feedStrip');
  feed.innerHTML = '';
  const logs = (S.st.log || []).slice(-6);
  if (!logs.length) {
    feed.innerHTML = '<div class="feed-empty">Numbers will start calling soon…</div>';
    return;
  }
  for (const l of logs) {
    const item = document.createElement('div');
    item.className = 'feed-item' + (/claimed|wins/.test(l.text) ? ' claim' : '');
    item.textContent = l.text;
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
  if (S.tab === 'players') {
    if (!S.st.seats.length) return;
    const sorted = S.st.seats.slice().sort((a, b) => b.marks - a.marks);
    for (const s of sorted) {
      const row = document.createElement('div');
      row.className = 'prow';
      row.innerHTML = `<span class="pname">${esc(s.name)} ${s.id === S.st.you ? '<span class="you-tag">You</span>' : ''}</span>
        <span class="pmeta"><b style="color:var(--gold2)">${s.marks}</b> marks · ${s.strikes} ✗</span>`;
      body.appendChild(row);
    }
  } else if (S.tab === 'prizes') {
    const won = (S.st.prizes || []).slice().reverse();
    if (!won.length) { body.innerHTML = '<div class="muted small">No prizes claimed yet.</div>'; return; }
    for (const p of won) {
      const line = document.createElement('div');
      line.className = 'move-line';
      line.innerHTML = `<b>${esc(p.name)}</b> — ${esc(p.byName)}`;
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
  row.innerHTML = `<input id="chatInput" maxlength="200" placeholder="Shout housie…"><button class="primary small">Send</button>`;
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
  $('#winTitle').textContent = wname + ' — FULL HOUSE!';
  $('#winTitle').style.color = 'var(--gold2)';
  $('#winSub').textContent = 'All 15 numbers marked. The board is done — rematch or start a new room.';
  const isHost = S.st.you === S.st.hostId;
  const rematch = $('#btnRematch');
  rematch.classList.toggle('hidden', !isHost);
  rematch.onclick = () => { ov.classList.add('hidden'); wsSend({ t: 'rematch' }); };

  const fs = $('#finalScores');
  fs.innerHTML = '';
  const won = st.prizes || [];
  for (const p of won) {
    const row = document.createElement('div');
    row.className = 'fs-row' + (p.key === 'fullHouse' ? ' champ' : '');
    row.innerHTML = `<span>${PRIZE_ICON[p.key]} ${esc(p.name)}</span><b>${esc(p.byName)}</b>`;
    fs.appendChild(row);
  }

  $('#winClose').onclick = () => {
    ov.classList.add('hidden');
    bar.classList.remove('hidden');
    bar.innerHTML = `<span>${iconSVG('crown', 18)}&nbsp;${esc(wname)} — Full House!</span>
      <span class="go-btns">
        <button id="goReopen" class="ghost small">${iconSVG('trophy', 14)}&nbsp;View prizes</button>
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
  setTimeout(() => t.remove(), 3200);
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

  // bot count
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

  // party count
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
  buildCommonSetup();

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

  // countdown to the next call
  setInterval(() => {
    const el = $('#nextIn');
    if (!el || !S.st || S.st.phase !== 'playing') return;
    const rem = Math.max(0, (S.st.nextCallAt - Date.now()) / 1000);
    el.textContent = 'next: ' + rem.toFixed(1) + 's';
  }, 200);
}

/* ================= mini ticket art (first page) ================= */

function buildMiniTicket() {
  const wrap = $('#miniTicket');
  if (!wrap) return;
  const cells = wrap.querySelectorAll('i');
  const grid = Array.from({ length: 3 }, () => Array(9).fill(null));
  const rowCount = [0, 0, 0];
  for (let c = 0; c < 9; c++) {
    const lo = c === 0 ? 1 : c * 10;
    const hi = c === 8 ? 90 : c * 10 + 9;
    const cnt = [1, 2, 2, 2, 2, 2, 2, 1, 1][c];
    const pool = [];
    for (let n = lo; n <= hi; n++) pool.push(n);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const nums = pool.slice(0, cnt).sort((a, b) => a - b);
    const rowsOrder = [0, 1, 2].sort((a, b) => rowCount[a] - rowCount[b]);
    nums.forEach((n, i) => {
      const r = rowsOrder[i];
      grid[r][c] = n;
      rowCount[r]++;
    });
  }
  let idx = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      const el = cells[idx++];
      const n = grid[r][c];
      if (n != null) {
        el.textContent = n;
        if (Math.random() < 0.45) el.classList.add('hit');
      }
    }
  }
}

/* ================= boot ================= */

(function boot() {
  wire();
  buildMiniTicket();
  mountIcons();
  connect();
  const unlock = () => { Snd.unlock(); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
})();
