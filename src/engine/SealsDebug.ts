/**
 * 🔴 SealsDebug — 封蜡点位校准辅助层
 *
 * 启用方式：URL 参数 ?seals=1
 *
 * 在每个 landmark 位置画：
 *   · 红色十字（精确中心）
 *   · 红色圆（显色窗半径）
 *   · id + cx,cy,r 文字标签
 *
 * 对照 Rivershire 底图，如果哪个点位置没对准建筑，就回 Landmarks.ts 改数字。
 */
import { Container, Graphics, Text } from 'pixi.js';
import { Landmark } from './Landmarks';

export function isSealsDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const p = new URLSearchParams(window.location.search);
    const v = p.get('seals');
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

export function buildSealsDebug(landmarks: Landmark[]): Container {
  const layer = new Container();
  layer.label = 'seals-debug';
  layer.eventMode = 'none';

  for (const lm of landmarks) {
    const g = new Graphics();
    g.position.set(lm.cx, lm.cy);
    // Red outer circle (radius)
    g.circle(0, 0, lm.radius).stroke({
      color: 0xff2255, width: 3, alpha: 0.8,
    });
    // Red inner dot
    g.circle(0, 0, 8).fill({ color: 0xff2255, alpha: 0.95 });
    g.circle(0, 0, 8).stroke({ color: 0xffffff, width: 1.5 });
    // Cross-hair
    g.moveTo(-18, 0).lineTo(18, 0).stroke({ color: 0xff2255, width: 2 });
    g.moveTo(0, -18).lineTo(0, 18).stroke({ color: 0xff2255, width: 2 });
    layer.addChild(g);

    const label = new Text({
      text: `${lm.id}\n${lm.cx},${lm.cy} · r=${lm.radius}`,
      style: {
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: 18,
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 4, alpha: 0.9 },
        align: 'center',
      },
    });
    label.anchor.set(0.5, 1);
    label.position.set(lm.cx, lm.cy - lm.radius - 8);
    layer.addChild(label);
  }
  return layer;
}
