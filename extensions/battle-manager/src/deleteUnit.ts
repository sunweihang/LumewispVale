import * as fs from 'fs';
import * as path from 'path';

function getProjectRoot(): string {
  if (typeof Editor !== 'undefined' && Editor.Project?.path) {
    return Editor.Project.path;
  }
  return path.resolve(__dirname, '../../..');
}

/** 宿主兜底删除：仅删 units/{id} 配置目录，不删 Prefab */
export async function deleteUnitFolder(
  unitId: number
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(unitId) || unitId <= 0) {
    return { ok: false, error: '无效的 unitId' };
  }

  const folderFs = path.join(getProjectRoot(), 'assets', 'resources', 'units', String(unitId));
  const metaFs = `${folderFs}.meta`;
  if (!fs.existsSync(folderFs) && !fs.existsSync(metaFs)) {
    return { ok: false, error: `单位 ${unitId} 不存在` };
  }

  const dbUrl = `db://assets/resources/units/${unitId}`;
  try {
    await Editor.Message.request('asset-db', 'delete-asset', dbUrl);
  } catch (e) {
    console.warn('[battle-manager] asset-db delete-asset failed, fallback fs', dbUrl, e);
  }

  try {
    if (fs.existsSync(folderFs)) fs.rmSync(folderFs, { recursive: true, force: true });
    if (fs.existsSync(metaFs)) fs.rmSync(metaFs, { force: true });
  } catch (e) {
    return { ok: false, error: `删除失败: ${e}` };
  }

  if (fs.existsSync(folderFs) || fs.existsSync(metaFs)) {
    return { ok: false, error: `删除未完成，请手动删除 ${folderFs}` };
  }
  return { ok: true };
}
