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
const I = 'int';
const B = 'bool';
const S = 'string';
const Entity = 'entity';
const EntityList = 'entityList';
const V3 = 'vec3';
const Ballistic = 'ballistic';

const FLOW_IN: PortDef = { name: '前序', portType: Flow };
const FLOW_OUT: PortDef = { name: '后继', portType: Flow };

/** 对齐 Unity BallisticEntranceBlueprint：OnSpawn / OnTick / OnDespawn */
export const ENTRANCE_LIFECYCLE_PORTS: {
  name: string;
  method: string;
  params?: string;
  alwaysEmit?: boolean;
}[] = [
  { name: '出生', method: 'onSpawn' },
  { name: '每帧', method: 'onTick', params: 'delta: number' },
  { name: '销毁', method: 'onDespawn', alwaysEmit: true },
];

export const ENTRANCE_TYPE = 'BallisticEntranceBlueprint';

export const BALLISTIC_BUILTIN_NODE_DEFS: NodeDefinition[] = [
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
    color: '#c44',
    inputs: [FLOW_IN, { name: '条件', portType: B }],
    outputs: [
      { name: '真', portType: Flow },
      { name: '假', portType: Flow },
    ],
  },
  {
    typeName: 'BoolConst',
    title: '布尔常量',
    category: '逻辑',
    color: '#c44',
    minHeight: 96,
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT, { name: '值', portType: B }],
    fields: [{ key: 'value', label: '值', type: 'bool', default: true }],
  },
  {
    typeName: 'DebugLog',
    title: '调试日志',
    category: '工具',
    color: '#888',
    inputs: [FLOW_IN, { name: '消息', portType: S }],
    outputs: [FLOW_OUT],
    fields: [{ key: 'message', label: '消息', type: 'string', default: 'hello' }],
  },
  {
    typeName: 'StringConst',
    title: '字符串常量',
    category: '工具',
    color: '#888',
    minHeight: 96,
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT, { name: '值', portType: S }],
    fields: [{ key: 'value', label: '值', type: 'string', default: '' }],
  },
];

