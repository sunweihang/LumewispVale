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
exports.nextEffectId = nextEffectId;
exports.createEffectAssets = createEffectAssets;
const fs = __importStar(require("fs"));
const assetIo_1 = require("./assetIo");
const paths_1 = require("./paths");
/** 新建特效默认从 411 起（401–410 为既有 SFX；211+ 为补充 VFX） */
function nextEffectId() {
    const root = (0, paths_1.effectsFsRoot)();
    if (!fs.existsSync(root))
        return 411;
    let max = 410;
    for (const name of fs.readdirSync(root)) {
        if (!/^\d+$/.test(name))
            continue;
        const n = Number(name);
        if (Number.isFinite(n) && n > max)
            max = n;
    }
    return max + 1;
}
async function createEffectAssets(opts) {
    var _a;
    const { effectId } = opts;
    if (!Number.isFinite(effectId) || effectId <= 0 || !Number.isInteger(effectId)) {
        return { ok: false, effectId, error: '无效的 effectId，请输入正整数' };
    }
    const folderFs = (0, paths_1.effectFolderFsPath)(effectId);
    if (fs.existsSync(folderFs)) {
        return { ok: false, effectId, error: `特效 ${effectId} 已存在` };
    }
    const poolName = (opts.poolName || opts.name || `Effect_${effectId}`).trim();
    const name = (opts.name || poolName).trim();
    const category = (opts.category || (0, paths_1.categoryFromPoolName)(poolName)).trim();
    (0, paths_1.ensureDir)((0, paths_1.effectsFsRoot)());
    await (0, assetIo_1.ensureAssetFolder)((0, paths_1.effectFolderDbUrl)(effectId), folderFs);
    await (0, assetIo_1.ensureAssetFolder)(`${(0, paths_1.effectFolderDbUrl)(effectId)}/Res`, (0, paths_1.effectResFsPath)(effectId));
    await (0, assetIo_1.ensureAssetFolder)(`${(0, paths_1.effectFolderDbUrl)(effectId)}/Output`, (0, paths_1.effectOutputFsPath)(effectId));
    const index = {
        effectId,
        name,
        category,
        prefab: (opts.prefab || '').trim() || (0, paths_1.effectOutputPrefabRel)(effectId),
        poolName,
        description: (opts.description || '').trim(),
        resId: (_a = opts.resId) !== null && _a !== void 0 ? _a : effectId,
    };
    const okIndex = await (0, assetIo_1.writeTextAsset)((0, paths_1.indexDbUrl)(effectId), JSON.stringify(index, null, 2));
    if (!okIndex) {
        return { ok: false, effectId, error: `写入 ${paths_1.INDEX_FILE_NAME} 失败` };
    }
    console.log(`[effect-editor] created effect ${effectId}: Res/ + Output/ + ${paths_1.INDEX_FILE_NAME}`);
    return { ok: true, effectId };
}
//# sourceMappingURL=createEffect.js.map