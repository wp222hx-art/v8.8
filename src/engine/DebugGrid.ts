/**
 * 🔴 DebugGrid — 开发期校准辅助层
 *
 * 用途：在 Rivershire 画卷之上画一层半透明红色网格 + 每格 "col,row" 标签，
 *       肉眼判断六边形是否对齐底图建筑（铁匠铺、风车、村政厅等）。
 *
 * 开关：URL 参数 ?grid=1 时启用。默认关闭，不影响生产。
 *
 * 所有绘制都在 world-local (image-pixel) 坐标系下，和 HexCellSprite 同一坐标系，
 * 因此 world 缩放时网格会跟随。
 */
import { Container, Graphics, Text } from 'pixi.js';
import {
  HexCellData,
  HEX_RADIUS,
  MAP_IMAGE_W,
  MAP_IMAGE_H,
} from './HexMap';

/** Check the URL for ?grid=1 */
export function isDebugGridEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const p = new URLSearchParams(window.location.search);
    const v = p.get('grid');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/** Draw a pointy-top hex outline at (0,0) with the given radius. */
function strokeHexPath(g: Graphics, r: number): void {
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    const x = r * Math.cos(a);
    const y = r * Math.sin(a);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

/**
 * Build the debug grid overlay.
 * Returns a Container that should be added to `world` AFTER the map sprite
 * (so it renders on top of the art) but typically BELOW the fog hexes so the
 * fog still looks correct. In practice, adding it on top of fog is OK while
 * calibrating — click-through is disabled because it is not interactive.
 */
export function buildDebugGrid(cells: Map<string, HexCellData>): Container {
  const layer = new Container();
  layer.label = 'debug-grid';
  layer.eventMode = 'none'; // never intercept clicks

  // Image frame — lets us see if hexes overflow the art bounds
  const frame = new Graphics();
  frame.rect(0, 0, MAP_IMAGE_W, MAP_IMAGE_H);
  frame.stroke({ color: 0xff2255, width: 4, alpha: 0.8 });
  layer.addChild(frame);

  // Draw every hex outline + col,row label at its center
  for (const cell of cells.values()) {
    const hex = new Graphics();
    hex.position.set(cell.cx, cell.cy);
    strokeHexPath(hex, HEX_RADIUS - 1);
    hex.stroke({ color: 0xff3355, width: 2.2, alpha: 0.85 });
    // Inner small hex to emphasize center
    strokeHexPath(hex, HEX_RADIUS * 0.15);
    hex.stroke({ color: 0xffe85a, width: 1.5, alpha: 0.9 });
    layer.addChild(hex);

    // Label
    const label = new Text({
      text: `${cell.col},${cell.row}`,
      style: {
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: 26,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 4, alpha: 0.9 },
        fontWeight: '700',
      },
    });
    label.anchor.set(0.5);
    label.position.set(cell.cx, cell.cy);
    layer.addChild(label);
  }

  return layer;
}
