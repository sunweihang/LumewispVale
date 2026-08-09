# Lumewisp Vale

《星露谷物语》like 牧场生活模拟 — Cocos Creator **3.8.8**，竖屏 **1080×1920**。

## 打开工程

当前若已有 Creator 打开其他工程（如 Tetris），请先在编辑器里 **文件 → 打开项目** 选本目录，或关掉后执行：

```bash
"/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator" \
  --project /Users/Custom/LumewispVale
```

打开后进 `assets/scenes/Main.scene`。预制体在 `assets/prefabs/world/`。

## 目录

| 路径 | 说明 |
|------|------|
| `assets/scenes/Main.scene` | 主场景（World + Canvas） |
| `assets/prefabs/world/` | 地形 / 建筑 / 自然 / 道具 / 特殊预制体 |
| `assets/textures/` | 对应像素贴图（nearest） |
| `docs/art-bible.md` | 美术规范 |
| `docs/ui-design-tokens.md` | 设计 tokens |
| `tools/ui/catalog.json` | 组件清单 |
| `tools/ui/generate_world_assets.py` | 贴图 + Prefab 生成 |

## 操作（当前可玩切片）

- **触控 / 鼠标**：拖拽移动；点按格子使用当前工具；杂草 / 成熟作物直接点；底部栏点选工具（桌面：1–3 选工具，空格对脚下使用）
- **核心循环**：锄头锄地 → 种子播种 → 水壶浇水 → 点击收获；野外杂草直接点击拔除
- **地图**：AI 像素农场（林缘 / 小屋院子 / 可耕空地 / 荒地点缀 / 河道）
- 资产生成：`tools/ui/process_farm_ai_v2.py`（原图 `tools/ui/ai-source/farm-v2/`）
- 入口：`GameBootstrap.ts` · 布局：`FarmWorldLayout.ts` · 玩法：`FarmSystem.ts`

## 重新生成世界组件

```bash
python3 tools/ui/generate_world_assets.py
```

## 设计分辨率

`settings/v2/packages/project.json` → `1080 × 1920`，`fitWidth: true`。
