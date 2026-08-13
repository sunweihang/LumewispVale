'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.ensureRegistered = ensureRegistered;
exports.openGuide = openGuide;
exports.load = load;
exports.unload = unload;
const browseGuides_1 = require("./browseGuides");
const createGuide_1 = require("./createGuide");
const deleteGuide_1 = require("./deleteGuide");
const TsGuideExporter_1 = require("./export/TsGuideExporter");
const guideNodes_1 = require("./nodes/guideNodes");
const guidePortTypes_1 = require("./nodes/guidePortTypes");
const paths_1 = require("./paths");
const profile_1 = require("./profile");
const syncGuideGraphPorts_1 = require("./syncGuideGraphPorts");
const validateGuideGraph_1 = require("./validateGuideGraph");
const PKG = 'guide-editor';
const NODE_GRAPH = 'node-graph';
let registered = false;
async function dialogInfo(message) {
    try {
        await Editor.Dialog.info(message, { title: '引导编辑器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.log(`[guide-editor] ${message}`);
    }
}
async function dialogWarn(message) {
    try {
        await Editor.Dialog.warn(message, { title: '引导编辑器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.warn(`[guide-editor] ${message}`);
    }
}
async function dialogError(message) {
    try {
        await Editor.Dialog.error(message, { title: '引导编辑器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.error(`[guide-editor] ${message}`);
    }
}
async function dialogConfirm(message, okLabel = '确定') {
    try {
        const result = (await Editor.Dialog.warn(message, {
            title: '引导编辑器',
            buttons: ['取消', okLabel],
            default: 0,
            cancel: 0,
        }));
        const response = typeof result === 'number' ? result : result === null || result === void 0 ? void 0 : result.response;
        return response === 1;
    }
    catch {
        return false;
    }
}
async function probeNodeGraph() {
    try {
        await Editor.Message.request(NODE_GRAPH, 'query-node-defs');
        return true;
    }
    catch {
        return false;
    }
}
/** @param silent 启动重试时为 true：不弹框、不刷「未启用」警告（扩展加载顺序竞态很常见） */
async function ensureNodeGraph(silent = false) {
    if (await probeNodeGraph())
        return true;
    if (!silent) {
        await dialogWarn('未检测到 node-graph 扩展。请先启用「node-graph」，再使用引导编辑器。');
    }
    return false;
}
async function ensureRegistered(silent = false) {
    if (registered)
        return { ok: true };
    if (!(await ensureNodeGraph(silent)))
        return { ok: false };
    try {
        const nodes = (0, guideNodes_1.allGuideRegisterNodes)();
        await Editor.Message.request(NODE_GRAPH, 'register-port-types', { portTypes: guidePortTypes_1.GUIDE_PORT_TYPES });
        await Editor.Message.request(NODE_GRAPH, 'register-nodes', { nodes });
        registered = true;
        console.log(`[guide-editor] registered ${nodes.length} guide nodes (${guideNodes_1.GUIDE_NODE_DEFS.length} domain + builtins)`);
        return { ok: true };
    }
    catch (e) {
        if (silent)
            console.warn('[guide-editor] register failed', e);
        else
            await dialogError(`注册引导节点失败: ${e}`);
        return { ok: false };
    }
}
/** 等 node-graph 加载完成再注册；中间失败静默，仅最终仍失败时提示一次 */
async function autoRegisterWithRetry() {
    const gaps = [200, 400, 1200, 3000, 6000];
    for (let i = 0; i < gaps.length; i++) {
        await new Promise((r) => setTimeout(r, gaps[i]));
        if ((await ensureRegistered(true)).ok)
            return;
    }
    console.warn('[guide-editor] node-graph still unavailable after retries; will register on first use');
}
async function openGuide(arg) {
    const guideId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.guideId;
    if (!guideId) {
        await dialogWarn('请提供 guideId');
        return { ok: false };
    }
    if (!(await ensureRegistered()).ok)
        return { ok: false };
    (0, syncGuideGraphPorts_1.syncGuideGraphOnDisk)(guideId);
    await Editor.Message.request(NODE_GRAPH, 'open-graph', {
        path: (0, paths_1.graphDbUrl)(guideId),
        profile: (0, profile_1.buildGuideGraphProfile)(),
    });
    return { ok: true };
}
exports.methods = {
    async ensureRegistered() {
        return ensureRegistered();
    },
    async battleModuleInfo() {
        return {
            id: 'guide',
            packageName: PKG,
            title: '引导',
            order: 10,
            group: 'guide',
            groupTitle: '引导管理',
            groupOrder: 18,
            itemIdKey: 'guideId',
            openArgKey: 'guideId',
            emptyHint: '暂无引导。请点「创建」。',
            openLabel: '编辑',
            exportLabel: '导出TS',
            messages: {
                list: 'list-guides',
                open: 'open-guide',
                exportOne: 'export-guide',
                exportBatch: 'export-ts-batch',
                create: 'create-guide',
                delete: 'delete-guide',
                validateOne: 'validate-guide',
            },
        };
    },
    async browseGuides() {
        await ensureRegistered();
        try {
            await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'guide' });
            return;
        }
        catch {
            Editor.Panel.open(`${PKG}.browser`);
        }
    },
    async listGuides() {
        return (0, browseGuides_1.listLocalGuides)();
    },
    async openGuide(arg) {
        return openGuide(arg);
    },
    async exportGuide(arg) {
        const guideId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.guideId;
        if (!guideId)
            return { ok: false };
        const r = (0, TsGuideExporter_1.exportGuideTs)(guideId);
        if (!r.ok) {
            await dialogError(`导出失败: ${r.error}`);
            return r;
        }
        await dialogInfo(`已导出引导 ${guideId}\n${r.path}`);
        return r;
    },
    async exportTsBatch() {
        const { ok, fail, results } = (0, TsGuideExporter_1.exportAllFlagged)();
        const detail = results
            .filter((r) => !r.ok)
            .map((r) => `${r.guideId}: ${r.error}`)
            .join('\n');
        await dialogInfo(`批量导出完成：成功 ${ok}，失败 ${fail}${detail ? `\n${detail}` : ''}`);
        return { ok, fail };
    },
    async createGuide(arg) {
        if (!(await ensureRegistered()).ok)
            return { ok: false };
        const guideId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.guideId;
        if (!guideId || guideId <= 0) {
            Editor.Panel.open(`${PKG}.create`);
            return { ok: false, cancelled: true };
        }
        const result = await (0, createGuide_1.createGuideAssets)({
            guideId,
            name: `Guide ${guideId}`,
            exportFlag: true,
        });
        if (!result.ok) {
            await dialogError(result.error || '创建失败');
            return result;
        }
        return result;
    },
    async createGuideApi(arg) {
        var _a;
        if (!(await ensureRegistered()).ok)
            return { ok: false, error: 'node-graph 未就绪' };
        const guideId = arg === null || arg === void 0 ? void 0 : arg.guideId;
        if (!guideId || guideId <= 0) {
            return { ok: false, error: '请手动指定 guideId' };
        }
        return (0, createGuide_1.createGuideAssets)({
            guideId,
            name: (arg === null || arg === void 0 ? void 0 : arg.name) || `Guide ${guideId}`,
            description: arg === null || arg === void 0 ? void 0 : arg.description,
            category: arg === null || arg === void 0 ? void 0 : arg.category,
            exportFlag: (_a = arg === null || arg === void 0 ? void 0 : arg.exportFlag) !== null && _a !== void 0 ? _a : true,
        });
    },
    async validateGuide(arg) {
        const guideId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.guideId;
        if (!guideId)
            return { ok: false };
        (0, syncGuideGraphPorts_1.syncGuideGraphOnDisk)(guideId);
        const r = (0, validateGuideGraph_1.validateGuideOnDisk)(guideId);
        const msg = r.ok
            ? `校验通过\n${r.warnings.join('\n')}`
            : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
        if (r.ok)
            await dialogInfo(msg);
        else
            await dialogWarn(msg);
        return r;
    },
    async deleteGuide(arg) {
        const guideId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.guideId;
        if (!guideId) {
            await dialogWarn('请提供 guideId');
            return { ok: false };
        }
        const item = (0, browseGuides_1.listLocalGuides)().find((s) => s.guideId === guideId);
        const label = item ? `${guideId} ${item.name}` : String(guideId);
        const confirmed = await dialogConfirm(`确定删除引导 ${label}？\n将删除 assets/resources/guide-graphs/${guideId}/ 与对应 TsGuide（不可恢复）`, '删除');
        if (!confirmed)
            return { ok: false, cancelled: true };
        const result = await (0, deleteGuide_1.deleteGuideAssets)(guideId);
        if (!result.ok) {
            await dialogError(result.error || '删除失败');
            return result;
        }
        await dialogInfo(`已删除引导 ${guideId}`);
        return result;
    },
};
function load() {
    autoRegisterWithRetry().catch((e) => console.warn('[guide-editor] auto-register failed', e));
    console.log('[guide-editor] extension loaded');
}
function unload() {
    registered = false;
    console.log('[guide-editor] extension unloaded');
}
//# sourceMappingURL=main.js.map