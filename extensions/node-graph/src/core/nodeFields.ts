import type { FieldDef } from '../nodes/types';
import type { NodeData } from './NodeData';
import { NodeRegistry } from './NodeRegistry';

/** customData key → 中文标签（节点未注册 / 定义未同步时的兜底显示） */
const FIELD_LABEL_HINTS: Record<string, string> = {
  prefab: '特效 Prefab',
  sfxPrefab: 'SFX Prefab',
  bone: '挂点',
  parentSlot: '父挂点',
  delayTime: '延时(秒)',
  localOffsetX: '位置 X',
  localOffsetY: '位置 Y',
  localOffsetZ: '位置 Z',
  eulerX: '欧拉角 X',
  eulerY: '欧拉角 Y',
  eulerZ: '欧拉角 Z',
  scale: '缩放',
  ballisticTemplate: '默认弹道模板',
  lifetimeSec: '寿命(秒)',
  defaultSpeed: '默认速度',
  paramName: '参数名',
  paramValue: '参数值',
  hitTimes: '打击点时间',
  key: '状态Key',
  value: '值',
  message: '消息',
  yOffset: '目标 Y 偏移',
};

function inferFieldType(v: unknown): FieldDef['type'] {
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'number';
  return 'string';
}

/**
 * 解析节点可编辑字段：优先 NodeRegistry 定义；
 * 定义缺失时用 customData 合成，避免「播放特效」等新节点未热重载时画布/检视器空白。
 */
export function fieldsForNode(node: NodeData): FieldDef[] {
  const def = NodeRegistry.get(node.typeName);
  if (def?.fields?.length) return def.fields;

  const data = node.customData || {};
  const keys = Object.keys(data);
  if (keys.length === 0) return [];

  // 特效节点优先展示关键字段顺序
  const preferred = [
    'prefab',
    'bone',
    'delayTime',
    'localOffsetX',
    'localOffsetY',
    'localOffsetZ',
    'eulerX',
    'eulerY',
    'eulerZ',
    'scale',
  ];
  const ordered = [
    ...preferred.filter((k) => k in data),
    ...keys.filter((k) => !preferred.includes(k)),
  ];

  return ordered.map((key) => ({
    key,
    label: FIELD_LABEL_HINTS[key] || key,
    type: inferFieldType(data[key]),
    default: data[key],
  }));
}
