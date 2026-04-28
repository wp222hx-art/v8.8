/**
 * 🎭 PaperRenderer — SYNAPSE Paper Theater · Five-Layer Compositor
 *
 * 灵魂：每一个资产都不是一张图，而是一个可呼吸的小剧场。
 *
 * 五层严格分层（从底到顶）：
 *   Shadow   → 投影层（资产下方柔和暗影，加强"纸片立起来"的立体感）
 *   Lighting → 光照层（窗光/火焰光晕，带 Additive 混合）
 *   Main     → 主体层（GPT Image 2 产出的主立绘）
 *   Detail   → 细节层（旗帜、窗框、小装饰，独立抖动）
 *   FX       → 特效层（烟、火花、Lottie 粒子）
 *
 * 视差：鼠标/陀螺仪移动时，各层偏移系数不同 → 呼吸式立体感。
 */
import { Application, Container, Sprite, Texture, Assets } from 'pixi.js';
import { gsap } from 'gsap';

export enum PaperLayer {
  SHADOW = 0,
  LIGHTING = 1,
  MAIN = 2,
  DETAIL = 3,
  FX = 4,
}

// 视差系数（0 = 不动，1 = 基准，>1 = 比基准更灵动）
const PARALLAX_DEPTH: Record<PaperLayer, number> = {
  [PaperLayer.SHADOW]: 0.2,
  [PaperLayer.LIGHTING]: 0.4,
  [PaperLayer.MAIN]: 1.0,
  [PaperLayer.DETAIL]: 1.2,
  [PaperLayer.FX]: 1.5,
};

export interface PaperAssetConfig {
  id: string;
  layers: {
    shadow?: string;
    lighting?: string;
    main: string; // 必须
    detail?: string;
    fx?: string;
  };
  anchor?: { x: number; y: number };
  scale?: number;
}

/**
 * 一个 PaperAsset 就是一个五层容器，可独立运动、变换、淡入淡出。
 */
export class PaperAsset extends Container {
  public id: string;
  public layerContainers: Map<PaperLayer, Container> = new Map();
  private basePositions: Map<PaperLayer, { x: number; y: number }> = new Map();
  private breatheTween?: gsap.core.Tween;

  constructor(id: string) {
    super();
    this.id = id;
    // 初始化 5 个层容器
    for (let i = PaperLayer.SHADOW; i <= PaperLayer.FX; i++) {
      const c = new Container();
      c.label = `layer_${PaperLayer[i]}`;
      this.addChild(c);
      this.layerContainers.set(i, c);
      this.basePositions.set(i, { x: 0, y: 0 });
    }
  }

  /**
   * 加载配置并把各层贴图塞到对应的 layer container。
   */
  async load(cfg: PaperAssetConfig): Promise<void> {
    const layerMap: [PaperLayer, string | undefined][] = [
      [PaperLayer.SHADOW, cfg.layers.shadow],
      [PaperLayer.LIGHTING, cfg.layers.lighting],
      [PaperLayer.MAIN, cfg.layers.main],
      [PaperLayer.DETAIL, cfg.layers.detail],
      [PaperLayer.FX, cfg.layers.fx],
    ];

    await Promise.all(
      layerMap.map(async ([layer, url]) => {
        if (!url) return;
        const tex = await Assets.load<Texture>(url);
        const sprite = new Sprite(tex);
        sprite.anchor.set(cfg.anchor?.x ?? 0.5, cfg.anchor?.y ?? 0.5);
        if (cfg.scale) sprite.scale.set(cfg.scale);
        // Lighting 层使用 "add" 混合，产生发光感
        if (layer === PaperLayer.LIGHTING) {
          sprite.blendMode = 'add';
          sprite.alpha = 0.85;
        }
        this.layerContainers.get(layer)!.addChild(sprite);
      })
    );

    this.startBreathing();
  }

