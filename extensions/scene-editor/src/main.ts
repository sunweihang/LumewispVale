'use strict';

import {
  defaultPlantable,
  listPlantableAvatars,
  resolvePlantableFromItem,
} from './browsePlantables';
import { listLocalSceneCategories } from './browseCategories';
import { listLocalLogicScenes } from './browseLogicScenes';
import { listLocalScenes } from './browseScenes';
import {
  blockPlantToCells,
  cellsToBlockPlant,
  loadResourceSceneIndex,
  saveResourceBlockPlant,
} from './blockPlantIO';
import {
  stampBrushCells,
  worldToCell,
} from './blockPlantUtil';
import { createLogicSceneAssets, nextLogicId } from './createLogicScene';
import { createSceneAssets } from './createScene';
import { deleteSceneAssets } from './deleteScene';
import { resolveLogicPair, saveLogicMonsterSpawn } from './logicSpawnIO';
import { migrateAllChapters } from './migrateChapters';
import { ensureMonsterSpawn } from './monsterSpawnUtil';
import { logicIndexDbUrl, prefabDbUrl, sceneFolderDbUrl } from './paths';
import { listSpawnConfigsForLogic } from './spawnConfigIO';
import { syncSpawnBatch, syncSpawnForLogic } from './syncSpawnFromPrefab';
import {
  validateLogicSceneOnDisk,
  validateSceneOnDisk,
} from './validateScene';

const PKG = 'scene-editor';

/** 种植编辑器当前上下文 */
let _spawnEditorLogicId = 0;
/** 阻挡种植编辑器当前资源场景 */
let _blockPlantSceneId = 0;

async function dialogInfo(message: string): Promise<void> {
  try {
    await Editor.Dialog.info(message, { title: '场景管理', buttons: ['确定'], default: 0 });
  } catch {
    console.log(`[scene-editor] ${message}`);
  }
}

async function dialogWarn(message: string): Promise<void> {
  try {
    await Editor.Dialog.warn(message, { title: '场景管理', buttons: ['确定'], default: 0 });
  } catch {
    console.warn(`[scene-editor] ${message}`);
  }
}

async function dialogError(message: string): Promise<void> {
  try {
    await Editor.Dialog.error(message, { title: '场景管理', buttons: ['确定'], default: 0 });
  } catch {
    console.error(`[scene-editor] ${message}`);
  }
}

