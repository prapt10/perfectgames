'use strict';
/* Perfect Games — Sequence client (vanilla JS, no storage, no frameworks) */

const $ = s => document.querySelector(s);

const COLORS = ['#ff5b5b', '#4d9fff', '#34d399', '#f6c453', '#c084fc', '#fb923c'];
const TEAM_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'];
const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RED_SUITS = { H: 1, D: 1 };

const S = {
  ws: null,
  code: null,           // room code
  seatId: null,
  name: null,
  token: null,          // reconnect token (kept in the URL only — no storage)
  st: null,             // latest state
  selUid: null,
  valid: new Set(),     // placeable cells
  removables: new Set(),// removable chips
  soundOn: true,
  lastMoveNo: 0,
  animatedMoveNo: -1,   // moveNo whose blink/gone fx has already played
  prevChips: null,      // board chip map from the previous render (new-chip fx)
  peekOpen: 0,          // preview counters for the hint line
  peekRemove: 0,
  retries: 0,
  tab: 'chat',
  pending: null,        // message queued until the socket is open
  botCount: 2,
  botSkill: 'pro',
  passLock: false,      // hotseat: hold the pass-the-device screen until OK
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
    if (S.code && S.st && S.st.phase === 'lobby') { /* lobby seat freed; try reclaim */ }
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
    // came in via a friend's link → join that room
    S.code = code;
    S.name = null;
    openModal('Join game', 'Join', () => {
      S.name = ($('#nameInput').value || guessName()).trim();
      wsSend({ t: 'join', room: S.code, name: S.name, token: S.token });
    });
    $('#modalNote').textContent = 'Joining room ' + code + ' — no sign-up needed.';
  } else {
    // fresh visit → show the mode-select first page
    $('#modeView').classList.remove('hidden');
  }
}

function modeName() {
  return ($('#modeName').value || guessName()).trim();
}

function createRoomWithFriends() {
  $('#friendsModal').classList.add('hidden');
  const msg = { t: 'create', name: modeName(), token: S.token || makeToken() };
  if (S.ws && S.ws.readyState === 1) wsSend(msg);
  else { S.pending = msg; toast('Connecting…'); }
}

function startHotseat() {
  // make sure the array matches the selected count (defaults filled)
  while (S.hsNames.length < S.hsCount) S.hsNames.push('');
  S.hsNames.length = S.hsCount;
  const names = S.hsNames.map((n, i) => (n || '').trim() || 'Player ' + (i + 1));
  if (names.length < 2) { toast('Give at least 2 players a name.', true); return; }
  $('#hotseatModal').classList.add('hidden');
  const msg = { t: 'localPlay', names, token: S.token || makeToken() };
  if (S.ws && S.ws.readyState === 1) wsSend(msg);
  else { S.pending = msg; toast('Connecting…'); }
}

function buildHsNames() {
  // keep the names array in sync with the selected player count
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
    inp.addEventListener('input', () => {
      S.hsNames[i - 1] = inp.value;
      updateHsPreview();
    });
    row.append(num, inp);
    box.appendChild(row);
  }
  updateHsPreview();
}

/* team previews (shown before the game starts, in every mode) */
function hsTeamPreview() {
  const n = S.hsCount;
  const names = S.hsNames.map((x, i) => (x || '').trim() || 'Player ' + (i + 1));
  if (n % 2 === 0) {
    const half = n / 2;
    const t0 = names.slice(0, half).map(esc).join(', ');
    const t1 = names.slice(half).map(esc).join(', ');
    return `<span class="tp-dot" style="background:${COLORS[0]}"></span> ${t0}<br>
      <span class="tp-dot" style="background:${COLORS[1]}"></span> ${t1}<br>
      <span class="small">2 teams (${half} vs ${half}) · first to <b>2</b> sequences wins</span>`;
  }
  return `${n} solo players · first to <b>1</b> sequence wins`;
}

function botTeamPreview() {
  const total = 1 + S.botCount;
  if (total % 2 === 0) {
    const half = total / 2;
    const botsWithYou = half - 1;
    return `2 teams (${half} vs ${half}) — you & ${botsWithYou} bot${botsWithYou !== 1 ? 's' : ''} vs ${half} bots<br>
      <span class="small">first to <b>2</b> sequences wins</span>`;
  }
  return `${total} solo players (you + ${S.botCount} bots) · first to <b>1</b> sequence wins`;
}

function updateHsPreview() {
  const el = $('#hsTeamPreview');
  if (el) el.innerHTML = hsTeamPreview();
}
function updateBotPreview() {
  const el = $('#botTeamPreview');
  if (el) el.innerHTML = botTeamPreview();
}

