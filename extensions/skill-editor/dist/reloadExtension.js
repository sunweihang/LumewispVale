'use strict';
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
exports.extensionRoot = extensionRoot;
exports.buildExtension = buildExtension;
exports.reloadExtensionPackage = reloadExtensionPackage;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
/** dist/ → extensions/skill-editor */
function extensionRoot() {
    return path.resolve(__dirname, '..');
}
async function buildExtension() {
    const root = extensionRoot();
    try {
        const log = (0, child_process_1.execSync)('npm run build', {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return { ok: true, log: String(log || '').trim() };
    }
    catch (e) {
        const err = e;
        const log = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n').trim();
        return { ok: false, log: log || String(e) };
    }
}
/**
 * 触发 Cocos 扩展管理器同款「刷新」：卸载再加载本扩展，使 dist 新代码生效。
 * 参数优先用扩展根目录（论坛常用），失败再试包名。
 */
async function reloadExtensionPackage(packageName) {
    const root = extensionRoot();
    const attempts = [
        { label: `extension.reload(path)`, run: () => Editor.Message.request('extension', 'reload', root) },
        { label: `extension.reload(name)`, run: () => Editor.Message.request('extension', 'reload', packageName) },
    ];
    const pkgApi = Editor.Package;
    if (typeof (pkgApi === null || pkgApi === void 0 ? void 0 : pkgApi.reload) === 'function') {
        attempts.push({
            label: 'Editor.Package.reload',
            run: async () => pkgApi.reload(packageName),
        });
    }
    const errors = [];
    for (const a of attempts) {
        try {
            await a.run();
            console.log(`[skill-editor] reload ok via ${a.label}`);
            return;
        }
        catch (e) {
            errors.push(`${a.label}: ${e}`);
        }
    }
    throw new Error(errors.join('\n') || 'reload failed');
}
//# sourceMappingURL=reloadExtension.js.map