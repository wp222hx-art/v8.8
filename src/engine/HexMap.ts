/**
 * 🔷 HexMap — 六边形网格 · 纯数学版
 *
 * 设计原则：
 *   · pointy-top 六边形，rectangle 布局
 *   · 自生成网格（无第三方库依赖），每格存像素中心坐标
 *   · 坐标系：逻辑像素（world-local）—— 由 HexWorldScene.fitWorld 缩放到屏幕
 *
 * 公式（pointy-top, size = circumradius r）：
 *   width  = sqrt(3) * r
 *   height = 2 * r
 *   horiz spacing = sqrt(3) * r
 *   vert  spacing = 1.5 * r
 *   odd rows 水平偏移 +sqrt(3)*r/2
 */

// ---------------------------------------------------------------- enums
export enum HexState {
  FOGGED = 'fogged',
  REVEALING = 'revealing',
  REVEALED = 'revealed',
}

export enum Terrain {
  Forest = 'forest',
  Grassland = 'grassland',
  Wheat = 'wheat',
  River = 'river',
  Mountain = 'mountain',
  Ruins = 'ruins',
  Village = 'village',
  Marsh = 'marsh',
  Desert = 'desert',
  Snow = 'snow',
  Lava = 'lava',
  Fogged = 'fogged',
}

export enum Rarity {
  Common = 'common',
  Fine = 'fine',
  Rare = 'rare',
  Epic = 'epic',
  Legendary = 'legendary',
  Rainbow = 'rainbow',
  Diamond = 'diamond',
}

// ---------------------------------------------------------------- constants
/**
 * The Rivershire map PNG dimensions (source art at full resolution).
 * The world lives in IMAGE-PIXEL space: (0,0) at top-left of this image,
 * (MAP_IMAGE_W, MAP_IMAGE_H) at bottom-right.
 * We then uniformly scale the whole world to fit the viewport.
 */
export const MAP_IMAGE_W = 1328;
export const MAP_IMAGE_H = 1760;

/**
 * Circumradius of each hex in world-local (image) pixels.
 *
 * The painted Rivershire art is 1328×1760 px.  We use a 6×10 pointy-top grid.
 *
 *   horiz spacing = √3·r
 *   6 cols + half-offset odd row  →  6.5·√3·r ≤ 1328  →  r ≤ 118
 *   10 rows (9·1.5r + 2r)         →  15.5r      ≤ 1760  →  r ≤ 113
 *
 * r = 110 gives the grid a tiny padding around the painted parchment while
 * letting every hex sit fully inside the art.
 */
export const HEX_RADIUS = 110;
/** Legacy alias used by some older code paths. */
export const HEX_SIZE = HEX_RADIUS;

/** Grid dimensions — 6 cols × 10 rows covers the whole Rivershire art. */
export const GRID_COLS = 6;
export const GRID_ROWS = 10;

// Derived spacings for pointy-top
export const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;      // ≈ 190.5
export const HEX_HEIGHT = 2 * HEX_RADIUS;                // = 220
export const HORIZ_SPACING = HEX_WIDTH;                  // ≈ 190.5
export const VERT_SPACING = 1.5 * HEX_RADIUS;            // = 165

/** Total grid bounds (used for fitting to viewport). */
const GRID_TOTAL_W = GRID_COLS * HORIZ_SPACING + HEX_WIDTH / 2; // include odd-row offset
const GRID_TOTAL_H = (GRID_ROWS - 1) * VERT_SPACING + HEX_HEIGHT;

/**
 * Starting center so the full grid sits centered inside the MAP_IMAGE.
 * First cell center = (HEX_WIDTH/2 + pad, HEX_RADIUS + pad) in world-local space
 * where pad places the whole grid centered within the image.
 */
export const GRID_X0 = (MAP_IMAGE_W - GRID_TOTAL_W) / 2 + HEX_WIDTH / 2;
export const GRID_Y0 = (MAP_IMAGE_H - GRID_TOTAL_H) / 2 + HEX_RADIUS;