function startWithBots() {
  $('#botModal').classList.add('hidden');
  const msg = { t: 'quickPlay', name: modeName(), token: S.token || makeToken(), bots: S.botCount, skill: S.botSkill };
  if (S.ws && S.ws.readyState === 1) wsSend(msg);
  else { S.pending = msg; toast('Connecting…'); }
}

function leaveToMenu() {
  Snd.stopMusic();
  try { S.ws.close(); } catch (e) { /* noop */ }
  S.code = null; S.seatId = null; S.st = null; S.selUid = null; S.pending = null;
  S.passLock = false;
  history.replaceState(null, '', location.pathname);
  ['modeView', 'lobbyView', 'gameView', 'winnerOverlay', 'gameOverBar',
   'friendsModal', 'hotseatModal', 'botModal', 'passOverlay', 'joinModal']
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

/* ================= handle messages ================= */

function handle(m) {
  if (m.t === 'state') {
    const prev = S.st;
    S.st = m;
    S.code = m.code;
    if (!S.token) S.token = makeToken();
    syncUrl();
    ['modeView', 'botModal', 'friendsModal', 'hotseatModal'].forEach(id => $('#' + id).classList.add('hidden'));
    if (prev && m.moveNo !== prev.moveNo && m.lastAction) onMove(m.lastAction);
    if (prev && prev.phase !== 'over' && m.phase === 'over' && m.winner != null) {
      onWin(m.winner);
    }
    // your-turn chime (once per turn transition)
    if (m.phase === 'playing' && m.yourTurn && (!prev || !prev.yourTurn)) Snd.turnChime();
    // hotseat: HOLD the "pass the device" screen until the next player taps OK
    if (prev && m.isLocal && m.phase === 'playing' && prev.turn && prev.turn !== m.turn) {
      const nm = m.seats.find(s => s.id === m.turn);
      showPass(nm ? nm.name : 'Next player');
    }
    // soft background music while playing; silence in lobby/over
    if (m.phase === 'playing') Snd.startMusic();
    else Snd.stopMusic();
    render();
    hideConnBanner();
  } else if (m.t === 'chat') {
    S.st.chat = m.chat;
    if (m.chat && m.chat.length && (!S.st.lastChatN || m.chat.length > S.st.lastChatN)) Snd.chat();
    S.st.lastChatN = m.chat ? m.chat.length : 0;
    if (S.tab === 'chat') renderPanel();
  } else if (m.t === 'error') {
    toast(m.msg, true);
    Snd.error();
  } else if (m.t === 'kicked') {
    toast(m.msg, true);
    setTimeout(() => { location.href = '/'; }, 1200);
  }
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
  return location.origin + '/sequence?r=' + S.code; // no token — safe to share
}

/* ================= actions & sounds ================= */

function onMove(a) {
  S.lastMoveNo = a.moveNo || S.st.moveNo;
  if (!S.soundOn) return;
  if (a.type === 'place') { Snd.cardPlay(); setTimeout(Snd.chipPlace, 60); }
  else if (a.type === 'remove') Snd.chipRemove();
  else if (a.type === 'swap') Snd.deadSwap();
  else if (a.type === 'discard') Snd.cardSelect();
}

function onWin(team) {
  if (S.soundOn) Snd.win();
  confetti();
}

/* ================= render ================= */

function render() {
  renderHeader();
  const phase = S.st.phase;
  $('#lobbyView').classList.toggle('hidden', phase !== 'lobby');
  $('#gameView').classList.toggle('hidden', phase === 'lobby');
  if (phase === 'lobby') renderLobby();
  else renderGame();
  // header buttons that only make sense in a room
  $('#btnLeave').classList.toggle('hidden', !S.code);
  // board size depends on the visible layout — refit now (classList changes above
  // force layout, so clientWidth is already current). rAF alone would never fire
  // in a background tab.
  fitBoard();
  requestAnimationFrame(fitBoard); // belt & suspenders for font/layout settling
}

function renderHeader() {
  $('#btnSound').innerHTML = iconSVG(S.soundOn ? 'sound' : 'mute', 20);
}

function showPass(name) {
  S.passLock = true;
  $('#passName').textContent = name;
  $('#passOverlay').classList.remove('hidden');
  renderHand(); // hide the current hand until the next player confirms
}

function hidePass() {
  S.passLock = false;
  $('#passOverlay').classList.add('hidden');
  renderHand();
}

/* which hand is on screen: my own, or (hotseat) the current player's */
function currentHand() {
  const st = S.st;
  if (st.isLocal && st.localHands) return st.localHands[st.turn] || [];
  return st.hand || [];
}

function turnSeatName() {
  const st = S.st;
  const s = st.seats.find(x => x.id === st.turn);
  return s ? s.name : 'Player';
}

function teamColor(team) { return COLORS[team % COLORS.length]; }
function teamName(team) {
  const t = S.st.teams && S.st.teams[team];
  return t ? t.join(' & ') : TEAM_NAMES[team] + ' team';
}

/* ---------- lobby ---------- */

function teamPreview(st) {
  const n = st.seats.length;
  if (n < 2) return 'Waiting for one more player to start…';
  if (n % 2 === 0) {
    const t0 = st.seats.filter(s => s.team === 0).map(s => esc(s.name)).join(', ');
    const t1 = st.seats.filter(s => s.team === 1).map(s => esc(s.name)).join(', ');
    return `<span class="tp-dot" style="background:${teamColor(0)}"></span> ${t0 || '—'}
      &nbsp;&nbsp;<span class="tp-dot" style="background:${teamColor(1)}"></span> ${t1 || '—'}
      <br><span class="small">2 teams · first to <b>2</b> sequences wins</span>`;
  }
  return `${n} players · solo — first to <b>1</b> sequence wins`;
}

function renderLobby() {
  const st = S.st;
  const n = st.seats.length;
  $('#seatCount').textContent = n + '/6';

  // header + invite card depend on mode (online vs same-device)
  $('#lobbyTitle').textContent = st.isLocal ? 'Same device · Pass & play' : 'Invite a friend to join';
  $('#lobbySub').textContent = st.isLocal
    ? 'Take turns on this screen — pass the device between turns.'
    : 'Share the room code — friends enter it on their screen to join.';
  const actions = $('#inviteActions');
  if (st.isLocal) {
    actions.innerHTML = `<p class="pass-note">📱 <b>Pass &amp; play</b> — everyone sits together and takes turns on this device. Each player sees their own cards only during their turn.</p>`;
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
    // waiting row status
    const wRow = $('#waitingRow');
    wRow.classList.toggle('ready', n >= 2);
    $('#waitText').textContent = n >= 2 ? 'Ready to start!' : 'Waiting for friends to join…';
  }

  // teams preview
  $('#setupInfo').innerHTML = teamPreview(st);

  // player rows — grouped by team when playing teams
  const list = $('#playerList');
  list.innerHTML = '';
  const isTeams = n >= 2 && n % 2 === 0;
  if (isTeams) {
    [[0, 'tg-red', 'Team Red'], [1, 'tg-blue', 'Team Blue']].forEach(([ti, cls, label]) => {
      const members = st.seats.filter(s => s.team === ti);
      const g = document.createElement('div');
      g.className = 'team-group ' + cls;
      g.innerHTML = `<div class="tg-head">
          <span><span class="tg-dot" style="background:${teamColor(ti)}"></span>${label}</span>
          <span class="tg-count">${members.length}</span>
        </div>
        <div class="tg-members"></div>`;
      const body = g.querySelector('.tg-members');
      members.forEach(s => body.appendChild(playerRow(st, s)));
      list.appendChild(g);
    });
  } else {
    st.seats.forEach(s => list.appendChild(playerRow(st, s)));
  }

  // bind team switch / remove / skill buttons
  list.querySelectorAll('[data-switch]').forEach(b => {
    b.onclick = () => {
      const seat = st.seats.find(x => x.id === b.dataset.switch);
      wsSend({ t: 'setTeam', seatId: b.dataset.switch, team: seat.team === 0 ? 1 : 0 });
      Snd.click();
    };
  });
  list.querySelectorAll('[data-remove]').forEach(b => {
    b.onclick = () => wsSend({ t: 'removeSeat', seatId: b.dataset.remove });
  });
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
    const addPro = document.createElement('button');
    addPro.className = 'ghost add-bot-btn';
    addPro.innerHTML = iconSVG('bot', 16) + '&nbsp;+ Add bot';
    addPro.onclick = () => wsSend({ t: 'addBot', skill: 'pro' });
    const start = document.createElement('button');
    start.className = 'primary start-btn';
    start.innerHTML = iconSVG('play', 15) + '&nbsp;' + (n >= 2 ? 'Start game' : 'Start game');
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
  const n = st.seats.length;
  const row = document.createElement('div');
  row.className = 'prow';
  const color = s.team >= 0 ? teamColor(s.team) : COLORS[st.seats.indexOf(s) % COLORS.length];
  const initials = s.name.replace(/\s*\(bot\)\s*$/i, '').slice(0, 2).toUpperCase();
  const avatar = s.isBot
    ? `<span class="avatar bot-avatar" style="background:${color}">${iconSVG('bot', 18)}</span>`
    : `<span class="avatar" style="background:${color}">${esc(initials)}</span>`;
  let status = '';
  if (s.id === st.you) status += '<span class="you-tag">You</span>';
  if (s.id === st.hostId && !s.isBot) status += (status ? ' · ' : '') + '<span class="host-tag">Host</span>';
  if (s.isBot) status += (status ? ' · ' : '') + `<span class="bot-tag">${s.skill === 'chill' ? 'Chill bot' : 'Pro bot'}</span>`;
  if (s.autoPilot) status += (status ? ' · ' : '') + '<span class="afk-tag">Auto-pilot</span>';
  if (!status) status = s.connected ? 'Connected' : 'Offline';
  row.innerHTML = `${avatar}
    <span class="pinfo">
      <span class="pname">${esc(s.name)}</span>
      <span class="pstatus">${status}</span>
    </span>
    <span class="pmeta">
      ${s.isBot ? `<button class="skill-btn" data-seat="${s.id}" title="Toggle bot level">${s.skill === 'chill' ? '😴' : '🧠'}</button>` : ''}
      ${st.canSwitchTeams ? `<button class="team-switch" data-switch="${s.id}" title="Move to the other team">⇄ Team</button>` : ''}
      ${st.you === st.hostId && s.id !== st.hostId ? `<button class="x-btn" data-remove="${s.id}" title="Remove">✕</button>` : ''}
    </span>`;
  return row;
}

/* ---------- game ---------- */

function myTeam() {
  const me = S.st.seats.find(s => s.id === S.st.you);
  return me ? me.team : -1;
}

function renderGame() {
  const st = S.st;
  const myT = myTeam();

  // turn banner
  const banner = $('#turnBanner');
  if (st.phase === 'over') {
    banner.textContent = st.winner != null ? '🏆 ' + teamName(st.winner) + ' wins!' : 'Game over';
    banner.className = '';
  } else if (st.isLocal) {
    const cur = st.seats.find(s => s.id === st.turn);
    banner.textContent = '📱 ' + (cur ? cur.name : 'Player') + "'s turn — pass the device";
    banner.className = 'your';
  } else if (st.yourTurn) {
    banner.textContent = '⭐ Your turn — play a card';
    banner.className = 'your';
  } else {
    const cur = st.seats.find(s => s.id === st.turn);
    const nm = cur ? (cur.name || 'Player') : 'Player';
    banner.textContent = 'Waiting for ' + nm + '…';
    banner.className = '';
    banner.style.color = cur ? teamColor(cur.team) : '';
  }
  if (!st.yourTurn) banner.style.color = '';

  // team strip
  const strip = $('#teamStrip');
  strip.innerHTML = '';
  const teamCount = st.teamCount;
  for (let t = 0; t < teamCount; t++) {
    const pill = document.createElement('div');
    pill.className = 'team-pill';
    let dots = '';
    for (let i = 0; i < st.seqNeeded; i++) dots += `<i class="${i < st.seqCount[t] ? 'on' : ''}"></i>`;
    pill.innerHTML = `<span class="tdot" style="background:${teamColor(t)}"></span>
      <span>${esc(teamName(t))}</span>
      <span class="seq-dots">${dots}</span>
      <span class="muted small">${st.seqCount[t]}/${st.seqNeeded}</span>`;
    strip.appendChild(pill);
  }

  renderBoard();
  renderHand();
  renderFeed();
  renderPanel();
  renderWinner();

  // clear stale selection if my card vanished
  if (S.selUid && !currentHand().some(c => c.uid === S.selUid)) S.selUid = null;
}

function boardCellEl(i) {
  return document.querySelector(`.cell[data-i="${i}"]`);
}

function renderBoard() {
  const st = S.st;
  const board = $('#board');
  const frag = document.createDocumentFragment();
  const prevChips = S.prevChips;
  S.prevChips = st.board.map(c => (c.chip == null ? -1 : c.chip));
  for (let i = 0; i < 100; i++) {
    const c = st.board[i];
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.i = i;
    if (c.corner) {
      cell.classList.add('corner');
      cell.innerHTML = `<span class="star">★</span><span class="free-tag">FREE</span>`;
    } else {
      const rank = c.key.length === 2 ? c.key[0] : '10';
      const suit = c.key[c.key.length - 1];
      const red = RED_SUITS[suit];
      cell.classList.add(red ? 'red-suit' : 'black-suit');
      // classic card face: number top-left & bottom-right, small suit icon
      // top-right & bottom-left, big suit pip at the center — corners stay
      // visible under a chip
      cell.innerHTML = `
        <span class="c-center">${SUIT_SYM[suit]}</span>
        <span class="c-r tl">${rank}</span>
        <span class="c-s tr">${SUIT_SYM[suit]}</span>
        <span class="c-s bl">${SUIT_SYM[suit]}</span>
        <span class="c-r br">${rank}</span>`;
    }
    if (c.chip != null) {
      const chip = document.createElement('div');
      chip.className = 'chip' + (st.locked.includes(i) ? ' locked-chip' : '');
      // animate ONLY the token that just appeared (prevents all-tokens blink)
      if (prevChips && prevChips[i] !== c.chip) chip.classList.add('new-chip');
      chip.style.setProperty('--tc', teamColor(c.chip));
      cell.appendChild(chip);
    }
    frag.appendChild(cell);
  }
  board.innerHTML = '';
  board.appendChild(frag);

  // last-move effects: blink ONLY the moved token (exactly once per move),
  // and keep a golden ring on the last card played so everyone can read it
  const la = st.lastAction;
  if (la && la.cell != null) {
    const el = boardCellEl(la.cell);
    if (el) {
      if (la.type === 'place') {
        el.classList.add('last-cell');
        if (la.moveNo !== S.animatedMoveNo) {
          el.classList.add('pop');
          S.animatedMoveNo = la.moveNo;
        }
      } else if (la.type === 'remove' && la.moveNo !== S.animatedMoveNo) {
        el.classList.add('gone');
        S.animatedMoveNo = la.moveNo;
      }
    }
  }
  paintTargets();
  bindBoard();
}

function paintTargets() {
  const st = S.st;
  S.valid.clear();
  S.removables.clear();
  S.peekOpen = 0;
  S.peekRemove = 0;
  // clear any stale highlights first
  for (let i = 0; i < 100; i++) {
    const el = boardCellEl(i);
    if (el) el.classList.remove('target', 'remove-target', 'preview-open', 'preview-soft', 'preview-remove');
  }
  if (!S.selUid) return;
  const card = currentHand().find(c => c.uid === S.selUid);
  if (!card) return;
  const myT = myTeam();
  // on your turn the highlights are playable; off-turn they are a preview
  const canAct = st.phase === 'playing' && st.yourTurn;
  if (card.kind === 'n') {
    for (let i = 0; i < 100; i++) {
      const c = st.board[i];
      if (c.corner || c.key !== card.key) continue;
      const el = boardCellEl(i);
      if (c.chip === null) {
        if (canAct) { S.valid.add(i); }
        else if (el) { el.classList.add('preview-open'); S.peekOpen++; }
      } else if (!canAct && el) {
        // occupied match — still worth knowing where this card sits
        el.classList.add('preview-soft');
      }
    }
  } else if (card.kind === 'w2') {
    for (let i = 0; i < 100; i++) {
      const c = st.board[i];
      if (c.chip !== null || c.corner) continue;
      const el = boardCellEl(i);
      if (canAct) S.valid.add(i);
      else if (el) { el.classList.add('preview-open'); S.peekOpen++; }
    }
  } else {
    for (let i = 0; i < 100; i++) {
      const c = st.board[i];
      if (c.chip == null || c.chip === myT || st.locked.includes(i)) continue;
      const el = boardCellEl(i);
      if (canAct) S.removables.add(i);
      else if (el) { el.classList.add('preview-remove'); S.peekRemove++; }
    }
  }
  for (let i = 0; i < 100; i++) {
    const el = boardCellEl(i);
    if (!el) continue;
    el.classList.toggle('target', S.valid.has(i));
    el.classList.toggle('remove-target', S.removables.has(i));
  }
}

function bindBoard() {
  const board = $('#board');
  board.onclick = e => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const i = +cell.dataset.i;
    // off-turn: preview only — never place
    if (!(S.st.phase === 'playing' && S.st.yourTurn)) {
      if (cell.classList.contains('preview-open') || cell.classList.contains('preview-soft') || cell.classList.contains('preview-remove')) {
        toast('Not your turn — this is a preview. You can only place when it is your turn.', true);
      }
      return;
    }
    if (S.valid.has(i)) {
      wsSend({ t: 'play', uid: S.selUid, cell: i, as: S.st.isLocal ? S.st.turn : undefined });
      Snd.click();
      S.selUid = null;
      renderHand(); paintTargets();
    } else if (S.removables.has(i)) {
      wsSend({ t: 'playJack1', uid: S.selUid, cell: i, as: S.st.isLocal ? S.st.turn : undefined });
      Snd.click();
      S.selUid = null;
      renderHand(); paintTargets();
    }
  };
}

