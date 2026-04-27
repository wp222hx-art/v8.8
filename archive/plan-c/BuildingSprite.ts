/**
 * 🏛️ BuildingSprite — 一个建筑立牌（Paper Piece）
 *
 * 每个 BuildingSprite 绑定到一个 Landmark，代表"从底图上站起来的那张纸"。
 * 它有两层：
 *   · shadow   — 地面上的软水彩阴影圆盘（在建筑脚下）
 *   · main     — 建筑本体（从地面向上竖起来的那张"纸片"）
 *
 * 生命周期：
 *   spawn():      立刻放到场景里，但保持不可见（alpha=0），等待 awaken()
 *   awaken():     地图被揭开时播放"升起"动画 + 开始呼吸
 *   breath():     持续的轻微上下浮动（在 awaken 末尾自动启动）
 *   forceShow():  debug — 立刻跳到已唤醒状态
 *   dispose():    清理 tween & 子对象
 *
 * 坐标系：
 *   container.position = landmark 的图像空间中心 (cx, cy) —— 由 LandmarkScene 设置。
 *   sprite 自身 anchor = (0.5, 1.0)，即"脚位于原点"，这样建筑会"站在"底图上。
 *   shadow anchor = (0.5, 0.5)，蹲在脚位置。
 *
 * 大小：
 *   由 `displayWidth` 控制（建筑在图像空间的期望宽度，单位 px）。
 *   通常 = landmark.radius × 1.6 ~ 2.0（比唤醒窗略大，以盖过底图）。
 */
import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { gsap } from 'gsap';
import type { Landmark } from './Landmarks';

export interface BuildingAssetUrls {
  /** Drop shadow layer (watercolor blob). Optional. */
  shadow?: string;
  /** Main building layer. Required. */
  main: string;
}

export interface BuildingSpriteOptions {
  landmark: Landmark;
  assets: BuildingAssetUrls;
  /** Desired on-map display width (image-space px). Defaults to landmark.radius*1.9. */
  displayWidth?: number;
  /**
   * Vertical offset (image-space px) applied to the `main` layer, relative to the
   * landmark center. Positive = further down. Used so the building's *base* sits
   * on the landmark centre while the roof extends upward. Defaults to 0 (anchor
   * at bottom-middle does the work).
   */
  baseOffset?: number;
  /** How tall the shadow is relative to the building width. Default 0.32 (flat). */
  shadowHeightRatio?: number;
}

export class BuildingSprite {
  /** Root container — position it at (landmark.cx, landmark.cy). */
  public readonly container: Container;
  public readonly landmark: Landmark;
  private mainSprite: Sprite | null = null;
  private shadowSprite: Sprite | null = null;
  private breathTween: gsap.core.Tween | null = null;
  private state: 'idle' | 'awakening' | 'awake' = 'idle';
  private opts: Required<Omit<BuildingSpriteOptions, 'assets' | 'landmark'>> & {
    assets: BuildingAssetUrls;
    landmark: Landmark;
  };

  constructor(opts: BuildingSpriteOptions) {
    this.landmark = opts.landmark;
    this.opts = {
      landmark: opts.landmark,
      assets: opts.assets,
      displayWidth: opts.displayWidth ?? opts.landmark.radius * 1.9,
      baseOffset: opts.baseOffset ?? 0,
      shadowHeightRatio: opts.shadowHeightRatio ?? 0.32,
    };

    this.container = new Container();
    this.container.label = `building_${this.landmark.id}`;
    // Start invisible until load + awaken.
    this.container.alpha = 0;
  }

  /**
   * Load textures and add children. Safe to call multiple times; no-op after first.
   * Returns after both textures are loaded.
   */
  async load(): Promise<void> {
    if (this.mainSprite) return;

    const assets = this.opts.assets;

    // --- Shadow layer (optional, added first so it renders behind) ---
    if (assets.shadow) {
      try {
        const tex = await Assets.load<Texture>(assets.shadow);
        if (this.isDisposed()) return;
        const shadow = new Sprite(tex);
        shadow.anchor.set(0.5, 0.5);
        // Keep shadow roughly at building width, but squashed vertically.
        // Use explicit scale to bypass Pixi v8's flaky width/height setters.
        const targetW = this.opts.displayWidth * 1.05;
        const targetH = targetW * this.opts.shadowHeightRatio;
        shadow.scale.set(targetW / tex.width, targetH / tex.height);
        // Place shadow slightly forward of center, at the base of the building.
        shadow.position.set(0, this.opts.baseOffset + 4);
        shadow.alpha = 0.75;
        this.container.addChild(shadow);
        this.shadowSprite = shadow;
      } catch (e) {
        console.warn('[building]', this.landmark.id, 'shadow load failed:', e);
      }
    }

    // --- Main layer (required) ---
    try {
      const tex = await Assets.load<Texture>(assets.main);
      if (this.isDisposed()) return;
      const main = new Sprite(tex);
      // Anchor just below the visible base of the building (our processor puts
      // ~2% padding below the art, so 0.85 puts the "feet" near the landmark
      // centre without the roof extending too far above it.
      main.anchor.set(0.5, 0.85);
      const w = this.opts.displayWidth;
      // In Pixi v8 the `.width`/`.height` setters are unreliable when the
      // texture's frame metadata is still settling (they can leave `scale=1`).
      // Setting `.scale` directly is deterministic.
      const s = w / tex.width;
      main.scale.set(s, s);
      main.position.set(0, this.opts.baseOffset);
      this.container.addChild(main);
      this.mainSprite = main;
    } catch (e) {
      console.error('[building]', this.landmark.id, 'main load failed:', e);
    }
  }

