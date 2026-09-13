'use strict';
/* Dumb Charades client smoke test (jsdom, mocked WebSocket).
   Usage: node test/ch-dom.js */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; console.log('  ✓', msg); }
  else { failed++; console.error('  ✗', msg); }
}

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'charades', 'index.html'), 'utf8')
  .replace(/<script src="vendor\/qrcode.js"><\/script>/, '')
  .replace(/<script src="icons.js"><\/script>/, '')
  .replace(/<script src="sound.js"><\/script>/, '')
  .replace(/<script src="app.js"><\/script>/, '');

const dom = new JSDOM(html, { url: 'http://localhost:8080/charades', runScripts: 'outside-only', pretendToBeVisual: true });
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
window.eval(strip(fs.readFileSync(path.join(__dirname, '..', 'public', 'charades', 'app.js'), 'utf8')));

const $ = s => document.querySelector(s);
function base(over = {}) {
  return Object.assign({
    t: 'state', code: 'ABCDEF', gameType: 'charades', phase: 'playing', you: 's1', hostId: 's1', isLocal: false,
    seats: [
      { id: 's1', name: 'Ana', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: 0 },
      { id: 's2', name: 'Ben', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: 0 },
      { id: 's3', name: 'Cid', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: 1 },
      { id: 's4', name: 'Dev', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: 1 },
    ],
    chat: [], moveNo: 0,
    phase: 'choose', round: 1, roundsTotal: 6, roundEndsAt: Date.now() + 20000,
    solo: false, teamCount: 2, teamNames: ['Team A', 'Team B'], teamIdx: 0,
    teams: [
      { name: 'Team A', members: ['Ana', 'Ben'] },
      { name: 'Team B', members: ['Cid', 'Dev'] },
    ],
    scores: [0, 0],
    actor: 's1', actorName: 'Ana', actorTeam: 0, isActor: true, canGuess: false,
    wordOptions: [
      { title: 'sholay', category: 'movie' },
      { title: 'chaiyya chaiyya', category: 'song' },
      { title: 'pk', category: 'movie' },
    ],
    word: null, category: null, revealed: false, correctBy: null,
    guesses: [], winnerTeam: null, lastAction: null,
  }, over);
}

let last;
function sent() { return MockWS.inst.sent[MockWS.inst.sent.length - 1]; }

// ===== mode messages carry the game type =====
MockWS.emit({ t: 'state', code: 'ABCDEF', gameType: 'charades', phase: 'lobby', you: 's1', hostId: 's1',
  seats: [{ id: 's1', name: 'Ana', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: 0 }],
  chat: [], moveNo: 0, isLocal: false, canSwitchTeams: false, rounds: 3 });
$('#btnSolo').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = sent();
ok(last && last.t === 'quickPlay' && last.game === 'charades' && last.bots === 0, 'solo sends quickPlay charades bots:0');
$('#btnFriends').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
$('#btnDevices').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = sent();
ok(last && last.t === 'create' && last.game === 'charades', 'create sends game:charades');
$('#btnFriends').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
$('#btnSame').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(!$('#hotseatModal').classList.contains('hidden'), 'party setup modal opens');
ok(document.querySelectorAll('.hs-name-row').length === 3, '3 name rows by default');
$('#hsStart').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = sent();
ok(last && last.t === 'localPlay' && last.game === 'charades' && Array.isArray(last.teams) && last.rounds === 3, 'localPlay sends game+teams+rounds');
$('#btnHome').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// ===== lobby =====
MockWS.emit({ t: 'state', code: 'ABCDEF', gameType: 'charades', phase: 'lobby', you: 's1', hostId: 's1',
  seats: [
    { id: 's1', name: 'Ana', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: 0 },
    { id: 's2', name: 'Ben', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: 1 },
  ], chat: [], moveNo: 0, isLocal: false, canSwitchTeams: true, rounds: 3 });