function renderHand() {
  const st = S.st;
  const myT = myTeam();
  const hand = $('#hand');
  hand.innerHTML = '';
  const hint = $('#handHint');
  const isMyTurn = st.yourTurn && st.phase === 'playing';
  const curHand = currentHand();

  // pass-device lock: keep the next player's cards hidden until they tap OK
  if (S.passLock) {
    hand.innerHTML = `<div class="hand-lock">${iconSVG('phone', 30)}<span>Cards hidden — pass the device to see them</span></div>`;
    hint.textContent = '🔒 ' + turnSeatName() + "'s cards are locked";
    return;
  }

  if (!curHand.length) {
    hint.textContent = st.phase === 'over' ? 'Game over' : (st.isLocal ? turnSeatName() + ' has no cards' : 'No cards');
    return;
  }

  let hintText = isMyTurn
    ? (st.isLocal ? '🎮 ' + turnSeatName() + "'s turn — tap a card, then a glowing space" : 'Your turn — tap a card, then a glowing space')
    : 'Waiting for your turn… (tap a card anytime to preview where it sits)';
  const selCard = curHand.find(c => c.uid === S.selUid);
  if (selCard) {
    if (!isMyTurn) {
      // off-turn peek: show where the card is, counts of what you could do
      hintText = '👀 Preview';
      if (selCard.kind === 'w1') hintText += ' — can remove ' + S.peekRemove + ' opponent chip' + (S.peekRemove === 1 ? '' : 's');
      else hintText += ' — ' + S.peekOpen + ' open spot' + (S.peekOpen === 1 ? '' : 's');
      hintText += ' (place on your turn)';
    } else if (selCard.kind === 'w1') {
      hintText = S.removables.size
        ? 'Tap a red-glowing opponent chip to remove it'
        : 'No chips to remove — tap “Discard” to throw the Jack away';
    } else if (S.valid.size === 0) {
      hintText = 'No open spaces — every match is covered!';
    } else {
      hintText = 'Tap a gold-glowing space to place your chip';
    }
  }
  hint.textContent = hintText;

  for (const c of curHand) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    const rank = c.key.length === 2 ? c.key[0] : '10';
    const suit = c.key[c.key.length - 1];
    const red = RED_SUITS[suit];

    if (c.kind === 'w2') {
      cardEl.classList.add('jack', 'two-eye', red ? 'red' : 'black');
      cardEl.innerHTML = `
        <span class="c-corner tl">J${SUIT_SYM[suit]}</span>
        <span class="c-corner br">J${SUIT_SYM[suit]}</span>
        <span class="c-face">
          <span class="c-suit-big">${SUIT_SYM[suit]}</span>
          <span class="c-pill">★ WILD</span>
        </span>
        <span class="c-ribbon">place anywhere</span>`;
    } else if (c.kind === 'w1') {
      cardEl.classList.add('jack', 'one-eye');
      cardEl.innerHTML = `
        <span class="c-corner tl">J${SUIT_SYM[suit]}</span>
        <span class="c-corner br">J${SUIT_SYM[suit]}</span>
        <span class="c-face">
          <span class="c-eye">${iconSVG('eye', 22)}</span>
          <span class="c-pill">REMOVE</span>
        </span>
        <span class="c-ribbon">✕ remove a chip</span>`;
    } else {
      if (red) cardEl.classList.add('red');
      cardEl.innerHTML = `<span class="c-rank">${rank}</span>
        <span class="c-big">${SUIT_SYM[suit]}</span>
        <span class="c-suit">${SUIT_SYM[suit]}</span>`;
    }

    if (c.dead) {
      cardEl.classList.add('dead-card');
      cardEl.innerHTML += `<span class="dead-tag">DEAD · swap</span>`;
    }
    if (c.uid === S.selUid) cardEl.classList.add('selected');
    if (isMyTurn && !c.dead) cardEl.classList.add('selectable');
    else if (!isMyTurn && st.phase === 'playing') cardEl.classList.add('peekable');

    cardEl.onclick = () => {
      if (st.phase !== 'playing') return;
      if (!isMyTurn) {
        // peek: select the card to see its board highlights — no placing
        Snd.cardSelect();
        S.selUid = (S.selUid === c.uid) ? null : c.uid;
        renderHand();
        paintTargets();
        return;
      }
      if (c.dead) {
        wsSend({ t: 'swap', uid: c.uid, as: S.st.isLocal ? S.st.turn : undefined });
        toast('Dead card traded for a new one.');
        return;
      }
      Snd.cardSelect();
      S.selUid = (S.selUid === c.uid) ? null : c.uid;
      renderHand();
      paintTargets();
      if (S.selUid && currentHand().find(x => x.uid === S.selUid).kind === 'w1' && S.removables.size === 0) {
        renderDiscardBar(true);
      } else {
        renderDiscardBar(false);
      }
    };
    hand.appendChild(cardEl);
  }

  // discard option for one-eyed jack with no targets
  if (selCard && selCard.kind === 'w1' && S.removables.size === 0 && isMyTurn) {
    renderDiscardBar(true);
  } else {
    renderDiscardBar(false);
  }
}

