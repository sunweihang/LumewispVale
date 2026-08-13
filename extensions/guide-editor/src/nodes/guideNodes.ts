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

const FLOW_IN: PortDef = { name: '前序', portType: Flow };
const FLOW_OUT: PortDef = { name: '后继', portType: Flow };
/** Try* nodes: aimed = stop chain; miss = continue. */
const FLOW_AIMED: PortDef = { name: '已瞄准', portType: Flow };
const FLOW_MISS: PortDef = { name: '未命中', portType: Flow };

/** 引导入口：每帧解析当前箭头目标（sync）。 */
export const ENTRANCE_LIFECYCLE_PORTS: {
  name: string;
  method: string;
  params?: string;
  alwaysEmit?: boolean;
  async?: boolean;
}[] = [{ name: '解析', method: 'onResolve', async: false }];

export const ENTRANCE_TYPE = 'GuideEntranceBlueprint';

const TOOL_OPTS = [
  { label: '手', value: 'hand' },
  { label: '锄头', value: 'hoe' },
  { label: '种子', value: 'seeds' },
  { label: '水壶', value: 'can' },
  { label: '斧头', value: 'axe' },
  { label: '鱼竿', value: 'rod' },
  { label: '催熟剂', value: 'boost' },
];

const PLOT_OPTS = [
  { label: '荒地', value: 'soil' },
  { label: '翻好地', value: 'tilled' },
  { label: '待浇水', value: 'water' },
  { label: '生长中', value: 'grow' },
  { label: '可收获', value: 'harvest' },
];

const DECOR_OPTS = [
  { label: '杂草', value: 'grass' },
  { label: '石头', value: 'rock' },
  { label: '树', value: 'tree' },
  { label: '铜矿', value: 'copper' },
];

