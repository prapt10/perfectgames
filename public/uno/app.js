'use strict';
/* Perfect Games — UNO client (vanilla JS) */

const $ = s => document.querySelector(s);

const COLORS = ['R', 'Y', 'G', 'B'];
const COLOR_HEX = ['#e63946', '#f4a300', '#2a9d4c', '#2f6fdb'];
const COLOR_NAMES = ['Red', 'Yellow', 'Green', 'Blue'];
const VAL_LABEL = { S: 'SKIP', R: 'REV', D2: '+2', W: 'WILD', W4: '+4' };
const VAL_SYM = { S: '⊘', R: '⟲', D2: '+2', W: '★', W4: '+4' };

const S = {
  ws: null, code: null, seatId: null, name: null, token: null,
  st: null, retries: 0, tab: 'chat', pending: null,
  soundOn: true, botCount: 2, botSkill: 'pro',
  hsNames: ['Player 1', 'Player 2'], hsCount: 2,
  passLock: false, lastMoveNo: 0, pendingWild: null, // {uid} awaiting color choice
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
  wsSend({ t: 'quickPlay', game: 'uno', name: modeName(), token: S.token || makeToken(), bots: S.botCount, skill: S.botSkill });
}

function startHotseat() {
  while (S.hsNames.length < S.hsCount) S.hsNames.push('');
  S.hsNames.length = S.hsCount;
  const names = S.hsNames.map((n, i) => (n || '').trim() || 'Player ' + (i + 1));
  $('#hotseatModal').classList.add('hidden');
  wsSend({ t: 'localPlay', game: 'uno', names, token: S.token || makeToken() });
}

function leaveToMenu() {
  Snd.stopMusic();
  try { S.ws.close(); } catch (e) { /* noop */ }
  S.code = null; S.seatId = null; S.st = null; S.pending = null; S.passLock = false;
  S.pendingWild = null;
  history.replaceState(null, '', location.pathname);
  ['modeView', 'lobbyView', 'gameView', 'winnerOverlay', 'gameOverBar', 'friendsModal', 'hotseatModal', 'botModal', 'passOverlay', 'joinModal', 'colorModal']
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

function cleanLink() { return location.origin + '/uno?r=' + S.code; }

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
    // hotseat: HOLD the pass-the-device screen until the next player taps OK
    if (prev && m.isLocal && m.phase === 'playing' && prev.turn && prev.turn !== m.turn) {
      const nm = (m.unoSeats || []).find(s => s.id === m.turn);
      showPass(nm ? nm.name : 'Next player');
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
    setTimeout(() => { location.href = '/uno'; }, 1200);
  }
}

function onAction(a, prev) {
  if (!S.soundOn) return;
  if (a.type === 'play') {
    Snd.unoPlay();
    if (a.value === 'D2' || a.value === 'W4') setTimeout(Snd.unoPenalty, 260);
    // UNO call flash when a player drops to 1 card
    if (prev && prev.unoSeats) {
      const seat = prev.unoSeats.find(s => s.id === a.by);
      if (seat && seat.handCount === 2) {
        setTimeout(() => { flashUno(); Snd.unoCall(); }, 380);
      }
    }
  } else if (a.type === 'draw') {
    Snd.unoDraw();
  } else if (a.type === 'uno') {
    flashUno();
    Snd.unoCall();
  }
}

function onWin(winnerIdx) {
  if (S.soundOn) Snd.win();
  confetti();
}

function flashUno() {
  let el = $('#unoFlash');
  if (!el) {
    el = document.createElement('div');
    el.id = 'unoFlash';
    el.textContent = 'UNO!';
    document.body.appendChild(el);
  }
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  // mini card burst around the flash
  for (let i = 0; i < 10; i++) {
    const s = document.createElement('div');
    s.className = 'uno-burst';
    s.style.left = (48 + Math.random() * 4) + 'vw';
    s.style.top = (30 + Math.random() * 8) + 'vh';
    s.style.background = ['#e63946', '#f4a300', '#2a9d4c', '#2f6fdb'][i % 4];
    s.style.animationDelay = (Math.random() * 0.3) + 's';
    s.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    s.style.setProperty('--dy', (-90 - Math.random() * 110) + 'px');
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1100);
  }
  clearTimeout(S._unoFlashT);
  S._unoFlashT = setTimeout(() => el.classList.remove('show'), 1700);
}

