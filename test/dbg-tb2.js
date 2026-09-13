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
  await new Promise(r => setTimeout(r, 600));
  await page.click('#btnBots');
  await new Promise(r => setTimeout(r, 300));
  await page.click('#botModal #ticketRow button[data-n="2"]');
  await page.click('#botModal #speedRow button[data-s="fast"]');
  await page.click('#botStart');
  // wait until a prize is claimed or 70s cap
  let claimed = false;
  for (let i = 0; i < 35 && !claimed; i++) {
    await new Promise(r => setTimeout(r, 2000));
    claimed = await page.evaluate(() => document.querySelectorAll('.prize-chip.won').length > 0);
  }
  const dump = await page.evaluate(() => ({
    called: document.querySelectorAll('#callBoard .cnum.hit').length,
    wonChips: [...document.querySelectorAll('.prize-chip.won .pc-name')].map(e => e.textContent),
    who: [...document.querySelectorAll('.prize-chip.won .pc-who')].map(e => e.textContent),
    feed: (document.getElementById('feedStrip') || {}).textContent.slice(-200),
    claimBtns: document.querySelectorAll('.claim-btn').length,
    myMarks: [...document.querySelectorAll('.ticket-card .tc-marks')].map(e => e.textContent),
  }));
  console.log('CLAIMS:', JSON.stringify(dump, null, 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
