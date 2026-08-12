import * as path from 'path';
import * as fs from 'fs';

export const BALLISTIC_GRAPHS_DB_ROOT = 'db://assets/resources/ballistic-graphs';
export const GRAPH_FILE_NAME = 'graph.graph.json';
export const INDEX_FILE_NAME = 'index.json';
export const CLASS_PREFIX = 'TsBallistic';

export interface BallisticIndexJSON {
  ballisticId: number;
  name: string;
  description?: string;
  category?: string;
  exportFlag?: boolean;
}

export function ballisticFolderDbUrl(ballisticId: number | string): string {
  return `${BALLISTIC_GRAPHS_DB_ROOT}/${ballisticId}`;
}

export function graphDbUrl(ballisticId: number | string): string {
  return `${ballisticFolderDbUrl(ballisticId)}/${GRAPH_FILE_NAME}`;
}

export function indexDbUrl(ballisticId: number | string): string {
  return `${ballisticFolderDbUrl(ballisticId)}/${INDEX_FILE_NAME}`;
}

export function getProjectRoot(): string {
  if (typeof Editor !== 'undefined' && Editor.Project?.path) {
    return Editor.Project.path;
  }
  return path.resolve(__dirname, '../../..');
}

export function ballisticGraphsFsRoot(): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'ballistic-graphs');
}

export function graphFsPath(ballisticId: number | string): string {
  return path.join(ballisticGraphsFsRoot(), String(ballisticId), GRAPH_FILE_NAME);
}

export function indexFsPath(ballisticId: number | string): string {
  return path.join(ballisticGraphsFsRoot(), String(ballisticId), INDEX_FILE_NAME);
}

export function generatedDirFs(): string {
  return path.join(getProjectRoot(), 'assets', 'Scripts', 'src', 'skill', 'ballistic', 'generated');
}

export function generatedClassFsPath(ballisticId: number | string): string {
  return path.join(generatedDirFs(), `${CLASS_PREFIX}${ballisticId}.ts`);
}

export function classMapFsPath(): string {
  return path.join(generatedDirFs(), 'TsBallisticClassMap.ts');
}

export function skillGraphsFsRoot(): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'skill-graphs');
}

export function templatesDir(): string {
  return path.resolve(__dirname, '..', 'templates');
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
