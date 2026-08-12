# skill-editor

技能图编辑器扩展。依赖通用图引擎 [`node-graph`](../node-graph/)，在业务侧提供技能节点库、CRUD、校验，以及 **TS 代码导出**（对标 Unity `AbilityGraphExporter` → `CSharpAbility{id}.cs`）。

> 运行时已通过 [`AbilityRuntime`](../../assets/Scripts/src/skill/graph/AbilityRuntime.ts) 接入完整 AbsAbility FSM（Idle→Phasing→Channeling→Spelling）。普攻 **1000** 为引导连射，已替代 `PlayerController.Shoot`。

## 启用顺序

1. `cd extensions/node-graph && npm install && npm run build`，扩展管理器启用 **node-graph**
2. `cd extensions/skill-editor && npm install && npm run build`，启用 **skill-editor**
3. 改源码后：菜单 **扩展 → 一键编译并刷新全部扩展**（战斗管理器 / 技能编辑器菜单与面板同入口），编译并重载 `extensions/` 下全部包，无需再去扩展管理器逐个禁用/启用

菜单：`扩展 → 技能编辑器 → …`

## 路径约定

| 用途 | 路径 |
|------|------|
| 图资产 | `assets/resources/skill-graphs/{skillId}/graph.graph.json` |
| 元数据 | `assets/resources/skill-graphs/{skillId}/index.json` |
| 生成类 | `assets/Scripts/src/skill/generated/TsAbility{skillId}.ts` |
| 注册表 | `assets/Scripts/src/skill/generated/TsAbilityClassMap.ts` |
| 基类 | `assets/Scripts/src/skill/graph/AbsAbility.ts` |
| 索敌查询 | `assets/Scripts/src/skill/graph/AbilityCombatQuery.ts` |

## 普攻（skillId = 1000）— 引导 / 吟唱攻击

对齐 Unity AbsAbility：`PhaseTime=0` → 无限 `Channeling` + `ChannelThink` 周期开火（机枪手感）。

```text
OnPreFindTarget
  → AbilityCaster → EntityPosition → FindTargetByCircle
  → ForeachTarget → CastTargetEntity

OnChanneling
  → PlayAnimation(isattack=1, sticky, 无打击点)

OnChannelThink (≈0.25/atkSpeed)
  → AbilityCurrentSkillTarget → FlipFlop
  → SFX_FirePoint + BallisticFireBullet
  → 命中出口：PlayParticleEffect(SFX_Blood@受击点) → ApplyDamage → RandomChance(0.1) → ApplyModifier(200000001 击退)
```

资产：`assets/resources/skill-graphs/1000/`  
导出：`assets/Scripts/src/skill/generated/TsAbility1000.ts`

### 运行时接入

| 项 | 行为 |
|----|------|
| 启动 | `tryInstall(1000, { autoDrive: true, channelThinkInterval: 0.25 })` |
| 每帧 | `tick` → FSM；autoDrive 在 Idle 时 `BeginCast`，引导中 `ChannelThink` 开火 |
| 丢目标 | `interrupt` → Idle，清粘性 `isattack` |
| 调试 G | `beginCast`：开始/续期引导（非单发） |

## 技能调试（用正式关卡）

粉屏空场景已废弃。请用正式关卡：

- 场景：`assets/Scene/Level.scene`（`startRoom = Chapter01_Level00`）
- 菜单：`扩展 → 技能编辑器 → 打开技能调试（Level）`，再点运行

| 操作 | 作用 |
|------|------|
| **WASD / 摇杆** | 移动主角（关卡原有控制） |
| **F9** | 开关「点地种怪」 |
| **左键点地**（F9 开） | 种植 `SkillDebugTarget` |
| **G** | `beginCast(1000)` 开始/续期引导 |
| **C**（F9 开） | 清除假目标 |

可选轻量场：`SkillDebug.scene` 会运行时加载 `Prefabs/Chapter01_Level00` 当地图（不再铺无材质粉地板）。

控制台过滤 `[SkillDebug]` / `[AbilityRuntime]`。

## 入口生命周期（对齐 Unity）

`OnInstall` → `OnActive` → `OnUnActive` → `OnPreFindTarget` → `OnCastSuccess` → `OnPhase` → `OnChanneling` → `OnChannelThink` → `OnSpellStart` → `OnSpellEnd` → `OnUninstall` → `OnCasterDead` → `OnInterrupted` → `OnUpdate` → `OnConfigUpdated`

状态机：`Idle → Phasing → Channeling → Spelling → Idle`（零时长阶段自动跳过；`ChannelTime < 0` 无限引导）。

`OnUninstall` 即使无连线也会导出。

## 战斗向节点（Unity 对齐命名）

