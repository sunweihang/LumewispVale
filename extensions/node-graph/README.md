# node-graph — 通用节点图扩展

对标 Unity `SunixNode` 的 Cocos Creator 通用节点图引擎。  
**只提供图编辑能力**；技能等业务域由其他扩展通过消息 API 注册节点并打开图。

## 启用

1. 在扩展目录安装依赖并编译：

```bat
cd extensions\node-graph
npm install
npm run build
```

2. **扩展 → 扩展管理器 → 项目** → 启用 `node-graph`
3. **扩展 → 节点图 → 打开沙盒** 验收画布

改完源码后执行 `npm run build`，再在扩展管理器里禁用/启用一次。

## 菜单

| 项 | 作用 |
|----|------|
| 打开面板 | 打开空图编辑器 |
| 打开沙盒 | 载入内置演示图（FlowStart / Float / Add / DebugLog） |

## 画布操作

- **右键 / 双击 / A**：添加节点（搜索过滤）
- **拖节点**：移动；**框选**：空白处拖拽
- **端口拖拽**：连线（类型不兼容会拒绝；`GraphFlow` 仅互连）
- **中键 / Alt+拖 / Space+拖**：平移；**滚轮**：缩放
- **Ctrl/⌘+C / Ctrl/⌘+V**：复制粘贴（含内部连线）
- **Ctrl/⌘+Z**：撤销；**Ctrl/⌘+Shift+Z** / **Ctrl+Y**：重做
- **Delete**：删除选中
- 右侧 **Inspector**：编辑节点 `fields` → 写入 `customData`

## 资产格式

`*.graph.json`（版本字段 `version: 1`）：

```json
{
  "version": 1,
  "graphId": "graph_xxx",
  "profile": {
    "name": "skill",
    "nodeFilter": { "allowAll": false, "whitelist": ["FlowStart", "Add"] }
  },
  "nodes": [],
  "connections": []
}
```

## 业务扩展接入

其他扩展在 `package.json` 的 `contributions.messages` 中如需监听广播，声明：

```json
"node-graph:graph-changed": { "methods": ["onGraphChanged"] },
"node-graph:graph-saved": { "methods": ["onGraphSaved"] }
```

### 注册节点并打开图

```ts
await Editor.Message.request('node-graph', 'register-port-types', [
  { typeName: 'ientity', color: '#33e680', compatibleWith: [] },
]);

await Editor.Message.request('node-graph', 'register-nodes', [
  {
    typeName: 'AbilityEntrance',
    title: '技能入口',
    category: 'Ability',
    color: '#4a90d9',
    inputs: [],
    outputs: [
      { name: 'OnCast', portType: 'GraphFlow' },
      { name: 'Target', portType: 'ientity' },
    ],
    fields: [
      { key: 'abilityId', label: 'Ability Id', type: 'int', default: 1001 },
    ],
  },
]);

await Editor.Message.request('node-graph', 'open-graph', {
  path: 'db://assets/graphs/Ability_1001.graph.json',
  profile: {
    name: 'ability',
    nodeFilter: {
      allowAll: false,
      whitelist: ['AbilityEntrance', 'FloatConst', 'Add', 'DebugLog', 'FlowStart'],
    },
  },
});
```

### 消息一览

| 消息 | 说明 |
|------|------|
| `open-graph` | `{ path?, graph?, profile? }` 打开并加载 |
| `register-nodes` | 注册 `NodeDefinition[]`（按 `typeName` 覆盖） |
| `register-port-types` | 注册端口类型 |
| `unregister-nodes` | 按 typeName 卸载 |
| `get-graph` / `set-graph` | 读写当前图 JSON |
| `save-graph` | `{ path? }` 保存 |
| `node-graph:graph-changed` | 广播：图被编辑 |
| `node-graph:graph-saved` | 广播：已保存 |

### NodeDefinition

```ts
interface NodeDefinition {
  typeName: string;
  title: string;
  category: string;
  color?: string;
  inputs: { name: string; portType: string }[];
  outputs: { name: string; portType: string }[];
  fields?: {
    key: string;
    label: string;
    type: 'number' | 'int' | 'string' | 'bool' | 'enum';
    default?: unknown;
    options?: { label: string; value: string | number | boolean }[];
  }[];
}
```

内置端口：`any` / `float` / `int` / `bool` / `string` / `GraphFlow`。

## 边界

- 本扩展 **不包含** 技能节点库、运行时导出、技能 CRUD
- 导出 / 校验 / 业务 Inspector 由消费方扩展自行实现
