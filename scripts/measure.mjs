import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome',
  args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--enable-unsafe-swiftshader'],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 1 },
  headless: 'shell',
});
const page = await browser.newPage();
await page.goto('http://localhost:5173/?reveal=all', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForSelector('canvas.pixi-stage', { timeout: 10000 });
await new Promise(r => setTimeout(r, 4500));
const info = await page.evaluate(() => {
  const c = document.querySelector('canvas.pixi-stage');
  return {
    cssW: c?.clientWidth, cssH: c?.clientHeight,
    w: c?.width, h: c?.height,
    styleW: c?.style.width, styleH: c?.style.height,
    dpr: window.devicePixelRatio,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
});
console.log('canvas:', JSON.stringify(info, null, 2));
await browser.close();
