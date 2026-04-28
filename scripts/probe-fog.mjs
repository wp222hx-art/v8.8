import puppeteer from 'puppeteer-core';
const CHROME = '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome';
const b = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true },
});
const p = await b.newPage();
p.on('console', (m) => console.log('[page]', m.type(), m.text()));
await p.goto('http://localhost:5173/?reveal=all&debug=1', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('canvas.pixi-stage', { timeout: 15000 });
await new Promise(r => setTimeout(r, 3500));
const data = await p.evaluate(() => {
  const app = window.__PIXI_APP__;
  if (!app) return { err: 'no app' };
  const walk = (c, depth = 0) => {
    const info = { label: c.label, type: c.constructor.name, alpha: c.alpha, visible: c.visible, children: c.children?.length ?? 0 };
    if (c.label === 'fog-veil' || c.label === 'tear-mask') {
      // Dig into geometry
      const out = { ...info, _mask: c.mask?.constructor?.name };
      if (c.children) out.kids = c.children.map(k => ({ label: k.label, type: k.constructor.name, alpha: k.alpha }));
      return out;
    }
    if (depth > 5) return info;
    info.kids = (c.children || []).map(k => walk(k, depth + 1));
    return info;
  };
  const tree = walk(app.stage);
  // Locate veil and report its mask details
  const findByLabel = (c, lbl) => {
    if (c.label === lbl) return c;
    for (const k of (c.children || [])) {
      const r = findByLabel(k, lbl);
      if (r) return r;
    }
    return null;
  };
  const veil = findByLabel(app.stage, 'fog-veil');
  const mask = findByLabel(app.stage, 'tear-mask');
  return {
    veilChildren: veil ? veil.children.map(k => ({ label: k.label, type: k.constructor.name, alpha: k.alpha, width: k.width, height: k.height })) : null,
    veilSpriteMask: veil ? (veil.children.find(k => k.label === undefined || k.constructor.name === 'Sprite') || null) : null,
    maskExists: !!mask,
    maskChildCount: mask?.children?.length,
    maskGeomShapes: mask ? (mask.context?.instructions?.length ?? 'N/A') : null,
  };
});
console.log(JSON.stringify(data, null, 2));
await b.close();
