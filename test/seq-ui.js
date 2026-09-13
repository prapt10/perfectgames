'use strict';
/* UI test for the Sequence board revamp (v6):
   1. card corner indices render (readable under chips)
   2. chips are smaller + only NEW chips animate (no all-tokens blink)
   3. only the last moved token gets .pop; the last played card gets .last-cell
   4. off-turn card tap = preview highlights (preview-open / preview-soft / preview-remove), no placement
   5. on-turn tap = gold targets and placement works
   Usage: node test/seq-ui.js */
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
window.eval(strip(fs.readFileSync(path.join(__dirname, '..', 'public', 'sequence', 'app.js'), 'utf8')));

// ---- build a realistic playing state (mirrors server viewerState) ----
// board: non-corner cells get a cycling key; cell 12 = 7H, cell 13 = 7H (dup), etc.
function mkState(overrides = {}) {
  const board = [];
  const keys = ['AS','2H','3D','4C','5S','6H','7D','8C','9S','10H'];
  for (let i = 0; i < 100; i++) {
    const corner = i === 0 || i === 9 || i === 90 || i === 99;
    let key = corner ? null : keys[i % 10];
    if (i === 13) key = '7H';            // second copy of 7H (dup of cell 12's 6H? no—12 is 6H; use 7H at 13)
    if (i === 12) key = '7H';
    board.push({ key, chip: i === 12 ? 1 : null, corner }); // 7H at 12 covered by blue chip
  }
  return Object.assign({
    t: 'state', code: 'ABCDEF', phase: 'playing', you: 's1', hostId: 's1', isLocal: false,
    seats: [
      { id: 's1', name: 'Tester', isBot: false, skill: 'pro', connected: true, autoPilot: false, team: 0, handCount: 6 },
      { id: 'b1', name: 'Nova (bot)', isBot: true, skill: 'pro', connected: true, autoPilot: false, team: 1, handCount: 6 },
    ],
    teams: [['Tester'], ['Nova (bot)']],
    seqNeeded: 2, seqCount: [0, 0], deckCount: 80, discardCount: 4, locked: [],
    board, turn: 'b1', winner: null, lastAction: { type: 'place', by: 'b1', team: 1, cell: 12, cardKey: '7H', moveNo: 7 },
    log: [{ text: 'Nova played 7H.', n: 7 }], chat: [], moveNo: 7,
    hand: [
      { uid: 'c1', key: '7H', kind: 'n', dead: false },
      { uid: 'c2', key: 'AS', kind: 'n', dead: false },
      { uid: 'c3', key: 'JS', kind: 'w1', dead: false },
      { uid: 'c4', key: 'JH', kind: 'w2', dead: false },
      { uid: 'c5', key: '2H', kind: 'n', dead: false },
      { uid: 'c6', key: '3D', kind: 'n', dead: false },
    ],
  }, overrides);
}

const cell = i => document.querySelector(`.cell[data-i="${i}"]`);

// ================= 1) initial render (off-turn: bot's turn) =================
MockWS.emit(mkState());
const boardEl = document.getElementById('board');
ok(boardEl.children.length === 100, 'board renders 100 cells');
ok(cell(12).querySelector('.chip'), 'cell 12 has a chip');
ok(!!cell(12).querySelector('.c-r.tl') && !!cell(12).querySelector('.c-s.tr') && !!cell(12).querySelector('.c-s.bl') && !!cell(12).querySelector('.c-r.br'), 'cells have 4 corner marks (num TL+BR, suit TR+BL)');
ok(cell(12).querySelector('.c-r.tl').textContent === '7', 'top-left corner shows the rank');
ok(cell(12).querySelector('.c-r.br').textContent === '7', 'bottom-right corner mirrors the rank');
ok(cell(12).querySelector('.c-s.tr').textContent === '♥' && cell(12).querySelector('.c-s.bl').textContent === '♥', 'suit icons sit in top-right and bottom-left corners');
ok(cell(12).querySelector('.c-center').textContent === '♥', 'big suit icon at the center');
ok(cell(12).classList.contains('last-cell'), 'last played card has the persistent golden ring');
ok(cell(12).classList.contains('pop'), 'only the last moved token blinks (.pop)');
const chipCount = boardEl.querySelectorAll('.chip').length;
const newChipCount = boardEl.querySelectorAll('.chip.new-chip').length;
ok(newChipCount === 0, 'no all-tokens blink on render (no .new-chip storm)');
ok(chipCount === 1, 'exactly 1 chip on board');