function showPass(name) {
  S.passLock = true;
  $('#passName').textContent = name;
  $('#passOverlay').classList.remove('hidden');
  renderHand();
}

function hidePass() {
  S.passLock = false;
  $('#passOverlay').classList.add('hidden');
  renderHand();
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

function seatColor(i) { return COLOR_HEX[i % 4]; }

/* ---------- lobby ---------- */

function renderLobby() {
  const st = S.st;
  const n = st.seats.length;
  $('#seatCount').textContent = n + '/6';
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
        <span id="waitText">Waiting for friends to join…</span>
      </div>`;
    const wRow = $('#waitingRow');
    wRow.classList.toggle('ready', n >= 2);
    $('#waitText').textContent = n >= 2 ? 'Ready to start!' : 'Waiting for friends to join…';
  }

  $('#setupInfo').innerHTML = n < 2
    ? 'Waiting for one more player…'
    : `<span class="small">First player to empty their hand wins — and don't forget to call <b>UNO!</b></span>`;

  const list = $('#playerList');
  list.innerHTML = '';
  st.seats.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'prow';
    const col = seatColor(i);
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

function currentHand() {
  const st = S.st;
  if (st.isLocal && st.localHands) return st.localHands[st.turn] || [];
  return st.hand || [];
}

/* playable uids for the current player's hand (respects the drawn-card rule) */
function playableUids() {
  const st = S.st;
  const uids = new Set();
  if (!isMyTurn()) return uids;
  const cur = currentHand();
  if (st.drawnUid) { uids.add(st.drawnUid); return uids; }
  for (const c of cur) {
    if (c.color === null || c.color === st.currentColor || c.value === st.currentValue) uids.add(c.uid);
  }
  return uids;
}

/* play animation: card flies from the hand to the discard pile */
function animatePlayToDiscard(el) {
  const dc = $('#discardCard');
  if (!dc) return;
  const r = el.getBoundingClientRect();
  const dr = dc.getBoundingClientRect();
  const clone = el.cloneNode(true);
  clone.classList.remove('playable', 'just-drawn');
  clone.classList.add('fly-clone');
  document.body.appendChild(clone);
  clone.style.left = r.left + 'px';
  clone.style.top = r.top + 'px';
  clone.style.width = r.width + 'px';
  clone.style.height = r.height + 'px';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      clone.style.transform = 'translate(' +
        (dr.left + dr.width / 2 - r.left - r.width / 2) + 'px, ' +
        (dr.top + dr.height / 2 - r.top - r.height / 2) + 'px) scale(0.7) rotate(-6deg)';
      clone.style.opacity = '0.4';
    });
  });
  setTimeout(() => { clone.remove(); dc.classList.add('pile-pop'); setTimeout(() => dc.classList.remove('pile-pop'), 400); }, 480);
}

/* draw-card fly animation: card-back flies from the pile to the hand */
function animateDrawToHand() {
  const pile = $('#drawPile');
  const hand = $('#hand');
  if (!pile || !hand) return;
  const pr = pile.getBoundingClientRect();
  const hr = hand.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'draw-fly';
  document.body.appendChild(fly);
  fly.style.left = (pr.left + pr.width / 2) + 'px';
  fly.style.top = (pr.top + pr.height / 2) + 'px';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fly.style.transform = 'translate(' +
        (hr.left + hr.width / 2 - pr.left - pr.width / 2) + 'px, ' +
        (hr.top + hr.height / 2 - pr.top - pr.height / 2) + 'px) rotate(16deg) scale(0.55)';
      fly.style.opacity = '0';
    });
  });
  setTimeout(() => fly.remove(), 600);
}

