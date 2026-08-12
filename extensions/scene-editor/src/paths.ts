import * as fs from 'fs';
import * as path from 'path';

export const SCENES_DB_ROOT = 'db://assets/resources/scenes';
export const INDEX_FILE_NAME = 'index.json';

export interface SceneSpawnPoint {
  nodeName: string;
  position?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  enemyList: string[];
  enemyCount: number;
  fogOfWarName?: string;
}

export interface SceneAreaPoint {
  nodeName: string;
  kind?: string;
  position?: { x: number; y: number; z: number };
}

/** 对齐 Unity MonsterSpawnItem：点位或区域（enemyKeys+enemyCount） */
export interface MonsterSpawnItemJSON {
  /**
   * 实际配置表：monster→TbMonster，hero→TbHero。
   * 模型资源走 TbAvatar（avatarId / avatar.model），同一模型可对应多条配置。
   */
  unitKind?: 'monster' | 'hero';
  /** TbMonster.id / TbHero.id（由 unitKind 决定） */
  unitConfigId?: number;
  /** TbAvatar.id（模型来源；可省略，由配置反查） */
  avatarId?: number;
  /** 显式形状；缺省时用 enemyCount/enemyKeys 推断 */
  spawnShape?: 'area' | 'point';
  /** 兼容：怪物 key（TbMonster.key） */
  monsterKey?: string;
  level?: number;
  position?: { x: number; y: number; z: number };
  eulerAngles?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  fogOfWarName?: string;
  enemyKeys?: string[];
  enemyCount?: number;
}

export interface MonsterSpawnLayerJSON {
  layerId: number;
  layerName?: string;
  items: MonsterSpawnItemJSON[];
}

export interface MonsterSpawnBundleJSON {
  formatVersion?: number;
  resourceSceneId?: string;
  logicSceneId?: number | string;
  layers: MonsterSpawnLayerJSON[];
}

/** 资源场景阻挡种植：笔刷格子合并后的 AABB 列表 */
export interface BlockPlantAabbJSON {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface BlockPlantJSON {
  formatVersion?: number;
  /** 笔刷格子边长（世界单位），默认 1 */
  cellSize?: number;
  /** 格子原点（世界 XZ），默认 0,0 */
  origin?: { x: number; z: number };
  aabbs: BlockPlantAabbJSON[];
}

export interface SceneIndexJSON {
  sceneId: number;
  name: string;
  /** 分类：Chapter01 / Chapter02 … */
  category?: string;
  /** resources 相对路径（无 .prefab） */
  prefab: string;
  /** PoolSystem CreatNode 名（保持原 Chapter01_Level00） */
  poolName: string;
  description?: string;
  /** res.json 键，通常与 sceneId 相同 */
  resId?: number;
  /** 资源场景阻挡种植（笔刷 → AABB） */
  blockPlant?: BlockPlantJSON;
}

export interface LogicSceneIndexJSON {
  logicId: number;
  name: string;
  assetsSceneId: number;
  category?: string;
  description?: string;
  /** 旧区域刷怪（兼容）；运行时可合成 monsterSpawn */
  spawnPoints?: SceneSpawnPoint[];
  /** 对齐 Unity MonsterSpawnData：层 × 种植点/区域 */
  monsterSpawn?: MonsterSpawnBundleJSON;
  areas?: SceneAreaPoint[];
}

export function getProjectRoot(): string {
  if (typeof Editor !== 'undefined' && Editor.Project?.path) {
    return Editor.Project.path;
  }
  return path.resolve(__dirname, '../../..');
}

export function scenesFsRoot(): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'scenes');
}

export function sceneFolderDbUrl(sceneId: number | string): string {
  return `${SCENES_DB_ROOT}/${sceneId}`;
}

export function sceneFolderFsPath(sceneId: number | string): string {
  return path.join(scenesFsRoot(), String(sceneId));
}

export function sceneResFsPath(sceneId: number | string): string {
  return path.join(sceneFolderFsPath(sceneId), 'Res');
}

export function sceneOutputFsPath(sceneId: number | string): string {
  return path.join(sceneFolderFsPath(sceneId), 'Output');
}

/** resources 相对路径：scenes/{id}/Output/{id} */
export function sceneOutputPrefabRel(sceneId: number | string): string {
  return `scenes/${sceneId}/Output/${sceneId}`;
}

export function indexDbUrl(sceneId: number | string): string {
  return `${sceneFolderDbUrl(sceneId)}/${INDEX_FILE_NAME}`;
}

export function indexFsPath(sceneId: number | string): string {
  return path.join(sceneFolderFsPath(sceneId), INDEX_FILE_NAME);
}

export function logicFolderFsPath(sceneId: number | string, logicId: number | string): string {
  return path.join(sceneFolderFsPath(sceneId), 'logic', String(logicId));
}

export function logicIndexFsPath(sceneId: number | string, logicId: number | string): string {
  return path.join(logicFolderFsPath(sceneId, logicId), INDEX_FILE_NAME);
}

export function logicIndexDbUrl(sceneId: number | string, logicId: number | string): string {
  return `${sceneFolderDbUrl(sceneId)}/logic/${logicId}/${INDEX_FILE_NAME}`;
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

export function legacyChapterPrefabFs(poolName: string): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'Prefabs', `${poolName}.prefab`);
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Chapter01_Level00 → Chapter01 */
export function categoryFromPoolName(poolName: string): string {
  const m = poolName.match(/^(Chapter\d+)/i);
  return m ? m[1]! : 'uncategorized';
}
