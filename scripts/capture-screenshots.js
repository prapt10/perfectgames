/* Capture portfolio screenshots (optional dev tool — needs Chrome for Testing).
/* Capture clean portfolio screenshots of every game into docs/screenshots/ */
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.PG_CHROME_PATH || '/tmp/chrome/chrome-linux64/chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--font-render-hinting=none'],
  });
  const errors = [];
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message.slice(0, 120)));
  await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });

  const shot = name => page.screenshot({ path: path.join(OUT, name) });

  // ---------- 1. hub ----------
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle0', timeout: 30000 });
  await wait(900);
  await shot('01-hub.png');
  console.log('hub done');

  // ---------- 2. sequence mid-game ----------
  await page.goto('http://localhost:8080/sequence', { waitUntil: 'networkidle0' });
  await wait(400);
  await page.click('#btnBots');
  await wait(300);
  await page.click('#botStart'); // 2 bots default -> 3 players solo
  await wait(1500);
  // human is first (seat order); place a chip
  await page.click('#hand .card.selectable'); // select first playable
  await wait(300);
  const tgt = await page.$('.cell.target');
  if (tgt) { await tgt.click(); await wait(900); }
  await shot('02-sequence.png');
  console.log('sequence done');

  // ---------- 3. uno mid-game ----------
  await page.goto('http://localhost:8080/uno', { waitUntil: 'networkidle0' });
  await wait(400);
  await page.click('#btnBots');
  await wait(300);
  await page.click('#botStart');
  await wait(9000); // let bots play a few turns; human may need a move -> bots wait. play if our turn
  const canPlay = await page.evaluate(() => !!document.querySelector('#hand .card.playable, #hand .card'));
  if (canPlay) {
    const myTurn = await page.evaluate(() => (document.getElementById('turnBanner') || {}).textContent || '');
    if (/Your turn/i.test(myTurn)) {
      const c = await page.$('#hand .card.playable');
      if (c) { await c.click(); await wait(700); }
    }
  }
  await shot('03-uno.png');
  console.log('uno done');

  // ---------- 4. ludo board ----------
  await page.goto('http://localhost:8080/ludo', { waitUntil: 'networkidle0' });
  await wait(400);
  await page.click('#btnBots');
  await wait(300);
  await page.click('#botStart');
  await wait(2500);
  await shot('04-ludo.png');
  console.log('ludo done');

  // ---------- 5. draw & guess ----------
  await page.goto('http://localhost:8080/drawguess', { waitUntil: 'networkidle0' });
  await wait(400);
  await page.click('#btnBots');
  await wait(300);
  await page.click('#botStart');
  await wait(1200);
  await page.click('.word-opt'); // pick word
  await wait(1000);
  // draw a little picture (sun + house) with the mouse
  const canvas = await page.$('#drawCanvas');
  const box = await canvas.boundingBox();
  const cx = box.x, cy = box.y;
  const stroke = async (x1, y1, x2, y2) => {
    await page.mouse.move(cx + x1, cy + y1);
    await page.mouse.down();
    await page.mouse.move(cx + x2, cy + y2, { steps: 24 });
    await page.mouse.up();
    await wait(160);
  };
  await stroke(90, 40, 90, 110);          // house wall left
  await stroke(90, 110, 150, 110);        // floor
  await stroke(150, 110, 150, 40);        // wall right
  await stroke(90, 40, 150, 40);          // top
  await stroke(80, 40, 120, 10);          // roof
  await stroke(120, 10, 160, 40);         // roof
  await stroke(112, 110, 112, 75);        // door
  await stroke(112, 75, 130, 75);         // door
  await stroke(130, 75, 130, 110);        // door
  await wait(500);
  await shot('05-drawguess.png');
  console.log('drawguess done');

  // ---------- 6. charades party ----------
  await page.goto('http://localhost:8080/charades', { waitUntil: 'networkidle0' });
  await wait(400);
  await page.click('#btnFriends');
  await wait(300);
  await page.click('#btnSame');
  await wait(400);
  await page.click('#hsStart');
  await wait(800);
  await page.click('#lobbyControls .start-btn');
  await wait(1000);
  await page.click('#revealBtn');
  await wait(300);
  await page.click('.title-opt'); // memorize screen with chosen title
  await wait(400);
  await shot('06-charades.png');
  console.log('charades done');

  // ---------- 7. tambola live ----------
  await page.goto('http://localhost:8080/tambola', { waitUntil: 'networkidle0' });
  await wait(400);
  await page.click('#btnBots');
  await wait(300);
  await page.click('#botModal #speedRow button[data-s="fast"]');
  await page.click('#botStart');
  await wait(14000);
  await page.setViewport({ width: 1280, height: 1300, deviceScaleFactor: 1 });
  await wait(300);
  await shot('07-tambola.png');
  await page.setViewport({ width: 1280, height: 820, deviceScaleFactor: 1 });
  console.log('tambola done');

  console.log('ERRORS:', errors.length ? errors.join(' | ') : 'none');
  await browser.close();
})();