export const GUIDE_BUILTIN_NODE_DEFS: NodeDefinition[] = [
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

export const GUIDE_NODE_DEFS: NodeDefinition[] = [
  {
    typeName: ENTRANCE_TYPE,
    title: '引导入口',
    category: '引导',
    color: '#c0392b',
    minWidth: 220,
    minHeight: 120,
    inputs: [],
    outputs: ENTRANCE_LIFECYCLE_PORTS.map((p) => ({ name: p.name, portType: Flow })),
  },
  {
    typeName: 'TryBagToHotbarBlueprint',
    title: '尝试背包拖快捷栏',
    category: '引导/背包',
    color: '#2980b9',
    minWidth: 240,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
    fields: [
      { key: 'itemId', label: '物品', type: 'enum', default: 'hoe', options: TOOL_OPTS },
      { key: 'ensureHoe', label: '确保锄头入包', type: 'bool', default: false },
      {
        key: 'openTip',
        label: '打开提示',
        type: 'string',
        default: '露穗：点开背包，把工具拿出来',
      },
    ],
  },
  {
    typeName: 'TrySelectToolBlueprint',
    title: '尝试选中工具',
    category: '引导/快捷栏',
    color: '#2980b9',
    minWidth: 220,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
    fields: [
      { key: 'tool', label: '工具', type: 'enum', default: 'hoe', options: TOOL_OPTS },
    ],
  },
  {
    typeName: 'TryOpenBagBlueprint',
    title: '尝试打开背包',
    category: '引导/背包',
    color: '#2980b9',
    minWidth: 220,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
    fields: [
      { key: 'tip', label: '提示', type: 'string', default: '露穗：点开背包看看' },
    ],
  },
  {
    typeName: 'TryWorldPlotBlueprint',
    title: '尝试瞄准地块',
    category: '引导/世界',
    color: '#27ae60',
    minWidth: 220,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
    fields: [
      { key: 'plot', label: '地块', type: 'enum', default: 'soil', options: PLOT_OPTS },
      { key: 'tip', label: '提示', type: 'string', default: '露穗：点这里操作田地' },
    ],
  },
  {
    typeName: 'TryWorldDecorBlueprint',
    title: '尝试瞄准采集物',
    category: '引导/世界',
    color: '#27ae60',
    minWidth: 220,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
    fields: [
      { key: 'kind', label: '类型', type: 'enum', default: 'grass', options: DECOR_OPTS },
      { key: 'tip', label: '提示', type: 'string', default: '露穗：点这里采集' },
    ],
  },
  {
    typeName: 'TryWorldNodeBlueprint',
    title: '尝试瞄准世界节点',
    category: '引导/世界',
    color: '#27ae60',
    minWidth: 240,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
    fields: [
      { key: 'nodeName', label: '节点名', type: 'string', default: 'prop_craftbench' },
      { key: 'tip', label: '提示', type: 'string', default: '露穗：点这里' },
      { key: 'placeRipple', label: '地点光环', type: 'bool', default: true },
    ],
  },
  {
    typeName: 'TryFishBlueprint',
    title: '尝试钓鱼引导',
    category: '引导/世界',
    color: '#27ae60',
    minWidth: 200,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
  },
  {
    typeName: 'TryCraftBenchBlueprint',
    title: '尝试工作台引导',
    category: '引导/制作',
    color: '#d35400',
    minWidth: 220,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
  },
  {
    typeName: 'TryHarvestBoostBlueprint',
    title: '尝试催熟收获链',
    category: '引导/农场',
    color: '#16a085',
    minWidth: 220,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
  },
  {
    typeName: 'TryHintFarmBlueprint',
    title: '尝试农田翻种链',
    category: '引导/农场',
    color: '#16a085',
    minWidth: 220,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
  },
  {
    typeName: 'TryTownGateBlueprint',
    title: '尝试通往小镇',
    category: '引导/城镇',
    color: '#8e44ad',
    minWidth: 200,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
  },
  {
    typeName: 'TryMayorBlueprint',
    title: '尝试拜访镇长',
    category: '引导/城镇',
    color: '#8e44ad',
    minWidth: 200,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
  },
  {
    typeName: 'TryTownOutdoorBlueprint',
    title: '尝试城镇室外点',
    category: '引导/城镇',
    color: '#8e44ad',
    minWidth: 260,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
    fields: [
      {
        key: 'names',
        label: '节点名(逗号分隔)',
        type: 'string',
        default: 'bld_police,bld_post',
      },
      { key: 'nearTip', label: '近处提示', type: 'string', default: '点击目标' },
      { key: 'farTip', label: '远处提示', type: 'string', default: '往目标走' },
    ],
  },
  {
    typeName: 'TryIndoorOrDoorBlueprint',
    title: '尝试室内或大门',
    category: '引导/城镇',
    color: '#8e44ad',
    minWidth: 260,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
    fields: [
      { key: 'indoorName', label: '室内目标', type: 'string', default: 'npc_carpenter' },
      { key: 'doorName', label: '大门', type: 'string', default: 'bld_carpenter' },
      { key: 'indoorTip', label: '室内提示', type: 'string', default: '点目标打招呼' },
      { key: 'doorTip', label: '大门提示', type: 'string', default: '点大门进屋' },
      { key: 'farTip', label: '远处提示', type: 'string', default: '往目标走，点大门进屋' },
    ],
  },
  {
    typeName: 'TryMineCopperBlueprint',
    title: '尝试挖铜矿',
    category: '引导/矿洞',
    color: '#7f8c8d',
    minWidth: 200,
    inputs: [FLOW_IN],
    outputs: [FLOW_AIMED, FLOW_MISS],
  },
  {
    typeName: 'AimQuestDockBlueprint',
    title: '瞄准任务栏',
    category: '引导/UI',
    color: '#f39c12',
    minWidth: 200,
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT],
    fields: [
      { key: 'tip', label: '提示', type: 'string', default: '查看当前任务目标' },
    ],
  },
];

export const BUILTIN_WHITELIST = GUIDE_BUILTIN_NODE_DEFS.map((d) => d.typeName);

export function guideNodeTypeNames(): string[] {
  return GUIDE_NODE_DEFS.map((d) => d.typeName);
}

export function findGuideNodeDef(typeName: string): NodeDefinition | undefined {
  return (
    GUIDE_NODE_DEFS.find((n) => n.typeName === typeName) ||
    GUIDE_BUILTIN_NODE_DEFS.find((n) => n.typeName === typeName)
  );
}

export function allGuideRegisterNodes(): NodeDefinition[] {
  return [...GUIDE_NODE_DEFS, ...GUIDE_BUILTIN_NODE_DEFS];
}
