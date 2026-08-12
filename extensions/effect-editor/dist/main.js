'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.openEffect = openEffect;
exports.load = load;
exports.unload = unload;
const browseCategories_1 = require("./browseCategories");
const browseEffects_1 = require("./browseEffects");
const createEffect_1 = require("./createEffect");
const deleteEffect_1 = require("./deleteEffect");
const migrateEffects_1 = require("./migrateEffects");
const paths_1 = require("./paths");
const validateEffect_1 = require("./validateEffect");
const PKG = 'effect-editor';
async function dialogInfo(message) {
    try {
        await Editor.Dialog.info(message, { title: '特效管理器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.log(`[effect-editor] ${message}`);
    }
}
async function dialogWarn(message) {
    try {
        await Editor.Dialog.warn(message, { title: '特效管理器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.warn(`[effect-editor] ${message}`);
    }
}
async function dialogError(message) {
    try {
        await Editor.Dialog.error(message, { title: '特效管理器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.error(`[effect-editor] ${message}`);
    }
}
async function dialogConfirm(message, okLabel = '确定') {
    try {
        const result = (await Editor.Dialog.warn(message, {
            title: '特效管理器',
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
async function openInGameEditor(moduleId = 'effect') {
    try {
        await Editor.Message.request('battle-manager', 'select-module', { moduleId });
    }
    catch (e) {
        await dialogWarn(`无法打开 Game编辑器宿主（battle-manager）。请确认已启用 battle-manager。\n${e}`);
    }
}
async function openEffect(arg) {
    const effectId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.effectId;
    if (!effectId) {
        await dialogWarn('请提供 effectId');
        return { ok: false };
    }
    const item = (0, browseEffects_1.listLocalEffects)().find((e) => e.effectId === effectId);
    if (!item) {
        await dialogWarn(`特效 ${effectId} 不存在`);
        return { ok: false };
    }
    if (!item.prefab) {
        await dialogWarn(`特效 ${effectId} 未配置 prefab`);
        return { ok: false };
    }
    try {
        await Editor.Message.request('asset-db', 'open-asset', (0, paths_1.prefabDbUrl)(item.prefab));
        return { ok: true };
    }
    catch (e) {
        await dialogError(`打开 Prefab 失败: ${e}`);
        return { ok: false };
    }
}
exports.methods = {
    async openHost() {
        return openInGameEditor('effect');
    },
    async browseEffects() {
        return openInGameEditor('effect');
    },
    async battleModuleInfo() {
        return [
            {
                id: 'effect',
                packageName: PKG,
                title: '特效管理',
                order: 10,
                group: 'effect',
                groupTitle: '特效管理器',
                groupOrder: 12,
                itemIdKey: 'effectId',
                openArgKey: 'effectId',
                emptyHint: '暂无特效。请「创建」或「迁移现有特效」。',
                openLabel: '打开Prefab',
                hideExport: true,
                messages: {
                    list: 'list-effects',
                    open: 'open-effect',
                    exportOne: 'validate-effect',
                    exportBatch: 'validate-effects',
                    create: 'create-effect',
                    delete: 'delete-effect',
                    locate: 'locate-effect',
                    validateOne: 'validate-effect',
                },
                extraActions: [
                    {
                        id: 'migrate',
                        label: '迁移特效',
                        message: 'migrate-effects',
                    },
                ],
            },
            {
                id: 'effect-category',
                packageName: PKG,
                title: '特效类型管理',
                order: 20,
                group: 'effect',
                groupTitle: '特效管理器',
                groupOrder: 12,
                itemIdKey: 'categoryId',
                openArgKey: 'categoryId',
                emptyHint: '暂无类型（由特效 index.category 汇总）。',
                openLabel: '查看',
                hideCreate: true,
                hideExport: true,
                messages: {
                    list: 'list-effect-categories',
                    open: 'open-effect-category',
                    exportOne: 'validate-effects',
                    exportBatch: 'validate-effects',
                    create: 'create-effect',
                },
            },
        ];
    },
    async listEffects() {
        return (0, browseEffects_1.listLocalEffects)();
    },
    async listEffectCategories() {
        return (0, browseCategories_1.listLocalEffectCategories)();
    },
    async openEffect(arg) {
        return openEffect(arg);
    },
    async openEffectCategory(arg) {
        const categoryId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.categoryId;
        const cats = (0, browseCategories_1.listLocalEffectCategories)();
        const cat = cats.find((c) => c.categoryId === categoryId);
        if (!cat) {
            await dialogWarn('类型不存在');
            return { ok: false };
        }
        const effects = (0, browseEffects_1.listLocalEffects)().filter((e) => (e.category || 'uncategorized') === cat.name);
        const lines = effects.map((e) => `· ${e.effectId} ${e.name} (${e.poolName || e.prefab || '无'})`);
        await dialogInfo(`类型「${cat.name}」共 ${effects.length} 个特效\n${lines.join('\n') || '(空)'}`);
        return { ok: true, category: cat.name, effects };
    },
    async createEffect(arg) {
        const effectId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.effectId;
        if (!effectId || effectId <= 0) {
            Editor.Panel.open(`${PKG}.create`);
            return { ok: false, cancelled: true };
        }
        const poolName = typeof arg === 'object' && (arg === null || arg === void 0 ? void 0 : arg.poolName) ? arg.poolName : undefined;
        const result = await (0, createEffect_1.createEffectAssets)({ effectId, poolName });
        if (!result.ok) {
            await dialogError(result.error || '创建失败');
            return result;
        }
        try {
            await openInGameEditor('effect');
        }
        catch {
            /* ignore */
        }
        return result;
    },
    async createEffectApi(arg) {
        const effectId = arg === null || arg === void 0 ? void 0 : arg.effectId;
        if (!effectId || effectId <= 0) {
            return { ok: false, effectId: 0, error: '请手动指定 effectId' };
        }
        return (0, createEffect_1.createEffectAssets)({
            effectId,
            name: arg === null || arg === void 0 ? void 0 : arg.name,
            poolName: arg === null || arg === void 0 ? void 0 : arg.poolName,
            category: arg === null || arg === void 0 ? void 0 : arg.category,
            description: arg === null || arg === void 0 ? void 0 : arg.description,
            prefab: arg === null || arg === void 0 ? void 0 : arg.prefab,
        });
    },
    async deleteEffect(arg) {
        const effectId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.effectId;
        if (!effectId) {
            await dialogWarn('请提供 effectId');
            return { ok: false };
        }
        const item = (0, browseEffects_1.listLocalEffects)().find((e) => e.effectId === effectId);
        const label = item ? `${effectId} ${item.name}` : String(effectId);
        const confirmed = await dialogConfirm(`确定删除特效 ${label}？\n将删除 assets/resources/effects/${effectId}/（不可恢复）`, '删除');
        if (!confirmed)
            return { ok: false, cancelled: true };
        const result = await (0, deleteEffect_1.deleteEffectAssets)(effectId);
        if (!result.ok) {
            await dialogError(result.error || '删除失败');
            return result;
        }
        await dialogInfo(`已删除特效 ${effectId}`);
        return result;
    },
    async locateEffect(arg) {
        var _a;
        const effectId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.effectId;
        if (!effectId) {
            await dialogWarn('请提供 effectId');
            return { ok: false };
        }
        const item = (0, browseEffects_1.listLocalEffects)().find((e) => e.effectId === effectId);
        if (!item) {
            await dialogWarn(`特效 ${effectId} 不存在`);
            return { ok: false };
        }
        const dbUrl = item.prefab ? (0, paths_1.prefabDbUrl)(item.prefab) : (0, paths_1.effectFolderDbUrl)(effectId);
        try {
            const uuid = (await Editor.Message.request('asset-db', 'query-uuid', dbUrl));
            if (!uuid) {
                await dialogWarn(`资源不存在：${dbUrl}`);
                return { ok: false };
            }
            (_a = Editor.Selection) === null || _a === void 0 ? void 0 : _a.select('asset', uuid);
            try {
                await Editor.Message.request('assets', 'twinkle', uuid);
            }
            catch {
                /* ignore */
            }
            return { ok: true, uuid, url: dbUrl };
        }
        catch (e) {
            await dialogError(`定位失败: ${e}`);
            return { ok: false };
        }
    },
    async validateEffect(arg) {
        const effectId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.effectId;
        if (!effectId)
            return { ok: false };
        const r = (0, validateEffect_1.validateEffectOnDisk)(effectId);
        const msg = r.ok
            ? `校验通过\n${r.warnings.join('\n')}`
            : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
        if (r.ok)
            await dialogInfo(msg);
        else
            await dialogWarn(msg);
        return r;
    },
    async validateEffects() {
        const effects = (0, browseEffects_1.listLocalEffects)();
        if (effects.length === 0) {
            await dialogWarn('没有可校验的特效');
            return;
        }
        const lines = [];
        for (const e of effects) {
            const r = (0, validateEffect_1.validateEffectOnDisk)(e.effectId);
            lines.push(`[${r.ok ? 'OK' : 'FAIL'}] ${e.effectId} ${e.name}`);
            for (const err of r.errors)
                lines.push(`  - error: ${err}`);
            for (const w of r.warnings)
                lines.push(`  - warn: ${w}`);
        }
        await dialogInfo(lines.join('\n'));
    },
    async migrateEffects() {
        const confirmed = await dialogConfirm('将 Prefabs/SFX_* 与 Prefabs/VFX_* 迁移到 assets/resources/effects/{id}/Output/\n' +
            '并更新 res.json url（name / CreatNode 名不变）。\n\n共享美术 Art/SFX 不会移动。\n是否继续？', '迁移');
        if (!confirmed)
            return { ok: false, cancelled: true };
        const r = await (0, migrateEffects_1.migrateAllEffects)();
        await dialogInfo(`迁移完成：成功 ${r.ok}，跳过 ${r.skipped}，失败 ${r.fail}\n${r.lines.join('\n')}`);
        try {
            await openInGameEditor('effect');
        }
        catch {
            /* ignore */
        }
        return r;
    },
};
function load() {
    console.log('[effect-editor] loaded（特效管理器：特效 / 类型）');
}
function unload() {
    console.log('[effect-editor] unloaded');
}
//# sourceMappingURL=main.js.map