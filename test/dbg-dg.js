'use strict';
/* Debug: load /drawguess in real Chrome, start a bots game, screenshot. */
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chrome/chrome-linux64/chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=420,820'],
    env: { ...process.env, LD_LIBRARY_PATH: '/tmp/chromelibs/usr/lib/x86_64-linux-gnu' },
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 820, isMobile: true, hasTouch: true });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:8080/drawguess', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: '/home/user/perfectgames/test/shots/dg-1-mode.png' });

  // click "Play with Bots"
  await page.click('#btnBots');
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: '/home/user/perfectgames/test/shots/dg-2-botmodal.png' });

  // click start game
  await page.click('#botStart');
  await new Promise(r => setTimeout(r, 1500));
  await page.screenshot({ path: '/home/user/perfectgames/test/shots/dg-3-choose.png' });

  // what's visible?
  const state = await page.evaluate(() => {
    const vis = id => {
      const el = document.getElementById(id);
      return el ? { hidden: el.classList.contains('hidden'), text: (el.textContent || '').slice(0, 80) } : null;
    };
    return {
      modeView: vis('modeView'), lobbyView: vis('lobbyView'), gameView: vis('gameView'),
      turnBanner: vis('turnBanner'), wordBar: vis('wordBar'), canvasWrap: vis('canvasWrap'),
      toolbar: vis('toolbar'), scoreStrip: vis('scoreStrip'),
      bodyText: document.body.innerText.slice(0, 300),
      canvasCount: document.querySelectorAll('canvas').length,
    };
  });
  console.log(JSON.stringify(state, null, 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');

  // pick a word if options visible
  const opts = await page.$$('.word-opt');
  if (opts.length) {
    await opts[0].click();
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: '/home/user/perfectgames/test/shots/dg-4-draw.png' });
    const st2 = await page.evaluate(() => ({
      banner: document.getElementById('turnBanner').textContent,
      toolbarHidden: document.getElementById('toolbar').classList.contains('hidden'),
      lockHidden: document.getElementById('canvasLock').classList.contains('hidden'),
      guessRowHidden: document.getElementById('guessRow').classList.contains('hidden'),
      canvasH: document.getElementById('drawCanvas').style.height,
      canvasRect: (() => { const r = document.getElementById('drawCanvas').getBoundingClientRect(); return { w: r.width, h: r.height }; })(),
    }));
    console.log('AFTER PICK:', JSON.stringify(st2));
  }

  await browser.close();
})();
