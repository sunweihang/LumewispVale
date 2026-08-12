import { PortTypeRegistry } from '../core/PortTypeRegistry';
import type { NodeDefinition } from './types';

const F = PortTypeRegistry.Float;
const B = PortTypeRegistry.Bool;
const S = PortTypeRegistry.String;
const Flow = PortTypeRegistry.GraphFlow;

export const BUILTIN_NODES: NodeDefinition[] = [
  {
    typeName: 'FlowStart',
    title: 'Flow Start',
    category: 'Flow',
    color: '#4a90d9',
    inputs: [],
    outputs: [{ name: 'Out', portType: Flow }],
  },
  {
    typeName: 'FloatConst',
    title: '浮点常量',
    category: '数学',
    color: '#2e8b57',
    minWidth: 160,
    minHeight: 96,
    inputs: [{ name: '前序', portType: Flow }],
    outputs: [
      { name: '后继', portType: Flow },
      { name: '值', portType: F },
    ],
    fields: [
      { key: 'value', label: '值', type: 'number', default: 0, step: 0.1 },
    ],
  },
  {
    typeName: 'Add',
    title: '相加',
    category: '数学',
    color: '#2e8b57',
    inputs: [
      { name: '前序', portType: Flow },
      { name: 'A', portType: F },
      { name: 'B', portType: F },
    ],
    outputs: [
      { name: '后继', portType: Flow },
      { name: '结果', portType: F },
    ],
  },
  {
    typeName: 'Branch',
    title: '分支',
    category: '逻辑',
    color: '#c44',
    inputs: [
      { name: '前序', portType: Flow },
      { name: '条件', portType: B },
    ],
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
    inputs: [{ name: '前序', portType: Flow }],
    outputs: [
      { name: '后继', portType: Flow },
      { name: '值', portType: B },
    ],
    fields: [
      { key: 'value', label: '值', type: 'bool', default: true },
    ],
  },
  {
    typeName: 'DebugLog',
    title: '调试日志',
    category: '工具',
    color: '#888',
    inputs: [
      { name: '前序', portType: Flow },
      { name: '消息', portType: S },
    ],
    outputs: [{ name: '后继', portType: Flow }],
    fields: [
      { key: 'message', label: '消息', type: 'string', default: 'hello' },
    ],
  },
  {
    typeName: 'StringConst',
    title: '字符串常量',
    category: '工具',
    color: '#888',
    minHeight: 96,
    inputs: [{ name: '前序', portType: Flow }],
    outputs: [
      { name: '后继', portType: Flow },
      { name: '值', portType: S },
    ],
    fields: [
      { key: 'value', label: '值', type: 'string', default: '' },
    ],
  },
];

export function createSandboxGraphJSON() {
  return {
    version: 1,
    graphId: 'sandbox',
    profile: {
      name: 'sandbox',
      useLightTheme: false,
      nodeFilter: { allowAll: true, whitelist: [], blacklist: [] },
    },
    nodes: [
      {
        id: 'node_flowstart',
        typeName: 'FlowStart',
        title: 'Flow Start',
        position: { x: 80, y: 160, w: 160, h: 72 },
        minWidth: 160,
        minHeight: 64,
        inputs: [],
        outputs: [{ name: 'Out', portType: Flow }],
        customData: {},
      },
      {
        id: 'node_float_a',
        typeName: 'FloatConst',
        title: '浮点常量',
        position: { x: 80, y: 300, w: 160, h: 110 },
        minWidth: 160,
        minHeight: 96,
        inputs: [{ name: '前序', portType: Flow }],
        outputs: [
          { name: '后继', portType: Flow },
          { name: '值', portType: F },
        ],
        customData: { value: 1 },
      },
      {
        id: 'node_float_b',
        typeName: 'FloatConst',
        title: '浮点常量',
        position: { x: 80, y: 420, w: 160, h: 110 },
        minWidth: 160,
        minHeight: 96,
        inputs: [{ name: '前序', portType: Flow }],
        outputs: [
          { name: '后继', portType: Flow },
          { name: '值', portType: F },
        ],
        customData: { value: 2 },
      },
      {
        id: 'node_add',
        typeName: 'Add',
        title: '相加',
        position: { x: 320, y: 340, w: 180, h: 120 },
        minWidth: 160,
        minHeight: 64,
        inputs: [
          { name: '前序', portType: Flow },
          { name: 'A', portType: F },
          { name: 'B', portType: F },
        ],
        outputs: [
          { name: '后继', portType: Flow },
          { name: '结果', portType: F },
        ],
        customData: {},
      },
      {
        id: 'node_log',
        typeName: 'DebugLog',
        title: '调试日志',
        position: { x: 320, y: 160, w: 180, h: 110 },
        minWidth: 160,
        minHeight: 64,
        inputs: [
          { name: '前序', portType: Flow },
          { name: '消息', portType: S },
        ],
        outputs: [{ name: '后继', portType: Flow }],
        customData: { message: 'sandbox ready' },
      },
    ],
    connections: [
      {
        fromNodeId: 'node_flowstart',
        fromPortIndex: 0,
        toNodeId: 'node_log',
        toPortIndex: 0,
      },
      {
        fromNodeId: 'node_float_a',
        fromPortIndex: 1,
        toNodeId: 'node_add',
        toPortIndex: 1,
      },
      {
        fromNodeId: 'node_float_b',
        fromPortIndex: 1,
        toNodeId: 'node_add',
        toPortIndex: 2,
      },
    ],
  };
}
