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
exports.CLASS_PREFIX = exports.GRAPH_FILE_NAME = exports.INDEX_FILE_NAME = exports.STORY_GRAPHS_DB_ROOT = void 0;
exports.storyFolderDbUrl = storyFolderDbUrl;
exports.graphDbUrl = graphDbUrl;
exports.indexDbUrl = indexDbUrl;
exports.getProjectRoot = getProjectRoot;
exports.storyGraphsFsRoot = storyGraphsFsRoot;
exports.storyFolderFs = storyFolderFs;
exports.indexFsPath = indexFsPath;
exports.graphFsPath = graphFsPath;
exports.generatedDirFs = generatedDirFs;
exports.generatedClassFsPath = generatedClassFsPath;
exports.classMapFsPath = classMapFsPath;
exports.templatesDir = templatesDir;
exports.ensureDir = ensureDir;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.STORY_GRAPHS_DB_ROOT = 'db://assets/resources/story-graphs';
exports.INDEX_FILE_NAME = 'index.json';
exports.GRAPH_FILE_NAME = 'graph.graph.json';
exports.CLASS_PREFIX = 'TsStory';
function storyFolderDbUrl(storyId) {
    return `${exports.STORY_GRAPHS_DB_ROOT}/${storyId}`;
}
function graphDbUrl(storyId) {
    return `${storyFolderDbUrl(storyId)}/${exports.GRAPH_FILE_NAME}`;
}
function indexDbUrl(storyId) {
    return `${storyFolderDbUrl(storyId)}/${exports.INDEX_FILE_NAME}`;
}
function getProjectRoot() {
    var _a;
    if (typeof Editor !== 'undefined' && ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path)) {
        return Editor.Project.path;
    }
    return path.resolve(__dirname, '../../..');
}
function storyGraphsFsRoot() {
    return path.join(getProjectRoot(), 'assets', 'resources', 'story-graphs');
}
function storyFolderFs(storyId) {
    return path.join(storyGraphsFsRoot(), String(storyId));
}
function indexFsPath(storyId) {
    return path.join(storyFolderFs(storyId), exports.INDEX_FILE_NAME);
}
function graphFsPath(storyId) {
    return path.join(storyFolderFs(storyId), exports.GRAPH_FILE_NAME);
}
function generatedDirFs() {
    // LumewispVale uses assets/scripts (lowercase); 后室为 assets/Scripts/src/story/generated
    return path.join(getProjectRoot(), 'assets', 'scripts', 'story', 'generated');
}
function generatedClassFsPath(storyId) {
    return path.join(generatedDirFs(), `${exports.CLASS_PREFIX}${storyId}.ts`);
}
function classMapFsPath() {
    return path.join(generatedDirFs(), 'TsStoryClassMap.ts');
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