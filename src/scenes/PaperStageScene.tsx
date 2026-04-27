/**
 * 🎭 PaperStageScene — 方案 D · 纸片剧场完整舞台
 *
 * 层级（从远到近）：
 *   Z=-2  Backdrop        天空/远山/慢云     (screen-space, parallax 0.18)
 *   Z=-1  DistantLight    晨曦光柱/暖光晕    (screen-space, parallax 0.35)
 *   Z= 0  MainStage       底图 + Hotspot + Actor  (world-space,  parallax 1.00)
 *   Z=+1  InteractVeil    FogVeil + TearMask (world-space,  parallax 1.05)
 *   Z=+2  FrontMist       云絮/金粒子/萤火  (world-space,  parallax 1.35)
 *
 * 玩家流程：
 *   · 看到：远景天空 → 朦胧光柱 → 被雾膜半遮盖的 Rivershire → 前景飘着金粒子
 *   · 雾膜下会透出微弱的 hotspot 呼吸点
 *   · 点击热点 → 雾膜被"撕开"一个有机洞口 → 露出彩色底图 → 对应 landmark 弹文案
 *   · 玩家也能点击雾膜的空白位置 → 撕开一个小洞（不触发 landmark，但照样满足好奇心）
 *
 * URL 参数：
 *   ?reveal=all       启动时立刻撕开所有 landmark
 *   ?debug=1          把 PIXI app 挂到 window.__PIXI_APP__
 *   ?parallax=0       禁用 parallax（手机陀螺仪太晕时）
 */
