'use strict';

import { writeTextAsset } from './assetIo';
import { listLocalUnitCategories } from './browseCategories';
import { listLocalUnits } from './browseUnits';
import { createUnitAssets } from './createUnit';
import { deleteUnitAssets } from './deleteUnit';
import {
  DEFAULT_COLLISION_CENTER_Y,
  DEFAULT_COLLISION_HEIGHT,
  DEFAULT_COLLISION_RADIUS,
  indexDbUrl,
  indexFsPath,
  prefabDbUrl,
  UnitIndexJSON,
} from './paths';
import { scanUnitMountsOnDisk } from './scanMounts';
import { validateUnitOnDisk } from './validateUnit';
import * as fs from 'fs';

async function dialogConfirm(message: string): Promise<boolean> {
  try {
    const result = (await Editor.Dialog.warn(message, {
      title: '单位管理器',
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

const PKG = 'unit-editor';

async function dialogInfo(message: string): Promise<void> {
  try {
    await Editor.Dialog.info(message, { title: '单位管理器', buttons: ['确定'], default: 0 });
  } catch {
    console.log(`[unit-editor] ${message}`);
  }
}

async function dialogWarn(message: string): Promise<void> {
  try {
    await Editor.Dialog.warn(message, { title: '单位管理器', buttons: ['确定'], default: 0 });
  } catch {
    console.warn(`[unit-editor] ${message}`);
  }
}

async function dialogError(message: string): Promise<void> {
  try {
    await Editor.Dialog.error(message, { title: '单位管理器', buttons: ['确定'], default: 0 });
  } catch {
    console.error(`[unit-editor] ${message}`);
  }
}

/** 打开共享 Game编辑器宿主并选中单位相关模块（与战斗管理器同窗同级） */
async function openInGameEditor(moduleId: 'unit' | 'unit-category' = 'unit'): Promise<void> {
  try {
    await Editor.Message.request('battle-manager', 'select-module', { moduleId });
  } catch (e) {
    await dialogWarn(
      `无法打开 Game编辑器宿主（battle-manager）。请确认已启用 battle-manager。\n${e}`
    );
  }
}

async function applyCollisionVolumeInScene(unitId: number, item: UnitIndexJSON): Promise<string> {
  try {
    await new Promise((r) => setTimeout(r, 350));
    const sceneRes = (await Editor.Message.request('scene', 'execute-scene-script', {
      name: PKG,
      method: 'applyCollisionVolume',
      args: [
        {
          unitId,
          collisionRadius: item.collisionRadius ?? DEFAULT_COLLISION_RADIUS,
          collisionHeight: item.collisionHeight ?? DEFAULT_COLLISION_HEIGHT,
          collisionCenterY: item.collisionCenterY ?? DEFAULT_COLLISION_CENTER_Y,
        },
      ],
    })) as { ok?: boolean; reason?: string; volume?: Record<string, number> } | null;
    if (sceneRes?.ok) {
      const v = sceneRes.volume;
      return `\n已挂载碰撞范围可视化（R=${(v?.collisionRadius ?? 0).toFixed(2)} H=${(
        v?.collisionHeight ?? 0
      ).toFixed(2)}）`;
    }
    return `\n碰撞范围组件跳过: ${sceneRes?.reason || '请确认 Prefab 已打开'}`;
  } catch (e) {
    return `\n碰撞范围组件失败: ${e}`;
  }
}

export async function openUnit(arg: { unitId: number } | number): Promise<{ ok: boolean }> {
  const unitId = typeof arg === 'number' ? arg : arg?.unitId;
  if (!unitId) {
    await dialogWarn('请提供 unitId');
    return { ok: false };
  }
  const items = listLocalUnits();
  const item = items.find((u) => u.unitId === unitId);
  if (!item) {
    await dialogWarn(`单位 ${unitId} 不存在`);
    return { ok: false };
  }
  if (!item.prefab) {
    await dialogWarn(`单位 ${unitId} 未配置 prefab，请编辑 ${indexDbUrl(unitId)}`);
    return { ok: false };
  }
  try {
    await Editor.Message.request('asset-db', 'open-asset', prefabDbUrl(item.prefab));
    const note = await applyCollisionVolumeInScene(unitId, item);
    if (note) console.log(`[unit-editor] open ${unitId}${note}`);
    return { ok: true };
  } catch (e) {
    await dialogError(`打开 Prefab 失败: ${e}`);
    return { ok: false };
  }
}

export const methods = {
  async openHost() {
    return openInGameEditor('unit');
  },

  async browseUnits() {
    return openInGameEditor('unit');
  },

  async battleModuleInfo() {
    // 返回数组：单位管理器分组下的两个叶子（对齐 GameAsset UnitEntity / UnitCategory）
    return [
      {
        id: 'unit',
        packageName: PKG,
        title: '单位管理',
        order: 10,
        group: 'unit',
        groupTitle: '单位管理器',
        groupOrder: 10,
        itemIdKey: 'unitId',
        openArgKey: 'unitId',
        emptyHint: '暂无单位。请点「创建」。',
        exportLabel: '扫描挂点',
        openLabel: '打开Prefab',
        messages: {
          list: 'list-units',
          open: 'open-unit',
          exportOne: 'scan-unit-mounts',
          exportBatch: 'scan-unit-mounts-batch',
          create: 'create-unit',
          delete: 'delete-unit',
          locate: 'locate-unit',
        },
        // 行内「显示操作」里会出现「保存碰撞」
        extraActions: [
          {
            id: 'save-collision',
            label: '保存碰撞',
            message: 'save-unit-collision',
          },
        ],
      },
      {
        id: 'unit-category',
        packageName: PKG,
        title: '单位类型管理',
        order: 20,
        group: 'unit',
        groupTitle: '单位管理器',
        groupOrder: 10,
        itemIdKey: 'categoryId',
        openArgKey: 'categoryId',
        emptyHint: '暂无类型（由单位 index.category 汇总）。',
        openLabel: '查看',
        hideCreate: true,
        hideExport: true,
        messages: {
          list: 'list-unit-categories',
          open: 'open-unit-category',
          exportOne: 'scan-unit-mounts-batch',
          exportBatch: 'scan-unit-mounts-batch',
          create: 'create-unit',
        },
      },
    ];
  },

  async listUnits() {
    return listLocalUnits();
  },

  async listUnitCategories() {
    return listLocalUnitCategories();
  },

  async openUnitCategory(arg: { categoryId: number } | number) {
    const categoryId = typeof arg === 'number' ? arg : arg?.categoryId;
    const cats = listLocalUnitCategories();
    const cat = cats.find((c) => c.categoryId === categoryId);
    if (!cat) {
      await dialogWarn('类型不存在');
      return { ok: false };
    }
    const units = listLocalUnits().filter((u) => (u.category || 'uncategorized') === cat.name);
    const lines = units.map((u) => `· ${u.unitId} ${u.name} (${u.prefab || '无prefab'})`);
    await dialogInfo(`类型「${cat.name}」共 ${units.length} 个单位\n${lines.join('\n') || '(空)'}`);
    return { ok: true, category: cat.name, units };
  },

  async openUnit(arg: { unitId: number } | number) {
    return openUnit(arg);
  },

  async createUnit(arg?: { unitId?: number } | number) {
    const unitId = typeof arg === 'number' ? arg : arg?.unitId;
    if (!unitId || unitId <= 0) {
      // 菜单或未带编号时：弹出手动输入面板
      Editor.Panel.open(`${PKG}.create`);
      return { ok: false, cancelled: true };
    }
    const result = await createUnitAssets({ unitId });
    if (!result.ok) {
      await dialogError(result.error || '创建失败');
      return result;
    }
    try {
      await openInGameEditor('unit');
    } catch {
      /* ignore */
    }
    return result;
  },

  async createUnitApi(arg: {
    unitId?: number;
    name?: string;
    prefab?: string;
    category?: string;
    description?: string;
  }) {
    const unitId = arg?.unitId;
    if (!unitId || unitId <= 0) {
      return { ok: false, unitId: unitId || 0, error: '请手动指定 unitId' };
    }
    return createUnitAssets({
      unitId,
      name: arg?.name,
      prefab: arg?.prefab || '',
      category: arg?.category,
      description: arg?.description,
    });
  },

  async deleteUnit(arg: { unitId: number } | number) {
    const unitId = typeof arg === 'number' ? arg : arg?.unitId;
    if (!unitId) {
      await dialogWarn('请提供 unitId');
      return { ok: false };
    }
    const item = listLocalUnits().find((u) => u.unitId === unitId);
    const label = item ? `${unitId} ${item.name}` : String(unitId);
    const confirmed = await dialogConfirm(
      `确定删除单位 ${label}？\n将删除 assets/resources/units/${unitId}/（不可恢复）`
    );
    if (!confirmed) return { ok: false, cancelled: true };

    const result = await deleteUnitAssets(unitId);
    if (!result.ok) {
      await dialogError(result.error || '删除失败');
      return result;
    }
    await dialogInfo(`已删除单位 ${unitId}`);
    return result;
  },

  /** 在资源管理器中选中 Prefab（不打开编辑） */
  async locateUnit(arg: { unitId: number } | number) {
    const unitId = typeof arg === 'number' ? arg : arg?.unitId;
    if (!unitId) {
      await dialogWarn('请提供 unitId');
      return { ok: false };
    }
    const item = listLocalUnits().find((u) => u.unitId === unitId);
    if (!item) {
      await dialogWarn(`单位 ${unitId} 不存在`);
      return { ok: false };
    }
    // 无 prefab 时定位到单位目录
    const dbUrl = item.prefab
      ? prefabDbUrl(item.prefab)
      : `db://assets/resources/units/${unitId}`;
    try {
      const uuid = (await Editor.Message.request('asset-db', 'query-uuid', dbUrl)) as string | null;
      if (!uuid) {
        await dialogWarn(`资源不存在：${dbUrl}`);
        return { ok: false };
      }
      Editor.Selection?.select('asset', uuid);
      try {
        await Editor.Message.request('assets', 'twinkle', uuid);
      } catch {
        /* 部分版本无 twinkle */
      }
      return { ok: true, uuid, url: dbUrl };
    } catch (e) {
      await dialogError(`定位失败: ${e}`);
      return { ok: false };
    }
  },

  async validateUnit(arg: { unitId: number } | number) {
    const unitId = typeof arg === 'number' ? arg : arg?.unitId;
    if (!unitId) return { ok: false };
    const r = validateUnitOnDisk(unitId);
    const msg = r.ok
      ? `校验通过\n已识别槽位: ${r.foundSlots.join(', ')}\n${r.warnings.join('\n')}`
      : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
    if (r.ok) await dialogInfo(msg);
    else await dialogWarn(msg);
    return r;
  },

  async validateUnitGraph() {
    const items = listLocalUnits();
    if (items.length === 0) {
      await dialogWarn('没有可校验的单位');
      return;
    }
    const lines: string[] = [];
    for (const s of items) {
      const r = validateUnitOnDisk(s.unitId);
      lines.push(`[${r.ok ? 'OK' : 'FAIL'}] ${s.unitId} ${s.name}`);
      for (const e of r.errors) lines.push(`  - error: ${e}`);
      for (const w of r.warnings) lines.push(`  - warn: ${w}`);
    }
    await dialogInfo(lines.join('\n'));
  },

  async scanUnitMounts(arg: { unitId: number } | number) {
    const unitId = typeof arg === 'number' ? arg : arg?.unitId;
    if (!unitId) return { ok: false, error: 'missing unitId' };

    const disk = scanUnitMountsOnDisk(unitId);
    if (!disk.ok) {
      await dialogError(`扫描失败 ${unitId}: ${disk.error}`);
      return disk;
    }

    const item = listLocalUnits().find((u) => u.unitId === unitId);
    let sceneNote = '';
    if (item?.prefab) {
      try {
        await Editor.Message.request('asset-db', 'open-asset', prefabDbUrl(item.prefab));
        await new Promise((r) => setTimeout(r, 400));
        const sceneRes = (await Editor.Message.request('scene', 'execute-scene-script', {
          name: PKG,
          method: 'applyDecorator',
          args: [],
        })) as { ok?: boolean; mapped?: number; reason?: string } | null;
        if (sceneRes?.ok) {
          sceneNote = `\n场景已写入 Decorator（映射 ${sceneRes.mapped ?? 0} 条）`;
        } else {
          sceneNote = `\n场景写 Decorator 跳过: ${sceneRes?.reason || '请在 Prefab 编辑模式手动挂 EntityAttachmentSlotDecorator'}`;
        }
        sceneNote += await applyCollisionVolumeInScene(unitId, item);
      } catch (e) {
        sceneNote = `\n场景写 Decorator 失败（可稍后手动挂组件）: ${e}`;
      }
      try {
        await Editor.Message.request('asset-db', 'refresh-asset', prefabDbUrl(item.prefab));
      } catch {
        /* ignore */
      }
    }

    await dialogInfo(
      `单位 ${unitId} 挂点扫描完成\n新增节点: ${disk.added.join(', ') || '(无)'}\n映射: ${JSON.stringify(
        disk.mounts
      )}${sceneNote}`
    );
    return disk;
  },

  /**
   * 将 Prefab 上 UnitCollisionVolume 的 Inspector 数值写回 index.json。
   * 用法：打开 Prefab → 调半径/高度 → 调用本消息保存。
   */
  async saveUnitCollision(arg?: { unitId: number } | number) {
    type CollisionSceneRes = {
      ok?: boolean;
      reason?: string;
      volume?: Record<string, number>;
    };
    let sceneRes: CollisionSceneRes | null = null;
    try {
      sceneRes = (await Editor.Message.request('scene', 'execute-scene-script', {
        name: PKG,
        method: 'readCollisionVolume',
        args: [],
      })) as CollisionSceneRes | null;
    } catch (e) {
      await dialogError(`读取碰撞范围失败: ${e}\n请先打开单位 Prefab。`);
      return { ok: false };
    }
    const volume = sceneRes?.ok ? sceneRes.volume : null;
    if (!volume) {
      await dialogWarn(
        `未找到 UnitCollisionVolume。请先「打开Prefab」或「扫描挂点」。\n${sceneRes?.reason || ''}`
      );
      return { ok: false, reason: sceneRes?.reason };
    }

    let unitId = typeof arg === 'number' ? arg : arg?.unitId;
    if (!unitId || unitId <= 0) {
      unitId = (volume.unitId | 0) || 0;
    }
    if (!unitId) {
      await dialogWarn('无法确定 unitId：请在组件上填写 unitId，或从单位管理打开 Prefab 后再保存。');
      return { ok: false };
    }
    const item = listLocalUnits().find((u) => u.unitId === unitId);
    if (!item) {
      await dialogWarn(`单位 ${unitId} 不存在`);
      return { ok: false };
    }

    const indexPath = indexFsPath(unitId);
    // 勿把列表 UI 字段（hasPrefab / subtitle）写回 index.json
    const { hasPrefab: _hp, subtitle: _st, ...itemIndex } = item;
    let index: UnitIndexJSON = { ...itemIndex };
    if (fs.existsSync(indexPath)) {
      try {
        const disk = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as UnitIndexJSON;
        index = { ...index, ...disk };
      } catch {
        /* keep item */
      }
    }
    index.unitId = unitId;
    index.collisionRadius = Math.max(0.05, Number(volume.collisionRadius) || DEFAULT_COLLISION_RADIUS);
    index.collisionHeight = Math.max(0.1, Number(volume.collisionHeight) || DEFAULT_COLLISION_HEIGHT);
    index.collisionCenterY = Number.isFinite(Number(volume.collisionCenterY))
      ? Number(volume.collisionCenterY)
      : DEFAULT_COLLISION_CENTER_Y;
    const payload: UnitIndexJSON = {
      unitId: index.unitId,
      name: index.name,
      category: index.category,
      prefab: index.prefab,
      description: index.description,
      requiredSlots: index.requiredSlots,
      collisionRadius: index.collisionRadius,
      collisionHeight: index.collisionHeight,
      collisionCenterY: index.collisionCenterY,
    };

    const ok = await writeTextAsset(indexDbUrl(unitId), JSON.stringify(payload, null, 2));
    if (!ok) {
      await dialogError('写入 index.json 失败');
      return { ok: false };
    }
    await dialogInfo(
      `已保存单位 ${unitId} 碰撞范围到 index.json\n` +
        `R=${index.collisionRadius.toFixed(2)} H=${index.collisionHeight.toFixed(2)} ` +
        `Y=${index.collisionCenterY.toFixed(2)}`
    );
    return { ok: true, index: payload };
  },

  async scanUnitMountsBatch() {
    const items = listLocalUnits();
    if (items.length === 0) {
      await dialogWarn('没有可扫描的单位');
      return;
    }
    const lines: string[] = [];
    for (const s of items) {
      if (!s.prefab) {
        lines.push(`[SKIP] ${s.unitId} 无 prefab`);
        continue;
      }
      const r = scanUnitMountsOnDisk(s.unitId);
      lines.push(
        `[${r.ok ? 'OK' : 'FAIL'}] ${s.unitId} ${s.name} added=${(r.added || []).join('|') || '-'}`
      );
      if (r.error) lines.push(`  - ${r.error}`);
    }
    await dialogInfo(lines.join('\n'));
  },
};

export function load(): void {
  console.log('[unit-editor] loaded（接入 Game编辑器宿主，与战斗管理器同级分组）');
}

export function unload(): void {
  console.log('[unit-editor] unloaded');
}
