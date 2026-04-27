/**
 * 📜 FogVeil + TearMask — 交互纸片雾膜（Canvas2D 版）
 *
 * 设计思路：
 *   Pixi v8 的 mask / blendMode:'erase' 有多个 corner-case 让"在 WebGL
 *   里直接把雾膜撕开一个洞"变得很脆弱（Container 做 inverse mask 失效、
 *   多次 fill 只保留最后一个 sub-path…）。
 *   为了稳定出效果，我们改用一个 **离屏 Canvas2D** 维护雾膜：
 *     · 每次 tears 变化时，重绘整张 veil canvas：先画纸纹，再用
 *       `globalCompositeOperation = 'destination-out'` 把每个 blob
 *       从 veil 上"擦掉"（得到真正的透明洞）。
 *     · 然后把 canvas 转成一个 Pixi Texture 并 swap 到 veil Sprite。
 *   优点：
 *     · 完全绕开 Pixi mask 的坑
 *     · Canvas2D destination-out 天生就是"擦除"语义，100% 稳定
 *     · 重绘成本对 11 个 blob + 1328×1760 canvas 可接受（每秒 <60 次），
 *       且我们只在 tears 变化时重绘
 *   缺点：
 *     · 撕开有一点点"纹理更新"延迟（单帧级，几乎不可见）
 *     · 失去 GPU 加速的纹理缓存优化 —— 对我们这个规模无所谓
 *
 * 此外 edgeFx（水彩湿润描边）仍用 Pixi Graphics（它在底图和 veil 之间
 * 画一圈 ring，不需要撕效果，用 Graphics 最方便）。
 */
import {
  Container,
  Sprite,
  Texture,
  Graphics,
  CanvasSource,
} from 'pixi.js';
import { gsap } from 'gsap';
import { LayerModule } from './PaperStage';

export interface TearOptions {
  /** Image-space centre of the tear. */
  x: number;
  y: number;
  /** Target radius in image-space px. */
  radius: number;
  /** Tint of the tear's wet-ink edge (hex int). */
  moodColor?: number;
  /** Optional callback after the tear animation completes. */
  onDone?: () => void;
}

interface ActiveTear {
  x: number;
  y: number;
  r: number;        // current animated radius
  targetR: number;
  edgeWobble: number;
  seed: number;
  moodColor: number;
  state: 'growing' | 'settled';
}

export class FogVeil implements LayerModule {
  public container: Container;
  /** The veil sprite — its texture is re-generated from offscreen canvas. */
  private veil: Sprite;
  /** The underlying Canvas2D that holds the veil pixels (re-drawn every dirty frame). */
  private veilCanvas: HTMLCanvasElement;
  private veilCtx: CanvasRenderingContext2D;
  /** Base "paper fog" canvas — drawn once, used as the clean starting point
   *  each time we re-bake the veilCanvas with tears erased. */
  private basePaperCanvas: HTMLCanvasElement;

  /** Decorative wet-ink ring around each tear (drawn UNDER the veil). */
  public edgeFx: Graphics;

  private mapW: number;
  private mapH: number;
  /** Offscreen canvas resolution — we work at half-res and let Pixi
   *  Sprite scale up for "soft paper" feel and big render savings. */
  private cW: number;
  private cH: number;

  private tears: ActiveTear[] = [];
  private t = 0;
  private dirty = true;
  private lastBakedAt = -1;

  constructor(mapW: number, mapH: number) {
    this.mapW = mapW;
    this.mapH = mapH;
    this.cW = Math.max(256, Math.round(mapW / 2));
    this.cH = Math.max(256, Math.round(mapH / 2));

    this.container = new Container();
    this.container.label = 'fog-veil';

    // 1) Build the "clean paper fog" canvas — used as starting state.
    this.basePaperCanvas = buildPaperVeilCanvas(this.cW, this.cH);

    // 2) The live veil canvas: copy of base, to be re-stamped with tears.
    this.veilCanvas = document.createElement('canvas');
    this.veilCanvas.width = this.cW;
    this.veilCanvas.height = this.cH;
    const ctx = this.veilCanvas.getContext('2d');
    if (!ctx) throw new Error('[FogVeil] failed to get 2D context');
    this.veilCtx = ctx;
    // Start with a clean paper (no tears yet).
    this.veilCtx.drawImage(this.basePaperCanvas, 0, 0);

    // 3) Sprite using the canvas as texture. We use CanvasSource explicitly
    //    with transparent:true so the alpha channel of our canvas (with tears
    //    erased via destination-out) survives the WebGL upload.
    //    CRITICAL: alphaMode must be 'premultiplied-alpha' (NOT the default
    //    'premultiply-alpha-on-upload'). Canvas2D already stores pixels
    //    premultiplied — if we tell Pixi to premultiply again on upload it
    //    will zero-out the RGB of transparent pixels AND corrupt alpha,
    //    which makes the tear holes vanish on GPU even though getImageData
    //    on the CPU-side canvas still shows them.
    const src = new CanvasSource({
      resource: this.veilCanvas,
      transparent: true,
      alphaMode: 'premultiplied-alpha',
    });
    const tex = new Texture({ source: src });
    this.veil = new Sprite(tex);
    this.veil.width = mapW;
    this.veil.height = mapH;
    this.veil.label = 'fog-veil-sprite';

    // 4) Edge FX Graphics (decorative "wet ink" rings around tears).
    this.edgeFx = new Graphics();
    this.edgeFx.label = 'tear-edge-fx';

    // Scene tree: edgeFx UNDER veil (so ring shows through the tear hole),
    // then the veil on top.
    this.container.addChild(this.edgeFx);
    this.container.addChild(this.veil);
  }