// ---------------------------------------------------------------- data
export interface HexCellData {
  id: string;      // "col,row"
  col: number;
  row: number;
  cx: number;      // pixel center X (world-local)
  cy: number;      // pixel center Y (world-local)
  state: HexState;
  terrain: Terrain;
  rarity: Rarity;
  firstRevealedAt?: number;
}

/**
 * Build an offset-r staggered pointy-top grid in world-local px.
 * (0,0) top-left corner lives at approx (HEX_WIDTH/2, HEX_RADIUS).
 */
export function buildStaggeredGrid(
  cols = GRID_COLS,
  rows = GRID_ROWS
): Map<string, HexCellData> {
  const map = new Map<string, HexCellData>();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const offset = row % 2 === 1 ? HEX_WIDTH / 2 : 0;
      const cx = GRID_X0 + col * HORIZ_SPACING + offset;
      const cy = GRID_Y0 + row * VERT_SPACING;
      const id = `${col},${row}`;
      map.set(id, {
        id,
        col,
        row,
        cx,
        cy,
        state: HexState.FOGGED,
        terrain: Terrain.Fogged,
        rarity: Rarity.Common,
      });
    }
  }
  return map;
}

/**
 * Bounds of the "world" — which is the full map image, since fog hexes
 * are layered on top of it. The scene uses this to compute uniform scaling.
 */
export function gridBounds() {
  return { width: MAP_IMAGE_W, height: MAP_IMAGE_H };
}

// ---------------------------------------------------------------- rarity
export function rollRarity(rand: () => number = Math.random): Rarity {
  const r = rand();
  if (r < 0.0005) return Rarity.Diamond;
  if (r < 0.0030) return Rarity.Rainbow;
  if (r < 0.0150) return Rarity.Legendary;
  if (r < 0.0500) return Rarity.Epic;
  if (r < 0.1500) return Rarity.Rare;
  if (r < 0.3500) return Rarity.Fine;
  return Rarity.Common;
}

// ---------------------------------------------------------------- terrain
const TERRAIN_POOL: Terrain[] = [
  Terrain.Forest,
  Terrain.Grassland,
  Terrain.Wheat,
  Terrain.River,
  Terrain.Mountain,
  Terrain.Ruins,
  Terrain.Village,
  Terrain.Marsh,
];

export function rollTerrain(rand: () => number = Math.random): Terrain {
  return TERRAIN_POOL[Math.floor(rand() * TERRAIN_POOL.length)];
}

// ---------------------------------------------------------------- colors & labels
export const RARITY_COLOR: Record<Rarity, number> = {
  [Rarity.Common]: 0xFFFFFF,
  [Rarity.Fine]: 0x6B8E23,
  [Rarity.Rare]: 0x4A6FA5,
  [Rarity.Epic]: 0x8E44AD,
  [Rarity.Legendary]: 0xB22222,
  [Rarity.Rainbow]: 0xE8A87C,
  [Rarity.Diamond]: 0x9AE7FF,
};

export const RARITY_LABEL: Record<Rarity, string> = {
  [Rarity.Common]: '普通',
  [Rarity.Fine]: '精良',
  [Rarity.Rare]: '稀有',
  [Rarity.Epic]: '史诗',
  [Rarity.Legendary]: '传奇',
  [Rarity.Rainbow]: '彩虹',
  [Rarity.Diamond]: '钻石',
};

export const TERRAIN_LABEL: Record<Terrain, string> = {
  [Terrain.Forest]: '森林',
  [Terrain.Grassland]: '草原',
  [Terrain.Wheat]: '麦田',
  [Terrain.River]: '河流',
  [Terrain.Mountain]: '山脉',
  [Terrain.Ruins]: '遗迹',
  [Terrain.Village]: '村庄',
  [Terrain.Marsh]: '沼泽',
  [Terrain.Desert]: '沙漠',
  [Terrain.Snow]: '雪原',
  [Terrain.Lava]: '熔岩',
  [Terrain.Fogged]: '迷雾',
};