function renderGame() {
  const st = S.st;
  const my = isMyTurn();

  // banner
  const banner = $('#turnBanner');
  if (st.phase === 'over') {
    const w = st.unoSeats && st.winner != null ? st.unoSeats[st.winner] : null;
    banner.textContent = '🏆 ' + (w ? w.name : 'Player') + ' wins!';
    banner.className = '';
  } else if (st.isLocal) {
    const cur = (st.unoSeats || []).find(s => s.id === st.turn);
    banner.textContent = '📱 ' + (cur ? cur.name : 'Player') + "'s turn — pass the device";
    banner.className = 'your';
  } else if (my) {
    banner.textContent = st.drawnUid ? '🎴 You drew — play the drawn card or pass' : '🎴 Your turn — play a matching card or draw';
    banner.className = 'your';
  } else {
    const cur = (st.unoSeats || []).find(s => s.id === st.turn);
    banner.textContent = 'Waiting for ' + (cur ? cur.name : 'Player') + '…';
    banner.className = '';
  }

  // player strip
  const strip = $('#playerStrip');
  strip.innerHTML = '';
  for (const s of (st.unoSeats || [])) {
    const pill = document.createElement('div');
    const idx = st.unoSeats.indexOf(s);
    pill.className = 'player-pill' + (st.turn === s.id && st.phase === 'playing' ? ' on' : '') + (s.handCount === 1 ? ' uno-call' : '');
    pill.style.setProperty('--pcolor', seatColor(idx));
    pill.innerHTML = `<span class="pdot"></span><span>${esc(s.name)}</span><span class="pcards">${s.handCount === 1 ? 'UNO!' : s.handCount + ' cards'}</span>`;
    strip.appendChild(pill);
  }

  renderTable();
  renderHand();
  renderFeed();
  renderPanel();
  renderWinner();
}

function renderTable() {
  const st = S.st;
  const my = isMyTurn();
  // discard top
  const dc = $('#discardCard');
  const top = st.discardTop;
  if (top) {
    dc.className = 'ucard top-card ' + (top.color ? 'c-' + top.color : 'c-wild');
    dc.innerHTML = cardInner(top, 'u-corner');
  }
  // discard pile pulse when it's your turn
  const dZone = $('#discardZone');
  dZone.classList.toggle('my-turn', my);
  // color ring
  const ring = $('#colorRing');
  if (st.currentColor) {
    ring.classList.add('on');
    ring.style.setProperty('--cc', COLOR_HEX[COLORS.indexOf(st.currentColor)]);
  } else {
    ring.classList.remove('on');
  }
  // deck count + draw button
  $('#deckCount').textContent = st.deckCount;
  const drawBtn = $('#btnDraw');
  const playable = playableUids();
  const hasPlayable = my && playable.size > 0;
  // Draw button rules:
  //  - after drawing a card  -> becomes PASS (always enabled so you can pass)
  //  - my turn, no playable   -> DRAW enabled (pulsing)
  //  - my turn, playable card -> DRAW disabled until you play it
  const canAct = my && st.phase === 'playing' && (!!st.drawnUid || !hasPlayable);
  drawBtn.disabled = !canAct;
  drawBtn.classList.toggle('pulse', canAct && !st.drawnUid);
  if (st.drawnUid) {
    drawBtn.textContent = 'Pass';
    drawBtn.title = 'Play the drawn card, or pass';
  } else if (my && hasPlayable) {
    drawBtn.textContent = 'Draw a card';
    drawBtn.title = 'You have a matching card — play it first';
  } else {
    drawBtn.textContent = 'Draw a card';
    drawBtn.title = canAct ? 'No matching cards — draw!' : '';
  }
  drawBtn.onclick = () => {
    if (!canAct) return;
    if (st.drawnUid) {
      Snd.click();
      wsSend({ t: 'pass', as: st.isLocal ? st.turn : undefined });
    } else {
      animateDrawToHand();
      Snd.unoDraw();
      wsSend({ t: 'draw', as: st.isLocal ? st.turn : undefined });
    }
  };
  // direction indicator in banner
  let dirTag = $('#dirTag');
  if (!dirTag) {
    dirTag = document.createElement('span');
    dirTag.id = 'dirTag';
    dirTag.className = 'dir-tag';
    $('#turnBanner').appendChild(dirTag);
  }
  dirTag.textContent = st.direction === 1 ? ' ↻' : ' ↺';
}

