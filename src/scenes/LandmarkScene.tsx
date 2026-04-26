/**
 * 🌄 LandmarkScene — 方案 C · 封蜡点位探索
 *
 * 渲染栈（自下而上）：
 *   backdrop      场景外的烛光渐变
 *   world (图像坐标系, 1328×1760)
 *     ├─ AwakenMask.container
 *     │    ├─ dimLayer      (褪色底图)
 *     │    ├─ colorLayer    (原色底图 + mask)
 *     │    ├─ mask           (alpha graphics — 累积显色窗)
 *     │    └─ fxLayer        (水彩扩散 + 金环)
 *     ├─ sealsContainer      (金色封蜡点 × N)
 *     └─ debugSeals (可选, ?seals=1 时)
 *
 * 玩家流程：
 *   · 看到：一整张褪色羊皮纸地图 + 几个金色封蜡脉搏点
 *   · 点击封蜡 → 封蜡爆裂、水彩扩散 → 该建筑区域显出彩色 + 金环
 *   · UI 底部弹出 landmark 文案
 */
import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Assets, Texture } from 'pixi.js';
import { AwakenMask } from '@engine/AwakenMask';
import { SealPoint } from '@engine/SealPoint';
import { Landmark, RIVERSHIRE_LANDMARKS } from '@engine/Landmarks';
import { buildSealsDebug, isSealsDebugEnabled } from '@engine/SealsDebug';

const MAP_URL = '/assets/maps/rivershire.png';
const MAP_W = 1328;
const MAP_H = 1760;

interface Props {
  onAwaken?: (landmark: Landmark) => void;
}

