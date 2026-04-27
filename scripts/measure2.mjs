import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/home/user/.cache/ms-playwright/chromium-1140/chrome-linux/chrome',
  args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--enable-unsafe-swiftshader'],
  defaultViewport: { width: 430, height: 932, deviceScaleFactor: 2, isMobile: true },
  headless: 'shell',
});
const page = await browser.newPage();
await page.goto('http://localhost:5173/?reveal=all', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForSelector('canvas.pixi-stage', { timeout: 10000 });
await new Promise(r => setTimeout(r, 5000));
const info = await page.evaluate(() => {
  const c = document.querySelector('canvas.pixi-stage');
  // Dig into Pixi's stage tree
  // Access via the React ref chain is painful; use a global stash we'll add.
  const w = window;
  const pixi = w.__PIXI_APP__ || null;
  const result = {
    cssW: c?.clientWidth, cssH: c?.clientHeight,
    pxW: c?.width, pxH: c?.height,
    dpr: window.devicePixelRatio,
    hasApp: !!pixi,
  };
  if (pixi) {
    const world = pixi.stage.children.find(x => x.label === 'world');
    if (world) {
      result.worldScale = world.scale.x;
      result.worldPos = { x: world.x, y: world.y };
      const buildings = world.children.find(x => x.label === 'buildings');
      if (buildings && buildings.children.length) {
        const b = buildings.children[0];
        result.buildingLabel = b.label;
        result.buildingPos = { x: b.x, y: b.y };
        result.buildingBounds = b.getBounds();
        result.buildingChildren = b.children.length;
        if (b.children.length > 0) {
          result.mainChild = {
            w: b.children[b.children.length-1].width,
            h: b.children[b.children.length-1].height,
            scale: b.children[b.children.length-1].scale.x,
          };
        }
      }
    }
  }
  return result;
});
console.log('dpr=2 measurement:', JSON.stringify(info, null, 2));
await browser.close();
