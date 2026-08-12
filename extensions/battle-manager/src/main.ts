'use strict';

import * as fs from 'fs';
import * as path from 'path';
import { deleteUnitFolder } from './deleteUnit';
import { discoverBattleModules } from './discoverModules';
import { BattleModuleInfo } from './moduleTypes';
import {
  rebuildAndReloadAll as runRebuildAndReloadAll,
  recoverSceneHierarchy,
  reloadOne,
  markNeedSceneRecover,
  consumeNeedSceneRecover,
  markHostRestore,
  consumeHostRestore,
} from './rebuildAllExtensions';

const PKG = 'battle-manager';
const PANEL = `${PKG}.host`;
const PROGRESS_PANEL = `${PKG}.progress`;

let cachedModules: BattleModuleInfo[] = [];
let pendingModuleId: string | null = null;

interface LiveProgress {
  title: string;
  current: number;
  total: number;
  label: string;
  detail?: string;
  lines: string[];
  done?: boolean;
  ok?: boolean;
}

let liveProgress: LiveProgress | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pushProgress(state: LiveProgress): void {
  liveProgress = state;
  try {
    Editor.Message.send(PKG, 'panel-progress-update', state);
  } catch {
    /* panel not ready */
  }
}

async function openProgress(title: string): Promise<void> {
  pushProgress({
    title,
    current: 0,
    total: 1,
    label: '准备中…',
    lines: [],
  });
  try {
    Editor.Panel.open(PROGRESS_PANEL);
  } catch (e) {
    console.warn('[battle-manager] open progress panel failed', e);
  }
  // 多等一拍，确保 simple 面板 ready 后再开始同步/异步编译
  await sleep(280);
  pushProgress({
    title,
    current: 0,
    total: 1,
    label: '准备中…',
    lines: [],
  });
}

async function closeProgress(): Promise<void> {
  liveProgress = null;
  try {
    Editor.Panel.close?.(PROGRESS_PANEL);
  } catch {
    /* ignore */
  }
}

/** 连刷前记下当前模块，宿主重载后恢复面板 */
async function captureHostRestoreBeforeReload(): Promise<void> {
  let moduleId = pendingModuleId || '';
  try {
    const r = (await Editor.Message.request(PKG, 'panel-query-active')) as {
      moduleId?: string | null;
    } | null;
    if (r?.moduleId) moduleId = r.moduleId;
  } catch {
    /* 面板未开 */
  }
  if (moduleId) pendingModuleId = moduleId;
  markHostRestore({ open: true, moduleId: moduleId || null });
}

async function dialogInfo(message: string): Promise<void> {
  try {
    await Editor.Dialog.info(message, { title: '战斗管理器', buttons: ['确定'], default: 0 });
  } catch {
    console.log(`[battle-manager] ${message}`);
  }
}

async function dialogWarn(message: string): Promise<void> {
  try {
    await Editor.Dialog.warn(message, { title: '战斗管理器', buttons: ['确定'], default: 0 });
  } catch {
    console.warn(`[battle-manager] ${message}`);
  }
}

async function dialogError(message: string): Promise<void> {
  try {
    await Editor.Dialog.error(message, { title: '战斗管理器', buttons: ['确定'], default: 0 });
  } catch {
    console.error(`[battle-manager] ${message}`);
  }
}

async function dialogConfirm(message: string): Promise<boolean> {
  try {
    const result = (await Editor.Dialog.warn(message, {
      title: '战斗管理器',
      buttons: ['取消', '删除'],
      default: 0,
      cancel: 0,
    })) as { response?: number } | number;
    const response = typeof result === 'number' ? result : result?.response;
    return response === 1;
  } catch {
    return false;
  }
}

async function ensureModules(force = false): Promise<BattleModuleInfo[]> {
  if (!force && cachedModules.length > 0) return cachedModules;
  cachedModules = await discoverBattleModules();
  return cachedModules;
}