function cardInner(c, cornerCls) {
  const val = c.color ? (c.value.length <= 2 ? c.value : VAL_SYM[c.value] || c.value) : VAL_SYM[c.value];
  const label = c.color ? (VAL_LABEL[c.value] || '') : (c.value === 'W' ? 'WILD' : 'WILD +4');
  const corner = `<span class="${cornerCls} tl">${val}</span><span class="${cornerCls} br">${val}</span>`;
  return `${corner}<span class="u-val">${val}</span>${label ? `<span class="u-tag">${label}</span>` : ''}`;
}

function renderHand() {
  const st = S.st;
  const hand = $('#hand');
  const hint = $('#handHint');
  // detect newly drawn cards BEFORE clearing (pop animation)
  const prevUids = new Set();
  hand.querySelectorAll('.hcard').forEach(el => { if (el.dataset.uid) prevUids.add(el.dataset.uid); });
  hand.innerHTML = '';
  const my = isMyTurn();
  const cur = currentHand();

  if (S.passLock) {
    hand.innerHTML = `<div class="hand-lock">${iconSVG('phone', 30)}<span>Cards hidden — pass the device to see them</span></div>`;
    hint.textContent = '🔒 ' + ((st.unoSeats || []).find(s => s.id === st.turn)?.name || 'Player') + "'s cards are locked";
    return;
  }

  if (st.phase === 'over') { hint.textContent = 'Game over'; return; }
  if (!cur.length) { hint.textContent = 'No cards'; return; }

  const drawnUid = st.drawnUid;
  const playable = playableUids();

  hint.textContent = my
    ? (drawnUid
        ? '🎴 You drew a matching card — play it (or Pass)'
        : playable.size
          ? 'Tap a highlighted card to play it'
          : 'No matching cards — tap Draw!')
    : 'Waiting for your turn…';

  for (const c of cur) {
    const el = document.createElement('div');
    el.className = 'hcard ' + (c.color ? 'c-' + c.color : 'c-wild');
    el.dataset.uid = c.uid;
    el.innerHTML = cardInner(c, 'u-corner');
    if (!prevUids.has(c.uid)) el.classList.add('just-drawn');
    const canPlay = playable.has(c.uid);
    if (canPlay) el.classList.add('playable');
    if (!my) el.classList.add('locked');
    el.onclick = () => {
      if (!my) { toast('Wait for your turn.', true); Snd.error(); return; }
      if (!canPlay) { toast('That card does not match.', true); Snd.error(); return; }
      Snd.click();
      if (c.color === null) {
        // wild — ask for color FIRST (must pick to complete the play)
        S.pendingWild = c.uid;
        $('#colorModal').classList.remove('hidden');
        return;
      }
      // send the move immediately — animation is purely visual
      wsSend({ t: 'playCard', uid: c.uid, as: st.isLocal ? st.turn : undefined });
      try { animatePlayToDiscard(el); } catch (e) { /* animation must never block gameplay */ }
    };
    hand.appendChild(el);
  }

  // pass button after drawing
  if (drawnUid && my) {
    const p = document.createElement('button');
    p.className = 'ghost pass-btn';
    p.textContent = 'Pass';
    p.onclick = () => wsSend({ t: 'pass', as: st.isLocal ? st.turn : undefined });
    hand.appendChild(p);
  }
}

