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
exports.INDEX_FILE_NAME = exports.SCENES_DB_ROOT = void 0;
exports.getProjectRoot = getProjectRoot;
exports.scenesFsRoot = scenesFsRoot;
exports.sceneFolderDbUrl = sceneFolderDbUrl;
exports.sceneFolderFsPath = sceneFolderFsPath;
exports.sceneResFsPath = sceneResFsPath;
exports.sceneOutputFsPath = sceneOutputFsPath;
exports.sceneOutputPrefabRel = sceneOutputPrefabRel;
exports.indexDbUrl = indexDbUrl;
exports.indexFsPath = indexFsPath;
exports.logicFolderFsPath = logicFolderFsPath;
exports.logicIndexFsPath = logicIndexFsPath;
exports.logicIndexDbUrl = logicIndexDbUrl;
exports.prefabDbUrl = prefabDbUrl;
exports.prefabFsPath = prefabFsPath;
exports.resJsonFsPath = resJsonFsPath;
exports.legacyChapterPrefabFs = legacyChapterPrefabFs;
exports.ensureDir = ensureDir;
exports.categoryFromPoolName = categoryFromPoolName;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.SCENES_DB_ROOT = 'db://assets/resources/scenes';
exports.INDEX_FILE_NAME = 'index.json';
function getProjectRoot() {
    var _a;
    if (typeof Editor !== 'undefined' && ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path)) {
        return Editor.Project.path;
    }
    return path.resolve(__dirname, '../../..');
}
function scenesFsRoot() {
    return path.join(getProjectRoot(), 'assets', 'resources', 'scenes');
}
function sceneFolderDbUrl(sceneId) {
    return `${exports.SCENES_DB_ROOT}/${sceneId}`;
}
function sceneFolderFsPath(sceneId) {
    return path.join(scenesFsRoot(), String(sceneId));
}
function sceneResFsPath(sceneId) {
    return path.join(sceneFolderFsPath(sceneId), 'Res');
}
function sceneOutputFsPath(sceneId) {
    return path.join(sceneFolderFsPath(sceneId), 'Output');
}
/** resources 相对路径：scenes/{id}/Output/{id} */
function sceneOutputPrefabRel(sceneId) {
    return `scenes/${sceneId}/Output/${sceneId}`;
}
function indexDbUrl(sceneId) {
    return `${sceneFolderDbUrl(sceneId)}/${exports.INDEX_FILE_NAME}`;
}
function indexFsPath(sceneId) {
    return path.join(sceneFolderFsPath(sceneId), exports.INDEX_FILE_NAME);
}
function logicFolderFsPath(sceneId, logicId) {
    return path.join(sceneFolderFsPath(sceneId), 'logic', String(logicId));
}
function logicIndexFsPath(sceneId, logicId) {
    return path.join(logicFolderFsPath(sceneId, logicId), exports.INDEX_FILE_NAME);
}
function logicIndexDbUrl(sceneId, logicId) {
    return `${sceneFolderDbUrl(sceneId)}/logic/${logicId}/${exports.INDEX_FILE_NAME}`;
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
function legacyChapterPrefabFs(poolName) {
    return path.join(getProjectRoot(), 'assets', 'resources', 'Prefabs', `${poolName}.prefab`);
}
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
/** Chapter01_Level00 → Chapter01 */
function categoryFromPoolName(poolName) {
    const m = poolName.match(/^(Chapter\d+)/i);
    return m ? m[1] : 'uncategorized';
}
//# sourceMappingURL=paths.js.map