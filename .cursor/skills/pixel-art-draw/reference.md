# Pixel Art Draw — Reference

## 逻辑尺寸

| 资产 | 画布 | 缩放建议 | 锚点 |
|------|------|----------|------|
| 角色帧 | 48×64 | 16×32  freestyle → NEAREST×2 → pad | `(0.5, 0)` 脚底 |
| 地形 tile | 64×64 | 原生 64 或 128→NEAREST÷2 | `(0.5, 0.5)` |
| 小屋/商店 | 既有 contentSize | 保持脚底对齐 | `(0.5, 0)` |
| 树/灌木 | 既有 | 冠幅可变，干脚对齐 | `(0.5, 0)` |
| 陨石等特殊 | 既有 | 可略大，勿破风格 | `(0.5, 0)` |
| Quest 标记 | 48×48 | 简单图标 | `(0.5, 0.5)` |

设计分辨率：1080×1920。`1 世界单位 = 1 逻辑 px`。

## 世界色板（摘自 tokens）

| Token | Hex |
|-------|-----|
| grass | `#3A7A3A` |
| grassDark | `#2A5A2A` |
| dirt | `#D29E2A` |
| stone | `#6A6E76` |
| water | `#2A5A9A` |
| lampGlow | `#F0D080` |
| windowGlow | `#F8E090` |

角色常用：发 `#7A482A`、肤 `#F1C29C`、衣 `#4A944E`、裤 `#5C3E2A`、描边 `#1C1612`。

## GenerateImage 提示要点

必写：

- Stardew Valley–like pixel art
- limited palette, 1px dark outline, no anti-aliasing
- equal grid cells (角色 sheet：4 rows × 4 cols)
- row order: down, left, right, up
- consistent foot baseline / scale across cells
- flat mid-gray or transparent background, no UI/text

禁写：写实、3D、赛博霓虹、整页 UI。

## 切片与锐化

灰底判定（常见 AI 灰）：`|R-G|<18 && |G-B|<18 && 110≤R≤160` → 透明。

推荐：

1. 按空隙或等分切 4×4
2. `getbbox` 取内容
3. `BOX` 收到作者分辨率（角色约 16×32）
4. 量化色阶（如 `/16*16+8`）+ alpha 阈值
5. `NEAREST` 放大到展示尺寸并 pad（脚底贴底、水平居中）

## `.meta` 模板字段

**Texture subMeta**

```json
"minfilter": "nearest",
"magfilter": "nearest",
"mipfilter": "none"
```

**SpriteFrame subMeta（角色帧）**

```json
"trimType": "custom",
"trimX": 0,
"trimY": 0,
"width": 48,
"height": 64,
"rawWidth": 48,
"rawHeight": 64,
"offsetX": 0,
"offsetY": 0,
"pivotX": 0.5,
"pivotY": 0.0
```

改完 PNG 后若编辑器重写了 vertices，以 pivot/trim 为准；必要时删 `vertices` 让 Creator 重导。

## 目录约定

```
assets/textures/
  chars/farmer/farmer-{down|left|right|up}-{0..3}.png
  terrain/   tile-*
  buildings/ cottage_* shop community …
  nature/    tree_* bush_*
  props/     fountain lamp bench …
  special/   meteor …
  ui/        quest-marker …
  reference/ 仅参考，不当运行时贴图源

tools/ui/
  ai-source/           AI 原图与 contact sheet
  slice_farmer_sheet.py
  draw_farmer_pixels.py
  farmer-frames.json
  catalog.json
  patch_sprite_meta.py  # 批量 nearest + pivot
```

## Python

优先 `/usr/local/bin/python3`（Pillow）或 venv。避免对 externally-managed Homebrew Python 全局 `pip install`。
