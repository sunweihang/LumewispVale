import * as fs from 'fs';
import * as path from 'path';
import { unitFolderDbUrl, unitsFsRoot } from './paths';

export async function deleteUnitAssets(
  unitId: number
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(unitId) || unitId <= 0) {
    return { ok: false, error: '无效的 unitId' };
  }

  const folderFs = path.join(unitsFsRoot(), String(unitId));
  const metaFs = `${folderFs}.meta`;
  const exists = fs.existsSync(folderFs) || fs.existsSync(metaFs);
  if (!exists) {
    return { ok: false, error: `单位 ${unitId} 不存在` };
  }

  const dbUrl = unitFolderDbUrl(unitId);
  try {
    await Editor.Message.request('asset-db', 'delete-asset', dbUrl);
  } catch (e) {
    console.warn('[unit-editor] asset-db delete-asset failed, fallback fs', dbUrl, e);
  }

  try {
    if (fs.existsSync(folderFs)) {
      fs.rmSync(folderFs, { recursive: true, force: true });
    }
    if (fs.existsSync(metaFs)) {
      fs.rmSync(metaFs, { force: true });
    }
  } catch (e) {
    return { ok: false, error: `删除失败: ${e}` };
  }

  if (fs.existsSync(folderFs) || fs.existsSync(metaFs)) {
    return { ok: false, error: `删除未完成，请手动删除 ${folderFs}` };
  }

  console.log(`[unit-editor] deleted unit ${unitId}`);
  return { ok: true };
}
