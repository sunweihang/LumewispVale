# effect-editor · 特效管理器

对齐 Unity GameAsset `EffectManagerMenu`，接入 Game编辑器宿主（`battle-manager`），与单位管理器 / 场景管理 / 战斗管理器同级。

```
Game编辑器
├── 单位管理器
├── 特效管理器          ← 本扩展
│   ├── 特效管理
│   └── 特效类型管理
├── 场景管理
└── 战斗管理器
```

菜单 `扩展 → 特效管理器 → 打开` 进入同一 Game编辑器面板，侧栏分组为「特效管理器」。

## 启用

```bash
cd extensions/effect-editor && npm install && npm run build
```

同时启用 **battle-manager**、**effect-editor**。

## 数据目录（对齐 GameAsset `Resource/Effect/{id}`）

```
assets/resources/effects/{effectId}/
├── index.json
├── Res/
│   ├── Materials/            # 仅该特效使用的材质
│   ├── Textures/             # 仅该特效使用的贴图
│   └── Models/               # 仅该特效使用的模型
└── Output/{effectId}.prefab  # 运行时 Prefab
```

- `poolName`：PoolSystem `CreatNode` 名（迁移后仍为 `SFX_Blood` / `VFX_*`）
- `prefab`：`effects/{id}/Output/{id}`
- **专属**资源（只被该特效 Prefab 引用）：**移动**进对应 `Res/`（保留 `.meta` UUID）
- **共享**资源（多特效 / 子弹 / 角色 / 场景共用，如 `Noise*`、`BlackSmoke`、`guangyun.mtl`）：**留在** `Art/SFX/**`，不要复制进各特效
- 全局 Shader（`Art/Shader`）不拆

## 迁移现有特效

菜单 **扩展 → 特效管理器 → 迁移现有特效**（或特效管理行内「迁移特效」）：

1. `Prefabs/SFX_*` / `Prefabs/VFX_*` → `effects/{id}/Output/{id}.prefab`
2. 写 `index.json`，更新 `res.json` 的 `url`（`name` 不变）
3. 无 Editor 时：`npm run migrate-cli`

既有 `res.json` id（209/210、401–410）沿用；孤儿特效占用 211–225、411。

## 整理专属资源到 Res

Prefab 迁完后执行（可重复，已就位的会跳过）：

```bash
cd extensions/effect-editor && npm run migrate-res-cli
```

按 UUID 依赖分析：只被单个特效引用的 `Art/SFX/{Materials,Textures,Models}`（及少数 `Art/Role/Materials`）挪入 `effects/{id}/Res/`。报告见 `scripts/last-res-migrate-report.txt`。

预览场景（`Level_SFX.scene` / `EffectPreview.scene`）不计入「被别处引用」。多特效共用或子弹/角色仍在用的资源留在 `Art/SFX`。

## 特效预览

独立扩展 `effect-preview` 菜单挂在 `扩展 → 特效管理器` 下，用于场景内预览播放。
