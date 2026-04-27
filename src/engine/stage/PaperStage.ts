/**
 * 🎭 PaperStage — 纸片剧场的五幕舞台容器管理器
 *
 *   观众视角 ──────►
 *
 *   Z=+2  FrontMist       前景大气 (云絮、金粒子、萤火)   parallax 1.2
 *   Z=+1  InteractVeil    交互纸膜 (雾 + 撕开的洞)        parallax 1.0
 *   Z= 0  MainStage       主舞台 (底图 + 角色 + 热点)     parallax 1.0  ◄ 基准面
 *   Z=-1  DistantLight    远景光影 (光柱、晨曦)           parallax 0.8
 *   Z=-2  Backdrop        最远幕布 (天空、远山、慢云)     parallax 0.5
 *
 * 每一层都是独立 Container，PaperStage 只负责：
 *   · 按顺序挂到 app.stage
 *   · 把 parallax 鼠标/陀螺仪输入派发给每一层
 *   · 每层提供自己的 resize + tick hook
 *
 * 布景尺寸 vs 底图尺寸：
 *   · 底图 MAP_W × MAP_H = 1328 × 1760（image-space）
 *   · 远景层使用全屏 (app.screen) 作画，不跟随底图 scale
 *   · MainStage 及以上都在"世界容器"里，等比缩放到屏幕内
 */
import { Application, Container } from 'pixi.js';

export enum StageLayer {
  Backdrop = 'backdrop',        // Z=-2
  DistantLight = 'distantLight',// Z=-1
  MainStage = 'mainStage',      // Z=0
  InteractVeil = 'interactVeil',// Z=+1
  FrontMist = 'frontMist',      // Z=+2
}

/** Parallax coefficient per layer (1.0 = moves 1:1 with input). */
export const PARALLAX: Record<StageLayer, number> = {
  [StageLayer.Backdrop]: 0.18,
  [StageLayer.DistantLight]: 0.35,
  [StageLayer.MainStage]: 1.0,
  [StageLayer.InteractVeil]: 1.05,
  [StageLayer.FrontMist]: 1.35,
};

/** Interface that every stage layer implements. */
export interface LayerModule {
  /** The Pixi container this module owns (already created). */
  container: Container;
  /** Called when the canvas is resized. sw/sh in CSS px. */
  onResize(sw: number, sh: number): void;
  /** Called every frame with elapsedMS (from Pixi ticker). */
  onTick(deltaMs: number): void;
  /** Clean up tweens, shaders, listeners. */
  dispose(): void;
}

export class PaperStage {
  public readonly app: Application;
  /** Screen-space parallax containers (don't scale with map). */
  private screenLayers = new Map<StageLayer, Container>();
  /**
   * Outer world container — handles fit-to-viewport scale + breathing camera.
   * External code SHOULD call `world.scale.set(...)` / `world.position.set(...)`
   * on this one (it's what `fitWorld` in the scene does).
   */
  public readonly world: Container;
  /**
   * Inner tilted container — child of `world`. This is where the 45°-ish
   * isometric projection lives (skewY + scaleY compress) so the map looks
   * like it's tilted back into the distance. Modules that want TRUE
   * top-down coordinates (Backdrop, DistantLight — those are screen-space
   * anyway) are unaffected. MainStage / InteractVeil / FrontMist all sit
   * inside `tilt` and therefore get the 3D feel for free.
   */
  public readonly tilt: Container;
  /** Modules keyed by layer. */
  private modules = new Map<StageLayer, LayerModule>();

  /** Smoothed parallax offset (px) — updated each tick. */
  private px = 0;
  private py = 0;
  /** Target parallax (what we're easing towards). */
  private pxTarget = 0;
  private pyTarget = 0;
  /** Max input offset (px) — screen-space "tilt range". */
  public parallaxRange = 18;

