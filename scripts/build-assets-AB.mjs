#!/usr/bin/env node
/**
 * Pipeline A + B
 * A) Resize /tmp/gen/map_A_notext.png → 1328×1760 PNG + WebP at public/assets/maps/rivershire.{png,webp}
 *    (back up existing rivershire.{png,webp} → rivershire_hex_v2.{png,webp} if not yet backed)
 * B) For each building sprite:
 *    1. Key out pure-white background (if present), leaving only watercolor + painted ground shadow
 *    2. Trim transparent padding
 *    3. Resize so the longer edge = 1024 px, then save
 *       - {name}/main.png  (full alpha)
 *       - {name}/main.webp (lossless-ish q=92)
 *
 * White-keying rule: pixels whose R,G,B are all > 248 and (max−min) < 4 are considered background → alpha=0.
 * We apply a 2-pixel feather to avoid hard edges.
 */
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const GEN = '/tmp/gen';
const OUT_MAP = path.join(ROOT, 'public/assets/maps');
const OUT_BLD = path.join(ROOT, 'public/assets/buildings');

function log(...a) { console.log('[AB]', ...a); }

/* ---------------------------- A: map ---------------------------- */

async function processMap() {
  const src = path.join(GEN, 'map_A_notext.png');
  const dstPng = path.join(OUT_MAP, 'rivershire.png');
  const dstWebp = path.join(OUT_MAP, 'rivershire.webp');
  const bakPng = path.join(OUT_MAP, 'rivershire_hex_v2.png');
  const bakWebp = path.join(OUT_MAP, 'rivershire_hex_v2.webp');

  await fs.mkdir(OUT_MAP, { recursive: true });

  // Backup existing (only if backup does not already exist)
  for (const [from, to] of [[dstPng, bakPng], [dstWebp, bakWebp]]) {
    try {
      await fs.access(from);
      try {
        await fs.access(to);
        log(`backup already exists: ${path.basename(to)}`);
      } catch {
        await fs.copyFile(from, to);
        log(`backup ${path.basename(from)} → ${path.basename(to)}`);
      }
    } catch {}
  }

  // Resize to 1328×1760
  const buf = await sharp(src)
    .resize(1328, 1760, { fit: 'cover', position: 'center' })
    .toBuffer();

  await sharp(buf).png({ compressionLevel: 9 }).toFile(dstPng);
  await sharp(buf).webp({ quality: 88 }).toFile(dstWebp);

  const s1 = (await fs.stat(dstPng)).size / 1024;
  const s2 = (await fs.stat(dstWebp)).size / 1024;
  log(`A: map → 1328×1760 PNG ${s1.toFixed(0)}KB, WebP ${s2.toFixed(0)}KB`);
}

/* ---------------------------- B: buildings ---------------------------- */

/**
 * Detect if a source has a solid white background.
 * Samples the 4 corners — if all are near-white and opaque, return true.
 */
async function hasWhiteBackground(src) {
  const img = sharp(src);
  const { width, height } = await img.metadata();
  const raw = await img.ensureAlpha().raw().toBuffer();
  const chan = 4; // RGBA
  const check = (x, y) => {
    const i = (y * width + x) * chan;
    const r = raw[i], g = raw[i + 1], b = raw[i + 2], a = raw[i + 3];
    return a > 240 && r > 245 && g > 245 && b > 245 && Math.max(r, g, b) - Math.min(r, g, b) < 6;
  };
  const pts = [
    [2, 2], [width - 3, 2], [2, height - 3], [width - 3, height - 3],
    [Math.floor(width / 2), 2], [Math.floor(width / 2), height - 3],
  ];
  const whites = pts.filter(([x, y]) => check(x, y)).length;
  return whites >= 4;
}

/**
 * Remove white background by alpha-keying:
 *   alpha = 0 where pixel is near-white and neutral
 *   soft feather based on distance from white to avoid fringe
 */
async function keyOutWhite(src) {
  const img = sharp(src).ensureAlpha();
  const { width, height } = await img.metadata();
  const raw = await img.raw().toBuffer();
  const out = Buffer.from(raw); // copy

  // Thresholds
  const WHITE_HI = 252;   // pure-white zone: fully transparent
  const WHITE_LO = 225;   // edge feather band (225..252 → partial alpha)

  for (let i = 0; i < out.length; i += 4) {
    const r = out[i], g = out[i + 1], b = out[i + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const neutral = mx - mn <= 10;
    if (!neutral) continue;

    if (mx >= WHITE_HI) {
      out[i + 3] = 0;
    } else if (mx >= WHITE_LO) {
      // feather: alpha linearly from 255→0 as mx goes from WHITE_LO→WHITE_HI
      const t = (mx - WHITE_LO) / (WHITE_HI - WHITE_LO);
      out[i + 3] = Math.round(out[i + 3] * (1 - t));
    }
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function processBuilding(srcFile, name) {
  const dstDir = path.join(OUT_BLD, name);
  await fs.mkdir(dstDir, { recursive: true });

  const src = path.join(GEN, srcFile);
  const hasWhite = await hasWhiteBackground(src);
  log(`B.${name}: white-bg=${hasWhite}`);

  // Get pixel buffer after potential keying
  const keyedBuf = hasWhite ? await keyOutWhite(src) : await fs.readFile(src);

  // Trim transparent padding
  const trimmed = await sharp(keyedBuf)
    .trim({ threshold: 1 }) // trim based on alpha == 0
    .toBuffer();

  // Resize longer edge → 1024, preserve aspect
  const meta = await sharp(trimmed).metadata();
  const longer = Math.max(meta.width, meta.height);
  const targetLong = 1024;
  const resized = await sharp(trimmed)
    .resize({
      width: meta.width >= meta.height ? targetLong : undefined,
      height: meta.height > meta.width ? targetLong : undefined,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .toBuffer();

  // Save
  const pngPath = path.join(dstDir, 'main.png');
  const webpPath = path.join(dstDir, 'main.webp');
  await sharp(resized).png({ compressionLevel: 9 }).toFile(pngPath);
  await sharp(resized).webp({ quality: 90 }).toFile(webpPath);

  const m2 = await sharp(resized).metadata();
  const s1 = (await fs.stat(pngPath)).size / 1024;
  const s2 = (await fs.stat(webpPath)).size / 1024;
  log(`B.${name}: trimmed ${meta.width}×${meta.height} → ${m2.width}×${m2.height}, PNG ${s1.toFixed(0)}KB, WebP ${s2.toFixed(0)}KB`);
}

/* ---------------------------- main ---------------------------- */

async function main() {
  await processMap();

  await processBuilding('b_village_hall.png', 'village-hall-v2');
  await processBuilding('b_forge.png',        'forge');
  await processBuilding('b_sheep_pen.png',    'sheep-pen');

  log('done.');
}

main().catch(e => { console.error(e); process.exit(1); });
