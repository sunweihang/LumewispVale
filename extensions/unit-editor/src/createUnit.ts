import * as fs from 'fs';
import { writeTextAsset } from './assetIo';
import {
  DEFAULT_COLLISION_CENTER_Y,
  DEFAULT_COLLISION_HEIGHT,
  DEFAULT_COLLISION_RADIUS,
  DEFAULT_REQUIRED_SLOTS,
  INDEX_FILE_NAME,
  UNITS_DB_ROOT,
  UnitIndexJSON,
  ensureDir,
  indexDbUrl,
  unitFolderDbUrl,
  unitFolderFsPath,
  unitOutputFsPath,
  unitOutputPrefabRel,
  unitResFsPath,
  unitsFsRoot,
} from './paths';

const UNITS_DB_PARENT = UNITS_DB_ROOT;

export function nextUnitId(): number {
  const root = unitsFsRoot();
  if (!fs.existsSync(root)) return 3000;
  let max = 2999;
  for (const name of fs.readdirSync(root)) {
    if (!/^\d+$/.test(name)) continue;
    const n = Number(name);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

async function ensureAssetFolder(dbUrl: string, fsPath: string): Promise<void> {
  // 只用磁盘建目录 + refresh，避免 create-asset 对已存在路径弹「是否覆盖」
  ensureDir(fsPath);
  try {
    await Editor.Message.request('asset-db', 'refresh-asset', dbUrl);
  } catch {
    try {
      await Editor.Message.request('asset-db', 'refresh-asset', UNITS_DB_PARENT);
    } catch {
      /* ignore */
    }
  }
}

/**
 * 创建目录结构并写入 index.json：
 *   assets/resources/units/{id}/
 *     index.json            ← 含 name / category / prefab 等
 *     Res/                 ← 源资源（FBX/贴图）
 *     Output/              ← 自行放入运行时 Prefab
 */
export async function createUnitAssets(opts: {
  unitId: number;
  name?: string;
  prefab?: string;
  category?: string;
  description?: string;
}): Promise<{ ok: boolean; unitId: number; error?: string }> {
  const { unitId } = opts;
  if (!Number.isFinite(unitId) || unitId <= 0 || !Number.isInteger(unitId)) {
    return { ok: false, unitId, error: '无效的 unitId，请输入正整数' };
  }

  const folderFs = unitFolderFsPath(unitId);
  if (fs.existsSync(folderFs)) {
    return { ok: false, unitId, error: `单位 ${unitId} 已存在` };
  }

  const resFs = unitResFsPath(unitId);
  const outputFs = unitOutputFsPath(unitId);

  ensureDir(unitsFsRoot());
  await ensureAssetFolder(unitFolderDbUrl(unitId), folderFs);
  await ensureAssetFolder(`${unitFolderDbUrl(unitId)}/Res`, resFs);
  await ensureAssetFolder(`${unitFolderDbUrl(unitId)}/Output`, outputFs);

  const index: UnitIndexJSON = {
    unitId,
    name: (opts.name || '').trim() || `Unit ${unitId}`,
    category: (opts.category || '').trim(),
    prefab: (opts.prefab || '').trim() || unitOutputPrefabRel(unitId),
    description: (opts.description || '').trim(),
    requiredSlots: DEFAULT_REQUIRED_SLOTS.slice(),
    collisionRadius: DEFAULT_COLLISION_RADIUS,
    collisionHeight: DEFAULT_COLLISION_HEIGHT,
    collisionCenterY: DEFAULT_COLLISION_CENTER_Y,
  };

  const okIndex = await writeTextAsset(indexDbUrl(unitId), JSON.stringify(index, null, 2));
  if (!okIndex) {
    return { ok: false, unitId, error: `写入 ${INDEX_FILE_NAME} 失败` };
  }

  console.log(`[unit-editor] created unit ${unitId}: Res/ + Output/ + ${INDEX_FILE_NAME}`);
  return { ok: true, unitId };
}
