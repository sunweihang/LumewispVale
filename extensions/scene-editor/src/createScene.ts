import * as fs from 'fs';
import { ensureAssetFolder, writeTextAsset } from './assetIo';
import { createLogicSceneAssets } from './createLogicScene';
import {
  INDEX_FILE_NAME,
  SceneIndexJSON,
  categoryFromPoolName,
  ensureDir,
  indexDbUrl,
  sceneFolderDbUrl,
  sceneFolderFsPath,
  sceneOutputFsPath,
  sceneOutputPrefabRel,
  sceneResFsPath,
  scenesFsRoot,
} from './paths';

export function nextSceneId(): number {
  const root = scenesFsRoot();
  if (!fs.existsSync(root)) return 600;
  let max = 599;
  for (const name of fs.readdirSync(root)) {
    if (!/^\d+$/.test(name)) continue;
    const n = Number(name);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export async function createSceneAssets(opts: {
  sceneId: number;
  name?: string;
  poolName?: string;
  category?: string;
  description?: string;
  prefab?: string;
  resId?: number;
  createLogic?: boolean;
}): Promise<{ ok: boolean; sceneId: number; error?: string }> {
  const { sceneId } = opts;
  if (!Number.isFinite(sceneId) || sceneId <= 0 || !Number.isInteger(sceneId)) {
    return { ok: false, sceneId, error: '无效的 sceneId，请输入正整数' };
  }

  const folderFs = sceneFolderFsPath(sceneId);
  if (fs.existsSync(folderFs)) {
    return { ok: false, sceneId, error: `场景 ${sceneId} 已存在` };
  }

  const poolName = (opts.poolName || opts.name || `Scene_${sceneId}`).trim();
  const name = (opts.name || poolName).trim();
  const category = (opts.category || categoryFromPoolName(poolName)).trim();

  ensureDir(scenesFsRoot());
  await ensureAssetFolder(sceneFolderDbUrl(sceneId), folderFs);
  await ensureAssetFolder(`${sceneFolderDbUrl(sceneId)}/Res`, sceneResFsPath(sceneId));
  await ensureAssetFolder(`${sceneFolderDbUrl(sceneId)}/Output`, sceneOutputFsPath(sceneId));

  const index: SceneIndexJSON = {
    sceneId,
    name,
    category,
    prefab: (opts.prefab || '').trim() || sceneOutputPrefabRel(sceneId),
    poolName,
    description: (opts.description || '').trim(),
    resId: opts.resId ?? sceneId,
  };

  const okIndex = await writeTextAsset(indexDbUrl(sceneId), JSON.stringify(index, null, 2));
  if (!okIndex) {
    return { ok: false, sceneId, error: `写入 ${INDEX_FILE_NAME} 失败` };
  }

  // 默认不建逻辑场景；需要时在「逻辑场景」里单独创建
  if (opts.createLogic === true) {
    const logic = await createLogicSceneAssets({
      logicId: sceneId,
      assetsSceneId: sceneId,
      name: `${name} 逻辑`,
      category,
    });
    if (!logic.ok) {
      console.warn('[scene-editor] create default logic failed', logic.error);
    }
  }

  console.log(`[scene-editor] created scene ${sceneId}: Res/ + Output/ + ${INDEX_FILE_NAME}`);
  return { ok: true, sceneId };
}
