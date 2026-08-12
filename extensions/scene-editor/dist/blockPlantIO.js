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
exports.loadResourceSceneIndex = loadResourceSceneIndex;
exports.normalizeBlockPlant = normalizeBlockPlant;
exports.blockPlantToCells = blockPlantToCells;
exports.saveResourceBlockPlant = saveResourceBlockPlant;
exports.cellsToBlockPlant = cellsToBlockPlant;
const fs = __importStar(require("fs"));
const assetIo_1 = require("./assetIo");
const blockPlantUtil_1 = require("./blockPlantUtil");
const paths_1 = require("./paths");
function loadResourceSceneIndex(sceneId) {
    const path = (0, paths_1.indexFsPath)(sceneId);
    if (!fs.existsSync(path))
        return null;
    try {
        const index = JSON.parse(fs.readFileSync(path, 'utf8'));
        index.sceneId = sceneId;
        return index;
    }
    catch {
        return null;
    }
}
function normalizeBlockPlant(raw) {
    var _a, _b, _c;
    const cellSize = (raw === null || raw === void 0 ? void 0 : raw.cellSize) && raw.cellSize > 1e-6 ? Number(raw.cellSize) : blockPlantUtil_1.DEFAULT_BLOCK_CELL_SIZE;
    const origin = {
        x: Number((_a = raw === null || raw === void 0 ? void 0 : raw.origin) === null || _a === void 0 ? void 0 : _a.x) || 0,
        z: Number((_b = raw === null || raw === void 0 ? void 0 : raw.origin) === null || _b === void 0 ? void 0 : _b.z) || 0,
    };
    const aabbs = Array.isArray(raw === null || raw === void 0 ? void 0 : raw.aabbs)
        ? raw.aabbs
            .filter((b) => (b === null || b === void 0 ? void 0 : b.min) && (b === null || b === void 0 ? void 0 : b.max))
            .map((b) => ({
            min: {
                x: Number(b.min.x) || 0,
                y: Number.isFinite(Number(b.min.y)) ? Number(b.min.y) : blockPlantUtil_1.DEFAULT_BLOCK_Y_MIN,
                z: Number(b.min.z) || 0,
            },
            max: {
                x: Number(b.max.x) || 0,
                y: Number.isFinite(Number(b.max.y)) ? Number(b.max.y) : blockPlantUtil_1.DEFAULT_BLOCK_Y_MAX,
                z: Number(b.max.z) || 0,
            },
        }))
        : [];
    return {
        formatVersion: (_c = raw === null || raw === void 0 ? void 0 : raw.formatVersion) !== null && _c !== void 0 ? _c : 1,
        cellSize,
        origin,
        aabbs,
    };
}
/** 从资源 index 取出格子工作集 */
function blockPlantToCells(blockPlant) {
    const bp = normalizeBlockPlant(blockPlant);
    const cells = (0, blockPlantUtil_1.aabbsToCells)(bp.aabbs, bp.cellSize, bp.origin.x, bp.origin.z);
    return {
        cellSize: bp.cellSize,
        originX: bp.origin.x,
        originZ: bp.origin.z,
        cells,
    };
}
async function saveResourceBlockPlant(sceneId, blockPlant) {
    const path = (0, paths_1.indexFsPath)(sceneId);
    if (!fs.existsSync(path)) {
        return { ok: false, error: `资源场景 ${sceneId} 的 index.json 不存在` };
    }
    let index;
    try {
        index = JSON.parse(fs.readFileSync(path, 'utf8'));
    }
    catch (e) {
        return { ok: false, error: `读取失败: ${e}` };
    }
    const normalized = normalizeBlockPlant(blockPlant);
    index.sceneId = sceneId;
    index.blockPlant = {
        formatVersion: 1,
        cellSize: normalized.cellSize,
        origin: normalized.origin,
        aabbs: normalized.aabbs,
    };
    (0, paths_1.ensureDir)((0, paths_1.sceneFolderFsPath)(sceneId));
    const ok = await (0, assetIo_1.writeTextAsset)((0, paths_1.indexDbUrl)(sceneId), JSON.stringify(index, null, 2));
    if (!ok)
        return { ok: false, error: '写入资源 index 失败' };
    return { ok: true, aabbCount: normalized.aabbs.length };
}
/** 格子集合 → 规范化 blockPlant（合并 AABB） */
function cellsToBlockPlant(cells, cellSize, originX = 0, originZ = 0) {
    const s = cellSize > 1e-6 ? cellSize : blockPlantUtil_1.DEFAULT_BLOCK_CELL_SIZE;
    return {
        formatVersion: 1,
        cellSize: s,
        origin: { x: originX, z: originZ },
        aabbs: (0, blockPlantUtil_1.cellsToAabbs)(cells, s, originX, originZ),
    };
}
//# sourceMappingURL=blockPlantIO.js.map