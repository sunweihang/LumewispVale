import * as fs from 'fs';
import {
  NODE_NAME_TO_SLOT,
  SLOT_FALLBACK_NAMES,
  SLOT_LABELS,
  UnitIndexJSON,
  indexFsPath,
  prefabFsPath,
  resolveRequiredSlots,
} from './paths';

export interface ValidateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  foundSlots: number[];
}

function collectNodeNames(prefabJson: unknown[]): Set<string> {
  const names = new Set<string>();
  for (const obj of prefabJson) {
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as Record<string, unknown>;
    if (o.__type__ === 'cc.Node' && typeof o._name === 'string') {
      names.add(o._name);
    }
  }
  return names;
}

function hasDecorator(prefabJson: unknown[]): boolean {
  for (const obj of prefabJson) {
    if (!obj || typeof obj !== 'object') continue;
    const t = String((obj as Record<string, unknown>).__type__ || '');
    // compressed uuid for EntityAttachmentSlotDecorator or class name fallback
    // EntityAttachmentSlotDecorator script uuid a8c3e1f2-… → compressed a8c3e…
    if (t.includes('EntityAttachmentSlotDecorator') || t.startsWith('a8c3e')) {
      return true;
    }
  }
  return false;
}

function resolveSlotFromNames(names: Set<string>, slot: number): boolean {
  if (slot === 1) return true; // Root = entity itself
  for (const [nodeName, mapped] of Object.entries(NODE_NAME_TO_SLOT)) {
    if (mapped === slot && names.has(nodeName)) return true;
  }
  const fallbacks = SLOT_FALLBACK_NAMES[slot];
  if (fallbacks) {
    for (const n of fallbacks) {
      if (names.has(n)) return true;
    }
  }
  return false;
}

export function validateUnitOnDisk(unitId: number): ValidateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const foundSlots: number[] = [];

  const indexPath = indexFsPath(unitId);
  if (!fs.existsSync(indexPath)) {
    return { ok: false, errors: [`缺少 index.json`], warnings, foundSlots };
  }

  let index: UnitIndexJSON;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as UnitIndexJSON;
  } catch (e) {
    return { ok: false, errors: [`index.json 解析失败: ${e}`], warnings, foundSlots };
  }

  if (!index.prefab) {
    errors.push('index.prefab 为空');
    return { ok: false, errors, warnings, foundSlots };
  }

  const prefabPath = prefabFsPath(index.prefab);
  if (!fs.existsSync(prefabPath)) {
    errors.push(`Prefab 不存在: ${index.prefab}`);
    return { ok: false, errors, warnings, foundSlots };
  }

  let prefabJson: unknown[];
  try {
    prefabJson = JSON.parse(fs.readFileSync(prefabPath, 'utf8')) as unknown[];
  } catch (e) {
    return { ok: false, errors: [`Prefab 解析失败: ${e}`], warnings, foundSlots };
  }

  if (!hasDecorator(prefabJson)) {
    warnings.push('Prefab 根上未见 EntityAttachmentSlotDecorator（运行时 UnitManager 会自动补）');
  }

  const names = collectNodeNames(prefabJson);
  const required = resolveRequiredSlots(index);
  for (const slot of required) {
    if (resolveSlotFromNames(names, slot)) {
      foundSlots.push(slot);
    } else {
      errors.push(`缺少挂点 ${SLOT_LABELS[slot] ?? slot}（slot=${slot}）`);
    }
  }

  // 扫描到的全部已知槽
  for (const [nodeName, slot] of Object.entries(NODE_NAME_TO_SLOT)) {
    if (names.has(nodeName) && !foundSlots.includes(slot)) {
      foundSlots.push(slot);
    }
  }

  return { ok: errors.length === 0, errors, warnings, foundSlots };
}
