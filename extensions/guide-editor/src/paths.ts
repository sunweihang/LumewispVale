import * as fs from 'fs';
import * as path from 'path';

export const GUIDE_GRAPHS_DB_ROOT = 'db://assets/resources/guide-graphs';
export const INDEX_FILE_NAME = 'index.json';
export const GRAPH_FILE_NAME = 'graph.graph.json';
export const CLASS_PREFIX = 'TsGuide';

export interface GuideIndexJSON {
  guideId: number;
  name: string;
  description?: string;
  category?: string;
  exportFlag?: boolean;
}

export function guideFolderDbUrl(guideId: number | string): string {
  return `${GUIDE_GRAPHS_DB_ROOT}/${guideId}`;
}

export function graphDbUrl(guideId: number | string): string {
  return `${guideFolderDbUrl(guideId)}/${GRAPH_FILE_NAME}`;
}

export function indexDbUrl(guideId: number | string): string {
  return `${guideFolderDbUrl(guideId)}/${INDEX_FILE_NAME}`;
}

export function getProjectRoot(): string {
  if (typeof Editor !== 'undefined' && Editor.Project?.path) {
    return Editor.Project.path;
  }
  return path.resolve(__dirname, '../../..');
}

export function guideGraphsFsRoot(): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'guide-graphs');
}

export function guideFolderFs(guideId: number | string): string {
  return path.join(guideGraphsFsRoot(), String(guideId));
}

export function indexFsPath(guideId: number | string): string {
  return path.join(guideFolderFs(guideId), INDEX_FILE_NAME);
}

export function graphFsPath(guideId: number | string): string {
  return path.join(guideFolderFs(guideId), GRAPH_FILE_NAME);
}

export function generatedDirFs(): string {
  // LumewispVale uses assets/scripts (lowercase); 后室为 assets/Scripts/src/guide/generated
  return path.join(getProjectRoot(), 'assets', 'scripts', 'guide', 'generated');
}

export function generatedClassFsPath(guideId: number | string): string {
  return path.join(generatedDirFs(), `${CLASS_PREFIX}${guideId}.ts`);
}

export function classMapFsPath(): string {
  return path.join(generatedDirFs(), 'TsGuideClassMap.ts');
}

export function templatesDir(): string {
  return path.resolve(__dirname, '..', 'templates');
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
