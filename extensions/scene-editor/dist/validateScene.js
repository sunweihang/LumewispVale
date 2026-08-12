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
exports.loadResPrefabTable = loadResPrefabTable;
exports.findResEntry = findResEntry;
exports.validateSceneOnDisk = validateSceneOnDisk;
exports.validateLogicSceneOnDisk = validateLogicSceneOnDisk;
const fs = __importStar(require("fs"));
const browseLogicScenes_1 = require("./browseLogicScenes");
const browseScenes_1 = require("./browseScenes");
const paths_1 = require("./paths");
const spawnConfigIO_1 = require("./spawnConfigIO");
function loadResPrefabTable() {
    const p = (0, paths_1.resJsonFsPath)();
    if (!fs.existsSync(p))
        return {};
    try {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        return data.prefab || {};
    }
    catch {
        return {};
    }
}
function findResEntry(resId) {
    const table = loadResPrefabTable();
    return table[String(resId)] || null;
}
function validateSceneOnDisk(sceneId) {
    var _a;
    const errors = [];
    const warnings = [];
    const item = (0, browseScenes_1.listLocalScenes)().find((s) => s.sceneId === sceneId);
    if (!item) {
        return { ok: false, errors: [`场景 ${sceneId} 不存在`], warnings };
    }
    const indexPath = (0, paths_1.indexFsPath)(sceneId);
    if (!fs.existsSync(indexPath)) {
        errors.push('缺少 index.json');
    }
    else {
        try {
            const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            if (!index.poolName)
                warnings.push('未配置 poolName');
            if (!index.prefab)
                errors.push('未配置 prefab');
            else if (!fs.existsSync((0, paths_1.prefabFsPath)(index.prefab))) {
                errors.push(`Prefab 不存在: ${index.prefab}`);
            }
            const resId = (_a = index.resId) !== null && _a !== void 0 ? _a : sceneId;
            const entry = findResEntry(resId);
            if (!entry) {
                warnings.push(`res.json 无 id=${resId} 条目（运行时可能加载不到）`);
            }
            else {
                if (entry.name && index.poolName && entry.name !== index.poolName) {
                    warnings.push(`res.json name=${entry.name} 与 poolName=${index.poolName} 不一致`);
                }
                const expectUrl = index.prefab.replace(/\.prefab$/, '');
                if (entry.url && entry.url !== expectUrl) {
                    warnings.push(`res.json url=${entry.url} 与 prefab=${expectUrl} 不一致`);
                }
            }
        }
        catch (e) {
            errors.push(`index.json 解析失败: ${e}`);
        }
    }
    const logics = (0, browseLogicScenes_1.listLocalLogicScenes)().filter((l) => l.assetsSceneId === sceneId);
    if (logics.length === 0) {
        warnings.push('无绑定逻辑场景');
    }
    return { ok: errors.length === 0, errors, warnings };
}
function validateLogicSceneOnDisk(logicId) {
    var _a, _b;
    const errors = [];
    const warnings = [];
    const item = (0, browseLogicScenes_1.listLocalLogicScenes)().find((l) => l.logicId === logicId);
    if (!item) {
        return { ok: false, errors: [`逻辑场景 ${logicId} 不存在`], warnings };
    }
    const indexPath = (0, paths_1.logicIndexFsPath)(item.assetsSceneId, logicId);
    if (!fs.existsSync(indexPath)) {
        errors.push('缺少 logic index.json');
    }
    else {
        try {
            const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            if (!index.assetsSceneId)
                errors.push('缺少 assetsSceneId');
            else {
                const res = (0, browseScenes_1.listLocalScenes)().find((s) => s.sceneId === index.assetsSceneId);
                if (!res)
                    errors.push(`绑定资源场景 ${index.assetsSceneId} 不存在`);
                else if (!res.hasPrefab)
                    warnings.push(`资源场景 ${index.assetsSceneId} 缺 Prefab`);
            }
            const layers = (_b = (_a = index.monsterSpawn) === null || _a === void 0 ? void 0 : _a.layers) !== null && _b !== void 0 ? _b : [];
            const spawnItems = layers.reduce((n, l) => { var _a, _b; return n + ((_b = (_a = l.items) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0); }, 0);
            if (spawnItems === 0 && (!index.spawnPoints || index.spawnPoints.length === 0)) {
                warnings.push('尚无种植数据（在逻辑场景点「编辑种植」，或「从Prefab导入」）');
            }
            const configs = (0, spawnConfigIO_1.listSpawnConfigsForLogic)(logicId);
            const cfgLayers = new Set(configs.map((c) => c.layer_id));
            for (const layer of layers) {
                if (!cfgLayers.has(layer.layerId)) {
                    warnings.push(`种植 #ID ${layer.layerId} 在 tbspawnconfig 无行（logic_scene_id=${logicId}, layer_id=${layer.layerId}）；请在 Excel/Luban 节奏表补齐后导出`);
                }
            }
        }
        catch (e) {
            errors.push(`logic index 解析失败: ${e}`);
        }
    }
    return { ok: errors.length === 0, errors, warnings };
}
//# sourceMappingURL=validateScene.js.map