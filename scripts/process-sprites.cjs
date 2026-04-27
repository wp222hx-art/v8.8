/**
 * Post-process building sprites:
 *   1. Trim fully-transparent borders
 *   2. Re-center into square canvas with small padding
 *   3. Export PNG (lossless) + WebP (compact)
 *
 * Usage:  node scripts/process-sprites.cjs [building-name]
 * Default: village-hall
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const building = process.argv[2] || 'village-hall';
const srcDir = path.join(__dirname, '..', 'assets', 'buildings', building);
const dstDir = path.join(__dirname, '..', 'public', 'assets', 'buildings', building);

const LAYERS = [
  { name: 'main',   padding: 0.02 },
  { name: 'shadow', padding: 0.05 },
];

async function processLayer(name, padding) {
  const src = path.join(srcDir, name + '.png');
  if (!fs.existsSync(src)) {
    console.log(`  [skip] ${name}.png — not found`);
    return;
  }
  fs.mkdirSync(dstDir, { recursive: true });

  // 1. Trim transparent borders to get tight content bbox
  const trimmedBuf = await sharp(src)
    .ensureAlpha()
    .trim({ threshold: 5 })
    .png()
    .toBuffer();

  const trimmedMeta = await sharp(trimmedBuf).metadata();

  // 2. Calculate square canvas with padding
  const side = Math.max(trimmedMeta.width, trimmedMeta.height);
  const padded = Math.round(side * (1 + padding * 2));
  const top = Math.round((padded - trimmedMeta.height) / 2);
  const left = Math.round((padded - trimmedMeta.width) / 2);

  // 3. Extend to square + resize to 1024
  const squared = await sharp(trimmedBuf)
    .extend({
      top,
      bottom: padded - trimmedMeta.height - top,
      left,
      right: padded - trimmedMeta.width - left,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(1024, 1024, { fit: 'inside' })
    .png()
    .toBuffer();

  // 4. Export PNG + WebP
  const outPng = path.join(dstDir, name + '.png');
  const outWebp = path.join(dstDir, name + '.webp');
  await sharp(squared).png({ compressionLevel: 9 }).toFile(outPng);
  await sharp(squared).webp({ quality: 92, alphaQuality: 100 }).toFile(outWebp);

  const m = await sharp(outPng).metadata();
  const sp = fs.statSync(outPng).size;
  const sw = fs.statSync(outWebp).size;
  console.log(
    `  ${name}: ${m.width}x${m.height} alpha=${m.hasAlpha} ` +
      `trim=${trimmedMeta.width}x${trimmedMeta.height}  ` +
      `png=${(sp / 1024).toFixed(0)}KB  webp=${(sw / 1024).toFixed(0)}KB`
  );
}

(async () => {
  console.log(`[process-sprites] ${building}`);
  for (const { name, padding } of LAYERS) {
    await processLayer(name, padding);
  }
  console.log('Done. →', path.relative(process.cwd(), dstDir));
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
