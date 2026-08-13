'use strict';

import { listLocalGuides } from './browseGuides';
import { createGuideAssets } from './createGuide';
import { deleteGuideAssets } from './deleteGuide';
import { exportAllFlagged, exportGuideTs } from './export/TsGuideExporter';
import { allGuideRegisterNodes, GUIDE_NODE_DEFS } from './nodes/guideNodes';
import { GUIDE_PORT_TYPES } from './nodes/guidePortTypes';
import { graphDbUrl } from './paths';
import { buildGuideGraphProfile } from './profile';
import { syncGuideGraphOnDisk } from './syncGuideGraphPorts';
import { validateGuideOnDisk } from './validateGuideGraph';

const PKG = 'guide-editor';
const NODE_GRAPH = 'node-graph';

let registered = false;

async function dialogInfo(message: string): Promise<void> {
  try {
    await Editor.Dialog.info(message, { title: '引导编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.log(`[guide-editor] ${message}`);
  }
}

async function dialogWarn(message: string): Promise<void> {
  try {
    await Editor.Dialog.warn(message, { title: '引导编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.warn(`[guide-editor] ${message}`);
  }
}

async function dialogError(message: string): Promise<void> {
  try {
    await Editor.Dialog.error(message, { title: '引导编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.error(`[guide-editor] ${message}`);
  }
}

async function dialogConfirm(message: string, okLabel = '确定'): Promise<boolean> {
  try {
    const result = (await Editor.Dialog.warn(message, {
      title: '引导编辑器',
      buttons: ['取消', okLabel],
      default: 0,
      cancel: 0,
    })) as { response?: number } | number;
    const response = typeof result === 'number' ? result : result?.response;
    return response === 1;
  } catch {
    return false;
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
    await dialogWarn('未检测到 node-graph 扩展。请先启用「node-graph」，再使用引导编辑器。');
  }
  return false;
}

export async function ensureRegistered(silent = false): Promise<{ ok: boolean }> {
  if (registered) return { ok: true };
  if (!(await ensureNodeGraph(silent))) return { ok: false };
  try {
    const nodes = allGuideRegisterNodes();
    await Editor.Message.request(NODE_GRAPH, 'register-port-types', { portTypes: GUIDE_PORT_TYPES });
    await Editor.Message.request(NODE_GRAPH, 'register-nodes', { nodes });
    registered = true;
    console.log(
      `[guide-editor] registered ${nodes.length} guide nodes (${GUIDE_NODE_DEFS.length} domain + builtins)`
    );
    return { ok: true };
  } catch (e) {
    if (silent) console.warn('[guide-editor] register failed', e);
    else await dialogError(`注册引导节点失败: ${e}`);
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
  console.warn('[guide-editor] node-graph still unavailable after retries; will register on first use');
}

export async function openGuide(arg: { guideId: number } | number): Promise<{ ok: boolean }> {
  const guideId = typeof arg === 'number' ? arg : arg?.guideId;
  if (!guideId) {
    await dialogWarn('请提供 guideId');
    return { ok: false };
  }
  if (!(await ensureRegistered()).ok) return { ok: false };

  syncGuideGraphOnDisk(guideId);

  await Editor.Message.request(NODE_GRAPH, 'open-graph', {
    path: graphDbUrl(guideId),
    profile: buildGuideGraphProfile(),
  });
  return { ok: true };
}

export const methods = {
  async ensureRegistered() {
    return ensureRegistered();
  },

  async battleModuleInfo() {
    return {
      id: 'guide',
      packageName: PKG,
      title: '引导',
      order: 10,
      group: 'guide',
      groupTitle: '引导管理',
      groupOrder: 18,
      itemIdKey: 'guideId',
      openArgKey: 'guideId',
      emptyHint: '暂无引导。请点「创建」。',
      openLabel: '编辑',
      exportLabel: '导出TS',
      messages: {
        list: 'list-guides',
        open: 'open-guide',
        exportOne: 'export-guide',
        exportBatch: 'export-ts-batch',
        create: 'create-guide',
        delete: 'delete-guide',
        validateOne: 'validate-guide',
      },
    };
  },

  async browseGuides() {
    await ensureRegistered();
    try {
      await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'guide' });
      return;
    } catch {
      Editor.Panel.open(`${PKG}.browser`);
    }
  },

  async listGuides() {
    return listLocalGuides();
  },

  async openGuide(arg: { guideId: number } | number) {
    return openGuide(arg);
  },

  async exportGuide(arg: { guideId: number } | number) {
    const guideId = typeof arg === 'number' ? arg : arg?.guideId;
    if (!guideId) return { ok: false };
    const r = exportGuideTs(guideId);
    if (!r.ok) {
      await dialogError(`导出失败: ${r.error}`);
      return r;
    }
    await dialogInfo(`已导出引导 ${guideId}\n${r.path}`);
    return r;
  },

  async exportTsBatch() {
    const { ok, fail, results } = exportAllFlagged();
    const detail = results
      .filter((r) => !r.ok)
      .map((r) => `${r.guideId}: ${r.error}`)
      .join('\n');
    await dialogInfo(`批量导出完成：成功 ${ok}，失败 ${fail}${detail ? `\n${detail}` : ''}`);
    return { ok, fail };
  },

  async createGuide(arg?: { guideId?: number } | number) {
    if (!(await ensureRegistered()).ok) return { ok: false };
    const guideId = typeof arg === 'number' ? arg : arg?.guideId;
    if (!guideId || guideId <= 0) {
      Editor.Panel.open(`${PKG}.create`);
      return { ok: false, cancelled: true };
    }
    const result = await createGuideAssets({
      guideId,
      name: `Guide ${guideId}`,
      exportFlag: true,
    });
    if (!result.ok) {
      await dialogError(result.error || '创建失败');
      return result;
    }
    return result;
  },

  async createGuideApi(arg: {
    guideId?: number;
    name?: string;
    description?: string;
    category?: string;
    exportFlag?: boolean;
  }) {
    if (!(await ensureRegistered()).ok) return { ok: false, error: 'node-graph 未就绪' };
    const guideId = arg?.guideId;
    if (!guideId || guideId <= 0) {
      return { ok: false, error: '请手动指定 guideId' };
    }
    return createGuideAssets({
      guideId,
      name: arg?.name || `Guide ${guideId}`,
      description: arg?.description,
      category: arg?.category,
      exportFlag: arg?.exportFlag ?? true,
    });
  },

  async validateGuide(arg: { guideId: number } | number) {
    const guideId = typeof arg === 'number' ? arg : arg?.guideId;
    if (!guideId) return { ok: false };
    syncGuideGraphOnDisk(guideId);
    const r = validateGuideOnDisk(guideId);
    const msg = r.ok
      ? `校验通过\n${r.warnings.join('\n')}`
      : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
    if (r.ok) await dialogInfo(msg);
    else await dialogWarn(msg);
    return r;
  },

  async deleteGuide(arg: { guideId: number } | number) {
    const guideId = typeof arg === 'number' ? arg : arg?.guideId;
    if (!guideId) {
      await dialogWarn('请提供 guideId');
      return { ok: false };
    }
    const item = listLocalGuides().find((s) => s.guideId === guideId);
    const label = item ? `${guideId} ${item.name}` : String(guideId);
    const confirmed = await dialogConfirm(
      `确定删除引导 ${label}？\n将删除 assets/resources/guide-graphs/${guideId}/ 与对应 TsGuide（不可恢复）`,
      '删除'
    );
    if (!confirmed) return { ok: false, cancelled: true };

    const result = await deleteGuideAssets(guideId);
    if (!result.ok) {
      await dialogError(result.error || '删除失败');
      return result;
    }
    await dialogInfo(`已删除引导 ${guideId}`);
    return result;
  },
};

export function load(): void {
  autoRegisterWithRetry().catch((e) => console.warn('[guide-editor] auto-register failed', e));
  console.log('[guide-editor] extension loaded');
}

export function unload(): void {
  registered = false;
  console.log('[guide-editor] extension unloaded');
}
