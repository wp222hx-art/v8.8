/**
 * probe-tap.mjs — tap an empty area of the fog and capture a screenshot
 * before and after, to prove the interactive tear path works.
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

mkdirSync('/tmp/shots', { recursive: true });
mkdirSync('public/dev/shots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--hide-scrollbars', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true },
  headless: 'shell',
});
const page = await browser.newPage();
page.on('console', (m) => console.log(`[page:${m.type()}]`, m.text().slice(0, 200)));
page.on('pageerror', (err) => console.error('[pageerror]', err.message));

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForSelector('canvas.pixi-stage', { timeout: 15000 });
console.log('✓ canvas present');
await new Promise((r) => setTimeout(r, 4500));

await page.screenshot({ path: '/tmp/shots/T0_before_tap.png' });
console.log('shot 0 taken');

// Tap a point in the upper-middle area of canvas that is likely empty fog
const canvas = await page.$('canvas.pixi-stage');
const box = await canvas.boundingBox();
console.log('canvas box:', box);

// Tap 3 times at distinct empty spots
const tapPoints = [
  { x: box.x + box.width * 0.25, y: box.y + box.height * 0.40 },
  { x: box.x + box.width * 0.75, y: box.y + box.height * 0.55 },
  { x: box.x + box.width * 0.50, y: box.y + box.height * 0.80 },
];
for (const pt of tapPoints) {
  console.log(`tap at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}`);
  await page.mouse.click(pt.x, pt.y);
  await new Promise((r) => setTimeout(r, 600));
}

await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: '/tmp/shots/T1_after_tap.png' });
console.log('shot 1 taken');

await browser.close();
