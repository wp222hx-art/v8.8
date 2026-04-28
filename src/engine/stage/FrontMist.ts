/**
 * ☁️ FrontMist — 前景大气层
 *
 * 三种可独立开关的粒子系统：
 *   1. FloatingCloud  大颗飘动云絮（3~5 个）— 极低透明，轻微虚化感
 *   2. GoldDust       金色粉尘粒子（40~60 个）— 缓慢上升+横飘
 *   3. Firefly        萤火/暖光点（8~12 个）— 闪烁呼吸
 *
 * 性能：全部用 Graphics（不是 ParticleContainer），但总数 <= 80，
 * 移动端 60fps 完全没问题。未来若要更多粒子，可改 ParticleContainer。
 *
 * 所有粒子都在"世界空间"（map coords）活动，因此与地图一起 parallax；
 * PaperStage 给此层额外一点视差 offset 让它有"前景漂浮"感。
 */
import { Container, Graphics, BLEND_MODES } from 'pixi.js';
import { LayerModule } from './PaperStage';

interface Cloud {
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;           // world px / sec
  alphaBase: number;
  phase: number;
  wrapW: number;
}
interface Dust {
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;           // upward drift
  r: number;
  alphaBase: number;
  phase: number;
  life: number;         // 0..1, once > 1 respawn
  wrapW: number;
  wrapH: number;
}
interface Firefly {
  gfx: Graphics;
  cx: number;
  cy: number;
  orbitR: number;
  orbitSpeed: number;
  alphaBase: number;
  phase: number;
  color: number;
}

export class FrontMist implements LayerModule {
  public container: Container;
  private cloudLayer: Container;
  private dustLayer: Container;
  private fireflyLayer: Container;
  private clouds: Cloud[] = [];
  private dust: Dust[] = [];
  private fireflies: Firefly[] = [];
  private t = 0;
  private mapW: number;
  private mapH: number;

  constructor(mapW: number, mapH: number) {
    this.mapW = mapW;
    this.mapH = mapH;
    this.container = new Container();
    this.container.label = 'front-mist';

    this.cloudLayer = new Container();
    this.dustLayer = new Container();
    this.fireflyLayer = new Container();
    // Blend: add for fireflies (makes them glow over dark fog)
    this.fireflyLayer.blendMode = 'add';

    this.container.addChild(this.cloudLayer);
    this.container.addChild(this.dustLayer);
    this.container.addChild(this.fireflyLayer);

    this.buildClouds();
    this.buildDust();
    this.buildFireflies();
  }

  private buildClouds(): void {
    const N = 4;
    for (let i = 0; i < N; i++) {
      const g = new Graphics();
      // Build a soft elongated cloud (blurry painterly feel from multiple ellipses)
      const blobs = 5 + (i % 3);
      for (let j = 0; j < blobs; j++) {
        const rx = 120 + Math.sin(i * 2.7 + j * 1.1) * 50 + 30;
        const ry = 28 + Math.sin(i * 1.3 + j * 2.1) * 8 + 8;
        const dx = (j - blobs / 2) * (rx * 0.45);
        const dy = Math.sin(i * 3.2 + j * 0.7) * 8;
        g.ellipse(dx, dy, rx, ry).fill({ color: 0xf8eacc, alpha: 0.22 });
      }
      g.alpha = 0.55;
      g.x = (i / N) * this.mapW + (Math.sin(i * 3.1) * 200);
      g.y = (Math.sin(i * 1.7) * 0.3 + 0.25) * this.mapH;
      this.cloudLayer.addChild(g);
      this.clouds.push({
        gfx: g, x: g.x, y: g.y,
        vx: 8 + (i % 3) * 4,
        alphaBase: 0.55,
        phase: i * 1.9,
        wrapW: this.mapW + 400,
      });
    }
  }

