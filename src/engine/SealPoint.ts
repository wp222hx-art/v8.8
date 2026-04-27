/**
 * 🔴 SealPoint — 金色封蜡交互点
 *
 * 视觉：一滴深红色封蜡 + 中央金色图章 + 外圈呼吸光晕
 * 行为：
 *   · idle    持续呼吸脉搏（光晕 alpha + scale 摆动）
 *   · hover   光晕放大、封蜡轻微抬起
 *   · tap     压下→回弹→爆裂（封蜡碎片四散）→发射 onAwaken 事件
 *
 * 坐标系：SealPoint 的 (0,0) = 封蜡中心，调用者负责把它放到 image-space 的 (cx,cy)。
 */
import { Container, Graphics, FederatedPointerEvent } from 'pixi.js';
import { gsap } from 'gsap';
import { Landmark, MOOD_COLORS } from './Landmarks';

export class SealPoint extends Container {
  public landmark: Landmark;
  public awakened = false;
  public onAwaken: ((l: Landmark) => void) | null = null;

  private halo: Graphics;     // 外圈呼吸光晕
  private wax: Graphics;      // 深红色封蜡底
  private stamp: Graphics;    // 中央金章（抽象符号）
  private pulseTween?: gsap.core.Tween;
  private haloTween?: gsap.core.Tween;

  /** 封蜡视觉半径（image-space 像素）。独立于 landmark.radius（显色窗半径）。 */
  static readonly SEAL_R = 36;

  constructor(landmark: Landmark) {
    super();
    this.landmark = landmark;
    this.label = `seal_${landmark.id}`;

    // --- layer 0: outer halo (breathing ring) ---
    this.halo = new Graphics();
    this.addChild(this.halo);
    this.drawHalo(0.5);

    // --- layer 1: wax drop (deep red circle with drip) ---
    this.wax = new Graphics();
    this.addChild(this.wax);
    this.drawWax();

    // --- layer 2: gold stamp (abstract sigil in the center) ---
    this.stamp = new Graphics();
    this.addChild(this.stamp);
    this.drawStamp();

    // Hit area — a bit larger than wax for finger-friendly tapping
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = { contains: (x: number, y: number) => x * x + y * y <= 48 * 48 } as any;

    this.on('pointerover', this.handleOver);
    this.on('pointerout', this.handleOut);
    this.on('pointertap', this.handleTap);

    this.startIdle();
  }

  private drawHalo(alpha: number): void {
    const R = SealPoint.SEAL_R;
    this.halo.clear();
    // 3 concentric rings fading outward
    this.halo.circle(0, 0, R * 1.6).fill({ color: 0xfce08a, alpha: alpha * 0.14 });
    this.halo.circle(0, 0, R * 1.25).fill({ color: 0xffd966, alpha: alpha * 0.22 });
    this.halo.circle(0, 0, R * 0.95).stroke({
      color: 0xffd966, width: 2.2, alpha: alpha * 0.85,
    });
  }

  private drawWax(): void {
    const R = SealPoint.SEAL_R;
    this.wax.clear();
    // Main blob
    this.wax.circle(0, 0, R * 0.8).fill({ color: 0x8b1a1a, alpha: 1 });
    // Slight drip
    this.wax.ellipse(0, R * 0.35, R * 0.75, R * 0.9).fill({ color: 0x701010, alpha: 0.9 });
    this.wax.circle(0, 0, R * 0.78).fill({ color: 0xa02222, alpha: 1 });
    // Highlight (top-left glint, gives "3D" wax look)
    this.wax.circle(-R * 0.25, -R * 0.25, R * 0.25)
      .fill({ color: 0xe24a4a, alpha: 0.75 });
    this.wax.circle(-R * 0.32, -R * 0.32, R * 0.12)
      .fill({ color: 0xffb4b4, alpha: 0.9 });
    // Dark rim
    this.wax.circle(0, 0, R * 0.78)
      .stroke({ color: 0x5a0e0e, width: 1.2, alpha: 0.9 });
  }

