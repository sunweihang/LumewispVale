import * as fs from 'fs';
import { ensureAssetFolder, writeTextAsset } from './assetIo';
import { listLocalLogicScenes } from './browseLogicScenes';
import { emptyMonsterSpawn } from './monsterSpawnUtil';
import {
  INDEX_FILE_NAME,
  LogicSceneIndexJSON,
  ensureDir,
  logicFolderFsPath,
  logicIndexDbUrl,
  sceneFolderDbUrl,
  sceneFolderFsPath,
} from './paths';

/** 在指定资源场景下分配可用 logicId（优先用 assetsSceneId，否则递增） */
export function nextLogicId(assetsSceneId: number): number {
  const used = new Set(listLocalLogicScenes().map((l) => l.logicId));
  if (!used.has(assetsSceneId)) return assetsSceneId;
  let id = assetsSceneId * 10 + 1;
  while (used.has(id)) id++;
  return id;
}

export async function createLogicSceneAssets(opts: {
  logicId: number;
  assetsSceneId: number;
  name?: string;
  category?: string;
  description?: string;
}): Promise<{ ok: boolean; logicId: number; assetsSceneId?: number; error?: string }> {
  const { logicId, assetsSceneId } = opts;
  if (!Number.isFinite(logicId) || logicId <= 0 || !Number.isInteger(logicId)) {
    return { ok: false, logicId, error: '无效的 logicId' };
  }
  if (!Number.isFinite(assetsSceneId) || assetsSceneId <= 0) {
    return { ok: false, logicId, error: '无效的 assetsSceneId' };
  }

  const sceneFs = sceneFolderFsPath(assetsSceneId);
  if (!fs.existsSync(sceneFs)) {
    return { ok: false, logicId, error: `资源场景 ${assetsSceneId} 不存在，请先创建资源场景` };
  }

  // 全局 logicId 唯一（宿主列表按 logicId 打开）
  const clash = listLocalLogicScenes().find((l) => l.logicId === logicId);
  if (clash) {
    return {
      ok: false,
      logicId,
      error: `逻辑场景 ${logicId} 已存在（资源 ${clash.assetsSceneId}）`,
    };
  }

  const folderFs = logicFolderFsPath(assetsSceneId, logicId);
  if (fs.existsSync(folderFs)) {
    return { ok: false, logicId, error: `目录已存在：logic/${logicId}` };
  }

  await ensureAssetFolder(
    `${sceneFolderDbUrl(assetsSceneId)}/logic/${logicId}`,
    folderFs
  );

  const index: LogicSceneIndexJSON = {
    logicId,
    name: (opts.name || '').trim() || `Logic ${logicId}`,
    assetsSceneId,
    category: (opts.category || '').trim(),
    description: (opts.description || '').trim(),
    spawnPoints: [],
    areas: [],
    monsterSpawn: emptyMonsterSpawn(logicId, assetsSceneId),
  };

  ensureDir(folderFs);
  const ok = await writeTextAsset(
    logicIndexDbUrl(assetsSceneId, logicId),
    JSON.stringify(index, null, 2)
  );
  if (!ok) {
    return { ok: false, logicId, error: `写入 ${INDEX_FILE_NAME} 失败` };
  }

  // 节奏请在 Excel/Luban（tbspawnconfig）按 logic_scene_id + layer_id 配置，此处不写表
  console.log(`[scene-editor] created logic ${logicId} under scene ${assetsSceneId}`);
  return { ok: true, logicId, assetsSceneId };
}
