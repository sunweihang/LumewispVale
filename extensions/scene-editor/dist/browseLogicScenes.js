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
exports.listLocalLogicScenes = listLocalLogicScenes;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const browseScenes_1 = require("./browseScenes");
const monsterSpawnUtil_1 = require("./monsterSpawnUtil");
const paths_1 = require("./paths");
function listLocalLogicScenes() {
    var _a, _b;
    const root = (0, paths_1.scenesFsRoot)();
    if (!fs.existsSync(root))
        return [];
    const resourceIds = new Set((0, browseScenes_1.listLocalScenes)().map((s) => s.sceneId));
    const items = [];
    for (const sceneName of fs.readdirSync(root)) {
        const sceneDir = path.join(root, sceneName);
        if (!fs.statSync(sceneDir).isDirectory())
            continue;
        const assetsSceneId = Number(sceneName);
        if (!Number.isFinite(assetsSceneId))
            continue;
        const logicRoot = path.join(sceneDir, 'logic');
        if (!fs.existsSync(logicRoot))
            continue;
        for (const logicName of fs.readdirSync(logicRoot)) {
            const logicDir = path.join(logicRoot, logicName);
            if (!fs.statSync(logicDir).isDirectory())
                continue;
            const logicId = Number(logicName);
            if (!Number.isFinite(logicId))
                continue;
            const indexPath = path.join(logicDir, 'index.json');
            let index = {
                logicId,
                name: `Logic ${logicId}`,
                assetsSceneId,
            };
            if (fs.existsSync(indexPath)) {
                try {
                    index = { ...index, ...JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
                    index.logicId = logicId;
                    index.assetsSceneId = index.assetsSceneId || assetsSceneId;
                }
                catch (e) {
                    console.warn('[scene-editor] bad logic index.json', indexPath, e);
                }
            }
            const layerCount = (0, monsterSpawnUtil_1.countSpawnLayers)(index.monsterSpawn);
            const itemCount = (0, monsterSpawnUtil_1.countSpawnItems)(index.monsterSpawn) || ((_b = (_a = index.spawnPoints) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0);
            const hasResource = resourceIds.has(index.assetsSceneId);
            items.push({
                ...index,
                hasResource,
                spawnLayerCount: layerCount,
                spawnItemCount: itemCount,
                subtitle: `资源 ${index.assetsSceneId} · ${layerCount}层/${itemCount}项${hasResource ? '' : ' · 缺资源场景'}`,
            });
        }
    }
    items.sort((a, b) => a.logicId - b.logicId || a.assetsSceneId - b.assetsSceneId);
    return items;
}
//# sourceMappingURL=browseLogicScenes.js.map