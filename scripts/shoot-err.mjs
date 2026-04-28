import puppeteer from 'puppeteer-core';
const CHROME = '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';
const url = 'http://localhost:5173/?reveal=all';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 1 });
page.on('pageerror', (err) => {
  console.log('--- PAGE ERROR ---');
  console.log('msg:', err.message);
  console.log('stack:', err.stack);
});
page.on('console', (msg) => {
  const t = msg.text();
  if (t.includes('FogVeil') || t.includes('PaperStage') || t.includes('error')) {
    console.log('CON:', t);
  }
});
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
await new Promise(r => setTimeout(r, 7000));
await browser.close();
