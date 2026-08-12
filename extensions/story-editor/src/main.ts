'use strict';

import { listLocalStories } from './browseStories';
import { createStoryAssets } from './createStory';
import { deleteStoryAssets } from './deleteStory';
import { exportAllFlagged, exportStoryTs } from './export/TsStoryExporter';
import { allStoryRegisterNodes, STORY_NODE_DEFS } from './nodes/storyNodes';
import { STORY_PORT_TYPES } from './nodes/storyPortTypes';
import { graphDbUrl } from './paths';
import { buildStoryGraphProfile } from './profile';
import { syncStoryGraphOnDisk } from './syncStoryGraphPorts';
import { validateStoryOnDisk } from './validateStoryGraph';

const PKG = 'story-editor';
const NODE_GRAPH = 'node-graph';

let registered = false;

async function dialogInfo(message: string): Promise<void> {
  try {
    await Editor.Dialog.info(message, { title: '剧情编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.log(`[story-editor] ${message}`);
  }
}

async function dialogWarn(message: string): Promise<void> {
  try {
    await Editor.Dialog.warn(message, { title: '剧情编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.warn(`[story-editor] ${message}`);
  }
}

async function dialogError(message: string): Promise<void> {
  try {
    await Editor.Dialog.error(message, { title: '剧情编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.error(`[story-editor] ${message}`);
  }
}

async function dialogConfirm(message: string, okLabel = '确定'): Promise<boolean> {
  try {
    const result = (await Editor.Dialog.warn(message, {
      title: '剧情编辑器',
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
    await dialogWarn('未检测到 node-graph 扩展。请先启用「node-graph」，再使用剧情编辑器。');
  }
  return false;
}

export async function ensureRegistered(silent = false): Promise<{ ok: boolean }> {
  if (registered) return { ok: true };
  if (!(await ensureNodeGraph(silent))) return { ok: false };
  try {
    const nodes = allStoryRegisterNodes();
    await Editor.Message.request(NODE_GRAPH, 'register-port-types', { portTypes: STORY_PORT_TYPES });
    await Editor.Message.request(NODE_GRAPH, 'register-nodes', { nodes });
    registered = true;
    console.log(
      `[story-editor] registered ${nodes.length} story nodes (${STORY_NODE_DEFS.length} domain + builtins)`
    );
    return { ok: true };
  } catch (e) {
    if (silent) console.warn('[story-editor] register failed', e);
    else await dialogError(`注册剧情节点失败: ${e}`);
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
  console.warn('[story-editor] node-graph still unavailable after retries; will register on first use');
}

export async function openStory(arg: { storyId: number } | number): Promise<{ ok: boolean }> {
  const storyId = typeof arg === 'number' ? arg : arg?.storyId;
  if (!storyId) {
    await dialogWarn('请提供 storyId');
    return { ok: false };
  }
  if (!(await ensureRegistered()).ok) return { ok: false };

  syncStoryGraphOnDisk(storyId);

  await Editor.Message.request(NODE_GRAPH, 'open-graph', {
    path: graphDbUrl(storyId),
    profile: buildStoryGraphProfile(),
  });
  return { ok: true };
}

export const methods = {
  async ensureRegistered() {
    return ensureRegistered();
  },

  async battleModuleInfo() {
    return {
      id: 'story',
      packageName: PKG,
      title: '剧情',
      order: 10,
      group: 'story',
      groupTitle: '剧情管理',
      groupOrder: 18,
      itemIdKey: 'storyId',
      openArgKey: 'storyId',
      emptyHint: '暂无剧情。请点「创建」。',
      openLabel: '编辑',
      exportLabel: '导出TS',
      messages: {
        list: 'list-stories',
        open: 'open-story',
        exportOne: 'export-story',
        exportBatch: 'export-ts-batch',
        create: 'create-story',
        delete: 'delete-story',
        validateOne: 'validate-story',
      },
    };
  },

  async browseStories() {
    await ensureRegistered();
    try {
      await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'story' });
      return;
    } catch {
      Editor.Panel.open(`${PKG}.browser`);
    }
  },

  async listStories() {
    return listLocalStories();
  },

  async openStory(arg: { storyId: number } | number) {
    return openStory(arg);
  },

  async exportStory(arg: { storyId: number } | number) {
    const storyId = typeof arg === 'number' ? arg : arg?.storyId;
    if (!storyId) return { ok: false };
    const r = exportStoryTs(storyId);
    if (!r.ok) {
      await dialogError(`导出失败: ${r.error}`);
      return r;
    }
    await dialogInfo(`已导出剧情 ${storyId}\n${r.path}`);
    return r;
  },

  async exportTsBatch() {
    const { ok, fail, results } = exportAllFlagged();
    const detail = results
      .filter((r) => !r.ok)
      .map((r) => `${r.storyId}: ${r.error}`)
      .join('\n');
    await dialogInfo(`批量导出完成：成功 ${ok}，失败 ${fail}${detail ? `\n${detail}` : ''}`);
    return { ok, fail };
  },

  async createStory(arg?: { storyId?: number } | number) {
    if (!(await ensureRegistered()).ok) return { ok: false };
    const storyId = typeof arg === 'number' ? arg : arg?.storyId;
    if (!storyId || storyId <= 0) {
      Editor.Panel.open(`${PKG}.create`);
      return { ok: false, cancelled: true };
    }
    const result = await createStoryAssets({
      storyId,
      name: `Story ${storyId}`,
      exportFlag: true,
    });
    if (!result.ok) {
      await dialogError(result.error || '创建失败');
      return result;
    }
    return result;
  },

  async createStoryApi(arg: {
    storyId?: number;
    name?: string;
    description?: string;
    category?: string;
    exportFlag?: boolean;
  }) {
    if (!(await ensureRegistered()).ok) return { ok: false, error: 'node-graph 未就绪' };
    const storyId = arg?.storyId;
    if (!storyId || storyId <= 0) {
      return { ok: false, error: '请手动指定 storyId' };
    }
    return createStoryAssets({
      storyId,
      name: arg?.name || `Story ${storyId}`,
      description: arg?.description,
      category: arg?.category,
      exportFlag: arg?.exportFlag ?? true,
    });
  },

  async validateStory(arg: { storyId: number } | number) {
    const storyId = typeof arg === 'number' ? arg : arg?.storyId;
    if (!storyId) return { ok: false };
    syncStoryGraphOnDisk(storyId);
    const r = validateStoryOnDisk(storyId);
    const msg = r.ok
      ? `校验通过\n${r.warnings.join('\n')}`
      : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
    if (r.ok) await dialogInfo(msg);
    else await dialogWarn(msg);
    return r;
  },

  async deleteStory(arg: { storyId: number } | number) {
    const storyId = typeof arg === 'number' ? arg : arg?.storyId;
    if (!storyId) {
      await dialogWarn('请提供 storyId');
      return { ok: false };
    }
    const item = listLocalStories().find((s) => s.storyId === storyId);
    const label = item ? `${storyId} ${item.name}` : String(storyId);
    const confirmed = await dialogConfirm(
      `确定删除剧情 ${label}？\n将删除 assets/resources/story-graphs/${storyId}/ 与对应 TsStory（不可恢复）`,
      '删除'
    );
    if (!confirmed) return { ok: false, cancelled: true };

    const result = await deleteStoryAssets(storyId);
    if (!result.ok) {
      await dialogError(result.error || '删除失败');
      return result;
    }
    await dialogInfo(`已删除剧情 ${storyId}`);
    return result;
  },
};

export function load(): void {
  autoRegisterWithRetry().catch((e) => console.warn('[story-editor] auto-register failed', e));
  console.log('[story-editor] extension loaded');
}

export function unload(): void {
  registered = false;
  console.log('[story-editor] extension unloaded');
}
