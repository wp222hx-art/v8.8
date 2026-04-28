/**
 * 🗂️ BuildingRegistry — landmark.id → 建筑 sprite 素材 & 微调参数
 *
 * 只列出"已经有素材"的建筑。其它 landmark 没有立牌就照旧用底图 +
 * AwakenMask 的彩色显色窗 —— 两种方式共存。
 *
 * 加一个新建筑流程：
 *   1. 用 gpt-image-2 + fal-bria-rmbg 生成透明立牌
 *   2. node scripts/process-sprites.cjs <id>
 *   3. 在本表加一条记录
 */
import type { BuildingAssetUrls } from './BuildingSprite';

export interface BuildingRegistryEntry {
  /** Must match `Landmark.id` in Landmarks.ts. */
  landmarkId: string;
  assets: BuildingAssetUrls;
  /** Optional micro-adjustments. */
  displayWidth?: number;
  baseOffset?: number;
  shadowHeightRatio?: number;
}

/**
 * Paths are served from `public/`, so `/assets/buildings/<id>/main.webp`
 * resolves to `public/assets/buildings/<id>/main.webp` at runtime.
 *
 * We prefer `.webp` (smaller) — it's universally supported on mobile in 2026.
 */
export const BUILDING_REGISTRY: BuildingRegistryEntry[] = [
  {
    landmarkId: 'village-hall',
    assets: {
      main: '/assets/buildings/village-hall/main.webp',
      shadow: '/assets/buildings/village-hall/shadow.webp',
    },
    // landmark radius is 170 → sprite spans ~1.3× so the roof fits inside the
    // reveal window and doesn't overflow the map frame.
    displayWidth: 220,
    // Slight downward bias so the base sits inside the watercolor window.
    baseOffset: 20,
  },
];

/** Lookup table keyed by landmark id. */
export const BUILDING_BY_LANDMARK: Map<string, BuildingRegistryEntry> = new Map(
  BUILDING_REGISTRY.map((e) => [e.landmarkId, e])
);

export function hasBuildingSprite(landmarkId: string): boolean {
  return BUILDING_BY_LANDMARK.has(landmarkId);
}
