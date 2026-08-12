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
exports.nextUnitId = nextUnitId;
exports.createUnitAssets = createUnitAssets;
const fs = __importStar(require("fs"));
const assetIo_1 = require("./assetIo");
const paths_1 = require("./paths");
const UNITS_DB_PARENT = paths_1.UNITS_DB_ROOT;
function nextUnitId() {
    const root = (0, paths_1.unitsFsRoot)();
    if (!fs.existsSync(root))
        return 3000;
    let max = 2999;
    for (const name of fs.readdirSync(root)) {
        if (!/^\d+$/.test(name))
            continue;
        const n = Number(name);
        if (Number.isFinite(n) && n > max)
            max = n;
    }
    return max + 1;
}
async function ensureAssetFolder(dbUrl, fsPath) {
    // 只用磁盘建目录 + refresh，避免 create-asset 对已存在路径弹「是否覆盖」
    (0, paths_1.ensureDir)(fsPath);
    try {
        await Editor.Message.request('asset-db', 'refresh-asset', dbUrl);
    }
    catch {
        try {
            await Editor.Message.request('asset-db', 'refresh-asset', UNITS_DB_PARENT);
        }
        catch {
            /* ignore */
        }
    }
}
/**
 * 创建目录结构并写入 index.json：
 *   assets/resources/units/{id}/
 *     index.json            ← 含 name / category / prefab 等
 *     Res/                 ← 源资源（FBX/贴图）
 *     Output/              ← 自行放入运行时 Prefab
 */
async function createUnitAssets(opts) {
    const { unitId } = opts;
    if (!Number.isFinite(unitId) || unitId <= 0 || !Number.isInteger(unitId)) {
        return { ok: false, unitId, error: '无效的 unitId，请输入正整数' };
    }
    const folderFs = (0, paths_1.unitFolderFsPath)(unitId);
    if (fs.existsSync(folderFs)) {
        return { ok: false, unitId, error: `单位 ${unitId} 已存在` };
    }
    const resFs = (0, paths_1.unitResFsPath)(unitId);
    const outputFs = (0, paths_1.unitOutputFsPath)(unitId);
    (0, paths_1.ensureDir)((0, paths_1.unitsFsRoot)());
    await ensureAssetFolder((0, paths_1.unitFolderDbUrl)(unitId), folderFs);
    await ensureAssetFolder(`${(0, paths_1.unitFolderDbUrl)(unitId)}/Res`, resFs);
    await ensureAssetFolder(`${(0, paths_1.unitFolderDbUrl)(unitId)}/Output`, outputFs);
    const index = {
        unitId,
        name: (opts.name || '').trim() || `Unit ${unitId}`,
        category: (opts.category || '').trim(),
        prefab: (opts.prefab || '').trim() || (0, paths_1.unitOutputPrefabRel)(unitId),
        description: (opts.description || '').trim(),
        requiredSlots: paths_1.DEFAULT_REQUIRED_SLOTS.slice(),
        collisionRadius: paths_1.DEFAULT_COLLISION_RADIUS,
        collisionHeight: paths_1.DEFAULT_COLLISION_HEIGHT,
        collisionCenterY: paths_1.DEFAULT_COLLISION_CENTER_Y,
    };
    const okIndex = await (0, assetIo_1.writeTextAsset)((0, paths_1.indexDbUrl)(unitId), JSON.stringify(index, null, 2));
    if (!okIndex) {
        return { ok: false, unitId, error: `写入 ${paths_1.INDEX_FILE_NAME} 失败` };
    }
    console.log(`[unit-editor] created unit ${unitId}: Res/ + Output/ + ${paths_1.INDEX_FILE_NAME}`);
    return { ok: true, unitId };
}
//# sourceMappingURL=createUnit.js.map