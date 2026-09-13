'use strict';
/* Visual smoke test: screenshots of first page, bot setup, lobby, game (desktop + mobile). */
const puppeteer = require('puppeteer');

const GAME = 'http://localhost:8080/sequence';
const OUT = __dirname + '/shots/';

(async () => {
  const fs = require('fs');
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('  [page exception]', String(e).slice(0, 200)));

  // ---------- first page (mode select) ----------
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(GAME, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#modeView:not(.hidden)');
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: OUT + 'mode.png' });
  console.log('mode.png done');

  // ---------- bot setup modal ----------
  await page.click('#btnBots');
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: OUT + 'bot-modal.png' });
  console.log('bot-modal.png done');
  await page.click('#botStart');
  await page.waitForSelector('#gameView:not(.hidden)');
  await new Promise(r => setTimeout(r, 2500));
  await page.screenshot({ path: OUT + 'game-desktop.png' });
  console.log('game-desktop.png done (vs bots)');

  // ---------- friends flow: lobby + share ----------
  await page.click('#btnHome');
  await page.waitForSelector('#modeView:not(.hidden)');
  await new Promise(r => setTimeout(r, 300));
  await page.click('#btnFriends');
  await page.waitForSelector('#lobbyView:not(.hidden)');
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: OUT + 'lobby.png' });
  console.log('lobby.png done');
  await page.click('#btnShare');
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: OUT + 'share.png' });
  console.log('share.png done');
  await page.click('#btnShare');

  // ---------- mobile joins via link ----------
  const code = await page.evaluate(() => document.querySelector('#btnRoomCode').textContent);
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page2.goto(GAME + '?r=' + code, { waitUntil: 'domcontentloaded' });
  await page2.waitForSelector('#joinModal:not(.hidden)');
  await page2.type('#nameInput', 'Momo');
  await page2.click('#modalAction');
  await new Promise(r => setTimeout(r, 1200));
  await page2.screenshot({ path: OUT + 'game-mobile.png' });
  console.log('game-mobile.png done');

  await browser.close();
  console.log('ALL SHOTS DONE');
})().catch(e => { console.error('SHOT FAIL:', e); process.exit(1); });
