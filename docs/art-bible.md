# Lumewisp Vale — Art Bible

## 品类锁定

**牧场生活模拟（Stardew Valley–like）**：俯视 3/4 像素风小镇 / 农场 / 自然地块。  
禁止默认做成消消乐、肉鸽棋盘或糖果 UI。

## 参考

- 气质参考：`tools/reference/town-night-ref.png`（夜景小镇广场，编辑用不上包）
- 开局农场构图：`tools/reference/farm-start-ref.png`（小屋靠边 + 荒地杂物，有机散布）
- 只抽构图、分层与物件类型；**禁止扒帧当 chrome / 贴图源**
- 自有 IP：微光溪谷（Lumewisp Vale），晶簇陨石为世界观锚点
- AI 原图归档：`tools/ui/ai-source/`；入库贴图经抠底 + 像素缩放写入 `assets/textures/**`
- 像素绘制流水线（角色/tile/建筑）：`.cursor/skills/pixel-art-draw/SKILL.md`

## 视角与格子

| Token | 值 |
|-------|-----|
| 视角 | 俯视 3/4（top-down isometric-lite） |
| 设计分辨率 | 1080×1920 竖屏 |
| 基础 tile | 64×64 逻辑 px（贴图可 64 或 128 @2x） |
| 世界缩放 | 1 世界单位 = 1 逻辑 px |

分层（Main 场景已建）：

1. `Ground` — 草地 / 土路 / 石砖 / 水域
2. `Midground` — 建筑、栅栏、长椅、灯柱、喷泉
3. `Foreground` — 树冠、可遮挡玩家的前景

## 视觉关键词

- 像素清晰、有限色板、暖窗光 + 冷夜色
- 建筑：尖顶小屋、商店橱窗、社区钟楼
- 自然：圆冠阔叶树、紫粉花树、矮灌木
- 特殊：紫晶陨石（世界观符号，非日常道具）

## 禁区

- 荧光紫渐变 UI、霓虹描边、默认 Inter/系统感 UI
- 圆角胶囊按钮堆、卡片仪表盘式首屏
- 把参考截图整页切块当可复用贴图

## 命名

```
tile-*     地形格子
bld-*      建筑
nat-*      自然物
prop-*     道具/家具
spc-*      特殊（陨石等）
ui-*       界面 chrome
ic-*       图标
```
