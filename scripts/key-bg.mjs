#!/usr/bin/env node
/**
 * Robust background keyer.
 * Strategy:
 *   1. Sample edge pixels (top row, bottom row, left col, right col).
 *   2. Use the median R,G,B as the "background color".
 *   3. For every pixel, compute Euclidean distance in RGB to background.
 *      - dist < TH_HI → alpha = 0
 *      - TH_HI ≤ dist < TH_LO → alpha lerp 0..255
 *      - dist ≥ TH_LO → alpha unchanged (keep original; if no alpha, 255).
 *   4. Feather via gaussian-ish 1-pixel blur of alpha channel (optional).
 *   5. Trim.
 *   6. Save PNG + WebP.
 *
 * Usage: node scripts/key-bg.mjs <input> <outDir> <nameStem>
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const [,, input, outDir, nameStem, thHiArg, thLoArg] = process.argv;
if (!input || !outDir || !nameStem) {
  console.error('usage: key-bg.mjs <input> <outDir> <nameStem> [thHi=18] [thLo=40]');
  process.exit(2);
}

const TH_HI = thHiArg ? Number(thHiArg) : 18;     // distance ≤ TH_HI → alpha 0 (bg)
const TH_LO = thLoArg ? Number(thLoArg) : 40;     // distance ≥ TH_LO → keep original alpha
const TARGET_LONG = 1024;

async function main() {
  await fs.mkdir(outDir, { recursive: true });

  const img = sharp(input).ensureAlpha();
  const meta = await img.metadata();
  const { width, height } = meta;
  const raw = await img.raw().toBuffer();

  // Sample edges
  const samples = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 128));
  for (let x = 0; x < width; x += step) {
    samples.push(sample(raw, width, x, 0));
    samples.push(sample(raw, width, x, height - 1));
  }
  for (let y = 0; y < height; y += step) {
    samples.push(sample(raw, width, 0, y));
    samples.push(sample(raw, width, width - 1, y));
  }
  const bg = median3(samples);
  console.log(`[key-bg] ${path.basename(input)}: bg=(${bg.join(',')}), samples=${samples.length}`);

  // Produce new alpha
  const out = Buffer.from(raw);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i], g = out[i + 1], b = out[i + 2];
    const dr = r - bg[0], dg = g - bg[1], db = b - bg[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= TH_HI) {
      out[i + 3] = 0;
    } else if (dist < TH_LO) {
      const t = (dist - TH_HI) / (TH_LO - TH_HI);
      out[i + 3] = Math.round(out[i + 3] * t);
    }
    // else keep original alpha
  }

  const keyed = await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();

  // Trim
  let trimmed;
  try {
    trimmed = await sharp(keyed).trim({ threshold: 2 }).toBuffer();
  } catch {
    trimmed = keyed; // if everything transparent, keep original
  }
  const tm = await sharp(trimmed).metadata();

  // Resize so longer edge = TARGET_LONG
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
  console.log(`[key-bg] ${nameStem}: ${width}×${height} → trim ${tm.width}×${tm.height} → ${fm.width}×${fm.height} | PNG ${sPng.toFixed(0)}KB, WebP ${sWebp.toFixed(0)}KB`);
}

function sample(raw, width, x, y) {
  const i = (y * width + x) * 4;
  return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]];
}

function median3(arr) {
  // ignore fully transparent samples
  const rs = [], gs = [], bs = [];
  for (const p of arr) {
    if (p[3] < 32) continue;
    rs.push(p[0]); gs.push(p[1]); bs.push(p[2]);
  }
  const med = (a) => {
    a.sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)] ?? 0;
  };
  return [med(rs), med(gs), med(bs)];
}

main().catch(e => { console.error(e); process.exit(1); });
