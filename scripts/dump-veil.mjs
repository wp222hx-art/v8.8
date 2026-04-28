// Dump the FogVeil canvas to a PNG file so we can SEE what's in there.
import puppeteer from 'puppeteer-core';
import { writeFile } from 'node:fs/promises';

const CHROME = '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';
const URL = process.argv[2] || 'http://localhost:5173/?reveal=all&debug=1';
const OUT = process.argv[3] || '/tmp/shots/veil_dump.png';

const b = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true },
});
const p = await b.newPage();
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas.pixi-stage', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 4000));

const dataUrl = await p.evaluate(() => {
  const app = window.__PIXI_APP__;
  if (!app) return null;
  const find = (c, pred) => {
    if (pred(c)) return c;
    for (const k of c.children || []) {
      const r = find(k, pred);
      if (r) return r;
    }
    return null;
  };
  const sprite = find(app.stage, (c) => c.label === 'fog-veil-sprite');
  if (!sprite) return null;
  const canvas = sprite.texture.source.resource;
  if (!canvas || !canvas.toDataURL) return null;
  return canvas.toDataURL('image/png');
});

if (!dataUrl) {
  console.error('failed to dump canvas');
} else {
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  await writeFile(OUT, Buffer.from(b64, 'base64'));
  console.log('wrote', OUT);
}
await b.close();
