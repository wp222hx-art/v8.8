/**
 * ✨ HotspotLayer — 热点标记层（方案 D）
 *
 * 替代原来的 SealPoint（红色封蜡）。视觉语言要更“暗示性”：
 *   · 极淡的金色呼吸点（没有红封蜡的强戏剧感）
 *   · 可选“漂浮金粒子”围绕热点缓慢轨道
 *   · 纸膜撕开后，呼吸点熄灭（让位于底图 + 氛围）
 *
 * 每个 Hotspot 对应一个 Landmark。玩家在地图任意位置点击都可“撕开”
 * 雾膜（见 FogVeil），但撕开位置若命中 Hotspot，会额外触发：
 *   · 一次更强的水彩爆发
 *   · Toast 弹文案
 *   · hotspot 自己熄灭
 *
 * 层级关系：挂在 MainStage 层之内、底图之上、雾膜之下。
 * 因此即使是雾膜里也能透出 hotspot 的微光 —— 这就是"雾中有东西在呼吸"的感觉。
 */
import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { Landmark, MOOD_COLORS } from '../Landmarks';
import { LayerModule } from './PaperStage';

export interface HotspotEvent {
  landmark: Landmark;
  /** World coordinate of the tap. */
  x: number;
  y: number;
}

interface HotspotItem {
  landmark: Landmark;
  gfx: Container;
  /** The breathing glow graphics (outermost). */
  glow: Graphics;
  /** The bright core dot. */
  core: Graphics;
  /** Small orbit ring of golden specks. */
  orbit: Container;
  t0: number;
  lit: boolean;  // true = still breathing, false = extinguished (tear opened)
  pulseTween?: gsap.core.Tween;
}

export class HotspotLayer implements LayerModule {
  public container: Container;
  /** Map landmark.id → item. */
  private items = new Map<string, HotspotItem>();
  /** Optional callback on tap. */
  public onHotspotTap: ((ev: HotspotEvent) => void) | null = null;

  private t = 0;

  constructor(landmarks: Landmark[]) {
    this.container = new Container();
    this.container.label = 'hotspots';
    this.container.eventMode = 'passive'; // children handle events

    for (const lm of landmarks) {
      this.addHotspot(lm);
    }
  }

  private addHotspot(lm: Landmark): void {
    const mood = MOOD_COLORS[lm.mood];
    const root = new Container();
    root.label = `hotspot_${lm.id}`;
    root.position.set(lm.cx, lm.cy);
    root.eventMode = 'static';
    root.cursor = 'pointer';
    // Generous tap radius — 62 world-px ≈ 19 CSS-px on default zoom.
    root.hitArea = { contains: (x: number, y: number) => x * x + y * y <= 62 * 62 } as any;

    // --- Outer breathing glow (soft golden halo, BRIGHT so it pierces the fog) ---
    const glow = new Graphics();
    glow.circle(0, 0, 38).fill({ color: mood.accent, alpha: 0.22 });
    glow.circle(0, 0, 26).fill({ color: mood.primary, alpha: 0.38 });
    glow.circle(0, 0, 16).fill({ color: mood.accent, alpha: 0.55 });
    glow.blendMode = 'add';
    root.addChild(glow);

    // --- Core bright dot (small, crisp, white-hot center) ---
    const core = new Graphics();
    core.circle(0, 0, 7).fill({ color: mood.accent, alpha: 0.9 });
    core.circle(0, 0, 4).fill({ color: 0xffffff, alpha: 1 });
    core.circle(0, 0, 1.8).fill({ color: 0xffffff, alpha: 1 });
    core.blendMode = 'add';
    root.addChild(core);

    // --- Orbit ring (3 tiny gold specks circling) ---
    const orbit = new Container();
    const orbitColors = [mood.primary, mood.accent, 0xffffff];
    for (let i = 0; i < 3; i++) {
      const p = new Graphics();
      p.circle(0, 0, 1.4).fill({ color: orbitColors[i], alpha: 0.9 });
      p.blendMode = 'add';
      (p as any).__phase = (i / 3) * Math.PI * 2;
      orbit.addChild(p);
    }
    root.addChild(orbit);

    this.container.addChild(root);

    const item: HotspotItem = {
      landmark: lm,
      gfx: root,
      glow,
      core,
      orbit,
      t0: Math.random() * 1000,
      lit: true,
    };
    this.items.set(lm.id, item);

    root.on('pointertap', (ev: any) => {
      if (!item.lit) return;
      // Translate click position into world coords via the container itself
      // (hotspot root lives in world space). Use landmark center as fallback.
      this.onHotspotTap?.({
        landmark: lm,
        x: lm.cx,
        y: lm.cy,
      });
    });
  }

