// Probe the actual pixel values in the veil canvas to see if destination-out
// is punching holes as expected.
import puppeteer from 'puppeteer-core';
const CHROME = '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';
const b = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true },
});
const p = await b.newPage();
p.on('console', (m) => console.log('[page]', m.type(), m.text()));
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto('http://localhost:5173/?reveal=all&debug=1', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas.pixi-stage', { timeout: 15000 });
await new Promise(r => setTimeout(r, 4000));

const data = await p.evaluate(() => {
  const app = window.__PIXI_APP__;
  if (!app) return { err: 'no pixi' };
  const find = (c, label) => {
    if (c.label === label) return c;
    for (const k of (c.children || [])) {
      const r = find(k, label);
      if (r) return r;
    }
    return null;
  };
  const veilSprite = find(app.stage, 'fog-veil-sprite');
  if (!veilSprite) return { err: 'no veil sprite' };
  const src = veilSprite.texture?.source;
  const canvas = src?.resource;
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    return { err: 'no canvas', srcType: src?.constructor?.name, resourceType: canvas?.constructor?.name };
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return { err: 'no ctx' };
  // Sample at the village-hall landmark location (600, 400) in map space.
  // Our canvas is half-res, so sample at (300, 200).
  const samples = [];
  for (const [label, mx, my] of [
    ['centre', Math.floor(canvas.width/2), Math.floor(canvas.height/2)],
    ['village_hall_center', 300, 200],   // landmark center
    ['village_hall_offset', 320, 220],   // nearby
    ['far_corner', 50, 50],
    ['map_corner_bottom_right', canvas.width - 50, canvas.height - 50],
  ]) {
    const px = ctx.getImageData(mx, my, 1, 1).data;
    samples.push({ label, x: mx, y: my, rgba: [px[0], px[1], px[2], px[3]] });
  }
  return {
    canvasSize: [canvas.width, canvas.height],
    srcClass: src.constructor.name,
    srcTransparent: src.transparent,
    uploadMethodId: src.uploadMethodId,
    samples,
  };
});
console.log(JSON.stringify(data, null, 2));
await b.close();
