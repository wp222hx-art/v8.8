/**
 * ☀️ DistantLight — 远端舞台光影
 *
 * 两种光效叠加（全部用 BlendMode.ADD，不遮挡底图）：
 *   1. 晨曦光柱 (God-rays)：两道斜射的大三角形，金色，低透明
 *   2. 半圆形暖光晕 (Warm haze)：地平线处的一个大椭圆渐变
 *
 * 呼吸：光强度 10s 周期微波动 + 色温缓慢漂移
 * 目的：让整个舞台有"被什么照亮着"的感觉（不是平的）
 */
import {
  Container,
  Graphics,
  Sprite,
  Texture,
  BLEND_MODES,
  FillGradient,
  Color,
} from 'pixi.js';
import { LayerModule } from './PaperStage';

const LIGHT_COLOR_WARM = 0xffd9a0;
const LIGHT_COLOR_HOT = 0xffb56e;

export class DistantLight implements LayerModule {
  public container: Container;
  private rayA: Graphics;
  private rayB: Graphics;
  private horizonGlow: Graphics;
  private t = 0;
  private sw = 1;
  private sh = 1;

  constructor() {
    this.container = new Container();
    this.container.label = 'distant-light';
    // The whole layer uses ADD blend so it only brightens, never darkens.
    this.container.blendMode = 'add';

    this.horizonGlow = new Graphics();
    this.rayA = new Graphics();
    this.rayB = new Graphics();

    this.container.addChild(this.horizonGlow);
    this.container.addChild(this.rayA);
    this.container.addChild(this.rayB);
  }

  onResize(sw: number, sh: number): void {
    this.sw = sw;
    this.sh = sh;
    this.redrawHorizon();
    this.redrawRays();
  }

  private redrawHorizon(): void {
    const W = this.sw, H = this.sh;
    this.horizonGlow.clear();
    // Giant soft ellipse sitting at the horizon line (~ 65% down)
    const cx = W * 0.5;
    const cy = H * 0.65;
    // Multi-layer radial glow (stacked ellipses with decreasing alpha)
    const layers = [
      { rx: W * 0.65, ry: H * 0.30, alpha: 0.16, color: LIGHT_COLOR_WARM },
      { rx: W * 0.45, ry: H * 0.18, alpha: 0.20, color: LIGHT_COLOR_WARM },
      { rx: W * 0.28, ry: H * 0.10, alpha: 0.28, color: LIGHT_COLOR_HOT },
      { rx: W * 0.15, ry: H * 0.05, alpha: 0.35, color: 0xfff0c8 },
    ];
    for (const L of layers) {
      this.horizonGlow.ellipse(cx, cy, L.rx, L.ry).fill({ color: L.color, alpha: L.alpha });
    }
  }

  private redrawRays(): void {
    const W = this.sw, H = this.sh;
    // Two slanted god-ray triangles from upper-right, with a soft gradient.
    // We approximate "soft" by stacking 3 triangles of decreasing alpha/width.
    this.rayA.clear();
    this.rayB.clear();

    const source = { x: W * 0.78, y: -H * 0.05 };

    // Ray A: wider, more distant (low alpha)
    const rayA_tilt = 0.55; // slope
    const rayA_width = W * 0.22;
    for (let i = 0; i < 3; i++) {
      const a = (0.10 - i * 0.025);
      const w = rayA_width - i * (rayA_width * 0.25);
      this.rayA.moveTo(source.x - w, source.y);
      this.rayA.lineTo(source.x + w, source.y);
      this.rayA.lineTo(source.x + w * 0.6 - rayA_tilt * H * 1.3, source.y + H * 1.3);
      this.rayA.lineTo(source.x - w * 0.6 - rayA_tilt * H * 1.3, source.y + H * 1.3);
      this.rayA.closePath();
      this.rayA.fill({ color: LIGHT_COLOR_WARM, alpha: a });
    }

    // Ray B: narrower, more focused (higher alpha)
    const rayB_tilt = 0.42;
    const rayB_width = W * 0.13;
    const sourceB = { x: W * 0.62, y: -H * 0.05 };
    for (let i = 0; i < 3; i++) {
      const a = (0.14 - i * 0.035);
      const w = rayB_width - i * (rayB_width * 0.25);
      this.rayB.moveTo(sourceB.x - w, sourceB.y);
      this.rayB.lineTo(sourceB.x + w, sourceB.y);
      this.rayB.lineTo(sourceB.x + w * 0.6 - rayB_tilt * H * 1.3, sourceB.y + H * 1.3);
      this.rayB.lineTo(sourceB.x - w * 0.6 - rayB_tilt * H * 1.3, sourceB.y + H * 1.3);
      this.rayB.closePath();
      this.rayB.fill({ color: LIGHT_COLOR_HOT, alpha: a });
    }
  }

  onTick(deltaMs: number): void {
    this.t += deltaMs / 1000;
    // Gentle breathing
    const pulse = 0.85 + Math.sin(this.t * 0.42) * 0.15;
    this.horizonGlow.alpha = pulse;
    this.rayA.alpha = 0.7 + Math.sin(this.t * 0.31 + 0.7) * 0.20;
    this.rayB.alpha = 0.8 + Math.sin(this.t * 0.27 + 2.1) * 0.20;
  }

  dispose(): void {
    try { this.container.destroy({ children: true }); } catch {}
  }
}
