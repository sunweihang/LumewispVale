import * as path from 'path';
import * as fs from 'fs';

export const SKILL_GRAPHS_DB_ROOT = 'db://assets/resources/skill-graphs';
export const GRAPH_FILE_NAME = 'graph.graph.json';
export const INDEX_FILE_NAME = 'index.json';
export const CLASS_PREFIX = 'TsAbility';

export interface SkillIndexJSON {
  skillId: number;
  name: string;
  description?: string;
  exportFlag?: boolean;
}

export function skillFolderDbUrl(skillId: number | string): string {
  return `${SKILL_GRAPHS_DB_ROOT}/${skillId}`;
}

export function graphDbUrl(skillId: number | string): string {
  return `${skillFolderDbUrl(skillId)}/${GRAPH_FILE_NAME}`;
}

export function indexDbUrl(skillId: number | string): string {
  return `${skillFolderDbUrl(skillId)}/${INDEX_FILE_NAME}`;
}

/** Absolute project root (Cocos project containing assets/). */
export function getProjectRoot(): string {
  if (typeof Editor !== 'undefined' && Editor.Project?.path) {
    return Editor.Project.path;
  }
  // fallback: extensions/skill-editor -> project root
  return path.resolve(__dirname, '../../..');
}

export function skillGraphsFsRoot(): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'skill-graphs');
}

export function graphFsPath(skillId: number | string): string {
  return path.join(skillGraphsFsRoot(), String(skillId), GRAPH_FILE_NAME);
}

export function indexFsPath(skillId: number | string): string {
  return path.join(skillGraphsFsRoot(), String(skillId), INDEX_FILE_NAME);
}

export function generatedDirFs(): string {
  return path.join(getProjectRoot(), 'assets', 'Scripts', 'src', 'skill', 'generated');
}

export function generatedClassFsPath(skillId: number | string): string {
  return path.join(generatedDirFs(), `${CLASS_PREFIX}${skillId}.ts`);
}

export function classMapFsPath(): string {
  return path.join(generatedDirFs(), 'TsAbilityClassMap.ts');
}

export function templatesDir(): string {
  // dist/ -> ../templates
  return path.resolve(__dirname, '..', 'templates');
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
