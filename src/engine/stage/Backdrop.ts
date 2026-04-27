/**
 * 🌌 Backdrop — 最远景的幕布
 *
 * 三层叠画（全部程序化，零素材）：
 *   1. 渐变天空 (垂直 gradient sprite，大气色温)
 *   2. 远山剪影 (程序化贝塞尔曲线，两层深度)
 *   3. 慢云 (4~6 个大椭圆，alpha ~0.15，极慢漂移)
 *
 * 所有东西都比屏幕大 20%，parallax 移动时不会露白边。
 */
import {
  Container,
  Graphics,
  Sprite,
  Texture,
  FillGradient,
  Color,
} from 'pixi.js';
import { LayerModule } from './PaperStage';

/** Day-phase colour palette (warm parchment morning). */
const SKY_GRADIENT = [
  { stop: 0.00, color: 0x3a2f42 }, // 顶端深紫
  { stop: 0.45, color: 0x7c5e64 }, // 中段暖褐
  { stop: 0.75, color: 0xc7996c }, // 下段金褐
  { stop: 1.00, color: 0xe6c18f }, // 地平线米黄
];

const FAR_MOUNTAIN_COLOR = 0x4a3e4e;   // 远山：灰紫
const NEAR_MOUNTAIN_COLOR = 0x3a3340;  // 近山：更深
const CLOUD_COLOR = 0xf2d9b0;          // 慢云：奶油色

interface SlowCloud {
  gfx: Graphics;
  speed: number;   // px/sec in screen space
  alpha: number;
  yBase: number;
  bob: number;     // phase offset
}

export class Backdrop implements LayerModule {
  public container: Container;

  private skySprite: Sprite | null = null;
  private farMountain: Graphics;
  private nearMountain: Graphics;
  private cloudLayer: Container;
  private clouds: SlowCloud[] = [];
  private t = 0;
  private sw = 1;
  private sh = 1;

  constructor() {
    this.container = new Container();
    this.container.label = 'backdrop';

    // Sky will be drawn in onResize (texture depends on size).
    // Mountains: Graphics, redrawn on resize.
    this.farMountain = new Graphics();
    this.farMountain.label = 'far-mountain';
    this.nearMountain = new Graphics();
    this.nearMountain.label = 'near-mountain';

    this.cloudLayer = new Container();
    this.cloudLayer.label = 'slow-clouds';

    // Order: sky → clouds → far mountain → near mountain
    this.container.addChild(this.cloudLayer);
    this.container.addChild(this.farMountain);
    this.container.addChild(this.nearMountain);
  }

  onResize(sw: number, sh: number): void {
    this.sw = sw;
    this.sh = sh;
    const W = sw * 1.25;
    const H = sh * 1.25;
    const offX = -(W - sw) / 2;
    const offY = -(H - sh) / 2;

    // --- 1. Sky gradient (Graphics fill with gradient) ---
    // Destroy previous sky
    if (this.skySprite) {
      this.container.removeChild(this.skySprite);
      this.skySprite.destroy();
      this.skySprite = null;
    }
    const skyGfx = new Graphics();
    // Pixi v8.5+ options-object form (the positional constructor is deprecated).
    const grad = new FillGradient({
      type: 'linear',
      start: { x: 0, y: 0 },
      end: { x: 0, y: H },
      colorStops: SKY_GRADIENT.map((s) => ({
        offset: s.stop,
        color: new Color(s.color).toHex(),
      })),
    });
    skyGfx.rect(0, 0, W, H).fill(grad);
    skyGfx.position.set(offX, offY);
    // Add sky at index 0 (back-most)
    this.container.addChildAt(skyGfx, 0);
    this.skySprite = skyGfx as unknown as Sprite;

    // --- 2. Mountains ---
    this.drawMountains(W, H, offX, offY);

    // --- 3. Clouds ---
    this.buildClouds(W, H, offX, offY);
  }