import { useEffect, useRef, useState } from 'react';
import { Application, Assets, Graphics, Sprite, Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { Landmark, RIVERSHIRE_LANDMARKS, MOOD_COLORS } from '@engine/Landmarks';
import { PaperStage, StageLayer } from '@engine/stage/PaperStage';
import { Backdrop } from '@engine/stage/Backdrop';
import { DistantLight } from '@engine/stage/DistantLight';
import { FogVeil } from '@engine/stage/FogVeil';
import { FrontMist } from '@engine/stage/FrontMist';
import { HotspotLayer } from '@engine/stage/HotspotLayer';
import { ActorLayer } from '@engine/stage/ActorLayer';

const MAP_URL = '/assets/maps/rivershire.png';
const MAP_W = 1328;
const MAP_H = 1760;

interface Props {
  onAwaken?: (landmark: Landmark) => void;
}

export function PaperStageScene({ onAwaken }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const stageRef = useRef<PaperStage | null>(null);
  const fogRef = useRef<FogVeil | null>(null);
  const hotspotsRef = useRef<HotspotLayer | null>(null);
  const actorsRef = useRef<ActorLayer | null>(null);

  const onAwakenRef = useRef(onAwaken);
  useEffect(() => { onAwakenRef.current = onAwaken; }, [onAwaken]);

  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('点燃烛火…');
  const [lastLandmark, setLastLandmark] = useState<Landmark | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanupResize: (() => void) | null = null;
    let cleanupPointer: (() => void) | null = null;

    (async () => {
      const host = hostRef.current;
      if (!host) return;

      // === 1. Pixi init ===
      setLoadingText('点燃烛火…');
      const app = new Application();
      await app.init({
        resizeTo: host,
        background: '#0c0a14',
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (disposed) { safeDestroy(app); return; }

      host.appendChild(app.canvas);
      app.canvas.classList.add('pixi-stage');
      appRef.current = app;

      try {
        if (new URLSearchParams(window.location.search).get('debug') === '1') {
          (window as any).__PIXI_APP__ = app;
        }
      } catch {}

      // === 2. Build PaperStage (5-layer manager) ===
      setLoadingText('搭起纸片舞台…');
      const stage = new PaperStage(app);
      stageRef.current = stage;

      // Layer modules
      const backdrop = new Backdrop();
      stage.register(StageLayer.Backdrop, backdrop);

      const distantLight = new DistantLight();
      stage.register(StageLayer.DistantLight, distantLight);

      // === 3. Load map texture ===
      setLoadingText('铺开 Rivershire 水彩地图…');
      let tex: Texture;
      try {
        tex = await Assets.load<Texture>(MAP_URL);
      } catch (e) {
        console.error('[PaperStageScene] map load failed:', e);
        if (!disposed) { setLoadingText('地图加载失败，请刷新'); setLoading(false); }
        return;
      }
      if (disposed) { safeDestroy(app); return; }

      // === 4. MainStage — base map + border ===
      const mainLayer = stage.getLayer(StageLayer.MainStage);
      const mapSprite = new Sprite(tex);
      mapSprite.width = MAP_W;
      mapSprite.height = MAP_H;
      mapSprite.label = 'map-base';
      mainLayer.addChild(mapSprite);

      // Parchment-edge border — subtle, inside the map rectangle.
      const border = new Graphics();
      border.rect(0, 0, MAP_W, MAP_H).stroke({
        color: 0x4a3420, width: 14, alpha: 0.55,
      });
      border.rect(3, 3, MAP_W - 6, MAP_H - 6).stroke({
        color: 0xd6b47a, width: 2, alpha: 0.32,
      });
      mainLayer.addChild(border);

      // === 5. ActorLayer (above map, below fog veil) ===
      const actors = new ActorLayer();
      mainLayer.addChild(actors.container);
      actorsRef.current = actors;

      // === 6. InteractVeil — FogVeil + TearMask ===
      setLoadingText('铺下朝雾…');
      const fog = new FogVeil(MAP_W, MAP_H);
      stage.register(StageLayer.InteractVeil, fog);
      fogRef.current = fog;

      // === 7. HotspotLayer (sits ON TOP of the fog so the breathing lights
      //      are always visible — imagine candles seen through rice paper).
      //      Must be added to the FogVeil's container at the very end so its
      //      children naturally render after the veil sprite. ===
      setLoadingText('点亮雾中的星火…');
      const hotspots = new HotspotLayer(RIVERSHIRE_LANDMARKS);
      fog.container.addChild(hotspots.container);
      hotspotsRef.current = hotspots;

      // === 8. FrontMist — floating clouds + gold dust + fireflies ===
      setLoadingText('放飞金粉尘…');
      const front = new FrontMist(MAP_W, MAP_H);
      stage.register(StageLayer.FrontMist, front);

      // === 9. Wire hotspot tap → tear ===
      hotspots.onHotspotTap = ({ landmark }) => {
        openLandmarkTear(landmark);
      };

      const openLandmarkTear = (lm: Landmark) => {
        const mood = MOOD_COLORS[lm.mood];
        fog.openTear({
          x: lm.cx, y: lm.cy,
          radius: lm.radius,
          moodColor: mood.primary,
          onDone: () => { /* could spawn particle burst here */ },
        });
        hotspots.extinguish(lm.id);
        setLastLandmark(lm);
        onAwakenRef.current?.(lm);
      };

      // Ambient "free-tear" — player can poke empty fog to get a small peek hole.
      // We hit-test in map coordinates; only allow if it's NOT on a landmark.
      mainLayer.eventMode = 'static';
      fog.container.eventMode = 'static';
      const freeTear = (worldX: number, worldY: number) => {
        // Avoid double-triggering right on top of a hotspot (hotspot already handled it)
        for (const lm of RIVERSHIRE_LANDMARKS) {
          const dx = worldX - lm.cx, dy = worldY - lm.cy;
          if (dx * dx + dy * dy < 80 * 80) return; // near hotspot, skip
        }
        fog.openTear({
          x: worldX, y: worldY,
          radius: 55 + Math.random() * 25,
          moodColor: 0xf6c048,
        });
      };

      const onWorldPointerTap = (ev: any) => {
        // ev.global is in screen-CSS coords; convert to world.
        const pt = ev.data?.global ?? ev.global ?? ev;
        try {
          const local = stage.world.toLocal({ x: pt.x, y: pt.y });
          // Ignore taps outside the map rectangle
          if (local.x < 0 || local.x > MAP_W || local.y < 0 || local.y > MAP_H) return;
          freeTear(local.x, local.y);
        } catch {}
      };
      fog.container.on('pointertap', onWorldPointerTap);
      cleanupPointer = () => {
        try { fog.container.off('pointertap', onWorldPointerTap); } catch {}
      };

      // === 10. Fit world to viewport ===
      const fitWorld = () => {
        if (disposed || !app.renderer) return;
        const sw = app.screen.width, sh = app.screen.height;
        backdrop.onResize(sw, sh);
        distantLight.onResize(sw, sh);

        const mx = 12, mTop = 74, mBottom = 140;
        const availW = sw - mx * 2;
        const availH = sh - mTop - mBottom;
        const s = Math.min(availW / MAP_W, availH / MAP_H);
        stage.world.scale.set(s);
        stage.world.position.set(
          (sw - MAP_W * s) / 2,
          mTop + (availH - MAP_H * s) / 2
        );
        stage.onResize(sw, sh);
      };
      fitWorld();

      const ro = new ResizeObserver(fitWorld);
      ro.observe(host);
      cleanupResize = () => ro.disconnect();

      // === 11. Parallax input (mouse / touch / gyro) ===
      const parallaxEnabled =
        new URLSearchParams(window.location.search).get('parallax') !== '0';
      let onMouse: ((e: PointerEvent) => void) | null = null;
      if (parallaxEnabled) {
        onMouse = (e: PointerEvent) => {
          const rect = host.getBoundingClientRect();
          const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
          stage.setParallaxInput(nx * -1, ny * -1);
        };
        host.addEventListener('pointermove', onMouse);
      }

      // === 12. Ticker ===
      app.ticker.add((ticker) => {
        stage.tick(ticker.deltaMS);
      });

      // === 13. ?reveal=all — instant open every landmark ===
      try {
        const p = new URLSearchParams(window.location.search);
        if (p.get('reveal') === 'all') {
          for (const lm of RIVERSHIRE_LANDMARKS) {
            fog.forceOpen({
              x: lm.cx, y: lm.cy,
              radius: lm.radius,
              moodColor: MOOD_COLORS[lm.mood].primary,
            });
            hotspots.extinguish(lm.id);
          }
          console.log('[PaperStageScene] 🟢 reveal=all — everything unlocked');
        }
      } catch {}

      setLoading(false);

      // Cleanup extra
      const prevCleanupResize = cleanupResize;
      cleanupResize = () => {
        prevCleanupResize?.();
        if (onMouse) host.removeEventListener('pointermove', onMouse);
      };
    })();

    return () => {
      disposed = true;
      cleanupResize?.();
      cleanupPointer?.();
      try { hotspotsRef.current?.dispose(); } catch {}
      hotspotsRef.current = null;
      try { actorsRef.current?.dispose(); } catch {}
      actorsRef.current = null;
      try { stageRef.current?.dispose(); } catch {}
      stageRef.current = null;
      fogRef.current = null;
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
          'radial-gradient(ellipse at 50% 42%, #241a2e 0%, #0c0a14 78%)',
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
          key={lastLandmark.id + '-' + Date.now()}
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
            ✦ 雾中浮现一处风景
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
