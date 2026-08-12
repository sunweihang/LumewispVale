---
name: skill-graph-authoring
description: >-
  Author and migrate Cocos skill graphs (skill-editor / TsAbility / SkillDebug) for LumewispVale
  (migrated from oops-framework / 后室). Use when creating or editing skill-graphs, StartFollower,
  FireProjectile, BallisticFireBullet, TsAbility export, SkillDebugBoot prefab loading,
  僚机/无人机/导弹/普攻图技能, or wiring SkillExecutor vs AbilityRuntime. Encodes hard constraints
  learned from skill 1001 to avoid repeating failures.
---

# 技能图制作约束（LumewispVale / 后室迁移）

制作 / 迁徙图技能前先读本 skill。正式局与 SkillDebug 路径不同，勿混改。

## 默认流程（先编辑器，后正式局）

1. **只在 SkillDebug 验证**：图资产 + `TsAbility{id}` + ClassMap + `TbAbility`。
2. **正式局白名单**：`SkillExecutor.ts` 的 `FORMAL_GRAPH_SKILL_IDS` 含 `{1000,1001,1002,1003}` 时只 `tryInstall`，不再走 Drone/Boomerang/Missile 旧分支。
3. 新图技能进正式局：加入白名单，并确认 Level `res.json` 已有 prefab（含 alias），勿与旧 `SkillBehavior` 双调度。

反例：白名单已含该 id 仍保留 host.schedule / CreatNode(Follower01) → 双开火/双无人机。

## 行为拆分（节点怎么切）

| 职责 | 做法 | 禁止 |
|------|------|------|
| 生成 + 跟随 | `StartFollower` / `StopFollower`（启动/停止） | 在图里用 `OnUpdate` 手搓每帧位移线 |
| 开火 | 对齐导弹：`ScheduleRepeating` → 寻怪 → `FireProjectile` / `BallisticFireBullet` | 再造一套 `ScheduleShoot` 特例节点 |
| 组件自治 | 图接管后 `FollowerController.enabled = false` | 图与组件双重跟飞/双重开火 |

持续行为用「开始/停止」节点；周期战斗用现有调度 + 子弹节点。

## 导出陷阱：FloatConst Flow 链 + dataPrelude 互递归

`radius → maxCount → find` 这类 Flow 串联常量时，旧导出会在 `find` 的 dataPrelude 再调 `radius`，与 `radius→maxCount` 形成 **too much recursion**（见 TsAbility1001）。

- 导出器：已接「前序」的 Const **不再** dataPrelude 补调。
- 图侧也可只连数据口、Flow 直连 `find`，更清晰。

## 手写 / 改 `graph.graph.json`（极易丢线）

- 端口名必须与 `extensions/skill-editor/src/nodes/skillNodes.ts`（含 `SKILL_BUILTIN_NODE_DEFS`）**中文名一致**：`前序` / `后继` / `值` / `僚机`…
- **禁止**手写英文口名 `Exec` / `Then` / `Value` / `Follower`。打开图时 `syncSkillGraphPorts` 按**端口名**重映射，对不上的连线会被**直接丢弃**。
- 改完后应用 sync 校验：`connections` 数量不应骤降；必要时 `npm run build` 扩展后再打开技能。
- sync 实现须覆盖 `allSkillRegisterNodes()`（含 FloatConst），不能只扫 `SKILL_NODE_DEFS`。

## 新增编辑器节点清单

1. `skillNodes.ts` 增加 `NodeDefinition`（中文端口）
2. `templates/Execute{TypeName}.ts.tpl`
3. `AbsAbility` 增加对应 API
4. `cd extensions/skill-editor && npm run build`，扩展禁用再启用
5. 建 `assets/resources/skill-graphs/{id}/`（`index.json` + `graph.graph.json`）→ 导出 `TsAbility{id}` → 更新 ClassMap
6. `tbability.json` 增加行（`id` / `templete`）

参考：`extensions/skill-editor/README.md`。

## SkillDebug 资源：装载时惰性加载

- **禁止**在 `SkillDebugBoot.start` 预载全部技能表现 prefab。
- 一律走 `SKILL_LAZY_PREFABS[skillId]`，在 `equipAbilityRow` / `tryInstall` **之前** `await ensureSkillPrefabsLoaded(skillId)`。
- 新技能必补表项；依赖的受击/出场特效一并列入（例：僚机要 `SFX_Blood`、`SFX_BoomShow`）。
- 「重新安装」须先 `uninstall` 再装，保证 `OnInstall`（如 `StartFollower`）重跑。

### Prefab 名 ≠ 资源文件名

`res.json` 的 `name` 才是 `PoolSystem.CreatNode` 的 key：

| CreatNode 名 | 实际 path | 注意 |
|--------------|-----------|------|
| `Follower01` | `units/2005/Output/2005` | prefab.`name` 常为 `2005`，加载后必须 **alias 注册** `Follower01` |
| `FollowerBullet01` | `Prefabs/FollowerBullet01` | |
| `SFX_Blood` 等 | `effects/{id}/Output/{id}` | prefab.`name` 常为数字 id，须 **alias** 为 poolName |
| `Bullet01` 等 | `Prefabs/...` | 一般 name 一致 |

加载后：`pool[prefab.name] = prefab` **且** `pool[alias] = prefab`。

## 紫图 / 材质

子弹/模型紫图优先查材质 `_props.mainTexture` 的 UUID 是否仍对应现存 `.png.meta`（贴图重导后材质易断）。例：`FollowerBullet01` → `BulletTail01.mtl` → `bullettail.png`。

## 命中与受击特效

- `FireProjectile` + 旧 `BulletController`：溅血在子弹脚本里 `CreatNode("SFX_Blood")`，**不是**图命中口。
- `BallisticFireBullet`：命中走图上「命中出口」→ `PlayParticleEffect(SFX_Blood)` / `ApplyDamage`（普攻 1000 模式）。
- SkillDebug 可跳过 EXP，**不要**再禁溅血；并保证池里有 `SFX_Blood`。
- 调试种怪需真实敌人层级/组件，否则子弹 trigger 不进 `EnemyController`。

## 双路径与双刷机

| 路径 | 谁刷僚机 |
|------|----------|
| 正式局（图模式） | 仅 `StartFollower`（`FORMAL_GRAPH_SKILL_IDS` 含 1001） |
| SkillDebug 1001 | 仅 `StartFollower` |

禁止同一局里再跑 `SkillBehavior.Drone` → 双无人机。

## 提交前自检

- [ ] 图端口全中文，打开后连线仍在
- [ ] `SKILL_LAZY_PREFABS` 含该技能全部表现 + 命中特效（SkillDebug）
- [ ] unit 型 prefab 已 alias；正式局 `res.json` 有对应 name
- [ ] 进正式局的 id 已在 `FORMAL_GRAPH_SKILL_IDS`，且旧分支已跳过
- [ ] 扩展已 build；`TsAbility{id}` 与 ClassMap / TbAbility 一致
- [ ] SkillDebug：重装会再跑 OnInstall；命中有溅血（若设计需要）
