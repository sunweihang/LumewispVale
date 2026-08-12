"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyMonsterSpawn = emptyMonsterSpawn;
exports.ensureMonsterSpawn = ensureMonsterSpawn;
exports.countSpawnItems = countSpawnItems;
exports.countSpawnLayers = countSpawnLayers;
exports.defaultAreaItem = defaultAreaItem;
exports.defaultPointItem = defaultPointItem;
exports.defaultLayer = defaultLayer;
function emptyMonsterSpawn(logicId, assetsSceneId) {
    return {
        formatVersion: 1,
        logicSceneId: logicId,
        resourceSceneId: String(assetsSceneId),
        layers: [
            {
                layerId: 1,
                layerName: 'default',
                items: [],
            },
        ],
    };
}
function ensureMonsterSpawn(index, logicId, assetsSceneId) {
    var _a, _b, _c, _d;
    if ((_b = (_a = index.monsterSpawn) === null || _a === void 0 ? void 0 : _a.layers) === null || _b === void 0 ? void 0 : _b.length) {
        return {
            formatVersion: (_c = index.monsterSpawn.formatVersion) !== null && _c !== void 0 ? _c : 1,
            logicSceneId: logicId,
            resourceSceneId: String(assetsSceneId),
            layers: index.monsterSpawn.layers.map((l) => ({
                layerId: l.layerId,
                layerName: l.layerName || `layer_${l.layerId}`,
                items: Array.isArray(l.items) ? l.items.map((it) => ({ ...it })) : [],
            })),
        };
    }
    // 兼容旧 spawnPoints
    const points = (_d = index.spawnPoints) !== null && _d !== void 0 ? _d : [];
    if (points.length > 0) {
        return {
            formatVersion: 1,
            logicSceneId: logicId,
            resourceSceneId: String(assetsSceneId),
            layers: [
                {
                    layerId: 1,
                    layerName: 'default',
                    items: points.map((p) => {
                        var _a, _b, _c, _d;
                        return ({
                            position: (_a = p.position) !== null && _a !== void 0 ? _a : { x: 0, y: 0, z: 0 },
                            scale: (_b = p.scale) !== null && _b !== void 0 ? _b : { x: 1, y: 1, z: 1 },
                            enemyKeys: ((_c = p.enemyList) !== null && _c !== void 0 ? _c : []).map(String),
                            enemyCount: p.enemyCount | 0,
                            fogOfWarName: (_d = p.fogOfWarName) !== null && _d !== void 0 ? _d : '',
                            level: 1,
                        });
                    }),
                },
            ],
        };
    }
    return emptyMonsterSpawn(logicId, assetsSceneId);
}
function countSpawnItems(bundle) {
    var _a, _b;
    if (!(bundle === null || bundle === void 0 ? void 0 : bundle.layers))
        return 0;
    let n = 0;
    for (const layer of bundle.layers)
        n += (_b = (_a = layer.items) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
    return n;
}
function countSpawnLayers(bundle) {
    var _a, _b;
    return (_b = (_a = bundle === null || bundle === void 0 ? void 0 : bundle.layers) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
}
function defaultAreaItem() {
    return {
        position: { x: 0, y: 0.5, z: 0 },
        scale: { x: 5, y: 1, z: 5 },
        enemyKeys: ['Enemy00'],
        enemyCount: 1,
        fogOfWarName: '',
        level: 1,
    };
}
function defaultPointItem() {
    return {
        monsterKey: 'Enemy00',
        level: 1,
        position: { x: 0, y: 0.5, z: 0 },
        eulerAngles: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        fogOfWarName: '',
    };
}
function defaultLayer(layerId) {
    return {
        layerId,
        layerName: layerId === 1 ? 'default' : `layer_${layerId}`,
        items: [],
    };
}
//# sourceMappingURL=monsterSpawnUtil.js.map