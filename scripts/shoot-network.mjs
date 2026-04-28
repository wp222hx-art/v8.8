// Capture network activity (esp. failures) for a URL.
// Usage: node scripts/shoot-network.mjs <path> [waitMs]
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://localhost:5173';
const CHROME = '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';

const rel = process.argv[2] || '/?reveal=all';
const waitMs = Number(process.argv[3] ?? 6000);
const url = BASE + rel;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 1 });

const failed = [];
const ok = [];
page.on('response', (res) => {
  const u = res.url();
  // Ignore HMR pings & vite internals
  if (u.includes('/@vite/') || u.includes('/@react-refresh') || u.includes('/node_modules/')) return;
  if (res.status() >= 400) failed.push(res.status() + ' ' + u);
  else if (res.status() === 200 && (u.endsWith('.png') || u.endsWith('.webp') || u.endsWith('.jpg'))) ok.push(res.status() + ' ' + u);
});
page.on('requestfailed', (req) => {
  failed.push('FAIL ' + req.failure().errorText + ' ' + req.url());
});
page.on('console', (msg) => {
  const t = msg.text();
  console.log('  browser[' + msg.type() + ']:', t.slice(0, 300));
});
page.on('pageerror', (err) => console.log('  PAGEERR:', err.message));

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
} catch (e) {
  console.error('navigation timeout:', e.message);
}
await new Promise((r) => setTimeout(r, waitMs));

console.log('\n--- Successful image loads ---');
ok.forEach((l) => console.log(' ', l));
console.log('\n--- Failed requests ---');
if (failed.length === 0) console.log('  (none!)');
else failed.forEach((l) => console.log(' ', l));

await browser.close();
