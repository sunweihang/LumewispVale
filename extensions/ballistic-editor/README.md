# ballistic-editor

弹道图编辑器（对标 Unity `BallisticManager` / `BallisticGraphExporter`）。依赖 [`node-graph`](../node-graph/)，与 [`skill-editor`](../skill-editor/) 配合：技能图「发射子弹」引用弹道模板 Id，运行时由 `BallisticRuntime` 驱动导出类。

## 启用顺序

1. 启用并 build `node-graph`
2. `cd extensions/ballistic-editor && npm install && npm run build`，启用 **ballistic-editor**
3. 启用 **skill-editor**（技能侧发射节点）

菜单：`扩展 → 弹道编辑器 → …`

## 路径约定

| 用途 | 路径 |
|------|------|
| 图资产 | `assets/resources/ballistic-graphs/{id}/graph.graph.json` |
| 元数据 | `assets/resources/ballistic-graphs/{id}/index.json` |
| 生成类 | `assets/Scripts/src/skill/ballistic/generated/TsBallistic{id}.ts` |
| 注册表 | `assets/Scripts/src/skill/ballistic/generated/TsBallisticClassMap.ts` |
| 基类 | `assets/Scripts/src/skill/ballistic/AbsLinearBallistic.ts` |
| 运行时 | `assets/Scripts/src/skill/ballistic/BallisticRuntime.ts` |

## 与技能编辑器配合

技能图节点 `BallisticFireBulletBlueprint`（发射子弹）：

- 输入：弹道模板 / 出生坐标 / 朝向 / 目标
- 字段：`ballisticTemplate`（默认 `100000000`）、表现 Prefab、寿命、默认速度
- 导出调用 `AbsAbility.fireBallisticBullet` → `BallisticRuntime.fire`

示例技能 1000：`骨骼世界坐标(FirePoint)` → `发射子弹(100000000)`。

弹道浏览器「引用技能」会扫描技能图中的模板 Id。

## MVP 节点

| typeName | 说明 |
|----------|------|
| `BallisticEntranceBlueprint` | 出生 / 每帧 / 销毁 |
| `BallisticLinearMoveBlueprint` | 匀速直线推进 |
| `FindTargetByTravelSegmentBlueprint` | 本帧线段扫掠寻怪 |
| `ForeachTargetBlueprint` / `ApplyDamageBlueprint` | 命中结算 |
| `BallisticReleaseBulletBlueprint` | 主动回收 |

## 样例弹道

`100000000`「基础直线弹」：OnTick → 推进 → TravelSegment → 伤害。
