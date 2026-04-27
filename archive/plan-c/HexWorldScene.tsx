/**
 * 🌍 HexWorldScene — Rivershire Paper Theater main stage
 *
 * Architecture (new v2):
 *   · One Container "world" in IMAGE-PIXEL space (1328×1780).
 *      - child 0: rivershire.png (full painted terrain)
 *      - child 1: vignette darkening frame (stays inside the map)
 *      - child 2: fog-hex overlay (6×8 = 48 HexCellSprite)
 *   · The whole world is uniformly scaled to fit the viewport
 *     (with room for HUD bars).
 *   · Click a fogged hex → store flips its state → scene runs the
 *     reveal animation → the painted pixels beneath become visible.
 *
 * The outer frame/background (outside the map) is a warm candle-lit
 * gradient, matching the Rivershire reference screenshot.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Application,
  Container,
  Sprite,
  Texture,
  Assets,
  Graphics,
} from 'pixi.js';
import { useWorldStore } from '@stores/worldStore';
import {
  mountHexGrid,
  HexCellSprite,
  preloadHexTextures,
} from '@engine/HexSprites';
import {
  HexState,
  gridBounds,
  MAP_IMAGE_W,
  MAP_IMAGE_H,
} from '@engine/HexMap';
import { buildDebugGrid, isDebugGridEnabled } from '@engine/DebugGrid';

interface HexWorldSceneProps {
  onReveal?: (cellId: string) => void;
}

export function HexWorldScene({ onReveal }: HexWorldSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const spritesRef = useRef<Map<string, HexCellSprite>>(new Map());
  // Keep the latest onReveal in a ref so the mount-once effect can call it
  // without depending on the callback identity (which changes every render
  // and would otherwise destroy/rebuild the heavy Pixi scene on every reveal).
  const onRevealRef = useRef(onReveal);
  useEffect(() => { onRevealRef.current = onReveal; }, [onReveal]);
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState('翻开羊皮纸…');

  useEffect(() => {
    let disposed = false;
    let cleanupResize: (() => void) | null = null;
    let unsubStore: (() => void) | null = null;

    (async () => {
      const host = hostRef.current;
      if (!host) return;

      // ===== Step 1 · Pixi init =====
      setLoadingText('点燃烛火…');
      const app = new Application();
      await app.init({
        resizeTo: host,
        background: '#1a1823',
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (disposed) {
        try { app.destroy(true, { children: true, texture: false }); } catch {}
        return;
      }
      host.appendChild(app.canvas);
      app.canvas.classList.add('pixi-stage');
      appRef.current = app;

      const safe = (fn: () => void) => {
        if (disposed || !appRef.current || !app.renderer) return;
        try { fn(); } catch {}
      };

      // ===== Step 2 · Backdrop (outside the map) =====
      // Warm candle-lit gradient behind the map — vignette-style.
      const backdrop = new Graphics();
      backdrop.label = 'backdrop';
      app.stage.addChild(backdrop);
      const redrawBackdrop = () => safe(() => {
        const sw = app.screen.width;
        const sh = app.screen.height;
        backdrop.clear();
        backdrop.rect(0, 0, sw, sh);
        backdrop.fill({ color: 0x1a1823 });
        // Gentle warm halo
        const cx = sw / 2;
        const cy = sh / 2;
        const rMax = Math.max(sw, sh) * 0.7;
        backdrop.circle(cx, cy, rMax);
        backdrop.fill({ color: 0x5a4630, alpha: 0.18 });
        backdrop.circle(cx, cy, rMax * 0.55);
        backdrop.fill({ color: 0xf8d9a0, alpha: 0.05 });
      });
      redrawBackdrop();
      app.renderer.on('resize', redrawBackdrop);

      // ===== Step 3 · World container (image-pixel space) =====
      setLoadingText('铺开 Rivershire 画卷…');
      const world = new Container();
      world.label = 'world';
      app.stage.addChild(world);

      // --- 3a · Map image as background (fills the whole world) ---
      let mapSprite: Sprite | null = null;
      try {
        const tex = await Assets.load<Texture>('/assets/maps/rivershire.png');
        if (disposed) {
          try { app.destroy(true, { children: true, texture: false }); } catch {}
          return;
        }
        mapSprite = new Sprite(tex);
        mapSprite.width = MAP_IMAGE_W;
        mapSprite.height = MAP_IMAGE_H;
        mapSprite.position.set(0, 0);
        world.addChild(mapSprite);
      } catch (e) {
        console.warn('[scene] Rivershire map load failed:', e);
      }

      // --- 3b · Soft edge vignette on the map itself ---
      const mapVignette = new Graphics();
      mapVignette.label = 'map-vignette';
      // A thin warm frame that hints parchment edges
      mapVignette.rect(0, 0, MAP_IMAGE_W, MAP_IMAGE_H);
      mapVignette.stroke({ color: 0x3b2a1a, width: 18, alpha: 0.55 });
      world.addChild(mapVignette);

      // ===== Step 4 · (Legacy) preload — now a no-op =====
      await preloadHexTextures();
      if (disposed) {
        try { app.destroy(true, { children: true, texture: false }); } catch {}
        return;
      }

      // ===== Step 5 · Build hex fog grid =====
      setLoadingText('洒下迷雾…');
      if (useWorldStore.getState().cells.size === 0) {
        useWorldStore.getState().initWorld();
      }
      const { cells } = useWorldStore.getState();
      const hexLayer = new Container();
      hexLayer.label = 'fog-hex-layer';
      world.addChild(hexLayer);

      const sprites = mountHexGrid(hexLayer, cells);
      spritesRef.current = sprites;

      // Wire clicks → store
      for (const [, sprite] of sprites) {
        sprite.onClick = (cell) => {
          if (cell.state !== HexState.FOGGED) return;
          useWorldStore.getState().revealCell(cell.id);
        };
      }

      // ===== Step 5b · Debug grid overlay (enabled with ?grid=1) =====
      if (isDebugGridEnabled()) {
        const dbg = buildDebugGrid(cells);
        world.addChild(dbg);
        console.log('[scene] 🔴 debug grid enabled (?grid=1)');
      }

      // ===== Step 5c · Hide fog entirely with ?reveal=all (peek painted map) =====
      try {
        const p = new URLSearchParams(window.location.search);
        if (p.get('reveal') === 'all') {
          hexLayer.visible = false;
          console.log('[scene] 🟢 reveal=all — fog hidden');
        }
      } catch {}

      // Subscribe to store → fire reveal animation when state flips
      unsubStore = useWorldStore.subscribe((state) => {
        state.cells.forEach((cell, id) => {
          const sp = spritesRef.current.get(id);
          if (!sp) return;
          if (
            cell.state !== HexState.FOGGED &&
            sp.data.state === HexState.FOGGED
          ) {
            sp.reveal(cell.terrain, cell.rarity, () => onRevealRef.current?.(id));
          }
        });
      });

      // ===== Step 6 · Fit world to viewport =====
      const { width: gw, height: gh } = gridBounds();
      const fitWorld = () => safe(() => {
        const sw = app.screen.width;
        const sh = app.screen.height;
        // Leave room for HUD top (~70) + bottom (~130)
        const marginX = 16;
        const marginTop = 74;
        const marginBottom = 150;
        const availW = sw - marginX * 2;
        const availH = sh - marginTop - marginBottom;
        const s = Math.min(availW / gw, availH / gh);
        world.scale.set(s);
        world.position.set(
          (sw - gw * s) / 2,
          marginTop + (availH - gh * s) / 2
        );
      });
      fitWorld();

      // ===== Step 7 · Subtle world breathing =====
      // We purposefully do NOT rotate the world — a tilt around (0,0) would
      // swing the whole map off-screen.  Per-cell swirl motion is enough to
      // make the theater feel alive.  (Keeping ticker hook for future hooks.)
      app.ticker.add(() => {
        /* reserved: per-frame world animations */
      });

      // ===== Step 8 · Resize observer =====
      const ro = new ResizeObserver(() => {
        fitWorld();
        redrawBackdrop();
      });
      ro.observe(host);
      cleanupResize = () => ro.disconnect();

      setLoading(false);
    })();

    return () => {
      disposed = true;
      cleanupResize?.();
      unsubStore?.();
      // Kill every per-hex tween BEFORE destroying Pixi objects.
      for (const sp of spritesRef.current.values()) {
        try { sp.killAllTweens(); } catch {}
      }
      const app = appRef.current;
      if (app) {
        try {
          app.destroy(true, { children: true, texture: false });
        } catch {}
        appRef.current = null;
      }
      spritesRef.current.clear();
    };
    // Intentionally run ONCE on mount — Pixi scene is heavy to rebuild.
    // `onReveal` is captured via a ref below so we don't re-init when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={hostRef}
      className="relative w-full h-full overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 50% 40%, #3d3545 0%, #1a1823 75%)',
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
    </div>
  );
}
