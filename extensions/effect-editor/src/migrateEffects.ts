import * as fs from 'fs';
import * as path from 'path';
import { ensureAssetFolder, writeTextAsset } from './assetIo';
import {
  EffectIndexJSON,
  categoryFromPoolName,
  effectFolderDbUrl,
  effectFolderFsPath,
  effectOutputFsPath,
  effectOutputPrefabRel,
  effectResFsPath,
  effectsFsRoot,
  ensureDir,
  getProjectRoot,
  indexDbUrl,
  legacyEffectPrefabFs,
  resJsonFsPath,
} from './paths';

/**
 * Prefabs/SFX_*|VFX_* → effects/{id}/
 * 已有 res.json 条目沿用原 id；孤儿特效占用空闲号段（211+ VFX / 411+ SFX）。
 */
export const EFFECT_MIGRATE_MAP: Array<{ effectId: number; poolName: string }> = [
  { effectId: 209, poolName: 'VFX_SanYeBiao' },
  { effectId: 210, poolName: 'VFX_HuoYanDan' },
  { effectId: 211, poolName: 'VFX_FeiHuoLun' },
  { effectId: 212, poolName: 'VFX_ZhuanLun' },
  { effectId: 213, poolName: 'VFX_ShouLei' },
  { effectId: 214, poolName: 'VFX_HuoYanDan_FaShe' },
  { effectId: 215, poolName: 'VFX_HuoYanDan_BaoZha' },
  { effectId: 216, poolName: 'VFX_Bullet01_FaShe' },
  { effectId: 217, poolName: 'VFX_Bullet01_BaoZha' },
  { effectId: 218, poolName: 'VFX_Bullet02_FaShe' },
  { effectId: 219, poolName: 'VFX_Bullet02_BaoZha' },
  { effectId: 220, poolName: 'VFX_Bullet03_FaShe' },
  { effectId: 221, poolName: 'VFX_Bullet03_BaoZha' },
  { effectId: 222, poolName: 'VFX_Bullet04_FaShe' },
  { effectId: 223, poolName: 'VFX_Bullet04_BaoZha' },
  { effectId: 224, poolName: 'VFX_BulleMissile_FaShe' },
  { effectId: 225, poolName: 'VFX_BulleMissile_BaoZha' },
  { effectId: 401, poolName: 'SFX_Blood' },
  { effectId: 402, poolName: 'SFX_FirePoint' },
  { effectId: 403, poolName: 'SFX_Boss01Bullet' },
  { effectId: 404, poolName: 'SFX_ShootArea' },
  { effectId: 405, poolName: 'SFX_FireSmoke' },
  { effectId: 406, poolName: 'SFX_WaterFlower' },
  { effectId: 409, poolName: 'SFX_MissileBoom' },
  { effectId: 410, poolName: 'SFX_BoomShow' },
  { effectId: 411, poolName: 'SFX_Damage' },
];

function moveFileKeepMeta(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { force: true });
  }
  fs.renameSync(src, dest);
  const srcMeta = `${src}.meta`;
  const destMeta = `${dest}.meta`;
  if (fs.existsSync(srcMeta)) {
    if (fs.existsSync(destMeta)) fs.rmSync(destMeta, { force: true });
    fs.renameSync(srcMeta, destMeta);
  }
}

async function updateResJsonUrl(
  effectId: number,
  poolName: string,
  prefabRel: string
): Promise<void> {
  const p = resJsonFsPath();
  if (!fs.existsSync(p)) return;
  const data = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    param?: unknown;
    prefab?: Record<string, { id?: number; name?: string; url?: string }>;
  };
  if (!data.prefab) data.prefab = {};
  const key = String(effectId);
  const prev = data.prefab[key] || { id: effectId, name: poolName, url: '' };
  data.prefab[key] = {
    ...prev,
    id: effectId,
    name: poolName,
    url: prefabRel.replace(/\.prefab$/, ''),
  };
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
  try {
    await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/resources/json/res.json');
  } catch {
    /* ignore */
  }
}

export async function migrateOneEffect(opts: {
  effectId: number;
  poolName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; detail?: string }> {
  const { effectId, poolName } = opts;
  const src = legacyEffectPrefabFs(poolName);
  const destRel = effectOutputPrefabRel(effectId);
  const dest = path.join(getProjectRoot(), 'assets', 'resources', `${destRel}.prefab`);
  const folderFs = effectFolderFsPath(effectId);

  if (fs.existsSync(dest) && !fs.existsSync(src)) {
    return { ok: true, skipped: true, detail: '已在目标路径' };
  }
  if (!fs.existsSync(src) && !fs.existsSync(dest)) {
    return { ok: false, error: `源 Prefab 不存在: Prefabs/${poolName}.prefab` };
  }

  ensureDir(effectsFsRoot());
  await ensureAssetFolder(effectFolderDbUrl(effectId), folderFs);
  await ensureAssetFolder(`${effectFolderDbUrl(effectId)}/Res`, effectResFsPath(effectId));
  await ensureAssetFolder(`${effectFolderDbUrl(effectId)}/Output`, effectOutputFsPath(effectId));

  if (fs.existsSync(src)) {
    const srcDb = `db://assets/resources/Prefabs/${poolName}.prefab`;
    const destDb = `db://assets/resources/${destRel}.prefab`;
    let moved = false;
    try {
      await Editor.Message.request('asset-db', 'move-asset', srcDb, destDb);
      moved = fs.existsSync(dest) || !fs.existsSync(src);
    } catch {
      /* try fs */
    }
    if (!moved && fs.existsSync(src)) {
      try {
        moveFileKeepMeta(src, dest);
        try {
          await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/resources/Prefabs');
          await Editor.Message.request('asset-db', 'refresh-asset', effectFolderDbUrl(effectId));
        } catch {
          /* ignore */
        }
      } catch (e) {
        return { ok: false, error: `移动 Prefab 失败: ${e}` };
      }
    }
  }

  if (!fs.existsSync(dest)) {
    return { ok: false, error: `迁移后目标不存在: ${destRel}.prefab` };
  }

  const index: EffectIndexJSON = {
    effectId,
    name: poolName,
    category: categoryFromPoolName(poolName),
    prefab: destRel,
    poolName,
    description: `迁移自 Prefabs/${poolName}`,
    resId: effectId,
  };
  const okIndex = await writeTextAsset(indexDbUrl(effectId), JSON.stringify(index, null, 2));
  if (!okIndex) return { ok: false, error: '写入 index.json 失败' };

  await updateResJsonUrl(effectId, poolName, destRel);

  try {
    await Editor.Message.request('asset-db', 'refresh-asset', effectFolderDbUrl(effectId));
  } catch {
    /* ignore */
  }

  return { ok: true, detail: `${poolName} → ${destRel}` };
}

export async function migrateAllEffects(): Promise<{
  ok: number;
  fail: number;
  skipped: number;
  lines: string[];
}> {
  let ok = 0;
  let fail = 0;
  let skipped = 0;
  const lines: string[] = [];

  for (const row of EFFECT_MIGRATE_MAP) {
    const r = await migrateOneEffect(row);
    if (r.ok && r.skipped) {
      skipped++;
      lines.push(`[SKIP] ${row.effectId} ${row.poolName}: ${r.detail}`);
    } else if (r.ok) {
      ok++;
      lines.push(`[OK] ${row.effectId} ${r.detail}`);
    } else {
      fail++;
      lines.push(`[FAIL] ${row.effectId} ${row.poolName}: ${r.error}`);
    }
  }

  return { ok, fail, skipped, lines };
}
