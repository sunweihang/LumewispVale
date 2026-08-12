export interface PortDef {
  name: string;
  portType: string;
}

export type FieldType = 'number' | 'int' | 'string' | 'bool' | 'enum';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  default?: unknown;
  options?: { label: string; value: string | number | boolean }[];
  min?: number;
  max?: number;
  step?: number;
}

export interface NodeDefinition {
  typeName: string;
  title: string;
  category: string;
  color?: string;
  inputs: PortDef[];
  outputs: PortDef[];
  fields?: FieldDef[];
  minWidth?: number;
  minHeight?: number;
}

const Flow = 'GraphFlow';
const F = 'float';
const B = 'bool';
const S = 'string';
const Entity = 'entity';

const FLOW_IN: PortDef = { name: '前序', portType: Flow };
const FLOW_OUT: PortDef = { name: '后继', portType: Flow };

/** 对齐 Unity ModifierEntrance：挂载→OnSpawn / 每帧→OnTick / 卸下→OnDespawn */
export const ENTRANCE_LIFECYCLE_PORTS: {
  name: string;
  method: string;
  params?: string;
  alwaysEmit?: boolean;
}[] = [
  { name: '挂载', method: 'onSpawn' },
  { name: '每帧更新', method: 'onTick', params: 'delta: number' },
  { name: '卸下', method: 'onDespawn', alwaysEmit: true },
];

export const ENTRANCE_TYPE = 'ModifierEntranceBlueprint';

const ENTITY_STATE_OPTIONS = [
  { label: '无', value: 0 },
  { label: '硬直', value: 1 },
  { label: '死亡', value: 2 },
  { label: '施法中', value: 3 },
  { label: '无法移动', value: 4 },
  { label: '无法转向', value: 5 },
  { label: '无法攻击', value: 6 },
  { label: '击飞', value: 7 },
  { label: '自由施法', value: 8 },
];

export const MODIFIER_BUILTIN_NODE_DEFS: NodeDefinition[] = [
  {
    typeName: 'FloatConst',
    title: '浮点常量',
    category: '数学',
    color: '#2e8b57',
    minWidth: 160,
    minHeight: 96,
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT, { name: '值', portType: F }],
    fields: [{ key: 'value', label: '值', type: 'number', default: 0, step: 0.1 }],
  },
  {
    typeName: 'Add',
    title: '相加',
    category: '数学',
    color: '#2e8b57',
    inputs: [FLOW_IN, { name: 'A', portType: F }, { name: 'B', portType: F }],
    outputs: [FLOW_OUT, { name: '结果', portType: F }],
  },
  {
    typeName: 'Branch',
    title: '分支',
    category: '逻辑',
    color: '#8e44ad',
    inputs: [FLOW_IN, { name: '条件', portType: B }],
    outputs: [
      { name: '真', portType: Flow },
      { name: '假', portType: Flow },
    ],
  },
  {
    typeName: 'BoolConst',
    title: '布尔常量',
    category: '数学',
    color: '#2e8b57',
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT, { name: '值', portType: B }],
    fields: [{ key: 'value', label: '值', type: 'bool', default: true }],
  },
  {
    typeName: 'StringConst',
    title: '字符串常量',
    category: '数学',
    color: '#2e8b57',
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT, { name: '值', portType: S }],
    fields: [{ key: 'value', label: '值', type: 'string', default: '' }],
  },
  {
    typeName: 'DebugLog',
    title: '调试日志',
    category: '调试',
    color: '#7f8c8d',
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT],
    fields: [{ key: 'message', label: '消息', type: 'string', default: 'log' }],
  },
  {
    typeName: 'FloatCompareBranch',
    title: '浮点比较分支',
    category: '逻辑',
    color: '#8e44ad',
    inputs: [FLOW_IN, { name: 'A', portType: F }, { name: 'B', portType: F }],
    outputs: [
      { name: 'A≥B', portType: Flow },
      { name: 'A<B', portType: Flow },
    ],
  },
];

export const MODIFIER_NODE_DEFS: NodeDefinition[] = [
  {
    typeName: ENTRANCE_TYPE,
    title: 'Buff入口',
    category: 'Buff',
    color: '#c0392b',
    minWidth: 200,
    minHeight: 140,
    inputs: [],
    outputs: ENTRANCE_LIFECYCLE_PORTS.map((p) => ({ name: p.name, portType: Flow })),
  },
  {
    typeName: 'ModifierBuffTargetBlueprint',
    title: 'Buff目标',
    category: 'Buff',
    color: '#2980b9',
    minWidth: 180,
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT, { name: 'Buff目标', portType: Entity }],
  },
  {
    typeName: 'SetGameEntityStateBlueprint',
    title: '设置单位状态',
    category: 'Buff/单位',
    color: '#2d7a66',
    minWidth: 220,
    inputs: [FLOW_IN, { name: '单位', portType: Entity }],
    outputs: [FLOW_OUT],
    fields: [
      {
        key: 'entityState',
        label: '实体状态',
        type: 'enum',
        default: 7,
        options: ENTITY_STATE_OPTIONS,
      },
      { key: 'value', label: '为真', type: 'bool', default: true },
    ],
  },
  {
    // Cocos：击退位移表现（GameAssets 侧多为渲染层反应 KnockBack；玩法保留命中点方向）
    typeName: 'PlayKnockbackMotionBlueprint',
    title: '播放击退位移',
    category: 'Buff/表现',
    color: '#8c6bc7',
    minWidth: 200,
    inputs: [FLOW_IN, { name: '目标', portType: Entity }],
    outputs: [FLOW_OUT],
    fields: [
      { key: 'distance', label: '距离', type: 'number', default: 1, step: 0.1 },
      { key: 'duration', label: '时长(秒)', type: 'number', default: 0.1, step: 0.05 },
    ],
  },
];

export const BUILTIN_WHITELIST = MODIFIER_BUILTIN_NODE_DEFS.map((d) => d.typeName);

export function modifierNodeTypeNames(): string[] {
  return MODIFIER_NODE_DEFS.map((d) => d.typeName);
}

export function allModifierRegisterNodes(): NodeDefinition[] {
  return [...MODIFIER_NODE_DEFS, ...MODIFIER_BUILTIN_NODE_DEFS];
}

export function findModifierNodeDef(typeName: string): NodeDefinition | undefined {
  return allModifierRegisterNodes().find((d) => d.typeName === typeName);
}
