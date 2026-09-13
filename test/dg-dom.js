'use strict';
/* Draw & Guess client smoke test (jsdom, mocked WebSocket + canvas).
   Usage: node test/dg-dom.js */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'drawguess', 'index.html'), 'utf8')
  .replace(/<script src="vendor\/qrcode.js"><\/script>/, '')
  .replace(/<script src="icons.js"><\/script>/, '')
  .replace(/<script src="sound.js"><\/script>/, '')
  .replace(/<script src="app.js"><\/script>/, '');

const dom = new JSDOM(html, { url: 'http://localhost:8080/drawguess', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;

class MockWS {
  constructor(url) { this.url = url; this.readyState = 1; this.sent = []; MockWS.inst = this; }
  send(o) { this.sent.push(JSON.parse(o)); }
  close() { this.readyState = 3; }
  static emit(obj) { const h = MockWS.inst.onmessage; if (h) h({ data: JSON.stringify(obj) }); }
}
window.WebSocket = MockWS;

// canvas stub: records every stroke() call
window.__strokes = [];
const mockCtx = {
  setTransform() {}, fillRect() {}, clearRect() {},
  beginPath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {},
  stroke() { window.__strokes.push('stroke'); },
  fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
};
window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx; };
window.HTMLCanvasElement.prototype.setPointerCapture = function () {};
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
window.eval(strip(fs.readFileSync(path.join(__dirname, '..', 'public', 'drawguess', 'app.js'), 'utf8')));

function base(over = {}) {
  return Object.assign({
    t: 'state', code: 'ABCDEF', gameType: 'drawguess', phase: 'playing', you: 's1', hostId: 's1', isLocal: false,
    seats: [
      { id: 's1', name: 'Ana', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1 },
      { id: 's2', name: 'Ben', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1 },
      { id: 'b1', name: 'Nova (bot)', isBot: true, skill: 'pro', connected: true, autoPilot: false, team: -1 },
    ],
    chat: [], moveNo: 0,
    phase: 'choose', round: 1, roundsTotal: 3, roundEndsAt: Date.now() + 15000,
    drawer: 's1', drawerName: 'Ana', isDrawer: true, canGuess: false,
    wordOptions: ['cat', 'dog', 'kite'], word: null,
    strokes: [], guesses: [], scores: [
      { id: 's1', name: 'Ana', isBot: false, score: 0 },
      { id: 's2', name: 'Ben', isBot: false, score: 0 },
      { id: 'b1', name: 'Nova (bot)', isBot: true, score: 0 },
    ],
    winner: null, revealed: false, correctBy: null, local: false, lastAction: null,
  }, over);
}

const $ = s => document.querySelector(s);

// ===== game-type field must be sent with every room-creation message =====
MockWS.emit({ t: 'state', code: 'ABCDEF', gameType: 'drawguess', phase: 'lobby', you: 's1', hostId: 's1',
  seats: [{ id: 's1', name: 'Ana', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1 }],
  chat: [], moveNo: 0, isLocal: false, canSwitchTeams: false });
$('#btnBots').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(!$('#botModal').classList.contains('hidden'), 'bot modal opens');
$('#botStart').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
let sentMsg = MockWS.inst.sent[MockWS.inst.sent.length - 1];
ok(sentMsg && sentMsg.t === 'quickPlay' && sentMsg.game === 'drawguess', 'quickPlay sends game:drawguess');
$('#btnFriends').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
$('#btnDevices').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
sentMsg = MockWS.inst.sent[MockWS.inst.sent.length - 1];
ok(sentMsg && sentMsg.t === 'create' && sentMsg.game === 'drawguess', 'create sends game:drawguess');
$('#btnFriends').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
$('#btnSame').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
$('#hsStart').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
sentMsg = MockWS.inst.sent[MockWS.inst.sent.length - 1];
ok(sentMsg && sentMsg.t === 'localPlay' && sentMsg.game === 'drawguess', 'localPlay sends game:drawguess');
$('#btnHome').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// ===== lobby =====
MockWS.emit({ t: 'state', code: 'ABCDEF', gameType: 'drawguess', phase: 'lobby', you: 's1', hostId: 's1',
  seats: [
    { id: 's1', name: 'Ana', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1 },
    { id: 's2', name: 'Ben', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1 },
  ], chat: [], moveNo: 0, isLocal: false, canSwitchTeams: false });
ok(!$('#lobbyView').classList.contains('hidden'), 'lobby renders');
ok($('#playerList').children.length === 2, 'lobby lists both players');
ok($('#lobbyControls .start-btn') && !$('#lobbyControls .start-btn').disabled, 'start enabled with 2 players');

// ===== choose phase (drawer) =====
MockWS.emit(base());
ok(!$('#gameView').classList.contains('hidden'), 'game view renders');
const opts = document.querySelectorAll('.word-opt');
ok(opts.length === 3, 'drawer sees 3 word options');
ok($('#wordText').textContent.includes('Pick a word'), 'word bar asks to pick');
opts[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
let last = MockWS.inst.sent[MockWS.inst.sent.length - 1];
ok(last && last.t === 'pickWord' && last.idx === 1, 'picking a word sends pickWord idx=1');

// ===== draw phase as drawer =====
MockWS.emit(base({ phase: 'draw', roundEndsAt: Date.now() + 70000, word: 'dog', lastAction: { type: 'word', by: 's1', moveNo: 1 } }));
ok(!$('#toolbar').classList.contains('hidden'), 'drawer sees the toolbar');
ok($('#canvasLock').classList.contains('hidden'), 'no lock overlay for the drawer');
ok($('#wordBar').dataset.word === 'dog', 'drawer sees the secret word');
ok($('#guessRow').classList.contains('hidden'), 'drawer has no guess input');
const timerText = $('#dgTimer').textContent;
ok(/\d+:\d\d/.test(timerText), 'timer ticking (' + timerText + ')');

// ===== draw phase as guesser =====
MockWS.emit(base({ isDrawer: false, canGuess: true, phase: 'draw', word: null, drawer: 's2', drawerName: 'Ben' }));
ok($('#guessRow').classList.contains('hidden') === false, 'guesser sees the guess input');
ok($('#toolbar').classList.contains('hidden'), 'guesser has no toolbar');
ok(!$('#canvasLock').classList.contains('hidden'), 'guesser sees the watching overlay');
ok(!$('#wordBar').textContent.includes('dog'), 'guesser does NOT see the word');
$('#guessInput').value = 'a dog!';
$('#guessBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = MockWS.inst.sent[MockWS.inst.sent.length - 1];
ok(last && last.t === 'guess' && last.text === 'a dog!', 'submitting a guess sends it');
ok($('#guessInput').value === '', 'guess input cleared');

// ===== wrong guess in feed =====
MockWS.emit(base({ isDrawer: false, canGuess: true, phase: 'draw', word: null, drawer: 's2', drawerName: 'Ben',
  guesses: [{ name: 'Ana', text: 'cat', correct: false, at: Date.now() }] }));
ok($('#feedStrip').textContent.includes('cat'), 'wrong guess shows in the feed');

// ===== correct guess + reveal =====
MockWS.emit(base({ phase: 'reveal', word: 'dog', revealed: true, correctBy: 's1', canGuess: false,
  guesses: [{ name: 'Ana', text: 'dog', correct: true, at: Date.now() }],
  scores: [
    { id: 's1', name: 'Ana', isBot: false, score: 220 },
    { id: 's2', name: 'Ben', isBot: false, score: 0 },
    { id: 'b1', name: 'Nova (bot)', isBot: true, score: 0 },
  ],
  lastAction: { type: 'correct', by: 's1', word: 'dog', moveNo: 2 }, moveNo: 2 }));
ok($('#turnBanner').textContent.includes('got it'), 'banner announces who got it');
ok($('#wordBar').dataset.word === 'dog', 'word revealed to everyone');
ok($('#feedStrip .feed-item.correct'), 'correct guess highlighted in feed');
ok($('#scoreStrip').textContent.includes('220'), 'score strip shows the new score');

// ===== strokes arrive =====
const before = window.__strokes.length;
MockWS.emit({ t: 'dgStroke', id: 'st1', color: '#e03131', size: 5, pts: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }] });
ok(window.__strokes.length > before, 'incoming stroke redraws the canvas');
MockWS.emit({ t: 'dgStroke', id: 'st1', color: '#e03131', size: 5, pts: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }] });
ok(window.__strokes.length === before + 1, 'duplicate stroke id ignored');

