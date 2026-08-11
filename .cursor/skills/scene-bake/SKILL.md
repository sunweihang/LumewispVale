---
name: scene-bake
description: >-
  Authors and bakes Lumewisp Vale world scenes (farm, town, future maps) into
  Cocos Scene files: layout in bake_*.py, organic terrain, portal RMBG buildings,
  World markers, runtime WorldLayout. Use when the user asks to 做场景/新地图/
  bake 场景/城镇/农场布局/铺地/摆建筑, or to extend Main.scene / Town.scene.
---

# Lumewisp Vale — Scene Bake

Cocos Creator 3.8 世界场景权威流程：**Python bake 写 Scene**，运行时只读查询、不程序铺地。

相关 skill：单体像素资产生成用 [`pixel-art-draw`](../pixel-art-draw/SKILL.md)。本 skill 管**整张地图**从规划到可玩。

## 启动必读

```
- [ ] docs/art-bible.md（构图气质、tile=64）
- [ ] 对照场景：农场 bake_farm_scene.py / 城镇 bake_town_scene.py
- [ ] 运行时：*WorldLayout.ts + GameBootstrap 对 __*_baked 的分支
- [ ] 既有贴图 UUID（改 PNG 勿丢 .meta）
```

## 架构（先记住）

| 层 | 职责 | 权威文件 |
|----|------|----------|
| 资产 | PNG + .meta + uuid-map | `assets/textures/**`、`tools/ui/uuid-map.json` |
| 布局源码 | 路径/水体/建筑坐标/装饰密度 | `tools/ui/bake_<scene>_scene.py` |
| 烘焙产物 | World 子节点精灵树 | `assets/scenes/<Scene>.scene` |
| 运行时常量 | 出生点、点击交互、地块查询 | `assets/scripts/game/<X>WorldLayout.ts` |
| 启动接线 | 识别 bake 标记、开玩法 | `GameBootstrap.ts`、`WorldYSort.ts` |

**禁止**：在编辑器里手摆一整张图当权威；改完不重 bake；灰底色键抠建筑（用门户 RMBG）。

## 标准流水线（新场景 / 大改）

```
Task Progress:
- [ ] 1. 定案：场景名、AABB、分区、玩法钩子
- [ ] 2. 资产：缺什么画什么（pixel-art-draw + 门户抠图）
- [ ] 3. 布局脚本：路径 → 有机化 → 地形 fringe → 建筑 → 装饰
- [ ] 4. 重叠检验：建筑 AABB 0 重叠
- [ ] 5. bake 进 Scene（保留 scene .meta uuid）
- [ ] 6. WorldLayout + Bootstrap / YSort 接线
- [ ] 7. 编辑器打开 Scene 目视；交互抽测
```

### 1) 定案

复制现有对：

| 场景 | Bake | Scene | Layout | 标记 |
|------|------|-------|--------|------|
| 农场 | `bake_farm_scene.py` | `Main.scene` | `FarmWorldLayout.ts` | `__farm_baked` |
| 城镇 | `bake_town_scene.py` | `Town.scene` | `TownWorldLayout.ts` | `__town_baked` |
| 镇长府 | `bake_mayor_house_scene.py` | `MayorHouse.scene` | `MayorHouseWorldLayout.ts` | `__mayor_house_baked` |
| 浅层矿洞 | `bake_mine_scene.py` | `Mine.scene` | `MineWorldLayout.ts` | `__mine_baked` |

新场景命名约定：`bake_<name>_scene.py` → `assets/scenes/<Name>.scene` → `<Name>WorldLayout.ts` → `__<name>_baked` + `__<name>_spawn`。

定稿内容（写进 bake 注释即可）：

- 分区草图（ASCII）
- 出生点世界坐标
- 可交互建筑列表（shop / board / info）
- 地图 AABB（tile 索引范围）

### 2) 资产

1. AI 原图只进 `tools/ui/ai-source/`（`ai-bld-<id>-v3.png` 等）
2. **建筑/道具抠图必须走门户**（CreativeCenter `http://10.1.4.130:8080`，`rmbg-v2` / RMBG-2.0）  
   - 城镇批量：`python tools/ui/portal_rmbg_buildings.py`  
   - 单栋：`python tools/ui/portal_rmbg_buildings.py --only oreshop,home-purple`
3. 禁止 `process_town_buildings_ai.py` 灰底色键作生产路径（会啃屋顶、留草地脏边）
4. 覆盖 `assets/textures/**` 同名 PNG，**保留 .meta UUID**；更新 `uuid-map.json`
5. 锚点：tile `(0.5,0.5)`；建筑/树脚底 `(0.5, 0)`；nearest、无 mip

详见 [reference.md](reference.md)「门户与资产」。

### 3) 布局脚本（有机地面是硬要求）

对照农场，**不要**大方块 `mark_rect` 当最终地面：

