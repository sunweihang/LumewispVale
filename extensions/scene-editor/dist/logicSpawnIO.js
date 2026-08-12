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
exports.loadLogicIndex = loadLogicIndex;
exports.resolveLogicPair = resolveLogicPair;
exports.saveLogicMonsterSpawn = saveLogicMonsterSpawn;
const fs = __importStar(require("fs"));
const assetIo_1 = require("./assetIo");
const browseLogicScenes_1 = require("./browseLogicScenes");
const monsterSpawnUtil_1 = require("./monsterSpawnUtil");
const paths_1 = require("./paths");
function loadLogicIndex(assetsSceneId, logicId) {
    const path = (0, paths_1.logicIndexFsPath)(assetsSceneId, logicId);
    if (!fs.existsSync(path))
        return null;
    try {
        const index = JSON.parse(fs.readFileSync(path, 'utf8'));
        index.logicId = logicId;
        index.assetsSceneId = index.assetsSceneId || assetsSceneId;
        return index;
    }
    catch {
        return null;
    }
}
function resolveLogicPair(logicId) {
    const item = (0, browseLogicScenes_1.listLocalLogicScenes)().find((l) => l.logicId === logicId);
    if (!item)
        return null;
    const index = loadLogicIndex(item.assetsSceneId, logicId);
    if (!index)
        return null;
    return { assetsSceneId: item.assetsSceneId, logicId, index };
}
async function saveLogicMonsterSpawn(assetsSceneId, logicId, monsterSpawn, patch) {
    var _a, _b, _c, _d, _e, _f;
    const path = (0, paths_1.logicIndexFsPath)(assetsSceneId, logicId);
    let index = {
        logicId,
        name: `Logic ${logicId}`,
        assetsSceneId,
        spawnPoints: [],
        areas: [],
    };
    if (fs.existsSync(path)) {
        try {
            index = { ...index, ...JSON.parse(fs.readFileSync(path, 'utf8')) };
        }
        catch (e) {
            return { ok: false, error: `读取失败: ${e}` };
        }
    }
    index.logicId = logicId;
    index.assetsSceneId = assetsSceneId;
    if ((patch === null || patch === void 0 ? void 0 : patch.name) !== undefined)
        index.name = patch.name;
    if ((patch === null || patch === void 0 ? void 0 : patch.category) !== undefined)
        index.category = patch.category;
    if ((patch === null || patch === void 0 ? void 0 : patch.description) !== undefined)
        index.description = patch.description;
    const bundle = {
        formatVersion: (_a = monsterSpawn.formatVersion) !== null && _a !== void 0 ? _a : 1,
        logicSceneId: logicId,
        resourceSceneId: String(assetsSceneId),
        layers: ((_b = monsterSpawn.layers) !== null && _b !== void 0 ? _b : []).map((l) => ({
            layerId: Number(l.layerId) || 1,
            layerName: l.layerName || `layer_${l.layerId}`,
            items: Array.isArray(l.items) ? l.items : [],
        })),
    };
    if (bundle.layers.length === 0) {
        bundle.layers = (0, monsterSpawnUtil_1.ensureMonsterSpawn)(index, logicId, assetsSceneId).layers;
    }
    index.monsterSpawn = bundle;
    // 同步兼容字段 spawnPoints（由区域条目生成，便于旧工具阅读；仅 monster key）
    index.spawnPoints = [];
    for (const layer of bundle.layers) {
        for (const item of layer.items) {
            const keys = ((_c = item.enemyKeys) === null || _c === void 0 ? void 0 : _c.length)
                ? item.enemyKeys
                : item.monsterKey
                    ? [item.monsterKey]
                    : item.unitKind === 'monster' && item.unitConfigId
                        ? [String(item.unitConfigId)]
                        : [];
            const count = item.enemyCount && item.enemyCount > 0 ? item.enemyCount : keys.length ? 1 : 0;
            if (!keys.length)
                continue;
            index.spawnPoints.push({
                nodeName: `layer${layer.layerId}_item`,
                position: (_d = item.position) !== null && _d !== void 0 ? _d : { x: 0, y: 0, z: 0 },
                scale: (_e = item.scale) !== null && _e !== void 0 ? _e : { x: 1, y: 1, z: 1 },
                enemyList: keys.map(String),
                enemyCount: count,
                fogOfWarName: (_f = item.fogOfWarName) !== null && _f !== void 0 ? _f : '',
            });
        }
    }
    (0, paths_1.ensureDir)((0, paths_1.logicFolderFsPath)(assetsSceneId, logicId));
    const ok = await (0, assetIo_1.writeTextAsset)((0, paths_1.logicIndexDbUrl)(assetsSceneId, logicId), JSON.stringify(index, null, 2));
    return ok ? { ok: true } : { ok: false, error: '写入 logic index 失败' };
}
//# sourceMappingURL=logicSpawnIO.js.map