# Lumewisp Vale

《星露谷物语》like 牧场生活模拟 — Cocos Creator **3.8.8**，竖屏 **1080×1920**。

## 打开工程

当前若已有 Creator 打开其他工程（如 Tetris），请先在编辑器里 **文件 → 打开项目** 选本目录，或关掉后执行：

```bash
"/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator" \
  --project /Users/Custom/LumewispVale
```

打开后进 `assets/scenes/Main.scene`（世界已 bake 进 Scene）。预制体在 `assets/prefabs/world/`。

## 目录

| 路径 | 说明 |
|------|------|
| `assets/scenes/Main.scene` | 农场主场景（World 已权威摆放） |
| `assets/scenes/Town.scene` | 城镇场景（广场 / 商店 / 民居，独立 Scene） |
| `assets/scenes/Mine.scene` | 浅层矿洞（采矿厅 / 晶脉 / 竖井） |
| `assets/prefabs/world/` | 地形 / 建筑 / 自然 / 道具 / 特殊预制体 |
| `assets/textures/` | 对应像素贴图（nearest） |
| `docs/art-bible.md` | 美术规范 |
| `docs/story-mainline.md` | 主线剧情与地图开放 |
| `docs/ui-design-tokens.md` | 设计 tokens |
| `tools/ui/catalog.json` | 组件清单 |
| `tools/ui/generate_world_assets.py` | 贴图 + Prefab 生成 |
| `tools/ui/bake_farm_scene.py` | 把 FarmWorldLayout 烘焙进 Main.scene |

## 操作（当前可玩切片）

- **触控 / 鼠标**：拖拽移动；点按格子使用当前工具；杂草 / 成熟作物直接点；底部栏点选工具（桌面：1–3 选工具，空格对脚下使用）
- **核心循环**：锄头锄地 → 种子播种 → 水壶浇水 → 点击收获；野外杂草直接点击拔除
- **地图**：`Main.scene` 内已摆好的农场（林缘 / 小屋院子 / 可耕空地 / 湖与栈桥）；运行时不再程序铺地
- **主线**：农场教程 → 查看紫晶陨石 → 路牌前往小镇 → 镇长/商店/公告板/社区中心（见 `docs/story-mainline.md`）
- 资产生成：`tools/ui/process_farm_ai_v2.py`（原图 `tools/ui/ai-source/farm-v2/`）
- 入口：`GameBootstrap.ts` · 布局查询：`FarmWorldLayout.ts` · 玩法：`FarmSystem.ts`

## 重新生成世界组件

```bash
python3 tools/ui/generate_world_assets.py
```

## 重新烘焙地图 Scene

完整流程（资产 → 门户抠图 → 有机布局 → bake → 运行时接线）见  
[`.cursor/skills/scene-bake/SKILL.md`](.cursor/skills/scene-bake/SKILL.md)。

```bash
# 城镇建筑：门户 RMBG 抠图入库（勿用灰底色键）
python tools/ui/portal_rmbg_buildings.py

# 农场 → Main.scene
python tools/ui/bake_farm_scene.py

# 城镇 → Town.scene
python tools/ui/bake_town_scene.py

# 浅层矿洞 → Mine.scene（可先画矿洞资产）
python tools/ui/draw_mine_props.py
python tools/ui/bake_mine_scene.py
```

编辑器打开 `assets/scenes/Town.scene`。点建筑脚底附近可开店或接任务；启动场景仍是农场 `Main.scene`。  
矿洞：小镇点矿脉商会解锁 → 北山 `sign_mine` 进入。纯地下洞穴（火把/木支架，无路灯草地）；锄头挖矿石。

## 设计分辨率

`settings/v2/packages/project.json` → `1080 × 1920`，`fitWidth: true`。