  private drawStamp(): void {
    const R = SealPoint.SEAL_R;
    this.stamp.clear();
    // Abstract SYNAPSE-style sigil: a 6-point star inside a circle
    const gold = 0xf5c24a;
    this.stamp.circle(0, 0, R * 0.42).stroke({ color: gold, width: 1.5, alpha: 0.9 });
    // 6-point star
    const r1 = R * 0.38, r2 = R * 0.16;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6 - Math.PI / 2;
      const r = i % 2 === 0 ? r1 : r2;
      const x = r * Math.cos(a), y = r * Math.sin(a);
      if (i === 0) this.stamp.moveTo(x, y);
      else this.stamp.lineTo(x, y);
    }
    this.stamp.closePath();
    this.stamp.fill({ color: gold, alpha: 0.95 });
    this.stamp.stroke({ color: 0xffffff, width: 0.7, alpha: 0.4 });
  }

  private startIdle(): void {
    // Heartbeat: quick contract + slow expand
    this.pulseTween = gsap.to(this.scale, {
      x: 1.1, y: 1.1,
      duration: 0.9,
      ease: 'sine.inOut',
      yoyo: true, repeat: -1,
    });
    // Halo breathing (alpha and scale)
    const haloObj = { a: 0.5 };
    this.haloTween = gsap.to(haloObj, {
      a: 1.0,
      duration: 1.6,
      ease: 'sine.inOut',
      yoyo: true, repeat: -1,
      onUpdate: () => this.drawHalo(haloObj.a),
    });
  }

  private handleOver = () => {
    if (this.awakened) return;
    gsap.killTweensOf(this.scale);
    gsap.to(this.scale, { x: 1.2, y: 1.2, duration: 0.2, ease: 'back.out(2)' });
  };

  private handleOut = () => {
    if (this.awakened) return;
    gsap.killTweensOf(this.scale);
    this.pulseTween?.kill();
    this.startIdle(); // restart pulse
  };

  private handleTap = (ev: FederatedPointerEvent) => {
    if (this.awakened) return;
    ev.stopPropagation();
    this.awaken();
  };

  /**
   * 🎭 Awaken animation — 1.1s total
   *   0.00-0.12  press down (scale 0.7) — "玩家按下"
   *   0.12-0.35  halo & wax bloom out (scale 2.2, alpha 0)
   *   0.12-0.90  wax shatters into 8 particles radiating outward
   *   0.20       fire onAwaken → scene starts color-reveal at this landmark
   */
  awaken(): void {
    if (this.awakened) return;
    this.awakened = true;
    this.eventMode = 'none';
    this.pulseTween?.kill();
    this.haloTween?.kill();
    gsap.killTweensOf(this.scale);

    const tl = gsap.timeline();

    // 1. Press
    tl.to(this.scale, { x: 0.7, y: 0.7, duration: 0.12, ease: 'power2.in' });

    // 2. Fire awaken callback at the start of bloom (so color reveal begins now)
    tl.call(() => this.onAwaken?.(this.landmark));

    // 3. Bloom — halo & stamp expand and fade
    tl.to(this.halo.scale, { x: 2.2, y: 2.2, duration: 0.6, ease: 'power2.out' }, '<');
    tl.to(this.halo, { alpha: 0, duration: 0.6, ease: 'power2.out' }, '<');
    tl.to(this.stamp.scale, { x: 2.0, y: 2.0, duration: 0.5, ease: 'power2.out' }, '<');
    tl.to(this.stamp, { alpha: 0, duration: 0.5, ease: 'power2.out' }, '<');

    // 4. Wax shrinks
    tl.to(this.wax.scale, { x: 0.4, y: 0.4, duration: 0.3, ease: 'back.in(2)' }, '<');
    tl.to(this.wax, { alpha: 0, duration: 0.3, ease: 'power2.in' }, '<+=0.1');

    // 5. Particles — spawn 10 wax crumbs radiating outward
    const mood = MOOD_COLORS[this.landmark.mood];
    tl.call(() => this.spawnParticles(mood.primary, mood.accent), undefined, '<');

    // 6. Self-destruct after animation
    tl.call(() => {
      // Keep the container alive for hit-area removal but invisible
      this.visible = false;
    }, undefined, '+=0.3');
  }

  private spawnParticles(color: number, accent: number): void {
    const count = 12;
    for (let i = 0; i < count; i++) {
      const p = new Graphics();
      const r = 2 + Math.random() * 3.5;
      p.circle(0, 0, r).fill({
        color: i % 3 === 0 ? accent : color,
        alpha: 0.95,
      });
      this.addChild(p);
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const dist = SealPoint.SEAL_R * (1.8 + Math.random() * 1.4);
      gsap.to(p, {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        alpha: 0,
        duration: 0.8 + Math.random() * 0.35,
        ease: 'power2.out',
        onComplete: () => p.destroy(),
      });
      gsap.to(p.scale, {
        x: 0.3, y: 0.3,
        duration: 0.8 + Math.random() * 0.35,
        ease: 'power2.out',
      });
    }
  }

  dispose(): void {
    this.pulseTween?.kill();
    this.haloTween?.kill();
    gsap.killTweensOf(this.scale);
    gsap.killTweensOf(this.halo);
    gsap.killTweensOf(this.stamp);
    gsap.killTweensOf(this.wax);
    this.destroy({ children: true });
  }
}
