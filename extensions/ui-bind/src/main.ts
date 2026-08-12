'use strict';

import * as fs from 'fs';
import * as path from 'path';
import {
  scanPrefabFile,
  writeGenerated,
  PAN_ROLE_DEFAULT,
  bindResultFromCdeConfig,
  CdeConfigPayload,
} from './generateFromPrefab';

async function dialogInfo(message: string): Promise<void> {
  try {
    await Editor.Dialog.info(message, { title: 'UI Bind', buttons: ['确定'], default: 0 });
  } catch {
    console.log(`[ui-bind] ${message}`);
  }
}

async function dialogError(message: string): Promise<void> {
  try {
    await Editor.Dialog.error(message, { title: 'UI Bind', buttons: ['确定'], default: 0 });
  } catch {
    console.error(`[ui-bind] ${message}`);
  }
}

function projectRoot(): string {
  return Editor.Project.path;
}

async function refreshGenerated(tsPath: string, jsonPath: string): Promise<void> {
  try {
    const toDb = (p: string) => {
      const rel = path.relative(projectRoot(), p).replace(/\\/g, '/');
      return `db://assets/${rel.replace(/^assets\//, '')}`;
    };
    await Editor.Message.request('asset-db', 'refresh-asset', toDb(tsPath));
    await Editor.Message.request('asset-db', 'refresh-asset', toDb(jsonPath));
  } catch {
    // ignore refresh failures
  }
}

export function load() {
  //
}

export function unload() {
  //
}

/** 从资源选中的 prefab / CDE 生成 */
export async function generateFromPrefab() {
  try {
    const selected = Editor.Selection.getSelected('asset') || [];
    const uuidOrUrl = selected[0];
    if (!uuidOrUrl) {
      await dialogError('请先在资源管理器中选中一个 .prefab（UI 或 *_CDE）');
      return;
    }
    let prefabPath = '';
    try {
      const info = (await Editor.Message.request('asset-db', 'query-path', uuidOrUrl)) as string;
      prefabPath = info || '';
    } catch {
      prefabPath = '';
    }
    if (!prefabPath || !prefabPath.endsWith('.prefab')) {
      if (typeof uuidOrUrl === 'string' && uuidOrUrl.endsWith('.prefab') && fs.existsSync(uuidOrUrl)) {
        prefabPath = uuidOrUrl;
      }
    }
    if (!prefabPath || !fs.existsSync(prefabPath)) {
      await dialogError(`无法解析 Prefab 路径: ${uuidOrUrl}`);
      return;
    }
    const result = scanPrefabFile(prefabPath);
    const out = writeGenerated(projectRoot(), result);
    await refreshGenerated(out.tsPath, out.jsonPath);
    await dialogInfo(
      `已生成:\n${path.relative(projectRoot(), out.tsPath)}\n${path.relative(projectRoot(), out.jsonPath)}\n组件 ${result.components.length} / 事件 ${result.events.length} / 数据 ${result.data.length}`,
    );
  } catch (e) {
    await dialogError(String(e));
  }
}

/** 快捷：Pan_Role（优先新目录 CDE，其次 UI 预制体） */
export async function generatePanRole() {
  try {
    const candidates = [
      path.join(projectRoot(), 'assets/resources/UI/Pan_Role/Prefabs/Pan_Role_CDE.prefab'),
      path.join(projectRoot(), 'assets/resources/UI/Pan_Role/Prefabs/Pan_Role.prefab'),
      path.join(projectRoot(), 'assets/resources/Prefabs/UI/Pan_Role.prefab'),
    ];
    const prefabPath = candidates.find((p) => fs.existsSync(p));
    if (!prefabPath) {
      const out = writeGenerated(projectRoot(), PAN_ROLE_DEFAULT);
      await refreshGenerated(out.tsPath, out.jsonPath);
      await dialogInfo(`Prefab/CDE 不存在，已按默认表生成:\n${out.tsPath}`);
      return;
    }
    const result = scanPrefabFile(prefabPath, 'Pan_Role');
    const out = writeGenerated(projectRoot(), result);
    await refreshGenerated(out.tsPath, out.jsonPath);
    await dialogInfo(
      `Pan_Role 绑定已生成（源: ${path.relative(projectRoot(), prefabPath)}）:\n${path.relative(projectRoot(), out.tsPath)}\n组件 ${result.components.length} / 事件 ${result.events.length} / 数据 ${result.data.length}`,
    );
  } catch (e) {
    await dialogError(String(e));
  }
}

/**
 * 供 UIBindCDEConfigAsset「生成代码」勾选调用。
 * payload = ConfigAsset.toConfig() (+ 可选 panelName)
 */
export async function generateFromCde(payload: CdeConfigPayload) {
  try {
    if (!payload || typeof payload !== 'object') {
      await dialogError('CDE 载荷为空');
      return { ok: false };
    }
    const result = bindResultFromCdeConfig(payload);
    if (!result.panelName) {
      await dialogError('CDE 缺少 ResName / panelName');
      return { ok: false };
    }
    const out = writeGenerated(projectRoot(), result);
    await refreshGenerated(out.tsPath, out.jsonPath);
    console.log(
      `[ui-bind] 已从 CDE 生成 ${result.panelName}: C=${result.components.length} E=${result.events.length} D=${result.data.length}`,
    );
    return {
      ok: true,
      tsPath: out.tsPath,
      jsonPath: out.jsonPath,
      components: result.components.length,
      events: result.events.length,
      data: result.data.length,
    };
  } catch (e) {
    await dialogError(String(e));
    return { ok: false, error: String(e) };
  }
}

export const methods = {
  generateFromPrefab,
  generatePanRole,
  generateFromCde,
};
