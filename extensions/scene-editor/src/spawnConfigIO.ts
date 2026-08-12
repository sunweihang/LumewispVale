import * as fs from 'fs';
import * as path from 'path';
import { writeTextAsset } from './assetIo';
import { getProjectRoot } from './paths';

/** 编辑器内部用紧凑字符串；落盘为 Luban `$type` 多态 JSON */
export type SpawnConfigRowJSON = {
  id: number;
  logic_scene_id: number;
  layer_id: number;
  start_trigger: string;
  on_cleared: string;
  gen_intervals: number[];
  gen_nums: number[];
  sort_order: number;
};

export const SPAWN_CONFIG_DB_URL = 'db://assets/resources/config/luban/tbspawnconfig.json';

export function spawnConfigFsPath(): string {
  return path.join(getProjectRoot(), 'assets', 'resources', 'config', 'luban', 'tbspawnconfig.json');
}

/** Luban 多态 JSON / 旧字符串 → 单元格紧凑写法 */
export function polymorphToCompact(raw: unknown, fallback = ''): string {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'string') return raw.trim() || fallback;
  if (typeof raw !== 'object') return fallback;
  const o = raw as Record<string, unknown>;
  const type = String(o.$type ?? o.type ?? '').trim();
  if (!type) return fallback;
  const n = (...keys: string[]): number => {
    for (const k of keys) {
      if (o[k] !== undefined && o[k] !== null && o[k] !== '') {
        const v = Number(o[k]);
        if (Number.isFinite(v)) return v;
      }
    }
    return 0;
  };
  const s = (...keys: string[]): string => {
    for (const k of keys) {
      if (o[k] !== undefined && o[k] !== null) return String(o[k]);
    }
    return '';
  };
  switch (type) {
    case 'ImmediateStart':
    case 'Immediate':
      return 'ImmediateStart';
    case 'AfterLayerStart':
      return `AfterLayerStart,${n('target_layer_id', 'targetLayerId')}`;
    case 'RangeStart':
      return `RangeStart,${n('radius')},${n('center_x', 'centerX')},${n('center_y', 'centerY')},${n(
        'center_z',
        'centerZ'
      )}`;
    case 'ManualStart':
      return `ManualStart,${s('activation_key', 'activationKey')}`;
    case 'OnHpBelowStart':
      return `OnHpBelowStart,${n('target_layer_id', 'targetLayerId')},${n('hp_percent', 'hpPercent')}`;
    case 'EndAction':
    case 'End':
      return 'EndAction';
    case 'RespawnAction':
      return `RespawnAction,${n('interval')},${n('max_rounds', 'maxRounds')}`;
    case 'TriggerLayerAction':
      return `TriggerLayerAction,${n('target_layer_id', 'targetLayerId')}`;
    case 'LoopBackAction':
      return `LoopBackAction,${n('target_layer_id', 'targetLayerId')},${n('max_rounds', 'maxRounds')}`;
    default:
      return type;
  }
}

/** 单元格紧凑写法 → Luban `$type` 多态 JSON */
export function compactToPolymorph(raw: string, kind: 'start' | 'cleared'): Record<string, unknown> {
  const s = String(raw || '').trim();
  const fallback = kind === 'start' ? 'ImmediateStart' : 'EndAction';
  const parts = (s || fallback).split(',').map((p) => p.trim());
  const type = parts[0] || fallback;
  switch (type) {
    case 'ImmediateStart':
    case 'Immediate':
      return { $type: 'ImmediateStart' };
    case 'AfterLayerStart':
      return { $type: 'AfterLayerStart', target_layer_id: Number(parts[1]) || 0 };
    case 'RangeStart':
      return {
        $type: 'RangeStart',
        radius: Number(parts[1]) || 0,
        center_x: Number(parts[2]) || 0,
        center_y: Number(parts[3]) || 0,
        center_z: Number(parts[4]) || 0,
      };
    case 'ManualStart':
      return { $type: 'ManualStart', activation_key: parts[1] ?? '' };
    case 'OnHpBelowStart':
      return {
        $type: 'OnHpBelowStart',
        target_layer_id: Number(parts[1]) || 0,
        hp_percent: Number(parts[2]) || 0,
      };
    case 'EndAction':
    case 'End':
      return { $type: 'EndAction' };
    case 'RespawnAction':
      return {
        $type: 'RespawnAction',
        interval: Number(parts[1]) || 0,
        max_rounds: Number(parts[2]) || 0,
      };
    case 'TriggerLayerAction':
      return { $type: 'TriggerLayerAction', target_layer_id: Number(parts[1]) || 0 };
    case 'LoopBackAction':
      return {
        $type: 'LoopBackAction',
        target_layer_id: Number(parts[1]) || 0,
        max_rounds: Number(parts[2]) || 0,
      };
    default:
      return { $type: type };
  }
}

