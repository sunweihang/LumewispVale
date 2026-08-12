"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPAWN_CONFIG_DB_URL = void 0;
exports.spawnConfigFsPath = spawnConfigFsPath;
exports.polymorphToCompact = polymorphToCompact;
exports.compactToPolymorph = compactToPolymorph;
exports.defaultSpawnConfigRow = defaultSpawnConfigRow;
exports.loadAllSpawnConfigs = loadAllSpawnConfigs;
exports.listSpawnConfigsForLogic = listSpawnConfigsForLogic;
exports.ensureSpawnConfigsForLayers = ensureSpawnConfigsForLayers;
exports.saveSpawnConfigsForLogic = saveSpawnConfigsForLogic;
exports.ensureDefaultSpawnConfig = ensureDefaultSpawnConfig;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const assetIo_1 = require("./assetIo");
const paths_1 = require("./paths");
exports.SPAWN_CONFIG_DB_URL = 'db://assets/resources/config/luban/tbspawnconfig.json';
function spawnConfigFsPath() {
    return path.join((0, paths_1.getProjectRoot)(), 'assets', 'resources', 'config', 'luban', 'tbspawnconfig.json');
}
/** Luban 多态 JSON / 旧字符串 → 单元格紧凑写法 */
function polymorphToCompact(raw, fallback = '') {
    var _a, _b;
    if (raw == null || raw === '')
        return fallback;
    if (typeof raw === 'string')
        return raw.trim() || fallback;
    if (typeof raw !== 'object')
        return fallback;
    const o = raw;
    const type = String((_b = (_a = o.$type) !== null && _a !== void 0 ? _a : o.type) !== null && _b !== void 0 ? _b : '').trim();
    if (!type)
        return fallback;
    const n = (...keys) => {
        for (const k of keys) {
            if (o[k] !== undefined && o[k] !== null && o[k] !== '') {
                const v = Number(o[k]);
                if (Number.isFinite(v))
                    return v;
            }
        }
        return 0;
    };
    const s = (...keys) => {
        for (const k of keys) {
            if (o[k] !== undefined && o[k] !== null)
                return String(o[k]);
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
            return `RangeStart,${n('radius')},${n('center_x', 'centerX')},${n('center_y', 'centerY')},${n('center_z', 'centerZ')}`;
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
function compactToPolymorph(raw, kind) {
    var _a;
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
            return { $type: 'ManualStart', activation_key: (_a = parts[1]) !== null && _a !== void 0 ? _a : '' };
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
function defaultSpawnConfigRow(logicSceneId, layerId, id = 0) {
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
function loadAllSpawnConfigs() {
    const p = spawnConfigFsPath();
    if (!fs.existsSync(p))
        return [];
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (!Array.isArray(raw))
            return [];
        return raw.map((r) => normalizeRow(r)).filter((r) => !!r);
    }
    catch (e) {
        console.warn('[scene-editor] read tbspawnconfig failed', e);
        return [];
    }
}
function normalizeRow(r) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!r || typeof r !== 'object')
        return null;
    const o = r;
    const logicSceneId = Number((_a = o.logic_scene_id) !== null && _a !== void 0 ? _a : o.logicSceneId);
    const layerId = Number((_b = o.layer_id) !== null && _b !== void 0 ? _b : o.layerId);
    if (!Number.isFinite(logicSceneId) || !Number.isFinite(layerId))
        return null;
    const toNums = (v) => {
        if (Array.isArray(v))
            return v.map((x) => Number(x)).filter((n) => Number.isFinite(n));
        if (v == null || v === '')
            return [];
        return String(v)
            .split(/[;|,]/)
            .map((x) => Number(x.trim()))
            .filter((n) => Number.isFinite(n));
    };
    return {
        id: Number(o.id) || 0,
        logic_scene_id: logicSceneId,
        layer_id: layerId,
        start_trigger: polymorphToCompact((_c = o.start_trigger) !== null && _c !== void 0 ? _c : o.startTrigger, 'ImmediateStart'),
        on_cleared: polymorphToCompact((_d = o.on_cleared) !== null && _d !== void 0 ? _d : o.onCleared, 'EndAction'),
        gen_intervals: toNums((_e = o.gen_intervals) !== null && _e !== void 0 ? _e : o.genIntervals),
        gen_nums: toNums((_f = o.gen_nums) !== null && _f !== void 0 ? _f : o.genNums),
        sort_order: Number((_h = (_g = o.sort_order) !== null && _g !== void 0 ? _g : o.sortOrder) !== null && _h !== void 0 ? _h : layerId) || layerId,
    };
}
function listSpawnConfigsForLogic(logicSceneId) {
    return loadAllSpawnConfigs()
        .filter((r) => r.logic_scene_id === logicSceneId)
        .sort((a, b) => a.layer_id - b.layer_id || a.sort_order - b.sort_order);
}
/** 按种植层补齐节奏行（缺则默认 ImmediateStart）；不写盘 */
function ensureSpawnConfigsForLayers(logicSceneId, layerIds) {
    const existing = listSpawnConfigsForLogic(logicSceneId);
    const byLayer = new Map(existing.map((r) => [r.layer_id, { ...r }]));
    const missingLayerIds = [];
    const rows = [];
    for (const layerId of layerIds) {
        const hit = byLayer.get(layerId);
        if (hit) {
            rows.push(hit);
        }
        else {
            missingLayerIds.push(layerId);
            rows.push(defaultSpawnConfigRow(logicSceneId, layerId, 0));
        }
    }
    return { rows, missingLayerIds };
}
function nextConfigId(all) {
    let max = 0;
    for (const r of all)
        max = Math.max(max, Number(r.id) || 0);
    return max + 1;
}
/**
 * 用本逻辑场景的层节奏覆盖写回 tbspawnconfig：
 * - 保留其他 logic_scene_id 的行
 * - 本逻辑：按 layerIds  upsert；已删除的层从配置表移除
 * - 落盘为 Luban `$type` 多态对象
 */
async function saveSpawnConfigsForLogic(logicSceneId, layerConfigs) {
    if (!logicSceneId)
        return { ok: false, error: '无效 logicSceneId' };
    if (!Array.isArray(layerConfigs))
        return { ok: false, error: 'layerConfigs 无效' };
    const diskRaw = (() => {
        const p = spawnConfigFsPath();
        if (!fs.existsSync(p))
            return [];
        try {
            const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
            return Array.isArray(raw) ? raw : [];
        }
        catch {
            return [];
        }
    })();
    const all = loadAllSpawnConfigs();
    const othersDisk = diskRaw.filter((r) => {
        var _a;
        if (!r || typeof r !== 'object')
            return false;
        const id = Number((_a = r.logic_scene_id) !== null && _a !== void 0 ? _a : r.logicSceneId);
        return id !== logicSceneId;
    });
    const keptIds = new Set(othersDisk.map((r) => Number(r.id) || 0).filter((id) => id > 0));
    const usedLayers = new Set();
    const upsertedDisk = [];
    for (const raw of layerConfigs) {
        const layerId = Number(raw.layer_id);
        if (!Number.isFinite(layerId) || layerId <= 0)
            continue;
        if (usedLayers.has(layerId))
            continue;
        usedLayers.add(layerId);
        let id = Number(raw.id) || 0;
        if (!id || keptIds.has(id) || upsertedDisk.some((x) => Number(x.id) === id)) {
            const prev = all.find((r) => r.logic_scene_id === logicSceneId && r.layer_id === layerId);
            id = (prev === null || prev === void 0 ? void 0 : prev.id) && !keptIds.has(prev.id) ? prev.id : nextConfigId([...all.filter((r) => r.logic_scene_id !== logicSceneId), ...layerConfigs]);
        }
        keptIds.add(id);
        upsertedDisk.push({
            id,
            logic_scene_id: logicSceneId,
            layer_id: layerId,
            start_trigger: compactToPolymorph(String(raw.start_trigger || 'ImmediateStart').trim() || 'ImmediateStart', 'start'),
            on_cleared: compactToPolymorph(String(raw.on_cleared || 'EndAction').trim() || 'EndAction', 'cleared'),
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
        const la = Number(a.logic_scene_id) || 0;
        const lb = Number(b.logic_scene_id) || 0;
        const aLayer = Number(a.layer_id) || 0;
        const bLayer = Number(b.layer_id) || 0;
        const aId = Number(a.id) || 0;
        const bId = Number(b.id) || 0;
        return la - lb || aLayer - bLayer || aId - bId;
    });
    const ok = await (0, assetIo_1.writeTextAsset)(exports.SPAWN_CONFIG_DB_URL, JSON.stringify(merged, null, 2) + '\n');
    if (!ok)
        return { ok: false, error: '写入 tbspawnconfig.json 失败' };
    return { ok: true, saved: upsertedDisk.length };
}
/** 创建逻辑场景时补一条默认节奏（若尚无） */
async function ensureDefaultSpawnConfig(logicSceneId, layerId = 1) {
    const existing = listSpawnConfigsForLogic(logicSceneId);
    if (existing.some((r) => r.layer_id === layerId)) {
        return { ok: true, created: false };
    }
    const row = defaultSpawnConfigRow(logicSceneId, layerId, 0);
    const r = await saveSpawnConfigsForLogic(logicSceneId, [...existing, row]);
    return r.ok ? { ok: true, created: true } : { ok: false, error: r.error };
}
//# sourceMappingURL=spawnConfigIO.js.map