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
exports.deleteStoryAssets = deleteStoryAssets;
exports.storyFolderExists = storyFolderExists;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ClassMapGenerator_1 = require("./export/ClassMapGenerator");
const paths_1 = require("./paths");
/**
 * 删除剧情图目录 + 已导出的 TsStory{id}.ts，并重建 ClassMap。
 */
async function deleteStoryAssets(storyId) {
    if (!Number.isFinite(storyId) || storyId <= 0) {
        return { ok: false, error: '无效的 storyId' };
    }
    const folderFs = (0, paths_1.storyFolderFs)(storyId);
    const metaFs = `${folderFs}.meta`;
    const genTs = (0, paths_1.generatedClassFsPath)(storyId);
    const genMeta = `${genTs}.meta`;
    const exists = fs.existsSync(folderFs) ||
        fs.existsSync(metaFs) ||
        fs.existsSync(genTs);
    if (!exists) {
        return { ok: false, error: `剧情 ${storyId} 不存在` };
    }
    const dbUrl = (0, paths_1.storyFolderDbUrl)(storyId);
    try {
        await Editor.Message.request('asset-db', 'delete-asset', dbUrl);
    }
    catch (e) {
        console.warn('[story-editor] asset-db delete-asset failed, fallback fs', dbUrl, e);
    }
    try {
        if (fs.existsSync(folderFs)) {
            fs.rmSync(folderFs, { recursive: true, force: true });
        }
        if (fs.existsSync(metaFs)) {
            fs.rmSync(metaFs, { force: true });
        }
        if (fs.existsSync(genTs)) {
            fs.rmSync(genTs, { force: true });
        }
        if (fs.existsSync(genMeta)) {
            fs.rmSync(genMeta, { force: true });
        }
    }
    catch (e) {
        return { ok: false, error: `删除失败: ${e}` };
    }
    if (fs.existsSync(folderFs) || fs.existsSync(metaFs)) {
        return { ok: false, error: `删除未完成，请手动删除 ${folderFs}` };
    }
    // 若根目录空了也无妨；ClassMap 按剩余导出类重建
    void (0, paths_1.storyGraphsFsRoot)();
    (0, ClassMapGenerator_1.regenerateClassMap)();
    // 尝试刷新 generated 目录
    try {
        const genDb = `db://assets/Scripts/src/story/generated`;
        await Editor.Message.request('asset-db', 'refresh-asset', genDb);
    }
    catch {
        /* ignore */
    }
    console.log(`[story-editor] deleted story ${storyId}`);
    return { ok: true };
}
function storyFolderExists(storyId) {
    return fs.existsSync(path.join((0, paths_1.storyGraphsFsRoot)(), String(storyId)));
}
//# sourceMappingURL=deleteStory.js.map