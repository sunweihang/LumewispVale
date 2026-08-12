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
exports.nextSceneId = nextSceneId;
exports.createSceneAssets = createSceneAssets;
const fs = __importStar(require("fs"));
const assetIo_1 = require("./assetIo");
const createLogicScene_1 = require("./createLogicScene");
const paths_1 = require("./paths");
function nextSceneId() {
    const root = (0, paths_1.scenesFsRoot)();
    if (!fs.existsSync(root))
        return 600;
    let max = 599;
    for (const name of fs.readdirSync(root)) {
        if (!/^\d+$/.test(name))
            continue;
        const n = Number(name);
        if (Number.isFinite(n) && n > max)
            max = n;
    }
    return max + 1;
}
async function createSceneAssets(opts) {
    var _a;
    const { sceneId } = opts;
    if (!Number.isFinite(sceneId) || sceneId <= 0 || !Number.isInteger(sceneId)) {
        return { ok: false, sceneId, error: '无效的 sceneId，请输入正整数' };
    }
    const folderFs = (0, paths_1.sceneFolderFsPath)(sceneId);
    if (fs.existsSync(folderFs)) {
        return { ok: false, sceneId, error: `场景 ${sceneId} 已存在` };
    }
    const poolName = (opts.poolName || opts.name || `Scene_${sceneId}`).trim();
    const name = (opts.name || poolName).trim();
    const category = (opts.category || (0, paths_1.categoryFromPoolName)(poolName)).trim();
    (0, paths_1.ensureDir)((0, paths_1.scenesFsRoot)());
    await (0, assetIo_1.ensureAssetFolder)((0, paths_1.sceneFolderDbUrl)(sceneId), folderFs);
    await (0, assetIo_1.ensureAssetFolder)(`${(0, paths_1.sceneFolderDbUrl)(sceneId)}/Res`, (0, paths_1.sceneResFsPath)(sceneId));
    await (0, assetIo_1.ensureAssetFolder)(`${(0, paths_1.sceneFolderDbUrl)(sceneId)}/Output`, (0, paths_1.sceneOutputFsPath)(sceneId));
    const index = {
        sceneId,
        name,
        category,
        prefab: (opts.prefab || '').trim() || (0, paths_1.sceneOutputPrefabRel)(sceneId),
        poolName,
        description: (opts.description || '').trim(),
        resId: (_a = opts.resId) !== null && _a !== void 0 ? _a : sceneId,
    };
    const okIndex = await (0, assetIo_1.writeTextAsset)((0, paths_1.indexDbUrl)(sceneId), JSON.stringify(index, null, 2));
    if (!okIndex) {
        return { ok: false, sceneId, error: `写入 ${paths_1.INDEX_FILE_NAME} 失败` };
    }
    // 默认不建逻辑场景；需要时在「逻辑场景」里单独创建
    if (opts.createLogic === true) {
        const logic = await (0, createLogicScene_1.createLogicSceneAssets)({
            logicId: sceneId,
            assetsSceneId: sceneId,
            name: `${name} 逻辑`,
            category,
        });
        if (!logic.ok) {
            console.warn('[scene-editor] create default logic failed', logic.error);
        }
    }
    console.log(`[scene-editor] created scene ${sceneId}: Res/ + Output/ + ${paths_1.INDEX_FILE_NAME}`);
    return { ok: true, sceneId };
}
//# sourceMappingURL=createScene.js.map