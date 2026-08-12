'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.ensureRegistered = ensureRegistered;
exports.openStory = openStory;
exports.load = load;
exports.unload = unload;
const browseStories_1 = require("./browseStories");
const createStory_1 = require("./createStory");
const deleteStory_1 = require("./deleteStory");
const TsStoryExporter_1 = require("./export/TsStoryExporter");
const storyNodes_1 = require("./nodes/storyNodes");
const storyPortTypes_1 = require("./nodes/storyPortTypes");
const paths_1 = require("./paths");
const profile_1 = require("./profile");
const syncStoryGraphPorts_1 = require("./syncStoryGraphPorts");
const validateStoryGraph_1 = require("./validateStoryGraph");
const PKG = 'story-editor';
const NODE_GRAPH = 'node-graph';
let registered = false;
async function dialogInfo(message) {
    try {
        await Editor.Dialog.info(message, { title: '剧情编辑器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.log(`[story-editor] ${message}`);
    }
}
async function dialogWarn(message) {
    try {
        await Editor.Dialog.warn(message, { title: '剧情编辑器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.warn(`[story-editor] ${message}`);
    }
}
async function dialogError(message) {
    try {
        await Editor.Dialog.error(message, { title: '剧情编辑器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.error(`[story-editor] ${message}`);
    }
}
async function dialogConfirm(message, okLabel = '确定') {
    try {
        const result = (await Editor.Dialog.warn(message, {
            title: '剧情编辑器',
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
        await dialogWarn('未检测到 node-graph 扩展。请先启用「node-graph」，再使用剧情编辑器。');
    }
    return false;
}
async function ensureRegistered(silent = false) {
    if (registered)
        return { ok: true };
    if (!(await ensureNodeGraph(silent)))
        return { ok: false };
    try {
        const nodes = (0, storyNodes_1.allStoryRegisterNodes)();
        await Editor.Message.request(NODE_GRAPH, 'register-port-types', { portTypes: storyPortTypes_1.STORY_PORT_TYPES });
        await Editor.Message.request(NODE_GRAPH, 'register-nodes', { nodes });
        registered = true;
        console.log(`[story-editor] registered ${nodes.length} story nodes (${storyNodes_1.STORY_NODE_DEFS.length} domain + builtins)`);
        return { ok: true };
    }
    catch (e) {
        if (silent)
            console.warn('[story-editor] register failed', e);
        else
            await dialogError(`注册剧情节点失败: ${e}`);
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
    console.warn('[story-editor] node-graph still unavailable after retries; will register on first use');
}
async function openStory(arg) {
    const storyId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.storyId;
    if (!storyId) {
        await dialogWarn('请提供 storyId');
        return { ok: false };
    }
    if (!(await ensureRegistered()).ok)
        return { ok: false };
    (0, syncStoryGraphPorts_1.syncStoryGraphOnDisk)(storyId);
    await Editor.Message.request(NODE_GRAPH, 'open-graph', {
        path: (0, paths_1.graphDbUrl)(storyId),
        profile: (0, profile_1.buildStoryGraphProfile)(),
    });
    return { ok: true };
}
exports.methods = {
    async ensureRegistered() {
        return ensureRegistered();
    },
    async battleModuleInfo() {
        return {
            id: 'story',
            packageName: PKG,
            title: '剧情',
            order: 10,
            group: 'story',
            groupTitle: '剧情管理',
            groupOrder: 18,
            itemIdKey: 'storyId',
            openArgKey: 'storyId',
            emptyHint: '暂无剧情。请点「创建」。',
            openLabel: '编辑',
            exportLabel: '导出TS',
            messages: {
                list: 'list-stories',
                open: 'open-story',
                exportOne: 'export-story',
                exportBatch: 'export-ts-batch',
                create: 'create-story',
                delete: 'delete-story',
                validateOne: 'validate-story',
            },
        };
    },
    async browseStories() {
        await ensureRegistered();
        try {
            await Editor.Message.request('battle-manager', 'select-module', { moduleId: 'story' });
            return;
        }
        catch {
            Editor.Panel.open(`${PKG}.browser`);
        }
    },
    async listStories() {
        return (0, browseStories_1.listLocalStories)();
    },
    async openStory(arg) {
        return openStory(arg);
    },
    async exportStory(arg) {
        const storyId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.storyId;
        if (!storyId)
            return { ok: false };
        const r = (0, TsStoryExporter_1.exportStoryTs)(storyId);
        if (!r.ok) {
            await dialogError(`导出失败: ${r.error}`);
            return r;
        }
        await dialogInfo(`已导出剧情 ${storyId}\n${r.path}`);
        return r;
    },
    async exportTsBatch() {
        const { ok, fail, results } = (0, TsStoryExporter_1.exportAllFlagged)();
        const detail = results
            .filter((r) => !r.ok)
            .map((r) => `${r.storyId}: ${r.error}`)
            .join('\n');
        await dialogInfo(`批量导出完成：成功 ${ok}，失败 ${fail}${detail ? `\n${detail}` : ''}`);
        return { ok, fail };
    },
    async createStory(arg) {
        if (!(await ensureRegistered()).ok)
            return { ok: false };
        const storyId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.storyId;
        if (!storyId || storyId <= 0) {
            Editor.Panel.open(`${PKG}.create`);
            return { ok: false, cancelled: true };
        }
        const result = await (0, createStory_1.createStoryAssets)({
            storyId,
            name: `Story ${storyId}`,
            exportFlag: true,
        });
        if (!result.ok) {
            await dialogError(result.error || '创建失败');
            return result;
        }
        return result;
    },
    async createStoryApi(arg) {
        var _a;
        if (!(await ensureRegistered()).ok)
            return { ok: false, error: 'node-graph 未就绪' };
        const storyId = arg === null || arg === void 0 ? void 0 : arg.storyId;
        if (!storyId || storyId <= 0) {
            return { ok: false, error: '请手动指定 storyId' };
        }
        return (0, createStory_1.createStoryAssets)({
            storyId,
            name: (arg === null || arg === void 0 ? void 0 : arg.name) || `Story ${storyId}`,
            description: arg === null || arg === void 0 ? void 0 : arg.description,
            category: arg === null || arg === void 0 ? void 0 : arg.category,
            exportFlag: (_a = arg === null || arg === void 0 ? void 0 : arg.exportFlag) !== null && _a !== void 0 ? _a : true,
        });
    },
    async validateStory(arg) {
        const storyId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.storyId;
        if (!storyId)
            return { ok: false };
        (0, syncStoryGraphPorts_1.syncStoryGraphOnDisk)(storyId);
        const r = (0, validateStoryGraph_1.validateStoryOnDisk)(storyId);
        const msg = r.ok
            ? `校验通过\n${r.warnings.join('\n')}`
            : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
        if (r.ok)
            await dialogInfo(msg);
        else
            await dialogWarn(msg);
        return r;
    },
    async deleteStory(arg) {
        const storyId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.storyId;
        if (!storyId) {
            await dialogWarn('请提供 storyId');
            return { ok: false };
        }
        const item = (0, browseStories_1.listLocalStories)().find((s) => s.storyId === storyId);
        const label = item ? `${storyId} ${item.name}` : String(storyId);
        const confirmed = await dialogConfirm(`确定删除剧情 ${label}？\n将删除 assets/resources/story-graphs/${storyId}/ 与对应 TsStory（不可恢复）`, '删除');
        if (!confirmed)
            return { ok: false, cancelled: true };
        const result = await (0, deleteStory_1.deleteStoryAssets)(storyId);
        if (!result.ok) {
            await dialogError(result.error || '删除失败');
            return result;
        }
        await dialogInfo(`已删除剧情 ${storyId}`);
        return result;
    },
};
function load() {
    autoRegisterWithRetry().catch((e) => console.warn('[story-editor] auto-register failed', e));
    console.log('[story-editor] extension loaded');
}
function unload() {
    registered = false;
    console.log('[story-editor] extension unloaded');
}
//# sourceMappingURL=main.js.map