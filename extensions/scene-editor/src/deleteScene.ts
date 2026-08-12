import * as fs from 'fs';
import * as path from 'path';
import { sceneFolderDbUrl, scenesFsRoot } from './paths';

export async function deleteSceneAssets(
  sceneId: number
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(sceneId) || sceneId <= 0) {
    return { ok: false, error: '无效的 sceneId' };
  }

  const folderFs = path.join(scenesFsRoot(), String(sceneId));
  const metaFs = `${folderFs}.meta`;
  const exists = fs.existsSync(folderFs) || fs.existsSync(metaFs);
  if (!exists) {
    return { ok: false, error: `场景 ${sceneId} 不存在` };
  }

  const dbUrl = sceneFolderDbUrl(sceneId);
  try {
    await Editor.Message.request('asset-db', 'delete-asset', dbUrl);
  } catch (e) {
    console.warn('[scene-editor] asset-db delete-asset failed, fallback fs', dbUrl, e);
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

  console.log(`[scene-editor] deleted scene ${sceneId}`);
  return { ok: true };
}
