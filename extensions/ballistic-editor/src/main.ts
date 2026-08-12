'use strict';

import { listLocalBallistics } from './browseBallistics';
import { createBallisticAssets } from './createBallistic';
import { exportAllFlagged, exportBallisticTs } from './export/TsBallisticExporter';
import { findSkillsUsingBallistic } from './findSkillsUsingBallistic';
import { allBallisticRegisterNodes, BALLISTIC_NODE_DEFS } from './nodes/ballisticNodes';
import { BALLISTIC_PORT_TYPES } from './nodes/ballisticPortTypes';
import { graphDbUrl } from './paths';
import { buildBallisticGraphProfile } from './profile';
import { validateBallisticOnDisk } from './validateBallisticGraph';

const PKG = 'ballistic-editor';
const NODE_GRAPH = 'node-graph';

let registered = false;

async function dialogInfo(message: string): Promise<void> {
  try {
    await Editor.Dialog.info(message, { title: '弹道编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.log(`[ballistic-editor] ${message}`);
  }
}

async function dialogWarn(message: string): Promise<void> {
  try {
    await Editor.Dialog.warn(message, { title: '弹道编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.warn(`[ballistic-editor] ${message}`);
  }
}

async function dialogError(message: string): Promise<void> {
  try {
    await Editor.Dialog.error(message, { title: '弹道编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.error(`[ballistic-editor] ${message}`);
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
    await dialogWarn('未检测到 node-graph 扩展。请先启用「node-graph」，再使用弹道编辑器。');
  }
  return false;
}

export async function ensureRegistered(silent = false): Promise<{ ok: boolean }> {
  if (registered) return { ok: true };
  if (!(await ensureNodeGraph(silent))) return { ok: false };
  try {
    const nodes = allBallisticRegisterNodes();
    await Editor.Message.request(NODE_GRAPH, 'register-port-types', { portTypes: BALLISTIC_PORT_TYPES });
    await Editor.Message.request(NODE_GRAPH, 'register-nodes', { nodes });
    registered = true;
    console.log(
      `[ballistic-editor] registered ${nodes.length} ballistic nodes (${BALLISTIC_NODE_DEFS.length} domain + builtins)`
    );
    return { ok: true };
  } catch (e) {
    if (silent) console.warn('[ballistic-editor] register failed', e);
    else await dialogError(`注册弹道节点失败: ${e}`);
    return { ok: false };
  }
}

/** 等 node-graph 加载完成再注册；中间失败静默，仅最终仍失败时提示一次 */
async function autoRegisterWithRetry(): Promise<void> {
  // 首探略延迟，避开与 node-graph 的启动竞态
  const gaps = [200, 400, 1200, 3000, 6000];
  for (let i = 0; i < gaps.length; i++) {
    await new Promise((r) => setTimeout(r, gaps[i]!));
    if ((await ensureRegistered(true)).ok) return;
  }
  console.warn('[ballistic-editor] node-graph still unavailable after retries; will register on first use');
}

export async function openBallistic(arg: { ballisticId: number } | number): Promise<{ ok: boolean }> {
  const ballisticId = typeof arg === 'number' ? arg : arg?.ballisticId;
  if (!ballisticId) {
    await dialogWarn('请提供 ballisticId');
    return { ok: false };
  }
  if (!(await ensureRegistered()).ok) return { ok: false };

  await Editor.Message.request(NODE_GRAPH, 'open-graph', {
    path: graphDbUrl(ballisticId),
    profile: buildBallisticGraphProfile(),
  });
  return { ok: true };
}

export const methods = {
  async ensureRegistered() {
    return ensureRegistered();
  },

  async browseBallistics() {
    await ensureRegistered();
    try {
      await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'ballistic' });
      return;
    } catch {
      Editor.Panel.open(`${PKG}.browser`);
    }
  },

  async battleModuleInfo() {
    return {
      id: 'ballistic',
      packageName: PKG,
      title: '弹道',
      order: 20,
      group: 'battle',
      groupTitle: '战斗管理器',
      groupOrder: 20,
      itemIdKey: 'ballisticId',
      openArgKey: 'ballisticId',
      emptyHint: '暂无弹道。请点「创建」。',
      messages: {
        list: 'list-ballistics',
        open: 'open-ballistic',
        exportOne: 'export-ballistic',
        exportBatch: 'export-ts-batch',
        create: 'create-ballistic',
        validateOne: 'validate-ballistic',
      },
      extraActions: [
        { id: 'refs', label: '引用技能', message: 'find-skills-using-ballistic' },
      ],
    };
  },

  async validateBallistic(arg: { ballisticId: number } | number) {
    const ballisticId = typeof arg === 'number' ? arg : arg?.ballisticId;
    if (!ballisticId) return { ok: false };
    const r = validateBallisticOnDisk(ballisticId);
    const msg = r.ok
      ? `校验通过\n${r.warnings.join('\n')}`
      : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
    if (r.ok) await dialogInfo(msg);
    else await dialogWarn(msg);
    return r;
  },

  async createBallistic(arg?: { ballisticId?: number } | number) {
    if (!(await ensureRegistered()).ok) return { ok: false };
    const ballisticId = typeof arg === 'number' ? arg : arg?.ballisticId;
    if (!ballisticId || ballisticId <= 0) {
      Editor.Panel.open(`${PKG}.create`);
      return { ok: false, cancelled: true };
    }
    const result = await createBallisticAssets({
      ballisticId,
      name: `Ballistic ${ballisticId}`,
      exportFlag: true,
    });
    if (!result.ok) {
      await dialogError(result.error || '创建失败');
      return result;
    }
    return result;
  },

  async createBallisticApi(arg: {
    ballisticId?: number;
    name?: string;
    description?: string;
    category?: string;
    exportFlag?: boolean;
  }) {
    if (!(await ensureRegistered()).ok) return { ok: false, error: 'node-graph 未就绪' };
    const ballisticId = arg?.ballisticId;
    if (!ballisticId || ballisticId <= 0) {
      return { ok: false, error: '请手动指定 ballisticId' };
    }
    return createBallisticAssets({
      ballisticId,
      name: arg?.name || `Ballistic ${ballisticId}`,
      description: arg?.description,
      category: arg?.category,
      exportFlag: arg?.exportFlag ?? true,
    });
  },

  async editBallisticGraph() {
    if (!(await ensureRegistered()).ok) return;
    const items = listLocalBallistics();
    if (items.length === 0) {
      await dialogWarn('还没有弹道图。请先「创建弹道」。');
      return;
    }
    Editor.Panel.open(`${PKG}.browser`);
    await openBallistic(items[items.length - 1].ballisticId);
  },

  async openBallistic(arg: { ballisticId: number } | number) {
    return openBallistic(arg);
  },

  async listBallistics() {
    return listLocalBallistics();
  },

  async validateBallisticGraph() {
    const items = listLocalBallistics();
    if (items.length === 0) {
      await dialogWarn('没有可校验的弹道');
      return;
    }
    const lines: string[] = [];
    for (const s of items) {
      const r = validateBallisticOnDisk(s.ballisticId);
      lines.push(`[${r.ok ? 'OK' : 'FAIL'}] ${s.ballisticId} ${s.name}`);
      for (const e of r.errors) lines.push(`  - error: ${e}`);
      for (const w of r.warnings) lines.push(`  - warn: ${w}`);
    }
    await dialogInfo(lines.join('\n'));
  },

  async exportTs() {
    const items = listLocalBallistics();
    if (items.length === 0) {
      await dialogWarn('没有可导出的弹道');
      return;
    }
    const last = items[items.length - 1];
    const r = exportBallisticTs(last.ballisticId);
    if (!r.ok) {
      await dialogError(`导出失败 ${last.ballisticId}: ${r.error}`);
      return;
    }
    await dialogInfo(`已导出 ${last.ballisticId}\n${r.path}`);
  },

  async exportBallistic(arg: { ballisticId: number } | number) {
    const ballisticId = typeof arg === 'number' ? arg : arg?.ballisticId;
    if (!ballisticId) return { ok: false, error: 'missing ballisticId' };
    const r = exportBallisticTs(ballisticId);
    if (!r.ok) await dialogError(`导出失败: ${r.error}`);
    else await dialogInfo(`已导出 ${ballisticId}\n${r.path}`);
    return r;
  },

  async exportTsBatch() {
    const { ok, fail, results } = exportAllFlagged();
    const detail = results
      .map((r) => (r.ok ? `OK ${r.ballisticId}` : `FAIL ${r.ballisticId}: ${r.error}`))
      .join('\n');
    await dialogInfo(`批量导出完成：成功 ${ok}，失败 ${fail}\n${detail}`);
    return { ok, fail };
  },

  async findSkillsUsingBallistic(arg: { ballisticId: number } | number) {
    const ballisticId = typeof arg === 'number' ? arg : arg?.ballisticId;
    if (!ballisticId) return [];
    const hits = findSkillsUsingBallistic(ballisticId);
    const msg =
      hits.length === 0
        ? `没有技能引用弹道 ${ballisticId}`
        : hits.map((h) => `${h.skillId} ${h.skillName} · ${h.typeName} (${h.nodeId})`).join('\n');
    await dialogInfo(msg);
    return hits;
  },
};

export function load() {
  autoRegisterWithRetry().catch((e) => console.warn('[ballistic-editor] auto-register failed', e));
  console.log('[ballistic-editor] extension loaded');
}

export function unload() {
  registered = false;
  console.log('[ballistic-editor] extension unloaded');
}