  private buildDust(): void {
    const N = 55;
    for (let i = 0; i < N; i++) {
      const g = new Graphics();
      const r = 1.5 + (i % 4) * 0.7;
      g.circle(0, 0, r).fill({ color: 0xffe7a8, alpha: 0.85 });
      g.blendMode = 'add';
      g.x = (Math.sin(i * 4.3) * 0.5 + 0.5) * this.mapW;
      g.y = (Math.cos(i * 2.7) * 0.5 + 0.5) * this.mapH;
      this.dustLayer.addChild(g);
      this.dust.push({
        gfx: g,
        x: g.x, y: g.y,
        vx: (Math.sin(i * 7.3) * 0.5) * 4,   // -2 ~ 2 px/sec
        vy: -6 - (i % 4) * 1.5,               // upward
        r,
        alphaBase: 0.5 + (i % 4) * 0.12,
        phase: i * 0.83,
        life: (i * 0.031) % 1,
        wrapW: this.mapW,
        wrapH: this.mapH,
      });
    }
  }

  private buildFireflies(): void {
    const N = 10;
    const colors = [0xffd27a, 0xffb56e, 0xf6c048, 0xffe7a8];
    for (let i = 0; i < N; i++) {
      const g = new Graphics();
      const color = colors[i % colors.length];
      // Glow: big soft + small bright
      g.circle(0, 0, 12).fill({ color, alpha: 0.10 });
      g.circle(0, 0, 6).fill({ color, alpha: 0.28 });
      g.circle(0, 0, 2).fill({ color: 0xffffff, alpha: 0.85 });
      g.x = (Math.sin(i * 5.9) * 0.5 + 0.5) * this.mapW;
      g.y = (Math.cos(i * 3.1) * 0.5 + 0.5) * this.mapH;
      this.fireflyLayer.addChild(g);
      this.fireflies.push({
        gfx: g,
        cx: g.x, cy: g.y,
        orbitR: 30 + (i % 5) * 10,
        orbitSpeed: 0.3 + (i % 4) * 0.12,
        alphaBase: 0.5 + (i % 4) * 0.12,
        phase: i * 1.47,
        color,
      });
    }
  }

  onResize(_sw: number, _sh: number): void {
    // Nothing — we use map coords.
  }

  onTick(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.t += dt;

    // --- Clouds ---
    for (const c of this.clouds) {
      c.x += c.vx * dt;
      if (c.x > c.wrapW) c.x = -200;
      c.gfx.x = c.x;
      c.gfx.y = c.y + Math.sin(this.t * 0.4 + c.phase) * 6;
      c.gfx.alpha = c.alphaBase * (0.75 + Math.sin(this.t * 0.3 + c.phase) * 0.25);
    }

    // --- Dust ---
    for (const d of this.dust) {
      d.life += dt / 14; // 14s lifetime
      if (d.life >= 1) {
        d.life = 0;
        // Respawn at bottom
        d.x = (Math.sin(this.t * 3.1 + d.phase) * 0.5 + 0.5) * d.wrapW;
        d.y = d.wrapH + 20;
      }
      d.x += d.vx * dt + Math.sin(this.t + d.phase) * 4 * dt;
      d.y += d.vy * dt;
      d.gfx.x = d.x;
      d.gfx.y = d.y;
      // Fade in for first 15%, fade out for last 15%
      const fade = d.life < 0.15 ? d.life / 0.15 :
                   d.life > 0.85 ? (1 - d.life) / 0.15 : 1;
      d.gfx.alpha = d.alphaBase * fade;
    }

    // --- Fireflies ---
    for (const f of this.fireflies) {
      const a = this.t * f.orbitSpeed + f.phase;
      f.gfx.x = f.cx + Math.cos(a) * f.orbitR;
      f.gfx.y = f.cy + Math.sin(a * 0.8) * f.orbitR * 0.6;
      // Flicker (blink-like)
      const flicker = 0.7 + Math.sin(this.t * 3.3 + f.phase) * 0.25 + Math.sin(this.t * 7.7 + f.phase * 2) * 0.10;
      f.gfx.alpha = f.alphaBase * flicker;
    }
  }

  dispose(): void {
    try { this.container.destroy({ children: true }); } catch {}
    this.clouds = [];
    this.dust = [];
    this.fireflies = [];
  }
}