export const methods = {
  async openHost(arg?: { moduleId?: string }) {
    if (arg?.moduleId) pendingModuleId = arg.moduleId;
    await ensureModules();
    Editor.Panel.open(PANEL);
    if (arg?.moduleId) {
      // panel may already be open
      try {
        await Editor.Message.request(PKG, 'panel-set-module', { moduleId: arg.moduleId });
      } catch {
        /* panel not ready yet — pendingModuleId used on ready */
      }
    }
  },

  async selectModule(arg: { moduleId: string } | string) {
    const moduleId = typeof arg === 'string' ? arg : arg?.moduleId;
    return methods.openHost({ moduleId });
  },

  async rescanModules() {
    const mods = await ensureModules(true);
    await dialogInfo(
      mods.length === 0
        ? '未发现子模块。请确认 unit-editor / skill-editor / ballistic-editor / modifier-editor / story-editor 已启用并暴露 battle-module-info。'
        : `已扫描 ${mods.length} 个模块：\n` +
            mods
              .map((m) => `· ${m.groupTitle || m.group || '-'} / ${m.title} (${m.packageName})`)
              .join('\n')
    );
    try {
      await Editor.Message.request(PKG, 'panel-set-module', {
        moduleId: pendingModuleId || mods[0]?.id,
      });
    } catch {
      /* panel closed */
    }
    return mods;
  },

  async queryModules() {
    return ensureModules();
  },

  async queryHostState() {
    const mods = await ensureModules();
    return { modules: mods, selectId: pendingModuleId };
  },

  async queryProgress() {
    return liveProgress;
  },

  /** 面板切换模块时记住，供连刷后恢复 */
  async rememberModule(arg: { moduleId?: string } | string) {
    const moduleId = typeof arg === 'string' ? arg : arg?.moduleId;
    pendingModuleId = moduleId || null;
    return { ok: true, moduleId: pendingModuleId };
  },

  async queryActiveModule() {
    try {
      const r = (await Editor.Message.request(PKG, 'panel-query-active')) as {
        moduleId?: string | null;
      } | null;
      if (r?.moduleId) pendingModuleId = r.moduleId;
    } catch {
      /* panel closed */
    }
    return { moduleId: pendingModuleId };
  },

  /** 单位删除兜底（unit-editor 未重载时宿主仍可用） */
  async deleteUnit(arg: { unitId: number } | number) {
    const unitId = typeof arg === 'number' ? arg : arg?.unitId;
    if (!unitId) {
      await dialogWarn('请提供 unitId');
      return { ok: false };
    }
    const confirmed = await dialogConfirm(
      `确定删除单位 ${unitId}？\n将删除 assets/resources/units/${unitId}/（不可恢复）`
    );
    if (!confirmed) return { ok: false, cancelled: true };

    const result = await deleteUnitFolder(unitId);
    if (!result.ok) {
      await dialogError(result.error || '删除失败');
      return result;
    }
    await dialogInfo(`已删除单位 ${unitId}`);
    return result;
  },

  /** 一键编译并刷新 extensions/ 下全部扩展 */
  async rebuildAndReloadAll() {
    console.log('[battle-manager] rebuild + reload ALL extensions…');
    await captureHostRestoreBeforeReload();
    await openProgress('一键编译并刷新');
    const r = await runRebuildAndReloadAll({
      build: true,
      hostPackageName: PKG,
      onProgress: (p) => {
        pushProgress({
          title: '一键编译并刷新',
          current: p.current,
          total: p.total,
          label: p.label,
          detail: p.detail,
          lines: p.lines,
          done: p.done,
          ok: p.ok,
        });
      },
    });
    const body = r.lines.join('\n');
    if (!r.ok && !r.host) {
      await sleep(600);
      await closeProgress();
      const needNode = /Node\.js|npm|nodejs\.org/i.test(body);
      await dialogError(
        needNode
          ? `无法编译扩展（环境未就绪）\n\n${body}`
          : `全部扩展处理未完成\n\n${body}`,
      );
      return r;
    }
    // 不弹完成框：点确定会拖慢恢复；结果打日志，宿主重载后自动重开面板
    console.log(`[battle-manager] rebuild/reload done ok=${r.ok}\n${body}`);
    if (r.host) {
      try {
        markNeedSceneRecover();
        await sleep(280);
        await closeProgress();
        await reloadOne(r.host);
      } catch (e) {
        await closeProgress();
        await dialogError(`宿主刷新失败:\n${e}\n请到扩展管理器手动刷新 battle-manager。`);
        return { ok: false, lines: r.lines };
      }
    } else {
      await closeProgress();
    }
    return r;
  },

  /** 仅刷新全部扩展（不编译） */
  async reloadAllExtensions() {
    console.log('[battle-manager] reload ALL extensions (no build)…');
    await captureHostRestoreBeforeReload();
    await openProgress('仅刷新全部扩展');
    const r = await runRebuildAndReloadAll({
      build: false,
      hostPackageName: PKG,
      onProgress: (p) => {
        pushProgress({
          title: '仅刷新全部扩展',
          current: p.current,
          total: p.total,
          label: p.label,
          detail: p.detail,
          lines: p.lines,
          done: p.done,
          ok: p.ok,
        });
      },
    });
    const body = r.lines.join('\n');
    if (!r.ok && !r.host) {
      await sleep(600);
      await closeProgress();
      await dialogError(`刷新未完成\n\n${body}`);
      return r;
    }
    console.log(`[battle-manager] reload done ok=${r.ok}\n${body}`);
    if (r.host) {
      try {
        markNeedSceneRecover();
        await sleep(280);
        await closeProgress();
        await reloadOne(r.host);
      } catch (e) {
        await closeProgress();
        await dialogError(`宿主刷新失败:\n${e}\n请到扩展管理器手动刷新 battle-manager。`);
        return { ok: false, lines: r.lines };
      }
    } else {
      await closeProgress();
    }
    return r;
  },

  /** 定位单位 Prefab 兜底 */
  async locateUnit(arg: { unitId: number } | number) {
    const unitId = typeof arg === 'number' ? arg : arg?.unitId;
    if (!unitId) {
      await dialogWarn('请提供 unitId');
      return { ok: false };
    }
    try {
      const r = (await Editor.Message.request('unit-editor', 'locate-unit', { unitId })) as {
        ok?: boolean;
      } | null;
      if (r?.ok) return r;
    } catch {
      /* unit-editor 未注册 */
    }

    const root = Editor.Project?.path || '';
    const indexPath = path.join(root, 'assets', 'resources', 'units', String(unitId), 'index.json');
    let dbUrl = `db://assets/resources/units/${unitId}`;
    if (fs.existsSync(indexPath)) {
      try {
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { prefab?: string };
        if (index.prefab) {
          const rel = index.prefab.replace(/^\/+/, '').replace(/\.prefab$/, '');
          dbUrl = `db://assets/resources/${rel}.prefab`;
        }
      } catch {
        /* use folder */
      }
    }
    try {
      const uuid = (await Editor.Message.request('asset-db', 'query-uuid', dbUrl)) as string | null;
      if (!uuid) {
        await dialogWarn(`资源不存在：${dbUrl}`);
        return { ok: false };
      }
      Editor.Selection?.select('asset', uuid);
      return { ok: true, uuid, url: dbUrl };
    } catch (e) {
      await dialogError(`定位失败: ${e}`);
      return { ok: false };
    }
  },
};

export function load() {
  setTimeout(() => {
    ensureModules().catch((e) => console.warn('[battle-manager] initial scan failed', e));
  }, 800);

  // 连刷后：按原模块重开 Game编辑器（Creator 按 panel id 恢复停靠位）
  const restore = consumeHostRestore();
  if (restore?.open) {
    if (restore.moduleId) pendingModuleId = restore.moduleId;
    setTimeout(() => {
      void methods
        .openHost({ moduleId: restore.moduleId || undefined })
        .catch((e) => console.warn('[battle-manager] restore host panel failed', e));
    }, 500);
  }

  // 仅在「连刷宿主」后补场景对齐；冷启动不再盲发 soft-reload（会触发 WebView not attached）
  if (consumeNeedSceneRecover()) {
    setTimeout(() => {
      recoverSceneHierarchy().catch((e) =>
        console.warn('[battle-manager] post-load scene recover failed', e)
      );
    }, 1500);
  }
  console.log('[battle-manager] extension loaded');
}

export function unload() {
  cachedModules = [];
  // 保留 pendingModuleId 无意义（进程内会清）；恢复靠 temp 文件
  pendingModuleId = null;
  console.log('[battle-manager] extension unloaded');
}
