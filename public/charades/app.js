'use strict';
/* Perfect Games — Dumb Charades client (vanilla JS, no storage) */

const $ = s => document.querySelector(s);

const CAT_ICON = { movie: '🎬', song: '🎵' };
const TEAM_COLORS = ['#ff5b5b', '#4d9fff'];

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
  tab: 'teams',
  hsNames: [],
  hsTeams: [],
  hsCount: 3,
  rounds: 3,
  localPick: null,     // party mode: option chosen locally (memorize)
  pickSent: false,     // party mode: pickTitle sent, awaiting act confirmation
  ready: false,        // party mode: actor tapped "I'm ready"
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

function startSolo() {
  const msg = { t: 'quickPlay', game: 'charades', name: modeName(), token: S.token || makeToken(), bots: 0 };
  if (S.ws && S.ws.readyState === 1) wsSend(msg);
  else { S.pending = msg; toast('Connecting…'); }
}

function createRoomWithFriends() {
  $('#friendsModal').classList.add('hidden');
  const msg = { t: 'create', game: 'charades', name: modeName(), token: S.token || makeToken() };
  if (S.ws && S.ws.readyState === 1) wsSend(msg);
  else { S.pending = msg; toast('Connecting…'); }
}

function startHotseat() {
  while (S.hsNames.length < S.hsCount) S.hsNames.push('');
  S.hsNames.length = S.hsCount;
  const names = S.hsNames.map((n, i) => (n || '').trim() || 'Player ' + (i + 1));
  if (names.length < 2) { toast('Give at least 2 players a name.', true); return; }
  const teams = S.hsNames.map((n, i) => (S.hsTeams[i] === 1 ? 1 : 0));
  $('#hotseatModal').classList.add('hidden');
  const msg = { t: 'localPlay', game: 'charades', names, teams, rounds: S.rounds, token: S.token || makeToken() };
  if (S.ws && S.ws.readyState === 1) wsSend(msg);
  else { S.pending = msg; toast('Connecting…'); }
}

function buildHsNames() {
  while (S.hsNames.length < S.hsCount) S.hsNames.push('');
  S.hsNames.length = S.hsCount;
  while (S.hsTeams.length < S.hsCount) S.hsTeams.push(S.hsTeams.length % 2);
  const box = $('#hsNames');
  box.innerHTML = '';
  for (let i = 0; i < S.hsCount; i++) {
    const row = document.createElement('div');
    row.className = 'hs-name-row';
    const num = document.createElement('span');
    num.className = 'hs-num';
    num.textContent = i + 1;
    const inp = document.createElement('input');
    inp.maxLength = 16;
    inp.placeholder = 'Player ' + (i + 1);
    inp.value = S.hsNames[i] || 'Player ' + (i + 1);
    inp.addEventListener('input', () => { S.hsNames[i] = inp.value; updateHsTeams(); });
    const tb = document.createElement('button');
    tb.className = 'hs-team';
    tb.dataset.i = i;
    tb.onclick = () => {
      S.hsTeams[i] = S.hsTeams[i] === 1 ? 0 : 1;
      updateHsTeams();
      Snd.click();
    };
    row.append(num, inp, tb);
    box.appendChild(row);
  }
  updateHsTeams();
}

function updateHsTeams() {
  document.querySelectorAll('.hs-team').forEach(b => {
    const i = +b.dataset.i;
    const t = S.hsTeams[i] === 1 ? 1 : 0;
    b.textContent = 'Team ' + (t === 0 ? 'A' : 'B');
    b.style.setProperty('--tc', TEAM_COLORS[t]);
    b.classList.toggle('on', t === 1);
  });
}

function leaveToMenu() {
  try { S.ws.close(); } catch (e) { /* noop */ }
  S.code = null; S.seatId = null; S.st = null; S.pending = null; S.localPick = null; S.pickSent = false; S.ready = false;
  history.replaceState(null, '', location.pathname);
  ['modeView', 'lobbyView', 'gameView', 'winnerOverlay', 'gameOverBar',
   'friendsModal', 'hotseatModal', 'joinModal']
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
  return location.origin + '/charades?r=' + S.code;
}

/* ================= handle messages ================= */

