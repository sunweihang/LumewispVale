# unit-editor · 单位管理器

对齐 Unity GameAsset：**与战斗管理器同级**，共用同一个宿主窗口（`battle-manager` / Game编辑器）。

```
Game编辑器（battle-manager.host）
├── 单位管理器          ← 本扩展
│   ├── 单位管理
│   └── 单位类型管理
├── 特效管理器          ← effect-editor
├── 场景管理            ← scene-editor
└── 战斗管理器
    ├── 技能            ← skill-editor
    └── 弹道            ← ballistic-editor
```

菜单 `扩展 → 单位管理器 → 打开` 与 `扩展 → 战斗管理器 → 打开` 进入同一面板，侧栏分组不同。

## 启用

```bash
cd extensions/unit-editor && npm install && npm run build
```

同时启用 **battle-manager**、**unit-editor**。

## 数据（对齐 GameAsset `Resource/Unit/{id}`）

创建单位时自动生成：

```
assets/resources/units/{unitId}/
├── Res/                      # 该单位独立源资源（FBX / 贴图 / 材质 / 动画）
│   ├── FBX/ · Models/
│   ├── Materials/ · Textures/
│   └── Anims/
├── Output/
│   └── {unitId}.prefab       # 运行时 Prefab（含默认挂点）
├── index.json                # prefab: "units/{unitId}/Output/{unitId}"
└── mounts.json               # 挂点映射（创建时写入）
```

- 专属资源（仅该单位使用）：**移动**进对应 `Res/`（UUID 不变）。
- 共享资源（多单位 / 场景 / VFX 共用，如血条 HUD、阴影材质）：**留在共享目录**（如 `Art/Role/Materials`、`Art/SFX`），**不要复制**进各单位 `Res/`。
- 全局 Shader / 子弹等公共资源不拆进单位目录。

运行时经 `UnitManager` / `res.json` 加载 `units/{id}/Output/{id}`。

## 碰撞范围（逻辑圆柱，非物理 Collider）

`index.json` 字段：

| 字段 | 含义 | 默认 |
|------|------|------|
| `collisionRadius` | 水平半径（米） | `0.5` |
| `collisionHeight` | 柱高（米） | `1.5` |
| `collisionCenterY` | 中心相对根节点 Y | `0.75` |

可视化编辑：

1. 单位管理 → **打开 Prefab**（会自动挂 `UnitCollisionVolume`，场景中显示绿色圆柱）
2. Inspector 调节 `collisionRadius` / `collisionHeight` / `collisionCenterY`
3. 菜单 **扩展 → 单位管理器 → 保存碰撞范围到配置**（或 message `save-unit-collision`）写回 `index.json`

运行时 `UnitManager.spawn` 会按 index 写入组件；弹道扫掠 `queryTargetsAlongSegment` 用该圆柱做几何命中，**不再读物理 Collider**。
