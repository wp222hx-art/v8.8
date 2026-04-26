/**
 * 🎨 AwakenMask — 褪色全图 + 彩色显色窗系统 (v2)
 *
 * 设计思路（方案 C, v2）：
 *   · dimLayer：褪色的整张底图（永远可见，ColorMatrixFilter 作旧）
 *   · revealedLayer：空容器，为每个已唤醒的 landmark 添加一个"彩色圆形窗"
 *     ─ 每个窗 = Sprite (同一张底图 texture) + Graphics 圆形 mask，放在该 landmark 中心
 *     ─ 窗的 mask 是明确画了形状的 Graphics（不是空），Pixi 能可靠地裁剪
 *   · 彩色窗边缘通过不规则多边形实现"水彩撕纸"效果
 *   · fxLayer：水彩粒子 + 金环（独立容器，在窗上方）
 */
import {
  Container,
  Sprite,
  Texture,
  Graphics,
  ColorMatrixFilter,
} from 'pixi.js';
import { gsap } from 'gsap';
import { MOOD_COLORS, Landmark } from './Landmarks';

interface RevealedWindow {
  landmark: Landmark;
  sprite: Sprite;
  mask: Graphics;
  r: number;        // current animated radius
  container: Container;
}

export class AwakenMask {
  public container: Container;
  public fxLayer: Container;
  private tex: Texture;
  private imageW: number;
  private imageH: number;
  private dimLayer: Sprite;
  private revealedLayer: Container;
  private windows: Map<string, RevealedWindow> = new Map();

  constructor(tex: Texture, imageW: number, imageH: number) {
    this.tex = tex;
    this.imageW = imageW;
    this.imageH = imageH;
    this.container = new Container();
    this.container.label = 'awaken-mask-root';

    // ---- Layer 0: desaturated "sleeping" map ----
    this.dimLayer = new Sprite(tex);
    this.dimLayer.width = imageW;
    this.dimLayer.height = imageH;
    const dim = new ColorMatrixFilter();
    // Near-monochrome sepia "old photograph" look — makes reveal windows POP.
    dim.saturate(-0.88, true);
    dim.brightness(0.55, true);
    // Warm parchment undertone (offset RGB)
    dim.matrix[4]  = 0.08;   // +R
    dim.matrix[9]  = 0.04;   // +G
    dim.matrix[14] = -0.08;  // -B for that yellowed look
    this.dimLayer.filters = [dim];
    this.container.addChild(this.dimLayer);

    // ---- Layer 1: color reveal windows (added dynamically) ----
    this.revealedLayer = new Container();
    this.revealedLayer.label = 'revealed-windows';
    this.container.addChild(this.revealedLayer);

    // ---- Layer 2: FX (particles, splashes, golden rings) ----
    this.fxLayer = new Container();
    this.fxLayer.label = 'awaken-fx';
    this.container.addChild(this.fxLayer);
  }

  /** Create a colored reveal window centered on the landmark, radius = 0. */
  private createWindow(landmark: Landmark): RevealedWindow {
    const wrapper = new Container();
    wrapper.label = `window_${landmark.id}`;
    this.revealedLayer.addChild(wrapper);

    // The color sprite: share the same texture as dim layer, full image.
    const sprite = new Sprite(this.tex);
    sprite.width = this.imageW;
    sprite.height = this.imageH;
    sprite.position.set(0, 0);
    wrapper.addChild(sprite);

    // The mask: a filled polygon (irregular blob) around (cx, cy) with radius r.
    const mask = new Graphics();
    wrapper.addChild(mask);
    sprite.mask = mask;

    const win: RevealedWindow = {
      landmark,
      sprite,
      mask,
      r: 0,
      container: wrapper,
    };
    this.windows.set(landmark.id, win);
    this.redrawWindowMask(win);
    return win;
  }

