/**
 * 种植可选：模型来自 TbAvatar，实际配置来自 TbMonster / TbHero（avatar_id → avatar）。
 * 同一模型可对应多条配置。
 */
import * as fs from 'fs';
import * as path from 'path';
import { getProjectRoot, prefabFsPath } from './paths';

export type PlantKind = 'monster' | 'hero';

export interface PlantableConfig {
  kind: PlantKind;
  /** 配置表 id（TbMonster.id / TbHero.id） */
  id: number;
  key: string;
  name: string;
  avatarId: number;
}

export interface PlantableAvatar {
  avatarId: number;
  /** TbAvatar.model = GameAssets unitId */
  model: number;
  desc: string;
  prefab: string;
  hasPrefab: boolean;
  configs: PlantableConfig[];
}

type AvatarRow = { id?: number; model?: number; desc?: string };
type MonsterRow = { id?: number; key?: string; name?: string; avatar_id?: number };
type HeroRow = { id?: number; key?: string; name?: string; avatar_id?: number };
type UnitIndex = { unitId?: number; name?: string; prefab?: string; category?: string };

function lubanPath(file: string): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'config', 'luban', file);
}

function readJsonArray<T>(file: string): T[] {
  const p = lubanPath(file);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    console.warn('[scene-editor] bad luban json', file, e);
    return [];
  }
}

function unitIndexMap(): Map<number, UnitIndex> {
  const root = path.join(getProjectRoot(), 'assets', 'resources', 'units');
  const map = new Map<number, UnitIndex>();
  if (!fs.existsSync(root)) return map;
  for (const name of fs.readdirSync(root)) {
    const id = Number(name);
    if (!Number.isFinite(id)) continue;
    const indexPath = path.join(root, name, 'index.json');
    if (!fs.existsSync(indexPath)) {
      map.set(id, { unitId: id, prefab: `units/${id}/Output/${id}` });
      continue;
    }
    try {
      const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as UnitIndex;
      map.set(id, { ...idx, unitId: id });
    } catch {
      map.set(id, { unitId: id, prefab: `units/${id}/Output/${id}` });
    }
  }
  return map;
}

/** 可种植 avatar 列表（排除无配置绑定的；主角 avatar/hero 默认排除） */
export function listPlantableAvatars(): PlantableAvatar[] {
  const avatars = readJsonArray<AvatarRow>('tbavatar.json');
  const monsters = readJsonArray<MonsterRow>('tbmonster.json');
  const heroes = readJsonArray<HeroRow>('tbhero.json');
  const units = unitIndexMap();

  const byAvatar = new Map<number, PlantableConfig[]>();

  for (const m of monsters) {
    const id = Number(m.id);
    const avatarId = Number(m.avatar_id);
    if (!id || !avatarId) continue;
    const list = byAvatar.get(avatarId) || [];
    list.push({
      kind: 'monster',
      id,
      key: String(m.key || m.name || id),
      name: String(m.name || m.key || id),
      avatarId,
    });
    byAvatar.set(avatarId, list);
  }

  for (const h of heroes) {
    const id = Number(h.id);
    const avatarId = Number(h.avatar_id);
    if (!Number.isFinite(id) || !avatarId) continue;
    // 主角不进种植
    if (id === 1000 || avatarId === 1000) continue;
    const list = byAvatar.get(avatarId) || [];
    list.push({
      kind: 'hero',
      id,
      key: String(h.key || h.name || id),
      name: String(h.name || h.key || id),
      avatarId,
    });
    byAvatar.set(avatarId, list);
  }

  const out: PlantableAvatar[] = [];
  for (const a of avatars) {
    const avatarId = Number(a.id);
    const model = Number(a.model);
    if (!avatarId || !model || avatarId === 1000) continue;
    const configs = byAvatar.get(avatarId) || [];
    if (!configs.length) continue;
    const unit = units.get(model);
    const prefab = (unit?.prefab || `units/${model}/Output/${model}`).replace(/\.prefab$/, '');
    out.push({
      avatarId,
      model,
      desc: String(a.desc || unit?.name || `Avatar ${avatarId}`),
      prefab,
      hasPrefab: fs.existsSync(prefabFsPath(prefab)),
      configs,
    });
  }

  out.sort((x, y) => x.avatarId - y.avatarId);
  return out;
}

export function findPlantableConfig(
  kind?: PlantKind,
  id?: number
): { avatar: PlantableAvatar; config: PlantableConfig } | null {
  if (!kind || !id) return null;
  for (const avatar of listPlantableAvatars()) {
    const config = avatar.configs.find((c) => c.kind === kind && c.id === id);
    if (config) return { avatar, config };
  }
  return null;
}

/** 用旧字段（monsterKey / unitConfigId / enemyKeys）反查 */
export function resolvePlantableFromItem(item: {
  unitKind?: PlantKind;
  unitConfigId?: number;
  avatarId?: number;
  monsterKey?: string;
  enemyKeys?: string[];
}): { avatar: PlantableAvatar; config: PlantableConfig } | null {
  if (item.unitKind && item.unitConfigId) {
    const hit = findPlantableConfig(item.unitKind, item.unitConfigId);
    if (hit) return hit;
  }

  const key = item.monsterKey || item.enemyKeys?.[0];
  const avatars = listPlantableAvatars();

  if (item.unitConfigId) {
    for (const avatar of avatars) {
      const config =
        avatar.configs.find((c) => c.kind === 'monster' && c.id === item.unitConfigId) ||
        avatar.configs.find((c) => c.id === item.unitConfigId);
      if (config) return { avatar, config };
    }
  }

  if (key) {
    for (const avatar of avatars) {
      const config = avatar.configs.find(
        (c) => c.kind === 'monster' && (c.key === key || c.name === key)
      );
      if (config) return { avatar, config };
    }
  }

  if (item.avatarId) {
    const avatar = avatars.find((a) => a.avatarId === item.avatarId);
    if (avatar?.configs[0]) return { avatar, config: avatar.configs[0] };
  }

  return null;
}

export function defaultPlantable(): { avatar: PlantableAvatar; config: PlantableConfig } | null {
  const avatars = listPlantableAvatars();
  const preferred =
    avatars.find((a) => a.configs.some((c) => c.kind === 'monster' && c.key === 'Enemy00')) ||
    avatars.find((a) => a.configs.some((c) => c.kind === 'monster')) ||
    avatars[0];
  if (!preferred?.configs[0]) return null;
  const config =
    preferred.configs.find((c) => c.kind === 'monster' && c.key === 'Enemy00') ||
    preferred.configs.find((c) => c.kind === 'monster') ||
    preferred.configs[0]!;
  return { avatar: preferred, config };
}

export function formatPlantableLabel(
  avatar: PlantableAvatar,
  config: PlantableConfig
): string {
  const kindZh = config.kind === 'monster' ? '怪物' : '英雄';
  return `${config.name}（${kindZh} ${config.id}）· 模型 ${avatar.model}`;
}