  /**
   * --- Isometric projection parameters ---
   *   DISABLED by default (tiltSkewX = 0, tiltScaleY = 1).
   *
   *   The `rivershire.png` base art is already painted with a 45°-diorama
   *   perspective baked in — each hex already shows building side walls,
   *   roof planes, and tiny 3D details from an isometric camera. Applying
   *   a skew/scale tilt on TOP of art that already has perspective creates
   *   double-distortion: rectangles go trapezoidal, the hex grid reads as
   *   warped, and landmark sprites visibly lean.
   *
   *   The plumbing is kept in place so a future flat (un-tilted) base map
   *   can opt into the projection by setting these to non-zero values
   *   (e.g. tiltSkewX = 0.12, tiltScaleY = 0.85).
   */
  public tiltSkewX = 0;
  public tiltScaleY = 1;

  /**
   * --- Breathing camera parameters ---
   *   Periodic scale pulse of the outer world container so the whole scene
   *   gently "inhales / exhales" — classic Ghibli-style "breathing map"
   *   feel. Backdrop / DistantLight are screen-space so they don't breathe;
   *   the contrast between a breathing foreground and a static horizon is
   *   what sells the depth.
   */
  public breathingEnabled = true;
  /** Period of one inhale-exhale cycle, ms. */
  public breathingPeriodMs = 9_500;
  /** Amplitude: scale oscillates within ±breathingAmp of the fit-scale. */
  public breathingAmp = 0.035;
  /** Backdrop counter-zoom amplitude (opposite phase, half magnitude). */
  public backdropCounterAmp = 0.018;

  /** Base fit-scale set by fitWorld() — breathing rides on top of this. */
  private worldBaseScale = 1;
  /** Accumulated time for breathing phase, ms. */
  private tAccum = 0;

  constructor(app: Application) {
    this.app = app;

    // Create screen-space layers (Backdrop + DistantLight)
    for (const layer of [StageLayer.Backdrop, StageLayer.DistantLight]) {
      const c = new Container();
      c.label = `layer-${layer}`;
      app.stage.addChild(c);
      this.screenLayers.set(layer, c);
    }

    // World container holds MainStage + InteractVeil + FrontMist
    this.world = new Container();
    this.world.label = 'world';
    app.stage.addChild(this.world);

    // Tilt container applies the 45° isometric projection to everything
    // inside it. Its pivot is set in `applyTilt()` to the map centre so
    // the tilt feels like rotating a paper on the desk, not sliding it.
    this.tilt = new Container();
    this.tilt.label = 'world-tilt';
    this.world.addChild(this.tilt);
    this.applyTilt();

    for (const layer of [
      StageLayer.MainStage,
      StageLayer.InteractVeil,
      StageLayer.FrontMist,
    ]) {
      const c = new Container();
      c.label = `layer-${layer}`;
      this.tilt.addChild(c);
      this.screenLayers.set(layer, c);
    }
  }

  /**
   * Apply (or re-apply) the isometric tilt to `this.tilt`. Called from
   * the constructor and whenever tiltSkewX/tiltScaleY are changed.
   * Uses `skew.x` + non-uniform scale for a cheap 45°-ish projection.
   */
  private applyTilt(mapCx = 664, mapCy = 880): void {
    this.tilt.pivot.set(mapCx, mapCy);
    this.tilt.position.set(mapCx, mapCy);
    this.tilt.skew.set(this.tiltSkewX, 0);
    this.tilt.scale.set(1, this.tiltScaleY);
  }

  /**
   * Scenes call this from their `fitWorld()` after they figure out the
   * "fit-to-viewport" scale, so breathing can ride on top of a stable
   * base instead of fighting the resize.
   */
  public setWorldBaseScale(s: number): void {
    this.worldBaseScale = s;
    // Snap immediately so the first frame isn't mid-breath.
    this.world.scale.set(s);
  }

  /** Register a module for a layer. The module's container is added to that layer. */
  register(layer: StageLayer, mod: LayerModule): void {
    const host = this.screenLayers.get(layer);
    if (!host) throw new Error(`[PaperStage] unknown layer ${layer}`);
    host.addChild(mod.container);
    this.modules.set(layer, mod);
  }

