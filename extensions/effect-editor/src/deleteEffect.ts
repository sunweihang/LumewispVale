import * as fs from 'fs';
import * as path from 'path';
import { effectFolderDbUrl, effectsFsRoot } from './paths';

export async function deleteEffectAssets(
  effectId: number
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(effectId) || effectId <= 0) {
    return { ok: false, error: '无效的 effectId' };
  }

  const folderFs = path.join(effectsFsRoot(), String(effectId));
  const metaFs = `${folderFs}.meta`;
  const exists = fs.existsSync(folderFs) || fs.existsSync(metaFs);
  if (!exists) {
    return { ok: false, error: `特效 ${effectId} 不存在` };
  }

  const dbUrl = effectFolderDbUrl(effectId);
  try {
    await Editor.Message.request('asset-db', 'delete-asset', dbUrl);
  } catch (e) {
    console.warn('[effect-editor] asset-db delete-asset failed, fallback fs', dbUrl, e);
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

  console.log(`[effect-editor] deleted effect ${effectId}`);
  return { ok: true };
}
