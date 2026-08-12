"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILTIN_WHITELIST = exports.STORY_NODE_DEFS = exports.STORY_BUILTIN_NODE_DEFS = exports.ENTRANCE_TYPE = exports.ENTRANCE_LIFECYCLE_PORTS = void 0;
exports.storyNodeTypeNames = storyNodeTypeNames;
exports.allStoryRegisterNodes = allStoryRegisterNodes;
exports.findStoryNodeDef = findStoryNodeDef;
const Flow = 'GraphFlow';
const F = 'float';
const B = 'bool';
const S = 'string';
const FLOW_IN = { name: '前序', portType: Flow };
const FLOW_OUT = { name: '后继', portType: Flow };
/** 剧情入口：开始 / 每帧 / 正常结束 / 中断 */
exports.ENTRANCE_LIFECYCLE_PORTS = [
    { name: '开始', method: 'onStart', async: true },
    { name: '每帧更新', method: 'onUpdate', params: 'delta: number', async: false },
    { name: '正常结束', method: 'onEnd', alwaysEmit: true, async: true },
    { name: '中断', method: 'onInterrupted', alwaysEmit: true, async: true },
];
exports.ENTRANCE_TYPE = 'StoryEntranceBlueprint';
exports.STORY_BUILTIN_NODE_DEFS = [
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
exports.STORY_NODE_DEFS = [
    {
        typeName: exports.ENTRANCE_TYPE,
        title: '剧情入口',
        category: '剧情',
        color: '#c0392b',
        minWidth: 220,
        minHeight: 180,
        inputs: [],
        outputs: exports.ENTRANCE_LIFECYCLE_PORTS.map((p) => ({ name: p.name, portType: Flow })),
    },
    {
        typeName: 'StartChatBlueprint',
        title: '播对话',
        category: '剧情/对话',
        color: '#2980b9',
        minWidth: 200,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
        fields: [{ key: 'chatId', label: '对话ID', type: 'int', default: 100, min: 1 }],
    },
    {
        typeName: 'WaitSecondsBlueprint',
        title: '等待秒数',
        category: '剧情/等待',
        color: '#16a085',
        minWidth: 180,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
        fields: [{ key: 'seconds', label: '秒', type: 'number', default: 1, min: 0, step: 0.1 }],
    },
    {
        typeName: 'WaitGameEventBlueprint',
        title: '等待事件',
        category: '剧情/等待',
        color: '#16a085',
        minWidth: 200,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
        fields: [{ key: 'eventName', label: '事件名', type: 'string', default: '' }],
    },
    {
        typeName: 'EmitGameEventBlueprint',
        title: '发送事件',
        category: '剧情/事件',
        color: '#d35400',
        minWidth: 200,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
        fields: [{ key: 'eventName', label: '事件名', type: 'string', default: '' }],
    },
    {
        typeName: 'SetFlagBlueprint',
        title: '设置Flag',
        category: '剧情/Flag',
        color: '#f39c12',
        minWidth: 200,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
        fields: [
            { key: 'flagKey', label: 'Flag键', type: 'string', default: 'flag' },
            { key: 'value', label: '值', type: 'bool', default: true },
        ],
    },
    {
        typeName: 'FlagBranchBlueprint',
        title: 'Flag分支',
        category: '剧情/Flag',
        color: '#f39c12',
        minWidth: 200,
        inputs: [FLOW_IN],
        outputs: [
            { name: '真', portType: Flow },
            { name: '假', portType: Flow },
        ],
        fields: [{ key: 'flagKey', label: 'Flag键', type: 'string', default: 'flag' }],
    },
    {
        typeName: 'LockPlayerInputBlueprint',
        title: '锁定玩家输入',
        category: '剧情/控制',
        color: '#8e44ad',
        minWidth: 180,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
    },
    {
        typeName: 'UnlockPlayerInputBlueprint',
        title: '解锁玩家输入',
        category: '剧情/控制',
        color: '#8e44ad',
        minWidth: 180,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
    },
    {
        typeName: 'CameraMoveToTargetBlueprint',
        title: '镜头移向目标',
        category: '剧情/镜头',
        color: '#1abc9c',
        minWidth: 220,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
        fields: [
            { key: 'nodePath', label: '节点路径', type: 'string', default: '' },
            { key: 'duration', label: '缓动秒数(0=瞬切)', type: 'number', default: 1.2, step: 0.1 },
        ],
    },
    {
        typeName: 'CameraShakeBlueprint',
        title: '镜头震动',
        category: '剧情/镜头',
        color: '#1abc9c',
        minWidth: 160,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
    },
    {
        typeName: 'CameraLockPlayerBlueprint',
        title: '镜头锁回玩家',
        category: '剧情/镜头',
        color: '#1abc9c',
        minWidth: 200,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
        fields: [
            { key: 'duration', label: '缓动秒数(0=瞬切)', type: 'number', default: 0, step: 0.1 },
        ],
    },
    {
        typeName: 'PlayAnimationBlueprint',
        title: '播放动画',
        category: '剧情/演出',
        color: '#9b59b6',
        minWidth: 220,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
        fields: [
            { key: 'targetPath', label: '目标路径', type: 'string', default: '' },
            { key: 'paramName', label: '参数名', type: 'string', default: '' },
            { key: 'paramValue', label: '参数值', type: 'number', default: 1, step: 1 },
        ],
    },
    {
        typeName: 'PlayParticleEffectBlueprint',
        title: '播放特效',
        category: '剧情/演出',
        color: '#9b59b6',
        minWidth: 200,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
        fields: [{ key: 'prefabName', label: 'Prefab名', type: 'string', default: '' }],
    },
    {
        // → AudioSystem.play(clipName)
        typeName: 'PlayAudioOneShotBlueprint',
        title: '播放音效',
        category: '剧情/演出',
        color: '#9b59b6',
        minWidth: 200,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
        fields: [{ key: 'clipName', label: '音效名', type: 'string', default: '' }],
    },
    {
        typeName: 'BossPlayAppearShowBlueprint',
        title: 'Boss爬出演出',
        category: '剧情/Boss',
        color: '#e74c3c',
        minWidth: 220,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
        fields: [
            {
                key: 'bossPath',
                label: 'Boss路径',
                type: 'string',
                default: '606/Enemy04',
            },
        ],
    },
    {
        typeName: 'BossStartCombatBlueprint',
        title: 'Boss开始战斗',
        category: '剧情/Boss',
        color: '#e74c3c',
        minWidth: 220,
        inputs: [FLOW_IN],
        outputs: [FLOW_OUT],
        fields: [
            {
                key: 'bossPath',
                label: 'Boss路径',
                type: 'string',
                default: '606/Enemy04',
            },
        ],
    },
    {
        typeName: 'StoryEndBlueprint',
        title: '结束剧情',
        category: '剧情',
        color: '#c0392b',
        minWidth: 160,
        inputs: [FLOW_IN],
        outputs: [],
    },
];
exports.BUILTIN_WHITELIST = exports.STORY_BUILTIN_NODE_DEFS.map((d) => d.typeName);
function storyNodeTypeNames() {
    return exports.STORY_NODE_DEFS.map((d) => d.typeName);
}
function allStoryRegisterNodes() {
    return [...exports.STORY_NODE_DEFS, ...exports.STORY_BUILTIN_NODE_DEFS];
}
function findStoryNodeDef(typeName) {
    return allStoryRegisterNodes().find((d) => d.typeName === typeName);
}
//# sourceMappingURL=storyNodes.js.map