  /** Retrieve the container for a layer (for direct manipulation). */
  getLayer(layer: StageLayer): Container {
    const c = this.screenLayers.get(layer);
    if (!c) throw new Error(`[PaperStage] unknown layer ${layer}`);
    return c;
  }

  getModule<T extends LayerModule>(layer: StageLayer): T | undefined {
    return this.modules.get(layer) as T | undefined;
  }

  /**
   * Set parallax input in normalized [-1, 1] range.
   * Usually driven by mouse position or device gyro.
   */
  setParallaxInput(nx: number, ny: number): void {
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    this.pxTarget = clamp(nx) * this.parallaxRange;
    this.pyTarget = clamp(ny) * this.parallaxRange;
  }

  /** Call every frame (wire to app.ticker). */
  tick(deltaMs: number): void {
    // Smooth the parallax offset (critical damping feel)
    const t = Math.min(1, deltaMs / 180);
    this.px += (this.pxTarget - this.px) * t;
    this.py += (this.pyTarget - this.py) * t;

    // --- Breathing camera ---
    // A slow sine oscillation that modulates world.scale around its base
    // fit-scale. The backdrop containers counter-zoom slightly in opposite
    // phase, which amplifies the parallax/depth feel without the backdrop
    // literally moving in world-space.
    if (this.breathingEnabled && this.worldBaseScale > 0) {
      this.tAccum += deltaMs;
      const phase = (this.tAccum / this.breathingPeriodMs) * Math.PI * 2;
      const breath = Math.sin(phase);                 // [-1, 1]
      const worldS = this.worldBaseScale * (1 + breath * this.breathingAmp);
      this.world.scale.set(worldS);

      // Backdrop/DistantLight counter-zoom: when the foreground inhales
      // (zooms in), the horizon pulls back a touch — makes the depth more
      // pronounced. These are SCREEN-space containers so their pivot is
      // the origin (0,0); we use scale + offset around screen-centre.
      const bdFactor = 1 - breath * this.backdropCounterAmp;
      const sw = this.app.screen.width, sh = this.app.screen.height;
      for (const layer of [StageLayer.Backdrop, StageLayer.DistantLight]) {
        const c = this.screenLayers.get(layer);
        if (!c) continue;
        c.scale.set(bdFactor);
        // Keep the scaled container centred on the screen so the horizon
        // doesn't drift to a corner when scale changes.
        c.pivot.set(sw / 2, sh / 2);
        // Parallax offset will be applied below on TOP of this pivot.
      }
    }

    // Apply parallax per-layer
    for (const [layer, container] of this.screenLayers) {
      const f = PARALLAX[layer];
      if (layer === StageLayer.Backdrop || layer === StageLayer.DistantLight) {
        // Screen-space layers: pivot is screen-centre (set above), so
        // position = pivot + parallax-offset keeps the scaled content
        // visually centred + adds the tilt-response.
        const sw = this.app.screen.width, sh = this.app.screen.height;
        container.x = sw / 2 + this.px * f;
        container.y = sh / 2 + this.py * f;
      } else if (layer === StageLayer.InteractVeil || layer === StageLayer.FrontMist) {
        // World-space offset (in map pixels). Divide by worldScale to
        // keep visual offset consistent across zoom levels.
        const worldScale = this.world.scale.x || 1;
        container.x = (this.px * (f - 1)) / worldScale;
        container.y = (this.py * (f - 1)) / worldScale;
      }
      // MainStage stays at origin within the tilt container.
    }

    // Tick every module
    for (const mod of this.modules.values()) {
      mod.onTick(deltaMs);
    }
  }

  /** Call on viewport resize. */
  onResize(sw: number, sh: number): void {
    for (const mod of this.modules.values()) {
      mod.onResize(sw, sh);
    }
  }

  dispose(): void {
    for (const mod of this.modules.values()) {
      try { mod.dispose(); } catch {}
    }
    this.modules.clear();
    this.screenLayers.clear();
    try { this.world.destroy({ children: true }); } catch {}
  }
}
