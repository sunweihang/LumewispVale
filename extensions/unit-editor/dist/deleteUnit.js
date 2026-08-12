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
exports.deleteUnitAssets = deleteUnitAssets;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const paths_1 = require("./paths");
async function deleteUnitAssets(unitId) {
    if (!Number.isFinite(unitId) || unitId <= 0) {
        return { ok: false, error: '无效的 unitId' };
    }
    const folderFs = path.join((0, paths_1.unitsFsRoot)(), String(unitId));
    const metaFs = `${folderFs}.meta`;
    const exists = fs.existsSync(folderFs) || fs.existsSync(metaFs);
    if (!exists) {
        return { ok: false, error: `单位 ${unitId} 不存在` };
    }
    const dbUrl = (0, paths_1.unitFolderDbUrl)(unitId);
    try {
        await Editor.Message.request('asset-db', 'delete-asset', dbUrl);
    }
    catch (e) {
        console.warn('[unit-editor] asset-db delete-asset failed, fallback fs', dbUrl, e);
    }
    try {
        if (fs.existsSync(folderFs)) {
            fs.rmSync(folderFs, { recursive: true, force: true });
        }
        if (fs.existsSync(metaFs)) {
            fs.rmSync(metaFs, { force: true });
        }
    }
    catch (e) {
        return { ok: false, error: `删除失败: ${e}` };
    }
    if (fs.existsSync(folderFs) || fs.existsSync(metaFs)) {
        return { ok: false, error: `删除未完成，请手动删除 ${folderFs}` };
    }
    console.log(`[unit-editor] deleted unit ${unitId}`);
    return { ok: true };
}
//# sourceMappingURL=deleteUnit.js.map