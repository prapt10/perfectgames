'use strict';
/* Tambola client smoke test (jsdom, mocked WebSocket).
   Usage: node test/tb-dom.js */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'tambola', 'index.html'), 'utf8')
  .replace(/<script src="vendor\/qrcode.js"><\/script>/, '')
  .replace(/<script src="icons.js"><\/script>/, '')
  .replace(/<script src="sound.js"><\/script>/, '')
  .replace(/<script src="app.js"><\/script>/, '');

const dom = new JSDOM(html, { url: 'http://localhost:8080/tambola', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

class MockWS {
  constructor(url) { this.url = url; this.readyState = 1; this.sent = []; MockWS.inst = this; }
  send(o) { this.sent.push(JSON.parse(o)); }
  close() { this.readyState = 3; }
  static emit(obj) { const h = MockWS.inst.onmessage; if (h) h({ data: JSON.stringify(obj) }); }
}
window.WebSocket = MockWS;
window.AudioContext = class {
  createOscillator() { return { connect(){}, start(){}, stop(){}, frequency:{ setValueAtTime(){}, exponentialRampToValueAtTime(){} }, detune:{ value:0 } }; }
  createGain() { return { connect(){}, gain:{ setValueAtTime(){}, exponentialRampToValueAtTime(){} } }; }
  createBuffer() { return { getChannelData: () => new Float32Array(100) }; }
  createBufferSource() { return { connect(){}, start(){}, stop(){}, buffer: null, loop: false }; }
  createBiquadFilter() { return { connect(){}, type: '', frequency: { setValueAtTime(){}, exponentialRampToValueAtTime(){} }, Q: { value: 1 } }; }
  destination = {}; currentTime = 0; sampleRate = 44100; state = 'running'; resume(){}
};
window.qrcode = () => ({ addData(){}, make(){}, getModuleCount: () => 21, isDark: () => Math.random() < 0.5 });
window.navigator.clipboard = { writeText: () => Promise.resolve() };

const strip = s => s.replace(/^['"]use strict['"];\s*/, '');
window.eval(strip(fs.readFileSync(path.join(__dirname, '..', 'public', 'shared', 'sound.js'), 'utf8')) + '\nwindow.Snd = Snd;');
window.eval(strip(fs.readFileSync(path.join(__dirname, '..', 'public', 'shared', 'icons.js'), 'utf8')) + '\nwindow.iconSVG = iconSVG; window.mountIcons = mountIcons;');
window.eval(strip(fs.readFileSync(path.join(__dirname, '..', 'public', 'tambola', 'app.js'), 'utf8')));

const $ = s => document.querySelector(s);
let last;

// ---- a sample valid ticket for tests ----
const TICKET = [
  [1, 10, 20, 30, 40, null, null, null, null],
  [null, null, null, null, 45, 52, 60, 70, 80],
  [2, 11, 21, 31, 41, null, null, null, null],
];

function base(over = {}) {
  return Object.assign({
    t: 'state', code: 'ABCDEF', gameType: 'tambola', phase: 'playing', you: 's1', hostId: 's1', isLocal: false,
    seats: [
      { id: 's1', name: 'Ana', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1, ticketCount: 1, marks: 5, strikes: 0 },
      { id: 'b1', name: 'Nova (bot)', isBot: true, skill: 'pro', connected: true, autoPilot: false, team: -1, ticketCount: 1, marks: 3, strikes: 0 },
    ],
    chat: [], moveNo: 5,
    called: [1, 10, 20, 30, 40, 55], lastNumber: 55, nextCallAt: Date.now() + 4000, intervalMs: 4000,
    prizes: [], winner: null, log: [{ text: 'Number 55 called.', n: 5 }],
    tickets: [TICKET],
    canClaim: [{ prize: 'earlyFive', name: 'Early Five', ticketIdx: 0 }],
    allTickets: null, canClaimBySeat: null,
  }, over);
}

// ===== mode messages carry game type + settings =====
MockWS.emit({ t: 'state', code: 'ABCDEF', gameType: 'tambola', phase: 'lobby', you: 's1', hostId: 's1',
  seats: [{ id: 's1', name: 'Ana', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1, ticketCount: 1, marks: 0, strikes: 0 }],
  chat: [], moveNo: 0, isLocal: false });
$('#btnBots').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(!$('#botModal').classList.contains('hidden'), 'bot modal opens');
ok(document.querySelectorAll('#botModal #ticketRow button').length === 2, 'tickets-per-player picker shown');
ok(document.querySelectorAll('#botModal #speedRow button').length === 3, 'speed picker shown');
$('#botStart').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = MockWS.inst.sent[MockWS.inst.sent.length - 1];
ok(last && last.t === 'quickPlay' && last.game === 'tambola' && last.tickets === 1 && last.speed === 4000, 'quickPlay sends game+tickets+speed');
$('#btnFriends').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
$('#btnDevices').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = MockWS.inst.sent[MockWS.inst.sent.length - 1];
ok(last && last.t === 'create' && last.game === 'tambola', 'create sends game:tambola');
$('#btnFriends').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
$('#btnSame').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(!$('#hotseatModal').classList.contains('hidden'), 'party modal opens');
$('#hsStart').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = MockWS.inst.sent[MockWS.inst.sent.length - 1];
ok(last && last.t === 'localPlay' && last.game === 'tambola' && Array.isArray(last.names), 'localPlay sends game+names');
$('#btnHome').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// ===== lobby =====
MockWS.emit({ t: 'state', code: 'ABCDEF', gameType: 'tambola', phase: 'lobby', you: 's1', hostId: 's1',
  seats: [
    { id: 's1', name: 'Ana', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1, ticketCount: 1, marks: 0, strikes: 0 },
    { id: 's2', name: 'Ben', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1, ticketCount: 1, marks: 0, strikes: 0 },
  ], chat: [], moveNo: 0, isLocal: false });
ok(!$('#lobbyView').classList.contains('hidden'), 'lobby renders');
ok($('#playerList').children.length === 2, 'two players listed');

// ===== game: board + tickets + claim =====
MockWS.emit(base());
ok(!$('#gameView').classList.contains('hidden'), 'game view renders');
ok(document.querySelectorAll('#callBoard .cnum').length === 90, '90-number caller board');
ok(document.querySelectorAll('#callBoard .cnum.hit').length === 6, '6 numbers highlighted');
ok($('#callBoard .cnum.last').textContent === '55', 'last number highlighted');
ok(document.querySelectorAll('.ticket-card').length === 1, 'own ticket shown');
ok(document.querySelectorAll('.ticket-card .tcell').length === 27, 'ticket has 27 cells');
ok(document.querySelectorAll('.ticket-card .tcell.hit').length === 5, '5 marks struck on the ticket');
ok(document.querySelectorAll('.prize-chip').length === 5, '5 prize chips in the strip');
ok($('#prizeStrip .prize-chip.won') === null, 'no prizes won yet');
ok(!!$('.claim-btn'), 'claim button appears when eligible');
ok($('.claim-btn').textContent.includes('EARLY FIVE'), 'claim button says EARLY FIVE');
$('.claim-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = MockWS.inst.sent[MockWS.inst.sent.length - 1];
ok(last && last.t === 'tambolaClaim' && last.prize === 'earlyFive' && last.ticketIdx === 0, 'claim sends prize+ticketIdx');

// ===== prize won by someone =====
MockWS.emit(base({ prizes: [{ key: 'earlyFive', name: 'Early Five', by: 's1', byName: 'Ana', at: Date.now(), n: 6 }], canClaim: [] }));
ok($('#prizeStrip .prize-chip.won .pc-who').textContent === 'Ana', 'prize strip shows winner');
ok(!$('.claim-btn'), 'no claim button when the prize is gone');

// ===== party mode: all tickets + per-seat claims =====
const st2 = base({ isLocal: true, local: true,
  seats: [
    { id: 's1', name: 'Ana', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1, ticketCount: 1, marks: 5, strikes: 0 },
    { id: 's2', name: 'Ben', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1, ticketCount: 1, marks: 2, strikes: 0 },
  ],
  allTickets: {
    s1: [TICKET],
    s2: [[[3, 12, 22, 32, 42, null, null, null, null], [null, null, null, null, null, 53, 61, 71, 81], [4, 13, 23, 33, 43, null, null, null, null]]],
  },
  canClaimBySeat: { s1: [{ prize: 'earlyFive', name: 'Early Five', ticketIdx: 0 }], s2: [] } });
MockWS.emit(st2);
ok(document.querySelectorAll('.ticket-card').length === 2, 'party mode shows both players tickets');
const owners = [...document.querySelectorAll('.tc-owner')].map(e => e.textContent);
ok(owners.some(t => t.includes('Ana')) && owners.some(t => t.includes('Ben')), 'tickets labelled with player names');
ok(document.querySelectorAll('.claim-btn').length === 1, 'claim button on Ana\'s ticket only');

// ===== call now button (host) =====
$('#btnNext').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = MockWS.inst.sent[MockWS.inst.sent.length - 1];
ok(last && last.t === 'tambolaNext', 'host can call the next number');

// ===== winner overlay =====
MockWS.emit(base({ phase: 'over', winner: 's1', prizes: [
  { key: 'earlyFive', name: 'Early Five', by: 'b1', byName: 'Nova (bot)', at: Date.now(), n: 6 },
  { key: 'topLine', name: 'Top Line', by: 's1', byName: 'Ana', at: Date.now(), n: 7 },
  { key: 'fullHouse', name: 'Full House', by: 's1', byName: 'Ana', at: Date.now(), n: 8 },
] }));
ok(!$('#winnerOverlay').classList.contains('hidden'), 'winner overlay shows');
ok($('#winTitle').textContent.includes('Ana'), 'full house winner named');
ok($('#finalScores').children.length === 3, 'all prizes listed');

// ===== chat tab =====
document.querySelector('.panel-tabs button[data-tab="chat"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
MockWS.emit({ t: 'chat', chat: [{ name: 'Ana', text: 'housie!', at: Date.now() }] });
ok($('#panelBody').textContent.includes('housie'), 'chat renders');

console.log('\n' + (failed ? failed + ' FAILED, ' : '') + passed + ' passed');
process.exit(failed ? 1 : 0);
