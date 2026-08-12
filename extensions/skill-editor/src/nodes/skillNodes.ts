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

const FLOW_IN: PortDef = { name: '前序', portType: Flow };
const FLOW_OUT: PortDef = { name: '后继', portType: Flow };

/** 与运行时 EnumSlot / EnumSlotInspector 中文标签对齐 */
const ENUM_SLOT_OPTIONS: { label: string; value: number }[] = [
  { label: 'HUD', value: 0 },
  { label: '根节点', value: 1 },
  { label: '受击点', value: 2 },
  { label: '左手武器', value: 3 },
  { label: '右手武器', value: 4 },
  { label: '头盔', value: 5 },
  { label: '头部', value: 6 },
  { label: '左手腕', value: 7 },
  { label: '右手腕', value: 8 },
  { label: '脊柱', value: 9 },
  { label: '骨盆', value: 10 },
  { label: '左手', value: 11 },
  { label: '右手', value: 12 },
  { label: '根骨骼', value: 13 },
  { label: '枪', value: 14 },
  { label: '炮塔点', value: 15 },
  { label: '枪口', value: 16 },
  { label: '开火点', value: 17 },
  { label: '等级牌', value: 18 },
  { label: '枪口1', value: 19 },
  { label: '枪口2', value: 20 },
  { label: '前方', value: 21 },
  { label: '主躯干', value: 22 },
];

/** Unity AbilityEntranceBlueprint 对齐：中文端口名 + 导出方法（顺序不可改）。 */
export const ENTRANCE_LIFECYCLE_PORTS: { name: string; method: string; params?: string; alwaysEmit?: boolean }[] = [
  { name: '技能安装', method: 'onInstall' },
  { name: '技能激活', method: 'onActive' },
  { name: '技能取消激活', method: 'onUnActive' },
  { name: '预寻怪', method: 'onPreFindTarget' },
  { name: '施法成功', method: 'onCastSuccess' },
  { name: '抬手阶段', method: 'onPhase' },
  { name: '引导开始', method: 'onChanneling' },
  { name: '引导周期触发', method: 'onChannelThink', params: 'interval: number' },
  { name: '释放开始', method: 'onSpellStart' },
  { name: '释放结束', method: 'onSpellEnd' },
  { name: '技能卸载', method: 'onUninstall', alwaysEmit: true },
  { name: '施法者死亡', method: 'onCasterDead' },
  { name: '技能被打断', method: 'onInterrupted', params: 'reason: number, interruptedState: number' },
  { name: '每帧更新', method: 'onUpdate', params: 'delta: number' },
  { name: '配置刷新', method: 'onConfigUpdated' },
];

export const ENTRANCE_TYPE = 'AbilityEntranceBlueprint';
export const PLAY_ANIMATION_TYPE = 'PlayAnimationBlueprint';

