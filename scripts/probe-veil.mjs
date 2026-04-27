// Probe the FogVeil canvas state after reveal=all.
// Dumps tear list + veil canvas top-left & center & corner pixel alpha.
import puppeteer from 'puppeteer-core';

const CHROME = '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';
const URL = process.argv[2] || 'http://localhost:5173/?reveal=all&debug=1';

const b = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true },
});
const p = await b.newPage();
p.on('console', (m) => {
  const txt = m.text();
  if (txt.includes('Download the React') || txt.includes('vite')) return;
  console.log('[page]', m.type(), txt.slice(0, 200));
});
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas.pixi-stage', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 4000));

const data = await p.evaluate(() => {
  const app = window.__PIXI_APP__;
  if (!app) return { err: 'no __PIXI_APP__' };

  const find = (c, pred) => {
    if (pred(c)) return c;
    for (const k of c.children || []) {
      const r = find(k, pred);
      if (r) return r;
    }
    return null;
  };

  const fogContainer = find(app.stage, (c) => c.label === 'fog-veil');
  if (!fogContainer) return { err: 'fog container not found' };

  const veilSprite = find(fogContainer, (c) => c.label === 'fog-veil-sprite');
  const edgeGfx = find(fogContainer, (c) => c.label === 'tear-edge-fx');

  // Locate the JS FogVeil instance via inspecting PaperStage modules.
  // Simpler route: dig via app.__fogVeil if exposed, else reach canvas via sprite texture.
  let veilCanvas = null;
  let canvasSize = null;
  try {
    const src = veilSprite.texture.source;
    veilCanvas = src.resource;
    if (veilCanvas && veilCanvas.getContext) {
      canvasSize = { w: veilCanvas.width, h: veilCanvas.height };
    }
  } catch {}

  // Sample alpha at several points on the canvas to see where tears are.
  const samples = [];
  if (veilCanvas && veilCanvas.getContext) {
    const ctx = veilCanvas.getContext('2d');
    const pts = [
      [10, 10, 'TL'],
      [canvasSize.w / 2 | 0, canvasSize.h / 2 | 0, 'center'],
      [canvasSize.w - 10, canvasSize.h - 10, 'BR'],
      [canvasSize.w / 4 | 0, canvasSize.h / 4 | 0, 'Q1'],
      [(canvasSize.w * 3 / 4) | 0, canvasSize.h / 4 | 0, 'Q2'],
      [canvasSize.w / 4 | 0, (canvasSize.h * 3 / 4) | 0, 'Q3'],
      [(canvasSize.w * 3 / 4) | 0, (canvasSize.h * 3 / 4) | 0, 'Q4'],
    ];
    for (const [x, y, label] of pts) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      samples.push({ label, x, y, r: d[0], g: d[1], b: d[2], a: d[3] });
    }
  }

  return {
    veilSpriteExists: !!veilSprite,
    spriteAlpha: veilSprite?.alpha,
    spriteVisible: veilSprite?.visible,
    spriteWidth: veilSprite?.width,
    spriteHeight: veilSprite?.height,
    edgeGfxExists: !!edgeGfx,
    edgeGfxVisible: edgeGfx?.visible,
    canvasSize,
    samples,
    fogContainerAlpha: fogContainer.alpha,
    fogContainerVisible: fogContainer.visible,
    fogContainerChildren: fogContainer.children.map((k) => ({
      label: k.label,
      type: k.constructor.name,
      alpha: k.alpha,
      visible: k.visible,
    })),
  };
});

console.log(JSON.stringify(data, null, 2));
await b.close();
