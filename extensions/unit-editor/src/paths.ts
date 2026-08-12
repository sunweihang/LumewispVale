import * as fs from 'fs';
import * as path from 'path';

export const UNITS_DB_ROOT = 'db://assets/resources/units';
export const INDEX_FILE_NAME = 'index.json';

/** 与运行时 EnumSlot / DEFAULT_REQUIRED_SLOTS 对齐 */
export const DEFAULT_REQUIRED_SLOTS = [1, 17, 2, 0]; // Root, FirePoint, HitBone, Hud

export const SLOT_LABELS: Record<number, string> = {
  0: 'Hud',
  1: 'Root',
  2: 'HitBone',
  17: 'FirePoint',
};

export const NECESSARY_BONE_NAMES = [
  'bone_hud',
  'bone_hit',
  'bone_root',
  'bone_forward',
  'mainBody',
  'fire_point',
];

/** 节点名 → slot（与 runtime SlotNameMap 保持同步） */
export const NODE_NAME_TO_SLOT: Record<string, number> = {
  head: 6,
  Head: 6,
  headPoint: 6,
  mainbody: 22,
  mainBody: 22,
  bone_root: 1,
  bone_hud: 0,
  bone_hit: 2,
  helm: 5,
  gun: 14,
  gun01: 16,
  gun02: 19,
  gun03: 20,
  fire_point: 17,
  FirePoint: 17,
  ShootPoint: 17,
  shootPoint: 17,
  weapon_L: 3,
  weapon_R: 4,
  levelCard: 18,
  bone_forward: 21,
  'Bip001 Pelvis': 10,
  'Bip001 L Hand': 11,
  'Bip001 R Hand': 12,
  Dummy001: 13,
  'Dummy001 Socket': 13,
  turret_point: 15,
  BloodHUD: 0,
  HitBone: 2,
};

export const SLOT_FALLBACK_NAMES: Partial<Record<number, string[]>> = {
  17: ['shootPoint', 'ShootPoint', 'fire_point', 'FirePoint', 'gun01'],
  2: ['bone_hit', 'HitBone'],
  0: ['bone_hud', 'BloodHUD'],
  1: ['bone_root'],
};

export interface UnitIndexJSON {
  unitId: number;
  name: string;
  /** 分类：player / hero / enemy / boss … */
  category?: string;
  prefab: string;
  description?: string;
  requiredSlots?: number[];
  /** 逻辑碰撞水平半径（米），非物理 Collider */
  collisionRadius?: number;
  /** 逻辑碰撞柱高度（米） */
  collisionHeight?: number;
  /** 碰撞中心相对根节点的 Y 偏移 */
  collisionCenterY?: number;
}

/** 与运行时 UnitCollisionVolume 默认一致 */
export const DEFAULT_COLLISION_RADIUS = 0.5;
export const DEFAULT_COLLISION_HEIGHT = 1.5;
export const DEFAULT_COLLISION_CENTER_Y = 0.75;

export function getProjectRoot(): string {
  if (typeof Editor !== 'undefined' && Editor.Project?.path) {
    return Editor.Project.path;
  }
  return path.resolve(__dirname, '../../..');
}

export function unitsFsRoot(): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'units');
}

export function unitFolderDbUrl(unitId: number | string): string {
  return `${UNITS_DB_ROOT}/${unitId}`;
}

export function unitFolderFsPath(unitId: number | string): string {
  return path.join(unitsFsRoot(), String(unitId));
}

/** 对齐 GameAsset Unit/{id}/Res */
export function unitResFsPath(unitId: number | string): string {
  return path.join(unitFolderFsPath(unitId), 'Res');
}

/** 对齐 GameAsset Unit/{id}/Output */
export function unitOutputFsPath(unitId: number | string): string {
  return path.join(unitFolderFsPath(unitId), 'Output');
}

/** resources 相对路径：units/{id}/Output/{id}（无 .prefab） */
export function unitOutputPrefabRel(unitId: number | string): string {
  return `units/${unitId}/Output/${unitId}`;
}

export function unitOutputPrefabDbUrl(unitId: number | string): string {
  return prefabDbUrl(unitOutputPrefabRel(unitId));
}

export function unitOutputPrefabFsPath(unitId: number | string): string {
  return prefabFsPath(unitOutputPrefabRel(unitId));
}

export function indexDbUrl(unitId: number | string): string {
  return `${unitFolderDbUrl(unitId)}/${INDEX_FILE_NAME}`;
}

export function indexFsPath(unitId: number | string): string {
  return path.join(unitFolderFsPath(unitId), INDEX_FILE_NAME);
}

export function prefabDbUrl(prefabRel: string): string {
  const rel = prefabRel.replace(/^\/+/, '').replace(/\.prefab$/, '');
  return `db://assets/resources/${rel}.prefab`;
}

export function prefabFsPath(prefabRel: string): string {
  const rel = prefabRel.replace(/^\/+/, '').replace(/\.prefab$/, '');
  return path.join(getProjectRoot(), 'assets', 'resources', `${rel}.prefab`);
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function resolveRequiredSlots(index: UnitIndexJSON): number[] {
  if (index.requiredSlots && index.requiredSlots.length > 0) return index.requiredSlots;
  return DEFAULT_REQUIRED_SLOTS.slice();
}
