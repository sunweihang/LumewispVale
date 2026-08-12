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
exports.INDEX_FILE_NAME = exports.EFFECTS_DB_ROOT = void 0;
exports.getProjectRoot = getProjectRoot;
exports.effectsFsRoot = effectsFsRoot;
exports.effectFolderDbUrl = effectFolderDbUrl;
exports.effectFolderFsPath = effectFolderFsPath;
exports.effectResFsPath = effectResFsPath;
exports.effectOutputFsPath = effectOutputFsPath;
exports.effectOutputPrefabRel = effectOutputPrefabRel;
exports.indexDbUrl = indexDbUrl;
exports.indexFsPath = indexFsPath;
exports.prefabDbUrl = prefabDbUrl;
exports.prefabFsPath = prefabFsPath;
exports.resJsonFsPath = resJsonFsPath;
exports.legacyEffectPrefabFs = legacyEffectPrefabFs;
exports.ensureDir = ensureDir;
exports.categoryFromPoolName = categoryFromPoolName;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.EFFECTS_DB_ROOT = 'db://assets/resources/effects';
exports.INDEX_FILE_NAME = 'index.json';
function getProjectRoot() {
    var _a;
    if (typeof Editor !== 'undefined' && ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path)) {
        return Editor.Project.path;
    }
    return path.resolve(__dirname, '../../..');
}
function effectsFsRoot() {
    return path.join(getProjectRoot(), 'assets', 'resources', 'effects');
}
function effectFolderDbUrl(effectId) {
    return `${exports.EFFECTS_DB_ROOT}/${effectId}`;
}
function effectFolderFsPath(effectId) {
    return path.join(effectsFsRoot(), String(effectId));
}
function effectResFsPath(effectId) {
    return path.join(effectFolderFsPath(effectId), 'Res');
}
function effectOutputFsPath(effectId) {
    return path.join(effectFolderFsPath(effectId), 'Output');
}
/** resources 相对路径：effects/{id}/Output/{id} */
function effectOutputPrefabRel(effectId) {
    return `effects/${effectId}/Output/${effectId}`;
}
function indexDbUrl(effectId) {
    return `${effectFolderDbUrl(effectId)}/${exports.INDEX_FILE_NAME}`;
}
function indexFsPath(effectId) {
    return path.join(effectFolderFsPath(effectId), exports.INDEX_FILE_NAME);
}
function prefabDbUrl(prefabRel) {
    const rel = prefabRel.replace(/^\/+/, '').replace(/\.prefab$/, '');
    return `db://assets/resources/${rel}.prefab`;
}
function prefabFsPath(prefabRel) {
    const rel = prefabRel.replace(/^\/+/, '').replace(/\.prefab$/, '');
    return path.join(getProjectRoot(), 'assets', 'resources', `${rel}.prefab`);
}
function resJsonFsPath() {
    return path.join(getProjectRoot(), 'assets', 'resources', 'json', 'res.json');
}
function legacyEffectPrefabFs(poolName) {
    return path.join(getProjectRoot(), 'assets', 'resources', 'Prefabs', `${poolName}.prefab`);
}
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
/** SFX_Blood → SFX；VFX_Bullet01_FaShe → VFX */
function categoryFromPoolName(poolName) {
    if (/^SFX_/i.test(poolName))
        return 'SFX';
    if (/^VFX_/i.test(poolName))
        return 'VFX';
    return 'uncategorized';
}
//# sourceMappingURL=paths.js.map