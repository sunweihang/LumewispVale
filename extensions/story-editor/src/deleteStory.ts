import * as fs from 'fs';
import * as path from 'path';
import { regenerateClassMap } from './export/ClassMapGenerator';
import {
  generatedClassFsPath,
  storyFolderDbUrl,
  storyFolderFs,
  storyGraphsFsRoot,
} from './paths';

/**
 * 删除剧情图目录 + 已导出的 TsStory{id}.ts，并重建 ClassMap。
 */
export async function deleteStoryAssets(
  storyId: number
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isFinite(storyId) || storyId <= 0) {
    return { ok: false, error: '无效的 storyId' };
  }

  const folderFs = storyFolderFs(storyId);
  const metaFs = `${folderFs}.meta`;
  const genTs = generatedClassFsPath(storyId);
  const genMeta = `${genTs}.meta`;

  const exists =
    fs.existsSync(folderFs) ||
    fs.existsSync(metaFs) ||
    fs.existsSync(genTs);
  if (!exists) {
    return { ok: false, error: `剧情 ${storyId} 不存在` };
  }

  const dbUrl = storyFolderDbUrl(storyId);
  try {
    await Editor.Message.request('asset-db', 'delete-asset', dbUrl);
  } catch (e) {
    console.warn('[story-editor] asset-db delete-asset failed, fallback fs', dbUrl, e);
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
  void storyGraphsFsRoot();
  regenerateClassMap();

  // 尝试刷新 generated 目录
  try {
    const genDb = `db://assets/Scripts/src/story/generated`;
    await Editor.Message.request('asset-db', 'refresh-asset', genDb);
  } catch {
    /* ignore */
  }

  console.log(`[story-editor] deleted story ${storyId}`);
  return { ok: true };
}

export function storyFolderExists(storyId: number): boolean {
  return fs.existsSync(path.join(storyGraphsFsRoot(), String(storyId)));
}
