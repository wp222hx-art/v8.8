/**
 * 📍 Landmarks — Rivershire 地图上的可交互点位
 *
 * 每个 Landmark 是画卷上一个具体的建筑/地标，对应一个金色封蜡点（SealPoint）。
 * 坐标都在 **原图 1328×1760 像素坐标系** 下（左上为原点）。
 * 场景运行时会把 world 容器等比缩放到屏幕，seal/mask 会跟随。
 *
 * 每个 landmark 有：
 *   · center (cx, cy)     封蜡按钮的视觉中心点（就是建筑重心）
 *   · radius              唤醒后彩色"显色窗"的半径（图像空间像素）
 *   · reveal              玩家唤醒后弹出的文案
 *   · mood                唤醒瞬间的色调倾向（ember/aqua/sage/plum…影响水彩扩散颜色）
 *
 * 坐标来自 Rivershire 基准图的视觉分析 — 使用 `?seals=1` URL 参数打开调试标注，
 * 直接通过截图微调下面的数字。
 */

export type LandmarkMood =
  | 'ember'     // 温暖橘红（铁匠铺）
  | 'aqua'      // 清凉水蓝（河/桥/井/码头）
  | 'sage'      // 森林/田园绿
  | 'plum'      // 神秘紫（告示板/石像）
  | 'gold'      // 王权金（村政厅）
  | 'blossom';  // 粉色（菜园/市场）

export interface Landmark {
  id: string;
  nameEn: string;
  nameCn: string;
  cx: number;     // image-space pixel center X
  cy: number;     // image-space pixel center Y
  radius: number; // reveal window radius (image-space px)
  mood: LandmarkMood;
  reveal: {
    title: string;
    flavor: string;
  };
  /** Order in which we reveal if the player taps the "next hint" button. */
  hintOrder?: number;
}

/**
 * Rivershire 地标坐标表（1328 × 1760 基准图）。
 *
 * 校准流程：
 *   1. 开 ?seals=1 ⇒ 每个点会在屏幕上画一个带编号的红圈
 *   2. 对照底图，在本文件中调整 cx/cy/radius
 *   3. 重新加载
 *
 * 初始估值来自 D_production 截图的视觉观察（参考纸片剧场基准图）。
 */
export const RIVERSHIRE_LANDMARKS: Landmark[] = [
  {
    id: 'village-hall',
    nameEn: 'Village Hall',
    nameCn: '村政厅',
    cx: 600, cy: 500,
    radius: 170,
    mood: 'gold',
    hintOrder: 1,
    reveal: {
      title: '村政厅 · Rivershire Hall',
      flavor: '青灰石瓦与铜铃钟塔。Rivershire 的心跳从这里出发。',
    },
  },
  {
    id: 'windmill',
    nameEn: 'Windmill Farm',
    nameCn: '风车农场',
    cx: 195, cy: 490,
    radius: 140,
    mood: 'sage',
    hintOrder: 2,
    reveal: {
      title: '风车农场',
      flavor: '四片木叶在晨风中慢慢转动，麦香掺着机油味。',
    },
  },
  {
    id: 'market-stall',
    nameEn: 'Market Stall',
    nameCn: '集市摊位',
    cx: 170, cy: 820,
    radius: 130,
    mood: 'blossom',
    hintOrder: 3,
    reveal: {
      title: '集市摊位',
      flavor: '红白条纹的遮阳布下，是昨日剩余的面包与一封未寄的信。',
    },
  },
  {
    id: 'blacksmith',
    nameEn: 'Blacksmith Forge',
    nameCn: '铁匠铺',
    cx: 900, cy: 680,
    radius: 140,
    mood: 'ember',
    hintOrder: 4,
    reveal: {
      title: '铁匠铺',
      flavor: '炉火把半个小屋染成橘色，叮叮当当的敲击是村子的脉搏。',
    },
  },
  {
    id: 'thatched-cottage',
    nameEn: 'Thatched Cottage',
    nameCn: '茅草小屋',
    cx: 1120, cy: 680,
    radius: 125,
    mood: 'sage',
    reveal: {
      title: '茅草小屋',
      flavor: '窗纸被风吹得鼓起来又瘪下去，像谁在里面慢慢呼吸。',
    },
  },
  {
    id: 'well',
    nameEn: 'Old Well',
    nameCn: '古井',
    cx: 620, cy: 870,
    radius: 100,
    mood: 'aqua',
    reveal: {
      title: '古井',
      flavor: '桶绳磨得发亮，水面映着不完整的月。',
    },
  },
  {
    id: 'sheep-pen',
    nameEn: 'Sheep Pen',
    nameCn: '羊圈',
    cx: 1140, cy: 895,
    radius: 135,
    mood: 'sage',
    reveal: {
      title: '羊圈',
      flavor: '四只羊，三只在睡，第四只看着你。',
    },
  },
  {
    id: 'plaza-statue',
    nameEn: 'Plaza Statue',
    nameCn: '广场石像',
    cx: 350, cy: 1020,
    radius: 115,
    mood: 'plum',
    reveal: {
      title: '广场石像',
      flavor: '石像手里捧着一颗看不清的星，已经被风磨了一百年。',
    },
  },
  {
    id: 'veggie-garden',
    nameEn: 'Vegetable Garden',
    nameCn: '菜园',
    cx: 960, cy: 1100,
    radius: 125,
    mood: 'blossom',
    reveal: {
      title: '菜园',
      flavor: '南瓜比主人还圆，卷心菜排成一列正在检阅。',
    },
  },
  {
    id: 'notice-board',
    nameEn: 'Notice Board',
    nameCn: '告示板屋',
    cx: 570, cy: 1175,
    radius: 120,
    mood: 'plum',
    reveal: {
      title: '告示板屋',
      flavor: '三张皱巴巴的悬赏、两张寻人启事、一张写着"今日无事"。',
    },
  },
  {
    id: 'dock',
    nameEn: 'Dock',
    nameCn: '码头',
    cx: 150, cy: 1500,
    radius: 130,
    mood: 'aqua',
    reveal: {
      title: '码头',
      flavor: '一只小木船拴在短桩上，像被遗忘的句号。',
    },
  },
  {
    id: 'stone-bridge',
    nameEn: 'Stone Bridge',
    nameCn: '石桥',
    cx: 530, cy: 1530,
    radius: 145,
    mood: 'aqua',
    reveal: {
      title: '石桥',
      flavor: '三色彩旗在风里拍打桥栏，石缝里长出一小丛紫色野花。',
    },
  },
];

/**
 * Mood → 唤醒时的水彩晕染颜色（Pixi 颜色 0xRRGGBB）。
 * 用于封蜡爆裂时迸发的粒子 & 显色窗口边缘的光晕。
 */
export const MOOD_COLORS: Record<LandmarkMood, {
  primary: number;
  secondary: number;
  accent: number;
}> = {
  ember:   { primary: 0xff7a3c, secondary: 0xd84a1a, accent: 0xffd27a },
  aqua:    { primary: 0x5ec4ff, secondary: 0x2f7fa7, accent: 0xb8ecff },
  sage:    { primary: 0x8bc26a, secondary: 0x557a3b, accent: 0xdff5c4 },
  plum:    { primary: 0xa67bc4, secondary: 0x6a4290, accent: 0xe4cef5 },
  gold:    { primary: 0xf6c048, secondary: 0xb17620, accent: 0xffe59a },
  blossom: { primary: 0xf082b5, secondary: 0xb94779, accent: 0xffd0e4 },
};
