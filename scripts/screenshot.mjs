/**
 * Take mobile screenshots of the SYNAPSE dev server, optionally with clicks.
 *
 * Usage:
 *   node scripts/screenshot.mjs <url> <out.png> <width> <height> <waitMs> [clicksJSON]
 *
 * clicksJSON: JSON array of [xPct, yPct] pairs (0..1) to click between shots.
 *             A separate out.png_N.png is written after each click.
 */
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';

const CHROME = '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';
if (!existsSync(CHROME)) {
  console.error('Chrome not found at', CHROME);
  process.exit(1);
}

const URL = process.argv[2] || 'http://localhost:5173/';
const OUT = process.argv[3] || '/tmp/synapse_shot.png';
const WIDTH = parseInt(process.argv[4] || '400', 10);
const HEIGHT = parseInt(process.argv[5] || '820', 10);
const WAIT_MS = parseInt(process.argv[6] || '8000', 10);
const CLICKS = process.argv[7] ? JSON.parse(process.argv[7]) : [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
  ],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 });
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') {
      console.log(`[page:${t}]`, msg.text().slice(0, 200));
    }
  });
  page.on('pageerror', (err) => console.log('[page:error]', err.message));

  console.log('goto', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise((r) => setTimeout(r, WAIT_MS));
  await page.screenshot({ path: OUT, fullPage: false });
  console.log('wrote', OUT);

  for (let i = 0; i < CLICKS.length; i++) {
    const [px, py] = CLICKS[i];
    const x = Math.round(WIDTH * px);
    const y = Math.round(HEIGHT * py);
    console.log(`click #${i + 1} at (${x}, ${y})`);
    await page.mouse.click(x, y, { delay: 50 });
    await new Promise((r) => setTimeout(r, 1600));
    const outC = OUT.replace(/\.png$/, `_click${i + 1}.png`);
    await page.screenshot({ path: outC, fullPage: false });
    console.log('wrote', outC);
  }
} finally {
  await browser.close();
}
