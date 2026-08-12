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
exports.CLASS_PREFIX = exports.GRAPH_FILE_NAME = exports.INDEX_FILE_NAME = exports.MODIFIER_GRAPHS_DB_ROOT = void 0;
exports.modifierFolderDbUrl = modifierFolderDbUrl;
exports.graphDbUrl = graphDbUrl;
exports.indexDbUrl = indexDbUrl;
exports.getProjectRoot = getProjectRoot;
exports.modifierGraphsFsRoot = modifierGraphsFsRoot;
exports.modifierFolderFs = modifierFolderFs;
exports.indexFsPath = indexFsPath;
exports.graphFsPath = graphFsPath;
exports.generatedDirFs = generatedDirFs;
exports.generatedClassFsPath = generatedClassFsPath;
exports.classMapFsPath = classMapFsPath;
exports.templatesDir = templatesDir;
exports.ensureDir = ensureDir;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.MODIFIER_GRAPHS_DB_ROOT = 'db://assets/resources/modifier-graphs';
exports.INDEX_FILE_NAME = 'index.json';
exports.GRAPH_FILE_NAME = 'graph.graph.json';
exports.CLASS_PREFIX = 'TsModifier';
function modifierFolderDbUrl(modifierId) {
    return `${exports.MODIFIER_GRAPHS_DB_ROOT}/${modifierId}`;
}
function graphDbUrl(modifierId) {
    return `${modifierFolderDbUrl(modifierId)}/${exports.GRAPH_FILE_NAME}`;
}
function indexDbUrl(modifierId) {
    return `${modifierFolderDbUrl(modifierId)}/${exports.INDEX_FILE_NAME}`;
}
function getProjectRoot() {
    var _a;
    if (typeof Editor !== 'undefined' && ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path)) {
        return Editor.Project.path;
    }
    return path.resolve(__dirname, '../../..');
}
function modifierGraphsFsRoot() {
    return path.join(getProjectRoot(), 'assets', 'resources', 'modifier-graphs');
}
function modifierFolderFs(modifierId) {
    return path.join(modifierGraphsFsRoot(), String(modifierId));
}
function indexFsPath(modifierId) {
    return path.join(modifierFolderFs(modifierId), exports.INDEX_FILE_NAME);
}
function graphFsPath(modifierId) {
    return path.join(modifierFolderFs(modifierId), exports.GRAPH_FILE_NAME);
}
function generatedDirFs() {
    return path.join(getProjectRoot(), 'assets', 'Scripts', 'src', 'skill', 'modifier', 'generated');
}
function generatedClassFsPath(modifierId) {
    return path.join(generatedDirFs(), `${exports.CLASS_PREFIX}${modifierId}.ts`);
}
function classMapFsPath() {
    return path.join(generatedDirFs(), 'TsModifierClassMap.ts');
}
function templatesDir() {
    // dist/export or dist/ -> ../templates
    return path.resolve(__dirname, '..', 'templates');
}
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
//# sourceMappingURL=paths.js.map