function renderDiscardBar(show) {
  let bar = $('#discardBar');
  if (!show) { if (bar) bar.remove(); return; }
  if (bar) return;
  bar = document.createElement('button');
  bar.id = 'discardBar';
  bar.className = 'ghost';
  bar.textContent = '🗑 Discard Jack (no chips to remove)';
  bar.style.cssText = 'display:block;margin:0 auto 4px;color:var(--muted)';
  bar.onclick = () => {
    wsSend({ t: 'playJack1', uid: S.selUid, cell: null, as: S.st.isLocal ? S.st.turn : undefined });
    S.selUid = null;
    renderHand(); paintTargets(); bar.remove();
  };
  $('#handHint').after(bar);
}

function renderFeed() {
  const feed = $('#feedStrip');
  feed.innerHTML = '';
  const logs = S.st.log;
  for (const l of logs.slice(-5)) {
    const item = document.createElement('div');
    item.className = 'feed-item' + (l.n === S.st.moveNo ? ' hot' : '');
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
    for (const s of S.st.seats) {
      const row = document.createElement('div');
      row.className = 'prow';
      const isTurn = S.st.phase === 'playing' && S.st.turn === s.id;
      const color = s.team >= 0 ? teamColor(s.team) : '#555';
      row.innerHTML = `<span class="dot" style="background:${color}"></span>
        <span class="pname">${esc(s.name)} ${isTurn ? '▶' : ''}</span>
        <span class="pmeta">
          ${s.id === S.st.you ? '<span class="tag you">You</span>' : ''}
          ${s.isBot ? `<span class="tag bot">${s.skill === 'chill' ? 'Chill' : 'Pro'}</span>` : ''}
          ${s.autoPilot ? '<span class="tag afk">Auto</span>' : ''}
          <span class="tag">${s.handCount} cards</span>
        </span>`;
      body.appendChild(row);
    }
  } else if (S.tab === 'moves') {
    const logs = S.st.log.slice(-40);
    if (!logs.length) { body.innerHTML = '<div class="muted small">No moves yet.</div>'; return; }
    for (const l of logs) {
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
  if (st.phase !== 'over' || st.winner == null) {
    ov.classList.add('hidden');
    bar.classList.add('hidden');
    return;
  }
  // game over: never leave the pass screen stuck — reveal everything
  if (S.passLock) hidePass();
  ov.classList.remove('hidden');
  const t = st.winner;
  const who = teamName(t);
  $('#winTitle').textContent = who + ' wins!';
  $('#winTitle').style.color = teamColor(t);
  $('#winSub').textContent = 'Close this to review the final board — then rematch or start a new room.';
  const isHost = S.st.you === S.st.hostId;
  const rematch = $('#btnRematch');
  rematch.classList.toggle('hidden', !isHost);
  rematch.onclick = () => { ov.classList.add('hidden'); wsSend({ t: 'rematch' }); };

  // ✕ → hide the popup so everyone can see how the winner did it
  $('#winClose').onclick = () => {
    ov.classList.add('hidden');
    bar.classList.remove('hidden');
    bar.innerHTML = `<span>${iconSVG('crown', 18)}&nbsp;${esc(who)} wins!</span>
      <span class="go-btns">
        <button id="goReopen" class="ghost small">${iconSVG('trophy', 14)}&nbsp;View result</button>
        ${isHost ? '<button id="goRematch" class="primary small">' + iconSVG('refresh', 14) + '&nbsp;Play again</button>' : ''}
      </span>`;
    $('#goReopen').onclick = () => { bar.classList.add('hidden'); ov.classList.remove('hidden'); };
    const gr = $('#goRematch');
    if (gr) gr.onclick = () => wsSend({ t: 'rematch' });
  };
}

/* ================= QR ================= */

function drawQR(canvasId, text) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const size = 168;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 180, 180);
    const cell = size / n;
    ctx.fillStyle = '#0b1020';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(6 + c * cell, 6 + r * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  } catch (e) { console.warn('QR failed', e); }
}

