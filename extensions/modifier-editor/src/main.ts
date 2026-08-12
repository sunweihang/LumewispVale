'use strict';

import { listLocalModifiers } from './browseModifiers';
import { createModifierAssets } from './createModifier';
import { exportAllFlagged, exportModifierTs } from './export/TsModifierExporter';
import { allModifierRegisterNodes, MODIFIER_NODE_DEFS } from './nodes/modifierNodes';
import { MODIFIER_PORT_TYPES } from './nodes/modifierPortTypes';
import { graphDbUrl } from './paths';
import { buildModifierGraphProfile } from './profile';
import { validateModifierOnDisk } from './validateModifierGraph';

const PKG = 'modifier-editor';
const NODE_GRAPH = 'node-graph';

let registered = false;

async function dialogInfo(message: string): Promise<void> {
  try {
    await Editor.Dialog.info(message, { title: 'Buff编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.log(`[modifier-editor] ${message}`);
  }
}

async function dialogWarn(message: string): Promise<void> {
  try {
    await Editor.Dialog.warn(message, { title: 'Buff编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.warn(`[modifier-editor] ${message}`);
  }
}

async function dialogError(message: string): Promise<void> {
  try {
    await Editor.Dialog.error(message, { title: 'Buff编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.error(`[modifier-editor] ${message}`);
  }
}

async function probeNodeGraph(): Promise<boolean> {
  try {
    await Editor.Message.request(NODE_GRAPH, 'query-node-defs');
    return true;
  } catch {
    return false;
  }
}

/** @param silent 启动重试时为 true：不弹框、不刷「未启用」警告（扩展加载顺序竞态很常见） */
async function ensureNodeGraph(silent = false): Promise<boolean> {
  if (await probeNodeGraph()) return true;
  if (!silent) {
    await dialogWarn('未检测到 node-graph 扩展。请先启用「node-graph」，再使用 Buff 编辑器。');
  }
  return false;
}

export async function ensureRegistered(silent = false): Promise<{ ok: boolean }> {
  if (registered) return { ok: true };
  if (!(await ensureNodeGraph(silent))) return { ok: false };
  try {
    const nodes = allModifierRegisterNodes();
    await Editor.Message.request(NODE_GRAPH, 'register-port-types', { portTypes: MODIFIER_PORT_TYPES });
    await Editor.Message.request(NODE_GRAPH, 'register-nodes', { nodes });
    registered = true;
    console.log(
      `[modifier-editor] registered ${nodes.length} buff nodes (${MODIFIER_NODE_DEFS.length} domain + builtins)`
    );
    return { ok: true };
  } catch (e) {
    if (silent) console.warn('[modifier-editor] register failed', e);
    else await dialogError(`注册 Buff 节点失败: ${e}`);
    return { ok: false };
  }
}

/** 等 node-graph 加载完成再注册；中间失败静默，仅最终仍失败时提示一次 */
async function autoRegisterWithRetry(): Promise<void> {
  const gaps = [200, 400, 1200, 3000, 6000];
  for (let i = 0; i < gaps.length; i++) {
    await new Promise((r) => setTimeout(r, gaps[i]!));
    if ((await ensureRegistered(true)).ok) return;
  }
  console.warn('[modifier-editor] node-graph still unavailable after retries; will register on first use');
}

export async function openModifier(arg: { modifierId: number } | number): Promise<{ ok: boolean }> {
  const modifierId = typeof arg === 'number' ? arg : arg?.modifierId;
  if (!modifierId) {
    await dialogWarn('请提供 modifierId');
    return { ok: false };
  }
  if (!(await ensureRegistered()).ok) return { ok: false };

  await Editor.Message.request(NODE_GRAPH, 'open-graph', {
    path: graphDbUrl(modifierId),
    profile: buildModifierGraphProfile(),
  });
  return { ok: true };
}

export const methods = {
  async ensureRegistered() {
    return ensureRegistered();
  },

  async battleModuleInfo() {
    return {
      id: 'modifier',
      packageName: PKG,
      title: 'Buff',
      order: 30,
      group: 'battle',
      groupTitle: '战斗管理器',
      groupOrder: 20,
      itemIdKey: 'modifierId',
      openArgKey: 'modifierId',
      emptyHint: '暂无 Buff。请点「创建」。',
      openLabel: '编辑',
      exportLabel: '导出TS',
      messages: {
        list: 'list-modifiers',
        open: 'open-modifier',
        exportOne: 'export-modifier',
        exportBatch: 'export-ts-batch',
        create: 'create-modifier',
        validateOne: 'validate-modifier',
      },
    };
  },

  async browseModifiers() {
    await ensureRegistered();
    try {
      await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'modifier' });
      return;
    } catch {
      Editor.Panel.open(`${PKG}.browser`);
    }
  },

  async listModifiers() {
    return listLocalModifiers();
  },

  async openModifier(arg: { modifierId: number } | number) {
    return openModifier(arg);
  },

  async exportModifier(arg: { modifierId: number } | number) {
    const modifierId = typeof arg === 'number' ? arg : arg?.modifierId;
    if (!modifierId) return { ok: false };
    const r = exportModifierTs(modifierId);
    if (!r.ok) {
      await dialogError(`导出失败: ${r.error}`);
      return r;
    }
    await dialogInfo(`已导出 Buff ${modifierId}\n${r.path}`);
    return r;
  },

  async exportTsBatch() {
    const { ok, fail, results } = exportAllFlagged();
    const detail = results
      .filter((r) => !r.ok)
      .map((r) => `${r.modifierId}: ${r.error}`)
      .join('\n');
    await dialogInfo(`批量导出完成：成功 ${ok}，失败 ${fail}${detail ? `\n${detail}` : ''}`);
    return { ok, fail };
  },

  async createModifier(arg?: { modifierId?: number } | number) {
    if (!(await ensureRegistered()).ok) return { ok: false };
    const modifierId = typeof arg === 'number' ? arg : arg?.modifierId;
    if (!modifierId || modifierId <= 0) {
      Editor.Panel.open(`${PKG}.create`);
      return { ok: false, cancelled: true };
    }
    const result = await createModifierAssets({
      modifierId,
      name: `Buff ${modifierId}`,
      exportFlag: true,
    });
    if (!result.ok) {
      await dialogError(result.error || '创建失败');
      return result;
    }
    return result;
  },

  async createModifierApi(arg: {
    modifierId?: number;
    name?: string;
    description?: string;
    category?: string;
    exportFlag?: boolean;
  }) {
    if (!(await ensureRegistered()).ok) return { ok: false, error: 'node-graph 未就绪' };
    const modifierId = arg?.modifierId;
    if (!modifierId || modifierId <= 0) {
      return { ok: false, error: '请手动指定 modifierId' };
    }
    return createModifierAssets({
      modifierId,
      name: arg?.name || `Buff ${modifierId}`,
      description: arg?.description,
      category: arg?.category,
      exportFlag: arg?.exportFlag ?? true,
    });
  },

  async validateModifier(arg: { modifierId: number } | number) {
    const modifierId = typeof arg === 'number' ? arg : arg?.modifierId;
    if (!modifierId) return { ok: false };
    const r = validateModifierOnDisk(modifierId);
    const msg = r.ok
      ? `校验通过\n${r.warnings.join('\n')}`
      : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
    if (r.ok) await dialogInfo(msg);
    else await dialogWarn(msg);
    return r;
  },
};

export function load(): void {
  autoRegisterWithRetry().catch((e) => console.warn('[modifier-editor] auto-register failed', e));
  console.log('[modifier-editor] extension loaded');
}

export function unload(): void {
  registered = false;
  console.log('[modifier-editor] extension unloaded');
}
