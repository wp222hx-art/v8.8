import puppeteer from 'puppeteer-core';
const CHROME = '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';
const b = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true },
});
const p = await b.newPage();
await p.goto('http://localhost:5173/?reveal=all&debug=1', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas.pixi-stage', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 4000));

const info = await p.evaluate(() => {
  const app = window.__PIXI_APP__;
  const find = (c, pred) => {
    if (pred(c)) return c;
    for (const k of c.children || []) { const r = find(k, pred); if (r) return r; }
    return null;
  };
  const sprite = find(app.stage, (c) => c.label === 'fog-veil-sprite');
  const veilCanvas = sprite.texture.source.resource;
  const pixiCanvas = app.canvas;
  return {
    veilCanvasW: veilCanvas?.width,
    veilCanvasH: veilCanvas?.height,
    pixiCanvasW: pixiCanvas?.width,
    pixiCanvasH: pixiCanvas?.height,
    sameIdentity: veilCanvas === pixiCanvas,
    veilIsInDom: document.body.contains(veilCanvas),
    pixiIsInDom: document.body.contains(pixiCanvas),
    veilCanvasParent: veilCanvas?.parentElement?.tagName,
    pixiCanvasParent: pixiCanvas?.parentElement?.tagName,
    // Check classnames
    veilClassName: veilCanvas?.className,
    pixiClassName: pixiCanvas?.className,
  };
});
console.log(JSON.stringify(info, null, 2));
await b.close();
