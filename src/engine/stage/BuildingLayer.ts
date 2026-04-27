/**
 * 🏠 BuildingLayer — 纸片建筑容器
 *
 *   每个 Building：
 *     · shadow   底部拉长的水彩投影 (pre-baked PNG/WebP)
 *     · sprite   45° 斜视的纸片建筑本体 (pre-baked PNG/WebP，透明底)
 *     · (可选) label  门牌/招牌 HTML 叠加层（由 React 投影）
 *
 *   为什么建筑独立成一层、不和 Actor 共用？
 *     · 建筑是 STATIC 的（静止 + 微呼吸），不会像角色那样"走动/说话"
 *     · 建筑需要按 feet-y 做 Y 排序（离观众近的挡远的），但和 Actor 共用一
 *       层会让 Actor 排序算法变复杂；拆成两层后，两者可以各自简单 zIndex
 *       排序
 *     · 建筑的"呼吸"幅度远小于角色（~±1px），单独的 tick 逻辑更干净
 *
 *   API:
 *     addBuilding({ id, x, y, textureUrl, shadowUrl?, height? })
 *     removeBuilding(id)
 *     getBounds(id) — 用于热点对齐
 */
import { Container, Sprite, Texture, Assets } from 'pixi.js';
import { LayerModule } from './PaperStage';

export interface BuildingOptions {
  id: string;
  /** Ground-anchor point in map coords. This is where the building's
   *  "foot" (bottom-centre) will sit. */
  x: number;
  y: number;
  /** Main sprite texture URL (transparent PNG/WebP). */
  textureUrl: string;
  /** Optional shadow texture URL (usually shorter, squashed silhouette). */
  shadowUrl?: string;
  /** Display height in map-space px. Width auto-derived from texture aspect. */
  height?: number;
  /** Optional shadow opacity multiplier (defaults 1.0). */
  shadowOpacity?: number;
}

interface BuildingItem {
  id: string;
  opts: BuildingOptions;
  container: Container;
  sprite: Sprite;
  shadow?: Sprite;
  /** Cached breath phase offset. */
  phase: number;
}

export class BuildingLayer implements LayerModule {
  public container: Container;
  private buildings = new Map<string, BuildingItem>();
  private t = 0;

  constructor() {
    this.container = new Container();
    this.container.label = 'buildings';
    // Sort buildings by feet-y so near buildings occlude far ones.
    this.container.sortableChildren = true;
  }

  /**
   * Add a building. Returns a promise that resolves once the sprite
   * texture is loaded — use it to gate things like "now that every
   * building is on screen, start spawning villagers".
   */
  async addBuilding(opts: BuildingOptions): Promise<void> {
    if (this.buildings.has(opts.id)) return;

    // 1) Root container, positioned at the feet-anchor.
    const root = new Container();
    root.label = `building_${opts.id}`;
    root.position.set(opts.x, opts.y);

    // Y-sort: near buildings (larger y) render on top of far ones.
    root.zIndex = opts.y;

    // 2) Shadow (optional, goes UNDER the sprite)
    let shadowSprite: Sprite | undefined;
    if (opts.shadowUrl) {
      try {
        const shTex = await Assets.load<Texture>(opts.shadowUrl);
        shadowSprite = new Sprite(shTex);
        shadowSprite.label = `${opts.id}_shadow`;
        // Anchor shadow at top-centre so its top edge aligns with the
        // building's foot line (0,0). Shadow typically looks like the
        // silhouette projected onto the ground to the right of the
        // building, matching the upper-left sun of our diorama style.
        shadowSprite.anchor.set(0.5, 0.05);
        shadowSprite.alpha = opts.shadowOpacity ?? 1;
        root.addChild(shadowSprite);
      } catch (e) {
        console.warn(`[BuildingLayer] shadow load failed for ${opts.id}:`, e);
      }
    }

    // 3) Main sprite
    const tex = await Assets.load<Texture>(opts.textureUrl);
    const sprite = new Sprite(tex);
    sprite.label = `${opts.id}_sprite`;
    // Anchor bottom-centre so the sprite "stands" on (0,0).
    sprite.anchor.set(0.5, 1.0);

    // Scale to desired height (default keeps texture native size).
    if (opts.height && tex.height > 0) {
      const s = opts.height / tex.height;
      sprite.scale.set(s);
      // Resize shadow proportionally so it keeps footprint alignment.
      if (shadowSprite) shadowSprite.scale.set(s);
    }

    root.addChild(sprite);
    this.container.addChild(root);

    this.buildings.set(opts.id, {
      id: opts.id,
      opts,
      container: root,
      sprite,
      shadow: shadowSprite,
      phase: Math.random() * Math.PI * 2,
    });
  }

  removeBuilding(id: string): void {
    const item = this.buildings.get(id);
    if (!item) return;
    try { item.container.destroy({ children: true }); } catch {}
    this.buildings.delete(id);
  }

  /** Bounds in map-space (x,y,w,h) of the sprite — useful for hotspot
   *  placement directly above the building. Returns null if not loaded. */
  getBounds(id: string): { x: number; y: number; w: number; h: number } | null {
    const item = this.buildings.get(id);
    if (!item || !item.sprite.texture) return null;
    const s = item.sprite.scale.x;
    const w = item.sprite.texture.width * s;
    const h = item.sprite.texture.height * s;
    // Sprite anchor is (0.5, 1.0) → top-left of sprite rect
    return {
      x: item.container.x - w / 2,
      y: item.container.y - h,
      w, h,
    };
  }

  onResize(_sw: number, _sh: number): void {
    // Buildings live in map space; nothing to reflow.
  }

  onTick(deltaMs: number): void {
    this.t += deltaMs / 1000;
    // Very subtle "breath" — ±0.6% scale, independent phase per building.
    // This is what keeps the diorama feeling alive when the player isn't
    // interacting. Periods deliberately long (~8s) so it reads as gentle.
    for (const item of this.buildings.values()) {
      const phase = this.t * 0.78 + item.phase;
      const s = 1 + Math.sin(phase) * 0.006;
      item.sprite.scale.y = (item.opts.height ? (item.opts.height / item.sprite.texture.height) : 1) * s;
      // Shadow breathes in the opposite direction (shadows grow when
      // light source is slightly farther), ±1% alpha
      if (item.shadow) {
        item.shadow.alpha = (item.opts.shadowOpacity ?? 1) * (1 - Math.sin(phase) * 0.04);
      }
    }
  }

  dispose(): void {
    for (const item of this.buildings.values()) {
      try { item.container.destroy({ children: true }); } catch {}
    }
    this.buildings.clear();
    try { this.container.destroy({ children: true }); } catch {}
  }
}
