'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.openScene = openScene;
exports.load = load;
exports.unload = unload;
const browsePlantables_1 = require("./browsePlantables");
const browseCategories_1 = require("./browseCategories");
const browseLogicScenes_1 = require("./browseLogicScenes");
const browseScenes_1 = require("./browseScenes");
const blockPlantIO_1 = require("./blockPlantIO");
const blockPlantUtil_1 = require("./blockPlantUtil");
const createLogicScene_1 = require("./createLogicScene");
const createScene_1 = require("./createScene");
const deleteScene_1 = require("./deleteScene");
const logicSpawnIO_1 = require("./logicSpawnIO");
const migrateChapters_1 = require("./migrateChapters");
const monsterSpawnUtil_1 = require("./monsterSpawnUtil");
const paths_1 = require("./paths");
const spawnConfigIO_1 = require("./spawnConfigIO");
const syncSpawnFromPrefab_1 = require("./syncSpawnFromPrefab");
const validateScene_1 = require("./validateScene");
const PKG = 'scene-editor';
/** 种植编辑器当前上下文 */
let _spawnEditorLogicId = 0;
/** 阻挡种植编辑器当前资源场景 */
let _blockPlantSceneId = 0;
async function dialogInfo(message) {
    try {
        await Editor.Dialog.info(message, { title: '场景管理', buttons: ['确定'], default: 0 });
    }
    catch {
        console.log(`[scene-editor] ${message}`);
    }
}
async function dialogWarn(message) {
    try {
        await Editor.Dialog.warn(message, { title: '场景管理', buttons: ['确定'], default: 0 });
    }
    catch {
        console.warn(`[scene-editor] ${message}`);
    }
}
async function dialogError(message) {
    try {
        await Editor.Dialog.error(message, { title: '场景管理', buttons: ['确定'], default: 0 });
    }
    catch {
        console.error(`[scene-editor] ${message}`);
    }
}
async function dialogConfirm(message, okLabel = '确定') {
    try {
        const result = (await Editor.Dialog.warn(message, {
            title: '场景管理',
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
async function openInGameEditor(moduleId = 'resource-scene') {
    try {
        await Editor.Message.request('battle-manager', 'select-module', { moduleId });
    }
    catch (e) {
        await dialogWarn(`无法打开 Game编辑器宿主（battle-manager）。请确认已启用 battle-manager。\n${e}`);
    }
}
async function openScene(arg) {
    const sceneId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.sceneId;
    if (!sceneId) {
        await dialogWarn('请提供 sceneId');
        return { ok: false };
    }
    const item = (0, browseScenes_1.listLocalScenes)().find((s) => s.sceneId === sceneId);
    if (!item) {
        await dialogWarn(`场景 ${sceneId} 不存在`);
        return { ok: false };
    }
    if (!item.prefab) {
        await dialogWarn(`场景 ${sceneId} 未配置 prefab`);
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
async function openSpawnEditor(logicId) {
    const logic = (0, browseLogicScenes_1.listLocalLogicScenes)().find((l) => l.logicId === logicId);
    if (!logic) {
        await dialogWarn(`逻辑场景 ${logicId} 不存在`);
        return { ok: false, error: '逻辑场景不存在' };
    }
    _spawnEditorLogicId = logicId;
    // 先打开资源 Prefab，便于场景里看到种植预览
    try {
        await openScene(logic.assetsSceneId);
    }
    catch {
        /* ignore */
    }
    try {
        Editor.Panel.open(`${PKG}.spawn-editor`);
        return { ok: true };
    }
    catch (e) {
        await dialogError(`打开种植编辑器失败: ${e}`);
        return { ok: false, error: String(e) };
    }
}
async function openBlockPlantEditor(sceneId) {
    const item = (0, browseScenes_1.listLocalScenes)().find((s) => s.sceneId === sceneId);
    if (!item) {
        await dialogWarn(`资源场景 ${sceneId} 不存在`);
        return { ok: false, error: '资源场景不存在' };
    }
    _blockPlantSceneId = sceneId;
    try {
        await openScene(sceneId);
    }
    catch {
        /* ignore */
    }
    try {
        Editor.Panel.open(`${PKG}.block-plant-editor`);
        return { ok: true };
    }
    catch (e) {
        await dialogError(`打开阻挡种植编辑器失败: ${e}`);
        return { ok: false, error: String(e) };
    }
}
async function previewBlocksInScene(arg) {
    var _a, _b, _c, _d;
    const sceneId = (arg === null || arg === void 0 ? void 0 : arg.sceneId) || _blockPlantSceneId;
    if ((arg === null || arg === void 0 ? void 0 : arg.openPrefab) !== false && sceneId) {
        await openScene(sceneId);
        await new Promise((r) => setTimeout(r, 350));
    }
    try {
        const res = (await Editor.Message.request('scene', 'execute-scene-script', {
            name: PKG,
            method: 'previewBlockPlant',
            args: [
                {
                    cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [],
                    cellSize: (_a = arg === null || arg === void 0 ? void 0 : arg.cellSize) !== null && _a !== void 0 ? _a : 1,
                    originX: (_b = arg === null || arg === void 0 ? void 0 : arg.originX) !== null && _b !== void 0 ? _b : 0,
                    originZ: (_c = arg === null || arg === void 0 ? void 0 : arg.originZ) !== null && _c !== void 0 ? _c : 0,
                    brushRadius: (_d = arg === null || arg === void 0 ? void 0 : arg.brushRadius) !== null && _d !== void 0 ? _d : 1,
                    // 仅预览已有阻挡时不挂笔刷光标；开笔刷工具时再挂
                    showBrush: (arg === null || arg === void 0 ? void 0 : arg.showBrush) === true,
                },
            ],
        }));
        if (!res)
            return { ok: false, reason: 'scene script 无返回' };
        return { ok: !!res.ok, reason: res.reason, count: res.count };
    }
    catch (e) {
        return { ok: false, reason: String(e) };
    }
}
async function syncBlockCellsInScene(arg) {
    var _a, _b, _c, _d;
    try {
        const res = (await Editor.Message.request('scene', 'execute-scene-script', {
            name: PKG,
            method: 'syncBlockPlantCells',
            args: [
                {
                    cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [],
                    cellSize: (_a = arg === null || arg === void 0 ? void 0 : arg.cellSize) !== null && _a !== void 0 ? _a : 1,
                    originX: (_b = arg === null || arg === void 0 ? void 0 : arg.originX) !== null && _b !== void 0 ? _b : 0,
                    originZ: (_c = arg === null || arg === void 0 ? void 0 : arg.originZ) !== null && _c !== void 0 ? _c : 0,
                    brushRadius: (_d = arg === null || arg === void 0 ? void 0 : arg.brushRadius) !== null && _d !== void 0 ? _d : 1,
                },
            ],
        }));
        if (!res)
            return { ok: false, reason: 'scene script 无返回' };
        return { ok: !!res.ok, reason: res.reason, count: res.count };
    }
    catch (e) {
        return { ok: false, reason: String(e) };
    }
}
async function applyBlockBrushAtWorld(arg) {
    var _a, _b;
    try {
        const cellSize = (arg === null || arg === void 0 ? void 0 : arg.cellSize) && arg.cellSize > 0 ? arg.cellSize : 1;
        const originX = Number(arg === null || arg === void 0 ? void 0 : arg.originX) || 0;
        const originZ = Number(arg === null || arg === void 0 ? void 0 : arg.originZ) || 0;
        const x = Number(arg === null || arg === void 0 ? void 0 : arg.x);
        const z = Number(arg === null || arg === void 0 ? void 0 : arg.z);
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
            return { ok: false, reason: '无效坐标', cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [] };
        }
        await Editor.Message.request('scene', 'execute-scene-script', {
            name: PKG,
            method: 'moveBlockBrushTo',
            args: [
                {
                    x,
                    z,
                    cellSize,
                    brushRadius: (_a = arg === null || arg === void 0 ? void 0 : arg.brushRadius) !== null && _a !== void 0 ? _a : 1,
                    originX,
                    originZ,
                    snapCell: true,
                },
            ],
        });
        const set = new Set((arg === null || arg === void 0 ? void 0 : arg.cells) || []);
        const c = (0, blockPlantUtil_1.worldToCell)(x, z, cellSize, originX, originZ);
        (0, blockPlantUtil_1.stampBrushCells)(set, c.cx, c.cz, (_b = arg === null || arg === void 0 ? void 0 : arg.brushRadius) !== null && _b !== void 0 ? _b : 1, !!(arg === null || arg === void 0 ? void 0 : arg.erase));
        return { ok: true, cells: [...set], x, z, cx: c.cx, cz: c.cz };
    }
    catch (e) {
        return { ok: false, reason: String(e), cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [] };
    }
}
async function applyBlockBrushAtAim(arg) {
    try {
        const hit = (await Editor.Message.request('scene', 'execute-scene-script', {
            name: PKG,
            method: 'pickGroundFromCamera',
            args: [{ groundY: 0 }],
        }));
        if (!(hit === null || hit === void 0 ? void 0 : hit.ok)) {
            return { ok: false, reason: (hit === null || hit === void 0 ? void 0 : hit.reason) || '镜头未对准地面', cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [] };
        }
        return applyBlockBrushAtWorld({ ...arg, x: hit.x, z: hit.z });
    }
    catch (e) {
        return { ok: false, reason: String(e), cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [] };
    }
}
async function applyBlockBrushAtSelection(arg) {
    var _a, _b;
    try {
        const selected = ((_b = (_a = Editor.Selection) === null || _a === void 0 ? void 0 : _a.getSelected) === null || _b === void 0 ? void 0 : _b.call(_a, 'node')) || [];
        const uuid = selected[0];
        if (!uuid) {
            return { ok: false, reason: '请先在 Hierarchy 选中一个节点', cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [] };
        }
        const hit = (await Editor.Message.request('scene', 'execute-scene-script', {
            name: PKG,
            method: 'queryNodeWorldPos',
            args: [{ uuid }],
        }));
        if (!(hit === null || hit === void 0 ? void 0 : hit.ok)) {
            return { ok: false, reason: (hit === null || hit === void 0 ? void 0 : hit.reason) || '未选中节点', cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [] };
        }
        return applyBlockBrushAtWorld({ ...arg, x: hit.x, z: hit.z });
    }
    catch (e) {
        return { ok: false, reason: String(e), cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [] };
    }
}
async function nudgeBlockBrush(arg) {
    var _a, _b;
    try {
        const cellSize = (arg === null || arg === void 0 ? void 0 : arg.cellSize) && arg.cellSize > 0 ? arg.cellSize : 1;
        const originX = Number(arg === null || arg === void 0 ? void 0 : arg.originX) || 0;
        const originZ = Number(arg === null || arg === void 0 ? void 0 : arg.originZ) || 0;
        const cursor = (await Editor.Message.request('scene', 'execute-scene-script', {
            name: PKG,
            method: 'queryBlockBrushCursor',
            args: [],
        }));
        if (!(cursor === null || cursor === void 0 ? void 0 : cursor.ok)) {
            return { ok: false, reason: (cursor === null || cursor === void 0 ? void 0 : cursor.reason) || '无笔刷', cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [] };
        }
        const dx = Math.round(Number(arg === null || arg === void 0 ? void 0 : arg.dx) || 0);
        const dz = Math.round(Number(arg === null || arg === void 0 ? void 0 : arg.dz) || 0);
        const x = (cursor.x || 0) + dx * cellSize;
        const z = (cursor.z || 0) + dz * cellSize;
        if (arg === null || arg === void 0 ? void 0 : arg.paint) {
            return applyBlockBrushAtWorld({
                cells: arg === null || arg === void 0 ? void 0 : arg.cells,
                cellSize,
                originX,
                originZ,
                brushRadius: (_a = arg === null || arg === void 0 ? void 0 : arg.brushRadius) !== null && _a !== void 0 ? _a : 1,
                erase: !!(arg === null || arg === void 0 ? void 0 : arg.erase),
                x,
                z,
            });
        }
        await Editor.Message.request('scene', 'execute-scene-script', {
            name: PKG,
            method: 'moveBlockBrushTo',
            args: [
                {
                    x,
                    z,
                    cellSize,
                    brushRadius: (_b = arg === null || arg === void 0 ? void 0 : arg.brushRadius) !== null && _b !== void 0 ? _b : 1,
                    originX,
                    originZ,
                    snapCell: true,
                },
            ],
        });
        return { ok: true, cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [], x, z };
    }
    catch (e) {
        return { ok: false, reason: String(e), cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [] };
    }
}
async function resolvePreviewPrefabUuid(modelId, prefabRel) {
    try {
        const uuid = (await Editor.Message.request('asset-db', 'query-uuid', (0, paths_1.prefabDbUrl)(prefabRel)));
        return uuid || null;
    }
    catch {
        console.warn('[scene-editor] preview prefab uuid missing', modelId, prefabRel);
        return null;
    }
}
/** 为场景预览补上 avatar.model → unit prefab uuid */
async function enrichLayersForPreview(layers) {
    const catalog = (0, browsePlantables_1.listPlantableAvatars)();
    const uuidCache = new Map();
    const enriched = [];
    for (const layer of layers || []) {
        const items = [];
        for (const raw of layer.items || []) {
            const item = { ...raw };
            const hit = (0, browsePlantables_1.resolvePlantableFromItem)(item) ||
                (item.avatarId
                    ? (() => {
                        const avatar = catalog.find((a) => a.avatarId === item.avatarId);
                        return (avatar === null || avatar === void 0 ? void 0 : avatar.configs[0]) ? { avatar, config: avatar.configs[0] } : null;
                    })()
                    : null);
            if (hit) {
                item.previewModelId = hit.avatar.model;
                if (!uuidCache.has(hit.avatar.model)) {
                    uuidCache.set(hit.avatar.model, await resolvePreviewPrefabUuid(hit.avatar.model, hit.avatar.prefab));
                }
                const uuid = uuidCache.get(hit.avatar.model);
                if (uuid)
                    item.previewPrefabUuid = uuid;
            }
            items.push(item);
        }
        enriched.push({ ...layer, items });
    }
    return enriched;
}
async function previewSpawnInScene(arg) {
    var _a, _b;
    const assetsSceneId = arg === null || arg === void 0 ? void 0 : arg.assetsSceneId;
    if ((arg === null || arg === void 0 ? void 0 : arg.openPrefab) !== false && assetsSceneId) {
        await openScene(assetsSceneId);
        // Prefab 打开需要一点时间再挂预览节点
        await new Promise((r) => setTimeout(r, 350));
    }
    try {
        const layers = await enrichLayersForPreview((_a = arg === null || arg === void 0 ? void 0 : arg.layers) !== null && _a !== void 0 ? _a : []);
        const res = (await Editor.Message.request('scene', 'execute-scene-script', {
            name: PKG,
            method: 'previewMonsterSpawn',
            args: [
                {
                    layers,
                    layerIndex: (_b = arg === null || arg === void 0 ? void 0 : arg.layerIndex) !== null && _b !== void 0 ? _b : 0,
                    showAllLayers: !!(arg === null || arg === void 0 ? void 0 : arg.showAllLayers),
                },
            ],
        }));
        if (!res)
            return { ok: false, reason: 'scene script 无返回' };
        return { ok: !!res.ok, reason: res.reason, count: res.count };
    }
    catch (e) {
        return { ok: false, reason: String(e) };
    }
}
exports.methods = {
    async openHost() {
        return openInGameEditor('logic-scene');
    },
    async browseScenes() {
        return openInGameEditor('resource-scene');
    },
    async battleModuleInfo() {
        return [
            {
                id: 'resource-scene',
                packageName: PKG,
                title: '资源场景',
                order: 10,
                group: 'scene',
                groupTitle: '场景管理',
                groupOrder: 15,
                itemIdKey: 'sceneId',
                openArgKey: 'sceneId',
                emptyHint: '暂无资源场景。请「创建」或「迁移现有关卡」。',
                openLabel: '打开Prefab',
                hideExport: true,
                messages: {
                    list: 'list-scenes',
                    open: 'open-scene',
                    exportOne: 'sync-spawn',
                    exportBatch: 'sync-spawn-batch',
                    create: 'create-scene',
                    delete: 'delete-scene',
                    locate: 'locate-scene',
                    validateOne: 'validate-scene',
                },
                extraActions: [
                    {
                        id: 'migrate',
                        label: '迁移关卡',
                        message: 'migrate-chapters',
                    },
                    {
                        id: 'sync-default-logic',
                        label: '同步到默认逻辑',
                        message: 'sync-spawn',
                    },
                ],
            },
            {
                id: 'block-plant',
                packageName: PKG,
                title: '阻挡种植',
                order: 15,
                group: 'scene',
                groupTitle: '场景管理',
                groupOrder: 15,
                itemIdKey: 'sceneId',
                openArgKey: 'sceneId',
                emptyHint: '暂无资源场景。请先在「资源场景」创建，再编辑阻挡。',
                openLabel: '编辑阻挡',
                hideCreate: true,
                hideExport: true,
                messages: {
                    list: 'list-scenes',
                    open: 'open-block-plant',
                    exportOne: 'sync-spawn',
                    exportBatch: 'sync-spawn-batch',
                    create: 'create-scene',
                    locate: 'locate-scene',
                    validateOne: 'validate-scene',
                },
                extraActions: [
                    {
                        id: 'open-prefab',
                        label: '打开Prefab',
                        message: 'open-scene',
                    },
                ],
            },
            {
                id: 'logic-scene',
                packageName: PKG,
                title: '逻辑场景',
                order: 20,
                group: 'scene',
                groupTitle: '场景管理',
                groupOrder: 15,
                itemIdKey: 'logicId',
                openArgKey: 'logicId',
                emptyHint: '暂无逻辑场景。请点「创建」并绑定资源场景，再「编辑种植」。',
                openLabel: '编辑种植',
                hideExport: true,
                messages: {
                    list: 'list-logic-scenes',
                    open: 'open-logic-scene',
                    exportOne: 'sync-spawn',
                    exportBatch: 'sync-spawn-batch',
                    create: 'create-logic-scene',
                    validateOne: 'validate-logic-scene',
                    locate: 'locate-logic-scene',
                },
                extraActions: [
                    {
                        id: 'open-resource-prefab',
                        label: '打开资源Prefab',
                        message: 'open-logic-resource-prefab',
                    },
                    {
                        id: 'import-from-prefab',
                        label: '从Prefab导入',
                        message: 'sync-spawn',
                    },
                ],
            },
            {
                id: 'scene-category',
                packageName: PKG,
                title: '类型配置',
                order: 30,
                group: 'scene',
                groupTitle: '场景管理',
                groupOrder: 15,
                itemIdKey: 'categoryId',
                openArgKey: 'categoryId',
                emptyHint: '暂无类型（由资源场景 index.category 汇总）。',
                openLabel: '查看',
                hideCreate: true,
                hideExport: true,
                messages: {
                    list: 'list-scene-categories',
                    open: 'open-scene-category',
                    exportOne: 'sync-spawn-batch',
                    exportBatch: 'sync-spawn-batch',
                    create: 'create-scene',
                },
            },
        ];
    },
    async listScenes() {
        return (0, browseScenes_1.listLocalScenes)();
    },
    async listLogicScenes() {
        return (0, browseLogicScenes_1.listLocalLogicScenes)();
    },
    async listSceneCategories() {
        return (0, browseCategories_1.listLocalSceneCategories)();
    },
    async openScene(arg) {
        return openScene(arg);
    },
    /** 逻辑场景主操作：打开种植编辑器 */
    async openLogicScene(arg) {
        const logicId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.logicId;
        if (!logicId) {
            await dialogWarn('请提供 logicId');
            return { ok: false };
        }
        return openSpawnEditor(logicId);
    },
    async openLogicResourcePrefab(arg) {
        const logicId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.logicId;
        if (!logicId) {
            await dialogWarn('请提供 logicId');
            return { ok: false };
        }
        const logic = (0, browseLogicScenes_1.listLocalLogicScenes)().find((l) => l.logicId === logicId);
        if (!logic) {
            await dialogWarn(`逻辑场景 ${logicId} 不存在`);
            return { ok: false };
        }
        return openScene(logic.assetsSceneId);
    },
    async openSceneCategory(arg) {
        const categoryId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.categoryId;
        const cats = (0, browseCategories_1.listLocalSceneCategories)();
        const cat = cats.find((c) => c.categoryId === categoryId);
        if (!cat) {
            await dialogWarn('类型不存在');
            return { ok: false };
        }
        const scenes = (0, browseScenes_1.listLocalScenes)().filter((s) => (s.category || 'uncategorized') === cat.name);
        const lines = scenes.map((s) => `· ${s.sceneId} ${s.name} (${s.poolName || s.prefab || '无'})`);
        await dialogInfo(`类型「${cat.name}」共 ${scenes.length} 个场景\n${lines.join('\n') || '(空)'}`);
        return { ok: true, category: cat.name, scenes };
    },
    async createScene(arg) {
        const sceneId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.sceneId;
        if (!sceneId || sceneId <= 0) {
            Editor.Panel.open(`${PKG}.create-scene`);
            return { ok: false, cancelled: true };
        }
        const result = await (0, createScene_1.createSceneAssets)({ sceneId, createLogic: false });
        if (!result.ok) {
            await dialogError(result.error || '创建失败');
            return result;
        }
        try {
            await openInGameEditor('resource-scene');
        }
        catch {
            /* ignore */
        }
        return result;
    },
    async createSceneApi(arg) {
        const sceneId = arg === null || arg === void 0 ? void 0 : arg.sceneId;
        if (!sceneId || sceneId <= 0) {
            return { ok: false, sceneId: 0, error: '请手动指定 sceneId' };
        }
        return (0, createScene_1.createSceneAssets)({
            sceneId,
            name: arg === null || arg === void 0 ? void 0 : arg.name,
            poolName: arg === null || arg === void 0 ? void 0 : arg.poolName,
            category: arg === null || arg === void 0 ? void 0 : arg.category,
            description: arg === null || arg === void 0 ? void 0 : arg.description,
            prefab: arg === null || arg === void 0 ? void 0 : arg.prefab,
            createLogic: false,
        });
    },
    /** 打开创建逻辑场景面板（选资源场景 + logicId） */
    async createLogicScene() {
        const scenes = (0, browseScenes_1.listLocalScenes)();
        if (scenes.length === 0) {
            await dialogWarn('请先创建资源场景');
            return { ok: false };
        }
        try {
            Editor.Panel.open(`${PKG}.create-logic`);
            return { ok: true };
        }
        catch (e) {
            await dialogError(`打开创建面板失败: ${e}`);
            return { ok: false };
        }
    },
    async createLogicSceneApi(arg) {
        if (!(arg === null || arg === void 0 ? void 0 : arg.assetsSceneId))
            return { ok: false, logicId: 0, error: '需要 assetsSceneId' };
        const logicId = arg.logicId;
        if (!logicId || logicId <= 0) {
            return { ok: false, logicId: 0, error: '请手动指定 logicId' };
        }
        return (0, createLogicScene_1.createLogicSceneAssets)({
            logicId,
            assetsSceneId: arg.assetsSceneId,
            name: arg.name,
            category: arg.category,
        });
    },
    async suggestLogicId(arg) {
        const assetsSceneId = arg === null || arg === void 0 ? void 0 : arg.assetsSceneId;
        if (!assetsSceneId)
            return { logicId: 0 };
        return { logicId: (0, createLogicScene_1.nextLogicId)(assetsSceneId) };
    },
    async querySpawnEditorContext() {
        var _a;
        const logicId = _spawnEditorLogicId;
        if (!logicId)
            return { error: '未指定逻辑场景' };
        const pair = (0, logicSpawnIO_1.resolveLogicPair)(logicId);
        if (!pair)
            return { error: `逻辑场景 ${logicId} 不存在或 index 损坏` };
        const monsterSpawn = (0, monsterSpawnUtil_1.ensureMonsterSpawn)(pair.index, pair.logicId, pair.assetsSceneId);
        // 节奏只读：来自 Luban 表 tbspawnconfig（Excel 导出），编辑器不写回
        const layerIds = ((_a = monsterSpawn.layers) !== null && _a !== void 0 ? _a : []).map((l) => l.layerId);
        const tableRows = (0, spawnConfigIO_1.listSpawnConfigsForLogic)(pair.logicId);
        const byLayer = new Map(tableRows.map((r) => [r.layer_id, r]));
        const layerConfigs = layerIds
            .map((id) => byLayer.get(id))
            .filter((r) => !!r)
            .map((r) => ({ ...r }));
        const missingLayerIds = layerIds.filter((id) => !byLayer.has(id));
        return {
            logicId: pair.logicId,
            assetsSceneId: pair.assetsSceneId,
            name: pair.index.name || '',
            monsterSpawn,
            layerConfigs,
            missingLayerIds,
        };
    },
    async saveLogicSpawn(arg) {
        if (!(arg === null || arg === void 0 ? void 0 : arg.logicId) || !(arg === null || arg === void 0 ? void 0 : arg.assetsSceneId)) {
            return { ok: false, error: '需要 logicId 与 assetsSceneId' };
        }
        // 只保存种植；节奏以 Excel→Luban→tbspawnconfig 为准，避免编辑器与表双写不同步
        return (0, logicSpawnIO_1.saveLogicMonsterSpawn)(arg.assetsSceneId, arg.logicId, arg.monsterSpawn);
    },
    async previewSpawnInScene(arg) {
        return previewSpawnInScene(arg || {});
    },
    /** 读取场景中种植预览 Area/Point 的当前位置（拖拽回写用） */
    async querySpawnPreviewTransforms() {
        try {
            const res = (await Editor.Message.request('scene', 'execute-scene-script', {
                name: PKG,
                method: 'querySpawnPreviewTransforms',
                args: [],
            }));
            if (!res)
                return { ok: false, reason: 'scene script 无返回', items: [] };
            return { ok: !!res.ok, reason: res.reason, items: res.items || [] };
        }
        catch (e) {
            return { ok: false, reason: String(e), items: [] };
        }
    },
    /** 种植选择器：TbAvatar 模型 + 绑定的 monster/hero 配置 */
    async listPlantables() {
        return (0, browsePlantables_1.listPlantableAvatars)();
    },
    async defaultPlantable() {
        return (0, browsePlantables_1.defaultPlantable)();
    },
    /** 资源场景主操作旁路：打开阻挡种植编辑器 */
    async openBlockPlant(arg) {
        const sceneId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.sceneId;
        if (!sceneId) {
            await dialogWarn('请提供 sceneId');
            return { ok: false };
        }
        return openBlockPlantEditor(sceneId);
    },
    async queryBlockPlantContext() {
        var _a, _b, _c;
        const sceneId = _blockPlantSceneId;
        if (!sceneId)
            return { error: '未指定资源场景' };
        const index = (0, blockPlantIO_1.loadResourceSceneIndex)(sceneId);
        if (!index)
            return { error: `资源场景 ${sceneId} 不存在或 index 损坏` };
        const work = (0, blockPlantIO_1.blockPlantToCells)(index.blockPlant);
        return {
            sceneId,
            name: index.name || '',
            cellSize: work.cellSize,
            originX: work.originX,
            originZ: work.originZ,
            cells: [...work.cells],
            aabbCount: (_c = (_b = (_a = index.blockPlant) === null || _a === void 0 ? void 0 : _a.aabbs) === null || _b === void 0 ? void 0 : _b.length) !== null && _c !== void 0 ? _c : 0,
        };
    },
    async saveResourceBlocks(arg) {
        const sceneId = (arg === null || arg === void 0 ? void 0 : arg.sceneId) || _blockPlantSceneId;
        if (!sceneId)
            return { ok: false, error: '需要 sceneId' };
        const cellSize = (arg === null || arg === void 0 ? void 0 : arg.cellSize) && arg.cellSize > 0 ? arg.cellSize : 1;
        const originX = Number(arg === null || arg === void 0 ? void 0 : arg.originX) || 0;
        const originZ = Number(arg === null || arg === void 0 ? void 0 : arg.originZ) || 0;
        const blockPlant = (0, blockPlantIO_1.cellsToBlockPlant)((arg === null || arg === void 0 ? void 0 : arg.cells) || [], cellSize, originX, originZ);
        return (0, blockPlantIO_1.saveResourceBlockPlant)(sceneId, blockPlant);
    },
    async previewBlocksInScene(arg) {
        return previewBlocksInScene(arg || {});
    },
    async syncBlockCells(arg) {
        return syncBlockCellsInScene(arg || {});
    },
    /** 在层级中选中笔刷光标，便于拖动 */
    async selectBlockBrush() {
        var _a, _b;
        try {
            const cursor = (await Editor.Message.request('scene', 'execute-scene-script', {
                name: PKG,
                method: 'queryBlockBrushCursor',
                args: [],
            }));
            if (!(cursor === null || cursor === void 0 ? void 0 : cursor.ok)) {
                return { ok: false, reason: (cursor === null || cursor === void 0 ? void 0 : cursor.reason) || '无笔刷光标' };
            }
            if (cursor.uuid) {
                (_a = Editor.Selection) === null || _a === void 0 ? void 0 : _a.clear();
                (_b = Editor.Selection) === null || _b === void 0 ? void 0 : _b.select('node', cursor.uuid);
            }
            return { ok: true, uuid: cursor.uuid };
        }
        catch (e) {
            return { ok: false, reason: String(e) };
        }
    },
    /** 开启场景视图鼠标跟手笔刷 */
    async startMouseBrush(arg) {
        var _a, _b, _c, _d;
        const sceneId = (arg === null || arg === void 0 ? void 0 : arg.sceneId) || _blockPlantSceneId;
        if ((arg === null || arg === void 0 ? void 0 : arg.openPrefab) !== false && sceneId) {
            _blockPlantSceneId = sceneId;
            await openScene(sceneId);
            await new Promise((r) => setTimeout(r, 400));
        }
        try {
            const res = (await Editor.Message.request('scene', 'execute-scene-script', {
                name: PKG,
                method: 'startMouseBrushTool',
                args: [
                    {
                        cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [],
                        cellSize: (_a = arg === null || arg === void 0 ? void 0 : arg.cellSize) !== null && _a !== void 0 ? _a : 1,
                        originX: (_b = arg === null || arg === void 0 ? void 0 : arg.originX) !== null && _b !== void 0 ? _b : 0,
                        originZ: (_c = arg === null || arg === void 0 ? void 0 : arg.originZ) !== null && _c !== void 0 ? _c : 0,
                        brushRadius: (_d = arg === null || arg === void 0 ? void 0 : arg.brushRadius) !== null && _d !== void 0 ? _d : 1,
                        erase: !!(arg === null || arg === void 0 ? void 0 : arg.erase),
                    },
                ],
            }));
            return res || { ok: false, reason: 'scene script 无返回' };
        }
        catch (e) {
            return { ok: false, reason: String(e) };
        }
    },
    async stopMouseBrush() {
        try {
            const res = (await Editor.Message.request('scene', 'execute-scene-script', {
                name: PKG,
                method: 'stopMouseBrushTool',
                args: [],
            }));
            return res || { ok: true, cells: [], cellCount: 0 };
        }
        catch (e) {
            return { ok: false, reason: String(e), cells: [], cellCount: 0 };
        }
    },
    async configureMouseBrush(arg) {
        try {
            return await Editor.Message.request('scene', 'execute-scene-script', {
                name: PKG,
                method: 'configureMouseBrush',
                args: [arg || {}],
            });
        }
        catch (e) {
            return { ok: false, reason: String(e) };
        }
    },
    async queryMouseBrushState() {
        try {
            return await Editor.Message.request('scene', 'execute-scene-script', {
                name: PKG,
                method: 'queryMouseBrushState',
                args: [],
            });
        }
        catch (e) {
            return {
                ok: false,
                active: false,
                cells: [],
                cellCount: 0,
                reason: String(e),
            };
        }
    },
    async applyBlockBrushAtAim(arg) {
        return applyBlockBrushAtAim(arg || {});
    },
    async applyBlockBrushAtSelection(arg) {
        return applyBlockBrushAtSelection(arg || {});
    },
    async applyBlockBrushAtWorld(arg) {
        return applyBlockBrushAtWorld(arg || {});
    },
    async nudgeBlockBrush(arg) {
        return nudgeBlockBrush(arg || {});
    },
    /** 读取笔刷光标世界坐标，按半径涂抹/擦除后返回新格子集 */
    async applyBlockBrush(arg) {
        try {
            const cursor = (await Editor.Message.request('scene', 'execute-scene-script', {
                name: PKG,
                method: 'queryBlockBrushCursor',
                args: [],
            }));
            if (!(cursor === null || cursor === void 0 ? void 0 : cursor.ok)) {
                return { ok: false, reason: (cursor === null || cursor === void 0 ? void 0 : cursor.reason) || '无笔刷光标', cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [] };
            }
            return applyBlockBrushAtWorld({
                cells: arg === null || arg === void 0 ? void 0 : arg.cells,
                cellSize: arg === null || arg === void 0 ? void 0 : arg.cellSize,
                originX: arg === null || arg === void 0 ? void 0 : arg.originX,
                originZ: arg === null || arg === void 0 ? void 0 : arg.originZ,
                brushRadius: arg === null || arg === void 0 ? void 0 : arg.brushRadius,
                erase: arg === null || arg === void 0 ? void 0 : arg.erase,
                x: cursor.x,
                z: cursor.z,
            });
        }
        catch (e) {
            return { ok: false, reason: String(e), cells: (arg === null || arg === void 0 ? void 0 : arg.cells) || [] };
        }
    },
    async deleteScene(arg) {
        const sceneId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.sceneId;
        if (!sceneId) {
            await dialogWarn('请提供 sceneId');
            return { ok: false };
        }
        const item = (0, browseScenes_1.listLocalScenes)().find((s) => s.sceneId === sceneId);
        const label = item ? `${sceneId} ${item.name}` : String(sceneId);
        const confirmed = await dialogConfirm(`确定删除资源场景 ${label}？\n将删除 assets/resources/scenes/${sceneId}/（含逻辑配置，不可恢复）`, '删除');
        if (!confirmed)
            return { ok: false, cancelled: true };
        const result = await (0, deleteScene_1.deleteSceneAssets)(sceneId);
        if (!result.ok) {
            await dialogError(result.error || '删除失败');
            return result;
        }
        await dialogInfo(`已删除场景 ${sceneId}`);
        return result;
    },
    async locateScene(arg) {
        var _a;
        const sceneId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.sceneId;
        if (!sceneId) {
            await dialogWarn('请提供 sceneId');
            return { ok: false };
        }
        const item = (0, browseScenes_1.listLocalScenes)().find((s) => s.sceneId === sceneId);
        if (!item) {
            await dialogWarn(`场景 ${sceneId} 不存在`);
            return { ok: false };
        }
        const dbUrl = item.prefab ? (0, paths_1.prefabDbUrl)(item.prefab) : (0, paths_1.sceneFolderDbUrl)(sceneId);
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
    async locateLogicScene(arg) {
        var _a;
        const logicId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.logicId;
        if (!logicId) {
            await dialogWarn('请提供 logicId');
            return { ok: false };
        }
        const logic = (0, browseLogicScenes_1.listLocalLogicScenes)().find((l) => l.logicId === logicId);
        if (!logic) {
            await dialogWarn(`逻辑场景 ${logicId} 不存在`);
            return { ok: false };
        }
        const dbUrl = (0, paths_1.logicIndexDbUrl)(logic.assetsSceneId, logicId);
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
    async validateScene(arg) {
        const sceneId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.sceneId;
        if (!sceneId)
            return { ok: false };
        const r = (0, validateScene_1.validateSceneOnDisk)(sceneId);
        const msg = r.ok
            ? `校验通过\n${r.warnings.join('\n')}`
            : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
        if (r.ok)
            await dialogInfo(msg);
        else
            await dialogWarn(msg);
        return r;
    },
    async validateLogicScene(arg) {
        const logicId = typeof arg === 'number' ? arg : arg === null || arg === void 0 ? void 0 : arg.logicId;
        if (!logicId)
            return { ok: false };
        const r = (0, validateScene_1.validateLogicSceneOnDisk)(logicId);
        const msg = r.ok
            ? `校验通过\n${r.warnings.join('\n')}`
            : `校验失败\n${r.errors.join('\n')}\n${r.warnings.join('\n')}`;
        if (r.ok)
            await dialogInfo(msg);
        else
            await dialogWarn(msg);
        return r;
    },
    async validateScenes() {
        const scenes = (0, browseScenes_1.listLocalScenes)();
        if (scenes.length === 0) {
            await dialogWarn('没有可校验的场景');
            return;
        }
        const lines = [];
        for (const s of scenes) {
            const r = (0, validateScene_1.validateSceneOnDisk)(s.sceneId);
            lines.push(`[${r.ok ? 'OK' : 'FAIL'}] ${s.sceneId} ${s.name}`);
            for (const e of r.errors)
                lines.push(`  - error: ${e}`);
            for (const w of r.warnings)
                lines.push(`  - warn: ${w}`);
        }
        await dialogInfo(lines.join('\n'));
    },
    /**
     * 从 Prefab 导入到逻辑场景（次要入口）。
     * - { logicId }：写入该逻辑
     * - { sceneId }：写入默认逻辑 logicId=sceneId
     * - { logicId, assetsSceneId }：显式指定
     */
    async syncSpawn(arg) {
        let assetsSceneId = 0;
        let logicId = 0;
        if (typeof arg === 'number') {
            assetsSceneId = arg;
            logicId = arg;
        }
        else if (arg) {
            if (arg.logicId) {
                const logic = (0, browseLogicScenes_1.listLocalLogicScenes)().find((l) => l.logicId === arg.logicId);
                logicId = arg.logicId;
                assetsSceneId = arg.assetsSceneId || (logic === null || logic === void 0 ? void 0 : logic.assetsSceneId) || 0;
            }
            else if (arg.sceneId) {
                assetsSceneId = arg.sceneId;
                logicId = arg.sceneId;
            }
        }
        if (!assetsSceneId || !logicId) {
            await dialogWarn('请提供 logicId 或 sceneId');
            return { ok: false };
        }
        const r = await (0, syncSpawnFromPrefab_1.syncSpawnForLogic)(assetsSceneId, logicId);
        if (!r.ok) {
            await dialogError(`导入失败: ${r.error}`);
            return r;
        }
        await dialogInfo(`已导入到逻辑 ${logicId}（资源 ${assetsSceneId}）\n刷怪点 ${r.spawnCount} · 门点 ${r.areaCount}`);
        return r;
    },
    async syncSpawnBatch() {
        const { ok, fail, lines } = await (0, syncSpawnFromPrefab_1.syncSpawnBatch)();
        await dialogInfo(`批量从 Prefab 导入：成功 ${ok}，失败 ${fail}\n${lines.join('\n')}`);
        return { ok, fail };
    },
    async migrateChapters() {
        const confirmed = await dialogConfirm('将 Prefabs/Chapter*_Level* 迁移到 assets/resources/scenes/{600-609}/Output/\n' +
            '并更新 res.json url、SkillDebugBoot 地图路径。\n\n共享美术 Art/Building 不会移动。\n是否继续？', '迁移');
        if (!confirmed)
            return { ok: false, cancelled: true };
        const r = await (0, migrateChapters_1.migrateAllChapters)();
        await dialogInfo(`迁移完成：成功 ${r.ok}，跳过 ${r.skipped}，失败 ${r.fail}\n${r.lines.join('\n')}`);
        try {
            await openInGameEditor('resource-scene');
        }
        catch {
            /* ignore */
        }
        return r;
    },
};
function load() {
    console.log('[scene-editor] loaded（场景管理：资源 / 阻挡种植 / 逻辑种植 / 类型）');
}
function unload() {
    console.log('[scene-editor] unloaded');
}
//# sourceMappingURL=main.js.map