  private drawMountains(W: number, H: number, offX: number, offY: number): void {
    // Far mountain: horizon at ~72%
    const horizonY = H * 0.72;
    const farPts = this.mountainRidge(W, 7, horizonY, 60, 0.37);
    this.farMountain.clear();
    this.farMountain.moveTo(offX, offY + H);
    for (const p of farPts) this.farMountain.lineTo(offX + p.x, offY + p.y);
    this.farMountain.lineTo(offX + W, offY + H);
    this.farMountain.closePath();
    this.farMountain.fill({ color: FAR_MOUNTAIN_COLOR, alpha: 0.68 });

    // Near mountain: horizon at ~82%, taller peaks
    const horizonY2 = H * 0.82;
    const nearPts = this.mountainRidge(W, 5, horizonY2, 38, 0.19);
    this.nearMountain.clear();
    this.nearMountain.moveTo(offX, offY + H);
    for (const p of nearPts) this.nearMountain.lineTo(offX + p.x, offY + p.y);
    this.nearMountain.lineTo(offX + W, offY + H);
    this.nearMountain.closePath();
    this.nearMountain.fill({ color: NEAR_MOUNTAIN_COLOR, alpha: 0.88 });
  }

  /** Return a deterministic-jittered ridge line across the width. */
  private mountainRidge(
    W: number,
    peaks: number,
    baseY: number,
    peakHeight: number,
    roughness: number
  ): { x: number; y: number }[] {
    const pts: { x: number; y: number }[] = [];
    const steps = peaks * 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = t * W;
      // Smooth peaks (sine)
      const base = Math.sin(t * Math.PI * peaks) * peakHeight;
      // Micro-jitter (deterministic)
      const jitter =
        Math.sin(t * 77.3) * peakHeight * roughness +
        Math.sin(t * 133.7 + 1.3) * peakHeight * roughness * 0.5;
      const y = baseY - Math.max(0, base + jitter) * 0.5 - peakHeight * 0.3;
      pts.push({ x, y });
    }
    return pts;
  }

  private buildClouds(W: number, H: number, offX: number, offY: number): void {
    // Clean up old clouds
    for (const c of this.clouds) c.gfx.destroy();
    this.clouds = [];
    this.cloudLayer.removeChildren();

    const N = 5;
    for (let i = 0; i < N; i++) {
      const g = new Graphics();
      // Build a soft cloud blob (3-5 overlapping ellipses)
      const blobs = 4 + (i % 2);
      for (let j = 0; j < blobs; j++) {
        const rx = 80 + Math.sin(i * 3.1 + j * 1.7) * 40 + 40;
        const ry = 22 + Math.sin(i * 1.3 + j * 2.1) * 8 + 8;
        const dx = (j - blobs / 2) * (rx * 0.55);
        const dy = Math.sin(i * 4.2 + j) * 6;
        g.ellipse(dx, dy, rx, ry).fill({ color: CLOUD_COLOR, alpha: 0.5 });
      }
      const yFrac = 0.18 + (i / N) * 0.38;
      const yBase = offY + H * yFrac;
      g.position.set(offX + ((i * 283) % Math.max(W, 1)), yBase);
      const alpha = 0.10 + ((i * 17) % 10) * 0.012;
      g.alpha = alpha;
      this.cloudLayer.addChild(g);
      this.clouds.push({
        gfx: g,
        speed: 3 + (i % 3) * 2.5, // 3~8 px/sec
        alpha,
        yBase,
        bob: i * 1.37,
      });
    }
  }

  onTick(deltaMs: number): void {
    this.t += deltaMs / 1000;
    const W = this.sw * 1.25;
    const offX = -(W - this.sw) / 2;

    // Drift clouds horizontally; wrap around.
    for (const c of this.clouds) {
      c.gfx.x += (c.speed * deltaMs) / 1000;
      // Soft vertical bob
      c.gfx.y = c.yBase + Math.sin(this.t * 0.4 + c.bob) * 4;
      // Alpha breathing
      c.gfx.alpha = c.alpha * (0.85 + Math.sin(this.t * 0.5 + c.bob) * 0.15);
      // Wrap
      if (c.gfx.x > offX + W + 300) {
        c.gfx.x = offX - 300;
      }
    }
  }

  dispose(): void {
    for (const c of this.clouds) c.gfx.destroy();
    this.clouds = [];
    try { this.container.destroy({ children: true }); } catch {}
  }
}
