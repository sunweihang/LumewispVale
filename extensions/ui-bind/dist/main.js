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
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
exports.generateFromPrefab = generateFromPrefab;
exports.generatePanRole = generatePanRole;
exports.generateFromCde = generateFromCde;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const generateFromPrefab_1 = require("./generateFromPrefab");
async function dialogInfo(message) {
    try {
        await Editor.Dialog.info(message, { title: 'UI Bind', buttons: ['确定'], default: 0 });
    }
    catch {
        console.log(`[ui-bind] ${message}`);
    }
}
async function dialogError(message) {
    try {
        await Editor.Dialog.error(message, { title: 'UI Bind', buttons: ['确定'], default: 0 });
    }
    catch {
        console.error(`[ui-bind] ${message}`);
    }
}
function projectRoot() {
    return Editor.Project.path;
}
async function refreshGenerated(tsPath, jsonPath) {
    try {
        const toDb = (p) => {
            const rel = path.relative(projectRoot(), p).replace(/\\/g, '/');
            return `db://assets/${rel.replace(/^assets\//, '')}`;
        };
        await Editor.Message.request('asset-db', 'refresh-asset', toDb(tsPath));
        await Editor.Message.request('asset-db', 'refresh-asset', toDb(jsonPath));
    }
    catch {
        // ignore refresh failures
    }
}
function load() {
    //
}
function unload() {
    //
}
/** 从资源选中的 prefab / CDE 生成 */
async function generateFromPrefab() {
    try {
        const selected = Editor.Selection.getSelected('asset') || [];
        const uuidOrUrl = selected[0];
        if (!uuidOrUrl) {
            await dialogError('请先在资源管理器中选中一个 .prefab（UI 或 *_CDE）');
            return;
        }
        let prefabPath = '';
        try {
            const info = (await Editor.Message.request('asset-db', 'query-path', uuidOrUrl));
            prefabPath = info || '';
        }
        catch {
            prefabPath = '';
        }
        if (!prefabPath || !prefabPath.endsWith('.prefab')) {
            if (typeof uuidOrUrl === 'string' && uuidOrUrl.endsWith('.prefab') && fs.existsSync(uuidOrUrl)) {
                prefabPath = uuidOrUrl;
            }
        }
        if (!prefabPath || !fs.existsSync(prefabPath)) {
            await dialogError(`无法解析 Prefab 路径: ${uuidOrUrl}`);
            return;
        }
        const result = (0, generateFromPrefab_1.scanPrefabFile)(prefabPath);
        const out = (0, generateFromPrefab_1.writeGenerated)(projectRoot(), result);
        await refreshGenerated(out.tsPath, out.jsonPath);
        await dialogInfo(`已生成:\n${path.relative(projectRoot(), out.tsPath)}\n${path.relative(projectRoot(), out.jsonPath)}\n组件 ${result.components.length} / 事件 ${result.events.length} / 数据 ${result.data.length}`);
    }
    catch (e) {
        await dialogError(String(e));
    }
}
/** 快捷：Pan_Role（优先新目录 CDE，其次 UI 预制体） */
async function generatePanRole() {
    try {
        const candidates = [
            path.join(projectRoot(), 'assets/resources/UI/Pan_Role/Prefabs/Pan_Role_CDE.prefab'),
            path.join(projectRoot(), 'assets/resources/UI/Pan_Role/Prefabs/Pan_Role.prefab'),
            path.join(projectRoot(), 'assets/resources/Prefabs/UI/Pan_Role.prefab'),
        ];
        const prefabPath = candidates.find((p) => fs.existsSync(p));
        if (!prefabPath) {
            const out = (0, generateFromPrefab_1.writeGenerated)(projectRoot(), generateFromPrefab_1.PAN_ROLE_DEFAULT);
            await refreshGenerated(out.tsPath, out.jsonPath);
            await dialogInfo(`Prefab/CDE 不存在，已按默认表生成:\n${out.tsPath}`);
            return;
        }
        const result = (0, generateFromPrefab_1.scanPrefabFile)(prefabPath, 'Pan_Role');
        const out = (0, generateFromPrefab_1.writeGenerated)(projectRoot(), result);
        await refreshGenerated(out.tsPath, out.jsonPath);
        await dialogInfo(`Pan_Role 绑定已生成（源: ${path.relative(projectRoot(), prefabPath)}）:\n${path.relative(projectRoot(), out.tsPath)}\n组件 ${result.components.length} / 事件 ${result.events.length} / 数据 ${result.data.length}`);
    }
    catch (e) {
        await dialogError(String(e));
    }
}
/**
 * 供 UIBindCDEConfigAsset「生成代码」勾选调用。
 * payload = ConfigAsset.toConfig() (+ 可选 panelName)
 */
async function generateFromCde(payload) {
    try {
        if (!payload || typeof payload !== 'object') {
            await dialogError('CDE 载荷为空');
            return { ok: false };
        }
        const result = (0, generateFromPrefab_1.bindResultFromCdeConfig)(payload);
        if (!result.panelName) {
            await dialogError('CDE 缺少 ResName / panelName');
            return { ok: false };
        }
        const out = (0, generateFromPrefab_1.writeGenerated)(projectRoot(), result);
        await refreshGenerated(out.tsPath, out.jsonPath);
        console.log(`[ui-bind] 已从 CDE 生成 ${result.panelName}: C=${result.components.length} E=${result.events.length} D=${result.data.length}`);
        return {
            ok: true,
            tsPath: out.tsPath,
            jsonPath: out.jsonPath,
            components: result.components.length,
            events: result.events.length,
            data: result.data.length,
        };
    }
    catch (e) {
        await dialogError(String(e));
        return { ok: false, error: String(e) };
    }
}
exports.methods = {
    generateFromPrefab,
    generatePanRole,
    generateFromCde,
};
//# sourceMappingURL=main.js.map