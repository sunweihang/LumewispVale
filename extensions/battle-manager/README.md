# battle-manager · Game编辑器宿主

对齐 Unity GameAsset `MainEditorWindow`：

```
Game编辑器
├── 单位管理器          ← unit-editor
│   ├── 单位管理
│   └── 单位类型管理
├── 特效管理器          ← effect-editor
│   ├── 特效管理
│   └── 特效类型管理
├── 场景管理            ← scene-editor
│   ├── 资源场景
│   ├── 逻辑场景
│   └── 类型配置
└── 战斗管理器
    ├── 技能            ← skill-editor
    ├── 弹道            ← ballistic-editor
    └── Buff            ← modifier-editor
```

单位管理器、特效管理器、场景管理、战斗管理器是**同级分组**。

## 启用

1. build 并启用 `node-graph`、`unit-editor`、`effect-editor`、`scene-editor`、`skill-editor`、`ballistic-editor`、`modifier-editor`
2. `cd extensions/battle-manager && npm install && npm run build`，启用 **battle-manager**
3. 菜单：`扩展 → Game编辑器 → 打开`（侧栏含单位/场景/战斗/特效等全部模块）

## 子模块如何接入

在业务扩展 `package.json`：

```json
"contributions": {
  "battleManager": { "enabled": true },
  "messages": {
    "battle-module-info": {
      "public": true,
      "methods": ["battleModuleInfo"]
    }
  }
}
```

`battleModuleInfo()` 可返回单个对象，或**数组**（一个扩展贡献多个叶子）。推荐带上分组字段：

```ts
{
  id: 'skill',
  packageName: 'skill-editor',
  title: '技能',
  order: 10,
  group: 'battle',           // unit | battle
  groupTitle: '战斗管理器',
  groupOrder: 20,
  itemIdKey: 'skillId',
  openArgKey: 'skillId',
  messages: { list, open, exportOne, exportBatch, create, validateOne? },
}
```