/* ================= copy / share ================= */

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

function confetti() {
  const colors = ['#f6c453', '#ff5b5b', '#4d9fff', '#34d399', '#c084fc'];
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div');
    el.className = 'confetti';
    el.style.left = Math.random() * 100 + 'vw';
    el.style.background = colors[i % colors.length];
    el.style.animationDuration = (2.2 + Math.random() * 2.2) + 's';
    el.style.animationDelay = (Math.random() * 0.8) + 's';
    el.style.transform = 'rotate(' + Math.random() * 360 + 'deg)';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5600);
  }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ================= board sizing ================= */

function fitBoard() {
  const wrap = $('#boardWrap');
  if (!wrap) return;
  const cs = getComputedStyle(document.documentElement);
  const gap = parseFloat(cs.getPropertyValue('--bgap')) || 3;
  const pad = parseFloat(cs.getPropertyValue('--bpad')) || 10;
  const border = 2;
  const w = Math.max(200, wrap.clientWidth - 2);
  // leave just enough room for banner + team strip + hand below the board
  const availH = Math.max(300, window.innerHeight - 230);
  const byW = Math.floor((w - 9 * gap - 2 * pad - border) / 10);
  const byH = Math.floor((availH - 9 * gap - 2 * pad - border) / 10);
  const cell = Math.max(22, Math.min(90, Math.min(byW, byH)));
  document.documentElement.style.setProperty('--cell', cell + 'px');
}

