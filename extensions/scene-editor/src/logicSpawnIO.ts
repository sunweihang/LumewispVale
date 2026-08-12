import * as fs from 'fs';
import { writeTextAsset } from './assetIo';
import { listLocalLogicScenes } from './browseLogicScenes';
import { ensureMonsterSpawn } from './monsterSpawnUtil';
import {
  LogicSceneIndexJSON,
  MonsterSpawnBundleJSON,
  ensureDir,
  logicFolderFsPath,
  logicIndexDbUrl,
  logicIndexFsPath,
} from './paths';

export function loadLogicIndex(
  assetsSceneId: number,
  logicId: number
): LogicSceneIndexJSON | null {
  const path = logicIndexFsPath(assetsSceneId, logicId);
  if (!fs.existsSync(path)) return null;
  try {
    const index = JSON.parse(fs.readFileSync(path, 'utf8')) as LogicSceneIndexJSON;
    index.logicId = logicId;
    index.assetsSceneId = index.assetsSceneId || assetsSceneId;
    return index;
  } catch {
    return null;
  }
}

export function resolveLogicPair(
  logicId: number
): { assetsSceneId: number; logicId: number; index: LogicSceneIndexJSON } | null {
  const item = listLocalLogicScenes().find((l) => l.logicId === logicId);
  if (!item) return null;
  const index = loadLogicIndex(item.assetsSceneId, logicId);
  if (!index) return null;
  return { assetsSceneId: item.assetsSceneId, logicId, index };
}

export async function saveLogicMonsterSpawn(
  assetsSceneId: number,
  logicId: number,
  monsterSpawn: MonsterSpawnBundleJSON,
  patch?: Partial<Pick<LogicSceneIndexJSON, 'name' | 'category' | 'description'>>
): Promise<{ ok: boolean; error?: string }> {
  const path = logicIndexFsPath(assetsSceneId, logicId);
  let index: LogicSceneIndexJSON = {
    logicId,
    name: `Logic ${logicId}`,
    assetsSceneId,
    spawnPoints: [],
    areas: [],
  };
  if (fs.existsSync(path)) {
    try {
      index = { ...index, ...JSON.parse(fs.readFileSync(path, 'utf8')) };
    } catch (e) {
      return { ok: false, error: `读取失败: ${e}` };
    }
  }

  index.logicId = logicId;
  index.assetsSceneId = assetsSceneId;
  if (patch?.name !== undefined) index.name = patch.name;
  if (patch?.category !== undefined) index.category = patch.category;
  if (patch?.description !== undefined) index.description = patch.description;

  const bundle: MonsterSpawnBundleJSON = {
    formatVersion: monsterSpawn.formatVersion ?? 1,
    logicSceneId: logicId,
    resourceSceneId: String(assetsSceneId),
    layers: (monsterSpawn.layers ?? []).map((l) => ({
      layerId: Number(l.layerId) || 1,
      layerName: l.layerName || `layer_${l.layerId}`,
      items: Array.isArray(l.items) ? l.items : [],
    })),
  };
  if (bundle.layers.length === 0) {
    bundle.layers = ensureMonsterSpawn(index, logicId, assetsSceneId).layers;
  }

  index.monsterSpawn = bundle;

  // 同步兼容字段 spawnPoints（由区域条目生成，便于旧工具阅读；仅 monster key）
  index.spawnPoints = [];
  for (const layer of bundle.layers) {
    for (const item of layer.items) {
      const keys = item.enemyKeys?.length
        ? item.enemyKeys
        : item.monsterKey
          ? [item.monsterKey]
          : item.unitKind === 'monster' && item.unitConfigId
            ? [String(item.unitConfigId)]
            : [];
      const count = item.enemyCount && item.enemyCount > 0 ? item.enemyCount : keys.length ? 1 : 0;
      if (!keys.length) continue;
      index.spawnPoints.push({
        nodeName: `layer${layer.layerId}_item`,
        position: item.position ?? { x: 0, y: 0, z: 0 },
        scale: item.scale ?? { x: 1, y: 1, z: 1 },
        enemyList: keys.map(String),
        enemyCount: count,
        fogOfWarName: item.fogOfWarName ?? '',
      });
    }
  }

  ensureDir(logicFolderFsPath(assetsSceneId, logicId));
  const ok = await writeTextAsset(
    logicIndexDbUrl(assetsSceneId, logicId),
    JSON.stringify(index, null, 2)
  );
  return ok ? { ok: true } : { ok: false, error: '写入 logic index 失败' };
}