async function dialogConfirm(message: string, okLabel = '确定'): Promise<boolean> {
  try {
    const result = (await Editor.Dialog.warn(message, {
      title: '场景管理',
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

async function openInGameEditor(
  moduleId: 'resource-scene' | 'block-plant' | 'logic-scene' | 'scene-category' = 'resource-scene'
): Promise<void> {
  try {
    await Editor.Message.request('battle-manager', 'select-module', { moduleId });
  } catch (e) {
    await dialogWarn(
      `无法打开 Game编辑器宿主（battle-manager）。请确认已启用 battle-manager。\n${e}`
    );
  }
}

export async function openScene(arg: { sceneId: number } | number): Promise<{ ok: boolean }> {
  const sceneId = typeof arg === 'number' ? arg : arg?.sceneId;
  if (!sceneId) {
    await dialogWarn('请提供 sceneId');
    return { ok: false };
  }
  const item = listLocalScenes().find((s) => s.sceneId === sceneId);
  if (!item) {
    await dialogWarn(`场景 ${sceneId} 不存在`);
    return { ok: false };
  }
  if (!item.prefab) {
    await dialogWarn(`场景 ${sceneId} 未配置 prefab`);
    return { ok: false };
  }
  try {
    await Editor.Message.request('asset-db', 'open-asset', prefabDbUrl(item.prefab));
    return { ok: true };
  } catch (e) {
    await dialogError(`打开 Prefab 失败: ${e}`);
    return { ok: false };
  }
}

async function openSpawnEditor(logicId: number): Promise<{ ok: boolean; error?: string }> {
  const logic = listLocalLogicScenes().find((l) => l.logicId === logicId);
  if (!logic) {
    await dialogWarn(`逻辑场景 ${logicId} 不存在`);
    return { ok: false, error: '逻辑场景不存在' };
  }
  _spawnEditorLogicId = logicId;
  // 先打开资源 Prefab，便于场景里看到种植预览
  try {
    await openScene(logic.assetsSceneId);
  } catch {
    /* ignore */
  }
  try {
    Editor.Panel.open(`${PKG}.spawn-editor`);
    return { ok: true };
  } catch (e) {
    await dialogError(`打开种植编辑器失败: ${e}`);
    return { ok: false, error: String(e) };
  }
}

async function openBlockPlantEditor(sceneId: number): Promise<{ ok: boolean; error?: string }> {
  const item = listLocalScenes().find((s) => s.sceneId === sceneId);
  if (!item) {
    await dialogWarn(`资源场景 ${sceneId} 不存在`);
    return { ok: false, error: '资源场景不存在' };
  }
  _blockPlantSceneId = sceneId;
  try {
    await openScene(sceneId);
  } catch {
    /* ignore */
  }
  try {
    Editor.Panel.open(`${PKG}.block-plant-editor`);
    return { ok: true };
  } catch (e) {
    await dialogError(`打开阻挡种植编辑器失败: ${e}`);
    return { ok: false, error: String(e) };
  }
}

async function previewBlocksInScene(arg: {
  sceneId?: number;
  cells?: string[];
  cellSize?: number;
  originX?: number;
  originZ?: number;
  brushRadius?: number;
  openPrefab?: boolean;
  showBrush?: boolean;
}): Promise<{ ok: boolean; reason?: string; count?: number }> {
  const sceneId = arg?.sceneId || _blockPlantSceneId;
  if (arg?.openPrefab !== false && sceneId) {
    await openScene(sceneId);
    await new Promise((r) => setTimeout(r, 350));
  }
  try {
    const res = (await Editor.Message.request('scene', 'execute-scene-script', {
      name: PKG,
      method: 'previewBlockPlant',
      args: [
        {
          cells: arg?.cells || [],
          cellSize: arg?.cellSize ?? 1,
          originX: arg?.originX ?? 0,
          originZ: arg?.originZ ?? 0,
          brushRadius: arg?.brushRadius ?? 1,
          // 仅预览已有阻挡时不挂笔刷光标；开笔刷工具时再挂
          showBrush: arg?.showBrush === true,
        },
      ],
    })) as { ok?: boolean; reason?: string; count?: number } | null;
    if (!res) return { ok: false, reason: 'scene script 无返回' };
    return { ok: !!res.ok, reason: res.reason, count: res.count };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

async function syncBlockCellsInScene(arg: {
  cells?: string[];
  cellSize?: number;
  originX?: number;
  originZ?: number;
  brushRadius?: number;
}): Promise<{ ok: boolean; reason?: string; count?: number }> {
  try {
    const res = (await Editor.Message.request('scene', 'execute-scene-script', {
      name: PKG,
      method: 'syncBlockPlantCells',
      args: [
        {
          cells: arg?.cells || [],
          cellSize: arg?.cellSize ?? 1,
          originX: arg?.originX ?? 0,
          originZ: arg?.originZ ?? 0,
          brushRadius: arg?.brushRadius ?? 1,
        },
      ],
    })) as { ok?: boolean; reason?: string; count?: number } | null;
    if (!res) return { ok: false, reason: 'scene script 无返回' };
    return { ok: !!res.ok, reason: res.reason, count: res.count };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

type BrushPaintArg = {
  cells?: string[];
  cellSize?: number;
  originX?: number;
  originZ?: number;
  brushRadius?: number;
  erase?: boolean;
  x?: number;
  z?: number;
};

async function applyBlockBrushAtWorld(arg: BrushPaintArg) {
  try {
    const cellSize = arg?.cellSize && arg.cellSize > 0 ? arg.cellSize : 1;
    const originX = Number(arg?.originX) || 0;
    const originZ = Number(arg?.originZ) || 0;
    const x = Number(arg?.x);
    const z = Number(arg?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return { ok: false, reason: '无效坐标', cells: arg?.cells || [] };
    }
    await Editor.Message.request('scene', 'execute-scene-script', {
      name: PKG,
      method: 'moveBlockBrushTo',
      args: [
        {
          x,
          z,
          cellSize,
          brushRadius: arg?.brushRadius ?? 1,
          originX,
          originZ,
          snapCell: true,
        },
      ],
    });
    const set = new Set(arg?.cells || []);
    const c = worldToCell(x, z, cellSize, originX, originZ);
    stampBrushCells(set, c.cx, c.cz, arg?.brushRadius ?? 1, !!arg?.erase);
    return { ok: true, cells: [...set], x, z, cx: c.cx, cz: c.cz };
  } catch (e) {
    return { ok: false, reason: String(e), cells: arg?.cells || [] };
  }
}

async function applyBlockBrushAtAim(arg: Omit<BrushPaintArg, 'x' | 'z'>) {
  try {
    const hit = (await Editor.Message.request('scene', 'execute-scene-script', {
      name: PKG,
      method: 'pickGroundFromCamera',
      args: [{ groundY: 0 }],
    })) as { ok?: boolean; reason?: string; x?: number; z?: number } | null;
    if (!hit?.ok) {
      return { ok: false, reason: hit?.reason || '镜头未对准地面', cells: arg?.cells || [] };
    }
    return applyBlockBrushAtWorld({ ...arg, x: hit.x, z: hit.z });
  } catch (e) {
    return { ok: false, reason: String(e), cells: arg?.cells || [] };
  }
}

async function applyBlockBrushAtSelection(arg: Omit<BrushPaintArg, 'x' | 'z'>) {
  try {
    const selected = Editor.Selection?.getSelected?.('node') || [];
    const uuid = selected[0];
    if (!uuid) {
      return { ok: false, reason: '请先在 Hierarchy 选中一个节点', cells: arg?.cells || [] };
    }
    const hit = (await Editor.Message.request('scene', 'execute-scene-script', {
      name: PKG,
      method: 'queryNodeWorldPos',
      args: [{ uuid }],
    })) as { ok?: boolean; reason?: string; x?: number; z?: number } | null;
    if (!hit?.ok) {
      return { ok: false, reason: hit?.reason || '未选中节点', cells: arg?.cells || [] };
    }
    return applyBlockBrushAtWorld({ ...arg, x: hit.x, z: hit.z });
  } catch (e) {
    return { ok: false, reason: String(e), cells: arg?.cells || [] };
  }
}

async function nudgeBlockBrush(
  arg: Omit<BrushPaintArg, 'x' | 'z'> & { dx?: number; dz?: number; paint?: boolean }
) {
  try {
    const cellSize = arg?.cellSize && arg.cellSize > 0 ? arg.cellSize : 1;
    const originX = Number(arg?.originX) || 0;
    const originZ = Number(arg?.originZ) || 0;
    const cursor = (await Editor.Message.request('scene', 'execute-scene-script', {
      name: PKG,
      method: 'queryBlockBrushCursor',
      args: [],
    })) as { ok?: boolean; reason?: string; x?: number; z?: number } | null;
    if (!cursor?.ok) {
      return { ok: false, reason: cursor?.reason || '无笔刷', cells: arg?.cells || [] };
    }
    const dx = Math.round(Number(arg?.dx) || 0);
    const dz = Math.round(Number(arg?.dz) || 0);
    const x = (cursor.x || 0) + dx * cellSize;
    const z = (cursor.z || 0) + dz * cellSize;
    if (arg?.paint) {
      return applyBlockBrushAtWorld({
        cells: arg?.cells,
        cellSize,
        originX,
        originZ,
        brushRadius: arg?.brushRadius ?? 1,
        erase: !!arg?.erase,
        x,
        z,
      });
    }
    await Editor.Message.request('scene', 'execute-scene-script', {
      name: PKG,
      method: 'moveBlockBrushTo',
      args: [
        {
          x,
          z,
          cellSize,
          brushRadius: arg?.brushRadius ?? 1,
          originX,
          originZ,
          snapCell: true,
        },
      ],
    });
    return { ok: true, cells: arg?.cells || [], x, z };
  } catch (e) {
    return { ok: false, reason: String(e), cells: arg?.cells || [] };
  }
}

type PreviewItem = {
  position?: { x?: number; y?: number; z?: number };
  scale?: { x?: number; y?: number; z?: number };
  eulerAngles?: { x?: number; y?: number; z?: number };
  enemyKeys?: string[];
  enemyCount?: number;
  monsterKey?: string;
  unitConfigId?: number;
  unitKind?: 'monster' | 'hero';
  avatarId?: number;
  spawnShape?: 'area' | 'point';
  level?: number;
  /** 仅预览用，不落盘 */
  previewPrefabUuid?: string;
  previewModelId?: number;
};

async function resolvePreviewPrefabUuid(modelId: number, prefabRel: string): Promise<string | null> {
  try {
    const uuid = (await Editor.Message.request(
      'asset-db',
      'query-uuid',
      prefabDbUrl(prefabRel)
    )) as string | null;
    return uuid || null;
  } catch {
    console.warn('[scene-editor] preview prefab uuid missing', modelId, prefabRel);
    return null;
  }
}

/** 为场景预览补上 avatar.model → unit prefab uuid */
async function enrichLayersForPreview(
  layers: Array<{ layerId?: number; layerName?: string; items?: PreviewItem[] }>
): Promise<typeof layers> {
  const catalog = listPlantableAvatars();
  const uuidCache = new Map<number, string | null>();

  const enriched = [];
  for (const layer of layers || []) {
    const items: PreviewItem[] = [];
    for (const raw of layer.items || []) {
      const item: PreviewItem = { ...raw };
      const hit =
        resolvePlantableFromItem(item) ||
        (item.avatarId
          ? (() => {
              const avatar = catalog.find((a) => a.avatarId === item.avatarId);
              return avatar?.configs[0] ? { avatar, config: avatar.configs[0] } : null;
            })()
          : null);
      if (hit) {
        item.previewModelId = hit.avatar.model;
        if (!uuidCache.has(hit.avatar.model)) {
          uuidCache.set(
            hit.avatar.model,
            await resolvePreviewPrefabUuid(hit.avatar.model, hit.avatar.prefab)
          );
        }
        const uuid = uuidCache.get(hit.avatar.model);
        if (uuid) item.previewPrefabUuid = uuid;
      }
      items.push(item);
    }
    enriched.push({ ...layer, items });
  }
  return enriched;
}

async function previewSpawnInScene(arg: {
  assetsSceneId?: number;
  layers?: Array<{ layerId?: number; layerName?: string; items?: PreviewItem[] }>;
  layerIndex?: number;
  showAllLayers?: boolean;
  openPrefab?: boolean;
}): Promise<{ ok: boolean; reason?: string; count?: number }> {
  const assetsSceneId = arg?.assetsSceneId;
  if (arg?.openPrefab !== false && assetsSceneId) {
    await openScene(assetsSceneId);
    // Prefab 打开需要一点时间再挂预览节点
    await new Promise((r) => setTimeout(r, 350));
  }
  try {
    const layers = await enrichLayersForPreview(arg?.layers ?? []);
    const res = (await Editor.Message.request('scene', 'execute-scene-script', {
      name: PKG,
      method: 'previewMonsterSpawn',
      args: [
        {
          layers,
          layerIndex: arg?.layerIndex ?? 0,
          showAllLayers: !!arg?.showAllLayers,
        },
      ],
    })) as { ok?: boolean; reason?: string; count?: number } | null;
    if (!res) return { ok: false, reason: 'scene script 无返回' };
    return { ok: !!res.ok, reason: res.reason, count: res.count };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

export const methods = {
  async openHost() {
    return openInGameEditor('logic-scene');
  },

  async browseScenes() {
    return openInGameEditor('resource-scene');
  },

  async battleModuleInfo() {
    return [
      {
        id: 'resource-scene',
        packageName: PKG,
        title: '资源场景',
        order: 10,
        group: 'scene',
        groupTitle: '场景管理',
        groupOrder: 15,
        itemIdKey: 'sceneId',
        openArgKey: 'sceneId',
        emptyHint: '暂无资源场景。请「创建」或「迁移现有关卡」。',
        openLabel: '打开Prefab',
        hideExport: true,
        messages: {
          list: 'list-scenes',
          open: 'open-scene',
          exportOne: 'sync-spawn',
          exportBatch: 'sync-spawn-batch',
          create: 'create-scene',
          delete: 'delete-scene',
          locate: 'locate-scene',
          validateOne: 'validate-scene',
        },
        extraActions: [
          {
            id: 'migrate',
            label: '迁移关卡',
            message: 'migrate-chapters',
          },
          {
            id: 'sync-default-logic',
            label: '同步到默认逻辑',
            message: 'sync-spawn',
          },
        ],
      },
      {
        id: 'block-plant',
        packageName: PKG,
        title: '阻挡种植',
        order: 15,
        group: 'scene',
        groupTitle: '场景管理',
        groupOrder: 15,
        itemIdKey: 'sceneId',
        openArgKey: 'sceneId',
        emptyHint: '暂无资源场景。请先在「资源场景」创建，再编辑阻挡。',
        openLabel: '编辑阻挡',
        hideCreate: true,
        hideExport: true,
        messages: {
          list: 'list-scenes',
          open: 'open-block-plant',
          exportOne: 'sync-spawn',
          exportBatch: 'sync-spawn-batch',
          create: 'create-scene',
          locate: 'locate-scene',
          validateOne: 'validate-scene',
        },
        extraActions: [
          {
            id: 'open-prefab',
            label: '打开Prefab',
            message: 'open-scene',
          },
        ],
      },
      {
        id: 'logic-scene',
        packageName: PKG,
        title: '逻辑场景',
        order: 20,
        group: 'scene',
        groupTitle: '场景管理',
        groupOrder: 15,
        itemIdKey: 'logicId',
        openArgKey: 'logicId',
        emptyHint: '暂无逻辑场景。请点「创建」并绑定资源场景，再「编辑种植」。',
        openLabel: '编辑种植',
        hideExport: true,
        messages: {
          list: 'list-logic-scenes',
          open: 'open-logic-scene',
          exportOne: 'sync-spawn',
          exportBatch: 'sync-spawn-batch',
          create: 'create-logic-scene',
          validateOne: 'validate-logic-scene',
          locate: 'locate-logic-scene',
        },
        extraActions: [
          {
            id: 'open-resource-prefab',
            label: '打开资源Prefab',
            message: 'open-logic-resource-prefab',
          },
          {
            id: 'import-from-prefab',
            label: '从Prefab导入',
            message: 'sync-spawn',
          },
        ],
      },
      {
        id: 'scene-category',
        packageName: PKG,
        title: '类型配置',
        order: 30,
        group: 'scene',
        groupTitle: '场景管理',
        groupOrder: 15,
        itemIdKey: 'categoryId',
        openArgKey: 'categoryId',
        emptyHint: '暂无类型（由资源场景 index.category 汇总）。',
        openLabel: '查看',
        hideCreate: true,
        hideExport: true,
        messages: {
          list: 'list-scene-categories',
          open: 'open-scene-category',
          exportOne: 'sync-spawn-batch',
          exportBatch: 'sync-spawn-batch',
          create: 'create-scene',
        },
      },
    ];
  },

  async listScenes() {
    return listLocalScenes();
  },

  async listLogicScenes() {
    return listLocalLogicScenes();
  },

  async listSceneCategories() {
    return listLocalSceneCategories();
  },

  async openScene(arg: { sceneId: number } | number) {
    return openScene(arg);
  },

  /** 逻辑场景主操作：打开种植编辑器 */
  async openLogicScene(arg: { logicId: number } | number) {
    const logicId = typeof arg === 'number' ? arg : arg?.logicId;
    if (!logicId) {
      await dialogWarn('请提供 logicId');
      return { ok: false };
    }
    return openSpawnEditor(logicId);
  },

  async openLogicResourcePrefab(arg: { logicId: number } | number) {
    const logicId = typeof arg === 'number' ? arg : arg?.logicId;
    if (!logicId) {
      await dialogWarn('请提供 logicId');
      return { ok: false };
    }
    const logic = listLocalLogicScenes().find((l) => l.logicId === logicId);
    if (!logic) {
      await dialogWarn(`逻辑场景 ${logicId} 不存在`);
      return { ok: false };
    }
    return openScene(logic.assetsSceneId);
  },

  async openSceneCategory(arg: { categoryId: number } | number) {
    const categoryId = typeof arg === 'number' ? arg : arg?.categoryId;
    const cats = listLocalSceneCategories();
    const cat = cats.find((c) => c.categoryId === categoryId);
    if (!cat) {
      await dialogWarn('类型不存在');
      return { ok: false };
    }
    const scenes = listLocalScenes().filter(
      (s) => (s.category || 'uncategorized') === cat.name
    );
    const lines = scenes.map(
      (s) => `· ${s.sceneId} ${s.name} (${s.poolName || s.prefab || '无'})`
    );
    await dialogInfo(`类型「${cat.name}」共 ${scenes.length} 个场景\n${lines.join('\n') || '(空)'}`);
    return { ok: true, category: cat.name, scenes };
  },

  async createScene(arg?: { sceneId?: number } | number) {
    const sceneId = typeof arg === 'number' ? arg : arg?.sceneId;
    if (!sceneId || sceneId <= 0) {
      Editor.Panel.open(`${PKG}.create-scene`);
      return { ok: false, cancelled: true };
    }
    const result = await createSceneAssets({ sceneId, createLogic: false });
    if (!result.ok) {
      await dialogError(result.error || '创建失败');
      return result;
    }
    try {
      await openInGameEditor('resource-scene');
    } catch {
      /* ignore */
    }
    return result;
  },

  async createSceneApi(arg: {
    sceneId?: number;
    name?: string;
    poolName?: string;
    category?: string;
    description?: string;
    prefab?: string;
  }) {
    const sceneId = arg?.sceneId;
    if (!sceneId || sceneId <= 0) {
      return { ok: false, sceneId: 0, error: '请手动指定 sceneId' };
    }
    return createSceneAssets({
      sceneId,
      name: arg?.name,
      poolName: arg?.poolName,
      category: arg?.category,
      description: arg?.description,
      prefab: arg?.prefab,
      createLogic: false,
    });
  },

  /** 打开创建逻辑场景面板（选资源场景 + logicId） */
  async createLogicScene() {
    const scenes = listLocalScenes();
    if (scenes.length === 0) {
      await dialogWarn('请先创建资源场景');
      return { ok: false };
    }
    try {
      Editor.Panel.open(`${PKG}.create-logic`);
      return { ok: true };
    } catch (e) {
      await dialogError(`打开创建面板失败: ${e}`);
      return { ok: false };
    }
  },

  async createLogicSceneApi(arg: {
    logicId?: number;
    assetsSceneId: number;
    name?: string;
    category?: string;
  }) {
    if (!arg?.assetsSceneId) return { ok: false, logicId: 0, error: '需要 assetsSceneId' };
    const logicId = arg.logicId;
    if (!logicId || logicId <= 0) {
      return { ok: false, logicId: 0, error: '请手动指定 logicId' };
    }
    return createLogicSceneAssets({
      logicId,
      assetsSceneId: arg.assetsSceneId,
      name: arg.name,
      category: arg.category,
    });
  },

  async suggestLogicId(arg: { assetsSceneId: number }) {
    const assetsSceneId = arg?.assetsSceneId;
    if (!assetsSceneId) return { logicId: 0 };
    return { logicId: nextLogicId(assetsSceneId) };
  },

  async querySpawnEditorContext() {
    const logicId = _spawnEditorLogicId;
    if (!logicId) return { error: '未指定逻辑场景' };
    const pair = resolveLogicPair(logicId);
    if (!pair) return { error: `逻辑场景 ${logicId} 不存在或 index 损坏` };
    const monsterSpawn = ensureMonsterSpawn(
      pair.index,
      pair.logicId,
      pair.assetsSceneId
    );
    // 节奏只读：来自 Luban 表 tbspawnconfig（Excel 导出），编辑器不写回
    const layerIds = (monsterSpawn.layers ?? []).map((l) => l.layerId);
    const tableRows = listSpawnConfigsForLogic(pair.logicId);
    const byLayer = new Map(tableRows.map((r) => [r.layer_id, r]));
    const layerConfigs = layerIds
      .map((id) => byLayer.get(id))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => ({ ...r }));
    const missingLayerIds = layerIds.filter((id) => !byLayer.has(id));
    return {
      logicId: pair.logicId,
      assetsSceneId: pair.assetsSceneId,
      name: pair.index.name || '',
      monsterSpawn,
      layerConfigs,
      missingLayerIds,
    };
  },

  async saveLogicSpawn(arg: {
    logicId: number;
    assetsSceneId: number;
    monsterSpawn: Parameters<typeof saveLogicMonsterSpawn>[2];
  }) {
    if (!arg?.logicId || !arg?.assetsSceneId) {
      return { ok: false, error: '需要 logicId 与 assetsSceneId' };
    }
    // 只保存种植；节奏以 Excel→Luban→tbspawnconfig 为准，避免编辑器与表双写不同步
    return saveLogicMonsterSpawn(arg.assetsSceneId, arg.logicId, arg.monsterSpawn);
  },

  async previewSpawnInScene(arg: {
    assetsSceneId?: number;
    layers?: Array<{ layerId?: number; layerName?: string; items?: PreviewItem[] }>;
    layerIndex?: number;
    showAllLayers?: boolean;
    openPrefab?: boolean;
  }) {
    return previewSpawnInScene(arg || {});
  },

  /** 读取场景中种植预览 Area/Point 的当前位置（拖拽回写用） */
  async querySpawnPreviewTransforms() {
    try {
      const res = (await Editor.Message.request('scene', 'execute-scene-script', {
        name: PKG,
        method: 'querySpawnPreviewTransforms',
        args: [],
      })) as {
        ok?: boolean;
        reason?: string;
        items?: Array<{
          kind: 'area' | 'point';
          layerId: number;
          itemIndex: number;
          x: number;
          y: number;
          z: number;
        }>;
      } | null;
      if (!res) return { ok: false, reason: 'scene script 无返回', items: [] };
      return { ok: !!res.ok, reason: res.reason, items: res.items || [] };
    } catch (e) {
      return { ok: false, reason: String(e), items: [] };
    }
  },

  /** 种植选择器：TbAvatar 模型 + 绑定的 monster/hero 配置 */
  async listPlantables() {
    return listPlantableAvatars();
  },

  async defaultPlantable() {
    return defaultPlantable();
  },

  /** 资源场景主操作旁路：打开阻挡种植编辑器 */
  async openBlockPlant(arg: { sceneId: number } | number) {
    const sceneId = typeof arg === 'number' ? arg : arg?.sceneId;
    if (!sceneId) {
      await dialogWarn('请提供 sceneId');
      return { ok: false };
    }
    return openBlockPlantEditor(sceneId);
  },

  async queryBlockPlantContext() {
    const sceneId = _blockPlantSceneId;
    if (!sceneId) return { error: '未指定资源场景' };
    const index = loadResourceSceneIndex(sceneId);
    if (!index) return { error: `资源场景 ${sceneId} 不存在或 index 损坏` };
    const work = blockPlantToCells(index.blockPlant);
    return {
      sceneId,
      name: index.name || '',
      cellSize: work.cellSize,
      originX: work.originX,
      originZ: work.originZ,
      cells: [...work.cells],
      aabbCount: index.blockPlant?.aabbs?.length ?? 0,
    };
  },

  async saveResourceBlocks(arg: {
    sceneId: number;
    cells?: string[];
    cellSize?: number;
    originX?: number;
    originZ?: number;
  }) {
    const sceneId = arg?.sceneId || _blockPlantSceneId;
    if (!sceneId) return { ok: false, error: '需要 sceneId' };
    const cellSize = arg?.cellSize && arg.cellSize > 0 ? arg.cellSize : 1;
    const originX = Number(arg?.originX) || 0;
    const originZ = Number(arg?.originZ) || 0;
    const blockPlant = cellsToBlockPlant(arg?.cells || [], cellSize, originX, originZ);
    return saveResourceBlockPlant(sceneId, blockPlant);
  },

  async previewBlocksInScene(arg: {
    sceneId?: number;
    cells?: string[];
    cellSize?: number;
    originX?: number;
    originZ?: number;
    brushRadius?: number;
    openPrefab?: boolean;
    showBrush?: boolean;
  }) {
    return previewBlocksInScene(arg || {});
  },

  async syncBlockCells(arg: {
    sceneId?: number;
    cells?: string[];
    cellSize?: number;
    originX?: number;
    originZ?: number;
    brushRadius?: number;
  }) {
    return syncBlockCellsInScene(arg || {});
  },

  /** 在层级中选中笔刷光标，便于拖动 */
  async selectBlockBrush() {
    try {
      const cursor = (await Editor.Message.request('scene', 'execute-scene-script', {
        name: PKG,
        method: 'queryBlockBrushCursor',
        args: [],
      })) as { ok?: boolean; reason?: string; uuid?: string } | null;
      if (!cursor?.ok) {
        return { ok: false, reason: cursor?.reason || '无笔刷光标' };
      }
      if (cursor.uuid) {
        Editor.Selection?.clear();
        Editor.Selection?.select('node', cursor.uuid);
      }
      return { ok: true, uuid: cursor.uuid };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  /** 开启场景视图鼠标跟手笔刷 */
  async startMouseBrush(arg: {
    sceneId?: number;
    cells?: string[];
    cellSize?: number;
    originX?: number;
    originZ?: number;
    brushRadius?: number;
    erase?: boolean;
    openPrefab?: boolean;
  }) {
    const sceneId = arg?.sceneId || _blockPlantSceneId;
    if (arg?.openPrefab !== false && sceneId) {
      _blockPlantSceneId = sceneId;
      await openScene(sceneId);
      await new Promise((r) => setTimeout(r, 400));
    }
    try {
      const res = (await Editor.Message.request('scene', 'execute-scene-script', {
        name: PKG,
        method: 'startMouseBrushTool',
        args: [
          {
            cells: arg?.cells || [],
            cellSize: arg?.cellSize ?? 1,
            originX: arg?.originX ?? 0,
            originZ: arg?.originZ ?? 0,
            brushRadius: arg?.brushRadius ?? 1,
            erase: !!arg?.erase,
          },
        ],
      })) as { ok?: boolean; reason?: string; cellCount?: number } | null;
      return res || { ok: false, reason: 'scene script 无返回' };
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async stopMouseBrush() {
    try {
      const res = (await Editor.Message.request('scene', 'execute-scene-script', {
        name: PKG,
        method: 'stopMouseBrushTool',
        args: [],
      })) as { ok?: boolean; cells?: string[]; cellCount?: number } | null;
      return res || { ok: true, cells: [], cellCount: 0 };
    } catch (e) {
      return { ok: false, reason: String(e), cells: [], cellCount: 0 };
    }
  },

  async configureMouseBrush(arg: {
    erase?: boolean;
    brushRadius?: number;
    cellSize?: number;
  }) {
    try {
      return await Editor.Message.request('scene', 'execute-scene-script', {
        name: PKG,
        method: 'configureMouseBrush',
        args: [arg || {}],
      });
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
  },

  async queryMouseBrushState() {
    try {
      return await Editor.Message.request('scene', 'execute-scene-script', {
        name: PKG,
        method: 'queryMouseBrushState',
        args: [],
      });
    } catch (e) {
      return {
        ok: false,
        active: false,
        cells: [],
        cellCount: 0,
        reason: String(e),
      };
    }
  },

  async applyBlockBrushAtAim(arg: {
    cells?: string[];
    cellSize?: number;
    originX?: number;
    originZ?: number;
    brushRadius?: number;
    erase?: boolean;
  }) {
    return applyBlockBrushAtAim(arg || {});
  },

  async applyBlockBrushAtSelection(arg: {
    cells?: string[];
    cellSize?: number;
    originX?: number;
    originZ?: number;
    brushRadius?: number;
    erase?: boolean;
  }) {
    return applyBlockBrushAtSelection(arg || {});
  },

  async applyBlockBrushAtWorld(arg: {
    cells?: string[];
    cellSize?: number;
    originX?: number;
    originZ?: number;
    brushRadius?: number;
    erase?: boolean;
    x?: number;
    z?: number;
  }) {
    return applyBlockBrushAtWorld(arg || {});
  },

  async nudgeBlockBrush(arg: {
    cells?: string[];
    cellSize?: number;
    originX?: number;
    originZ?: number;
    brushRadius?: number;
    erase?: boolean;
    dx?: number;
    dz?: number;
    paint?: boolean;
  }) {
    return nudgeBlockBrush(arg || {});
  },

  /** 读取笔刷光标世界坐标，按半径涂抹/擦除后返回新格子集 */
  async applyBlockBrush(arg: {
    sceneId?: number;
    cells?: string[];
    cellSize?: number;
    originX?: number;
    originZ?: number;
    brushRadius?: number;
    erase?: boolean;
  }) {
    try {
      const cursor = (await Editor.Message.request('scene', 'execute-scene-script', {
        name: PKG,
        method: 'queryBlockBrushCursor',
        args: [],
      })) as { ok?: boolean; reason?: string; x?: number; y?: number; z?: number } | null;
      if (!cursor?.ok) {
        return { ok: false, reason: cursor?.reason || '无笔刷光标', cells: arg?.cells || [] };
      }
      return applyBlockBrushAtWorld({
        cells: arg?.cells,
        cellSize: arg?.cellSize,
        originX: arg?.originX,
        originZ: arg?.originZ,
        brushRadius: arg?.brushRadius,
        erase: arg?.erase,
        x: cursor.x,
        z: cursor.z,
      });
    } catch (e) {
      return { ok: false, reason: String(e), cells: arg?.cells || [] };
    }
  },

  async deleteScene(arg: { sceneId: number } | number) {
    const sceneId = typeof arg === 'number' ? arg : arg?.sceneId;
    if (!sceneId) {
      await dialogWarn('请提供 sceneId');
      return { ok: false };
    }
    const item = listLocalScenes().find((s) => s.sceneId === sceneId);
    const label = item ? `${sceneId} ${item.name}` : String(sceneId);
    const confirmed = await dialogConfirm(
      `确定删除资源场景 ${label}？\n将删除 assets/resources/scenes/${sceneId}/（含逻辑配置，不可恢复）`,
      '删除'
    );
    if (!confirmed) return { ok: false, cancelled: true };

    const result = await deleteSceneAssets(sceneId);
    if (!result.ok) {
      await dialogError(result.error || '删除失败');
      return result;
    }
    await dialogInfo(`已删除场景 ${sceneId}`);
    return result;
  },

  async locateScene(arg: { sceneId: number } | number) {
    const sceneId = typeof arg === 'number' ? arg : arg?.sceneId;
    if (!sceneId) {
      await dialogWarn('请提供 sceneId');
      return { ok: false };
    }
    const item = listLocalScenes().find((s) => s.sceneId === sceneId);
    if (!item) {
      await dialogWarn(`场景 ${sceneId} 不存在`);
      return { ok: false };
    }
    const dbUrl = item.prefab ? prefabDbUrl(item.prefab) : sceneFolderDbUrl(sceneId);
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
        /* ignore */
      }
      return { ok: true, uuid, url: dbUrl };
    } catch (e) {
      await dialogError(`定位失败: ${e}`);
      return { ok: false };
    }
  },

  async locateLogicScene(arg: { logicId: number } | number) {
    const logicId = typeof arg === 'number' ? arg : arg?.logicId;
    if (!logicId) {
      await dialogWarn('请提供 logicId');
      return { ok: false };
    }
    const logic = listLocalLogicScenes().find((l) => l.logicId === logicId);
    if (!logic) {
      await dialogWarn(`逻辑场景 ${logicId} 不存在`);
      return { ok: false };
    }
    const dbUrl = logicIndexDbUrl(logic.assetsSceneId, logicId);
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
        /* ignore */
      }
      return { ok: true, uuid, url: dbUrl };
    } catch (e) {
      await dialogError(`定位失败: ${e}`);
      return { ok: false };
    }
  },

  async validateScene(arg: { sceneId: number } | number) {
    const sceneId = typeof arg === 'number' ? arg : arg?.sceneId;
    if (!sceneId) return { ok: false };
    const r = validateSceneOnDisk(sceneId);
    const msg = r.ok
      ? `校验通过\n${r.warnings.join('\n')}`
      : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
    if (r.ok) await dialogInfo(msg);
    else await dialogWarn(msg);
    return r;
  },

  async validateLogicScene(arg: { logicId: number } | number) {
    const logicId = typeof arg === 'number' ? arg : arg?.logicId;
    if (!logicId) return { ok: false };
    const r = validateLogicSceneOnDisk(logicId);
    const msg = r.ok
      ? `校验通过\n${r.warnings.join('\n')}`
      : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
    if (r.ok) await dialogInfo(msg);
    else await dialogWarn(msg);
    return r;
  },

  async validateScenes() {
    const scenes = listLocalScenes();
    if (scenes.length === 0) {
      await dialogWarn('没有可校验的场景');
      return;
    }
    const lines: string[] = [];
    for (const s of scenes) {
      const r = validateSceneOnDisk(s.sceneId);
      lines.push(`[${r.ok ? 'OK' : 'FAIL'}] ${s.sceneId} ${s.name}`);
      for (const e of r.errors) lines.push(`  - error: ${e}`);
      for (const w of r.warnings) lines.push(`  - warn: ${w}`);
    }
    await dialogInfo(lines.join('\n'));
  },

  /**
   * 从 Prefab 导入到逻辑场景（次要入口）。
   * - { logicId }：写入该逻辑
   * - { sceneId }：写入默认逻辑 logicId=sceneId
   * - { logicId, assetsSceneId }：显式指定
   */
  async syncSpawn(arg: {
    sceneId?: number;
    logicId?: number;
    assetsSceneId?: number;
  } | number) {
    let assetsSceneId = 0;
    let logicId = 0;

    if (typeof arg === 'number') {
      assetsSceneId = arg;
      logicId = arg;
    } else if (arg) {
      if (arg.logicId) {
        const logic = listLocalLogicScenes().find((l) => l.logicId === arg.logicId);
        logicId = arg.logicId;
        assetsSceneId = arg.assetsSceneId || logic?.assetsSceneId || 0;
      } else if (arg.sceneId) {
        assetsSceneId = arg.sceneId;
        logicId = arg.sceneId;
      }
    }

    if (!assetsSceneId || !logicId) {
      await dialogWarn('请提供 logicId 或 sceneId');
      return { ok: false };
    }

    const r = await syncSpawnForLogic(assetsSceneId, logicId);
    if (!r.ok) {
      await dialogError(`导入失败: ${r.error}`);
      return r;
    }
    await dialogInfo(
      `已导入到逻辑 ${logicId}（资源 ${assetsSceneId}）\n刷怪点 ${r.spawnCount} · 门点 ${r.areaCount}`
    );
    return r;
  },

  async syncSpawnBatch() {
    const { ok, fail, lines } = await syncSpawnBatch();
    await dialogInfo(`批量从 Prefab 导入：成功 ${ok}，失败 ${fail}\n${lines.join('\n')}`);
    return { ok, fail };
  },

  async migrateChapters() {
    const confirmed = await dialogConfirm(
      '将 Prefabs/Chapter*_Level* 迁移到 assets/resources/scenes/{600-609}/Output/\n' +
        '并更新 res.json url、SkillDebugBoot 地图路径。\n\n共享美术 Art/Building 不会移动。\n是否继续？',
      '迁移'
    );
    if (!confirmed) return { ok: false, cancelled: true };

    const r = await migrateAllChapters();
    await dialogInfo(
      `迁移完成：成功 ${r.ok}，跳过 ${r.skipped}，失败 ${r.fail}\n${r.lines.join('\n')}`
    );
    try {
      await openInGameEditor('resource-scene');
    } catch {
      /* ignore */
    }
    return r;
  },
};

export function load(): void {
  console.log('[scene-editor] loaded（场景管理：资源 / 阻挡种植 / 逻辑种植 / 类型）');
}

export function unload(): void {
  console.log('[scene-editor] unloaded');
}
