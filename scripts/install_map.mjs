/**
 * install_map.mjs — take the cleaned AI-generated diorama and install it as
 * the new Rivershire base map.
 *
 *   in : /tmp/gen/rivershire_diorama_clean.png  (AI-generated + text stripped,
 *                                                 880×1184 or similar)
 *   out: public/assets/maps/rivershire.png      (1328×1760, the live asset)
 *
 * We upscale with Lanczos to 1328×1760 which matches the MAP_W/MAP_H constants
 * used throughout the PaperStage scene, so no code changes are needed.
 */
import sharp from 'sharp';
import { statSync, copyFileSync } from 'node:fs';

const src = '/tmp/gen/rivershire_diorama_clean.png';
const out = '/home/user/webapp/public/assets/maps/rivershire.png';
const backup = '/home/user/webapp/public/assets/maps/rivershire_hex_legacy.png';

// 1. Back up the existing hex-cut map before overwriting.
try {
  copyFileSync(out, backup);
  console.log('✓ backed up legacy hex map →', backup);
} catch (e) {
  console.warn('(no legacy rivershire.png to back up)');
}

// 2. Upscale + resize to the target 1328×1760.
const info = await sharp(src).metadata();
console.log(`  source: ${info.width}×${info.height} (${info.format})`);

await sharp(src)
  .resize(1328, 1760, { fit: 'cover', kernel: 'lanczos3' })
  .png({ quality: 92, compressionLevel: 9 })
  .toFile(out);

const outInfo = await sharp(out).metadata();
const sz = statSync(out).size;
console.log('✓ wrote', out);
console.log(`  size: ${outInfo.width}×${outInfo.height} | ${(sz / 1024).toFixed(1)} KB`);
