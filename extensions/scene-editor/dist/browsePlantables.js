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
exports.listPlantableAvatars = listPlantableAvatars;
exports.findPlantableConfig = findPlantableConfig;
exports.resolvePlantableFromItem = resolvePlantableFromItem;
exports.defaultPlantable = defaultPlantable;
exports.formatPlantableLabel = formatPlantableLabel;
/**
 * 种植可选：模型来自 TbAvatar，实际配置来自 TbMonster / TbHero（avatar_id → avatar）。
 * 同一模型可对应多条配置。
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const paths_1 = require("./paths");
function lubanPath(file) {
    return path.join((0, paths_1.getProjectRoot)(), 'assets', 'resources', 'config', 'luban', file);
}
function readJsonArray(file) {
    const p = lubanPath(file);
    if (!fs.existsSync(p))
        return [];
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        return Array.isArray(raw) ? raw : [];
    }
    catch (e) {
        console.warn('[scene-editor] bad luban json', file, e);
        return [];
    }
}
function unitIndexMap() {
    const root = path.join((0, paths_1.getProjectRoot)(), 'assets', 'resources', 'units');
    const map = new Map();
    if (!fs.existsSync(root))
        return map;
    for (const name of fs.readdirSync(root)) {
        const id = Number(name);
        if (!Number.isFinite(id))
            continue;
        const indexPath = path.join(root, name, 'index.json');
        if (!fs.existsSync(indexPath)) {
            map.set(id, { unitId: id, prefab: `units/${id}/Output/${id}` });
            continue;
        }
        try {
            const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            map.set(id, { ...idx, unitId: id });
        }
        catch {
            map.set(id, { unitId: id, prefab: `units/${id}/Output/${id}` });
        }
    }
    return map;
}
/** 可种植 avatar 列表（排除无配置绑定的；主角 avatar/hero 默认排除） */
function listPlantableAvatars() {
    const avatars = readJsonArray('tbavatar.json');
    const monsters = readJsonArray('tbmonster.json');
    const heroes = readJsonArray('tbhero.json');
    const units = unitIndexMap();
    const byAvatar = new Map();
    for (const m of monsters) {
        const id = Number(m.id);
        const avatarId = Number(m.avatar_id);
        if (!id || !avatarId)
            continue;
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
        if (!Number.isFinite(id) || !avatarId)
            continue;
        // 主角不进种植
        if (id === 1000 || avatarId === 1000)
            continue;
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
    const out = [];
    for (const a of avatars) {
        const avatarId = Number(a.id);
        const model = Number(a.model);
        if (!avatarId || !model || avatarId === 1000)
            continue;
        const configs = byAvatar.get(avatarId) || [];
        if (!configs.length)
            continue;
        const unit = units.get(model);
        const prefab = ((unit === null || unit === void 0 ? void 0 : unit.prefab) || `units/${model}/Output/${model}`).replace(/\.prefab$/, '');
        out.push({
            avatarId,
            model,
            desc: String(a.desc || (unit === null || unit === void 0 ? void 0 : unit.name) || `Avatar ${avatarId}`),
            prefab,
            hasPrefab: fs.existsSync((0, paths_1.prefabFsPath)(prefab)),
            configs,
        });
    }
    out.sort((x, y) => x.avatarId - y.avatarId);
    return out;
}
function findPlantableConfig(kind, id) {
    if (!kind || !id)
        return null;
    for (const avatar of listPlantableAvatars()) {
        const config = avatar.configs.find((c) => c.kind === kind && c.id === id);
        if (config)
            return { avatar, config };
    }
    return null;
}
/** 用旧字段（monsterKey / unitConfigId / enemyKeys）反查 */
function resolvePlantableFromItem(item) {
    var _a;
    if (item.unitKind && item.unitConfigId) {
        const hit = findPlantableConfig(item.unitKind, item.unitConfigId);
        if (hit)
            return hit;
    }
    const key = item.monsterKey || ((_a = item.enemyKeys) === null || _a === void 0 ? void 0 : _a[0]);
    const avatars = listPlantableAvatars();
    if (item.unitConfigId) {
        for (const avatar of avatars) {
            const config = avatar.configs.find((c) => c.kind === 'monster' && c.id === item.unitConfigId) ||
                avatar.configs.find((c) => c.id === item.unitConfigId);
            if (config)
                return { avatar, config };
        }
    }
    if (key) {
        for (const avatar of avatars) {
            const config = avatar.configs.find((c) => c.kind === 'monster' && (c.key === key || c.name === key));
            if (config)
                return { avatar, config };
        }
    }
    if (item.avatarId) {
        const avatar = avatars.find((a) => a.avatarId === item.avatarId);
        if (avatar === null || avatar === void 0 ? void 0 : avatar.configs[0])
            return { avatar, config: avatar.configs[0] };
    }
    return null;
}
function defaultPlantable() {
    const avatars = listPlantableAvatars();
    const preferred = avatars.find((a) => a.configs.some((c) => c.kind === 'monster' && c.key === 'Enemy00')) ||
        avatars.find((a) => a.configs.some((c) => c.kind === 'monster')) ||
        avatars[0];
    if (!(preferred === null || preferred === void 0 ? void 0 : preferred.configs[0]))
        return null;
    const config = preferred.configs.find((c) => c.kind === 'monster' && c.key === 'Enemy00') ||
        preferred.configs.find((c) => c.kind === 'monster') ||
        preferred.configs[0];
    return { avatar: preferred, config };
}
function formatPlantableLabel(avatar, config) {
    const kindZh = config.kind === 'monster' ? '怪物' : '英雄';
    return `${config.name}（${kindZh} ${config.id}）· 模型 ${avatar.model}`;
}
//# sourceMappingURL=browsePlantables.js.map