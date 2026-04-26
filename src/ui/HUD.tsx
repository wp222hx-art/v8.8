/**
 * 📜 HUD — 主界面顶栏/侧栏/底栏（羊皮纸风格）
 *
 * 样式灵感直接来自 Rivershire reference 图。
 */
import { useWorldStore } from '@stores/worldStore';
import { Rarity, RARITY_LABEL as GLOBAL_RARITY_LABEL } from '@engine/HexMap';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

// Re-alias so local usage remains stable; sourced from engine.
const RARITY_LABEL = GLOBAL_RARITY_LABEL;

export function HUD() {
  const gold = useWorldStore((s) => s.gold);
  const energy = useWorldStore((s) => s.energy);
  const energyMax = useWorldStore((s) => s.energyMax);
  const revealedCount = useWorldStore((s) => s.revealedCount);

  return (
    <>
      {/* ========== TOP BAR ========== */}
      <div
        className="fixed top-0 left-0 right-0 z-30 pointer-events-none"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}
      >
        <div className="flex justify-between items-start px-3">
          <ResourcePlate icon="🪙" value={gold.toLocaleString()} />
          <ResourcePlate
            icon="⚡"
            value={`${energy}/${energyMax}`}
            progress={energy / energyMax}
            hint={energy < energyMax ? '+1 / 02:45' : ''}
          />
        </div>
      </div>

      {/* ========== LEFT SIDEBAR (ribbon tabs) ========== */}
      <div className="fixed left-0 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2 pointer-events-none">
        <SideTab icon="⭐" label="Events" badge={3} />
        <SideTab icon="🎒" label="Daily" badge={1} />
        <SideTab icon="📜" label="Mail" />
        <SideTab icon="🏆" label="Achievements" badge={2} />
        <SideTab icon="📖" label="Story" />
      </div>

      {/* ========== BOTTOM TABBAR ========== */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
      >
        <div className="mx-3 mb-2">
          <div className="relative parchment-bg rounded-2xl shadow-paper-deep border border-parchment-600/40 overflow-hidden">
            <div className="relative z-10 flex justify-around items-center py-2 px-2">
              <BottomTab icon="🗺️" label="Map" active />
              <BottomTab icon="👤" label="Villagers" badge={2} />
              <BottomTab icon="📗" label="Collection" badge={5} />
              <BottomTab icon="🛒" label="Shop" />
              <BottomTab icon="⚙️" label="Settings" />
            </div>
          </div>
        </div>
      </div>

      {/* ========== BOTTOM-LEFT: village title ========== */}
      <div
        className="fixed left-3 z-20 pointer-events-none"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
      >
        <div className="parchment-bg rounded-lg px-3 py-2 border border-parchment-600/40 shadow-parchment">
          <div className="relative z-10">
            <div className="font-story text-parchment-700 text-lg leading-none">
              Rivershire
            </div>
            <div className="font-hand text-parchment-600 text-xs">
              Chapter 1 · Day 1
            </div>
          </div>
        </div>
      </div>

      {/* ========== STAT pill: revealed count ========== */}
      <div
        className="fixed right-3 z-20 pointer-events-none"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
      >
        <div className="parchment-bg rounded-full px-3 py-1.5 border border-parchment-600/40 shadow-parchment flex items-center gap-1.5">
          <span className="relative z-10 font-hand text-parchment-700 text-sm">
            翻开 {revealedCount} 格
          </span>
        </div>
      </div>
    </>
  );
}

/* ---------------- Sub-components ---------------- */

function ResourcePlate({
  icon,
  value,
  progress,
  hint,
}: {
  icon: string;
  value: string;
  progress?: number;
  hint?: string;
}) {
  return (
    <div className="parchment-bg rounded-xl border border-parchment-600/40 shadow-parchment px-3 py-2 pointer-events-auto">
      <div className="relative z-10 flex items-center gap-2">
        <div className="text-2xl leading-none">{icon}</div>
        <div className="flex flex-col items-start leading-tight">
          <div className="font-story text-parchment-700 font-semibold text-base">
            {value}
          </div>
          {progress !== undefined && (
            <div className="w-20 h-1.5 bg-parchment-700/20 rounded-full overflow-hidden mt-0.5">
              <div
                className="h-full bg-gradient-to-r from-seal-lamp to-yellow-500 transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
          {hint && <div className="font-hand text-[10px] text-parchment-600">{hint}</div>}
        </div>
        <button className="wax-seal text-sm !w-6 !h-6" aria-label="+">
          +
        </button>
      </div>
    </div>
  );
}

function SideTab({
  icon,
  label,
  badge,
}: {
  icon: string;
  label: string;
  badge?: number;
}) {
  return (
    <div className="pointer-events-auto relative">
      <div className="ribbon-tab !pl-5">
        <span className="text-base">{icon}</span>
        <span>{label}</span>
      </div>
      {badge !== undefined && (
        <div className="absolute -top-1 -right-1 wax-seal !w-5 !h-5 !text-[10px]">
          {badge}
        </div>
      )}
    </div>
  );
}

function BottomTab({
  icon,
  label,
  active,
  badge,
}: {
  icon: string;
  label: string;
  active?: boolean;
  badge?: number;
}) {
  return (
    <button
      className={clsx(
        'relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-all',
        active
          ? 'bg-parchment-200/60 scale-105'
          : 'hover:bg-parchment-200/30'
      )}
    >
      <span className="text-2xl leading-none">{icon}</span>
      <span className="font-hand text-parchment-700 text-xs">{label}</span>
      {badge !== undefined && (
        <div className="absolute -top-0.5 right-0 wax-seal !w-4 !h-4 !text-[9px]">
          {badge}
        </div>
      )}
    </button>
  );
}

/* ---------------- Toast for reveal result ---------------- */

const RARITY_RING_COLOR: Record<Rarity, string> = {
  [Rarity.Common]: 'border-parchment-400',
  [Rarity.Fine]: 'border-seal-sage',
  [Rarity.Rare]: 'border-seal-blue',
  [Rarity.Epic]: 'border-purple-600',
  [Rarity.Legendary]: 'border-wax-red',
  [Rarity.Rainbow]: 'border-pink-400',
  [Rarity.Diamond]: 'border-cyan-300',
};

export function RevealToast({
  rarity,
  visible,
}: {
  rarity: Rarity | undefined;
  visible: boolean;
}) {
  return (
    <AnimatePresence>
      {visible && rarity && (
        <motion.div
          key={`${rarity}-${Date.now()}`}
          initial={{ opacity: 0, y: -24, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.9 }}
          transition={{ duration: 0.45, ease: [0.2, 0.9, 0.3, 1] }}
          className="fixed top-1/3 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
        >
          <div
            className={clsx(
              'parchment-bg px-5 py-3 rounded-xl border-2 shadow-paper-deep',
              RARITY_RING_COLOR[rarity]
            )}
          >
            <div className="relative z-10 text-center">
              <div className="font-hand text-parchment-600 text-xs">发现</div>
              <div className="font-story text-parchment-700 text-xl font-bold">
                {RARITY_LABEL[rarity]}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