function handle(m) {
  if (m.t === 'state') {
    const prev = S.st;
    S.st = m;
    S.code = m.code;
    if (!S.token) S.token = makeToken();
    syncUrl();
    ['modeView', 'friendsModal', 'hotseatModal'].forEach(id => $('#' + id).classList.add('hidden'));
    if (prev && m.lastAction && m.lastAction.moveNo && m.lastAction.moveNo !== prev.moveNo) {
      if (m.lastAction.type === 'correct') Snd.sequence();
      else if (m.lastAction.type === 'timeout') Snd.error();
    }
    if (m.phase === 'act' && m.isActor && (!prev || !prev.isActor)) Snd.turnChime();
    // party mode memorize state on phase transitions
    if (prev && prev.phase !== m.phase) {
      if (prev.phase === 'choose' && m.phase === 'act') {
        if (S.pickSent || (S.localPick && m.word && m.word === S.localPick.title)) {
          // our pick confirmed — the actor is already ready
          S.localPick = null;
          S.pickSent = false;
        } else {
          // server auto-picked a different title — memorize that one
          S.localPick = null;
          S.pickSent = false;
          S.ready = false;
        }
      } else {
        S.localPick = null;
        S.pickSent = false;
        S.ready = false;
      }
    }
    render();
    hideConnBanner();
  } else if (m.t === 'chat') {
    if (S.st) { S.st.chat = m.chat; if (S.tab === 'chat') renderPanel(); }
  } else if (m.t === 'error') {
    toast(m.msg, true);
    Snd.error();
    // our pick was rejected (server already auto-picked) — show the real title
    if (S.localPick && S.st && S.st.phase === 'act') {
      S.localPick = null;
      S.ready = false;
      render();
    }
  } else if (m.t === 'kicked') {
    toast(m.msg, true);
    setTimeout(() => { location.href = '/'; }, 1200);
  }
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

function actorSeat() {
  return (S.st.seats || []).find(s => s.id === S.st.actor) || null;
}

function teamName(t) {
  if (S.st.solo) return 'You';
  return t === 1 ? 'Team B' : 'Team A';
}

/* ---------- lobby ---------- */

function renderLobby() {
  const st = S.st;
  const n = st.seats.length;
  $('#seatCount').textContent = n + '/6';
  $('#lobbyTitle').textContent = st.isLocal ? 'Same device · Party mode' : 'Invite a friend to join';
  $('#lobbySub').textContent = st.isLocal
    ? 'One phone, two teams — the actor peeks at the title, acts it out, teammates shout.'
    : 'Share the room code — friends enter it on their screen to join.';
  const actions = $('#inviteActions');
  if (st.isLocal) {
    actions.innerHTML = `<p class="pass-note">📱 <b>Party mode</b> — everyone sits together. Teams alternate; the actor secretly reads the title, then acts it out. Teammates shout guesses!</p>`;
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

  if (st.isLocal) {
    $('#setupInfo').innerHTML = `${n} players on this screen · ${st.rounds || 3} acts per team · teams are set in the setup screen`;
  } else {
    const teams = [[], []];
    st.seats.forEach(s => teams[(s.team === 1 ? 1 : 0)].push(s.name));
    $('#setupInfo').innerHTML = `2 teams · 3 acts each · host can move players between teams
      <br><span style="color:var(--red)">● ${esc(teams[0].join(', ') || '—')}</span>
      &nbsp; <span style="color:var(--blue)">● ${esc(teams[1].join(', ') || '—')}</span>`;
  }

  const list = $('#playerList');
  list.innerHTML = '';
  st.seats.forEach(s => list.appendChild(playerRow(st, s)));

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

  const ctrl = $('#lobbyControls');
  ctrl.innerHTML = '';
  if (st.you === st.hostId) {
    const start = document.createElement('button');
    start.className = 'primary start-btn';
    start.innerHTML = iconSVG('play', 15) + '&nbsp;Start game';
    start.disabled = n < 2;
    start.onclick = () => wsSend({ t: 'start' });
    ctrl.append(start);
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
  const initials = s.name.slice(0, 2).toUpperCase();
  const team = s.team === 1 ? 1 : 0;
  const avatar = `<span class="avatar" style="background:${TEAM_COLORS[team]}">${esc(initials)}</span>`;
  let status = '';
  if (s.id === st.you) status += '<span class="you-tag">You</span>';
  if (s.id === st.hostId && !s.isBot) status += (status ? ' · ' : '') + '<span class="host-tag">Host</span>';
  if (!status) status = s.connected ? 'Connected' : 'Offline';
  row.innerHTML = `${avatar}
    <span class="pinfo">
      <span class="pname">${esc(s.name)}</span>
      <span class="pstatus">${status}</span>
    </span>
    <span class="pmeta">
      <span class="team-pill" style="--tc:${TEAM_COLORS[team]}">Team ${team === 0 ? 'A' : 'B'}</span>
      ${st.canSwitchTeams && (st.you === st.hostId || s.id === st.you) ? `<button class="team-switch" data-switch="${s.id}" title="Move to the other team">⇄</button>` : ''}
      ${st.you === st.hostId && s.id !== st.hostId ? `<button class="x-btn" data-remove="${s.id}" title="Remove">✕</button>` : ''}
    </span>`;
  return row;
}

/* ---------- game ---------- */

function renderGame() {
  const st = S.st;
  $('#roundLabel').textContent = st.round + '/' + st.roundsTotal;

  const tEl = $('#dgTimer');
  tEl.classList.remove('warn');
  if (st.phase === 'over') { tEl.textContent = '0:00'; }
  else {
    const rem = Math.max(0, Math.ceil((st.roundEndsAt - Date.now()) / 1000));
    const mm = Math.floor(rem / 60), ss = rem % 60;
    tEl.textContent = mm + ':' + String(ss).padStart(2, '0');
    if (rem <= 15) tEl.classList.add('warn');
  }

  // guess row: online mode, teammates of the actor only
  $('#guessRow').classList.toggle('hidden', !(st.canGuess));

  renderBanner();
  renderTeamCards();
  renderStage();
  renderFeed();
  renderPanel();
  renderWinner();
}

function renderBanner() {
  const st = S.st;
  const banner = $('#turnBanner');
  const actor = actorSeat();
  const aname = actor ? actor.name : st.actorName;
  if (st.phase === 'choose') {
    if (st.isLocal) {
      banner.textContent = teamName(st.teamIdx) + "'s turn — pass the phone to your actor";
      banner.className = '';
    } else if (st.isActor) {
      banner.textContent = '🎭 You are the actor — pick a title!';
      banner.className = 'your';
    } else {
      banner.textContent = '🎭 ' + aname + ' is picking a title…';
      banner.className = '';
    }
  } else if (st.phase === 'act') {
    if (st.isActor || st.isLocal) {
      banner.textContent = st.isLocal ? '🤐 ' + aname + ' is acting — no talking!' : '🤐 Act it out — no talking, no pointing!';
      banner.className = 'your';
    } else {
      banner.textContent = '🤐 ' + aname + ' is acting — guess the title!';
      banner.className = '';
    }
  } else if (st.phase === 'reveal') {
    const who = st.correctBy ? (st.seats.find(s => s.id === st.correctBy) || {}).name || 'Someone' : null;
    banner.textContent = who
      ? '🎉 ' + who + ' got it! ' + teamName(st.teamIdx) + ' +1'
      : '⏰ Time’s up!';
    banner.className = who ? 'win-banner' : '';
  } else {
    banner.textContent = '';
    banner.className = '';
  }
}

function renderTeamCards() {
  const wrap = $('#teamCards');
  wrap.innerHTML = '';
  const st = S.st;
  if (st.solo) {
    const c = document.createElement('div');
    c.className = 'team-card solo active';
    c.innerHTML = `<div class="tc-top"><span class="tc-name">YOU</span><span class="tc-score">${st.scores[0] || 0}</span></div>
      <div class="tc-members">${esc((st.teams[0] || {}).members ? st.teams[0].members.join(', ') : 'You')}</div>`;
    wrap.appendChild(c);
    return;
  }
  for (let t = 0; t < 2; t++) {
    const c = document.createElement('div');
    c.className = 'team-card' + (st.teamIdx === t && st.phase !== 'over' ? ' active' : '');
    c.style.setProperty('--tc', TEAM_COLORS[t]);
    c.innerHTML = `<div class="tc-top"><span class="tc-name">${esc(teamName(t))}</span><span class="tc-score">${st.scores[t] || 0}</span></div>
      <div class="tc-members">${esc((st.teams[t] || {}).members ? st.teams[t].members.join(', ') : '')}</div>`;
    wrap.appendChild(c);
  }
}

function renderMemorize(body, title, category) {
  const mem = document.createElement('div');
  mem.className = 'memorize';
  mem.innerHTML = `<div class="mem-tag">${CAT_ICON[category] || '🎭'} ${category === 'song' ? 'SONG' : 'MOVIE'}</div>
    <div class="mem-title">${esc(title.toUpperCase())}</div>
    <div class="mem-sub">Memorize it — then hand the phone to the guessers!</div>
    <button id="readyBtn" class="primary big">I'm ready — start!</button>`;
  body.appendChild(mem);
  $('#readyBtn').onclick = () => {
    Snd.click();
    if (S.localPick) {
      wsSend({ t: 'pickTitle', idx: S.localPick.idx, as: S.st.actor });
      S.pickSent = true;
      S.localPick = null;
    }
    S.ready = true;
    renderStage();
  };
  // auto-hide after 12s
  if (!S._memTimer) {
    S._memTimer = setTimeout(() => { S._memTimer = null; if (!S.ready) { S.ready = true; renderStage(); } }, 12000);
  }
}

function renderStage() {
  const st = S.st;
  const body = $('#stageBody');
  body.innerHTML = '';
  const actor = actorSeat();
  const aname = actor ? actor.name : st.actorName;

  if (st.phase === 'choose') {
    if (st.isLocal) {
      // party mode: reveal gate so the actor can peek privately
      if (S.localPick) {
        // actor already chose — memorize before starting the clock
        renderMemorize(body, S.localPick.title, S.localPick.category);
        return;
      }
      const gate = document.createElement('div');
      gate.className = 'stage-center';
      gate.innerHTML = `<div class="stage-emoji">🎭</div>
        <div class="stage-title">${esc(teamName(st.teamIdx))}'s turn</div>
        <div class="stage-sub">${esc(aname)}, grab the phone and peek at the options</div>
        <button id="revealBtn" class="primary big">👀 Reveal the titles</button>`;
      body.appendChild(gate);
      $('#revealBtn').onclick = () => {
        Snd.click();
        body.innerHTML = '';
        renderOptions(body, true);
      };
      return;
    }
    if (st.isActor) {
      renderOptions(body, false);
    } else {
      body.innerHTML = `<div class="stage-center">
        <div class="stage-emoji">🎭</div>
        <div class="stage-title">${esc(aname)} is choosing…</div>
        <div class="stage-sub">The title stays secret until someone guesses it!</div>
      </div>`;
    }
    return;
  }

  if (st.phase === 'act') {
    const local = !!st.isLocal;
    const actorView = st.isActor || local;
    // memorize overlay (party mode): locally chosen title or the server's word
    const memPick = S.localPick && st.wordOptions && st.wordOptions[S.localPick.idx]
      ? st.wordOptions[S.localPick.idx]
      : null;
    const memTitle = memPick ? memPick.title : (st.word || '');
    const memCat = memPick ? memPick.category : st.category;
    if (local && memTitle && !S.ready) {
      renderMemorize(body, memTitle, memCat);
      return;
    }
    if (S._memTimer) { clearTimeout(S._memTimer); S._memTimer = null; }

    if (actorView) {
      // party mode: hide the title after memorizing (one shared screen!)
      const showWord = !local;
      body.innerHTML = `<div class="stage-center">
        <div class="stage-emoji">🤐</div>
        <div class="stage-title">Act it out!</div>
        <div class="stage-sub">No talking · no lip-syncing · no pointing at people or things in the room</div>
        ${showWord ? `<div class="stage-word">${esc((st.word || '???').toUpperCase())}</div>
        <div class="stage-hint">${CAT_ICON[st.category] || ''} ${st.category === 'song' ? 'Hindi Song' : 'Hindi Movie'}</div>` : ''}
        ${!showWord ? '<button id="peekBtn" class="ghost" style="margin-top:6px">👀 Peek at my title (3s)</button>' : ''}
        <div id="peekWord" class="stage-word peek-word hidden"></div>
        ${st.solo ? '<button id="soloGot" class="primary big" style="margin-top:14px">✅ Got it — I scored!</button>' : ''}
        ${!st.solo && !st.isLocal ? '<button id="passBtn" class="ghost" style="margin-top:12px">Pass (give up, no points)</button>' : ''}
      </div>`;
      if (st.solo) $('#soloGot').onclick = () => { wsSend({ t: 'chGotIt' }); Snd.sequence(); };
      if (!st.solo && !st.isLocal && $('#passBtn')) {
        $('#passBtn').onclick = () => { wsSend({ t: 'chPass' }); Snd.click(); };
      }
      const peek = $('#peekBtn');
      if (peek) {
        peek.onclick = () => {
          Snd.click();
          const pw = $('#peekWord');
          pw.textContent = (st.word || '???').toUpperCase();
          pw.classList.remove('hidden');
          setTimeout(() => pw.classList.add('hidden'), 3000);
        };
      }
    } else {
      body.innerHTML = `<div class="stage-center">
        <div class="stage-emoji">🤔</div>
        <div class="stage-title">${esc(aname)} is acting…</div>
        <div class="stage-sub">Watch closely and type your best guess below!</div>
      </div>`;
    }

    // party mode: whoever shouts the right title gets tapped
    if (local && !st.solo && !st.revealed) {
      const award = document.createElement('div');
      award.className = 'local-award';
      award.innerHTML = '<div class="la-title">🎉 Shouted the right title? Tap who got it:</div><div class="la-btns"></div>';
      const btns = award.querySelector('.la-btns');
      const teammates = (st.seats || []).filter(s => !s.isBot && s.team === st.actorTeam && s.id !== st.actor);
      teammates.forEach(s => {
        const b = document.createElement('button');
        b.className = 'la-player';
        b.textContent = '✅ ' + esc(s.name);
        b.onclick = () => { wsSend({ t: 'chGotIt', by: s.id }); Snd.sequence(); };
        btns.appendChild(b);
      });
      const skip = document.createElement('button');
      skip.className = 'la-skip';
      skip.textContent = '⏭ No one got it — skip';
      skip.onclick = () => { wsSend({ t: 'chPass' }); Snd.click(); };
      btns.appendChild(skip);
      body.appendChild(award);
    }
    return;
  }

  if (st.phase === 'reveal') {
    const who = st.correctBy ? (st.seats.find(s => s.id === st.correctBy) || {}).name || 'Someone' : null;
    const next = st.round >= st.roundsTotal ? 'Final scores coming up!' : 'Next: ' + teamName((st.teamIdx + 1) % st.teamCount);
    body.innerHTML = `<div class="stage-center reveal">
      <div class="stage-emoji">${who ? '🎉' : '⏰'}</div>
      <div class="stage-title">${who ? esc(who) + ' got it!' : 'Time’s up'}</div>
      <div class="stage-word">${esc((st.word || '???').toUpperCase())}</div>
      <div class="stage-hint">${CAT_ICON[st.category] || ''} ${st.category === 'song' ? 'Hindi Song' : 'Hindi Movie'}</div>
      <div class="stage-sub">${esc(next)}</div>
    </div>`;
    return;
  }

  body.innerHTML = `<div class="stage-center"><div class="stage-emoji">🏁</div><div class="stage-title">Game over</div></div>`;
}

function renderOptions(body, party) {
  const st = S.st;
  const opts = st.wordOptions || [];
  const grid = document.createElement('div');
  grid.className = 'opt-grid';
  opts.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'title-opt';
    b.innerHTML = `<span class="to-cat">${CAT_ICON[o.category] || ''} ${o.category === 'song' ? 'SONG' : 'MOVIE'}</span>
      <span class="to-title">${esc(o.title.toUpperCase())}</span>`;
    b.onclick = () => {
      Snd.click();
      if (party) {
        // local pick: memorize first, then send when ready
        S.localPick = { idx: i, title: o.title, category: o.category };
        S.ready = false;
        renderStage(); // shows memorize overlay with the chosen title
      } else {
        wsSend({ t: 'pickTitle', idx: i });
      }
    };
    grid.appendChild(b);
  });
  body.appendChild(grid);
}

function renderFeed() {
  const feed = $('#feedStrip');
  feed.innerHTML = '';
  const guesses = (S.st.guesses || []).slice(-5);
  if (!guesses.length) {
    feed.innerHTML = '<div class="feed-empty">Guesses will appear here — go on, guess!</div>';
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
  if (S.tab === 'teams') {
    const st = S.st;
    if (!st.teams || !st.teams.length) return;
    for (let t = 0; t < st.teams.length; t++) {
      const team = st.teams[t];
      const row = document.createElement('div');
      row.className = 'prow team-row';
      row.innerHTML = `<span class="team-pill" style="--tc:${TEAM_COLORS[t]}">${esc(teamName(t))}</span>
        <span class="pname">${esc((team.members || []).join(', ') || '—')}</span>
        <span class="pmeta"><b style="color:var(--gold2)">${st.scores[t] || 0}</b></span>`;
      body.appendChild(row);
    }
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
  const tie = st.winnerTeam === null || st.winnerTeam === undefined;
  const winName = tie ? 'It’s a tie!' : teamName(st.winnerTeam) + ' wins!';
  $('#winTitle').textContent = winName;
  $('#winTitle').style.color = tie ? 'var(--gold2)' : TEAM_COLORS[st.winnerTeam === 1 ? 1 : 0];
  $('#winSub').textContent = tie ? 'Evenly matched — rematch to settle it!' : 'Close this to review — then rematch or start a new room.';
  const isHost = S.st.you === S.st.hostId;
  const rematch = $('#btnRematch');
  rematch.classList.toggle('hidden', !isHost);
  rematch.onclick = () => { ov.classList.add('hidden'); wsSend({ t: 'rematch' }); };

  const fs = $('#finalScores');
  fs.innerHTML = '';
  if (st.solo) {
    fs.innerHTML = `<div class="fs-row champ"><span>🥇 You</span><b>${st.scores[0] || 0}</b></div>`;
  } else {
    for (let t = 0; t < 2; t++) {
      const row = document.createElement('div');
      row.className = 'fs-row' + (st.winnerTeam === t ? ' champ' : '');
      row.innerHTML = `<span style="color:${TEAM_COLORS[t]}">● ${esc(teamName(t))}</span><b>${st.scores[t] || 0}</b>`;
      fs.appendChild(row);
    }
  }

  $('#winClose').onclick = () => {
    ov.classList.add('hidden');
    bar.classList.remove('hidden');
    bar.innerHTML = `<span>${iconSVG('crown', 18)}&nbsp;${esc(winName)}</span>
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
  $('#btnSolo').onclick = startSolo;
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
  ['#friendsModal', '#hotseatModal'].forEach(sel => {
    document.querySelector(sel).addEventListener('click', e => {
      if (e.target === document.querySelector(sel)) document.querySelector(sel).classList.add('hidden');
    });
  });

  // party setup
  S.hsNames = ['Player 1', 'Player 2', 'Player 3'];
  S.hsTeams = [0, 1, 0];
  S.hsCount = 3;
  const hsRow = document.createElement('div');
  hsRow.className = 'bot-count';
  $('#hotseatModal .modal-card h2').after(hsRow);
  for (let n = 2; n <= 8; n++) {
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
  // rounds selector
  const rr = $('#roundsRow');
  for (const r of [2, 3, 5]) {
    const b = document.createElement('button');
    b.textContent = r;
    b.dataset.r = r;
    if (r === S.rounds) b.classList.add('on');
    b.onclick = () => {
      S.rounds = r;
      rr.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.r === r));
      Snd.click();
    };
    rr.appendChild(b);
  }
  $('#hsStart').onclick = startHotseat;

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

  const sendGuess = () => {
    const inp = $('#guessInput');
    const v = inp.value.trim();
    if (!v || !S.st || !S.st.canGuess) return;
    wsSend({ t: 'chGuess', text: v });
    inp.value = '';
    inp.focus();
  };
  $('#guessBtn').onclick = sendGuess;
  $('#guessInput').onkeydown = e => { if (e.key === 'Enter') sendGuess(); };

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

/* ================= boot ================= */

(function boot() {
  wire();
  mountIcons();
  connect();
  const unlock = () => { Snd.unlock(); document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
})();