// ===== local (party) mode =====
MockWS.emit(base({ isLocal: true, local: true, phase: 'draw', word: 'cat', canGuess: false, drawer: 's1',
  seats: [
    { id: 's1', name: 'Mum', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1 },
    { id: 's2', name: 'Dad', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1 },
    { id: 's3', name: 'Kid', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: -1 },
  ] }));
ok($('#localAward').classList.contains('hidden') === false, 'party mode shows award bar');
ok($('#wordBar').dataset.word === 'cat', 'party mode shows the word to everyone');
const awardBtns = document.querySelectorAll('.la-player');
ok(awardBtns.length === 2, 'one award button per non-drawer player');
awardBtns[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = MockWS.inst.sent[MockWS.inst.sent.length - 1];
ok(last && last.t === 'localGotIt' && last.by === 's3', 'tapping a player awards them');

// ===== game over =====
MockWS.emit(base({ phase: 'over', winner: 's2', word: 'dog',
  scores: [
    { id: 's1', name: 'Ana', isBot: false, score: 120 },
    { id: 's2', name: 'Ben', isBot: false, score: 340 },
    { id: 'b1', name: 'Nova (bot)', isBot: true, score: 80 },
  ] }));
ok(!$('#winnerOverlay').classList.contains('hidden'), 'winner overlay shows');
ok($('#winTitle').textContent.includes('Ben'), 'winner name announced');
ok($('#finalScores').children.length === 3, 'final scores list all players');

// ===== chat tab =====
document.querySelector('.panel-tabs button[data-tab="chat"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
MockWS.emit({ t: 'chat', chat: [{ name: 'Ana', text: 'hi', at: Date.now() }] });
ok($('#panelBody').textContent.includes('hi'), 'chat renders in panel');

console.log('\n' + (failed ? failed + ' FAILED, ' : '') + passed + ' passed');
process.exit(failed ? 1 : 0);
