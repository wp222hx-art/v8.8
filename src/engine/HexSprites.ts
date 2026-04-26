/**
 * 🌫️ HexSprites — Fog-overlay hexagons aligned to the painted Rivershire map.
 *
 * New architecture (v2):
 *   · The full Rivershire PNG is a single Sprite underneath → shows the
 *     hand-painted terrain through fog holes.
 *   · Each HexCellSprite is ONLY a fog mask at the exact image-pixel
 *     coordinates of its cell. On reveal, the fog fades out, revealing
 *     the beautifully painted tile below.
 *
 * Layers per cell (bottom → top):
 *   1) glow     — rarity aura (behind fog, blooms during reveal)
 *   2) fog      — charcoal ink body (hex-shaped)
 *   3) swirl    — lighter mist circle (slow rotation)
 *   4) hit      — transparent click area (slightly smaller than fog)
 */
import {
  Container,
  Graphics,
  FederatedPointerEvent,
} from 'pixi.js';
import { gsap } from 'gsap';
import {
  HexCellData,
  HexState,
  Rarity,
  Terrain,
  RARITY_COLOR,
  HEX_RADIUS,
} from './HexMap';

/** Draw a pointy-top hexagon path onto a Graphics object. */
export function drawHexPath(g: Graphics, size: number): Graphics {
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 90); // -90° ⇒ top vertex
    const x = size * Math.cos(angle);
    const y = size * Math.sin(angle);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  return g;
}

/* -------------------------------------------------------------- *
 * HexCellSprite
 * -------------------------------------------------------------- */
export class HexCellSprite extends Container {
  public data: HexCellData;
  public fog: Graphics;
  public swirl: Graphics;
  public hit: Graphics;
  public glow?: Graphics;

  public onClick: ((cell: HexCellData) => void) | null = null;
  private idleSwirlTween?: gsap.core.Tween;
  private idleBreatheTween?: gsap.core.Tween;

  constructor(cell: HexCellData) {
    super();
    this.data = { ...cell };
    this.label = `hex_${cell.id}`;

    // ---- fog body ----
    this.fog = new Graphics();
    this.redrawFog();
    this.addChild(this.fog);

    // ---- swirl (inner lighter mist) ----
    this.swirl = new Graphics();
    drawHexPath(this.swirl, HEX_RADIUS * 0.62);
    this.swirl.fill({ color: 0x5d5d7a, alpha: 0.45 });
    drawHexPath(this.swirl, HEX_RADIUS * 0.32);
    this.swirl.fill({ color: 0xaaaac8, alpha: 0.25 });
    this.addChild(this.swirl);

    // ---- hit area ----
    this.hit = new Graphics();
    drawHexPath(this.hit, HEX_RADIUS * 0.94);
    this.hit.fill({ color: 0xffffff, alpha: 0.001 });
    this.hit.eventMode = 'static';
    this.hit.cursor = 'pointer';
    this.hit.on('pointertap', (ev: FederatedPointerEvent) => {
      ev.stopPropagation();
      this.onClick?.(this.data);
    });
    this.hit.on('pointerover', () => {
      if (this.data.state === HexState.FOGGED) {
        gsap.to(this.scale, { x: 1.05, y: 1.05, duration: 0.2, ease: 'power2.out' });
      }
    });
    this.hit.on('pointerout', () => {
      if (this.data.state === HexState.FOGGED) {
        gsap.to(this.scale, { x: 1, y: 1, duration: 0.25, ease: 'power2.out' });
      }
    });
    this.addChild(this.hit);

    // ---- idle motion ----
    const swirlDur = 18 + ((cell.col * 7 + cell.row * 13) % 9);
    this.idleSwirlTween = gsap.to(this.swirl, {
      rotation: Math.PI * 2,
      duration: swirlDur,
      repeat: -1,
      ease: 'none',
    });
    this.idleBreatheTween = gsap.to(this.fog, {
      alpha: 0.88,
      duration: 2.2 + ((cell.col + cell.row) % 3) * 0.3,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
    });
  }

  private redrawFog(): void {
    this.fog.clear();
    // Outer charcoal body — FULLY opaque so painted tile is hidden
    drawHexPath(this.fog, HEX_RADIUS);
    this.fog.fill({ color: 0x14121c, alpha: 1.0 });
    // Mid tone
    drawHexPath(this.fog, HEX_RADIUS * 0.85);
    this.fog.fill({ color: 0x2b2740, alpha: 0.9 });
    // Subtle golden rim
    drawHexPath(this.fog, HEX_RADIUS - 1);
    this.fog.stroke({ color: 0xfbe29b, width: 1.4, alpha: 0.35 });
  }

  private drawRarityGlow(rarity: Rarity): void {
    if (rarity === Rarity.Common) return;
    const g = new Graphics();
    drawHexPath(g, HEX_RADIUS + 4);
    g.stroke({ color: RARITY_COLOR[rarity], width: 5, alpha: 0.95 });
    drawHexPath(g, HEX_RADIUS + 14);
    g.stroke({ color: RARITY_COLOR[rarity], width: 3.5, alpha: 0.45 });
    drawHexPath(g, HEX_RADIUS + 26);
    g.stroke({ color: RARITY_COLOR[rarity], width: 2, alpha: 0.2 });
    this.addChildAt(g, 0); // behind fog
    this.glow = g;

    gsap.fromTo(
      g,
      { alpha: 0 },
      { alpha: 1, duration: 0.35, ease: 'power2.out' }
    );
    gsap.to(g, {
      alpha: 0.55,
      duration: 1.4,
      yoyo: true,
      repeat: -1,
      ease: 'sine.inOut',
      delay: 0.35,
    });
  }

