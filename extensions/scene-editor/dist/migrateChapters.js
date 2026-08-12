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
exports.CHAPTER_MIGRATE_MAP = void 0;
exports.migrateOneChapter = migrateOneChapter;
exports.migrateAllChapters = migrateAllChapters;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const assetIo_1 = require("./assetIo");
const paths_1 = require("./paths");
const createLogicScene_1 = require("./createLogicScene");
const syncSpawnFromPrefab_1 = require("./syncSpawnFromPrefab");
/** 与 res.json 600–609 对齐的既有关卡 */
exports.CHAPTER_MIGRATE_MAP = [
    { sceneId: 600, poolName: 'Chapter01_Level00' },
    { sceneId: 601, poolName: 'Chapter01_Level01' },
    { sceneId: 602, poolName: 'Chapter01_Level02' },
    { sceneId: 603, poolName: 'Chapter01_Level03' },
    { sceneId: 604, poolName: 'Chapter01_Level04' },
    { sceneId: 605, poolName: 'Chapter01_Level05' },
    { sceneId: 606, poolName: 'Chapter01_Level06' },
    { sceneId: 607, poolName: 'Chapter02_Level01' },
    { sceneId: 608, poolName: 'Chapter02_Level02' },
    { sceneId: 609, poolName: 'Chapter02_Level03' },
];
function moveFileKeepMeta(src, dest) {
    (0, paths_1.ensureDir)(path.dirname(dest));
    if (fs.existsSync(dest)) {
        fs.rmSync(dest, { force: true });
    }
    fs.renameSync(src, dest);
    const srcMeta = `${src}.meta`;
    const destMeta = `${dest}.meta`;
    if (fs.existsSync(srcMeta)) {
        if (fs.existsSync(destMeta))
            fs.rmSync(destMeta, { force: true });
        fs.renameSync(srcMeta, destMeta);
    }
}
async function updateResJsonUrl(sceneId, poolName, prefabRel) {
    const p = (0, paths_1.resJsonFsPath)();
    if (!fs.existsSync(p))
        return;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data.prefab)
        data.prefab = {};
    const key = String(sceneId);
    const prev = data.prefab[key] || { id: sceneId, name: poolName, url: '' };
    data.prefab[key] = {
        ...prev,
        id: sceneId,
        name: poolName,
        url: prefabRel.replace(/\.prefab$/, ''),
    };
    fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
    try {
        await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/resources/json/res.json');
    }
    catch {
        /* ignore */
    }
}
function patchSkillDebugBoot() {
    const bootPath = path.join((0, paths_1.getProjectRoot)(), 'assets', 'Scripts', 'src', 'skill', 'debug', 'SkillDebugBoot.ts');
    if (!fs.existsSync(bootPath)) {
        return { ok: false, note: 'SkillDebugBoot.ts 不存在' };
    }
    let text = fs.readFileSync(bootPath, 'utf8');
    const next = 'scenes/600/Output/600';
    if (text.includes(next)) {
        return { ok: true, note: 'SkillDebugBoot 已是新路径' };
    }
    const replaced = text.replace(/const\s+MAP_PREFAB\s*=\s*["']Prefabs\/Chapter01_Level00["']\s*;/, `const MAP_PREFAB = "${next}";`);
    if (replaced === text) {
        // 宽松替换任意 Prefabs/Chapter01_Level00 字符串常量
        const loose = text.replace(/(["'])Prefabs\/Chapter01_Level00\1/g, `"${next}"`);
        if (loose === text) {
            return { ok: false, note: '未找到 MAP_PREFAB Prefabs/Chapter01_Level00' };
        }
        text = loose;
    }
    else {
        text = replaced;
    }
    fs.writeFileSync(bootPath, text, 'utf8');
    return { ok: true, note: `SkillDebugBoot MAP_PREFAB → ${next}` };
}
async function migrateOneChapter(opts) {
    const { sceneId, poolName } = opts;
    const src = (0, paths_1.legacyChapterPrefabFs)(poolName);
    const destRel = (0, paths_1.sceneOutputPrefabRel)(sceneId);
    const dest = path.join((0, paths_1.getProjectRoot)(), 'assets', 'resources', `${destRel}.prefab`);
    const folderFs = (0, paths_1.sceneFolderFsPath)(sceneId);
    // 已迁移：目标存在且源不存在
    if (fs.existsSync(dest) && !fs.existsSync(src)) {
        return { ok: true, skipped: true, detail: '已在目标路径' };
    }
    if (!fs.existsSync(src) && !fs.existsSync(dest)) {
        return { ok: false, error: `源 Prefab 不存在: Prefabs/${poolName}.prefab` };
    }
    (0, paths_1.ensureDir)((0, paths_1.scenesFsRoot)());
    await (0, assetIo_1.ensureAssetFolder)((0, paths_1.sceneFolderDbUrl)(sceneId), folderFs);
    await (0, assetIo_1.ensureAssetFolder)(`${(0, paths_1.sceneFolderDbUrl)(sceneId)}/Res`, (0, paths_1.sceneResFsPath)(sceneId));
    await (0, assetIo_1.ensureAssetFolder)(`${(0, paths_1.sceneFolderDbUrl)(sceneId)}/Output`, (0, paths_1.sceneOutputFsPath)(sceneId));
    if (fs.existsSync(src)) {
        const srcDb = `db://assets/resources/Prefabs/${poolName}.prefab`;
        const destDb = `db://assets/resources/${destRel}.prefab`;
        let moved = false;
        // Cocos 3.8：move-asset(source, target)
        try {
            await Editor.Message.request('asset-db', 'move-asset', srcDb, destDb);
            moved = fs.existsSync(dest) || !fs.existsSync(src);
        }
        catch {
            /* try object form / fs */
        }
        if (!moved && fs.existsSync(src)) {
            try {
                moveFileKeepMeta(src, dest);
                try {
                    await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/resources/Prefabs');
                    await Editor.Message.request('asset-db', 'refresh-asset', (0, paths_1.sceneFolderDbUrl)(sceneId));
                }
                catch {
                    /* ignore */
                }
            }
            catch (e) {
                return { ok: false, error: `移动 Prefab 失败: ${e}` };
            }
        }
    }
    if (!fs.existsSync(dest)) {
        return { ok: false, error: `迁移后目标不存在: ${destRel}.prefab` };
    }
    const index = {
        sceneId,
        name: poolName,
        category: (0, paths_1.categoryFromPoolName)(poolName),
        prefab: destRel,
        poolName,
        description: `迁移自 Prefabs/${poolName}`,
        resId: sceneId,
    };
    const okIndex = await (0, assetIo_1.writeTextAsset)((0, paths_1.indexDbUrl)(sceneId), JSON.stringify(index, null, 2));
    if (!okIndex)
        return { ok: false, error: '写入 index.json 失败' };
    const logicFs = path.join(folderFs, 'logic', String(sceneId), 'index.json');
    if (!fs.existsSync(logicFs)) {
        await (0, createLogicScene_1.createLogicSceneAssets)({
            logicId: sceneId,
            assetsSceneId: sceneId,
            name: `${poolName} 逻辑`,
            category: index.category,
        });
    }
    await updateResJsonUrl(sceneId, poolName, destRel);
    const sync = await (0, syncSpawnFromPrefab_1.syncSpawnForScene)(sceneId);
    const syncNote = sync.ok
        ? `刷怪点 ${sync.spawnCount}`
        : `刷怪同步跳过: ${sync.error}`;
    try {
        await Editor.Message.request('asset-db', 'refresh-asset', (0, paths_1.sceneFolderDbUrl)(sceneId));
    }
    catch {
        /* ignore */
    }
    return { ok: true, detail: `${poolName} → ${destRel}（${syncNote}）` };
}
async function migrateAllChapters() {
    let ok = 0;
    let fail = 0;
    let skipped = 0;
    const lines = [];
    for (const row of exports.CHAPTER_MIGRATE_MAP) {
        const r = await migrateOneChapter(row);
        if (r.ok && r.skipped) {
            skipped++;
            lines.push(`[SKIP] ${row.sceneId} ${row.poolName}: ${r.detail}`);
        }
        else if (r.ok) {
            ok++;
            lines.push(`[OK] ${row.sceneId} ${r.detail}`);
        }
        else {
            fail++;
            lines.push(`[FAIL] ${row.sceneId} ${row.poolName}: ${r.error}`);
        }
    }
    const boot = patchSkillDebugBoot();
    lines.push(`[SkillDebug] ${boot.note}`);
    return { ok, fail, skipped, lines, skillDebug: boot.note };
}
//# sourceMappingURL=migrateChapters.js.map