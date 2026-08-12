import {
  LogicSceneIndexJSON,
  MonsterSpawnBundleJSON,
  MonsterSpawnItemJSON,
  MonsterSpawnLayerJSON,
} from './paths';

export function emptyMonsterSpawn(
  logicId: number,
  assetsSceneId: number
): MonsterSpawnBundleJSON {
  return {
    formatVersion: 1,
    logicSceneId: logicId,
    resourceSceneId: String(assetsSceneId),
    layers: [
      {
        layerId: 1,
        layerName: 'default',
        items: [],
      },
    ],
  };
}

export function ensureMonsterSpawn(
  index: LogicSceneIndexJSON,
  logicId: number,
  assetsSceneId: number
): MonsterSpawnBundleJSON {
  if (index.monsterSpawn?.layers?.length) {
    return {
      formatVersion: index.monsterSpawn.formatVersion ?? 1,
      logicSceneId: logicId,
      resourceSceneId: String(assetsSceneId),
      layers: index.monsterSpawn.layers.map((l) => ({
        layerId: l.layerId,
        layerName: l.layerName || `layer_${l.layerId}`,
        items: Array.isArray(l.items) ? l.items.map((it) => ({ ...it })) : [],
      })),
    };
  }

  // 兼容旧 spawnPoints
  const points = index.spawnPoints ?? [];
  if (points.length > 0) {
    return {
      formatVersion: 1,
      logicSceneId: logicId,
      resourceSceneId: String(assetsSceneId),
      layers: [
        {
          layerId: 1,
          layerName: 'default',
          items: points.map((p) => ({
            position: p.position ?? { x: 0, y: 0, z: 0 },
            scale: p.scale ?? { x: 1, y: 1, z: 1 },
            enemyKeys: (p.enemyList ?? []).map(String),
            enemyCount: p.enemyCount | 0,
            fogOfWarName: p.fogOfWarName ?? '',
            level: 1,
          })),
        },
      ],
    };
  }

  return emptyMonsterSpawn(logicId, assetsSceneId);
}

export function countSpawnItems(bundle?: MonsterSpawnBundleJSON | null): number {
  if (!bundle?.layers) return 0;
  let n = 0;
  for (const layer of bundle.layers) n += layer.items?.length ?? 0;
  return n;
}

export function countSpawnLayers(bundle?: MonsterSpawnBundleJSON | null): number {
  return bundle?.layers?.length ?? 0;
}

export function defaultAreaItem(): MonsterSpawnItemJSON {
  return {
    position: { x: 0, y: 0.5, z: 0 },
    scale: { x: 5, y: 1, z: 5 },
    enemyKeys: ['Enemy00'],
    enemyCount: 1,
    fogOfWarName: '',
    level: 1,
  };
}

export function defaultPointItem(): MonsterSpawnItemJSON {
  return {
    monsterKey: 'Enemy00',
    level: 1,
    position: { x: 0, y: 0.5, z: 0 },
    eulerAngles: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    fogOfWarName: '',
  };
}

export function defaultLayer(layerId: number): MonsterSpawnLayerJSON {
  return {
    layerId,
    layerName: layerId === 1 ? 'default' : `layer_${layerId}`,
    items: [],
  };
}