  /**
   * Animated spawn — fade + rise from the ground + tiny overshoot.
   * Safe to call before `load()` resolves; defers until the sprite exists.
   *
   * All scale-based effects are applied relative to the sprite's *base* scale
   * (set by load() from `displayWidth / texture.width`). Without this, a naive
   * `.scale.set(1,1)` at the end of the tween would silently enlarge the sprite
   * to 100% of its texture size (~1024px in world units — massive).
   */
  async awaken(opts: { delay?: number } = {}): Promise<void> {
    await this.load();
    if (!this.mainSprite || this.isDisposed()) return;
    if (this.state !== 'idle') return;
    this.state = 'awakening';

    const delay = opts.delay ?? 0;
    const mainBaseSx = this.mainSprite.scale.x;
    const mainBaseSy = this.mainSprite.scale.y;
    const shadowBaseSx = this.shadowSprite?.scale.x ?? 1;
    const shadowBaseSy = this.shadowSprite?.scale.y ?? 1;

    // Reset initial states (relative to base scales)
    this.container.alpha = 0;
    if (this.shadowSprite) {
      this.shadowSprite.alpha = 0;
      this.shadowSprite.scale.set(shadowBaseSx * 0.35, shadowBaseSy * 0.30);
    }
    this.mainSprite.scale.set(mainBaseSx * 0.88, mainBaseSy * 0.72);
    this.mainSprite.y = this.opts.baseOffset + 14;
    this.mainSprite.alpha = 1;

    const tl = gsap.timeline({ delay });

    // Container fade in
    tl.to(this.container, { alpha: 1, duration: 0.35, ease: 'power2.out' }, 0);

    // Shadow bloom (quick, back to base scale)
    if (this.shadowSprite) {
      tl.to(
        this.shadowSprite,
        { alpha: 0.78, duration: 0.45, ease: 'power2.out' },
        0
      );
      tl.to(
        this.shadowSprite.scale,
        { x: shadowBaseSx, y: shadowBaseSy, duration: 0.65, ease: 'back.out(2.0)' },
        0.05
      );
    }

    // Main rise + scale up to *base* (not 1!)
    tl.to(
      this.mainSprite,
      {
        y: this.opts.baseOffset,
        duration: 0.55,
        ease: 'back.out(1.6)',
      },
      0.08
    );
    tl.to(
      this.mainSprite.scale,
      {
        x: mainBaseSx,
        y: mainBaseSy,
        duration: 0.55,
        ease: 'back.out(1.8)',
      },
      0.08
    );

    return new Promise<void>((resolve) => {
      tl.eventCallback('onComplete', () => {
        this.state = 'awake';
        this.startBreath();
        resolve();
      });
    });
  }

  /** Start a subtle continuous breathing animation (idempotent). */
  private startBreath(): void {
    if (!this.mainSprite || this.breathTween) return;
    const baseY = this.opts.baseOffset;
    this.breathTween = gsap.to(this.mainSprite, {
      y: baseY - 2.5,
      duration: 3.2 + Math.random() * 0.8,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /** Debug / reveal=all — jump to awake state without animation. */
  forceShow(): void {
    if (this.state === 'awake') return;
    // If load not done yet, kick it off then show.
    if (!this.mainSprite) {
      this.load().then(() => this.forceShow());
      return;
    }
    // The base scales were already set by load() — just make sure alpha/pos
    // are at their awake values. Do NOT reset scale to 1 (that would break
    // the displayWidth sizing).
    this.container.alpha = 1;
    this.mainSprite.y = this.opts.baseOffset;
    this.mainSprite.alpha = 1;
    if (this.shadowSprite) {
      this.shadowSprite.alpha = 0.78;
    }
    this.state = 'awake';
    this.startBreath();
  }

  private isDisposed(): boolean {
    return this.container.destroyed;
  }

  dispose(): void {
    if (this.breathTween) {
      this.breathTween.kill();
      this.breathTween = null;
    }
    if (this.mainSprite) gsap.killTweensOf(this.mainSprite);
    if (this.shadowSprite) gsap.killTweensOf(this.shadowSprite);
    gsap.killTweensOf(this.container);
    try {
      this.container.destroy({ children: true });
    } catch {}
  }
}
