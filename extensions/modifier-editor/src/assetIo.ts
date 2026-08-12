import * as fs from 'fs';
import * as path from 'path';
import { ensureDir, getProjectRoot } from './paths';

export async function dbUrlToFsPath(dbUrl: string): Promise<string | null> {
  try {
    const fsPath = (await Editor.Message.request('asset-db', 'query-path', dbUrl)) as string | null;
    return fsPath || null;
  } catch {
    return null;
  }
}

export async function writeTextAsset(dbUrl: string, content: string): Promise<boolean> {
  const projectRoot = getProjectRoot();
  const rel = dbUrl.replace(/^db:\/\//, '');
  const fsPath = path.join(projectRoot, rel);
  ensureDir(path.dirname(fsPath));

  const existing = await dbUrlToFsPath(dbUrl);
  if (!existing) {
    try {
      await Editor.Message.request('asset-db', 'create-asset', dbUrl, content);
      return true;
    } catch (e) {
      console.warn('[ballistic-editor] create-asset failed, fallback fs write', dbUrl, e);
    }
  }

  try {
    fs.writeFileSync(fsPath, content, 'utf8');
    try {
      await Editor.Message.request('asset-db', 'refresh-asset', dbUrl);
    } catch {
      const parentDb = dbUrl.replace(/\/[^/]+$/, '');
      try {
        await Editor.Message.request('asset-db', 'refresh-asset', parentDb);
      } catch {
        /* ignore */
      }
    }
    return true;
  } catch (e) {
    console.error('[ballistic-editor] writeTextAsset failed', dbUrl, e);
    return false;
  }
}

export function writeFsText(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

export function readFsText(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}
