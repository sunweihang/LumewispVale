import * as fs from 'fs';
import { ensureAssetFolder, writeTextAsset } from './assetIo';
import {
  EffectIndexJSON,
  INDEX_FILE_NAME,
  categoryFromPoolName,
  effectFolderDbUrl,
  effectFolderFsPath,
  effectOutputFsPath,
  effectOutputPrefabRel,
  effectResFsPath,
  effectsFsRoot,
  ensureDir,
  indexDbUrl,
} from './paths';

/** 新建特效默认从 411 起（401–410 为既有 SFX；211+ 为补充 VFX） */
export function nextEffectId(): number {
  const root = effectsFsRoot();
  if (!fs.existsSync(root)) return 411;
  let max = 410;
  for (const name of fs.readdirSync(root)) {
    if (!/^\d+$/.test(name)) continue;
    const n = Number(name);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export async function createEffectAssets(opts: {
  effectId: number;
  name?: string;
  poolName?: string;
  category?: string;
  description?: string;
  prefab?: string;
  resId?: number;
}): Promise<{ ok: boolean; effectId: number; error?: string }> {
  const { effectId } = opts;
  if (!Number.isFinite(effectId) || effectId <= 0 || !Number.isInteger(effectId)) {
    return { ok: false, effectId, error: '无效的 effectId，请输入正整数' };
  }

  const folderFs = effectFolderFsPath(effectId);
  if (fs.existsSync(folderFs)) {
    return { ok: false, effectId, error: `特效 ${effectId} 已存在` };
  }

  const poolName = (opts.poolName || opts.name || `Effect_${effectId}`).trim();
  const name = (opts.name || poolName).trim();
  const category = (opts.category || categoryFromPoolName(poolName)).trim();

  ensureDir(effectsFsRoot());
  await ensureAssetFolder(effectFolderDbUrl(effectId), folderFs);
  await ensureAssetFolder(`${effectFolderDbUrl(effectId)}/Res`, effectResFsPath(effectId));
  await ensureAssetFolder(`${effectFolderDbUrl(effectId)}/Output`, effectOutputFsPath(effectId));

  const index: EffectIndexJSON = {
    effectId,
    name,
    category,
    prefab: (opts.prefab || '').trim() || effectOutputPrefabRel(effectId),
    poolName,
    description: (opts.description || '').trim(),
    resId: opts.resId ?? effectId,
  };

  const okIndex = await writeTextAsset(indexDbUrl(effectId), JSON.stringify(index, null, 2));
  if (!okIndex) {
    return { ok: false, effectId, error: `写入 ${INDEX_FILE_NAME} 失败` };
  }

  console.log(`[effect-editor] created effect ${effectId}: Res/ + Output/ + ${INDEX_FILE_NAME}`);
  return { ok: true, effectId };
}
