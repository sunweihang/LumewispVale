import * as fs from 'fs';
import { writeTextAsset } from './assetIo';
import { listLocalLogicScenes } from './browseLogicScenes';
import { listLocalScenes } from './browseScenes';
import {
  LogicSceneIndexJSON,
  MonsterSpawnBundleJSON,
  SceneAreaPoint,
  SceneSpawnPoint,
  ensureDir,
  logicFolderFsPath,
  logicIndexDbUrl,
  logicIndexFsPath,
  prefabFsPath,
} from './paths';
import { createLogicSceneAssets } from './createLogicScene';

/** spawnPoints → monsterSpawn.layers[0]（区域条目，运行时再展开点位） */
export function spawnPointsToMonsterSpawn(
  spawnPoints: SceneSpawnPoint[],
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
        items: spawnPoints.map((p) => ({
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

type PrefabObj = Record<string, unknown> & {
  __type__?: string;
  __id__?: number;
  _name?: string;
  _parent?: { __id__?: number };
  _children?: Array<{ __id__?: number }>;
  _components?: Array<{ __id__?: number }>;
  _lpos?: { x?: number; y?: number; z?: number };
  _lscale?: { x?: number; y?: number; z?: number };
  node?: { __id__?: number };
  enemyList?: unknown;
  enemyCount?: number;
  fogOfWarName?: string;
};

function asArray(data: unknown): PrefabObj[] | null {
  if (!Array.isArray(data)) return null;
  return data as PrefabObj[];
}

function vec3(v?: { x?: number; y?: number; z?: number }): { x: number; y: number; z: number } {
  return {
    x: Number(v?.x) || 0,
    y: Number(v?.y) || 0,
    z: Number(v?.z) || 0,
  };
}

/** 从房间 Prefab JSON 抽取 EnemyBornInfo / 门点 */
export function extractSpawnFromPrefab(prefabPath: string): {
  ok: boolean;
  spawnPoints: SceneSpawnPoint[];
  areas: SceneAreaPoint[];
  error?: string;
} {
  if (!fs.existsSync(prefabPath)) {
    return { ok: false, spawnPoints: [], areas: [], error: `Prefab 不存在: ${prefabPath}` };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
  } catch (e) {
    return { ok: false, spawnPoints: [], areas: [], error: `Prefab 解析失败: ${e}` };
  }
  const arr = asArray(raw);
  if (!arr) {
    return { ok: false, spawnPoints: [], areas: [], error: 'Prefab 不是数组格式' };
  }

  const spawnPoints: SceneSpawnPoint[] = [];
  const areas: SceneAreaPoint[] = [];
  const seenArea = new Set<string>();

  for (const obj of arr) {
    if (!obj || typeof obj !== 'object') continue;

    if (Array.isArray(obj.enemyList) && typeof obj.enemyCount === 'number') {
      const nodeId = obj.node?.__id__;
      const node = typeof nodeId === 'number' ? arr[nodeId] : null;
      const nodeName = node?._name || 'EnemyBorn';
      spawnPoints.push({
        nodeName,
        position: vec3(node?._lpos),
        scale: vec3(node?._lscale),
        enemyList: obj.enemyList.map((x) => String(x)),
        enemyCount: obj.enemyCount | 0,
        fogOfWarName: typeof obj.fogOfWarName === 'string' ? obj.fogOfWarName : '',
      });
      continue;
    }

    if (obj.__type__ === 'cc.Node' && obj._name) {
      const name = obj._name;
      if (
        (name === 'InterDoor' || name === 'ExitDoor' || name === 'EnemyBornRoot') &&
        !seenArea.has(name + JSON.stringify(obj._lpos))
      ) {
        if (name === 'InterDoor' || name === 'ExitDoor') {
          seenArea.add(name + JSON.stringify(obj._lpos));
          areas.push({
            nodeName: name,
            kind: name,
            position: vec3(obj._lpos),
          });
        }
      }
    }
  }

  return { ok: true, spawnPoints, areas };
}

/**
 * 从资源 Prefab 导入刷怪到**指定逻辑场景**（次要入口；主入口为种植编辑器）。
 */
export async function syncSpawnForLogic(
  assetsSceneId: number,
  logicId: number
): Promise<{ ok: boolean; spawnCount?: number; areaCount?: number; error?: string }> {
  const scene = listLocalScenes().find((s) => s.sceneId === assetsSceneId);
  if (!scene) return { ok: false, error: `资源场景 ${assetsSceneId} 不存在` };
  if (!scene.prefab) return { ok: false, error: '未配置 prefab' };

  const prefabPath = prefabFsPath(scene.prefab);
  const extracted = extractSpawnFromPrefab(prefabPath);
  if (!extracted.ok) return { ok: false, error: extracted.error };

  const logicPath = logicIndexFsPath(assetsSceneId, logicId);
  if (!fs.existsSync(logicPath)) {
    const created = await createLogicSceneAssets({
      logicId,
      assetsSceneId,
      name: `${scene.name} 逻辑`,
      category: scene.category,
    });
    if (!created.ok) return { ok: false, error: created.error };
  }

  let index: LogicSceneIndexJSON = {
    logicId,
    name: `${scene.name} 逻辑`,
    assetsSceneId,
    category: scene.category,
    spawnPoints: [],
    areas: [],
  };
  if (fs.existsSync(logicPath)) {
    try {
      index = { ...index, ...JSON.parse(fs.readFileSync(logicPath, 'utf8')) };
    } catch {
      /* keep default */
    }
  }
  index.logicId = logicId;
  index.assetsSceneId = assetsSceneId;
  index.spawnPoints = extracted.spawnPoints;
  index.monsterSpawn = spawnPointsToMonsterSpawn(
    extracted.spawnPoints,
    logicId,
    assetsSceneId
  );
  index.areas = extracted.areas;

  ensureDir(logicFolderFsPath(assetsSceneId, logicId));
  const ok = await writeTextAsset(
    logicIndexDbUrl(assetsSceneId, logicId),
    JSON.stringify(index, null, 2)
  );
  if (!ok) return { ok: false, error: '写入 logic index 失败' };

  return {
    ok: true,
    spawnCount: extracted.spawnPoints.length,
    areaCount: extracted.areas.length,
  };
}

/** 兼容：资源场景 → 默认逻辑（logicId = sceneId） */
export async function syncSpawnForScene(
  sceneId: number
): Promise<{ ok: boolean; spawnCount?: number; areaCount?: number; error?: string }> {
  return syncSpawnForLogic(sceneId, sceneId);
}

export async function syncSpawnBatch(): Promise<{
  ok: number;
  fail: number;
  lines: string[];
}> {
  const logics = listLocalLogicScenes();
  let ok = 0;
  let fail = 0;
  const lines: string[] = [];

  if (logics.length === 0) {
    // 无逻辑时退回按资源场景同步默认逻辑
    const scenes = listLocalScenes();
    for (const s of scenes) {
      if (!s.hasPrefab) {
        lines.push(`[SKIP] 资源 ${s.sceneId} 无 Prefab`);
        continue;
      }
      const r = await syncSpawnForLogic(s.sceneId, s.sceneId);
      if (r.ok) {
        ok++;
        lines.push(`[OK] logic=${s.sceneId} spawn=${r.spawnCount}`);
      } else {
        fail++;
        lines.push(`[FAIL] logic=${s.sceneId}: ${r.error}`);
      }
    }
    return { ok, fail, lines };
  }

  for (const l of logics) {
    const scene = listLocalScenes().find((s) => s.sceneId === l.assetsSceneId);
    if (!scene?.hasPrefab) {
      lines.push(`[SKIP] logic=${l.logicId} 资源 ${l.assetsSceneId} 无 Prefab`);
      continue;
    }
    const r = await syncSpawnForLogic(l.assetsSceneId, l.logicId);
    if (r.ok) {
      ok++;
      lines.push(`[OK] logic=${l.logicId}←资源${l.assetsSceneId} spawn=${r.spawnCount}`);
    } else {
      fail++;
      lines.push(`[FAIL] logic=${l.logicId}: ${r.error}`);
    }
  }
  return { ok, fail, lines };
}