| typeName | 说明 |
|----------|------|
| `FindTargetByCircleBlueprint` | 圆形寻怪 → entityList |
| `FindTargetBySectorBlueprint` | 扇形寻怪（caster forward） |
| `EntityPositionBlueprint` / `EntityForwardBlueprint` | 坐标 / 朝向 |
| `CastTargetEntityBlueprint` | 写入 currentSkillTarget |
| `AbilityCurrentSkillTargetBlueprint` | 读目标，有/无分支 |
| `ForeachTargetBlueprint` | 遍历列表 |
| `PlayAnimationBlueprint` | AnimationController 参数 + Hit0/1/2 打击点 |
| `ApplyDamageBlueprint` | AttrSystem + Enemy/Boss.Hit；击退不在此节点 |
| `SetGameEntityStateBlueprint` | 单位状态引用计数（对齐 GameAsset `GameEntityState`） |
| `ApplyModifierBlueprint` | 挂载 Buff 模板；可选 **命中点**（击退方向） |
| `RandomChanceBranchBlueprint` | 随机概率分支（成功/失败）；字段默认概率，可接线覆盖 |
| `FireProjectileBlueprint` | PoolSystem 弹道（普攻用） |
| `BallisticFireBulletBlueprint` | 图弹道发射；**命中出口** / **当前命中单位** / **命中坐标** |
| `FireLaserBlueprint` | 瞬时激光（cc.Line 连接攻击方→目标）；**命中出口**后按时长销毁光束 |
| `StartFollower` / `StopFollower` | 僚机生成+图驱动跟随 / 停止；开火另接 ScheduleRepeating + FireProjectile |

### 僚机（skillId = 1001）— 先 SkillDebug，未进正式局

```text
OnInstall → StartFollower(Follower01)
OnActive  → ScheduleRepeating(1s) → 僚机坐标寻怪 → FireProjectile(FollowerBullet01@ShootPoint)
OnUninstall → StopFollower
```

- 资产：`assets/resources/skill-graphs/1001/` → `TsAbility1001`
- **正式局**仍走 `SkillBehavior.Drone` 旧生成逻辑，**不会** `tryInstall(1001)`
- **调试**：技能调试面板把 skillId 设为 `1001` 再运行 Level / SkillDebug

端口类型另含：`entity` / `entityList` / `vec3` / `prefab`。

### 发射子弹 · 命中后（对齐 GameAsset：状态 + Modifier）

GameAsset 没有单独「击退」节点；击退 = `ApplyModifier` Buff（OnSpawn 置 `KnockBack`/`CantMove` + 位移，到期 OnDespawn 清状态）。

| 针脚 | 说明 |
|------|------|
| `命中出口` | Flow：去重首次命中时执行一次子图 |
| `当前命中单位` | entity：接 `ApplyDamage` / `ApplyModifier.目标` |
| `命中坐标` | vec3：接 `ApplyModifier.命中点`（击退方向） |
| `命中列表` / `列表数量` | 累计命中列表（异步追加） |

连线示例（技能 1000）：

```text
命中出口 → PlayParticleEffect(SFX_Blood@受击点) → ApplyDamage → RandomChance(0.1 成功) → ApplyModifier(200000001)
当前命中单位 → ApplyDamage.目标 / ApplyModifier.目标
命中坐标 → ApplyModifier.命中点
```

击退 Buff：`assets/Scripts/src/skill/modifier/generated/TsModifier200000001.ts`（手写模板，后续可接 modifier-editor）。

## 如何添加新节点

1. [`src/nodes/skillNodes.ts`](src/nodes/skillNodes.ts) 增加 `NodeDefinition`
2. [`templates/`](templates/) 增加 `Execute{TypeName}.ts.tpl`
3. 在 `AbsAbility` 增加对应战斗 API
4. `npm run build`，重启扩展

## 导出

- 浏览器面板「导出TS」或消息 `export-skill` `{ skillId }`
- 「批量导出 TS」：`exportFlag !== false` 的本地技能
- `PlayAnimationBlueprint` 会生成 `{Method}_OnHitPoint` companion（对齐 Unity hitDispatch）

## 对外消息

| 消息 | 说明 |
|------|------|
| `ensure-registered` | 注册端口/节点 |
| `open-skill` | `{ skillId }` |
| `export-skill` | `{ skillId }` |
| `list-skills` | 列表 |
| `create-skill-api` | 创建 |

## 本期不做

- 用图普攻 **替换** `PlayerController.CheckEnemy/Shoot`（当前为并行验证）
- Luban 普攻表行 / `SkillBehavior.Graph`
- 图宏内联、弹道 TravelSegment、完整 ActiveAnimationInfo 资源
