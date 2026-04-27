import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
page.on('console', m => console.log('[c]', m.type(), m.text()));
page.on('pageerror', e => console.log('[pe]', e.message));
page.on('requestfailed', r => console.log('[rf]', r.url(), r.failure()?.errorText));
await page.goto('http://localhost:5173/?debug=1', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));
const loadedUrl = await page.evaluate(() => {
  const app = window.__PIXI_APP__;
  if (!app) return { err: 'no app' };
  const mapSprite = app.stage.children.flatMap(c => {
    const f = (x) => x.label === 'map-base' ? [x] : (x.children ? x.children.flatMap(f) : []);
    return f(c);
  })[0];
  return {
    hasMapSprite: !!mapSprite,
    mapVisible: mapSprite?.visible,
    mapW: mapSprite?.width,
    texValid: mapSprite?.texture?.source?.valid,
    resLabel: mapSprite?.texture?.source?.label || mapSprite?.texture?.label,
  };
});
console.log('map state:', JSON.stringify(loadedUrl));
await browser.close();
