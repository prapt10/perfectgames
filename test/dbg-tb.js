'use strict';
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome/chrome-linux64/chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=420,900'],
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromelibs/usr/lib/x86_64-linux-gnu' },
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 900, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8080/tambola', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: '/home/user/perfectgames/test/shots/tb-1-mode.png' });

  // bots game, fast speed, 2 bots, 2 tickets
  await page.click('#btnBots');
  await new Promise(r => setTimeout(r, 300));
  await page.click('#botModal #ticketRow button[data-n="2"]');
  await page.click('#botModal #speedRow button[data-s="fast"]');
  await new Promise(r => setTimeout(r, 200));
  await page.click('#botStart');
  await new Promise(r => setTimeout(r, 16000)); // let numbers roll
  await page.screenshot({ path: '/home/user/perfectgames/test/shots/tb-2-game.png' });

  const dump = await page.evaluate(() => {
    const vis = id => { const el = document.getElementById(id); return el ? !el.classList.contains('hidden') : 'MISSING'; };
    return {
      game: vis('gameView'),
      called: document.querySelectorAll('#callBoard .cnum.hit').length,
      last: (document.querySelector('#tbLast') || {}).textContent,
      tickets: document.querySelectorAll('.ticket-card').length,
      hitCells: document.querySelectorAll('.ticket-card .tcell.hit').length,
      prizeChips: document.querySelectorAll('.prize-chip').length,
      claimBtns: document.querySelectorAll('.claim-btn').length,
      prizeWon: document.querySelectorAll('.prize-chip.won').length,
      feed: (document.getElementById('feedStrip') || {}).textContent.slice(0, 120),
      body: document.body.innerText.slice(0, 200),
    };
  });
  console.log('GAME:', JSON.stringify(dump, null, 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
