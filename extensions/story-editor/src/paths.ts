import * as fs from 'fs';
import * as path from 'path';

export const STORY_GRAPHS_DB_ROOT = 'db://assets/resources/story-graphs';
export const INDEX_FILE_NAME = 'index.json';
export const GRAPH_FILE_NAME = 'graph.graph.json';
export const CLASS_PREFIX = 'TsStory';

export interface StoryIndexJSON {
  storyId: number;
  name: string;
  description?: string;
  category?: string;
  exportFlag?: boolean;
}

export function storyFolderDbUrl(storyId: number | string): string {
  return `${STORY_GRAPHS_DB_ROOT}/${storyId}`;
}

export function graphDbUrl(storyId: number | string): string {
  return `${storyFolderDbUrl(storyId)}/${GRAPH_FILE_NAME}`;
}

export function indexDbUrl(storyId: number | string): string {
  return `${storyFolderDbUrl(storyId)}/${INDEX_FILE_NAME}`;
}

export function getProjectRoot(): string {
  if (typeof Editor !== 'undefined' && Editor.Project?.path) {
    return Editor.Project.path;
  }
  return path.resolve(__dirname, '../../..');
}

export function storyGraphsFsRoot(): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'story-graphs');
}

export function storyFolderFs(storyId: number | string): string {
  return path.join(storyGraphsFsRoot(), String(storyId));
}

export function indexFsPath(storyId: number | string): string {
  return path.join(storyFolderFs(storyId), INDEX_FILE_NAME);
}

export function graphFsPath(storyId: number | string): string {
  return path.join(storyFolderFs(storyId), GRAPH_FILE_NAME);
}

export function generatedDirFs(): string {
  // LumewispVale uses assets/scripts (lowercase); 后室为 assets/Scripts/src/story/generated
  return path.join(getProjectRoot(), 'assets', 'scripts', 'story', 'generated');
}

export function generatedClassFsPath(storyId: number | string): string {
  return path.join(generatedDirFs(), `${CLASS_PREFIX}${storyId}.ts`);
}

export function classMapFsPath(): string {
  return path.join(generatedDirFs(), 'TsStoryClassMap.ts');
}

export function templatesDir(): string {
  return path.resolve(__dirname, '..', 'templates');
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