  /** Redraw one window's mask as an irregular watercolor blob at current radius. */
  private redrawWindowMask(win: RevealedWindow): void {
    const { landmark, mask, r } = win;
    mask.clear();
    if (r <= 0.01) return; // nothing to draw
    const steps = 28;
    // Build irregular polygon (deterministic jitter) centered on the landmark.
    // NOTE: points are given in wrapper-local coords (same space as the sprite
    // at (0,0)…(imageW, imageH)), so we add landmark.cx/cy directly.
    const first = { x: 0, y: 0 };
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const seed = landmark.cx * 0.013 + landmark.cy * 0.017 + i * 0.19;
      const jitter = 0.84 + 0.30 * (Math.sin(seed * 6.7) * 0.5 + 0.5);
      const rr = r * jitter;
      const x = landmark.cx + rr * Math.cos(a);
      const y = landmark.cy + rr * Math.sin(a);
      if (i === 0) { first.x = x; first.y = y; mask.moveTo(x, y); }
      else { mask.lineTo(x, y); }
    }
    mask.lineTo(first.x, first.y);
    mask.closePath();
    mask.fill({ color: 0xffffff, alpha: 1 });
  }

  /**
   * 🎭 Reveal a landmark — animates the color window from r=0 to r=target.
   * Also spawns FX splash + droplets + golden ring.
   */
  revealLandmark(landmark: Landmark, onDone?: () => void): void {
    if (this.windows.has(landmark.id)) return;
    const win = this.createWindow(landmark);

    // Animate radius growth
    gsap.to(win, {
      r: landmark.radius,
      duration: 0.9,
      ease: 'power3.out',
      onUpdate: () => this.redrawWindowMask(win),
      onComplete: onDone,
    });

    this.spawnSplash(landmark);
    this.spawnDroplets(landmark);
    this.spawnGoldenRing(landmark);
  }

  private spawnSplash(landmark: Landmark): void {
    const mood = MOOD_COLORS[landmark.mood];
    const splash = new Graphics();
    this.fxLayer.addChild(splash);
    splash.position.set(landmark.cx, landmark.cy);
    splash.circle(0, 0, 1).fill({ color: mood.primary, alpha: 0.55 });
    gsap.to(splash.scale, {
      x: landmark.radius * 1.4,
      y: landmark.radius * 1.4,
      duration: 0.8,
      ease: 'power3.out',
    });
    gsap.to(splash, {
      alpha: 0,
      duration: 0.8,
      ease: 'power2.out',
      onComplete: () => splash.destroy(),
    });
  }

  private spawnDroplets(landmark: Landmark): void {
    const mood = MOOD_COLORS[landmark.mood];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const d = new Graphics();
      this.fxLayer.addChild(d);
      d.position.set(landmark.cx, landmark.cy);
      const rad = 4 + Math.random() * 8;
      const color = [mood.primary, mood.secondary, mood.accent][i % 3];
      d.circle(0, 0, rad).fill({ color, alpha: 0.8 });
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const dist = landmark.radius * (1.0 + Math.random() * 0.4);
      gsap.to(d, {
        x: landmark.cx + Math.cos(angle) * dist,
        y: landmark.cy + Math.sin(angle) * dist,
        alpha: 0,
        duration: 0.9 + Math.random() * 0.4,
        ease: 'power2.out',
        onComplete: () => d.destroy(),
      });
      gsap.to(d.scale, {
        x: 0.3, y: 0.3,
        duration: 0.9 + Math.random() * 0.4,
        ease: 'power2.out',
      });
    }
  }

  private spawnGoldenRing(landmark: Landmark): void {
    const mood = MOOD_COLORS[landmark.mood];
    const ring = new Graphics();
    this.fxLayer.addChild(ring);
    ring.position.set(landmark.cx, landmark.cy);
    ring.circle(0, 0, landmark.radius).stroke({
      color: mood.accent, width: 5, alpha: 0.95,
    });
    ring.circle(0, 0, landmark.radius * 1.08).stroke({
      color: mood.accent, width: 2, alpha: 0.5,
    });
    ring.alpha = 0;
    ring.scale.set(0.4);
    gsap.to(ring, { alpha: 0.9, duration: 0.4, delay: 0.25, ease: 'power2.out' });
    gsap.to(ring.scale, {
      x: 1, y: 1,
      duration: 0.7, delay: 0.2,
      ease: 'back.out(1.5)',
    });
    gsap.to(ring, {
      alpha: 0.45,
      duration: 2.0, delay: 0.8,
      yoyo: true, repeat: -1,
      ease: 'sine.inOut',
    });
  }

  /** Immediately mark a landmark as revealed, without animation. */
  forceReveal(landmark: Landmark): void {
    if (this.windows.has(landmark.id)) return;
    const win = this.createWindow(landmark);
    win.r = landmark.radius;
    this.redrawWindowMask(win);
  }

  dispose(): void {
    for (const win of this.windows.values()) {
      gsap.killTweensOf(win);
    }
    this.windows.clear();
    this.container.destroy({ children: true });
  }
}
