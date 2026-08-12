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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const deleteUnit_1 = require("./deleteUnit");
const discoverModules_1 = require("./discoverModules");
const rebuildAllExtensions_1 = require("./rebuildAllExtensions");
const PKG = 'battle-manager';
const PANEL = `${PKG}.host`;
const PROGRESS_PANEL = `${PKG}.progress`;
let cachedModules = [];
let pendingModuleId = null;
let liveProgress = null;
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function pushProgress(state) {
    liveProgress = state;
    try {
        Editor.Message.send(PKG, 'panel-progress-update', state);
    }
    catch {
        /* panel not ready */
    }
}
async function openProgress(title) {
    pushProgress({
        title,
        current: 0,
        total: 1,
        label: '准备中…',
        lines: [],
    });
    try {
        Editor.Panel.open(PROGRESS_PANEL);
    }
    catch (e) {
        console.warn('[battle-manager] open progress panel failed', e);
    }
    // 多等一拍，确保 simple 面板 ready 后再开始同步/异步编译
    await sleep(280);
    pushProgress({
        title,
        current: 0,
        total: 1,
        label: '准备中…',
        lines: [],
    });
}
async function closeProgress() {
    var _a, _b;
    liveProgress = null;
    try {
        (_b = (_a = Editor.Panel).close) === null || _b === void 0 ? void 0 : _b.call(_a, PROGRESS_PANEL);
    }
    catch {
        /* ignore */
    }
}
/** 连刷前记下当前模块，宿主重载后恢复面板 */
async function captureHostRestoreBeforeReload() {
    let moduleId = pendingModuleId || '';
    try {
        const r = (await Editor.Message.request(PKG, 'panel-query-active'));
        if (r === null || r === void 0 ? void 0 : r.moduleId)
            moduleId = r.moduleId;
    }
    catch {
        /* 面板未开 */
    }
    if (moduleId)
        pendingModuleId = moduleId;
    (0, rebuildAllExtensions_1.markHostRestore)({ open: true, moduleId: moduleId || null });
}
async function dialogInfo(message) {
    try {
        await Editor.Dialog.info(message, { title: '战斗管理器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.log(`[battle-manager] ${message}`);
    }
}
async function dialogWarn(message) {
    try {
        await Editor.Dialog.warn(message, { title: '战斗管理器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.warn(`[battle-manager] ${message}`);
    }
}
async function dialogError(message) {
    try {
        await Editor.Dialog.error(message, { title: '战斗管理器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.error(`[battle-manager] ${message}`);
    }
}
async function dialogConfirm(message) {
    try {
        const result = (await Editor.Dialog.warn(message, {
            title: '战斗管理器',
            buttons: ['取消', '删除'],
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
async function ensureModules(force = false) {
    if (!force && cachedModules.length > 0)
        return cachedModules;
    cachedModules = await (0, discoverModules_1.discoverBattleModules)();
    return cachedModules;
}
exports.methods = {
    async openHost(arg) {
        if (arg === null || arg === void 0 ? void 0 : arg.moduleId)
            pendingModuleId = arg.moduleId;
        await ensureModules();
        Editor.Panel.open(PANEL);
        if (arg === null || arg === void 0 ? void 0 : arg.moduleId) {
            // panel may already be open
            try {
                await Editor.Message.request(PKG, 'panel-set-module', { moduleId: arg.moduleId });
            }
            catch {
                /* panel not ready yet — pendingModuleId used on ready */
            }
        }
    },
    async selectModule(arg) {
        const moduleId = typeof arg === 'string' ? arg : arg === null || arg === void 0 ? void 0 : arg.moduleId;
        return exports.methods.openHost({ moduleId });
    },
    async rescanModules() {
        var _a;
        const mods = await ensureModules(true);
        await dialogInfo(mods.length === 0
            ? '未发现子模块。请确认 unit-editor / skill-editor / ballistic-editor / modifier-editor / story-editor 已启用并暴露 battle-module-info。'
            : `已扫描 ${mods.length} 个模块：\n` +
                mods
                    .map((m) => `· ${m.groupTitle || m.group || '-'} / ${m.title} (${m.packageName})`)
                    .join('\n'));
        try {
            await Editor.Message.request(PKG, 'panel-set-module', {
                moduleId: pendingModuleId || ((_a = mods[0]) === null || _a === void 0 ? void 0 : _a.id),
            });
        }
        catch {
            /* panel closed */
        }
        return mods;
    },
    async queryModules() {
        return ensureModules();
    },
    async queryHostState() {
        const mods = await ensureModules();
        return { modules: mods, selectId: pendingModuleId };
    },
    async queryProgress() {
        return liveProgress;
    },
    /** 面板切换模块时记住，供连刷后恢复 */
    async rememberModule(arg) {
        const moduleId = typeof arg === 'string' ? arg : arg === null || arg === void 0 ? void 0 : arg.moduleId;
        pendingModuleId = moduleId || null;
        return { ok: true, moduleId: pendingModuleId };
    },
    async queryActiveModule() {
        try {
            const r = (await Editor.Message.request(PKG, 'panel-query-active'));
            if (r === null || r === void 0 ? void 0 : r.moduleId)
                pendingModuleId = r.moduleId;
        }
        catch {
            /* panel closed */
        }
        return { moduleId: pendingModuleId };
    },
    /** 单位删除兜底（unit-editor 未重载时宿主仍可用） */
    async deleteUnit(arg) {
        const unitId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.unitId;
        if (!unitId) {
            await dialogWarn('请提供 unitId');
            return { ok: false };
        }
        const confirmed = await dialogConfirm(`确定删除单位 ${unitId}？\n将删除 assets/resources/units/${unitId}/（不可恢复）`);
        if (!confirmed)
            return { ok: false, cancelled: true };
        const result = await (0, deleteUnit_1.deleteUnitFolder)(unitId);
        if (!result.ok) {
            await dialogError(result.error || '删除失败');
            return result;
        }
        await dialogInfo(`已删除单位 ${unitId}`);
        return result;
    },
    /** 一键编译并刷新 extensions/ 下全部扩展 */
    async rebuildAndReloadAll() {
        console.log('[battle-manager] rebuild + reload ALL extensions…');
        await captureHostRestoreBeforeReload();
        await openProgress('一键编译并刷新');
        const r = await (0, rebuildAllExtensions_1.rebuildAndReloadAll)({
            build: true,
            hostPackageName: PKG,
            onProgress: (p) => {
                pushProgress({
                    title: '一键编译并刷新',
                    current: p.current,
                    total: p.total,
                    label: p.label,
                    detail: p.detail,
                    lines: p.lines,
                    done: p.done,
                    ok: p.ok,
                });
            },
        });
        const body = r.lines.join('\n');
        if (!r.ok && !r.host) {
            await sleep(600);
            await closeProgress();
            const needNode = /Node\.js|npm|nodejs\.org/i.test(body);
            await dialogError(needNode
                ? `无法编译扩展（环境未就绪）\n\n${body}`
                : `全部扩展处理未完成\n\n${body}`);
            return r;
        }
        // 不弹完成框：点确定会拖慢恢复；结果打日志，宿主重载后自动重开面板
        console.log(`[battle-manager] rebuild/reload done ok=${r.ok}\n${body}`);
        if (r.host) {
            try {
                (0, rebuildAllExtensions_1.markNeedSceneRecover)();
                await sleep(280);
                await closeProgress();
                await (0, rebuildAllExtensions_1.reloadOne)(r.host);
            }
            catch (e) {
                await closeProgress();
                await dialogError(`宿主刷新失败:\n${e}\n请到扩展管理器手动刷新 battle-manager。`);
                return { ok: false, lines: r.lines };
            }
        }
        else {
            await closeProgress();
        }
        return r;
    },
    /** 仅刷新全部扩展（不编译） */
    async reloadAllExtensions() {
        console.log('[battle-manager] reload ALL extensions (no build)…');
        await captureHostRestoreBeforeReload();
        await openProgress('仅刷新全部扩展');
        const r = await (0, rebuildAllExtensions_1.rebuildAndReloadAll)({
            build: false,
            hostPackageName: PKG,
            onProgress: (p) => {
                pushProgress({
                    title: '仅刷新全部扩展',
                    current: p.current,
                    total: p.total,
                    label: p.label,
                    detail: p.detail,
                    lines: p.lines,
                    done: p.done,
                    ok: p.ok,
                });
            },
        });
        const body = r.lines.join('\n');
        if (!r.ok && !r.host) {
            await sleep(600);
            await closeProgress();
            await dialogError(`刷新未完成\n\n${body}`);
            return r;
        }
        console.log(`[battle-manager] reload done ok=${r.ok}\n${body}`);
        if (r.host) {
            try {
                (0, rebuildAllExtensions_1.markNeedSceneRecover)();
                await sleep(280);
                await closeProgress();
                await (0, rebuildAllExtensions_1.reloadOne)(r.host);
            }
            catch (e) {
                await closeProgress();
                await dialogError(`宿主刷新失败:\n${e}\n请到扩展管理器手动刷新 battle-manager。`);
                return { ok: false, lines: r.lines };
            }
        }
        else {
            await closeProgress();
        }
        return r;
    },
    /** 定位单位 Prefab 兜底 */
    async locateUnit(arg) {
        var _a, _b;
        const unitId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.unitId;
        if (!unitId) {
            await dialogWarn('请提供 unitId');
            return { ok: false };
        }
        try {
            const r = (await Editor.Message.request('unit-editor', 'locate-unit', { unitId }));
            if (r === null || r === void 0 ? void 0 : r.ok)
                return r;
        }
        catch {
            /* unit-editor 未注册 */
        }
        const root = ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path) || '';
        const indexPath = path.join(root, 'assets', 'resources', 'units', String(unitId), 'index.json');
        let dbUrl = `db://assets/resources/units/${unitId}`;
        if (fs.existsSync(indexPath)) {
            try {
                const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
                if (index.prefab) {
                    const rel = index.prefab.replace(/^\/+/, '').replace(/\.prefab$/, '');
                    dbUrl = `db://assets/resources/${rel}.prefab`;
                }
            }
            catch {
                /* use folder */
            }
        }
        try {
            const uuid = (await Editor.Message.request('asset-db', 'query-uuid', dbUrl));
            if (!uuid) {
                await dialogWarn(`资源不存在：${dbUrl}`);
                return { ok: false };
            }
            (_b = Editor.Selection) === null || _b === void 0 ? void 0 : _b.select('asset', uuid);
            return { ok: true, uuid, url: dbUrl };
        }
        catch (e) {
            await dialogError(`定位失败: ${e}`);
            return { ok: false };
        }
    },
};
function load() {
    setTimeout(() => {
        ensureModules().catch((e) => console.warn('[battle-manager] initial scan failed', e));
    }, 800);
    // 连刷后：按原模块重开 Game编辑器（Creator 按 panel id 恢复停靠位）
    const restore = (0, rebuildAllExtensions_1.consumeHostRestore)();
    if (restore === null || restore === void 0 ? void 0 : restore.open) {
        if (restore.moduleId)
            pendingModuleId = restore.moduleId;
        setTimeout(() => {
            void exports.methods
                .openHost({ moduleId: restore.moduleId || undefined })
                .catch((e) => console.warn('[battle-manager] restore host panel failed', e));
        }, 500);
    }
    // 仅在「连刷宿主」后补场景对齐；冷启动不再盲发 soft-reload（会触发 WebView not attached）
    if ((0, rebuildAllExtensions_1.consumeNeedSceneRecover)()) {
        setTimeout(() => {
            (0, rebuildAllExtensions_1.recoverSceneHierarchy)().catch((e) => console.warn('[battle-manager] post-load scene recover failed', e));
        }, 1500);
    }
    console.log('[battle-manager] extension loaded');
}
function unload() {
    cachedModules = [];
    // 保留 pendingModuleId 无意义（进程内会清）；恢复靠 temp 文件
    pendingModuleId = null;
    console.log('[battle-manager] extension unloaded');
}
//# sourceMappingURL=main.js.map