export function defaultSpawnConfigRow(
  logicSceneId: number,
  layerId: number,
  id = 0
): SpawnConfigRowJSON {
  return {
    id,
    logic_scene_id: logicSceneId,
    layer_id: layerId,
    start_trigger: 'ImmediateStart',
    on_cleared: 'EndAction',
    gen_intervals: [],
    gen_nums: [],
    sort_order: layerId,
  };
}

export function loadAllSpawnConfigs(): SpawnConfigRowJSON[] {
  const p = spawnConfigFsPath();
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw.map((r) => normalizeRow(r)).filter((r): r is SpawnConfigRowJSON => !!r);
  } catch (e) {
    console.warn('[scene-editor] read tbspawnconfig failed', e);
    return [];
  }
}

function normalizeRow(r: unknown): SpawnConfigRowJSON | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const logicSceneId = Number(o.logic_scene_id ?? o.logicSceneId);
  const layerId = Number(o.layer_id ?? o.layerId);
  if (!Number.isFinite(logicSceneId) || !Number.isFinite(layerId)) return null;
  const toNums = (v: unknown): number[] => {
    if (Array.isArray(v)) return v.map((x) => Number(x)).filter((n) => Number.isFinite(n));
    if (v == null || v === '') return [];
    return String(v)
      .split(/[;|,]/)
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isFinite(n));
  };
  return {
    id: Number(o.id) || 0,
    logic_scene_id: logicSceneId,
    layer_id: layerId,
    start_trigger: polymorphToCompact(o.start_trigger ?? o.startTrigger, 'ImmediateStart'),
    on_cleared: polymorphToCompact(o.on_cleared ?? o.onCleared, 'EndAction'),
    gen_intervals: toNums(o.gen_intervals ?? o.genIntervals),
    gen_nums: toNums(o.gen_nums ?? o.genNums),
    sort_order: Number(o.sort_order ?? o.sortOrder ?? layerId) || layerId,
  };
}

export function listSpawnConfigsForLogic(logicSceneId: number): SpawnConfigRowJSON[] {
  return loadAllSpawnConfigs()
    .filter((r) => r.logic_scene_id === logicSceneId)
    .sort((a, b) => a.layer_id - b.layer_id || a.sort_order - b.sort_order);
}

/** 按种植层补齐节奏行（缺则默认 ImmediateStart）；不写盘 */
export function ensureSpawnConfigsForLayers(
  logicSceneId: number,
  layerIds: number[]
): { rows: SpawnConfigRowJSON[]; missingLayerIds: number[] } {
  const existing = listSpawnConfigsForLogic(logicSceneId);
  const byLayer = new Map(existing.map((r) => [r.layer_id, { ...r }]));
  const missingLayerIds: number[] = [];
  const rows: SpawnConfigRowJSON[] = [];
  for (const layerId of layerIds) {
    const hit = byLayer.get(layerId);
    if (hit) {
      rows.push(hit);
    } else {
      missingLayerIds.push(layerId);
      rows.push(defaultSpawnConfigRow(logicSceneId, layerId, 0));
    }
  }
  return { rows, missingLayerIds };
}

function nextConfigId(all: SpawnConfigRowJSON[]): number {
  let max = 0;
  for (const r of all) max = Math.max(max, Number(r.id) || 0);
  return max + 1;
}

/**
 * 用本逻辑场景的层节奏覆盖写回 tbspawnconfig：
 * - 保留其他 logic_scene_id 的行
 * - 本逻辑：按 layerIds  upsert；已删除的层从配置表移除
 * - 落盘为 Luban `$type` 多态对象
 */
