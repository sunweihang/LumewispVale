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
exports.dbUrlToFsPath = dbUrlToFsPath;
exports.writeTextAsset = writeTextAsset;
exports.readTextAsset = readTextAsset;
exports.writeFsText = writeFsText;
exports.readFsText = readFsText;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const paths_1 = require("./paths");
async function dbUrlToFsPath(dbUrl) {
    try {
        const fsPath = (await Editor.Message.request('asset-db', 'query-path', dbUrl));
        return fsPath || null;
    }
    catch {
        return null;
    }
}
/** Write text asset under db://; creates parent dirs on disk then create-asset / overwrite. */
async function writeTextAsset(dbUrl, content) {
    const projectRoot = (0, paths_1.getProjectRoot)();
    // db://assets/... -> assets/...
    const rel = dbUrl.replace(/^db:\/\//, '');
    const fsPath = path.join(projectRoot, rel);
    (0, paths_1.ensureDir)(path.dirname(fsPath));
    let existing = await dbUrlToFsPath(dbUrl);
    if (!existing) {
        try {
            await Editor.Message.request('asset-db', 'create-asset', dbUrl, content);
            return true;
        }
        catch (e) {
            // asset-db may fail if folder missing in db; fall through to fs + refresh
            console.warn('[skill-editor] create-asset failed, fallback fs write', dbUrl, e);
        }
    }
    try {
        fs.writeFileSync(fsPath, content, 'utf8');
        try {
            await Editor.Message.request('asset-db', 'refresh-asset', dbUrl);
        }
        catch {
            // refresh may fail for brand-new folders; try parent
            const parentDb = dbUrl.replace(/\/[^/]+$/, '');
            try {
                await Editor.Message.request('asset-db', 'refresh-asset', parentDb);
            }
            catch {
                /* ignore */
            }
        }
        return true;
    }
    catch (e) {
        console.error('[skill-editor] writeTextAsset failed', dbUrl, e);
        return false;
    }
}
async function readTextAsset(dbUrl) {
    const fsPath = await dbUrlToFsPath(dbUrl);
    if (fsPath && fs.existsSync(fsPath)) {
        return fs.readFileSync(fsPath, 'utf8');
    }
    // fallback: project-relative
    const rel = dbUrl.replace(/^db:\/\//, '');
    const alt = path.join((0, paths_1.getProjectRoot)(), rel);
    if (fs.existsSync(alt)) {
        return fs.readFileSync(alt, 'utf8');
    }
    return null;
}
function writeFsText(filePath, content) {
    (0, paths_1.ensureDir)(path.dirname(filePath));
    fs.writeFileSync(filePath, content, 'utf8');
}
function readFsText(filePath) {
    if (!fs.existsSync(filePath))
        return null;
    return fs.readFileSync(filePath, 'utf8');
}
//# sourceMappingURL=assetIo.js.map