  /** Open a new tear — animates from r=0 → targetR. */
  openTear(opts: TearOptions): void {
    const tear: ActiveTear = {
      x: opts.x,
      y: opts.y,
      r: 0,
      targetR: opts.radius,
      edgeWobble: 12,
      seed: opts.x * 13.7 + opts.y * 7.3,
      moodColor: opts.moodColor ?? 0xf6c048,
      state: 'growing',
    };
    this.tears.push(tear);
    this.dirty = true;

    gsap.to(tear, {
      r: opts.radius,
      duration: 0.85,
      ease: 'power3.out',
      onUpdate: () => { this.dirty = true; },
      onComplete: () => {
        tear.state = 'settled';
        gsap.to(tear, {
          edgeWobble: 4,
          duration: 0.9,
          ease: 'sine.out',
          onUpdate: () => { this.dirty = true; },
        });
        opts.onDone?.();
      },
    });
  }

  /** Force instantly-open a tear (e.g. debug ?reveal=all). */
  forceOpen(opts: TearOptions): void {
    this.tears.push({
      x: opts.x,
      y: opts.y,
      r: opts.radius,
      targetR: opts.radius,
      edgeWobble: 4,
      seed: opts.x * 13.7 + opts.y * 7.3,
      moodColor: opts.moodColor ?? 0xf6c048,
      state: 'settled',
    });
    this.dirty = true;
    this.bakeVeilCanvas();
    this.redrawEdgeFx();
  }

  onResize(_sw: number, _sh: number): void {
    // Veil is image-space sized — nothing to do.
  }

  onTick(deltaMs: number): void {
    const prev = this.t;
    this.t += deltaMs / 1000;
    const anyAnimating = this.tears.some(t => t.state === 'growing') || this.dirty;
    if (anyAnimating) {
      this.bakeVeilCanvas();
      this.redrawEdgeFx();
      this.dirty = false;
    } else if (this.tears.length > 0) {
      // Idle wobble — re-bake every ~120ms so edges feel alive.
      const prevBucket = Math.floor(prev * 1000 / 120);
      const nowBucket = Math.floor(this.t * 1000 / 120);
      if (nowBucket !== prevBucket) {
        this.bakeVeilCanvas();
        this.redrawEdgeFx();
      }
    }
  }

  /** Re-draw the veil canvas: start from clean paper, then erase each tear. */
  private bakeVeilCanvas(): void {
    const ctx = this.veilCtx;
    const sx = this.cW / this.mapW;
    const sy = this.cH / this.mapH;

    // 1) Reset to clean paper.
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.cW, this.cH);
    ctx.drawImage(this.basePaperCanvas, 0, 0);

    // 2) For each tear, punch a hole using destination-out.
    ctx.globalCompositeOperation = 'destination-out';
    for (const tr of this.tears) {
      if (tr.r <= 0) continue;
      ctx.beginPath();
      drawOrganicBlobTo2D(
        ctx,
        tr.x * sx,
        tr.y * sy,
        tr.r * sx,             // we're in square map, sx≈sy; using sx is fine
        tr.seed,
        tr.edgeWobble * sx,
        this.t,
      );
      ctx.closePath();
      ctx.fillStyle = '#000';   // colour doesn't matter for destination-out
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // 3) Tell Pixi to re-upload the canvas to GPU.
    //
    //    With alphaMode:'premultiplied-alpha' set at CanvasSource creation
    //    time, a plain `update()` is enough — it emits the 'update' event
    //    that TextureSource listens to and schedules a re-upload that
    //    preserves our erased alpha.
    //
    //    (We used to also call unload(); that actually caused a flicker
    //    frame where the texture was briefly empty, and on some runs the
    //    next re-upload happened BEFORE our canvas mutation was flushed,
    //    which is part of why tears looked "missing" on GPU.)
    const src: any = this.veil.texture.source;
    src.update();
    this.lastBakedAt = this.t;
  }

