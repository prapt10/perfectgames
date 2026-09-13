'use strict';
/* DOM-level smoke test of the client with a mocked WebSocket.
   Usage: node test/dom.js */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'sequence', 'index.html'), 'utf8')
  .replace(/<script src="vendor\/qrcode.js"><\/script>/, '')
  .replace(/<script src="icons.js"><\/script>/, '')
  .replace(/<script src="sound.js"><\/script>/, '')
  .replace(/<script src="app.js"><\/script>/, '');

const dom = new JSDOM(html, { url: 'http://localhost:8080/sequence', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

// ---- mocks ----
class MockWS {
  constructor(url) { this.url = url; this.readyState = 1; this.sent = []; MockWS.inst = this; }
  send(o) { this.sent.push(JSON.parse(o)); }
  close() { this.readyState = 3; }
  static emit(obj) { const h = MockWS.inst.onmessage; if (h) h({ data: JSON.stringify(obj) }); }
}
window.WebSocket = MockWS;
window.AudioContext = class { createOscillator() { return { connect(){}, start(){}, stop(){}, frequency:{ setValueAtTime(){}, exponentialRampToValueAtTime(){} } }; } createGain() { return { connect(){}, gain:{ setValueAtTime(){}, exponentialRampToValueAtTime(){} } }; } destination = {}; currentTime = 0; };
window.qrcode = () => ({ addData(){}, make(){}, getModuleCount: () => 21, isDark: () => Math.random() < 0.5 });
window.navigator.clipboard = { writeText: () => Promise.resolve() };

// load icons.js, sound.js and app.js in the window
const strip = s => s.replace(/^['"]use strict['"];\s*/, '');
window.eval(strip(fs.readFileSync(path.join(__dirname, '..', 'public', 'shared', 'sound.js'), 'utf8')) + '\nwindow.Snd = Snd;');
window.eval(strip(fs.readFileSync(path.join(__dirname, '..', 'public', 'shared', 'icons.js'), 'utf8')) + '\nwindow.iconSVG = iconSVG; window.mountIcons = mountIcons;');
const appSrc = strip(fs.readFileSync(path.join(__dirname, '..', 'public', 'sequence', 'app.js'), 'utf8'));
window.eval(appSrc);

function mkState(overrides = {}) {
  const board = [];
  const keys = ['AS','2H','3D','4C','5S','6H','7D','8C','9S','10H'];
  for (let i = 0; i < 100; i++) {
    const corner = i === 0 || i === 9 || i === 90 || i === 99;
    board.push({ key: corner ? null : keys[i % 10], chip: null, corner });
  }
  return Object.assign({
    t: 'state', code: 'ABCDEF', phase: 'playing', you: 's1', hostId: 's1',
    seats: [
      { id: 's1', name: 'Tester', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: 0, handCount: 6 },
      { id: 'b1', name: 'Nova (bot)', isBot: true, skill: 'pro', connected: true, autoPilot: false, team: 1, handCount: 6 },
    ],
    teams: [['Tester'], ['Nova (bot)']],
    seqNeeded: 2, seqCount: [0, 0], deckCount: 80, discardCount: 4, locked: [],
    board, turn: 's1', winner: null, lastAction: null, log: [], chat: [], moveNo: 1,
    hand: [
      { uid: 'c1', key: 'AS', kind: 'n', dead: false },
      { uid: 'c2', key: 'JH', kind: 'w2', dead: false },
      { uid: 'c3', key: 'JS', kind: 'w1', dead: false },
      { uid: 'c4', key: '3D', kind: 'n', dead: true },
    ],
    yourTurn: true,
  }, overrides);
}

console.log('DOM smoke tests');

// 0. first page (mode select)
ok(!document.querySelector('#modeView').classList.contains('hidden'), 'first page: mode view visible on load');
ok(!!document.querySelector('#btnBots') && !!document.querySelector('#btnFriends'), 'first page: both play modes present');
ok(document.querySelectorAll('#miniBoard i').length === 100, 'first page: mini board art rendered');

// 0c. join by room code (first page)
ok(!!document.querySelector('#joinCodeInput'), 'first page has room-code join input');
document.querySelector('#joinCodeInput').value = 'ABC123';
document.querySelector('#joinCodeBtn').click();
const jmsg = MockWS.inst.sent.find(s => s.t === 'join');
ok(!!jmsg && jmsg.room === 'ABC123', 'join with room code sent (' + (jmsg && jmsg.room) + ')');

// bot setup modal opens and quick-play message is sent
document.querySelector('#btnBots').click();
ok(!document.querySelector('#botModal').classList.contains('hidden'), 'bot setup modal opens');
document.querySelectorAll('#botCountRow button')[2].click(); // "3" bots
ok(document.querySelectorAll('#botCountRow button')[2].classList.contains('on'), 'bot count 3 selected');
document.querySelector('#botStart').click();
ok(document.querySelector('#botModal').classList.contains('hidden'), 'bot modal closes on start');
const qp = MockWS.inst.sent.find(s => s.t === 'quickPlay');
ok(!!qp && qp.bots === 3, 'quickPlay message sent with 3 bots');

// 0b. friends mode: two options, hotseat setup
document.querySelector('#btnFriends').click();
ok(!document.querySelector('#friendsModal').classList.contains('hidden'), 'friends modal opens');
ok(!!document.querySelector('#btnSame') && !!document.querySelector('#btnDevices'), 'same device + different devices options present');
document.querySelector('#btnSame').click();
ok(document.querySelector('#friendsModal').classList.contains('hidden') && !document.querySelector('#hotseatModal').classList.contains('hidden'), 'same device opens hotseat modal');
ok(document.querySelectorAll('#hsCountRow button').length === 5, 'hotseat player count 2..6');
document.querySelectorAll('#hsCountRow button')[1].click(); // 3 players
ok(document.querySelectorAll('#hsNames .hs-name-row').length === 3, '3 name rows generated');
const cyInput = document.querySelectorAll('#hsNames input')[2];
cyInput.value = 'Cy';
cyInput.dispatchEvent(new window.Event('input', { bubbles: true }));
document.querySelector('#hsStart').click();
const lp = MockWS.inst.sent.find(s => s.t === 'localPlay');
ok(!!lp && lp.names.length === 3 && lp.names[2] === 'Cy', 'localPlay sent with 3 player names');
document.querySelector('#btnHome').click(); // back to menu for next tests

// 1. lobby render (online)
MockWS.emit({ t: 'state', code: 'ABCDEF', phase: 'lobby', you: 's1', hostId: 's1', canSwitchTeams: false,
  seats: [{ id: 's1', name: 'Tester', isBot: false, connected: true, autoPilot: false, team: -1 }],
  teams: [], seqNeeded: null, seqCount: null, board: null, locked: [], hand: [], turn: null, winner: null, lastAction: null, log: [], chat: [], moveNo: 0 });
ok(document.querySelector('#modeView').classList.contains('hidden'), 'mode view hidden once in a room');
ok(!document.querySelector('#lobbyView').classList.contains('hidden'), 'lobby view visible');
ok(document.querySelector('#lobbyView .prow .pname').textContent.includes('Tester'), 'player listed in lobby');
ok(document.querySelector('#inviteLink').value.includes('ABCDEF'), 'lobby invite link shows the room');
ok(document.querySelector('#lobbyCodeBig').textContent === 'ABCDEF', 'lobby room code hero shown');
ok(!!document.querySelector('#inviteActions [data-act="copyCode"]'), 'lobby has copy-code button');
ok(!!document.querySelector('#inviteActions [data-act="copyLink"]'), 'lobby has copy-link button');

ok(document.querySelector('#setupInfo').textContent.includes('Waiting'), 'team preview shows waiting state for 1 player');
ok(document.querySelector('#waitText').textContent.includes('Waiting'), 'waiting row animates while room is not full');

// 1b. local (same-device) lobby: pass & play note + team preview + switching
MockWS.emit({ t: 'state', code: 'LOCAL1', phase: 'lobby', you: 'l1', hostId: 'l1', isLocal: true, canSwitchTeams: true,
  seats: [
    { id: 'l1', name: 'Ann', isBot: false, connected: true, autoPilot: false, team: 0 },
    { id: 'l2', name: 'Bob', isBot: false, connected: true, autoPilot: false, team: 0 },
    { id: 'l3', name: 'Cy', isBot: false, connected: true, autoPilot: false, team: 1 },
    { id: 'l4', name: 'Dee', isBot: false, connected: true, autoPilot: false, team: 1 },
  ],
  teams: [], seqNeeded: null, seqCount: null, board: null, locked: [], hand: [], turn: null, winner: null, lastAction: null, log: [], chat: [], moveNo: 0 });
ok(document.querySelector('#inviteCard').textContent.includes('Pass'), 'local lobby shows pass & play note (no link)');
ok(!document.querySelector('#inviteLink'), 'no invite link in local mode');
ok(document.querySelector('#setupInfo').textContent.includes('2 teams'), 'team preview shows 2 teams');
ok(document.querySelector('#setupInfo').textContent.includes('Ann'), 'team preview lists players');
ok(document.querySelectorAll('[data-switch]').length === 4, 'switch-team buttons for all 4 players');
document.querySelector('[data-switch="l3"]').click();
ok(MockWS.inst.sent.some(s => s.t === 'setTeam' && s.seatId === 'l3' && s.team === 0), 'setTeam sent when switching');
ok(document.querySelector('#lobbyTitle').textContent.includes('Same device'), 'lobby title reflects same-device mode');
ok(document.querySelectorAll('.team-group').length === 2, 'two team groups rendered (red + blue)');
ok(document.querySelectorAll('.tg-members .prow').length === 4, 'all 4 players shown inside team groups');

// 2. game render
MockWS.emit(mkState());
ok(document.querySelector('#gameView') && !document.querySelector('#gameView').classList.contains('hidden'), 'game view visible');
ok(document.querySelectorAll('#board .cell').length === 100, 'board has 100 cells');
ok(document.querySelectorAll('#board .cell.corner').length === 4, 'board has 4 free corners');
ok(document.querySelectorAll('#board .cell .c-r').length === 192, 'every card shows corner ranks (2 per card)');
ok(document.querySelectorAll('#board .cell .c-s').length === 192, 'every card shows corner suit icons (2 per card)');
ok(document.querySelectorAll('#board .cell .c-center').length === 96, 'every card shows a big center suit');
ok(document.querySelectorAll('#board .cell .corner').length === 0, 'no mini corner icons on cards');
ok(document.querySelectorAll('#board .cell.red-suit').length > 0 && document.querySelectorAll('#board .cell.black-suit').length > 0, 'suits are color-coded red/black');
ok(document.querySelectorAll('#hand .card').length === 4, 'hand shows 4 cards');
ok(document.querySelector('#hand .card.dead-card'), 'dead card is marked');
ok(document.querySelector('#turnBanner').classList.contains('your'), 'turn banner shows your turn');

// 2b. jack cards have the new redesigned UI
ok(!!document.querySelector('#hand .card.jack.two-eye .c-pill'), 'wild jack shows WILD pill');
ok(!!document.querySelector('#hand .card.jack.two-eye .c-corner.tl'), 'wild jack shows corner index');
ok(!!document.querySelector('#hand .card.jack.one-eye .c-pill'), 'remove jack shows REMOVE pill');
ok(!!document.querySelector('#hand .card.jack.one-eye .c-eye svg'), 'remove jack shows eye icon');
ok(!document.querySelector('#btnPanel'), 'chat FAB removed from bottom');

// 3. card selection highlights targets
const cardEls = [...document.querySelectorAll('#hand .card')];
cardEls[0].click(); // AS — matches cells 10..80 (i%10==0, corners 0 & 90 have no card)
ok(document.querySelectorAll('#board .cell.target').length === 8, 'AS highlights 8 matching open cells');
cardEls[0].click(); // deselect
ok(document.querySelectorAll('#board .cell.target').length === 0, 'deselect clears highlights');

// wild jack selection
cardEls[1].click(); // JH wild
ok(document.querySelectorAll('#board .cell.target').length === 96, 'wild jack highlights all 96 open cells');
cardEls[1].click();

// one-eyed jack selection
cardEls[2].click();
ok(document.querySelectorAll('#board .cell.remove-target').length === 0, 'no removable chips (empty board)');
ok(!!document.querySelector('#discardBar'), 'discard bar offered when nothing to remove');
document.querySelector('#discardBar').click();
const discardSent = MockWS.inst.sent.some(s => s.t === 'playJack1' && s.cell === null && s.uid === 'c3');
ok(discardSent, 'discard jack sent with cell=null');

// 4. play action via board click
MockWS.emit(mkState({ moveNo: 2 }));
const c1 = [...document.querySelectorAll('#hand .card')][0];
c1.click();
const target = document.querySelector('#board .cell.target');
target.click();
const playSent = MockWS.inst.sent.some(s => s.t === 'play' && s.uid === 'c1' && typeof s.cell === 'number');
ok(playSent, 'clicking a target cell sends play action');

// 5. chips render with team colors
const st5 = mkState({ moveNo: 3 });
st5.board[5].chip = 0;
st5.board[6].chip = 1;
st5.board[7].chip = 0;
MockWS.emit(st5);
const chips = document.querySelectorAll('#board .cell .chip');
ok(chips.length === 3, '3 chips rendered');
ok(chips[0].style.getPropertyValue('--tc') === '#ff5b5b', 'team 0 chip is red');

// 6. one-eyed jack removal targets
const st6 = mkState({ moveNo: 4 });
st6.board[6].chip = 1; // opponent chip
MockWS.emit(st6);
const cards6 = [...document.querySelectorAll('#hand .card')];
cards6[2].click(); // JS
ok(document.querySelectorAll('#board .cell.remove-target').length === 1, 'opponent chip highlighted for removal');
document.querySelector('#board .cell.remove-target').click();
ok(MockWS.inst.sent.some(s => s.t === 'playJack1' && s.cell === 6), 'removal sent with target cell');

// 7. winner overlay
const st7 = mkState({ moveNo: 5, phase: 'over', winner: 0, seqCount: [2, 0], yourTurn: false, turn: 's1' });
MockWS.emit(st7);
ok(!document.querySelector('#winnerOverlay').classList.contains('hidden'), 'winner overlay visible');
ok(document.querySelector('#winTitle').textContent.includes('Tester'), 'winner name shown');
ok(document.querySelector('#btnRematch').classList.contains('hidden') === false, 'rematch shown to host');
ok(!!document.querySelector('#winClose'), 'winner overlay has a close button');

// 7b. close the popup → game-over bar appears so the board can be reviewed
document.querySelector('#winClose').click();
ok(document.querySelector('#winnerOverlay').classList.contains('hidden'), 'winner overlay closes on ✕');
ok(!document.querySelector('#gameOverBar').classList.contains('hidden'), 'game-over bar appears');
ok(document.querySelector('#gameOverBar').textContent.includes('wins'), 'bar names the winner');
document.querySelector('#goReopen').click();
ok(!document.querySelector('#winnerOverlay').classList.contains('hidden'), 'overlay reopens from bar');
document.querySelector('#winClose').click();
ok(document.querySelector('#gameOverBar').classList.contains('hidden') === false, 'bar still visible after reopen+close');

// 7c. hotseat: hands switch with the turn
const stH = mkState({
  isLocal: true, moveNo: 6, turn: 's1', yourTurn: true, hand: [],
  seats: [
    { id: 's1', name: 'Ann', isBot: false, connected: true, autoPilot: false, team: 0, handCount: 6 },
    { id: 's2', name: 'Bob', isBot: false, connected: true, autoPilot: false, team: 1, handCount: 6 },
  ],
  teams: [['Ann'], ['Bob']],
  localHands: {
    s1: [{ uid: 'h1', key: 'AS', kind: 'n', dead: false }, { uid: 'h2', key: 'JH', kind: 'w2', dead: false }],
    s2: [{ uid: 'h3', key: 'KH', kind: 'n', dead: false }, { uid: 'h4', key: 'JS', kind: 'w1', dead: false }],
  },
});
MockWS.emit(stH);
ok(document.querySelectorAll('#hand .card').length === 2, 'hotseat shows current player hand (Ann, 2 cards)');
ok(document.querySelector('#turnBanner').textContent.includes('Ann'), 'hotseat banner shows Ann\'s turn');
// Bob's turn → pass overlay HOLDS, hand locked until OK
const stH2 = Object.assign({}, stH, { moveNo: 7, turn: 's2', localHands: stH.localHands });
MockWS.emit(stH2);
ok(document.querySelector('#turnBanner').textContent.includes('Bob'), 'hotseat banner shows Bob\'s turn');
ok(!document.querySelector('#passOverlay').classList.contains('hidden'), 'pass-the-device overlay shown');
ok(document.querySelector('#passName').textContent === 'Bob', 'overlay names the next player');
ok(!!document.querySelector('#passOk'), 'overlay has an OK button');
ok(document.querySelectorAll('#hand .card').length === 0, 'hand hidden while pass screen is up');
ok(!!document.querySelector('#hand .hand-lock'), 'lock placeholder shown in hand area');
// next player taps OK → overlay closes, their cards appear
document.querySelector('#passOk').click();
ok(document.querySelector('#passOverlay').classList.contains('hidden'), 'overlay hides after OK');
ok(document.querySelectorAll('#hand .card').length === 2, 'hand revealed with Bob\'s cards after OK');
const firstCard = document.querySelector('#hand .card');
ok(firstCard.textContent.includes('K') || firstCard.textContent.includes('J'), 'hand switched to Bob\'s cards (KH/JS visible)');

// 8. chat renders
MockWS.emit({ t: 'chat', chat: [{ name: 'Nova', text: 'gl hf', at: Date.now() }] });
// switch to chat tab
const tabs = [...document.querySelectorAll('.panel-tabs button')];
tabs.find(b => b.dataset.tab === 'chat').click();
ok(document.querySelector('.chat-log .msg .who').textContent === 'Nova', 'chat message rendered');

// 9. error toast
MockWS.emit({ t: 'error', msg: 'It is not your turn.' });
ok(document.querySelector('#toasts .toast.err'), 'error toast shown');

console.log(failed ? failed + ' FAILED / ' + passed + ' passed' : 'ALL ' + passed + ' DOM TESTS PASSED');
process.exit(failed ? 1 : 0);