export const BALLISTIC_NODE_DEFS: NodeDefinition[] = [
  {
    typeName: ENTRANCE_TYPE,
    title: '弹道入口',
    category: '弹道/入口',
    color: '#598cc9',
    minWidth: 200,
    minHeight: 160,
    inputs: [],
    outputs: ENTRANCE_LIFECYCLE_PORTS.map((p) => ({ name: p.name, portType: Flow })),
  },
  {
    typeName: 'BallisticLinearMoveBlueprint',
    title: '匀速直线推进',
    category: '弹道/运动',
    color: '#2980b9',
    inputs: [FLOW_IN, { name: '速度', portType: F }],
    outputs: [FLOW_OUT],
    fields: [{ key: 'defaultSpeed', label: '默认速度', type: 'number', default: 20, step: 0.5 }],
  },
  {
    // 对齐 Bullet07.anim 局部轨迹（非直线折返）；穿透命中由技能图结算
    typeName: 'BallisticBoomerangMoveBlueprint',
    title: '回旋推进',
    category: '弹道/运动',
    color: '#2980b9',
    minWidth: 220,
    inputs: [FLOW_IN, { name: '路径缩放', portType: F }],
    outputs: [FLOW_OUT],
    fields: [
      {
        key: 'defaultPathScale',
        label: '默认路径缩放',
        type: 'number',
        default: 1,
        step: 0.1,
        min: 0.1,
      },
    ],
  },
  {
    // 对齐 BulletMissile：二次贝塞尔 + 侧向 mid + 锁敌
    typeName: 'BallisticBezierHomingMoveBlueprint',
    title: '贝塞尔追踪推进',
    category: '弹道/运动',
    color: '#2980b9',
    minWidth: 220,
    inputs: [
      FLOW_IN,
      { name: '进度速率', portType: F },
      { name: '侧向散开', portType: F },
    ],
    outputs: [FLOW_OUT],
    fields: [
      { key: 'defaultProgressRate', label: '默认进度速率', type: 'number', default: 2, step: 0.1 },
      { key: 'defaultLateralSpread', label: '默认侧向散开', type: 'number', default: 7, step: 0.5 },
      { key: 'targetYOffset', label: '目标Y偏移', type: 'number', default: 1, step: 0.1 },
    ],
  },
  {
    // 对齐 BulletMissile.explodeDistance：近距引爆锁定目标
    typeName: 'BallisticLockTargetProximityBlueprint',
    title: '锁定目标近距判定',
    category: '弹道/寻怪',
    color: '#e74c3c',
    minWidth: 220,
    inputs: [FLOW_IN, { name: '爆炸距离', portType: F }],
    outputs: [
      FLOW_OUT,
      { name: '目标列表', portType: EntityList },
      { name: '列表数量', portType: I },
    ],
    fields: [
      { key: 'defaultExplodeDistance', label: '默认爆炸距离', type: 'number', default: 1, step: 0.1 },
    ],
  },
  {
    typeName: 'BallisticSetBulletDirectionBlueprint',
    title: '设置飞行朝向',
    category: '弹道/运动',
    color: '#2980b9',
    inputs: [FLOW_IN, { name: '朝向', portType: V3 }],
    outputs: [FLOW_OUT],
  },
  {
    typeName: 'BallisticLookAtTargetBlueprint',
    title: '朝向目标',
    category: '弹道/运动',
    color: '#2980b9',
    inputs: [FLOW_IN, { name: '目标', portType: Entity }],
    outputs: [FLOW_OUT, { name: '朝向', portType: V3 }],
  },
  {
    typeName: 'BallisticGetBulletPositionBlueprint',
    title: '子弹坐标',
    category: '弹道/运动',
    color: '#1abc9c',
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT, { name: '坐标', portType: V3 }],
  },
  {
    typeName: 'BallisticElapsedSecondsBlueprint',
    title: '已飞行秒数',
    category: '弹道/运动',
    color: '#1abc9c',
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT, { name: '秒', portType: F }],
  },
  {
    typeName: 'BallisticReleaseBulletBlueprint',
    title: '回收子弹',
    category: '弹道/生命周期',
    color: '#7f8c8d',
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT],
  },
  {
    typeName: 'FindTargetByTravelSegmentBlueprint',
    title: '线段扫掠寻怪',
    category: '弹道/寻怪',
    color: '#e74c3c',
    minWidth: 200,
    inputs: [
      FLOW_IN,
      { name: '命中半径', portType: F },
      { name: '寻怪数量', portType: I },
    ],
    outputs: [
      FLOW_OUT,
      { name: '目标列表', portType: EntityList },
      { name: '列表数量', portType: I },
    ],
    fields: [
      { key: 'defaultRadius', label: '默认半径', type: 'number', default: 0.6, step: 0.1 },
      { key: 'defaultCount', label: '默认数量', type: 'int', default: 1 },
    ],
  },
  {
    typeName: 'ForeachTargetBlueprint',
    title: '遍历目标',
    category: '弹道/寻怪',
    color: '#d35400',
    inputs: [FLOW_IN, { name: '目标列表', portType: EntityList }],
    outputs: [
      { name: '循环体', portType: Flow },
      { name: '循环结束', portType: Flow },
      { name: '当前目标', portType: Entity },
    ],
  },
  {
    typeName: 'ApplyDamageBlueprint',
    title: '造成伤害',
    category: '弹道/战斗',
    color: '#c0392b',
    inputs: [FLOW_IN, { name: '目标', portType: Entity }, { name: '威力系数', portType: F }],
    outputs: [FLOW_OUT],
  },
  {
    typeName: 'AbilityDebugLog',
    title: '弹道调试日志',
    category: '弹道/工具',
    color: '#7f8c8d',
    inputs: [FLOW_IN, { name: '消息', portType: S }],
    outputs: [FLOW_OUT],
    fields: [{ key: 'message', label: '消息', type: 'string', default: 'ballistic log' }],
  },
  {
    typeName: 'FloatCompareBranch',
    title: '浮点比较分支',
    category: '弹道/逻辑',
    color: '#c0392b',
    inputs: [FLOW_IN, { name: 'A', portType: F }, { name: 'B', portType: F }],
    outputs: [
      { name: '大于', portType: Flow },
      { name: '等于', portType: Flow },
      { name: '小于', portType: Flow },
    ],
  },
  {
    // 嵌套发射（与技能图同名节点，弹道图内可再开火）
    typeName: 'BallisticFireBulletBlueprint',
    title: '发射子弹',
    category: '弹道/发射',
    color: '#385c9e',
    minWidth: 200,
    inputs: [
      FLOW_IN,
      { name: '弹道模板', portType: I },
      { name: '出生坐标', portType: V3 },
      { name: '朝向', portType: V3 },
    ],
    outputs: [FLOW_OUT, { name: '命中出口', portType: Flow }, { name: '子弹', portType: Ballistic }],
    fields: [
      { key: 'prefab', label: '表现 Prefab', type: 'string', default: 'Bullet01' },
      { key: 'lifetimeSec', label: '寿命(秒)', type: 'number', default: 2, step: 0.1 },
      { key: 'defaultSpeed', label: '默认速度', type: 'number', default: 20, step: 0.5 },
    ],
  },
];

export const BUILTIN_WHITELIST = [
  'FloatConst',
  'Add',
  'Branch',
  'BoolConst',
  'StringConst',
  'DebugLog',
];

export function ballisticNodeTypeNames(): string[] {
  return BALLISTIC_NODE_DEFS.map((d) => d.typeName);
}

export function allBallisticRegisterNodes(): NodeDefinition[] {
  return [...BALLISTIC_NODE_DEFS, ...BALLISTIC_BUILTIN_NODE_DEFS];
}

export function findBallisticNodeDef(typeName: string): NodeDefinition | undefined {
  return (
    BALLISTIC_NODE_DEFS.find((d) => d.typeName === typeName) ||
    BALLISTIC_BUILTIN_NODE_DEFS.find((d) => d.typeName === typeName)
  );
}
