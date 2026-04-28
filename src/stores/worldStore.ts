/**
 * 🌍 worldStore — 世界状态 · Zustand + Immer
 *
 * 管辖：
 *   · cells         — 六边形单元（位置 + 状态 + 地形 + 稀有度）
 *   · 资源          — 金币 / 精力 / 精力上限 / 幸福
 *   · 揭示日志      — 最近 30 次揭示
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  HexCellData,
  HexState,
  Terrain,
  Rarity,
  buildStaggeredGrid,
  rollRarity,
  rollTerrain,
  GRID_COLS,
  GRID_ROWS,
} from '@engine/HexMap';

export interface WorldState {
  cols: number;
  rows: number;
  cells: Map<string, HexCellData>;

  gold: number;
  energy: number;
  energyMax: number;
  happiness: number;

  revealedCount: number;
  lastRarity?: Rarity;
  lastTerrain?: Terrain;
  revealLog: Array<{ id: string; terrain: Terrain; rarity: Rarity; at: number }>;

  initWorld: () => void;
  revealCell: (id: string) => { terrain: Terrain; rarity: Rarity } | null;
  addGold: (amount: number) => void;
  refillEnergy: () => void;
}

const GOLD_REWARD: Record<Rarity, [number, number]> = {
  [Rarity.Common]: [1, 5],
  [Rarity.Fine]: [10, 30],
  [Rarity.Rare]: [50, 100],
  [Rarity.Epic]: [200, 500],
  [Rarity.Legendary]: [1000, 2000],
  [Rarity.Rainbow]: [5000, 5000],
  [Rarity.Diamond]: [10000, 10000],
};

function randRange([lo, hi]: [number, number]): number {
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

/** First reveal is Fine (newbie delight), then smart curve. */
function rollRarityForReveal(count: number): Rarity {
  if (count === 0) return Rarity.Fine;
  if (count === 3) return Rarity.Rare;     // scripted "aha" moment
  if (count < 10 && Math.random() < 0.18) return Rarity.Rare;
  if (count < 20 && Math.random() < 0.06) return Rarity.Epic;
  return rollRarity();
}

export const useWorldStore = create<WorldState>()(
  immer((set, get) => ({
    cols: GRID_COLS,
    rows: GRID_ROWS,
    cells: new Map(),

    gold: 120,
    energy: 58,
    energyMax: 80,
    happiness: 22,

    revealedCount: 0,
    revealLog: [],

    initWorld: () => {
      const cells = buildStaggeredGrid();
      set((s) => {
        s.cells = cells;
        s.revealedCount = 0;
        s.revealLog = [];
      });
    },

    revealCell: (id) => {
      const st = get();
      const cell = st.cells.get(id);
      if (!cell || cell.state !== HexState.FOGGED) return null;
      if (st.energy < 1) return null;

      const terrain = rollTerrain();
      const rarity = rollRarityForReveal(st.revealedCount);
      const gold = randRange(GOLD_REWARD[rarity]);

      set((s) => {
        const c = s.cells.get(id);
        if (!c) return;
        c.state = HexState.REVEALING;
        c.terrain = terrain;
        c.rarity = rarity;
        c.firstRevealedAt = Date.now();
        s.energy = Math.max(0, s.energy - 1);
        s.gold += gold;
        s.revealedCount += 1;
        s.lastRarity = rarity;
        s.lastTerrain = terrain;
        s.revealLog.unshift({ id, terrain, rarity, at: Date.now() });
        if (s.revealLog.length > 30) s.revealLog.pop();
      });

      return { terrain, rarity };
    },

    addGold: (amount) => {
      set((s) => {
        s.gold += amount;
      });
    },

    refillEnergy: () => {
      set((s) => {
        s.energy = s.energyMax;
      });
    },
  }))
);
