---
name: pixel-art-draw
description: >-
  Draws and pipelines Stardew-like pixel art for Lumewisp Vale (chars, tiles,
  buildings, props, VFX). Use when the user asks to 绘制/重画/像素动画/贴图/
  sprite sheet/走路帧, or to make world/character art for this Cocos project.
---

# Lumewisp Vale — Pixel Art Draw

Cocos Creator 3.8 竖屏牧场像素资产生成 skill。先读本文件，再按类型走流水线。

## 启动必读

```
- [ ] docs/art-bible.md
- [ ] docs/ui-design-tokens.md（tileSize=64，世界色板）
- [ ] 既有目录 assets/textures/** 与 .meta UUID（覆盖 PNG，勿丢 meta）
- [ ] tools/ui/ 下已有脚本（扩展脚本，禁止手搓一批风格不一的 PNG）
```

品类锁定：**Stardew-like 俯视 3/4 像素**。禁止消消乐/霓虹 UI 风。

## 能力分流

| 类型 | 推荐做法 | 输出 |
|------|----------|------|
| **角色四向动画** | GenerateImage 出 4×4 sheet → `slice_farmer_sheet.py` 锐化切片；或 `draw_*_pixels.py` 纯像素绘制 | `assets/textures/chars/**` 每帧独立 PNG |
| **单体道具/建筑/自然物** | GenerateImage 单件 → **门户 RMBG 抠图**（勿灰底色键）→ nearest 缩到规格 | `assets/textures/{buildings,nature,props,special,terrain}/**` |
| **地形 tile** | 优先脚本/色板绘制；需细节再用 AI 后量化 | 64×64（或 128@2x） |
| **UI chrome** | 不走本 skill；改用 `cocos-2d-art-ui` | — |

详细尺寸、meta、色板见 [reference.md](reference.md)。示例见 [examples.md](examples.md)。

## 标准流水线（每次都走）

```
Task Progress:
- [ ] 1. 定规格：逻辑尺寸、锚点、色板、命名
- [ ] 2. 出稿：AI sheet/单图 或 PIL 像素脚本
- [ ] 3. 入库处理：透明底、nearest、脚底/中心对齐、有限色
- [ ] 4. 写 PNG（覆盖同名，保留 .meta UUID）
- [ ] 5. 补/改 .meta：nearest + 稳定 trim/pivot
- [ ] 6. 登记 catalog / frames JSON / TS 引用
- [ ] 7. Read PNG 目视 + 预览验收
```

### 1) 定规格

- 角色展示框默认 **48×64**，脚底锚点 `(0.5, 0)`
- Tile **64×64**，中心锚点
- 建筑/大树按现有资产 bbox，脚底锚点
- 命名：`farmer-{dir}-{i}`、`tile-*`、`bld-*`、`nat-*`、`prop-*`、`spc-*`

### 2) 出稿

**角色动画（优先）**

1. `GenerateImage`：明确「4 行×4 列、等大格子、四向走路、透明或纯灰底、无抗锯齿、脚底基线一致」
2. 原图归档：`tools/ui/ai-source/<name>-ref.png`
3. 切片锐化：

```bash
# 优先 Homebrew Python + Pillow；系统 python3 亦可
/usr/local/bin/python3 tools/ui/slice_farmer_sheet.py
# 或扩展同结构脚本 slice_<subject>_sheet.py
```

**纯像素脚本（可控、可复现）**

```bash
/usr/local/bin/python3 tools/ui/draw_farmer_pixels.py
```

新角色/动物：复制 `draw_farmer_pixels.py` → `draw_<name>_pixels.py`，共用「16×32  freestyle → NEAREST×2 → pad 到展示框」。

**单件世界物**

1. GenerateImage（俯视 3/4、有限色、深描边）
2. **抠图走 CreativeCenter 门户** `http://10.1.4.130:8080`（`rmbg-v2` / RMBG-2.0）。建筑批量：`python tools/ui/portal_rmbg_buildings.py`。禁止灰底色键（会啃屋顶、留草地脏边）。
3. `Image.NEAREST` 缩到目标逻辑尺寸，落盘到对应 `assets/textures/**`

### 3) 入库硬规则

- **透明底**，禁止黑底当透明
- **Nearest** 缩放；禁止把糊边 AI 大图直接当最终帧
- **同动画序列脚底 Y 对齐**；水平居中；禁止 auto-trim 导致跳动
- **覆盖 PNG，保留 `.meta` UUID**（`FarmerFrames.ts` / 场景引用依赖 UUID）
- AI 原图只进 `tools/ui/ai-source/`，不进正式 atlas 源

### 4) Cocos `.meta` 约定

角色帧（稳定不抖）：

- texture：`minfilter/magfilter = nearest`，`mipfilter = none`
- spriteFrame：`trimType = custom`，`trimX/Y=0`，`width/height=逻辑尺寸`，`pivotX=0.5`，`pivotY=0`（脚底）
- Sprite 运行时：`sizeMode=CUSTOM`，`trim=false`

Tile：pivot `(0.5, 0.5)`；建筑/树：脚底 `(0.5, 0)`。

### 5) 代码接线

- 帧 UUID 表：`tools/ui/farmer-frames.json` → `assets/scripts/game/FarmerFrames.ts`
- 新可动画对象：同样 JSON + TS catalog，Animator 只换帧不改逻辑尺寸
- 世界物：prefab / Main.scene SpriteFrame 引用；改图不改节点名

## Agent 行为准则

1. **先读 Art Bible / tokens**，再画。
2. **先扩 `tools/ui` 脚本**，再批量出图；一过性 python `- <<` 只用于探索，稳定流程要落脚本。
3. **Read 生成的 PNG** 做目视（对齐、跨帧一致性、脏边）。
4. 中文简短汇报：改了哪些路径、怎么重生、预览注意点。
5. 与 `cocos-2d-art-ui` 分工：本 skill = 世界/角色像素；UI 面板按钮走那边。

## 常用路径

| 用途 | 路径 |
|------|------|
| 角色帧 | `assets/textures/chars/farmer/` |
| 世界贴图 | `assets/textures/{terrain,buildings,nature,props,special}/` |
| AI 归档 | `tools/ui/ai-source/` |
| 切片脚本 | `tools/ui/slice_farmer_sheet.py` |
| 像素绘制 | `tools/ui/draw_farmer_pixels.py` |
| 帧 UUID | `tools/ui/farmer-frames.json` |
| 风格 | `docs/art-bible.md` |
