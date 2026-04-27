#!/usr/bin/env node
/**
 * Flood-key background remover.
 *
 * Algorithm:
 *   1. Start from all 4 edges. Seed each edge pixel whose original alpha > 0.
 *   2. BFS flood-fill neighbours: neighbour joins the "background" set iff
 *      ‖RGB(neighbour) − RGB(seed_avg)‖ < TH (adaptive per-channel).
 *   3. All pixels in the background set → alpha 0.
 *   4. Feather: dilate the background mask by 1 pixel and give those pixels
 *      alpha * 0.4 to avoid hard edges.
 *   5. Trim (cropping to the opaque pixel bounding box) + resize to 1024 long edge.
 *
 * Much safer than distance-keying because sheep's wool (white-ish) or forge's
 * thatch (yellow-ish) won't accidentally match the white/grey backdrop.
 *
 * Usage: node scripts/floodkey-bg.mjs <in> <outDir> <nameStem> [tol=36]
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const [, , input, outDir, nameStem, tolArg] = process.argv;
if (!input || !outDir || !nameStem) {
  console.error('usage: floodkey-bg.mjs <in> <outDir> <nameStem> [tol=36]');
  process.exit(2);
}
const TOL = tolArg ? Number(tolArg) : 36;
const TARGET_LONG = 1024;

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const src = sharp(input).ensureAlpha();
  const meta = await src.metadata();
  const { width, height } = meta;
  const raw = await src.raw().toBuffer();

  // Sample edge pixels to get ref color (median of edges)
  const edges = [];
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 128))) {
    edges.push(pix(raw, width, x, 0));
    edges.push(pix(raw, width, x, height - 1));
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 128))) {
    edges.push(pix(raw, width, 0, y));
    edges.push(pix(raw, width, width - 1, y));
  }
  const ref = median3(edges);
  console.log(`[flood] ref bg ≈ (${ref.join(',')}), tol=${TOL}`);

  // Build "is background" mask via BFS with HYBRID rule:
  //   a pixel joins bg if  (dist(pixel, ref) <= TOL)
  //                      OR dist(pixel, source) <= TOL/2
  //   (source = the neighbour that enqueued it)
  // This allows the fill to "hop" across gradient/checkerboard backgrounds
  // while still stopping at the actual object boundary (high-chroma).
  const bg = new Uint8Array(width * height);
  const queue = [];

  const col = (i) => [raw[i], raw[i + 1], raw[i + 2]];
  const dist = (a, b) => {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const tryPushFrom = (x, y, srcColor) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (bg[p]) return;
    const i = p * 4;
    const c = col(i);
    if (dist(c, ref) <= TOL || dist(c, srcColor) <= TOL * 0.7) {
      bg[p] = 1;
      queue.push(p);
    }
  };

  // Seed: entire outer ring (unconditional — treat outermost pixel as bg)
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const p = y * width + x;
      bg[p] = 1; queue.push(p);
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const p = y * width + x;
      if (!bg[p]) { bg[p] = 1; queue.push(p); }
    }
  }

  // BFS — 4-neighbourhood, comparing to source pixel color
  while (queue.length) {
    const p = queue.pop();
    const x = p % width, y = (p - x) / width;
    const srcColor = col(p * 4);
    tryPushFrom(x + 1, y, srcColor);
    tryPushFrom(x - 1, y, srcColor);
    tryPushFrom(x, y + 1, srcColor);
    tryPushFrom(x, y - 1, srcColor);
  }

  // Apply mask
  const out = Buffer.from(raw);
  let bgCount = 0, feathered = 0;
  for (let p = 0; p < width * height; p++) {
    if (bg[p]) { out[p * 4 + 3] = 0; bgCount++; }
  }

  // Feather — one layer of pixels adjacent to bg but themselves not bg → half alpha
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (bg[p]) continue;
      // is any 4-neighbour bg?
      let adj = false;
      if (x > 0 && bg[p - 1]) adj = true;
      else if (x < width - 1 && bg[p + 1]) adj = true;
      else if (y > 0 && bg[p - width]) adj = true;
      else if (y < height - 1 && bg[p + width]) adj = true;
      if (adj) {
        const i = p * 4;
        out[i + 3] = Math.round(out[i + 3] * 0.45);
        feathered++;
      }
    }
  }
  console.log(`[flood] bg pixels=${bgCount} (${(bgCount * 100 / (width * height)).toFixed(1)}%), feathered=${feathered}`);

  const keyed = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();

  let trimmed;
  try {
    trimmed = await sharp(keyed).trim({ threshold: 2 }).toBuffer();
  } catch {
    trimmed = keyed;
  }
  const tm = await sharp(trimmed).metadata();
  const resized = await sharp(trimmed)
    .resize({
      width: tm.width >= tm.height ? TARGET_LONG : undefined,
      height: tm.height > tm.width ? TARGET_LONG : undefined,
      fit: 'inside',
    })
    .toBuffer();
  const fm = await sharp(resized).metadata();

  const pngPath = path.join(outDir, `${nameStem}.png`);
  const webpPath = path.join(outDir, `${nameStem}.webp`);
  await sharp(resized).png({ compressionLevel: 9 }).toFile(pngPath);
  await sharp(resized).webp({ quality: 90 }).toFile(webpPath);
  const sPng = (await fs.stat(pngPath)).size / 1024;
  const sWebp = (await fs.stat(webpPath)).size / 1024;
  console.log(`[flood] ${nameStem}: ${width}×${height} → trim ${tm.width}×${tm.height} → ${fm.width}×${fm.height} | PNG ${sPng.toFixed(0)}KB, WebP ${sWebp.toFixed(0)}KB`);
}

function pix(raw, width, x, y) {
  const i = (y * width + x) * 4;
  return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]];
}
function median3(arr) {
  const rs = [], gs = [], bs = [];
  for (const p of arr) { if (p[3] < 32) continue; rs.push(p[0]); gs.push(p[1]); bs.push(p[2]); }
  const med = (a) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)] ?? 0; };
  return [med(rs), med(gs), med(bs)];
}

main().catch(e => { console.error(e); process.exit(1); });
