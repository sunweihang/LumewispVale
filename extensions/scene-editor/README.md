# scene-editor · 场景管理

对齐 Unity GameAsset `SceneManagerMenu`，接入 Game编辑器宿主（`battle-manager`）。

```
Game编辑器
├── 单位管理器
├── 特效管理器
├── 场景管理          ← 本扩展
│   ├── 资源场景      ← Prefab / 美术
│   ├── 阻挡种植      ← 资源场景 AABB 阻挡（笔刷）
│   ├── 逻辑场景      ← 种植与玩法配置（主入口）
│   └── 类型配置
└── 战斗管理器
```

**种植以逻辑场景为准**：多个逻辑场景可绑定同一资源场景。  
**阻挡以资源场景为准**：笔刷涂抹写入 `scenes/{id}/index.json` → `blockPlant`（AABB），运行时纯几何拦单位/子弹。

## 启用

```bash
cd extensions/scene-editor && npm install && npm run build
cd ../battle-manager && npm run build
```

扩展管理器中启用 **battle-manager**、**scene-editor**，然后重载。菜单：`扩展 → 场景管理 → 打开`。

## 数据目录

```
assets/resources/scenes/{assetsSceneId}/
├── index.json                 ← 资源场景
├── Res/
├── Output/{assetsSceneId}.prefab
└── logic/{logicId}/index.json ← 逻辑场景（种植写这里）
```

例：资源 `600` 下可有 `logic/600`、`logic/6001`、`logic/6002`。

## 怎么种阻挡（资源场景）

1. **场景管理 → 阻挡种植** → **编辑阻挡**
2. 点 **开启鼠标笔刷**（自动打开 Prefab）
3. 鼠标移到场景视图：橙色笔刷跟着走；**左键拖**涂红盒，**右键拖**转视角
4. **保存** → `scenes/{id}/index.json` → `blockPlant.aabbs`

## 怎么种植（编辑器）

1. **场景管理 → 逻辑场景**
2. 点 **创建**：选择绑定的资源场景 + 逻辑 ID
3. 行内 **编辑种植**：**一条刷怪一张卡**（区域/点位）  
   - **保存只写** `logic/.../index.json` 种植  
   - **节奏只读**展示 `tbspawnconfig`（Excel→Luban 导出）；编辑器不写回配置表  
4. 可选 **从Prefab导入** / **打开资源Prefab** / **定位**

节奏：改 `config/luban/Datas/spawn_config.xlsx`（`logic_scene_id` + `layer_id` = 卡上 #ID；`start_trigger`/`on_cleared` 为 Luban 多态 bean），再 `./tools/dataTools/export.sh` → `tbspawnconfig.json`。  
编辑器与 Excel 不同步双写；改节奏只改表再导出。

完整说明与 Demo 见：[doc/monster-spawn/index.html](../../doc/monster-spawn/index.html)（多页）

> 旧 Prefab 的 `EnemyBornRoot` + `BoxCollider` 只有选中节点时才有线框；逻辑种植请看青色预览盒。

## 种植字段

| 类型 | 字段 |
|------|------|
| 区域 | `unitKind` + `unitConfigId` + `avatarId` + `enemyCount` + `position` + `scale` |
| 点位 | `unitKind` + `unitConfigId` + `avatarId` + `position` |

**选型逻辑（对齐 GameAssets）**

1. 选择面板按 **TbAvatar** 列出模型资源（`avatar.model` → `units/{id}` Prefab）
2. 同一模型可绑定多条 **TbMonster / TbHero**（`avatar_id`）配置，再选实际种下去的那条
3. 场景预览直接实例化模型 Prefab（DontSave）；区域另画青盒

写入 `logic/{logicId}/index.json` → `monsterSpawn.layers[]`。运行时刷怪目前仍走 TbMonster。
