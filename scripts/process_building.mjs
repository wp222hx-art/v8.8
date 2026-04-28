/**
 * Process a single AI-generated building sprite:
 *   1. Trim transparent/near-transparent borders
 *   2. Resize so the longest side = TARGET (keeps aspect)
 *   3. Export to PNG + WebP for use in ActorLayer
 *
 * Usage: node scripts/process_building.mjs <src> <out_name>
 *   e.g. node scripts/process_building.mjs /tmp/gen/villagehall_rmbg.png village_hall
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const [, , srcArg, nameArg] = process.argv;
const src = srcArg ?? '/tmp/gen/villagehall_rmbg.png';
const name = nameArg ?? 'village_hall';
const outDir = '/home/user/webapp/public/assets/buildings';
mkdirSync(outDir, { recursive: true });

const TARGET = 512;                // longest side of the final sprite
const SHADOW_FEATHER = 10;         // blur radius for the companion shadow
const SHADOW_ALPHA = 0.45;         // max shadow opacity

// ---------- 1) Trim + resize the building itself ----------
// `.trim()` in Sharp removes pixels matching the corner colour OR fully
// transparent if there's an alpha channel. Our input is RGBA with a
// transparent background, so trim() will snip to the visible bounds.
const trimmed = sharp(src).trim({ threshold: 5 });
const meta = await trimmed.metadata();
console.log('[trim] bbox:', meta.width, 'x', meta.height);

// Resize keeping aspect; use lanczos3 for crisp thatch / timber detail.
const longest = Math.max(meta.width, meta.height);
const scale = TARGET / longest;
const tw = Math.round(meta.width * scale);
const th = Math.round(meta.height * scale);

const pngOut = path.join(outDir, `${name}.png`);
const webpOut = path.join(outDir, `${name}.webp`);

// Produce a shared buffer so we can fork it into PNG and WebP.
const resizedBuf = await trimmed
  .resize(tw, th, { fit: 'fill', kernel: 'lanczos3' })
  .png({ compressionLevel: 9 })
  .toBuffer();

await sharp(resizedBuf).toFile(pngOut);
await sharp(resizedBuf).webp({ quality: 90, effort: 6 }).toFile(webpOut);

console.log('✓ main sprite:');
console.log('   ', pngOut);
console.log('   ', webpOut, `(${tw}×${th})`);

// ---------- 2) Companion shadow ----------
// Classic diorama trick: take the silhouette (alpha channel), squash it
// vertically, blur it, and tint it near-black with moderate alpha.
// Saves us from asking the AI for a separate shadow image.
//
// NOTE: extractChannel() returns a 1-channel greyscale image where the
// raw bytes represent the alpha values. We need to re-wrap it as raw
// pixel data so subsequent Sharp ops know the dimensions.
const alpha = await sharp(resizedBuf)
  .extractChannel('alpha')
  .raw()                 // output raw bytes (no PNG container)
  .toBuffer();

const shadowW = tw;
const shadowH = Math.max(1, Math.round(th * 0.50));   // squash vertically
const shadowGrey = await sharp(alpha, {
  raw: { width: tw, height: th, channels: 1 },
})
  .resize(shadowW, shadowH, { fit: 'fill' })
  .blur(SHADOW_FEATHER)
  .raw()                 // keep raw for the joinChannel step below
  .toBuffer();

// Tint it: build an RGBA buffer by hand where
//   - RGB = dark brown everywhere
//   - A   = the blurred silhouette (scaled by SHADOW_ALPHA)
// This is more reliable than joinChannel + create {} which has subtle
// behaviour around alphaMode in libvips.
const rgba = Buffer.alloc(shadowW * shadowH * 4);
const R = 26, G = 18, B = 10;
for (let i = 0, j = 0; i < shadowGrey.length; i++, j += 4) {
  rgba[j]     = R;
  rgba[j + 1] = G;
  rgba[j + 2] = B;
  rgba[j + 3] = Math.min(255, Math.round(shadowGrey[i] * SHADOW_ALPHA));
}
const tintedBuf = await sharp(rgba, {
  raw: { width: shadowW, height: shadowH, channels: 4 },
})
  .png({ compressionLevel: 9 })
  .toBuffer();

const shadowPng = path.join(outDir, `${name}_shadow.png`);
const shadowWebp = path.join(outDir, `${name}_shadow.webp`);
await sharp(tintedBuf).toFile(shadowPng);
await sharp(tintedBuf).webp({ quality: 82, effort: 6 }).toFile(shadowWebp);

console.log('✓ shadow:');
console.log('   ', shadowPng);
console.log('   ', shadowWebp, `(${shadowW}×${shadowH})`);
