/**
 * Screenshot tool (puppeteer-core + cached chromium).
 *   node scripts/shoot.mjs <out.png> <url> [waitMs=5000]
 *
 * Uses domcontentloaded (Vite keeps an HMR websocket open forever, so
 * networkidle2 never fires), then waits for the Pixi canvas to mount,
 * then gives an extra delay so the scene can finish its async init
 * and first-frame animations.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [, , outPath, url, waitMsArg = '5000'] = process.argv;
if (!outPath || !url) {
  console.error('usage: shoot.mjs <out.png> <url> [waitMs]');
  process.exit(1);
}
const waitMs = Number(waitMsArg);
mkdirSync(dirname(outPath), { recursive: true });

const browser = await puppeteer.launch({
  executablePath:
    '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--hide-scrollbars',
    '--enable-unsafe-swiftshader',
  ],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true },
  headless: 'shell',
});
const page = await browser.newPage();
page.on('console', (m) => {
  const t = m.type();
  if (t === 'log' || t === 'error') {
    console.log(`[page:${t}]`, m.text());
  }
});
page.on('pageerror', (err) => console.error('[pageerror]', err.message));

console.log('→ navigate', url);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
console.log('✓ DOM ready — waiting for <canvas.pixi-stage>');
await page.waitForSelector('canvas.pixi-stage', { timeout: 15000 }).catch((e) => {
  console.warn('  no pixi canvas:', e.message);
});
console.log(`✓ canvas present — sleeping ${waitMs}ms for scene to settle`);
await new Promise((r) => setTimeout(r, waitMs));

await page.screenshot({ path: outPath, type: 'png', fullPage: false });
console.log('✔ wrote', outPath);

await browser.close();
process.exit(0);
