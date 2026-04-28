/**
 * 🎭 SYNAPSE · Paper Theater — App root
 *
 * 玩法：方案 D · 纸片剧场五幕舞台
 *   · 远景幕布：天空、远山、慢云
 *   · 远端光影：晨曦光柱、暖光晕
 *   · 主舞台：完整 Rivershire 底图 + 热点呼吸点 + 纸片人物（ActorLayer 预留）
 *   · 交互纸膜：朝雾 FogVeil + TearMask，点击可"撕开"
 *   · 前景大气：飘动云絮、金色粒子、萤火
 *   · HUD 仍展示金币/精力/翻开数等数据，由 worldStore 管辖
 */
import { useEffect, useState } from 'react';
import { PaperStageScene } from '@scenes/PaperStageScene';
import { HUD, RevealToast } from '@ui/HUD';
import { WelcomeBanner } from '@ui/WelcomeBanner';
import { HintOverlay } from '@ui/HintOverlay';
import { useWorldStore } from '@stores/worldStore';
import type { Landmark } from '@engine/Landmarks';

export default function App() {
  const lastRarity = useWorldStore((s) => s.lastRarity);
  const [toastKey, setToastKey] = useState(0);
  const [toastVisible, setToastVisible] = useState(false);

  // Make sure world store is initialized so HUD stats work.
  useEffect(() => {
    if (useWorldStore.getState().cells.size === 0) {
      useWorldStore.getState().initWorld();
    }
  }, []);

  const handleAwaken = (_landmark: Landmark) => {
    // Spend 1 energy, add a bit of gold, advance revealedCount so HUD reacts.
    const st = useWorldStore.getState();
    for (const [id, c] of st.cells) {
      if (c.state === 'fogged') {
        st.revealCell(id);
        break;
      }
    }
    setToastKey((k) => k + 1);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 1400);
  };

  // Prevent pull-to-refresh on mobile
  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      if (e.touches.length > 1) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => document.removeEventListener('touchmove', preventScroll);
  }, []);

  return (
    <div className="relative w-full h-full">
      <PaperStageScene onAwaken={handleAwaken} />
      <HUD />
      <WelcomeBanner />
      <HintOverlay />
      <RevealToast key={toastKey} rarity={lastRarity} visible={toastVisible} />
    </div>
  );
}
