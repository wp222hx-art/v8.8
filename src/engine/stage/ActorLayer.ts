/**
 * 🎎 ActorLayer — 纸片人物容器（占位实现）
 *
 * 挂在 MainStage 层的内部（底图之上、热点之下或之上，视后续美术）。
 * 每个 Actor：
 *   · sprite     纸片立绘（未来接入纸片人物资产）
 *   · shadow     足部水彩阴影（参数化 Graphics，不依赖资产）
 *   · label      头顶小名牌（占位，HTML 可接管）
 *
 * 当前这版：
 *   · 不自动加载任何角色，只提供 add/remove/moveTo/speak 接口
 *   · 用一个彩色小纸片矩形作为占位，方便未来替换成真正的立绘纹理
 *   · 角色在地图坐标系下走动，路径由调用方给出（后续引入 A* 或预定义路径）
 *
 * 对外暴露：
 *   · addActor(id, opts)
 *   · moveActor(id, {x,y}, seconds)
 *   · removeActor(id)
 *   · speak(id, text, ms)   —— 发出 window CustomEvent 'actor-speak'，
 *                              由 React UI 层接收并渲染气泡
 */
import { Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { LayerModule } from './PaperStage';

export interface ActorOptions {
  id: string;
  x: number;
  y: number;
  color?: number;       // placeholder tint
  name?: string;
  /** Display height in world-px. Width auto = height * 0.55. */
  height?: number;
}

interface ActorItem {
  id: string;
  opts: ActorOptions;
  container: Container;
  body: Graphics;
  shadow: Graphics;
  /** For subtle idle sway */
  t0: number;
}

export interface ActorSpeakEvent {
  id: string;
  text: string;
  /** Anchored world coordinate (over the head) for the UI to project. */
  x: number;
  y: number;
  ms: number;
}

export class ActorLayer implements LayerModule {
  public container: Container;
  private actors = new Map<string, ActorItem>();
  private t = 0;

  constructor() {
    this.container = new Container();
    this.container.label = 'actors';
    // Sort children so actors lower on Y appear in front (isometric-ish).
    this.container.sortableChildren = true;
  }

  addActor(opts: ActorOptions): void {
    if (this.actors.has(opts.id)) return;

    const h = opts.height ?? 96;
    const w = h * 0.55;
    const color = opts.color ?? 0xf082b5;

    const root = new Container();
    root.label = `actor_${opts.id}`;
    root.position.set(opts.x, opts.y);

    // --- Shadow (ellipse beneath feet) ---
    const shadow = new Graphics();
    shadow.ellipse(0, 0, w * 0.45, w * 0.16).fill({ color: 0x000000, alpha: 0.26 });
    shadow.y = 0;
    root.addChild(shadow);

    // --- Body placeholder (rounded rectangle "paper doll") ---
    const body = new Graphics();
    const bodyW = w;
    const bodyH = h;
    // Body is drawn ABOVE the anchor (-bodyH..0) so feet sit at (0,0)
    body.roundRect(-bodyW / 2, -bodyH, bodyW, bodyH, 8)
        .fill({ color, alpha: 0.9 })
        .stroke({ color: 0x2a1f18, width: 1.5, alpha: 0.7 });
    // Head dot
    body.circle(0, -bodyH + bodyW * 0.35, bodyW * 0.22)
        .fill({ color: 0xf7dca6, alpha: 1 })
        .stroke({ color: 0x2a1f18, width: 1.2, alpha: 0.65 });
    root.addChild(body);

    // Y-sort by feet-y
    root.zIndex = opts.y;
    this.container.addChild(root);

    const item: ActorItem = {
      id: opts.id,
      opts,
      container: root,
      body,
      shadow,
      t0: Math.random() * 1000,
    };
    this.actors.set(opts.id, item);
  }

  /** Smoothly walk an actor to (x,y) over the given seconds. */
  moveActor(id: string, target: { x: number; y: number }, seconds: number): Promise<void> {
    return new Promise((resolve) => {
      const item = this.actors.get(id);
      if (!item) return resolve();
      gsap.to(item.container, {
        x: target.x,
        y: target.y,
        duration: seconds,
        ease: 'sine.inOut',
        onUpdate: () => {
          item.container.zIndex = item.container.y;
          // Tiny bob for paper walk cycle
          item.body.y = Math.sin((performance.now() / 1000) * 8) * 1.5;
        },
        onComplete: () => {
          item.body.y = 0;
          item.opts.x = target.x;
          item.opts.y = target.y;
          resolve();
        },
      });
    });
  }

  removeActor(id: string): void {
    const item = this.actors.get(id);
    if (!item) return;
    gsap.killTweensOf(item.container);
    gsap.killTweensOf(item.body);
    try { item.container.destroy({ children: true }); } catch {}
    this.actors.delete(id);
  }

  /** Dispatch a speak event — UI layer listens for it and renders a bubble. */
  speak(id: string, text: string, ms = 3200): void {
    const item = this.actors.get(id);
    if (!item) return;
    const ev: ActorSpeakEvent = {
      id,
      text,
      x: item.container.x,
      // Head-top anchor (approx −height above feet)
      y: item.container.y - (item.opts.height ?? 96) - 6,
      ms,
    };
    try {
      window.dispatchEvent(new CustomEvent('actor-speak', { detail: ev }));
    } catch {}
  }

  /** Read actor position (for the UI bubble projection). */
  getPosition(id: string): { x: number; y: number } | null {
    const item = this.actors.get(id);
    return item ? { x: item.container.x, y: item.container.y } : null;
  }

  /** All active actor positions (e.g. for the UI to re-project every frame). */
  listActors(): Array<{ id: string; x: number; y: number; headY: number }> {
    const out: Array<{ id: string; x: number; y: number; headY: number }> = [];
    for (const item of this.actors.values()) {
      out.push({
        id: item.id,
        x: item.container.x,
        y: item.container.y,
        headY: item.container.y - (item.opts.height ?? 96) - 6,
      });
    }
    return out;
  }

  onResize(_sw: number, _sh: number): void {
    // Actors live in world space — nothing to reflow.
  }

  onTick(deltaMs: number): void {
    const dt = deltaMs / 1000;
    this.t += dt;
    // Idle sway — a very subtle scale "breath" on each actor
    for (const item of this.actors.values()) {
      const t = this.t + item.t0;
      const s = 1 + Math.sin(t * 1.1) * 0.012;
      item.body.scale.set(s, s);
      // Shadow subtle pulse
      item.shadow.alpha = 0.22 + Math.sin(t * 1.1 + 0.4) * 0.04;
    }
  }

  dispose(): void {
    for (const item of this.actors.values()) {
      gsap.killTweensOf(item.container);
      gsap.killTweensOf(item.body);
    }
    this.actors.clear();
    try { this.container.destroy({ children: true }); } catch {}
  }
}
