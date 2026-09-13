'use strict';
/* Debug: load /charades in real Chrome, start a party game, screenshot. */
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
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: '/home/user/perfectgames/test/shots/ch-1-mode.png' });

  // Party mode (same device)
  await page.click('#btnFriends');
  await new Promise(r => setTimeout(r, 300));
  await page.click('#btnSame');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: '/home/user/perfectgames/test/shots/ch-2-party-setup.png' });
  await page.click('#hsStart');
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: '/home/user/perfectgames/test/shots/ch-2b-lobby.png' });
  // party rooms go to the lobby first — host starts the game
  await page.click('#lobbyControls .start-btn');
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: '/home/user/perfectgames/test/shots/ch-3-choose.png' });

  const s1 = await page.evaluate(() => ({
    banner: document.getElementById('turnBanner').textContent,
    teamCards: document.getElementById('teamCards').textContent.slice(0, 120),
    stage: document.getElementById('stageBody').textContent.slice(0, 120),
    round: document.getElementById('roundLabel').textContent,
    timer: document.getElementById('dgTimer').textContent,
  }));
  console.log('CHOOSE:', JSON.stringify(s1));

  // reveal options → pick → memorize
  await page.click('#revealBtn');
  await new Promise(r => setTimeout(r, 300));
  const opts = await page.$$('.title-opt');
  console.log('options visible:', opts.length);
  if (opts.length) {
    await opts[0].click();
    await new Promise(r => setTimeout(r, 300));
    const s2 = await page.evaluate(() => ({
      memorize: document.getElementById('stageBody').textContent.slice(0, 120),
    }));
    console.log('MEMORIZE:', JSON.stringify(s2));
    await page.click('#readyBtn');
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: '/home/user/perfectgames/test/shots/ch-4-act.png' });
    const s3 = await page.evaluate(() => ({
      banner: document.getElementById('turnBanner').textContent,
      stage: document.getElementById('stageBody').textContent.slice(0, 200),
      awardBtns: document.querySelectorAll('.la-player').length,
      hasSkip: !!document.querySelector('.la-skip'),
    }));
    console.log('ACT:', JSON.stringify(s3));
  }

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