  /** Draw watercolor "wet" ink rings around each tear into the edgeFx Graphics. */
  private redrawEdgeFx(): void {
    const g = this.edgeFx;
    g.clear();
    for (const tr of this.tears) {
      if (tr.r < 5) continue;
      const rings = 3;
      for (let j = 0; j < rings; j++) {
        const rr = tr.r * (1 + 0.04 + j * 0.03);
        const alpha = 0.24 - j * 0.06;
        drawOrganicBlobToGfx(g, tr.x, tr.y, rr, tr.seed + 1, tr.edgeWobble * 1.3, this.t);
        g.stroke({ color: tr.moodColor, width: 2.5 - j * 0.6, alpha });
      }
    }
  }

  dispose(): void {
    for (const tr of this.tears) gsap.killTweensOf(tr);
    this.tears = [];
    try { this.container.destroy({ children: true }); } catch {}
  }
}

// ---------- helpers ----------

/** Canvas 2D: trace an organic blob as a closed path (caller handles fill/stroke). */
function drawOrganicBlobTo2D(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  seed: number,
  wobble: number,
  time: number,
): void {
  const steps = 36;
  let fx = 0, fy = 0;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const n1 = Math.sin(a * 3 + seed * 0.7 + time * 0.6) * 0.5;
    const n2 = Math.sin(a * 7.3 + seed * 1.3 + time * 0.9) * 0.3;
    const n3 = Math.sin(a * 11.1 + seed * 2.1) * 0.2;
    const radial = r + (n1 + n2 + n3) * wobble;
    const x = cx + Math.cos(a) * radial;
    const y = cy + Math.sin(a) * radial;
    if (i === 0) { fx = x; fy = y; ctx.moveTo(x, y); }
    else { ctx.lineTo(x, y); }
  }
  ctx.lineTo(fx, fy);
}

/** Pixi Graphics: same blob shape, but into a Pixi Graphics path. */
function drawOrganicBlobToGfx(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  seed: number,
  wobble: number,
  time: number,
): void {
  const steps = 36;
  let fx = 0, fy = 0;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const n1 = Math.sin(a * 3 + seed * 0.7 + time * 0.6) * 0.5;
    const n2 = Math.sin(a * 7.3 + seed * 1.3 + time * 0.9) * 0.3;
    const n3 = Math.sin(a * 11.1 + seed * 2.1) * 0.2;
    const radial = r + (n1 + n2 + n3) * wobble;
    const x = cx + Math.cos(a) * radial;
    const y = cy + Math.sin(a) * radial;
    if (i === 0) { fx = x; fy = y; g.moveTo(x, y); }
    else { g.lineTo(x, y); }
  }
  g.lineTo(fx, fy);
  g.closePath();
}

/**
 * Build a "paper fog" canvas of the given size.
 * Exactly the same texture as the previous implementation, but exposed as a
 * canvas so we can repeatedly `drawImage(base, 0, 0)` to reset state.
 */
function buildPaperVeilCanvas(W: number, H: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // 1. Cream base
  const baseGrad = ctx.createLinearGradient(0, 0, 0, H);
  baseGrad.addColorStop(0.0, '#d9c08c');
  baseGrad.addColorStop(0.55, '#c9a875');
  baseGrad.addColorStop(1.0, '#a88656');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Ink stains
  for (let i = 0; i < 14; i++) {
    const cx = (Math.sin(i * 2.3) * 0.5 + 0.5) * W;
    const cy = (Math.cos(i * 1.7 + 1.1) * 0.5 + 0.5) * H;
    const r = W * (0.08 + (i % 5) * 0.04);
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const darkness = 0.10 + (i % 3) * 0.04;
    grd.addColorStop(0, `rgba(80, 50, 30, ${darkness})`);
    grd.addColorStop(0.7, `rgba(100, 70, 40, ${darkness * 0.3})`);
    grd.addColorStop(1, 'rgba(120, 80, 50, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Fiber noise — tweak individual pixels for grain
  const img = ctx.getImageData(0, 0, W, H);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % W;
    const y = Math.floor(i / 4 / W);
    const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    const jitter = (n - 0.5) * 22;
    data[i]     = Math.max(0, Math.min(255, data[i]     + jitter));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + jitter * 0.8));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + jitter * 0.6));
  }
  ctx.putImageData(img, 0, 0);

  // 4. Long fibers (strokes)
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#7a5a3a';
  ctx.lineWidth = 1;
  for (let i = 0; i < 180; i++) {
    const x = (Math.sin(i * 7.3) * 0.5 + 0.5) * W;
    const y = (Math.cos(i * 2.1 + 0.7) * 0.5 + 0.5) * H;
    const len = 30 + ((i * 13) % 60);
    const angle = Math.sin(i * 1.7) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  return canvas;
}
