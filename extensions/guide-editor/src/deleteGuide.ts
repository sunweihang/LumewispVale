import * as fs from 'fs';
import * as path from 'path';
import { regenerateClassMap } from './export/ClassMapGenerator';
import {
  generatedClassFsPath,
  guideFolderDbUrl,
  guideFolderFs,
  guideGraphsFsRoot,
} from './paths';

/**
 * 删除引导图目录 + 已导出的 TsGuide{id}.ts，并重建 ClassMap。
 */
export async function deleteGuideAssets(
  guideId: number
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(guideId) || guideId <= 0) {
    return { ok: false, error: '无效的 guideId' };
  }

  const folderFs = guideFolderFs(guideId);
  const metaFs = `${folderFs}.meta`;
  const genTs = generatedClassFsPath(guideId);
  const genMeta = `${genTs}.meta`;

  const exists =
    fs.existsSync(folderFs) ||
    fs.existsSync(metaFs) ||
    fs.existsSync(genTs);
  if (!exists) {
    return { ok: false, error: `引导 ${guideId} 不存在` };
  }

  const dbUrl = guideFolderDbUrl(guideId);
  try {
    await Editor.Message.request('asset-db', 'delete-asset', dbUrl);
  } catch (e) {
    console.warn('[guide-editor] asset-db delete-asset failed, fallback fs', dbUrl, e);
  }

  try {
    if (fs.existsSync(folderFs)) {
      fs.rmSync(folderFs, { recursive: true, force: true });
    }
    if (fs.existsSync(metaFs)) {
      fs.rmSync(metaFs, { force: true });
    }
    if (fs.existsSync(genTs)) {
      fs.rmSync(genTs, { force: true });
    }
    if (fs.existsSync(genMeta)) {
      fs.rmSync(genMeta, { force: true });
    }
  } catch (e) {
    return { ok: false, error: `删除失败: ${e}` };
  }

  if (fs.existsSync(folderFs) || fs.existsSync(metaFs)) {
    return { ok: false, error: `删除未完成，请手动删除 ${folderFs}` };
  }

  // 若根目录空了也无妨；ClassMap 按剩余导出类重建
  void guideGraphsFsRoot();
  regenerateClassMap();

  // 尝试刷新 generated 目录
  try {
    const genDb = `db://assets/Scripts/src/guide/generated`;
    await Editor.Message.request('asset-db', 'refresh-asset', genDb);
  } catch {
    /* ignore */
  }

  console.log(`[guide-editor] deleted story ${guideId}`);
  return { ok: true };
}

export function guideFolderExists(guideId: number): boolean {
  return fs.existsSync(path.join(guideGraphsFsRoot(), String(guideId)));
}