// ================= 2) off-turn preview =================
const handCards = () => document.querySelectorAll('#hand .card');
const cards7H = [...handCards()].find(c => c.textContent.includes('7'));
cards7H.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(cell(13).classList.contains('preview-open'), 'off-turn tap: matching open cell shows preview-open');
ok(cell(12).classList.contains('preview-soft'), 'off-turn tap: covered matching cell shows preview-soft');
ok(!cell(13).classList.contains('target'), 'off-turn: no playable gold targets');
const hint = document.getElementById('handHint');
ok(/Preview/.test(hint.textContent), 'hint says preview off-turn');
// tapping a highlighted cell must NOT send a play
const sentBefore = MockWS.inst.sent.length;
cell(13).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(MockWS.inst.sent.length === sentBefore, 'board tap during preview sends nothing');
// deselect
cards7H.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(!cell(13).classList.contains('preview-open'), 'deselect clears preview');

// one-eyed jack preview
const jack1 = [...handCards()].find(c => c.textContent.includes('J') && c.classList.contains('one-eye'));
jack1.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(cell(12).classList.contains('preview-remove'), 'off-turn jack preview: opponent chip shows preview-remove');
ok(/can remove/.test(document.getElementById('handHint').textContent), 'jack preview hint shows removable count');
jack1.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

// ================= 3) on-turn =================
MockWS.emit(mkState({ turn: 's1', yourTurn: true, lastAction: { type: 'place', by: 'b1', team: 1, cell: 12, cardKey: '7H', moveNo: 7 } }));
const card7H2 = [...document.querySelectorAll('#hand .card')].find(c => c.textContent.includes('7'));
card7H2.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(cell(13).classList.contains('target'), 'on-turn tap: matching open cell shows gold target');
ok(cell(12).classList.contains('preview-soft') === false && !cell(12).classList.contains('target'), 'covered match is not a target on your turn');
cell(13).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const sent = MockWS.inst.sent[MockWS.inst.sent.length - 1];
ok(sent && sent.t === 'play' && sent.uid === 'c1' && sent.cell === 13, 'on-turn board tap sends play');

// ================= 4) fresh move: pop only on the moved token =================
MockWS.emit(mkState({
  turn: 's1', yourTurn: false, moveNo: 8,
  board: (() => { const b = mkState().board.map(c => ({ ...c })); b[13].chip = 1; b[13].locked = false; return b; })(),
  lastAction: { type: 'place', by: 'b1', team: 1, cell: 13, cardKey: '7H', moveNo: 8 },
}));
ok(cell(13).classList.contains('pop'), 'new move: only the newly placed token pops');
ok(cell(13).classList.contains('last-cell'), 'new move: golden ring moved to the newest card');
ok(!cell(12).classList.contains('pop') && !cell(12).classList.contains('last-cell'), 'older token: no blink, no ring');
ok(boardEl.querySelectorAll('.chip.new-chip').length === 1, 'exactly one new-chip animation (the moved token)');

// ================= 5) hotseat (isLocal) keeps yourTurn true while playing =================
MockWS.emit(mkState({ isLocal: true, turn: 's1', yourTurn: true, hand: mkState().hand.slice(0, 3), localHands: { s1: mkState().hand.slice(0, 3) } }));
const cardsL = document.querySelectorAll('#hand .card');
ok(cardsL.length === 3, 'hotseat: current player hand renders');
cardsL[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok(cell(13).classList.contains('target'), 'hotseat: tap shows gold targets (current player acts)');

console.log('\n' + (failed ? failed + ' FAILED, ' : '') + passed + ' passed');
process.exit(failed ? 1 : 0);
