# modifier-editor · Buff 管理器 / 图编辑

```
战斗管理器
├── 技能
├── 弹道
└── Buff      ← 本扩展（节点图 + 导出 TsModifier*）
```

## 启用

1. 启用 `node-graph`、`battle-manager`
2. `cd extensions/modifier-editor && npm install && npm run build`
3. 扩展管理器启用 **modifier-editor** 并重载

## 资产

`assets/resources/modifier-graphs/{id}/index.json` + `graph.graph.json`  
导出：`assets/Scripts/src/skill/modifier/generated/TsModifier{id}.ts`

击退示例：`200000001`（挂载 KnockBack/CantMove + 击退位移，卸下清状态）。

## 入口生命周期

`挂载` → `onSpawn` · `每帧更新` → `onTick` · `卸下` → `onDespawn`
