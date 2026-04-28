# 🎭 SYNAPSE · 纸片剧场（Paper Theater）

> 一款让你哈哈大笑、潸然泪下、魂牵梦绕的 AI 原生情感剧场
> Sprint 0 · 风格锁 + 可运行 MVP 骨架

---

## 🛠️ 技术栈

| 层 | 技术 | 作用 |
|---|---|---|
| UI 框架 | React 18 + TypeScript + Vite 5 | 移动 Web 主框架 |
| 渲染引擎 | **PixiJS v8（WebGL）** | 纸片剧场核心舞台 |
| 状态管理 | Zustand + Immer | 离线优先、响应式 |
| 动画 | **GSAP 3** + Framer Motion | 时间轴 + UI 过渡 |
| 六边形算法 | honeycomb-grid v4 | 业界标准 |
| 手势 | @use-gesture/react | 多点触摸 |
| 样式 | TailwindCSS 3 | Parchment 设计系统 |

---

## 🎨 视觉风格锁（Style Lock · Sprint 0 产物）

位于 `assets/style-lock/`：

1. `07_hex_atlas.png` — 12 种地形的六边形地块总图
2. `08_rivershire_baseline.png` — 村庄北极星基准图
3.（另有 6 张在文档 chat 中可查）

**所有后续 GPT Image 2 产出都必须引用这批图作为 style reference，以锁定水彩纸片美学。**

---

## 🧩 核心引擎自研模块

```
src/engine/
├── PaperRenderer.ts   # 五层合成器（Shadow/Lighting/Main/Detail/FX）+ 呼吸 + 视差
├── PaperShader.ts     # RevealFilter（自研 GLSL 水彩揭示 shader）
├── HexMap.ts          # 六边形数据模型 + 稀有度/地形掷骰
└── HexSprites.ts      # HexCellSprite（带 1.2s 揭示时间轴动画）
```

---

## 🚀 跑起来

```bash
npm install
npm run dev        # http://0.0.0.0:5173
npm run build      # 产出到 dist/
npm run preview    # 预览生产构建
```

---

## 📂 目录结构

```
synapse/
├── assets/style-lock/        # GPT Image 2 风格锁基准图
├── src/
│   ├── engine/               # 自研剧场引擎
│   ├── scenes/               # 场景（HexWorldScene 等）
│   ├── ui/                   # Parchment UI 组件
│   ├── stores/               # Zustand 全局状态
│   ├── styles/               # 全局 CSS + Tailwind
│   ├── App.tsx
│   └── main.tsx
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## ✅ Sprint 0 交付清单

- [x] 风格锁 8 张基准图
- [x] Vite + React 18 + TS 脚手架
- [x] PixiJS v8 + HexMap POC
- [x] PaperRenderer 五层渲染器雏形
- [x] 翻格 1.2s 时间轴动画
- [x] Parchment UI（HUD + 侧栏 + 底栏）
- [x] 稀有度掷骰 + 资源消耗 + Toast 反馈
- [x] 移动端 viewport + safe-area-inset 适配

## 🎯 Sprint 1 计划（下一步）

- [ ] 接入真实 GPT Image 2 地块切图（替换 procedural 纯色）
- [ ] PaperShader 水彩揭示滤镜接入 HexCellSprite
- [ ] 第一个村民（Elara）PaperAsset 五层资产
- [ ] 手势：双指缩放 + 拖拽地图
- [ ] PWA manifest + Service Worker 离线缓存
