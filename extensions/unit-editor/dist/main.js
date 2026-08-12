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
exports.openUnit = openUnit;
exports.load = load;
exports.unload = unload;
const assetIo_1 = require("./assetIo");
const browseCategories_1 = require("./browseCategories");
const browseUnits_1 = require("./browseUnits");
const createUnit_1 = require("./createUnit");
const deleteUnit_1 = require("./deleteUnit");
const paths_1 = require("./paths");
const scanMounts_1 = require("./scanMounts");
const validateUnit_1 = require("./validateUnit");
const fs = __importStar(require("fs"));
async function dialogConfirm(message) {
    try {
        const result = (await Editor.Dialog.warn(message, {
            title: '单位管理器',
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
const PKG = 'unit-editor';
async function dialogInfo(message) {
    try {
        await Editor.Dialog.info(message, { title: '单位管理器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.log(`[unit-editor] ${message}`);
    }
}
async function dialogWarn(message) {
    try {
        await Editor.Dialog.warn(message, { title: '单位管理器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.warn(`[unit-editor] ${message}`);
    }
}
async function dialogError(message) {
    try {
        await Editor.Dialog.error(message, { title: '单位管理器', buttons: ['确定'], default: 0 });
    }
    catch {
        console.error(`[unit-editor] ${message}`);
    }
}
/** 打开共享 Game编辑器宿主并选中单位相关模块（与战斗管理器同窗同级） */
async function openInGameEditor(moduleId = 'unit') {
    try {
        await Editor.Message.request('battle-manager', 'select-module', { moduleId });
    }
    catch (e) {
        await dialogWarn(`无法打开 Game编辑器宿主（battle-manager）。请确认已启用 battle-manager。\n${e}`);
    }
}
async function applyCollisionVolumeInScene(unitId, item) {
    var _a, _b, _c, _d, _e;
    try {
        await new Promise((r) => setTimeout(r, 350));
        const sceneRes = (await Editor.Message.request('scene', 'execute-scene-script', {
            name: PKG,
            method: 'applyCollisionVolume',
            args: [
                {
                    unitId,
                    collisionRadius: (_a = item.collisionRadius) !== null && _a !== void 0 ? _a : paths_1.DEFAULT_COLLISION_RADIUS,
                    collisionHeight: (_b = item.collisionHeight) !== null && _b !== void 0 ? _b : paths_1.DEFAULT_COLLISION_HEIGHT,
                    collisionCenterY: (_c = item.collisionCenterY) !== null && _c !== void 0 ? _c : paths_1.DEFAULT_COLLISION_CENTER_Y,
                },
            ],
        }));
        if (sceneRes === null || sceneRes === void 0 ? void 0 : sceneRes.ok) {
            const v = sceneRes.volume;
            return `\n已挂载碰撞范围可视化（R=${((_d = v === null || v === void 0 ? void 0 : v.collisionRadius) !== null && _d !== void 0 ? _d : 0).toFixed(2)} H=${((_e = v === null || v === void 0 ? void 0 : v.collisionHeight) !== null && _e !== void 0 ? _e : 0).toFixed(2)}）`;
        }
        return `\n碰撞范围组件跳过: ${(sceneRes === null || sceneRes === void 0 ? void 0 : sceneRes.reason) || '请确认 Prefab 已打开'}`;
    }
    catch (e) {
        return `\n碰撞范围组件失败: ${e}`;
    }
}
async function openUnit(arg) {
    const unitId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.unitId;
    if (!unitId) {
        await dialogWarn('请提供 unitId');
        return { ok: false };
    }
    const items = (0, browseUnits_1.listLocalUnits)();
    const item = items.find((u) => u.unitId === unitId);
    if (!item) {
        await dialogWarn(`单位 ${unitId} 不存在`);
        return { ok: false };
    }
    if (!item.prefab) {
        await dialogWarn(`单位 ${unitId} 未配置 prefab，请编辑 ${(0, paths_1.indexDbUrl)(unitId)}`);
        return { ok: false };
    }
    try {
        await Editor.Message.request('asset-db', 'open-asset', (0, paths_1.prefabDbUrl)(item.prefab));
        const note = await applyCollisionVolumeInScene(unitId, item);
        if (note)
            console.log(`[unit-editor] open ${unitId}${note}`);
        return { ok: true };
    }
    catch (e) {
        await dialogError(`打开 Prefab 失败: ${e}`);
        return { ok: false };
    }
}
exports.methods = {
    async openHost() {
        return openInGameEditor('unit');
    },
    async browseUnits() {
        return openInGameEditor('unit');
    },
    async battleModuleInfo() {
        // 返回数组：单位管理器分组下的两个叶子（对齐 GameAsset UnitEntity / UnitCategory）
        return [
            {
                id: 'unit',
                packageName: PKG,
                title: '单位管理',
                order: 10,
                group: 'unit',
                groupTitle: '单位管理器',
                groupOrder: 10,
                itemIdKey: 'unitId',
                openArgKey: 'unitId',
                emptyHint: '暂无单位。请点「创建」。',
                exportLabel: '扫描挂点',
                openLabel: '打开Prefab',
                messages: {
                    list: 'list-units',
                    open: 'open-unit',
                    exportOne: 'scan-unit-mounts',
                    exportBatch: 'scan-unit-mounts-batch',
                    create: 'create-unit',
                    delete: 'delete-unit',
                    locate: 'locate-unit',
                },
                // 行内「显示操作」里会出现「保存碰撞」
                extraActions: [
                    {
                        id: 'save-collision',
                        label: '保存碰撞',
                        message: 'save-unit-collision',
                    },
                ],
            },
            {
                id: 'unit-category',
                packageName: PKG,
                title: '单位类型管理',
                order: 20,
                group: 'unit',
                groupTitle: '单位管理器',
                groupOrder: 10,
                itemIdKey: 'categoryId',
                openArgKey: 'categoryId',
                emptyHint: '暂无类型（由单位 index.category 汇总）。',
                openLabel: '查看',
                hideCreate: true,
                hideExport: true,
                messages: {
                    list: 'list-unit-categories',
                    open: 'open-unit-category',
                    exportOne: 'scan-unit-mounts-batch',
                    exportBatch: 'scan-unit-mounts-batch',
                    create: 'create-unit',
                },
            },
        ];
    },
    async listUnits() {
        return (0, browseUnits_1.listLocalUnits)();
    },
    async listUnitCategories() {
        return (0, browseCategories_1.listLocalUnitCategories)();
    },
    async openUnitCategory(arg) {
        const categoryId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.categoryId;
        const cats = (0, browseCategories_1.listLocalUnitCategories)();
        const cat = cats.find((c) => c.categoryId === categoryId);
        if (!cat) {
            await dialogWarn('类型不存在');
            return { ok: false };
        }
        const units = (0, browseUnits_1.listLocalUnits)().filter((u) => (u.category || 'uncategorized') === cat.name);
        const lines = units.map((u) => `· ${u.unitId} ${u.name} (${u.prefab || '无prefab'})`);
        await dialogInfo(`类型「${cat.name}」共 ${units.length} 个单位\n${lines.join('\n') || '(空)'}`);
        return { ok: true, category: cat.name, units };
    },
    async openUnit(arg) {
        return openUnit(arg);
    },
    async createUnit(arg) {
        const unitId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.unitId;
        if (!unitId || unitId <= 0) {
            // 菜单或未带编号时：弹出手动输入面板
            Editor.Panel.open(`${PKG}.create`);
            return { ok: false, cancelled: true };
        }
        const result = await (0, createUnit_1.createUnitAssets)({ unitId });
        if (!result.ok) {
            await dialogError(result.error || '创建失败');
            return result;
        }
        try {
            await openInGameEditor('unit');
        }
        catch {
            /* ignore */
        }
        return result;
    },
    async createUnitApi(arg) {
        const unitId = arg === null || arg === void 0 ? void 0 : arg.unitId;
        if (!unitId || unitId <= 0) {
            return { ok: false, unitId: unitId || 0, error: '请手动指定 unitId' };
        }
        return (0, createUnit_1.createUnitAssets)({
            unitId,
            name: arg === null || arg === void 0 ? void 0 : arg.name,
            prefab: (arg === null || arg === void 0 ? void 0 : arg.prefab) || '',
            category: arg === null || arg === void 0 ? void 0 : arg.category,
            description: arg === null || arg === void 0 ? void 0 : arg.description,
        });
    },
    async deleteUnit(arg) {
        const unitId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.unitId;
        if (!unitId) {
            await dialogWarn('请提供 unitId');
            return { ok: false };
        }
        const item = (0, browseUnits_1.listLocalUnits)().find((u) => u.unitId === unitId);
        const label = item ? `${unitId} ${item.name}` : String(unitId);
        const confirmed = await dialogConfirm(`确定删除单位 ${label}？\n将删除 assets/resources/units/${unitId}/（不可恢复）`);
        if (!confirmed)
            return { ok: false, cancelled: true };
        const result = await (0, deleteUnit_1.deleteUnitAssets)(unitId);
        if (!result.ok) {
            await dialogError(result.error || '删除失败');
            return result;
        }
        await dialogInfo(`已删除单位 ${unitId}`);
        return result;
    },
    /** 在资源管理器中选中 Prefab（不打开编辑） */
    async locateUnit(arg) {
        var _a;
        const unitId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.unitId;
        if (!unitId) {
            await dialogWarn('请提供 unitId');
            return { ok: false };
        }
        const item = (0, browseUnits_1.listLocalUnits)().find((u) => u.unitId === unitId);
        if (!item) {
            await dialogWarn(`单位 ${unitId} 不存在`);
            return { ok: false };
        }
        // 无 prefab 时定位到单位目录
        const dbUrl = item.prefab
            ? (0, paths_1.prefabDbUrl)(item.prefab)
            : `db://assets/resources/units/${unitId}`;
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
                /* 部分版本无 twinkle */
            }
            return { ok: true, uuid, url: dbUrl };
        }
        catch (e) {
            await dialogError(`定位失败: ${e}`);
            return { ok: false };
        }
    },
    async validateUnit(arg) {
        const unitId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.unitId;
        if (!unitId)
            return { ok: false };
        const r = (0, validateUnit_1.validateUnitOnDisk)(unitId);
        const msg = r.ok
            ? `校验通过\n已识别槽位: ${r.foundSlots.join(', ')}\n${r.warnings.join('\n')}`
            : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
        if (r.ok)
            await dialogInfo(msg);
        else
            await dialogWarn(msg);
        return r;
    },
    async validateUnitGraph() {
        const items = (0, browseUnits_1.listLocalUnits)();
        if (items.length === 0) {
            await dialogWarn('没有可校验的单位');
            return;
        }
        const lines = [];
        for (const s of items) {
            const r = (0, validateUnit_1.validateUnitOnDisk)(s.unitId);
            lines.push(`[${r.ok ? 'OK' : 'FAIL'}] ${s.unitId} ${s.name}`);
            for (const e of r.errors)
                lines.push(`  - error: ${e}`);
            for (const w of r.warnings)
                lines.push(`  - warn: ${w}`);
        }
        await dialogInfo(lines.join('\n'));
    },
    async scanUnitMounts(arg) {
        var _a;
        const unitId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.unitId;
        if (!unitId)
            return { ok: false, error: 'missing unitId' };
        const disk = (0, scanMounts_1.scanUnitMountsOnDisk)(unitId);
        if (!disk.ok) {
            await dialogError(`扫描失败 ${unitId}: ${disk.error}`);
            return disk;
        }
        const item = (0, browseUnits_1.listLocalUnits)().find((u) => u.unitId === unitId);
        let sceneNote = '';
        if (item === null || item === void 0 ? void 0 : item.prefab) {
            try {
                await Editor.Message.request('asset-db', 'open-asset', (0, paths_1.prefabDbUrl)(item.prefab));
                await new Promise((r) => setTimeout(r, 400));
                const sceneRes = (await Editor.Message.request('scene', 'execute-scene-script', {
                    name: PKG,
                    method: 'applyDecorator',
                    args: [],
                }));
                if (sceneRes === null || sceneRes === void 0 ? void 0 : sceneRes.ok) {
                    sceneNote = `\n场景已写入 Decorator（映射 ${(_a = sceneRes.mapped) !== null && _a !== void 0 ? _a : 0} 条）`;
                }
                else {
                    sceneNote = `\n场景写 Decorator 跳过: ${(sceneRes === null || sceneRes === void 0 ? void 0 : sceneRes.reason) || '请在 Prefab 编辑模式手动挂 EntityAttachmentSlotDecorator'}`;
                }
                sceneNote += await applyCollisionVolumeInScene(unitId, item);
            }
            catch (e) {
                sceneNote = `\n场景写 Decorator 失败（可稍后手动挂组件）: ${e}`;
            }
            try {
                await Editor.Message.request('asset-db', 'refresh-asset', (0, paths_1.prefabDbUrl)(item.prefab));
            }
            catch {
                /* ignore */
            }
        }
        await dialogInfo(`单位 ${unitId} 挂点扫描完成\n新增节点: ${disk.added.join(', ') || '(无)'}\n映射: ${JSON.stringify(disk.mounts)}${sceneNote}`);
        return disk;
    },
    /**
     * 将 Prefab 上 UnitCollisionVolume 的 Inspector 数值写回 index.json。
     * 用法：打开 Prefab → 调半径/高度 → 调用本消息保存。
     */
    async saveUnitCollision(arg) {
        let sceneRes = null;
        try {
            sceneRes = (await Editor.Message.request('scene', 'execute-scene-script', {
                name: PKG,
                method: 'readCollisionVolume',
                args: [],
            }));
        }
        catch (e) {
            await dialogError(`读取碰撞范围失败: ${e}\n请先打开单位 Prefab。`);
            return { ok: false };
        }
        const volume = (sceneRes === null || sceneRes === void 0 ? void 0 : sceneRes.ok) ? sceneRes.volume : null;
        if (!volume) {
            await dialogWarn(`未找到 UnitCollisionVolume。请先「打开Prefab」或「扫描挂点」。\n${(sceneRes === null || sceneRes === void 0 ? void 0 : sceneRes.reason) || ''}`);
            return { ok: false, reason: sceneRes === null || sceneRes === void 0 ? void 0 : sceneRes.reason };
        }
        let unitId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.unitId;
        if (!unitId || unitId <= 0) {
            unitId = (volume.unitId | 0) || 0;
        }
        if (!unitId) {
            await dialogWarn('无法确定 unitId：请在组件上填写 unitId，或从单位管理打开 Prefab 后再保存。');
            return { ok: false };
        }
        const item = (0, browseUnits_1.listLocalUnits)().find((u) => u.unitId === unitId);
        if (!item) {
            await dialogWarn(`单位 ${unitId} 不存在`);
            return { ok: false };
        }
        const indexPath = (0, paths_1.indexFsPath)(unitId);
        // 勿把列表 UI 字段（hasPrefab / subtitle）写回 index.json
        const { hasPrefab: _hp, subtitle: _st, ...itemIndex } = item;
        let index = { ...itemIndex };
        if (fs.existsSync(indexPath)) {
            try {
                const disk = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
                index = { ...index, ...disk };
            }
            catch {
                /* keep item */
            }
        }
        index.unitId = unitId;
        index.collisionRadius = Math.max(0.05, Number(volume.collisionRadius) || paths_1.DEFAULT_COLLISION_RADIUS);
        index.collisionHeight = Math.max(0.1, Number(volume.collisionHeight) || paths_1.DEFAULT_COLLISION_HEIGHT);
        index.collisionCenterY = Number.isFinite(Number(volume.collisionCenterY))
            ? Number(volume.collisionCenterY)
            : paths_1.DEFAULT_COLLISION_CENTER_Y;
        const payload = {
            unitId: index.unitId,
            name: index.name,
            category: index.category,
            prefab: index.prefab,
            description: index.description,
            requiredSlots: index.requiredSlots,
            collisionRadius: index.collisionRadius,
            collisionHeight: index.collisionHeight,
            collisionCenterY: index.collisionCenterY,
        };
        const ok = await (0, assetIo_1.writeTextAsset)((0, paths_1.indexDbUrl)(unitId), JSON.stringify(payload, null, 2));
        if (!ok) {
            await dialogError('写入 index.json 失败');
            return { ok: false };
        }
        await dialogInfo(`已保存单位 ${unitId} 碰撞范围到 index.json\n` +
            `R=${index.collisionRadius.toFixed(2)} H=${index.collisionHeight.toFixed(2)} ` +
            `Y=${index.collisionCenterY.toFixed(2)}`);
        return { ok: true, index: payload };
    },
    async scanUnitMountsBatch() {
        const items = (0, browseUnits_1.listLocalUnits)();
        if (items.length === 0) {
            await dialogWarn('没有可扫描的单位');
            return;
        }
        const lines = [];
        for (const s of items) {
            if (!s.prefab) {
                lines.push(`[SKIP] ${s.unitId} 无 prefab`);
                continue;
            }
            const r = (0, scanMounts_1.scanUnitMountsOnDisk)(s.unitId);
            lines.push(`[${r.ok ? 'OK' : 'FAIL'}] ${s.unitId} ${s.name} added=${(r.added || []).join('|') || '-'}`);
            if (r.error)
                lines.push(`  - ${r.error}`);
        }
        await dialogInfo(lines.join('\n'));
    },
};
function load() {
    console.log('[unit-editor] loaded（接入 Game编辑器宿主，与战斗管理器同级分组）');
}
function unload() {
    console.log('[unit-editor] unloaded');
}
//# sourceMappingURL=main.js.map