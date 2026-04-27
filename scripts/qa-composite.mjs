#!/usr/bin/env node
/**
 * QA Composite — paste the 3 building sprites onto the new map at their
 * correct landmark coordinates to visually validate alignment, scale, and style.
 *
 * Output: public/dev/shots/QA_map_with_sprites.png (1328×1760)
 */
import sharp from 'sharp';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// base map
const MAP = path.join(ROOT, 'public/assets/maps/rivershire.png');

// sprite → landmark coordinates (from src/engine/Landmarks.ts, 1328×1760 space)
// anchor.y = 0.85 means the building's bottom sits near cy.
const PLACEMENTS = [
  { sprite: 'buildings/village-hall-v2/main.png', cx: 600,  cy: 500,  targetW: 260 },
  { sprite: 'buildings/forge/main.png',            cx: 900,  cy: 680,  targetW: 240 },
  { sprite: 'buildings/sheep-pen/main.png',        cx: 1140, cy: 895,  targetW: 220 },
];

async function main() {
  const baseMeta = await sharp(MAP).metadata();
  console.log(`[qa] base map ${baseMeta.width}×${baseMeta.height}`);

  const composites = [];
  for (const p of PLACEMENTS) {
    const srcFile = path.join(ROOT, 'public/assets', p.sprite);
    const srcMeta = await sharp(srcFile).metadata();
    const scale = p.targetW / srcMeta.width;
    const w = Math.round(srcMeta.width * scale);
    const h = Math.round(srcMeta.height * scale);

    const resized = await sharp(srcFile).resize(w, h).toBuffer();

    // anchor: center horizontally at cx, bottom at (cy + 0.15*h) so cy is near the base of the building
    const anchorY = 0.88; // bottom anchor ratio
    const left = Math.round(p.cx - w / 2);
    const top  = Math.round(p.cy - h * anchorY);
    console.log(`[qa] ${path.basename(p.sprite)} ${srcMeta.width}×${srcMeta.height} → ${w}×${h} @ (${left}, ${top})`);
    composites.push({ input: resized, left, top });
  }

  const outPath = path.join(ROOT, 'public/dev/shots/QA_map_with_sprites.png');
  await sharp(MAP).composite(composites).png({ compressionLevel: 9 }).toFile(outPath);
  console.log(`[qa] wrote ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