  /**
   * "呼吸"：main 层做极其细微的 Y 浮动，detail/fx 做轻微摇摆。
   * 这是纸片剧场的灵魂 — 让每个资产都感觉活着。
   */
  startBreathing(): void {
    const main = this.layerContainers.get(PaperLayer.MAIN);
    const detail = this.layerContainers.get(PaperLayer.DETAIL);
    const fx = this.layerContainers.get(PaperLayer.FX);

    if (main) {
      this.breatheTween = gsap.to(main, {
        y: -2,
        duration: 2.6,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    }
    if (detail) {
      gsap.to(detail, {
        y: -3,
        rotation: 0.01,
        duration: 3.1,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay: 0.4,
      });
    }
    if (fx) {
      gsap.to(fx, {
        y: -5,
        duration: 4.3,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay: 0.2,
      });
    }
  }

  /**
   * 施加视差偏移（来自场景级的鼠标/陀螺仪移动）。
   */
  applyParallax(offsetX: number, offsetY: number): void {
    for (const [layer, container] of this.layerContainers) {
      const depth = PARALLAX_DEPTH[layer];
      const base = this.basePositions.get(layer)!;
      container.x = base.x + offsetX * depth;
      // y 偏移保留 breathing 的值，只加 parallax 的差
      const currentY = container.y;
      container.y = base.y + offsetY * depth + (currentY - base.y) * 0.1;
    }
  }

  /**
   * 整体淡入（出场动画）。
   */
  fadeIn(duration = 0.8): gsap.core.Tween {
    this.alpha = 0;
    return gsap.to(this, { alpha: 1, duration, ease: 'power2.out' });
  }

  destroy(): void {
    this.breatheTween?.kill();
    super.destroy({ children: true });
  }
}

/**
 * PaperStage — 顶层剧场容器，管理所有 PaperAsset 和全局视差。
 */
export class PaperStage {
  public readonly app: Application;
  public readonly root: Container;
  private assets: Map<string, PaperAsset> = new Map();
  private parallaxX = 0;
  private parallaxY = 0;
  private targetParallaxX = 0;
  private targetParallaxY = 0;

  constructor(app: Application) {
    this.app = app;
    this.root = new Container();
    this.root.label = 'paper-stage-root';
    app.stage.addChild(this.root);

    app.ticker.add(this.tickParallax);
  }

  async addAsset(cfg: PaperAssetConfig, x: number, y: number): Promise<PaperAsset> {
    const asset = new PaperAsset(cfg.id);
    await asset.load(cfg);
    asset.position.set(x, y);
    this.root.addChild(asset);
    this.assets.set(cfg.id, asset);
    asset.fadeIn();
    return asset;
  }

  getAsset(id: string): PaperAsset | undefined {
    return this.assets.get(id);
  }

  removeAsset(id: string): void {
    const a = this.assets.get(id);
    if (a) {
      a.destroy();
      this.assets.delete(id);
    }
  }

  /**
   * 设置视差目标点（由外部输入：鼠标/touch/陀螺仪）。
   * 单位：像素（相对屏幕中心的偏移）。
   */
  setParallaxTarget(x: number, y: number): void {
    // 限幅，避免偏移过大
    this.targetParallaxX = Math.max(-30, Math.min(30, x));
    this.targetParallaxY = Math.max(-20, Math.min(20, y));
  }

  private tickParallax = (): void => {
    // 缓动，避免僵硬
    this.parallaxX += (this.targetParallaxX - this.parallaxX) * 0.06;
    this.parallaxY += (this.targetParallaxY - this.parallaxY) * 0.06;
    for (const asset of this.assets.values()) {
      asset.applyParallax(this.parallaxX, this.parallaxY);
    }
  };

  destroy(): void {
    this.app.ticker.remove(this.tickParallax);
    for (const asset of this.assets.values()) asset.destroy();
    this.assets.clear();
    this.root.destroy({ children: true });
  }
}