/* ================= wire up UI ================= */

function wire() {
  // first page: two ways to play
  $('#btnBots').onclick = () => { $('#botModal').classList.remove('hidden'); };
  $('#btnFriends').onclick = () => { $('#friendsModal').classList.remove('hidden'); };
  $('#diceName').onclick = () => { $('#modeName').value = guessName(); };
  $('#btnHome').onclick = leaveToMenu;

  // friends mode: same device vs different devices
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
  S.hsNames = ['Player 1', 'Player 2'];
  S.hsCount = 2;
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
  $('#passOk').onclick = () => { hidePass(); Snd.click(); };
  updateHsPreview();

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
      updateBotPreview();
    };
    bcRow.appendChild(b);
  }
  updateBotPreview();
  const setDiff = d => {
    S.botSkill = d;
    $('#diffPro').classList.toggle('on', d === 'pro');
    $('#diffChill').classList.toggle('on', d === 'chill');
  };
  $('#diffPro').onclick = () => setDiff('pro');
  $('#diffChill').onclick = () => setDiff('chill');
  $('#botStart').onclick = startWithBots;

  // lobby: copy room code / invite link (delegated — the actions area is rebuilt per render)
  $('#inviteActions').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'copyCode') {
      copyText(S.code || '').then(ok => toast(ok ? 'Room code ' + S.code + ' copied' : ''));
    } else if (b.dataset.act === 'copyLink') {
      copyText(cleanLink()).then(ok => toast(ok ? 'Link copied — send it to friends!' : 'Copy failed — select the link manually.'));
    }
  });

  // join a room by entering its code (first page)
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
  const TAB_NAMES = { players: 'Players', moves: 'Moves', chat: 'Chat' };
  document.querySelectorAll('.panel-tabs button').forEach(b => {
    b.title = TAB_NAMES[b.dataset.tab] || '';
    b.onclick = () => setTab(b.dataset.tab);
  });
  window.addEventListener('resize', fitBoard);
  window.addEventListener('orientationchange', () => setTimeout(fitBoard, 300));
}

/* ================= mini board art (first page) ================= */

function buildMiniBoard() {
  const board = $('#miniBoard');
  if (!board) return;
  const colors = ['#ff5b5b', '#4d9fff', '#34d399'];
  for (let i = 0; i < 100; i++) {
    const c = document.createElement('i');
    if (i === 0 || i === 9 || i === 90 || i === 99) {
      c.classList.add('corner');
    } else if (Math.random() < 0.24) {
      c.classList.add('chip');
      c.style.setProperty('--c', colors[Math.floor(Math.random() * colors.length)]);
    }
    board.appendChild(c);
  }
}

/* ================= boot ================= */

(function boot() {
  wire();
  buildMiniBoard();
  mountIcons();
  fitBoard();
  connect();
  // unlock audio on first interaction (browser autoplay policy)
  const unlock = () => { Snd.unlock(); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
})();
