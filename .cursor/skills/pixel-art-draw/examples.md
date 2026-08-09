# Pixel Art Draw — Examples

## 例：重画主角走路

用户：`主角像素动画不对，重新绘制`

1. 读 Art Bible + 现有 `assets/textures/chars/farmer/`
2. GenerateImage 出 4×4 sheet → 存 `tools/ui/ai-source/farmer-walk-ai-ref.png`
3. 跑 `python3 tools/ui/slice_farmer_sheet.py`
4. `python3 tools/ui/patch_sprite_meta.py assets/textures/chars/farmer --w 48 --h 64 --pivot-y 0`
5. Read contact sheet / 单帧目视
6. 预览：四向走路不糊、不左右跳、脚底稳定

## 例：新动物（鸡）四向

用户：`画一只小鸡四向走`

1. 复制 `draw_farmer_pixels.py` → `draw_chicken_pixels.py`（或 AI sheet + 新 `slice_chicken_sheet.py`）
2. 输出 `assets/textures/chars/chicken/chicken-{dir}-{i}.png`（先建目录与 .meta）
3. 新 `chicken-frames.json` + `ChickenFrames.ts`
4. Animator 复用同一套换帧逻辑

## 例：新建筑（磨坊）

用户：`画一个磨坊建筑`

1. 规格：约 256×288，脚底锚点，夜窗光可用 `windowGlow`
2. GenerateImage 单件俯视 3/4 → `tools/ui/ai-source/mill-ref.png`
3. 抠底 + NEAREST 缩放到目标 → `assets/textures/buildings/mill.png`
4. 补 .meta（nearest，pivotY=0）；catalog 登记；场景/prefab 引用

## 例：新 tile（花田）

用户：`加一种花田地板`

1. 64×64，色板贴 grass/dirt
2. 脚本绘制或 AI 后量化
3. `assets/textures/terrain/tile-flowers.png` + nearest meta
4. 世界铺装脚本/场景使用新 UUID