  /**
   * 🎭 Signature reveal animation (~1.1 s total):
   *   0.00–0.08  click punch (scale 0.92)
   *   0.08–0.55  fog body fades + swirl spirals out & scales up
   *   0.55–0.78  scale pop (1.12)
   *   0.78–1.18  elastic settle + rarity glow bloom + burst
   */
  reveal(_terrain: Terrain, rarity: Rarity, onComplete?: () => void): void {
    this.data.state = HexState.REVEALING;
    this.data.rarity = rarity;
    this.data.firstRevealedAt = Date.now();

    this.idleSwirlTween?.kill();
    this.idleBreatheTween?.kill();
    gsap.killTweensOf(this.fog);
    gsap.killTweensOf(this.swirl);
    gsap.killTweensOf(this.scale);

    const tl = gsap.timeline({
      onComplete: () => {
        this.data.state = HexState.REVEALED;
        this.hit.eventMode = 'none';
        // Fully hide fog graphics so hit-testing & draw calls stop for them
        this.fog.visible = false;
        this.swirl.visible = false;
        onComplete?.();
      },
    });

    // Phase 1 · click punch
    tl.to(this.scale, { x: 0.92, y: 0.92, duration: 0.08, ease: 'power2.in' });

    // Phase 2 · fog peels: fade + spiral swirl out
    tl.to(this.fog, { alpha: 0, duration: 0.47, ease: 'power2.out' }, '>');
    tl.to(
      this.swirl,
      { alpha: 0, rotation: '+=0.8', duration: 0.47, ease: 'power2.out' },
      '<'
    );
    tl.to(
      this.swirl.scale,
      { x: 1.45, y: 1.45, duration: 0.47, ease: 'power2.out' },
      '<'
    );

    // Phase 3 · scale pop
    tl.to(
      this.scale,
      { x: 1.12, y: 1.12, duration: 0.22, ease: 'back.out(3)' },
      '<+=0.1'
    );

    // Phase 4 · elastic settle + glow bloom
    tl.to(this.scale, {
      x: 1,
      y: 1,
      duration: 0.4,
      ease: 'elastic.out(1, 0.55)',
      onStart: () => this.drawRarityGlow(rarity),
    });

    if (
      rarity === Rarity.Epic ||
      rarity === Rarity.Legendary ||
      rarity === Rarity.Rainbow ||
      rarity === Rarity.Diamond
    ) {
      this.spawnBurst(rarity);
    }
  }

  /** Kill every GSAP tween that targets this sprite or its children. */
  killAllTweens(): void {
    this.idleSwirlTween?.kill();
    this.idleBreatheTween?.kill();
    gsap.killTweensOf(this.fog);
    gsap.killTweensOf(this.swirl);
    gsap.killTweensOf(this.swirl.scale);
    gsap.killTweensOf(this.scale);
    if (this.glow) gsap.killTweensOf(this.glow);
    // Kill tweens of any still-alive children (e.g. burst particles)
    for (const child of this.children) {
      gsap.killTweensOf(child);
      if ('scale' in child && child.scale) gsap.killTweensOf(child.scale);
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.killAllTweens();
    super.destroy(options);
  }

  private spawnBurst(rarity: Rarity): void {
    const color = RARITY_COLOR[rarity];
    const count =
      rarity === Rarity.Rainbow || rarity === Rarity.Diamond ? 42 : 26;
    for (let i = 0; i < count; i++) {
      const p = new Graphics();
      p.circle(0, 0, 2.5 + Math.random() * 3.2);
      p.fill({ color, alpha: 0.95 });
      this.addChild(p);
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const dist = HEX_RADIUS * (0.9 + Math.random() * 1.1);
      gsap.to(p, {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        alpha: 0,
        duration: 0.9 + Math.random() * 0.35,
        ease: 'power2.out',
        onComplete: () => p.destroy(),
      });
    }
  }
}

/** Mount a full hex grid into a parent container. */
export function mountHexGrid(
  parent: Container,
  cells: Map<string, HexCellData>
): Map<string, HexCellSprite> {
  const sprites = new Map<string, HexCellSprite>();
  for (const [id, cell] of cells) {
    const sprite = new HexCellSprite(cell);
    sprite.position.set(cell.cx, cell.cy);
    parent.addChild(sprite);
    sprites.set(id, sprite);
  }
  return sprites;
}

/* -------------------------------------------------------------- *
 * Compatibility shim — kept so existing callers don't break.
 * The new architecture reveals the FULL painted map underneath,
 * so no per-tile texture preloading is needed anymore.
 * -------------------------------------------------------------- */
export async function preloadHexTextures(): Promise<void> {
  // no-op; painted terrain lives in the background map image
  return;
}
