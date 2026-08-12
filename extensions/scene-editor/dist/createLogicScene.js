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
exports.nextLogicId = nextLogicId;
exports.createLogicSceneAssets = createLogicSceneAssets;
const fs = __importStar(require("fs"));
const assetIo_1 = require("./assetIo");
const browseLogicScenes_1 = require("./browseLogicScenes");
const monsterSpawnUtil_1 = require("./monsterSpawnUtil");
const paths_1 = require("./paths");
/** 在指定资源场景下分配可用 logicId（优先用 assetsSceneId，否则递增） */
function nextLogicId(assetsSceneId) {
    const used = new Set((0, browseLogicScenes_1.listLocalLogicScenes)().map((l) => l.logicId));
    if (!used.has(assetsSceneId))
        return assetsSceneId;
    let id = assetsSceneId * 10 + 1;
    while (used.has(id))
        id++;
    return id;
}
async function createLogicSceneAssets(opts) {
    const { logicId, assetsSceneId } = opts;
    if (!Number.isFinite(logicId) || logicId <= 0 || !Number.isInteger(logicId)) {
        return { ok: false, logicId, error: '无效的 logicId' };
    }
    if (!Number.isFinite(assetsSceneId) || assetsSceneId <= 0) {
        return { ok: false, logicId, error: '无效的 assetsSceneId' };
    }
    const sceneFs = (0, paths_1.sceneFolderFsPath)(assetsSceneId);
    if (!fs.existsSync(sceneFs)) {
        return { ok: false, logicId, error: `资源场景 ${assetsSceneId} 不存在，请先创建资源场景` };
    }
    // 全局 logicId 唯一（宿主列表按 logicId 打开）
    const clash = (0, browseLogicScenes_1.listLocalLogicScenes)().find((l) => l.logicId === logicId);
    if (clash) {
        return {
            ok: false,
            logicId,
            error: `逻辑场景 ${logicId} 已存在（资源 ${clash.assetsSceneId}）`,
        };
    }
    const folderFs = (0, paths_1.logicFolderFsPath)(assetsSceneId, logicId);
    if (fs.existsSync(folderFs)) {
        return { ok: false, logicId, error: `目录已存在：logic/${logicId}` };
    }
    await (0, assetIo_1.ensureAssetFolder)(`${(0, paths_1.sceneFolderDbUrl)(assetsSceneId)}/logic/${logicId}`, folderFs);
    const index = {
        logicId,
        name: (opts.name || '').trim() || `Logic ${logicId}`,
        assetsSceneId,
        category: (opts.category || '').trim(),
        description: (opts.description || '').trim(),
        spawnPoints: [],
        areas: [],
        monsterSpawn: (0, monsterSpawnUtil_1.emptyMonsterSpawn)(logicId, assetsSceneId),
    };
    (0, paths_1.ensureDir)(folderFs);
    const ok = await (0, assetIo_1.writeTextAsset)((0, paths_1.logicIndexDbUrl)(assetsSceneId, logicId), JSON.stringify(index, null, 2));
    if (!ok) {
        return { ok: false, logicId, error: `写入 ${paths_1.INDEX_FILE_NAME} 失败` };
    }
    // 节奏请在 Excel/Luban（tbspawnconfig）按 logic_scene_id + layer_id 配置，此处不写表
    console.log(`[scene-editor] created logic ${logicId} under scene ${assetsSceneId}`);
    return { ok: true, logicId, assetsSceneId };
}
//# sourceMappingURL=createLogicScene.js.map