/* ---------- feed / panel / winner ---------- */

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
    for (const s of (S.st.unoSeats || [])) {
      const row = document.createElement('div');
      row.className = 'prow';
      row.innerHTML = `<span class="avatar" style="background:${seatColor(S.st.unoSeats.indexOf(s))};color:#fff">${esc(s.name.slice(0, 2).toUpperCase())}</span>
        <span class="pinfo"><span class="pname">${esc(s.name)} ${S.st.turn === s.id ? '▶' : ''}</span>
        <span class="pstatus">${s.handCount === 1 ? 'UNO! — 1 card left' : s.handCount + ' cards'}</span></span>`;
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
  if (S.passLock) hidePass();
  ov.classList.remove('hidden');
  const w = st.unoSeats[st.winner];
  const name = w ? w.name : 'Player';
  $('#winTitle').textContent = name + ' wins!';
  $('#winTitle').style.color = seatColor(st.winner);
  $('#winSub').textContent = name + ' emptied their hand — UNO! Close this to review the table.';
  const isHost = st.you === st.hostId;
  const rematch = $('#btnRematch');
  rematch.classList.toggle('hidden', !isHost);
  rematch.onclick = () => { ov.classList.add('hidden'); wsSend({ t: 'rematch' }); };
  $('#winClose').onclick = () => {
    ov.classList.add('hidden');
    bar.classList.remove('hidden');
    bar.innerHTML = `<span>🏆 ${esc(name)} wins!</span>
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
  const colors = ['#e63946', '#f4a300', '#2a9d4c', '#2f6fdb', '#f6c453', '#c084fc'];
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

function buildMini() {
  const board = $('#miniBoard');
  if (!board) return;
  // a few stacked uno cards
  const cards = [
    { c: 'R', v: '7' }, { c: 'Y', v: 'S' }, { c: 'G', v: '+2' }, { c: 'B', v: '3' }, { c: null, v: 'W' },
  ];
  for (const cd of cards) {
    const el = document.createElement('div');
    el.className = 'mini-card ' + (cd.c ? 'mc-' + cd.c : 'mc-wild');
    el.innerHTML = `<span>${cd.v}</span>`;
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
  $('#btnDevices').onclick = () => { $('#friendsModal').classList.add('hidden'); wsSend({ t: 'create', game: 'uno', name: modeName(), token: S.token || makeToken() }); };
  $('#friendsClose').onclick = () => $('#friendsModal').classList.add('hidden');
  $('#hotseatClose').onclick = () => $('#hotseatModal').classList.add('hidden');
  $('#botClose').onclick = () => $('#botModal').classList.add('hidden');
  ['#friendsModal', '#hotseatModal', '#botModal'].forEach(sel => {
    document.querySelector(sel).addEventListener('click', e => {
      if (e.target === document.querySelector(sel)) document.querySelector(sel).classList.add('hidden');
    });
  });
  // color chooser REQUIRES a choice — backdrop tap keeps it open (no stuck state)
  $('#colorModal').addEventListener('click', e => {
    if (e.target === $('#colorModal')) {
      toast('Pick a color to play the Wild card!');
      Snd.error();
    }
  });
  $('#colorModal').querySelectorAll('.cbtn').forEach(b => {
    b.onclick = () => {
      const color = b.dataset.color;
      const uid = S.pendingWild;
      S.pendingWild = null;
      $('#colorModal').classList.add('hidden');
      if (!uid) return;
      const st = S.st;
      wsSend({ t: 'playCard', uid, color, as: st.isLocal ? st.turn : undefined });
      Snd.click();
    };
  });

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
  $('#diffPro').onclick = () => { S.botSkill = 'pro'; $('#diffPro').classList.add('on'); $('#diffChill').classList.remove('on'); };
  $('#diffChill').onclick = () => { S.botSkill = 'chill'; $('#diffChill').classList.add('on'); $('#diffPro').classList.remove('on'); };
  $('#botStart').onclick = startWithBots;

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
  buildMini();
  mountIcons();
  connect();
  const unlock = () => { Snd.unlock(); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
})();
