'use strict';
/* Geometry & style verification via headless Chrome (no eyeballs needed). */
const puppeteer = require('puppeteer');
const BASE = 'http://localhost:8080';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  let fails = 0;
  const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
  const errors = [];

  const newPage = async (w, h, mob) => {
    const p = await browser.newPage();
    p.on('pageerror', e => errors.push(String(e).slice(0, 160)));
    await p.setViewport({ width: w, height: h, isMobile: !!mob, hasTouch: !!mob });
    return p;
  };
  const overflow = p => p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  const noHOverflow = async (p, label) => {
    const o = await overflow(p);
    ok(o.sw <= o.iw, label + ': no horizontal overflow (' + o.sw + ' ≤ ' + o.iw + ')');
  };

  // ---------- hub ----------
  const hub = await newPage(1440, 900);
  await hub.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  ok(await hub.evaluate(() => document.querySelectorAll('.game').length) === 4, 'hub shows 4 game cards');
  ok(errors.length === 0, 'hub: no JS errors');
  await hub.close();

  // ---------- responsive audit across viewports ----------
  const VIEWPORTS = [
    { w: 390, h: 844, mob: true },
    { w: 768, h: 1024, mob: false },
    { w: 1440, h: 900, mob: false },
  ];
  for (const vp of VIEWPORTS) {
    const tag = vp.w + 'px';
    const p = await newPage(vp.w, vp.h, vp.mob);

    // first page
    await p.goto(BASE + '/sequence', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#modeView:not(.hidden)');
    await noHOverflow(p, tag + ' first page');
    ok(await p.evaluate(() => !!document.querySelector('.mode-title') && !!document.querySelector('#btnBots')), tag + ' first page content ok');

    // bot setup modal fits
    await p.evaluate(() => document.querySelector('#btnBots').click());
    await new Promise(r => setTimeout(r, 250));
    const bm = await p.evaluate(() => {
      const r = document.querySelector('#botModal .modal-card').getBoundingClientRect();
      return { w: Math.round(r.width), vw: innerWidth, visible: !document.querySelector('#botModal').classList.contains('hidden') };
    });
    ok(bm.visible && bm.w <= bm.vw, tag + ' bot modal fits (' + bm.w + ' ≤ ' + bm.vw + ')');
    await p.evaluate(() => document.querySelector('#botModal').classList.add('hidden'));

    // friends → different devices → lobby
    await p.type('#modeName', 'QA');
    await p.evaluate(() => document.querySelector('#btnFriends').click());
    await p.waitForSelector('#friendsModal:not(.hidden)');
    await p.evaluate(() => document.querySelector('#btnDevices').click());
    await p.waitForSelector('#lobbyView:not(.hidden)');
    await noHOverflow(p, tag + ' lobby');

    // lobby invite: link + copy, cards don't overlap
    const lb = await p.evaluate(() => {
      const link = document.querySelector('#inviteLink');
      const invite = document.querySelector('.invite-card').getBoundingClientRect();
      const players = document.querySelector('.players-card').getBoundingClientRect();
      return { linkOk: !!link.value && link.value.includes('r='),
        copyBtn: !!document.querySelector('#inviteActions [data-act="copyLink"]'),
        codeBtn: !!document.querySelector('#inviteActions [data-act="copyCode"]'),
        code: document.querySelector('#lobbyCodeBig').textContent,
        cardW: Math.round(document.querySelector('#inviteCard').getBoundingClientRect().width),
        wrapW: Math.round(document.querySelector('.lobby-wrap').getBoundingClientRect().width),
        noOverlap: players.top >= invite.bottom - 2 || players.left >= invite.right - 2,
        noQR: !document.querySelector('.qr-box'), noShareBtns: !document.querySelector('.share-btn') };
    });
    ok(lb.linkOk, tag + ' lobby shows invite link');
    ok(lb.copyBtn, tag + ' lobby has copy-link button');
    ok(lb.codeBtn, tag + ' lobby has copy-code button');
    ok(lb.code && lb.code.length === 6, tag + ' lobby shows room code');
    ok(lb.cardW >= lb.wrapW - 4, tag + ' invite card is full width (' + lb.cardW + ' ≈ ' + lb.wrapW + ')');
    ok(lb.noOverlap, tag + ' lobby cards do not overlap');
    ok(lb.noQR && lb.noShareBtns, tag + ' QR / share buttons removed');

    // game
    await p.evaluate(() => document.querySelector('#lobbyControls .ghost').click());
    await new Promise(r => setTimeout(r, 250));
    await p.evaluate(() => document.querySelector('#lobbyControls .primary').click());
    await p.waitForSelector('#gameView:not(.hidden)');
    await new Promise(r => setTimeout(r, 1400));
    await noHOverflow(p, tag + ' game');
    const geo = await p.evaluate(() => {
      const cell = getComputedStyle(document.documentElement).getPropertyValue('--cell');
      const board = document.querySelector('#board').getBoundingClientRect();
      const sample = document.querySelector('#board .cell:not(.corner)');
      return { cellPx: parseFloat(cell), boardW: Math.round(board.width), cells: document.querySelectorAll('#board .cell').length,
        cardFaces: document.querySelectorAll('#board .cell .card-face').length,
        miniCorners: document.querySelectorAll('#board .cell .corner').length,
        whiteFace: getComputedStyle(sample).backgroundImage.includes('linear-gradient') };
    });
    ok(geo.cells === 100, tag + ' board has 100 cells');
    ok(geo.cellPx >= 24 && geo.cellPx <= 92, tag + ' board cell size sane (' + geo.cellPx + 'px)');
    ok(geo.boardW <= vp.w - 10, tag + ' board fits width (' + geo.boardW + ' ≤ ' + (vp.w - 10) + ')');
    ok(geo.cardFaces === 96 && geo.miniCorners === 0, tag + ' cards show one centered face, no mini corners');
    ok(geo.whiteFace, tag + ' board cards have a white playing-card face');
    await p.close();
  }
  ok(errors.length === 0, 'no JS errors across all viewports (' + errors.length + ')');

  // ---------- multiplayer: desktop host + mobile friend ----------
  const pA = await newPage(1440, 900);
  await pA.goto(BASE + '/sequence', { waitUntil: 'domcontentloaded' });
  await pA.waitForSelector('#modeView:not(.hidden)');
  await pA.type('#modeName', 'QA');
  await pA.evaluate(() => document.querySelector('#btnFriends').click());
  await pA.waitForSelector('#friendsModal:not(.hidden)');
  await pA.evaluate(() => document.querySelector('#btnDevices').click());
  await pA.waitForSelector('#lobbyView:not(.hidden)');
  const code = await pA.evaluate(() => document.querySelector('#lobbyCodeBig').textContent);

  const pB = await newPage(390, 844, true);
  await pB.goto(BASE + '/sequence?r=' + code, { waitUntil: 'domcontentloaded' });
  await pB.waitForSelector('#joinModal:not(.hidden)');
  await pB.type('#nameInput', 'Momo');
  await pB.evaluate(() => document.querySelector('#modalAction').click());
  await pB.waitForSelector('#lobbyView:not(.hidden)');
  ok(true, 'mobile client joined the lobby via link');

  // wait until the host sees both players before touching controls
  await pA.waitForFunction(() => document.querySelectorAll('#playerList .prow').length >= 2, { timeout: 10000 });
  await pA.evaluate(() => document.querySelector('#lobbyControls .ghost').click());
  await new Promise(r => setTimeout(r, 250));
  await pA.waitForFunction(() => document.querySelectorAll('#playerList .prow').length >= 3, { timeout: 10000 });
  await pA.evaluate(() => document.querySelector('#lobbyControls .primary').click());
  await pA.waitForSelector('#gameView:not(.hidden)');
  await pB.waitForSelector('#gameView:not(.hidden)');
  await new Promise(r => setTimeout(r, 1400));

  const desk = await pA.evaluate(() => {
    const panel = document.querySelector('#sidePanel').getBoundingClientRect();
    const board = document.querySelector('#board').getBoundingClientRect();
    const cell = getComputedStyle(document.documentElement).getPropertyValue('--cell');
    return { panelLeft: Math.round(panel.left), boardRight: Math.round(board.right), cellPx: parseFloat(cell),
      headerHasShare: !!document.querySelector('#btnShare'),
      headerHasRules: !!document.querySelector('#btnRules'),
      headerHasCode: !!document.querySelector('#btnRoomCode') };
  });
  ok(!desk.headerHasShare && !desk.headerHasRules && !desk.headerHasCode, 'header: room code / share / help removed');
  ok(desk.cellPx >= 40 && desk.cellPx <= 92, 'desktop cell size sane (' + desk.cellPx + 'px)');
  ok(desk.panelLeft > desk.boardRight, 'side panel sits right of the board');

  const tryMove = pg => pg.evaluate(() => {
    const b = document.querySelector('#turnBanner');
    if (!b || !b.classList.contains('your')) return false;
    const card = [...document.querySelectorAll('#hand .card')].find(c => c.classList.contains('selectable'));
    if (!card) return false;
    card.click();
    const cell = document.querySelector('#board .cell.target');
    if (!cell) return false;
    cell.click();
    return true;
  });
  const m1 = await tryMove(pA);
  if (m1) console.log('  (QA moved)');
  await new Promise(r => setTimeout(r, 900));
  const m2 = await tryMove(pB);
  if (m2) console.log('  (Momo moved)');
  await new Promise(r => setTimeout(r, 3000));
  const chips = await pA.evaluate(() => document.querySelectorAll('#board .chip').length);
  ok(chips >= 1, 'chips on board after moves (' + chips + ' chips)');

  // hotseat modal fits on mobile
  await pB.evaluate(() => document.querySelector('#btnHome').click());
  await pB.waitForSelector('#modeView:not(.hidden)');
  await pB.evaluate(() => document.querySelector('#btnFriends').click());
  await pB.waitForSelector('#friendsModal:not(.hidden)');
  await pB.evaluate(() => document.querySelector('#btnSame').click());
  await pB.waitForSelector('#hotseatModal:not(.hidden)');
  const hs = await pB.evaluate(() => {
    const r = document.querySelector('#hotseatModal .modal-card').getBoundingClientRect();
    return { w: Math.round(r.width), vw: innerWidth, rows: document.querySelectorAll('#hsNames .hs-name-row').length,
      preview: document.querySelector('#hsTeamPreview').textContent.includes('2 teams') };
  });
  ok(hs.w <= hs.vw && hs.rows === 2, 'hotseat modal fits mobile (' + hs.w + ' ≤ ' + hs.vw + ', ' + hs.rows + ' rows)');
  ok(hs.preview, 'hotseat modal shows team preview');

  // start hotseat → local lobby → start game
  await pB.evaluate(() => document.querySelector('#hsStart').click());
  await pB.waitForSelector('#lobbyView:not(.hidden)');
  const localLobby = await pB.evaluate(() => ({
    passNote: document.querySelector('#inviteCard').textContent.includes('Pass'),
    noLink: !document.querySelector('#inviteLink'),
    title: document.querySelector('#lobbyTitle').textContent,
  }));
  ok(localLobby.passNote && localLobby.noLink && localLobby.title.includes('Same device'), 'local lobby shows pass & play (no invite link)');
  await pB.evaluate(() => document.querySelector('#lobbyControls .primary').click());
  await pB.waitForSelector('#gameView:not(.hidden)');

  // FAB removed + header icons aligned right
  await pB.evaluate(() => document.querySelector('#btnHome').click());
  await pB.waitForSelector('#modeView:not(.hidden)');
  const noFab = await pB.evaluate(() => !document.querySelector('#btnPanel'));
  ok(noFab, 'chat FAB removed from the bottom');

  // hotseat modal: on a short viewport the content scrolls (start button reachable)
  await pB.setViewport({ width: 390, height: 480, isMobile: true, hasTouch: true });
  await pB.evaluate(() => document.querySelector('#btnFriends').click());
  await pB.waitForSelector('#friendsModal:not(.hidden)');
  await pB.evaluate(() => document.querySelector('#btnSame').click());
  await pB.waitForSelector('#hotseatModal:not(.hidden)');
  await pB.evaluate(() => { document.querySelectorAll('#hsCountRow button')[4].click(); });
  await new Promise(r => setTimeout(r, 300));
  const scroll = await pB.evaluate(() => {
    const card = document.querySelector('#hotseatModal .modal-card');
    const start = document.querySelector('#hsStart');
    const startR = start.getBoundingClientRect();
    const cardR = card.getBoundingClientRect();
    return {
      rows: document.querySelectorAll('#hsNames .hs-name-row').length,
      overflowY: getComputedStyle(card).overflowY,
      scrollable: card.scrollHeight > card.clientHeight,
      startReachable: startR.bottom - cardR.top <= card.scrollHeight + 1, // inside the card's scrollable content
    };
  });
  ok(scroll.rows === 6, '6 player rows generated');
  ok(scroll.overflowY === 'auto' && scroll.scrollable, 'hotseat modal scrolls on short screens');
  ok(scroll.startReachable, 'start button reachable inside the scrollable card');
  await pB.evaluate(() => document.querySelector('#hotseatClose').click());
  await pB.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });

  // header icons on the right side (mobile + desktop)
  const hdr = await pB.evaluate(() => {
    const a = document.querySelector('.top-actions').getBoundingClientRect();
    return { right: Math.round(a.right), vw: innerWidth, count: document.querySelectorAll('.top-actions .icon-btn').length };
  });
  ok(hdr.right >= hdr.vw - 30 && hdr.count === 3, 'home/sound/leave icons right-aligned (' + hdr.right + ' ≈ ' + hdr.vw + ', ' + hdr.count + ' icons)');

  console.log(fails ? '\n' + fails + ' CHECKS FAILED' : '\nALL CHECKS PASSED');
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('VERIFY FAIL:', e); process.exit(1); });