1. **路径核心**：`mark_path_h/v` 实心 spine + 可选肩部噪声
2. **广场/院落**：`mark_blob`（椭圆 + noise），不是矩形大陆
3. **边缘有机化**：`soften_mask`（啃角、长毛边）；**锁住主干道 spine**，只软化 rim
4. **水体**：椭圆/波浪带 + shoreline jitter（见 farm `jitter_shoreline` / town `build_river`）
5. **铺地顺序**：water → stone → dirt → grass → **dirt↔grass fringe** → stone fringe → water fringe  
   （城镇曾缺 dirt fringe，土路会像方砖——必补）
6. **装饰**：soft clutter（weed/pebble/twig…）密度贴近 farm；岸边 reed/lily；间隙 rock/stump/log；树下补 bush
7. **clear**：建筑 ton 周围防树穿模用 blob，勿巨大无菌方阵

建筑：`foot = tile*64 + 36`（或统一 helper）；先定 tile 坐标，再算世界 px。

### 4) 重叠检验

大建筑半宽 ~144–160px。同区水平中心距建议 ≥ 6 tile；南北脚底间距要大于南侧建筑高度。

改布局后跑临时 AABB 检查（或抄城镇对话里的检查逻辑），**0 重叠再 bake**。

### 5) Bake

Windows 推荐：

```bash
# scoop python 3.10
python tools/ui/bake_<name>_scene.py
```

Bake 模式（城镇已用）：以 `Main.scene` 为壳 → 清空 World 子树 → 写入 ground+actors → 保留 `Town.scene.meta` uuid。

节点约定：

- `__<name>_baked`：空节点，运行时探测
- `__<name>_spawn`：出生参考（可选；也可只在 Layout 常量里写坐标）
- ground：`tile-*` / `pond_*` / `fringe_*`（anchor 中心）
- actors：`bld_*` / `home_*` / `decor_*`（脚底锚）

### 6) 运行时接线

`<Name>WorldLayout.ts`：

- `PLAYER_SPAWN`
- `isBaked(world)` → `getChildByName('__<name>_baked')`
- 交互：`findInteract` 按建筑脚底距离（城镇模式）

`GameBootstrap.ts`：

- 识别新 bake 标记；跳过农场程序铺地
- 出生点 / 点击分支

`WorldYSort.ts`：把 `__*_baked` / `__*_spawn` 排除出排序。

Catalog（商店文案等）可另文件，**不要**把坐标塞进 Catalog。

### 7) 验收

- [ ] 编辑器打开 Scene：路径边缘有 fringe，不像方砖
- [ ] 建筑无穿模、无草地脏边
- [ ] 出生点站在可走地面
- [ ] 点击建筑脚底能出对的 UI
- [ ] 四角透明：`corners alpha=0`

## 小改 vs 新场景

| 改动 | 做法 |
|------|------|
| 挪建筑 / 改路 / 调装饰 | 只改 `bake_*.py` → 重 bake |
| 换建筑贴图 | 门户重抠 → 覆盖 PNG（保 meta）→ 一般**不用**重 bake |
| 新交互建筑 | bake 放置 + Layout `findInteract` + Catalog |
| 全新地图 | 复制 bake + Layout + 空 Scene 壳 + Bootstrap 分支 |

## 常见翻车

| 症状 | 原因 | 处理 |
|------|------|------|
| 土路方方正正 | 缺 dirt fringe / 矩形 mark | 补 fringe + blob/soften |
| 建筑叠在一起 | 半宽没算 | AABB 检查 |
| 草地粘在建筑上 | 灰底色键 | 门户 RMBG |
| 运行时又程序铺地 | 缺 `__*_baked` | bake 插入标记 |
| 点建筑没反应 | 节点名非 `bld_*` / 脚点不对 | 对齐命名与 foot |

## 命令速查

```bash
# 城镇建筑门户抠图
python tools/ui/portal_rmbg_buildings.py
python tools/ui/portal_rmbg_buildings.py --only oreshop

# 烘焙
python tools/ui/bake_farm_scene.py
python tools/ui/bake_town_scene.py
python tools/ui/draw_mine_props.py   # 矿洞专用贴图
python tools/ui/bake_mine_scene.py
python tools/ui/portal_rmbg_mayor_house.py   # 镇长府室内家具（门户；不通则本地灰底）
python tools/ui/bake_mayor_house_scene.py

# 新场景：复制 bake_town_scene.py → 改 OUT_SCENE / 标记名 / 布局 → 跑 bake
```

## 延伸阅读

- 门户、UUID、fringe、节点 schema：[reference.md](reference.md)
- 像素单件流水线：[pixel-art-draw/SKILL.md](../pixel-art-draw/SKILL.md)
- 气质参考：`tools/reference/farm-start-ref.png`、`town-night-ref.png`（编辑用，不进包）