ok(!$('#lobbyView').classList.contains('hidden'), 'lobby renders');
ok($('#playerList').children.length === 2, 'both players listed');
ok($('#playerList').querySelectorAll('.team-pill').length === 2, 'team pills shown');
$('#playerList').querySelector('[data-switch]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = sent();
ok(last && last.t === 'setTeam', 'host can switch teams in lobby');

// ===== choose phase as actor (online) =====
MockWS.emit(base());
ok(!$('#gameView').classList.contains('hidden'), 'game view renders');
ok(document.querySelectorAll('.title-opt').length === 3, 'actor sees 3 title options');
ok(document.querySelector('.title-opt .to-cat').textContent.includes('MOVIE'), 'options show category chip');
ok($('#teamCards').children.length === 2, 'two team score cards');
ok($('#teamCards .team-card.active'), 'active team highlighted');
document.querySelectorAll('.title-opt')[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = sent();
ok(last && last.t === 'pickTitle' && last.idx === 1, 'picking sends pickTitle idx');

// ===== choose phase as non-actor =====
MockWS.emit(base({ isActor: false, actor: 's3', actorName: 'Cid' }));
ok(document.querySelectorAll('.title-opt').length === 0, 'non-actor sees no options');
ok($('#stageBody').textContent.includes('Cid'), 'non-actor sees who is choosing');

// ===== act phase as actor =====
MockWS.emit(base({ phase: 'act', word: 'sholay', category: 'movie', roundEndsAt: Date.now() + 60000, lastAction: { type: 'word', by: 's1', moveNo: 1 } }));
ok($('#stageBody').textContent.includes('SHOLAY'), 'actor sees the title');
ok($('#passBtn'), 'actor sees the Pass button');
$('#passBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(sent().t === 'chPass', 'pass sends chPass');

// ===== act phase as guesser (teammate) =====
MockWS.emit(base({ phase: 'act', word: null, category: null, isActor: false, actor: 's1', actorName: 'Ana',
  canGuess: true, roundEndsAt: Date.now() + 60000, lastAction: { type: 'word', by: 's1', moveNo: 2 } }));
ok(!$('#stageBody').textContent.includes('SHOLAY'), 'guesser does not see the title');
ok(!$('#guessRow').classList.contains('hidden'), 'teammate sees the guess input');
$('#guessInput').value = 'sholay';
$('#guessBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(sent().t === 'chGuess' && sent().text === 'sholay', 'guess sends chGuess');
ok($('#guessInput').value === '', 'guess input cleared');

// ===== opponent cannot guess (no input) =====
MockWS.emit(base({ phase: 'act', word: null, isActor: false, canGuess: false, actor: 's1', actorName: 'Ana',
  teamIdx: 1, actorTeam: 0, roundEndsAt: Date.now() + 60000 }));
ok($('#guessRow').classList.contains('hidden'), 'opponent team sees no guess input');

// ===== reveal phase =====
MockWS.emit(base({ phase: 'reveal', word: 'sholay', category: 'movie', revealed: true, correctBy: 's2',
  scores: [1, 0], guesses: [{ name: 'Ben', text: 'sholay', correct: true, at: Date.now() }],
  lastAction: { type: 'correct', by: 's2', team: 0, word: 'sholay', moveNo: 3 }, moveNo: 3 }));
ok($('#turnBanner').textContent.includes('got it'), 'banner announces the guesser');
ok($('#stageBody').textContent.includes('SHOLAY'), 'title revealed in stage');
ok($('#stageBody').textContent.includes('Team B'), 'next team preview shown');
ok($('#teamCards').textContent.includes('1'), 'score card shows +1');

// ===== party mode: gate → options → memorize → ready =====
MockWS.emit(base({ isLocal: true, local: true, phase: 'choose', you: 's1', hostId: 's1', roundEndsAt: Date.now() + 20000 }));
ok($('#stageBody').textContent.includes('Reveal the titles'), 'party mode shows reveal gate');
$('#revealBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(document.querySelectorAll('.title-opt').length === 3, 'gate reveals the options');
document.querySelectorAll('.title-opt')[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok($('#stageBody .mem-title') && $('#stageBody .mem-title').textContent.includes('SHOLAY'), 'memorize overlay shows chosen title');
ok(!sent().t || sent().t !== 'pickTitle', 'pickTitle NOT sent yet (memorize first)');
$('#readyBtn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = sent();
ok(last && last.t === 'pickTitle' && last.idx === 0 && last.as === 's1', 'ready sends pickTitle with actor seat');

// ===== party mode act: got-it buttons (pick confirmed by the server) =====
MockWS.emit(base({ isLocal: true, local: true, phase: 'act', word: 'sholay', category: 'movie',
  actor: 's1', actorTeam: 0, roundEndsAt: Date.now() + 60000,
  lastAction: { type: 'word', by: 's1', moveNo: 5 }, moveNo: 5 }));
ok($('#stageBody .mem-title') === null || $('#stageBody .mem-title') === undefined, 'no memorize re-show after ready');
ok(!$('#stageBody .stage-word') || $('#stageBody .stage-word').classList.contains('peek-word'), 'title hidden on the shared screen during party act');
ok(!!$('#peekBtn'), 'peek button available for the actor');
const la = document.querySelectorAll('.la-player');
ok(la.length === 1, 'one got-it button per teammate (Ben)');
la[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
last = sent();
ok(last && last.t === 'chGotIt' && last.by === 's2', 'tapping teammate sends chGotIt');
ok($('#stageBody .la-skip'), 'skip button shown in party act');

// ===== solo mode =====
MockWS.emit(base({ solo: true, teamCount: 1, teams: [{ name: 'You', members: ['Ana'] }], teamNames: ['You'],
  scores: [0], phase: 'act', word: 'pk', category: 'movie', actor: 's1', isActor: true, roundEndsAt: Date.now() + 60000 }));
ok($('#soloGot'), 'solo shows Got-it button');
$('#soloGot').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(sent().t === 'chGotIt', 'solo got-it sends chGotIt');

// ===== game over =====
MockWS.emit(base({ phase: 'over', winnerTeam: 0, scores: [4, 2], round: 6 }));
ok(!$('#winnerOverlay').classList.contains('hidden'), 'winner overlay shows');
ok($('#winTitle').textContent.includes('Team A'), 'team A announced winner');
ok($('#finalScores').children.length === 2, 'final scores list both teams');

// ===== chat tab =====
document.querySelector('.panel-tabs button[data-tab="chat"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
MockWS.emit({ t: 'chat', chat: [{ name: 'Ana', text: 'act well!', at: Date.now() }] });
ok($('#panelBody').textContent.includes('act well'), 'chat renders in panel');

console.log('\n' + (failed ? failed + ' FAILED, ' : '') + passed + ' passed');
process.exit(failed ? 1 : 0);
