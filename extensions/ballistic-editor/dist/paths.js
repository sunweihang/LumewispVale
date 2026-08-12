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
exports.CLASS_PREFIX = exports.INDEX_FILE_NAME = exports.GRAPH_FILE_NAME = exports.BALLISTIC_GRAPHS_DB_ROOT = void 0;
exports.ballisticFolderDbUrl = ballisticFolderDbUrl;
exports.graphDbUrl = graphDbUrl;
exports.indexDbUrl = indexDbUrl;
exports.getProjectRoot = getProjectRoot;
exports.ballisticGraphsFsRoot = ballisticGraphsFsRoot;
exports.graphFsPath = graphFsPath;
exports.indexFsPath = indexFsPath;
exports.generatedDirFs = generatedDirFs;
exports.generatedClassFsPath = generatedClassFsPath;
exports.classMapFsPath = classMapFsPath;
exports.skillGraphsFsRoot = skillGraphsFsRoot;
exports.templatesDir = templatesDir;
exports.ensureDir = ensureDir;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
exports.BALLISTIC_GRAPHS_DB_ROOT = 'db://assets/resources/ballistic-graphs';
exports.GRAPH_FILE_NAME = 'graph.graph.json';
exports.INDEX_FILE_NAME = 'index.json';
exports.CLASS_PREFIX = 'TsBallistic';
function ballisticFolderDbUrl(ballisticId) {
    return `${exports.BALLISTIC_GRAPHS_DB_ROOT}/${ballisticId}`;
}
function graphDbUrl(ballisticId) {
    return `${ballisticFolderDbUrl(ballisticId)}/${exports.GRAPH_FILE_NAME}`;
}
function indexDbUrl(ballisticId) {
    return `${ballisticFolderDbUrl(ballisticId)}/${exports.INDEX_FILE_NAME}`;
}
function getProjectRoot() {
    var _a;
    if (typeof Editor !== 'undefined' && ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path)) {
        return Editor.Project.path;
    }
    return path.resolve(__dirname, '../../..');
}
function ballisticGraphsFsRoot() {
    return path.join(getProjectRoot(), 'assets', 'resources', 'ballistic-graphs');
}
function graphFsPath(ballisticId) {
    return path.join(ballisticGraphsFsRoot(), String(ballisticId), exports.GRAPH_FILE_NAME);
}
function indexFsPath(ballisticId) {
    return path.join(ballisticGraphsFsRoot(), String(ballisticId), exports.INDEX_FILE_NAME);
}
function generatedDirFs() {
    return path.join(getProjectRoot(), 'assets', 'Scripts', 'src', 'skill', 'ballistic', 'generated');
}
function generatedClassFsPath(ballisticId) {
    return path.join(generatedDirFs(), `${exports.CLASS_PREFIX}${ballisticId}.ts`);
}
function classMapFsPath() {
    return path.join(generatedDirFs(), 'TsBallisticClassMap.ts');
}
function skillGraphsFsRoot() {
    return path.join(getProjectRoot(), 'assets', 'resources', 'skill-graphs');
}
function templatesDir() {
    return path.resolve(__dirname, '..', 'templates');
}
function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}
//# sourceMappingURL=paths.js.map