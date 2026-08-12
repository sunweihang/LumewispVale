import * as fs from 'fs';
import * as path from 'path';

export const EFFECTS_DB_ROOT = 'db://assets/resources/effects';
export const INDEX_FILE_NAME = 'index.json';

export interface EffectIndexJSON {
  effectId: number;
  name: string;
  /** 分类：SFX / VFX … */
  category?: string;
  /** resources 相对路径（无 .prefab） */
  prefab: string;
  /** PoolSystem CreatNode 名（保持原 SFX_Blood / VFX_*） */
  poolName: string;
  description?: string;
  /** res.json 键，通常与 effectId 相同 */
  resId?: number;
}

export function getProjectRoot(): string {
  if (typeof Editor !== 'undefined' && Editor.Project?.path) {
    return Editor.Project.path;
  }
  return path.resolve(__dirname, '../../..');
}

export function effectsFsRoot(): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'effects');
}

export function effectFolderDbUrl(effectId: number | string): string {
  return `${EFFECTS_DB_ROOT}/${effectId}`;
}

export function effectFolderFsPath(effectId: number | string): string {
  return path.join(effectsFsRoot(), String(effectId));
}

export function effectResFsPath(effectId: number | string): string {
  return path.join(effectFolderFsPath(effectId), 'Res');
}

export function effectOutputFsPath(effectId: number | string): string {
  return path.join(effectFolderFsPath(effectId), 'Output');
}

/** resources 相对路径：effects/{id}/Output/{id} */
export function effectOutputPrefabRel(effectId: number | string): string {
  return `effects/${effectId}/Output/${effectId}`;
}

export function indexDbUrl(effectId: number | string): string {
  return `${effectFolderDbUrl(effectId)}/${INDEX_FILE_NAME}`;
}

export function indexFsPath(effectId: number | string): string {
  return path.join(effectFolderFsPath(effectId), INDEX_FILE_NAME);
}

export function prefabDbUrl(prefabRel: string): string {
  const rel = prefabRel.replace(/^\/+/, '').replace(/\.prefab$/, '');
  return `db://assets/resources/${rel}.prefab`;
}

export function prefabFsPath(prefabRel: string): string {
  const rel = prefabRel.replace(/^\/+/, '').replace(/\.prefab$/, '');
  return path.join(getProjectRoot(), 'assets', 'resources', `${rel}.prefab`);
}

export function resJsonFsPath(): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'json', 'res.json');
}

export function legacyEffectPrefabFs(poolName: string): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'Prefabs', `${poolName}.prefab`);
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** SFX_Blood → SFX；VFX_Bullet01_FaShe → VFX */
export function categoryFromPoolName(poolName: string): string {
  if (/^SFX_/i.test(poolName)) return 'SFX';
  if (/^VFX_/i.test(poolName)) return 'VFX';
  return 'uncategorized';
}