export async function saveSpawnConfigsForLogic(
  logicSceneId: number,
  layerConfigs: SpawnConfigRowJSON[]
): Promise<{ ok: boolean; error?: string; saved?: number }> {
  if (!logicSceneId) return { ok: false, error: '无效 logicSceneId' };
  if (!Array.isArray(layerConfigs)) return { ok: false, error: 'layerConfigs 无效' };

  const diskRaw = (() => {
    const p = spawnConfigFsPath();
    if (!fs.existsSync(p)) return [] as unknown[];
    try {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  })();

  const all = loadAllSpawnConfigs();
  const othersDisk = diskRaw.filter((r) => {
    if (!r || typeof r !== 'object') return false;
    const id = Number((r as any).logic_scene_id ?? (r as any).logicSceneId);
    return id !== logicSceneId;
  });
  const keptIds = new Set(
    othersDisk.map((r) => Number((r as any).id) || 0).filter((id) => id > 0)
  );
  const usedLayers = new Set<number>();
  const upsertedDisk: Record<string, unknown>[] = [];

  for (const raw of layerConfigs) {
    const layerId = Number(raw.layer_id);
    if (!Number.isFinite(layerId) || layerId <= 0) continue;
    if (usedLayers.has(layerId)) continue;
    usedLayers.add(layerId);

    let id = Number(raw.id) || 0;
    if (!id || keptIds.has(id) || upsertedDisk.some((x) => Number(x.id) === id)) {
      const prev = all.find((r) => r.logic_scene_id === logicSceneId && r.layer_id === layerId);
      id = prev?.id && !keptIds.has(prev.id) ? prev.id : nextConfigId([...all.filter((r) => r.logic_scene_id !== logicSceneId), ...layerConfigs]);
    }
    keptIds.add(id);
    upsertedDisk.push({
      id,
      logic_scene_id: logicSceneId,
      layer_id: layerId,
      start_trigger: compactToPolymorph(
        String(raw.start_trigger || 'ImmediateStart').trim() || 'ImmediateStart',
        'start'
      ),
      on_cleared: compactToPolymorph(
        String(raw.on_cleared || 'EndAction').trim() || 'EndAction',
        'cleared'
      ),
      gen_intervals: Array.isArray(raw.gen_intervals)
        ? raw.gen_intervals.map((n) => Number(n)).filter((n) => Number.isFinite(n))
        : [],
      gen_nums: Array.isArray(raw.gen_nums)
        ? raw.gen_nums.map((n) => Number(n)).filter((n) => Number.isFinite(n))
        : [],
      sort_order: Number(raw.sort_order) || layerId,
    });
  }

  const merged = [...othersDisk, ...upsertedDisk].sort((a, b) => {
    const la = Number((a as any).logic_scene_id) || 0;
    const lb = Number((b as any).logic_scene_id) || 0;
    const aLayer = Number((a as any).layer_id) || 0;
    const bLayer = Number((b as any).layer_id) || 0;
    const aId = Number((a as any).id) || 0;
    const bId = Number((b as any).id) || 0;
    return la - lb || aLayer - bLayer || aId - bId;
  });

  const ok = await writeTextAsset(SPAWN_CONFIG_DB_URL, JSON.stringify(merged, null, 2) + '\n');
  if (!ok) return { ok: false, error: '写入 tbspawnconfig.json 失败' };
  return { ok: true, saved: upsertedDisk.length };
}

/** 创建逻辑场景时补一条默认节奏（若尚无） */
export async function ensureDefaultSpawnConfig(
  logicSceneId: number,
  layerId = 1
): Promise<{ ok: boolean; created?: boolean; error?: string }> {
  const existing = listSpawnConfigsForLogic(logicSceneId);
  if (existing.some((r) => r.layer_id === layerId)) {
    return { ok: true, created: false };
  }
  const row = defaultSpawnConfigRow(logicSceneId, layerId, 0);
  const r = await saveSpawnConfigsForLogic(logicSceneId, [...existing, row]);
  return r.ok ? { ok: true, created: true } : { ok: false, error: r.error };
}
