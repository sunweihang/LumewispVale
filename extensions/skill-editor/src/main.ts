'use strict';

import { listLocalSkills } from './browseSkills';
import { createSkillAssets } from './createSkill';
import { exportAllFlagged, exportSkillTs } from './export/TsAbilityExporter';
import { allSkillRegisterNodes, SKILL_NODE_DEFS } from './nodes/skillNodes';
import { SKILL_PORT_TYPES } from './nodes/skillPortTypes';
import { graphDbUrl } from './paths';
import { buildSkillGraphProfile } from './profile';
import { buildExtension, reloadExtensionPackage } from './reloadExtension';
import { syncSkillGraphOnDisk } from './syncSkillGraphPorts';
import { validateSkillOnDisk } from './validateSkillGraph';

const PKG = 'skill-editor';
const NODE_GRAPH = 'node-graph';

let registered = false;

async function dialogInfo(message: string): Promise<void> {
  try {
    await Editor.Dialog.info(message, { title: '技能编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.log(`[skill-editor] ${message}`);
  }
}

async function dialogWarn(message: string): Promise<void> {
  try {
    await Editor.Dialog.warn(message, { title: '技能编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.warn(`[skill-editor] ${message}`);
  }
}

async function dialogError(message: string): Promise<void> {
  try {
    await Editor.Dialog.error(message, { title: '技能编辑器', buttons: ['确定'], default: 0 });
  } catch {
    console.error(`[skill-editor] ${message}`);
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
    await dialogWarn('未检测到 node-graph 扩展。请先启用「node-graph」，再使用技能编辑器。');
  }
  return false;
}

async function skillNodesMissingFromRegistry(): Promise<boolean> {
  try {
    const defs = (await Editor.Message.request(NODE_GRAPH, 'query-node-defs')) as
      | { typeName?: string }[]
      | null;
    const names = new Set((defs ?? []).map((d) => d?.typeName).filter(Boolean) as string[]);
    // Entrance is always required; if missing, node-graph was reloaded without us.
    return !names.has('AbilityEntranceBlueprint');
  } catch {
    return true;
  }
}

export async function ensureRegistered(silent = false): Promise<{ ok: boolean }> {
  if (!(await ensureNodeGraph(silent))) return { ok: false };
  if (registered && !(await skillNodesMissingFromRegistry())) return { ok: true };
  try {
    const nodes = allSkillRegisterNodes();
    await Editor.Message.request(NODE_GRAPH, 'register-port-types', { portTypes: SKILL_PORT_TYPES });
    await Editor.Message.request(NODE_GRAPH, 'register-nodes', { nodes });
    registered = true;
    console.log(`[skill-editor] registered ${nodes.length} skill nodes (${SKILL_NODE_DEFS.length} domain + builtins)`);
    return { ok: true };
  } catch (e) {
    registered = false;
    if (silent) console.warn('[skill-editor] register failed', e);
    else await dialogError(`注册技能节点失败: ${e}`);
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
  console.warn('[skill-editor] node-graph still unavailable after retries; will register on first use');
}

export async function openSkill(arg: { skillId: number } | number): Promise<{ ok: boolean }> {
  const skillId = typeof arg === 'number' ? arg : arg?.skillId;
  if (!skillId) {
    await dialogWarn('请提供 skillId');
    return { ok: false };
  }
  if (!(await ensureRegistered()).ok) return { ok: false };

  // 打开前按定义同步针脚（补「当前命中单位」等新增口）
  syncSkillGraphOnDisk(skillId);

  await Editor.Message.request(NODE_GRAPH, 'open-graph', {
    path: graphDbUrl(skillId),
    profile: buildSkillGraphProfile(),
  });
  return { ok: true };
}

async function promptSkillId(defaultId: number, title: string): Promise<number | null> {
  // Cocos Dialog has no standard prompt; use next id or parse from a simple confirm flow.
  // Browser panel is preferred for pick; menus fall back to auto id / first skill.
  void title;
  return defaultId;
}

export const methods = {
  async ensureRegistered() {
    return ensureRegistered();
  },

  async browseSkills() {
    await ensureRegistered();
    // 优先打开战斗管理器统一页签（对齐 GameAssets）
    try {
      await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'skill' });
      return;
    } catch {
      Editor.Panel.open(`${PKG}.browser`);
    }
  },

  async battleModuleInfo() {
    return {
      id: 'skill',
      packageName: PKG,
      title: '技能',
      order: 10,
      group: 'battle',
      groupTitle: '战斗管理器',
      groupOrder: 20,
      itemIdKey: 'skillId',
      openArgKey: 'skillId',
      emptyHint: '暂无技能。请点「创建」。',
      messages: {
        list: 'list-skills',
        open: 'open-skill',
        exportOne: 'export-skill',
        exportBatch: 'export-ts-batch',
        create: 'create-skill',
        validateOne: 'validate-skill',
      },
    };
  },

  async validateSkill(arg: { skillId: number } | number) {
    const skillId = typeof arg === 'number' ? arg : arg?.skillId;
    if (!skillId) return { ok: false };
    const r = validateSkillOnDisk(skillId);
    const msg = r.ok
      ? `校验通过\n${r.warnings.join('\n')}`
      : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
    if (r.ok) await dialogInfo(msg);
    else await dialogWarn(msg);
    return r;
  },

  async createSkill(arg?: { skillId?: number } | number) {
    if (!(await ensureRegistered()).ok) return { ok: false };
    const skillId = typeof arg === 'number' ? arg : arg?.skillId;
    if (!skillId || skillId <= 0) {
      Editor.Panel.open(`${PKG}.create`);
      return { ok: false, cancelled: true };
    }
    const result = await createSkillAssets({
      skillId,
      name: `Skill ${skillId}`,
      exportFlag: true,
    });
    if (!result.ok) {
      await dialogError(result.error || '创建失败');
      return result;
    }
    return result;
  },

  async createSkillApi(arg: { skillId?: number; name?: string; description?: string; exportFlag?: boolean }) {
    if (!(await ensureRegistered()).ok) return { ok: false, error: 'node-graph 未就绪' };
    const skillId = arg?.skillId;
    if (!skillId || skillId <= 0) {
      return { ok: false, error: '请手动指定 skillId' };
    }
    return createSkillAssets({
      skillId,
      name: arg?.name || `Skill ${skillId}`,
      description: arg?.description,
      exportFlag: arg?.exportFlag ?? true,
    });
  },

  async editSkillGraph() {
    if (!(await ensureRegistered()).ok) return;
    const skills = listLocalSkills();
    if (skills.length === 0) {
      await dialogWarn('还没有技能图。请先「创建技能」。');
      return;
    }
    // open browser to pick; also open last/highest id as convenience
    Editor.Panel.open(`${PKG}.browser`);
    const last = skills[skills.length - 1];
    await openSkill(last.skillId);
  },

  async openSkill(arg: { skillId: number } | number) {
    return openSkill(arg);
  },

  async listSkills() {
    return listLocalSkills();
  },

  async validateSkillGraph() {
    const skills = listLocalSkills();
    if (skills.length === 0) {
      await dialogWarn('没有可校验的技能');
      return;
    }
    const lines: string[] = [];
    for (const s of skills) {
      const r = validateSkillOnDisk(s.skillId);
      const status = r.ok ? 'OK' : 'FAIL';
      lines.push(`[${status}] ${s.skillId} ${s.name} · ${s.tbAbilityHint}`);
      for (const e of r.errors) lines.push(`  - error: ${e}`);
      for (const w of r.warnings) lines.push(`  - warn: ${w}`);
    }
    await dialogInfo(lines.join('\n'));
  },

  async exportTs() {
    const skills = listLocalSkills();
    if (skills.length === 0) {
      await dialogWarn('没有可导出的技能');
      return;
    }
    const last = skills[skills.length - 1];
    const r = exportSkillTs(last.skillId);
    if (!r.ok) {
      await dialogError(`导出失败 ${last.skillId}: ${r.error}`);
      return;
    }
    await dialogInfo(`已导出 ${last.skillId}\n${r.path}`);
  },

  async exportSkill(arg: { skillId: number } | number) {
    const skillId = typeof arg === 'number' ? arg : arg?.skillId;
    if (!skillId) return { ok: false, error: 'missing skillId' };
    const r = exportSkillTs(skillId);
    if (!r.ok) await dialogError(`导出失败: ${r.error}`);
    else await dialogInfo(`已导出 ${skillId}\n${r.path}`);
    return r;
  },

  async exportTsBatch() {
    const { ok, fail, results } = exportAllFlagged();
    const detail = results
      .map((r) => (r.ok ? `OK ${r.skillId}` : `FAIL ${r.skillId}: ${r.error}`))
      .join('\n');
    await dialogInfo(`批量导出完成：成功 ${ok}，失败 ${fail}\n${detail}`);
    return { ok, fail };
  },

  async openSkillDebugScene() {
    // 正式关卡场景（有材质/地图），不要用空壳粉屏场景
    const SCENE_URL = 'db://assets/Scene/Level.scene';
    try {
      await Editor.Message.request('asset-db', 'open-asset', SCENE_URL);
    } catch {
      try {
        await Editor.Message.request('scene', 'open-scene', SCENE_URL);
      } catch (e) {
        await dialogError(`无法打开 Level 场景:\n${SCENE_URL}\n${e}`);
        return { ok: false };
      }
    }
    await dialogInfo(
      '已打开正式关卡 Level.scene。\n运行后：\n' +
        'F9 = 开关「点地种怪」\n' +
        'G = 图技能施法一次（AbilityRuntime）\n' +
        'C = 清除假目标（种怪模式开启时）\n' +
        '摇杆 = 移动主角（与运行时一致）'
    );
    return { ok: true };
  },

  /** 转调战斗管理器：仅刷新全部扩展 */
  async reloadExtension() {
    try {
      return await Editor.Message.request('battle-manager', 'reload-all-extensions');
    } catch (e) {
      console.warn('[skill-editor] battle-manager unavailable, fallback self reload', e);
      try {
        await reloadExtensionPackage(PKG);
        return { ok: true };
      } catch (e2) {
        await dialogError(`刷新扩展失败:\n${e2}`);
        return { ok: false };
      }
    }
  },

  /** 转调战斗管理器：编译并刷新全部扩展 */
  async rebuildAndReload() {
    try {
      return await Editor.Message.request('battle-manager', 'rebuild-and-reload-all');
    } catch (e) {
      console.warn('[skill-editor] battle-manager unavailable, fallback self rebuild', e);
      const built = await buildExtension();
      if (!built.ok) {
        await dialogError(`编译失败，未刷新扩展。\n\n${built.log}`);
        return { ok: false };
      }
      try {
        await reloadExtensionPackage(PKG);
        return { ok: true };
      } catch (e2) {
        await dialogError(`编译成功，但刷新扩展失败:\n${e2}`);
        return { ok: false };
      }
    }
  },
};

export function load() {
  autoRegisterWithRetry().catch((e) => console.warn('[skill-editor] auto-register failed', e));
  console.log('[skill-editor] extension loaded');
}

export function unload() {
  registered = false;
  console.log('[skill-editor] extension unloaded');
}

// silence unused
void promptSkillId;