/** 覆盖 node-graph 内置节点：统一前序/后继 + 中文。 */
export const SKILL_BUILTIN_NODE_DEFS: NodeDefinition[] = [
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
    typeName: 'Vec3Negate',
    title: '向量取反',
    category: '数学',
    color: '#2e8b57',
    inputs: [FLOW_IN, { name: '向量', portType: V3 }],
    outputs: [FLOW_OUT, { name: '结果', portType: V3 }],
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

export const SKILL_NODE_DEFS: NodeDefinition[] = [
  {
    typeName: ENTRANCE_TYPE,
    title: '技能入口',
    category: '技能/入口',
    color: '#598cc9',
    minWidth: 220,
    minHeight: 320,
    // 入口仅生命周期出口（顺序对齐 Unity 导出），不加前序以免打乱下标
    inputs: [],
    outputs: ENTRANCE_LIFECYCLE_PORTS.map((p) => ({ name: p.name, portType: Flow })),
  },
  {
    typeName: 'AbilityCaster',
    title: '施法者',
    category: '技能/实体',
    color: '#e67e22',
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT, { name: '施法者', portType: Entity }],
  },
  {
    typeName: 'EntityPositionBlueprint',
    title: '实体坐标',
    category: '技能/实体',
    color: '#1abc9c',
    inputs: [FLOW_IN, { name: '实体', portType: Entity }],
    outputs: [FLOW_OUT, { name: '坐标', portType: V3 }],
  },
  {
    typeName: 'EntityForwardBlueprint',
    title: '实体朝向',
    category: '技能/实体',
    color: '#1abc9c',
    inputs: [FLOW_IN, { name: '实体', portType: Entity }],
    outputs: [FLOW_OUT, { name: '朝向', portType: V3 }],
  },
  {
    // 对齐 GameAsset EntityBoneWorldPositionBlueprint：挂点世界坐标 = p + r * localOffset
    typeName: 'EntityBoneWorldPositionBlueprint',
    title: '骨骼世界坐标',
    category: '技能/实体',
    color: '#1abc9c',
    minWidth: 220,
    inputs: [FLOW_IN, { name: '目标单位', portType: Entity }],
    outputs: [FLOW_OUT, { name: '世界坐标', portType: V3 }],
    fields: [
      {
        key: 'bone',
        label: '挂点',
        type: 'enum',
        default: 17,
        options: ENUM_SLOT_OPTIONS,
      },
      { key: 'localOffsetX', label: '局部偏移 X', type: 'number', default: 0, step: 0.1 },
      { key: 'localOffsetY', label: '局部偏移 Y', type: 'number', default: 0, step: 0.1 },
      { key: 'localOffsetZ', label: '局部偏移 Z', type: 'number', default: 0, step: 0.1 },
    ],
  },
  {
    typeName: 'FindTargetByCircleBlueprint',
    title: '圆形寻怪',
    category: '技能/寻怪',
    color: '#e74c3c',
    inputs: [
      FLOW_IN,
      { name: '中心坐标', portType: V3 },
      { name: '半径', portType: F },
      { name: '寻怪数量', portType: I },
    ],
    outputs: [
      FLOW_OUT,
      { name: '目标列表', portType: EntityList },
      { name: '列表数量', portType: I },
    ],
  },
  {
    typeName: 'FindTargetBySectorBlueprint',
    title: '扇形寻怪',
    category: '技能/寻怪',
    color: '#c0392b',
    inputs: [
      FLOW_IN,
      { name: '中心坐标', portType: V3 },
      { name: '半径', portType: F },
      { name: '寻怪数量', portType: I },
      { name: '开角(度)', portType: F },
    ],
    outputs: [
      FLOW_OUT,
      { name: '目标列表', portType: EntityList },
      { name: '列表数量', portType: I },
    ],
  },
  {
    typeName: 'ForeachTargetBlueprint',
    title: '遍历目标',
    category: '技能/寻怪',
    color: '#d35400',
    inputs: [FLOW_IN, { name: '目标列表', portType: EntityList }],
    outputs: [
      { name: '循环体', portType: Flow },
      { name: '循环结束', portType: Flow },
      { name: '当前目标', portType: Entity },
    ],
  },
  {
    typeName: 'CastTargetEntityBlueprint',
    title: '设定施法目标',
    category: '技能/寻怪',
    color: '#e67e22',
    inputs: [FLOW_IN, { name: '目标', portType: Entity }],
    outputs: [FLOW_OUT],
  },
  {
    typeName: 'AbilityCurrentSkillTargetBlueprint',
    title: '当前技能目标',
    category: '技能/寻怪',
    color: '#e67e22',
    inputs: [FLOW_IN],
    outputs: [
      { name: '有目标', portType: Flow },
      { name: '无目标', portType: Flow },
      { name: '目标', portType: Entity },
    ],
  },
  {
    typeName: PLAY_ANIMATION_TYPE,
    title: '播放动画',
    category: '技能/动画',
    color: '#8e44ad',
    minWidth: 200,
    inputs: [FLOW_IN],
    outputs: [
      FLOW_OUT,
      { name: '打击点[0]', portType: Flow },
      { name: '打击点[1]', portType: Flow },
      { name: '打击点[2]', portType: Flow },
    ],
    fields: [
      { key: 'paramName', label: '参数名', type: 'string', default: 'isattack' },
      { key: 'paramValue', label: '参数值', type: 'number', default: 1, step: 1 },
      {
        key: 'hitTimes',
        label: '打击点时间(秒,CSV，空=无)',
        type: 'string',
        default: '0.1',
      },
      {
        key: 'sticky',
        label: '粘性姿态(引导不清零)',
        type: 'bool',
        default: false,
      },
    ],
  },
  {
    // 对齐 BulletController 受击出伤；击退走 ApplyModifier / KnockBack 状态
    typeName: 'ApplyDamageBlueprint',
    title: '造成伤害',
    category: '技能/战斗',
    color: '#c0392b',
    minWidth: 180,
    inputs: [
      FLOW_IN,
      { name: '目标', portType: Entity },
      { name: '威力系数', portType: F },
      { name: '命中点', portType: V3 },
    ],
    outputs: [FLOW_OUT],
  },
  {
    // 对齐 GameAsset SetGameEntityStateBlueprint：单位状态引用计数写入
    typeName: 'SetGameEntityStateBlueprint',
    title: '设置单位状态',
    category: '技能/单位',
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
        options: [
          { label: '无', value: 0 },
          { label: '硬直', value: 1 },
          { label: '死亡', value: 2 },
          { label: '施法中', value: 3 },
          { label: '无法移动', value: 4 },
          { label: '无法转向', value: 5 },
          { label: '无法攻击', value: 6 },
          { label: '击飞', value: 7 },
          { label: '自由施法', value: 8 },
        ],
      },
      { key: 'value', label: '为真', type: 'bool', default: true },
    ],
  },
  {
    // 对齐 GameAsset ApplyModifierBlueprint：按模板挂载 Buff；命中点为 Cocos 扩展（击退方向）
    typeName: 'ApplyModifierBlueprint',
    title: '挂载Buff',
    category: '技能/Buff',
    color: '#6b8cc8',
    minWidth: 240,
    minHeight: 160,
    inputs: [
      FLOW_IN,
      { name: '模板Id', portType: I },
      { name: '配置Id', portType: I },
      { name: '目标', portType: Entity },
      { name: '持续时间(秒)', portType: F },
      { name: '命中点', portType: V3 },
    ],
    outputs: [FLOW_OUT],
    fields: [
      { key: 'templateId', label: '默认模板Id', type: 'int', default: 200000001 },
      { key: 'configId', label: '默认配置Id', type: 'int', default: 200000001 },
      { key: 'durationSeconds', label: '默认持续(秒)', type: 'number', default: 0.1, step: 0.05 },
    ],
  },
  {
    // 对齐 GameAsset BallisticFireBulletBlueprint 固定口：出生坐标 / 朝向（挂点由上游「骨骼世界坐标」解算）
    typeName: 'FireProjectileBlueprint',
    title: '发射子弹',
    category: '技能/战斗',
    color: '#2980b9',
    minWidth: 200,
    inputs: [
      FLOW_IN,
      { name: '目标', portType: Entity },
      { name: '出生坐标', portType: V3 },
      { name: '朝向', portType: V3 },
    ],
    outputs: [FLOW_OUT],
    fields: [
      { key: 'prefab', label: '子弹 Prefab', type: 'string', default: 'Bullet01' },
      { key: 'yOffset', label: '目标 Y 偏移', type: 'number', default: 1, step: 0.1 },
    ],
  },
  {
    // 对齐 GameAsset BallisticFireBulletBlueprint：
    // 「命中出口」+「当前命中单位」+「命中坐标」= 去重首次命中时触发的技能侧子图
    typeName: 'BallisticFireBulletBlueprint',
    title: '发射子弹',
    category: '技能/战斗',
    color: '#385c9e',
    minWidth: 240,
    minHeight: 248,
    inputs: [
      FLOW_IN,
      { name: '弹道模板', portType: I },
      { name: '出生坐标', portType: V3 },
      { name: '朝向', portType: V3 },
      { name: '目标', portType: Entity },
    ],
    outputs: [
      FLOW_OUT,
      { name: '命中出口', portType: Flow },
      { name: '命中列表', portType: EntityList },
      { name: '列表数量', portType: I },
      { name: '当前命中单位', portType: Entity },
      { name: '命中坐标', portType: V3 },
    ],
    fields: [
      { key: 'ballisticTemplate', label: '默认弹道模板', type: 'int', default: 100000000 },
      { key: 'prefab', label: '表现 Prefab', type: 'string', default: 'Bullet01' },
      { key: 'lifetimeSec', label: '寿命(秒)', type: 'number', default: 2, step: 0.1 },
      { key: 'defaultSpeed', label: '默认速度', type: 'number', default: 20, step: 0.5 },
    ],
  },
  {
    // 瞬时激光：生成 cc.Line 光束连接攻击方→目标，命中出口后按时长销毁
    typeName: 'FireLaserBlueprint',
    title: '发射激光',
    category: '技能/战斗',
    color: '#e67e22',
    minWidth: 220,
    minHeight: 200,
    inputs: [
      FLOW_IN,
      { name: '目标', portType: Entity },
      { name: '起点坐标', portType: V3 },
    ],
    outputs: [
      FLOW_OUT,
      { name: '命中出口', portType: Flow },
      { name: '当前命中单位', portType: Entity },
      { name: '命中坐标', portType: V3 },
      { name: '光束实例', portType: Entity },
    ],
    fields: [
      { key: 'prefab', label: '激光 Prefab', type: 'string', default: 'Laser01' },
      { key: 'yOffset', label: '目标 Y 偏移', type: 'number', default: 1, step: 0.1 },
      {
        key: 'durationSec',
        label: '可见时长(秒)',
        type: 'number',
        default: 0.15,
        step: 0.05,
        min: 0,
      },
    ],
  },
  {
    typeName: 'SpawnPrefab',
    title: '生成预制体',
    category: '技能/生成',
    color: '#27ae60',
    minWidth: 200,
    inputs: [
      FLOW_IN,
      { name: '高度偏移', portType: F },
      { name: '世界坐标', portType: V3 },
    ],
    outputs: [FLOW_OUT],
    fields: [
      { key: 'prefab', label: 'Prefab', type: 'string', default: '' },
      { key: 'sfxPrefab', label: 'SFX Prefab', type: 'string', default: '' },
      {
        key: 'parentSlot',
        label: '父挂点',
        type: 'enum',
        default: -1,
        options: [{ label: '无(世界)', value: -1 }, ...ENUM_SLOT_OPTIONS],
      },
    ],
  },
  {
    // 僚机：生成 + 图驱动跟随；开火请另接 ScheduleRepeating + FireProjectile
    typeName: 'StartFollower',
    title: '启动僚机',
    category: '技能/生成',
    color: '#27ae60',
    minWidth: 220,
    inputs: [
      FLOW_IN,
      { name: '高度偏移', portType: F },
      { name: '世界坐标', portType: V3 },
    ],
    outputs: [FLOW_OUT, { name: '僚机', portType: Entity }],
    fields: [
      { key: 'prefab', label: 'Prefab', type: 'string', default: 'Follower01' },
      { key: 'sfxPrefab', label: 'SFX Prefab', type: 'string', default: 'SFX_BoomShow' },
      {
        key: 'activateDelay',
        label: '跟随延迟(秒)',
        type: 'number',
        default: 3,
        step: 0.1,
        min: 0,
      },
    ],
  },
  {
    typeName: 'StopFollower',
    title: '停止僚机',
    category: '技能/生成',
    color: '#c0392b',
    minWidth: 200,
    inputs: [FLOW_IN, { name: '僚机', portType: Entity }],
    outputs: [FLOW_OUT],
    fields: [
      {
        key: 'destroy',
        label: '销毁实体',
        type: 'bool',
        default: true,
      },
    ],
  },
  {
    // 对齐 GameAsset PlayParticleEffectBlueprint：目标挂点上播放粒子（Cocos 用 Prefab 名代替 AssetId）
    typeName: 'PlayParticleEffectBlueprint',
    title: '播放特效',
    category: '技能/特效',
    color: '#8c6bc7',
    minWidth: 240,
    minHeight: 280,
    inputs: [FLOW_IN, { name: '目标', portType: Entity }],
    outputs: [FLOW_OUT, { name: '特效实例', portType: Entity }],
    fields: [
      { key: 'prefab', label: '特效 Prefab', type: 'string', default: '' },
      { key: 'delayTime', label: '延时(秒)', type: 'number', default: 0, step: 0.05 },
      {
        key: 'bone',
        label: '挂点',
        type: 'enum',
        default: 17,
        options: ENUM_SLOT_OPTIONS,
      },
      { key: 'localOffsetX', label: '位置 X', type: 'number', default: 0, step: 0.1 },
      { key: 'localOffsetY', label: '位置 Y', type: 'number', default: 0, step: 0.1 },
      { key: 'localOffsetZ', label: '位置 Z', type: 'number', default: 0, step: 0.1 },
      { key: 'eulerX', label: '欧拉角 X', type: 'number', default: 0, step: 1 },
      { key: 'eulerY', label: '欧拉角 Y', type: 'number', default: 0, step: 1 },
      { key: 'eulerZ', label: '欧拉角 Z', type: 'number', default: 0, step: 1 },
      { key: 'scale', label: '缩放', type: 'number', default: 1, step: 0.1 },
    ],
  },
  {
    // → AudioSystem.play(clipName)
    typeName: 'PlayAudioOneShotBlueprint',
    title: '播放音效',
    category: '技能/特效',
    color: '#8c6bc7',
    minWidth: 200,
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT],
    fields: [
      { key: 'clipName', label: '音频名', type: 'string', default: '' },
    ],
  },
  {
    typeName: 'FlipFlopBlueprint',
    title: '交替分支',
    category: '技能/逻辑',
    color: '#8e44ad',
    minWidth: 160,
    inputs: [FLOW_IN],
    outputs: [
      { name: '出口A', portType: Flow },
      { name: '出口B', portType: Flow },
    ],
    fields: [
      { key: 'key', label: '状态Key', type: 'string', default: 'flipflop' },
    ],
  },
  {
    typeName: 'ScheduleRepeating',
    title: '周期调度',
    category: '技能/调度',
    color: '#2980b9',
    inputs: [FLOW_IN, { name: '间隔', portType: F }],
    outputs: [FLOW_OUT, { name: '周期触发', portType: Flow }],
    fields: [
      { key: 'immediate', label: '立即触发一次', type: 'bool', default: true },
    ],
  },
  {
    // 对齐 PlayerController.schedule(fn, interval, repeat)：共 repeat+1 次
    typeName: 'ScheduleBurst',
    title: '齐射调度',
    category: '技能/调度',
    color: '#2980b9',
    inputs: [FLOW_IN, { name: '间隔', portType: F }],
    outputs: [FLOW_OUT, { name: '周期触发', portType: Flow }],
    fields: [
      { key: 'key', label: '状态Key', type: 'string', default: 'burst' },
      { key: 'repeat', label: '额外次数', type: 'int', default: 10, min: 0 },
    ],
  },
  {
    typeName: 'GetSkillLevel',
    title: '获取技能等级',
    category: '技能/数据',
    color: '#16a085',
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT, { name: '等级', portType: I }],
  },
  {
    typeName: 'GetConfigNumber',
    title: '读取配置数值',
    category: '技能/数据',
    color: '#16a085',
    inputs: [FLOW_IN],
    outputs: [FLOW_OUT, { name: '值', portType: F }],
    fields: [
      { key: 'key', label: '字段 Key', type: 'string', default: 'intervalSec' },
      { key: 'defaultValue', label: '默认值', type: 'number', default: 0, step: 0.1 },
    ],
  },
  {
    typeName: 'AbilityDebugLog',
    title: '技能调试日志',
    category: '技能/工具',
    color: '#7f8c8d',
    inputs: [FLOW_IN, { name: '消息', portType: S }],
    outputs: [FLOW_OUT],
    fields: [
      { key: 'message', label: '消息', type: 'string', default: 'ability log' },
    ],
  },
  {
    typeName: 'FloatCompareBranch',
    title: '浮点比较分支',
    category: '技能/逻辑',
    color: '#c0392b',
    inputs: [FLOW_IN, { name: 'A', portType: F }, { name: 'B', portType: F }],
    outputs: [
      { name: '大于', portType: Flow },
      { name: '等于', portType: Flow },
      { name: '小于', portType: Flow },
    ],
  },
  {
    // 概率门：Math.random() < 概率 走「成功」，否则「失败」。未接概率口时用字段默认值。
    typeName: 'RandomChanceBranchBlueprint',
    title: '随机概率分支',
    category: '技能/逻辑',
    color: '#8e44ad',
    minWidth: 200,
    inputs: [FLOW_IN, { name: '概率', portType: F }],
    outputs: [
      { name: '成功', portType: Flow },
      { name: '失败', portType: Flow },
    ],
    fields: [
      {
        key: 'chance',
        label: '默认概率',
        type: 'number',
        default: 0.1,
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
  },
];

export const BUILTIN_WHITELIST = [
  'FloatConst',
  'Add',
  'Vec3Negate',
  'Branch',
  'BoolConst',
  'StringConst',
  'DebugLog',
];

export function skillNodeTypeNames(): string[] {
  return SKILL_NODE_DEFS.map((d) => d.typeName);
}

export function allSkillRegisterNodes(): NodeDefinition[] {
  return [...SKILL_NODE_DEFS, ...SKILL_BUILTIN_NODE_DEFS];
}
