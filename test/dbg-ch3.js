'use strict';
const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome/chrome-linux64/chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=420,840'],
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromelibs/usr/lib/x86_64-linux-gnu' },
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 840, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto('http://localhost:8080/charades', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 600));
  await page.click('#btnFriends');
  await new Promise(r => setTimeout(r, 300));
  await page.click('#btnSame');
  await new Promise(r => setTimeout(r, 300));
  await page.click('#hsStart');
  await new Promise(r => setTimeout(r, 1200));
  await page.click('#lobbyControls .start-btn');
  await new Promise(r => setTimeout(r, 1500));
  const dump = await page.evaluate(() => {
    const vis = id => { const el = document.getElementById(id); return el ? !el.classList.contains('hidden') : 'MISSING'; };
    return {
      game: vis('gameView'), lobby: vis('lobbyView'),
      banner: (document.getElementById('turnBanner') || {}).textContent,
      stage: (document.getElementById('stageBody') || {}).textContent.slice(0, 150),
      teamCards: (document.getElementById('teamCards') || {}).textContent.slice(0, 100),
      round: (document.getElementById('roundLabel') || {}).textContent,
      revealBtn: !!document.querySelector('#revealBtn'),
      body: document.body.innerText.slice(0, 260),
    };
  });
  console.log('AFTER START:', JSON.stringify(dump));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
