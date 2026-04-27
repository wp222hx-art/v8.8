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
  /** World-space container (scaled to fit map). */
  public readonly world: Container;
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
    // (all at map-space, but FrontMist can extend beyond for edge particles)
    this.world = new Container();
    this.world.label = 'world';
    app.stage.addChild(this.world);

    for (const layer of [
      StageLayer.MainStage,
      StageLayer.InteractVeil,
      StageLayer.FrontMist,
    ]) {
      const c = new Container();
      c.label = `layer-${layer}`;
      this.world.addChild(c);
      this.screenLayers.set(layer, c);
    }
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

    // Apply parallax per-layer
    for (const [layer, container] of this.screenLayers) {
      const f = PARALLAX[layer];
      // Only the SCREEN-space layers (backdrop, distantLight) get direct parallax
      // offset; world-space layers inherit world position, but we add a small
      // relative offset for InteractVeil / FrontMist to make them "float" forward.
      if (layer === StageLayer.Backdrop || layer === StageLayer.DistantLight) {
        container.x = this.px * f;
        container.y = this.py * f;
      } else if (layer === StageLayer.InteractVeil || layer === StageLayer.FrontMist) {
        // World-space offset (in map pixels). Scale input by 1/worldScale to
        // keep visual offset consistent across zoom levels.
        const worldScale = this.world.scale.x || 1;
        container.x = (this.px * (f - 1)) / worldScale;
        container.y = (this.py * (f - 1)) / worldScale;
      }
      // MainStage stays at origin within the world container (it IS the reference).
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
