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
exports.spawnPointsToMonsterSpawn = spawnPointsToMonsterSpawn;
exports.extractSpawnFromPrefab = extractSpawnFromPrefab;
exports.syncSpawnForLogic = syncSpawnForLogic;
exports.syncSpawnForScene = syncSpawnForScene;
exports.syncSpawnBatch = syncSpawnBatch;
const fs = __importStar(require("fs"));
const assetIo_1 = require("./assetIo");
const browseLogicScenes_1 = require("./browseLogicScenes");
const browseScenes_1 = require("./browseScenes");
const paths_1 = require("./paths");
const createLogicScene_1 = require("./createLogicScene");
/** spawnPoints → monsterSpawn.layers[0]（区域条目，运行时再展开点位） */
function spawnPointsToMonsterSpawn(spawnPoints, logicId, assetsSceneId) {
    return {
        formatVersion: 1,
        logicSceneId: logicId,
        resourceSceneId: String(assetsSceneId),
        layers: [
            {
                layerId: 1,
                layerName: 'default',
                items: spawnPoints.map((p) => {
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
function asArray(data) {
    if (!Array.isArray(data))
        return null;
    return data;
}
function vec3(v) {
    return {
        x: Number(v === null || v === void 0 ? void 0 : v.x) || 0,
        y: Number(v === null || v === void 0 ? void 0 : v.y) || 0,
        z: Number(v === null || v === void 0 ? void 0 : v.z) || 0,
    };
}
/** 从房间 Prefab JSON 抽取 EnemyBornInfo / 门点 */
function extractSpawnFromPrefab(prefabPath) {
    var _a;
    if (!fs.existsSync(prefabPath)) {
        return { ok: false, spawnPoints: [], areas: [], error: `Prefab 不存在: ${prefabPath}` };
    }
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
    }
    catch (e) {
        return { ok: false, spawnPoints: [], areas: [], error: `Prefab 解析失败: ${e}` };
    }
    const arr = asArray(raw);
    if (!arr) {
        return { ok: false, spawnPoints: [], areas: [], error: 'Prefab 不是数组格式' };
    }
    const spawnPoints = [];
    const areas = [];
    const seenArea = new Set();
    for (const obj of arr) {
        if (!obj || typeof obj !== 'object')
            continue;
        if (Array.isArray(obj.enemyList) && typeof obj.enemyCount === 'number') {
            const nodeId = (_a = obj.node) === null || _a === void 0 ? void 0 : _a.__id__;
            const node = typeof nodeId === 'number' ? arr[nodeId] : null;
            const nodeName = (node === null || node === void 0 ? void 0 : node._name) || 'EnemyBorn';
            spawnPoints.push({
                nodeName,
                position: vec3(node === null || node === void 0 ? void 0 : node._lpos),
                scale: vec3(node === null || node === void 0 ? void 0 : node._lscale),
                enemyList: obj.enemyList.map((x) => String(x)),
                enemyCount: obj.enemyCount | 0,
                fogOfWarName: typeof obj.fogOfWarName === 'string' ? obj.fogOfWarName : '',
            });
            continue;
        }
        if (obj.__type__ === 'cc.Node' && obj._name) {
            const name = obj._name;
            if ((name === 'InterDoor' || name === 'ExitDoor' || name === 'EnemyBornRoot') &&
                !seenArea.has(name + JSON.stringify(obj._lpos))) {
                if (name === 'InterDoor' || name === 'ExitDoor') {
                    seenArea.add(name + JSON.stringify(obj._lpos));
                    areas.push({
                        nodeName: name,
                        kind: name,
                        position: vec3(obj._lpos),
                    });
                }
            }
        }
    }
    return { ok: true, spawnPoints, areas };
}
/**
 * 从资源 Prefab 导入刷怪到**指定逻辑场景**（次要入口；主入口为种植编辑器）。
 */
async function syncSpawnForLogic(assetsSceneId, logicId) {
    const scene = (0, browseScenes_1.listLocalScenes)().find((s) => s.sceneId === assetsSceneId);
    if (!scene)
        return { ok: false, error: `资源场景 ${assetsSceneId} 不存在` };
    if (!scene.prefab)
        return { ok: false, error: '未配置 prefab' };
    const prefabPath = (0, paths_1.prefabFsPath)(scene.prefab);
    const extracted = extractSpawnFromPrefab(prefabPath);
    if (!extracted.ok)
        return { ok: false, error: extracted.error };
    const logicPath = (0, paths_1.logicIndexFsPath)(assetsSceneId, logicId);
    if (!fs.existsSync(logicPath)) {
        const created = await (0, createLogicScene_1.createLogicSceneAssets)({
            logicId,
            assetsSceneId,
            name: `${scene.name} 逻辑`,
            category: scene.category,
        });
        if (!created.ok)
            return { ok: false, error: created.error };
    }
    let index = {
        logicId,
        name: `${scene.name} 逻辑`,
        assetsSceneId,
        category: scene.category,
        spawnPoints: [],
        areas: [],
    };
    if (fs.existsSync(logicPath)) {
        try {
            index = { ...index, ...JSON.parse(fs.readFileSync(logicPath, 'utf8')) };
        }
        catch {
            /* keep default */
        }
    }
    index.logicId = logicId;
    index.assetsSceneId = assetsSceneId;
    index.spawnPoints = extracted.spawnPoints;
    index.monsterSpawn = spawnPointsToMonsterSpawn(extracted.spawnPoints, logicId, assetsSceneId);
    index.areas = extracted.areas;
    (0, paths_1.ensureDir)((0, paths_1.logicFolderFsPath)(assetsSceneId, logicId));
    const ok = await (0, assetIo_1.writeTextAsset)((0, paths_1.logicIndexDbUrl)(assetsSceneId, logicId), JSON.stringify(index, null, 2));
    if (!ok)
        return { ok: false, error: '写入 logic index 失败' };
    return {
        ok: true,
        spawnCount: extracted.spawnPoints.length,
        areaCount: extracted.areas.length,
    };
}
/** 兼容：资源场景 → 默认逻辑（logicId = sceneId） */
async function syncSpawnForScene(sceneId) {
    return syncSpawnForLogic(sceneId, sceneId);
}
async function syncSpawnBatch() {
    const logics = (0, browseLogicScenes_1.listLocalLogicScenes)();
    let ok = 0;
    let fail = 0;
    const lines = [];
    if (logics.length === 0) {
        // 无逻辑时退回按资源场景同步默认逻辑
        const scenes = (0, browseScenes_1.listLocalScenes)();
        for (const s of scenes) {
            if (!s.hasPrefab) {
                lines.push(`[SKIP] 资源 ${s.sceneId} 无 Prefab`);
                continue;
            }
            const r = await syncSpawnForLogic(s.sceneId, s.sceneId);
            if (r.ok) {
                ok++;
                lines.push(`[OK] logic=${s.sceneId} spawn=${r.spawnCount}`);
            }
            else {
                fail++;
                lines.push(`[FAIL] logic=${s.sceneId}: ${r.error}`);
            }
        }
        return { ok, fail, lines };
    }
    for (const l of logics) {
        const scene = (0, browseScenes_1.listLocalScenes)().find((s) => s.sceneId === l.assetsSceneId);
        if (!(scene === null || scene === void 0 ? void 0 : scene.hasPrefab)) {
            lines.push(`[SKIP] logic=${l.logicId} 资源 ${l.assetsSceneId} 无 Prefab`);
            continue;
        }
        const r = await syncSpawnForLogic(l.assetsSceneId, l.logicId);
        if (r.ok) {
            ok++;
            lines.push(`[OK] logic=${l.logicId}←资源${l.assetsSceneId} spawn=${r.spawnCount}`);
        }
        else {
            fail++;
            lines.push(`[FAIL] logic=${l.logicId}: ${r.error}`);
        }
    }
    return { ok, fail, lines };
}
//# sourceMappingURL=syncSpawnFromPrefab.js.map