  /** Extinguish a hotspot (after tear has been opened at it). */
  extinguish(landmarkId: string): void {
    const item = this.items.get(landmarkId);
    if (!item || !item.lit) return;
    item.lit = false;
    // Quick flare → fade.
    gsap.to(item.glow.scale, { x: 2.4, y: 2.4, duration: 0.55, ease: 'power2.out' });
    gsap.to(item.glow, { alpha: 0, duration: 0.55, ease: 'power2.out' });
    gsap.to(item.core.scale, { x: 3.2, y: 3.2, duration: 0.3, ease: 'power1.out' });
    gsap.to(item.core, { alpha: 0, duration: 0.55, ease: 'power1.out' });
    gsap.to(item.orbit, { alpha: 0, duration: 0.45, ease: 'power1.out' });
    // Disable interaction so the tear gap beneath can be re-clicked.
    item.gfx.eventMode = 'none';
    item.gfx.cursor = 'default';
  }

  /** Re-light an extinguished hotspot (debug / reset). */
  relight(landmarkId: string): void {
    const item = this.items.get(landmarkId);
    if (!item) return;
    item.lit = true;
    item.gfx.eventMode = 'static';
    item.gfx.cursor = 'pointer';
    gsap.set(item.glow, { alpha: 1 });
    gsap.set(item.glow.scale, { x: 1, y: 1 });
    gsap.set(item.core, { alpha: 1 });
    gsap.set(item.core.scale, { x: 1, y: 1 });
    gsap.set(item.orbit, { alpha: 1 });
  }

  /** Get position of a hotspot (for external trigger). */
  getPosition(landmarkId: string): { x: number; y: number } | null {
    const item = this.items.get(landmarkId);
    return item ? { x: item.landmark.cx, y: item.landmark.cy } : null;
  }

  onResize(_sw: number, _sh: number): void {
    // Hotspots live in world space — nothing to reflow.
  }

  onTick(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.t += dt;
    for (const item of this.items.values()) {
      if (!item.lit) continue;
      const t = this.t + item.t0;
      // Breathing glow: alpha 0.6 ↔ 1.0, scale 0.95 ↔ 1.12
      const breath = 0.78 + Math.sin(t * 1.4) * 0.22;
      item.glow.alpha = breath;
      const s = 0.92 + Math.sin(t * 1.4) * 0.18;
      item.glow.scale.set(s, s);
      // Core: tiny quick flicker to feel "alive"
      item.core.alpha = 0.8 + Math.sin(t * 3.3) * 0.15 + Math.sin(t * 7.2) * 0.05;
      // Orbit children circle around
      const children = item.orbit.children;
      for (let i = 0; i < children.length; i++) {
        const p = children[i] as any;
        const phase = p.__phase ?? 0;
        const a = t * 0.9 + phase;
        const r = 15 + Math.sin(t * 0.6 + phase) * 1.5;
        p.x = Math.cos(a) * r;
        p.y = Math.sin(a) * r;
        p.alpha = 0.6 + Math.sin(t * 2.1 + phase) * 0.35;
      }
    }
  }

  dispose(): void {
    for (const item of this.items.values()) {
      try { item.pulseTween?.kill(); } catch {}
      gsap.killTweensOf(item.glow);
      gsap.killTweensOf(item.glow.scale);
      gsap.killTweensOf(item.core);
      gsap.killTweensOf(item.core.scale);
      gsap.killTweensOf(item.orbit);
    }
    this.items.clear();
    try { this.container.destroy({ children: true }); } catch {}
  }
}
