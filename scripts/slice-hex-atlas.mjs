#!/usr/bin/env node
/**
 * 🔪 slice-hex-atlas.mjs
 *
 * Slice assets/style-lock/07_hex_atlas.png (1328×1760) into 12 individual
 * hex terrain tiles with proper hexagonal alpha mask.
 *
 * Source layout (verified via image analysis):
 *   4 cols × 3 rows, each hex ≈ 272×312 px
 *   Grid bounds: x [38 .. 1287], y [276 .. 1665]
 *
 * Reading order (left-to-right, top-to-bottom):
 *   Row 1: forest, grassland, wheat, river
 *   Row 2: mountain, ruins, village, marsh
 *   Row 3: desert, coastline, hills, cavern   (we map coastline→snow, hills→forest-bg, cavern→lava for now)
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Grid layout calibration
const GRID = {
  left: 38,
  right: 1287,
  top: 276,
  bottom: 1665,
  cols: 4,
  rows: 3,
};
const cellW = (GRID.right - GRID.left) / GRID.cols;   // ≈ 312
const cellH = (GRID.bottom - GRID.top) / GRID.rows;   // ≈ 463 (includes ribbon label gap)

// Hex size inside each cell (we crop to the hex itself, not the label)
// Each hex is ~272×312 within a cell of ~312×463
const HEX_W = 280;
const HEX_H = 320;

// Tile order — 4x3
const TILES = [
  'forest', 'grassland', 'wheat', 'river',
  'mountain', 'ruins', 'village', 'marsh',
  'desert', 'snow', 'lava', 'fogged', // re-mapped last row
];

/**
 * Build a pointy-top hexagonal alpha mask as an SVG,
 * then use it as a composite mask.
 */
function hexMaskSVG(w, h) {
  const cx = w / 2;
  const cy = h / 2;
  // pointy-top hex inscribed in (w,h)
  // vertices at 30° increments starting from top
  const points = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 180 * (60 * i - 90);
    const r = Math.min(w, h) / 2 - 4; // tiny inset
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  const poly = points.map(p => p.join(',')).join(' ');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
       <polygon points="${poly}" fill="white"/>
     </svg>`
  );
}

async function main() {
  const src = resolve(root, 'assets/style-lock/07_hex_atlas.png');
  const outDir = resolve(root, 'public/assets/hex');
  await mkdir(outDir, { recursive: true });

  console.log(`Slicing ${src}`);
  console.log(`Grid: ${GRID.cols}×${GRID.rows}, cell ${cellW.toFixed(0)}×${cellH.toFixed(0)}`);

  const manifest = [];

  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      const i = r * GRID.cols + c;
      const name = TILES[i];

      // Cell center
      const cx = GRID.left + cellW * (c + 0.5);
      // Hex is roughly in the top 2/3 of the cell (ribbon label below)
      const cy = GRID.top + cellH * r + HEX_H / 2 + 6;

      // Clamp to source bounds
      const SRC_W = 1328, SRC_H = 1760;
      let cropX = Math.round(cx - HEX_W / 2);
      let cropY = Math.round(cy - HEX_H / 2);
      let cw = HEX_W, ch = HEX_H;
      if (cropX < 0) { cw += cropX; cropX = 0; }
      if (cropY < 0) { ch += cropY; cropY = 0; }
      if (cropX + cw > SRC_W) cw = SRC_W - cropX;
      if (cropY + ch > SRC_H) ch = SRC_H - cropY;

      const OUT_SIZE = 256;
      const outPath = resolve(outDir, `${name}.png`);

      // Step 1: extract + resize → exact output dimensions (no mask yet)
      const outH = Math.round(OUT_SIZE * ch / cw);
      const base = await sharp(src)
        .extract({ left: cropX, top: cropY, width: cw, height: ch })
        .resize(OUT_SIZE, outH, { fit: 'fill' })
        .toBuffer();

      // Step 2: generate mask at the EXACT output size
      const mask = await sharp(hexMaskSVG(OUT_SIZE, outH))
        .resize(OUT_SIZE, outH)
        .png()
        .toBuffer();

      // Step 3: composite mask onto base
      const tile = await sharp(base)
        .ensureAlpha()
        .composite([{ input: mask, blend: 'dest-in' }])
        .png({ compressionLevel: 9 })
        .toBuffer();

      await writeFile(outPath, tile);
      const out = { id: name, file: `hex/${name}.png`, w: OUT_SIZE };
      manifest.push(out);
      console.log(`  ✓ ${name.padEnd(12)} → ${outPath} (${(tile.byteLength / 1024).toFixed(1)} KB)`);
    }
  }

  // Write manifest
  await writeFile(
    resolve(outDir, 'manifest.json'),
    JSON.stringify({ tiles: manifest }, null, 2)
  );
  console.log(`\n✅ Wrote ${manifest.length} tiles + manifest.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
