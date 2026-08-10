# Scene Bake — Reference

## 门户抠图（CreativeCenter）

| 项 | 值 |
|----|-----|
| Base | `http://10.1.4.130:8080` |
| 登录 | `POST /api/auth/login`（默认 `admin` / `admin123`，以环境为准） |
| 上传 | `POST /api/comfyui/upload/image` |
| 排队 | `POST /api/comfyui/prompt`（节点 `RMBG`，model `RMBG-2.0`，background `Alpha`） |
| 历史 | `GET /api/comfyui/history/{prompt_id}` |
| 取图 | `GET /api/comfyui/view?filename=&type=&subfolder=` |
| 工作流名 | `rmbg-v2` |

项目封装：`tools/ui/portal_rmbg_buildings.py`（可复制改成 props/nature 批量）。

验收：四角 `alpha=0`；透明占比建筑通常 30%–60%。

## 目录约定

```
tools/ui/
  ai-source/                 # AI 原图（可进 git；不进 atlas）
    rmbg-cutout/             # 门户抠图中间结果
  uuid-map.json              # bld-* / prop-* → spriteFrame uuid
  bake_farm_scene.py
  bake_town_scene.py
  portal_rmbg_buildings.py
  process_town_buildings_ai.py   # 已废弃作生产抠图

assets/
  textures/{buildings,terrain,nature,props,special}/
  scenes/{Main,Town}.scene
  scripts/game/{Farm,Town}WorldLayout.ts
```

## Tile / 坐标

- `TILE = 64`
- 地面节点：世界坐标 `(ix*TILE, iy*TILE)`，anchor `(0.5, 0.5)`
- 建筑脚点：`(tx*TILE, ty*TILE + foot)`，`foot≈36`，anchor `(0.5, 0)`
- 竖屏设计分辨率 1080×1920；世界 1 单位 = 1 逻辑 px

## 有机地形配方（从 farm/town 抽取）

### Blob

```python
# d = (dx/rx)^2 + (dy/ry)^2 + sin wobble
# d < core + wobble → 填实
# d < 1.05 + wobble → 概率填（毛边）
```

### Soften（锁 spine）

- 对 `dirt` / `stone` 分别 soften
- `locked` = 广场核心 ∪ 主干道 tile
- 1–2 rounds：孤立点剔除；邻接 ≥2 时向外长毛

### Fringe 顺序

1. 铺完 wanted 格子（water/stone/dirt/grass）
2. **dirt 格上**画 grass-side fringe（`fringe_dirt_*`）— 与 farm `paint_grass_fringe` 同构
3. stone fringe（邻非 stone）
4. water fringe（邻陆地）

帧键：`fringeN/E/S/W`、`fringeOut*`、`fringeIn*`（见 `TerrainFrames.ts`）。

### 装饰密度（经验）

| 区域 | soft clutter 概率 | 备注 |
|------|-------------------|------|
| 岸边 | ~0.40 | + reed/lily/rockWet |
| 土路 | ~0.34 | pebble/twig 偏多 |
| 草地 | ~0.26 | weed 类 |
| 广场核心 | 接近 0 | 留空 |

树：边缘/岸边高密度；clearing 与 dirt 上降权；大树旁可补 bush understory。

## Bake 写 Scene 要点

城镇 `bake_town_scene.py` 模式可复用：

1. `json.load(Main.scene)` 作壳（或已有目标 Scene）
2. 找 `_name == "World"` 节点
3. `collect_subtree_ids` 删原子树，remap id
4. `make_sprite_node` 追加 children（先 ground 后 actors）
5. 写回 Scene；**复用** `OUT_META` 里已有 uuid，勿每次新 uuid 断引用

节点命名：

| 前缀 | 用途 |
|------|------|
| `tile-grass_*` / `tile-dirt_*` / `tile-stone_*` | 地面 |
| `pond_water_*` | 水 |
| `fringe_*` / `fringe_dirt_*` / `fringe_water_*` | 过渡 |
| `bld_<kind>` | 可交互建筑 |
| `home_npc_*` | 民居 |
| `decor_*_solid_*` / `decor_*_soft_*` | Y 排序用 solid/soft 标签 |
| `lamp_*` / `bench_*` / `sign_*` / `fence_*` | 家具 |

## 运行时探测

```ts
// GameBootstrap
const isTown = TownWorldLayout.isBaked(world);
const isFarmBaked = FarmWorldLayout.isBaked(world);
const authored = isTown || isFarmBaked;
// authored → 不跑 FarmWorldLayout.apply 程序铺地
```

新场景：增加 `isXxx`，并入 `authored`，挂对应交互。

YSort / Bootstrap 清理逻辑需忽略 `__*_baked`、`__*_spawn`。

## 新场景文件清单

```
Task Progress:
- [ ] tools/ui/bake_<name>_scene.py
- [ ] assets/scenes/<Name>.scene (+ .meta)
- [ ] assets/scripts/game/<Name>WorldLayout.ts
- [ ] tools/ui/uuid-map.json 条目（若有新建筑）
- [ ] assets/textures/... 贴图 + .meta
- [ ] GameBootstrap.ts 分支
- [ ] WorldYSort.ts 忽略标记
- [ ] （可选）<Name>Catalog.ts 商店/文案
- [ ] README 一行 bake 命令
```

## 城镇分区模板（可抄）

```
        Civic (N)
 Homes (NW)     Market (E)
 Services(W) [Plaza] Workshop(SE)
 Culture(SW)  Saloon(S)  Pier → River
 Farm exit ← west dirt stub
```

规则：民居只在一个口袋；商店错开纵深（禁同一 Y 条带）；广场小而密家具，勿石砖大陆。

## Python 环境（Windows）

优先：

```bash
# scoop
C:\Users\elex\scoop\apps\python310\current\python.exe tools/ui/bake_town_scene.py
# 或 PATH 上的
python tools/ui/bake_town_scene.py
```

依赖：`Pillow`。门户脚本仅需标准库 + Pillow。

## 与 pixel-art-draw 的边界

| 事务 | skill |
|------|--------|
| 画/重画单张建筑、角色帧、tile | pixel-art-draw |
| 摆一张可玩地图、改路网、bake Scene | **scene-bake** |
| UI 面板 chrome | 非本 skill（cocos-2d-art-ui） |