export function LandmarkScene({ onAwaken }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const maskRef = useRef<AwakenMask | null>(null);
  const sealsRef = useRef<Map<string, SealPoint>>(new Map());
  const onAwakenRef = useRef(onAwaken);
  useEffect(() => { onAwakenRef.current = onAwaken; }, [onAwaken]);

  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('翻开羊皮纸…');
  const [lastLandmark, setLastLandmark] = useState<Landmark | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanupResize: (() => void) | null = null;

    (async () => {
      const host = hostRef.current;
      if (!host) return;

      // === 1. Pixi init ===
      setLoadingText('点燃烛火…');
      const app = new Application();
      await app.init({
        resizeTo: host,
        background: '#14121c',
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (disposed) { safeDestroy(app); return; }

      host.appendChild(app.canvas);
      app.canvas.classList.add('pixi-stage');
      appRef.current = app;

      // === 2. Outer backdrop (candle-lit vignette) ===
      const backdrop = new Graphics();
      backdrop.label = 'backdrop';
      app.stage.addChild(backdrop);
      const drawBackdrop = () => {
        if (disposed || !app.renderer) return;
        const sw = app.screen.width, sh = app.screen.height;
        backdrop.clear();
        backdrop.rect(0, 0, sw, sh).fill({ color: 0x14121c });
        const cx = sw / 2, cy = sh / 2;
        const R = Math.max(sw, sh);
        backdrop.circle(cx, cy, R * 0.6).fill({ color: 0x4a3a2c, alpha: 0.28 });
        backdrop.circle(cx, cy * 0.85, R * 0.32).fill({ color: 0xf3d097, alpha: 0.08 });
      };
      drawBackdrop();

      // === 3. World container ===
      const world = new Container();
      world.label = 'world';
      app.stage.addChild(world);

      // === 4. Load map texture ===
      setLoadingText('铺开 Rivershire 水彩地图…');
      let tex: Texture;
      try {
        tex = await Assets.load<Texture>(MAP_URL);
      } catch (e) {
        console.error('[scene] map load failed:', e);
        if (!disposed) { setLoadingText('地图加载失败，请刷新'); setLoading(false); }
        return;
      }
      if (disposed) { safeDestroy(app); return; }

      // === 5. Build AwakenMask (desaturated + color layer + mask) ===
      setLoadingText('让颜色先入梦…');
      const mask = new AwakenMask(tex, MAP_W, MAP_H);
      world.addChild(mask.container);
      maskRef.current = mask;

      // === 6. Add a thin parchment border around the map ===
      const border = new Graphics();
      border.rect(0, 0, MAP_W, MAP_H).stroke({
        color: 0x4a3420, width: 14, alpha: 0.55,
      });
      border.rect(3, 3, MAP_W - 6, MAP_H - 6).stroke({
        color: 0xd6b47a, width: 2, alpha: 0.35,
      });
      world.addChild(border);

      // === 7. Place seal points ===
      setLoadingText('盖上金色封印…');
      const sealsContainer = new Container();
      sealsContainer.label = 'seals';
      world.addChild(sealsContainer);

      const landmarks = RIVERSHIRE_LANDMARKS;
      for (const lm of landmarks) {
        const seal = new SealPoint(lm);
        seal.position.set(lm.cx, lm.cy);
        seal.onAwaken = (landmark) => {
          // Animate mask reveal for this landmark
          maskRef.current?.revealLandmark(landmark);
          setLastLandmark(landmark);
          onAwakenRef.current?.(landmark);
        };
        sealsContainer.addChild(seal);
        sealsRef.current.set(lm.id, seal);
      }

      // === 8. Debug overlay (?seals=1) ===
      if (isSealsDebugEnabled()) {
        const dbg = buildSealsDebug(landmarks);
        world.addChild(dbg);
        console.log('[scene] 🔴 seals debug enabled');
      }

      // === 9. Optional: instantly reveal everything (?reveal=all) ===
      try {
        const p = new URLSearchParams(window.location.search);
        if (p.get('reveal') === 'all') {
          for (const lm of landmarks) {
            mask.forceReveal(lm);
            sealsRef.current.get(lm.id)?.awaken();
          }
          console.log('[scene] 🟢 reveal=all — everything unlocked');
        }
      } catch {}

      // === 10. Fit world to viewport ===
      const fitWorld = () => {
        if (disposed || !app.renderer) return;
        drawBackdrop();
        const sw = app.screen.width, sh = app.screen.height;
        const mx = 12, mTop = 74, mBottom = 140;
        const availW = sw - mx * 2;
        const availH = sh - mTop - mBottom;
        const s = Math.min(availW / MAP_W, availH / MAP_H);
        world.scale.set(s);
        world.position.set(
          (sw - MAP_W * s) / 2,
          mTop + (availH - MAP_H * s) / 2
        );
      };
      fitWorld();

      const ro = new ResizeObserver(fitWorld);
      ro.observe(host);
      cleanupResize = () => ro.disconnect();

      setLoading(false);
    })();

    return () => {
      disposed = true;
      cleanupResize?.();
      for (const s of sealsRef.current.values()) {
        try { s.dispose(); } catch {}
      }
      sealsRef.current.clear();
      try { maskRef.current?.dispose(); } catch {}
      maskRef.current = null;
      safeDestroy(appRef.current);
      appRef.current = null;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="relative w-full h-full overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 50% 42%, #3d3545 0%, #14121c 78%)',
      }}
    >
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="parchment-bg px-5 py-3 rounded-xl border border-parchment-600/40 shadow-parchment">
            <div className="relative z-10 font-story text-parchment-700 text-sm">
              {loadingText}
            </div>
          </div>
        </div>
      )}

      {lastLandmark && (
        <AwakenToast
          key={lastLandmark.id + Date.now()}
          landmark={lastLandmark}
        />
      )}
    </div>
  );
}

function safeDestroy(app: Application | null): void {
  if (!app) return;
  try { app.destroy(true, { children: true, texture: false }); } catch {}
}

/** Flavor toast: pops up when a landmark is awakened. */
function AwakenToast({ landmark }: { landmark: Landmark }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3600);
    return () => clearTimeout(t);
  }, [landmark]);
  return (
    <div
      className={`absolute left-1/2 -translate-x-1/2 bottom-28 z-20 pointer-events-none transition-all duration-500 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <div className="parchment-bg px-4 py-2.5 rounded-xl border border-parchment-600/50 shadow-parchment min-w-[240px] max-w-[320px]">
        <div className="relative z-10">
          <div className="font-hand text-parchment-600 text-xs mb-0.5">
            ✦ 唤醒了一处旧记忆
          </div>
          <div className="font-story text-parchment-900 text-base font-bold mb-1">
            {landmark.reveal.title}
          </div>
          <div className="font-story text-parchment-700 text-xs leading-snug">
            {landmark.reveal.flavor}
          </div>
        </div>
      </div>
    </div>
  );
}
