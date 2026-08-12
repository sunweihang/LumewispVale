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

/** Write text asset under db://; creates parent dirs on disk then create-asset / overwrite. */
export async function writeTextAsset(dbUrl: string, content: string): Promise<boolean> {
  const projectRoot = getProjectRoot();
  // db://assets/... -> assets/...
  const rel = dbUrl.replace(/^db:\/\//, '');
  const fsPath = path.join(projectRoot, rel);
  ensureDir(path.dirname(fsPath));

  let existing = await dbUrlToFsPath(dbUrl);
  if (!existing) {
    try {
      await Editor.Message.request('asset-db', 'create-asset', dbUrl, content);
      return true;
    } catch (e) {
      // asset-db may fail if folder missing in db; fall through to fs + refresh
      console.warn('[skill-editor] create-asset failed, fallback fs write', dbUrl, e);
    }
  }

  try {
    fs.writeFileSync(fsPath, content, 'utf8');
    try {
      await Editor.Message.request('asset-db', 'refresh-asset', dbUrl);
    } catch {
      // refresh may fail for brand-new folders; try parent
      const parentDb = dbUrl.replace(/\/[^/]+$/, '');
      try {
        await Editor.Message.request('asset-db', 'refresh-asset', parentDb);
      } catch {
        /* ignore */
      }
    }
    return true;
  } catch (e) {
    console.error('[skill-editor] writeTextAsset failed', dbUrl, e);
    return false;
  }
}

export async function readTextAsset(dbUrl: string): Promise<string | null> {
  const fsPath = await dbUrlToFsPath(dbUrl);
  if (fsPath && fs.existsSync(fsPath)) {
    return fs.readFileSync(fsPath, 'utf8');
  }
  // fallback: project-relative
  const rel = dbUrl.replace(/^db:\/\//, '');
  const alt = path.join(getProjectRoot(), rel);
  if (fs.existsSync(alt)) {
    return fs.readFileSync(alt, 'utf8');
  }
  return null;
}

export function writeFsText(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

export function readFsText(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}
