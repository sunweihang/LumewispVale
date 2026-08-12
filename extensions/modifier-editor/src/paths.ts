import * as fs from 'fs';
import * as path from 'path';

export const MODIFIER_GRAPHS_DB_ROOT = 'db://assets/resources/modifier-graphs';
export const INDEX_FILE_NAME = 'index.json';
export const GRAPH_FILE_NAME = 'graph.graph.json';
export const CLASS_PREFIX = 'TsModifier';

export interface ModifierIndexJSON {
  modifierId: number;
  name: string;
  description?: string;
  category?: string;
  exportFlag?: boolean;
  /** @deprecated 有图后不再需要；保留兼容旧 index */
  handwritten?: boolean;
}

export function modifierFolderDbUrl(modifierId: number | string): string {
  return `${MODIFIER_GRAPHS_DB_ROOT}/${modifierId}`;
}

export function graphDbUrl(modifierId: number | string): string {
  return `${modifierFolderDbUrl(modifierId)}/${GRAPH_FILE_NAME}`;
}

export function indexDbUrl(modifierId: number | string): string {
  return `${modifierFolderDbUrl(modifierId)}/${INDEX_FILE_NAME}`;
}

export function getProjectRoot(): string {
  if (typeof Editor !== 'undefined' && Editor.Project?.path) {
    return Editor.Project.path;
  }
  return path.resolve(__dirname, '../../..');
}

export function modifierGraphsFsRoot(): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'modifier-graphs');
}

export function modifierFolderFs(modifierId: number | string): string {
  return path.join(modifierGraphsFsRoot(), String(modifierId));
}

export function indexFsPath(modifierId: number | string): string {
  return path.join(modifierFolderFs(modifierId), INDEX_FILE_NAME);
}

export function graphFsPath(modifierId: number | string): string {
  return path.join(modifierFolderFs(modifierId), GRAPH_FILE_NAME);
}

export function generatedDirFs(): string {
  return path.join(getProjectRoot(), 'assets', 'Scripts', 'src', 'skill', 'modifier', 'generated');
}

export function generatedClassFsPath(modifierId: number | string): string {
  return path.join(generatedDirFs(), `${CLASS_PREFIX}${modifierId}.ts`);
}

export function classMapFsPath(): string {
  return path.join(generatedDirFs(), 'TsModifierClassMap.ts');
}

export function templatesDir(): string {
  // dist/export or dist/ -> ../templates
  return path.resolve(__dirname, '..', 'templates');
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
