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
exports.EFFECT_MIGRATE_MAP = void 0;
exports.migrateOneEffect = migrateOneEffect;
exports.migrateAllEffects = migrateAllEffects;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const assetIo_1 = require("./assetIo");
const paths_1 = require("./paths");
/**
 * Prefabs/SFX_*|VFX_* → effects/{id}/
 * 已有 res.json 条目沿用原 id；孤儿特效占用空闲号段（211+ VFX / 411+ SFX）。
 */
exports.EFFECT_MIGRATE_MAP = [
    { effectId: 209, poolName: 'VFX_SanYeBiao' },
    { effectId: 210, poolName: 'VFX_HuoYanDan' },
    { effectId: 211, poolName: 'VFX_FeiHuoLun' },
    { effectId: 212, poolName: 'VFX_ZhuanLun' },
    { effectId: 213, poolName: 'VFX_ShouLei' },
    { effectId: 214, poolName: 'VFX_HuoYanDan_FaShe' },
    { effectId: 215, poolName: 'VFX_HuoYanDan_BaoZha' },
    { effectId: 216, poolName: 'VFX_Bullet01_FaShe' },
    { effectId: 217, poolName: 'VFX_Bullet01_BaoZha' },
    { effectId: 218, poolName: 'VFX_Bullet02_FaShe' },
    { effectId: 219, poolName: 'VFX_Bullet02_BaoZha' },
    { effectId: 220, poolName: 'VFX_Bullet03_FaShe' },
    { effectId: 221, poolName: 'VFX_Bullet03_BaoZha' },
    { effectId: 222, poolName: 'VFX_Bullet04_FaShe' },
    { effectId: 223, poolName: 'VFX_Bullet04_BaoZha' },
    { effectId: 224, poolName: 'VFX_BulleMissile_FaShe' },
    { effectId: 225, poolName: 'VFX_BulleMissile_BaoZha' },
    { effectId: 401, poolName: 'SFX_Blood' },
    { effectId: 402, poolName: 'SFX_FirePoint' },
    { effectId: 403, poolName: 'SFX_Boss01Bullet' },
    { effectId: 404, poolName: 'SFX_ShootArea' },
    { effectId: 405, poolName: 'SFX_FireSmoke' },
    { effectId: 406, poolName: 'SFX_WaterFlower' },
    { effectId: 409, poolName: 'SFX_MissileBoom' },
    { effectId: 410, poolName: 'SFX_BoomShow' },
    { effectId: 411, poolName: 'SFX_Damage' },
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
async function updateResJsonUrl(effectId, poolName, prefabRel) {
    const p = (0, paths_1.resJsonFsPath)();
    if (!fs.existsSync(p))
        return;
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!data.prefab)
        data.prefab = {};
    const key = String(effectId);
    const prev = data.prefab[key] || { id: effectId, name: poolName, url: '' };
    data.prefab[key] = {
        ...prev,
        id: effectId,
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
async function migrateOneEffect(opts) {
    const { effectId, poolName } = opts;
    const src = (0, paths_1.legacyEffectPrefabFs)(poolName);
    const destRel = (0, paths_1.effectOutputPrefabRel)(effectId);
    const dest = path.join((0, paths_1.getProjectRoot)(), 'assets', 'resources', `${destRel}.prefab`);
    const folderFs = (0, paths_1.effectFolderFsPath)(effectId);
    if (fs.existsSync(dest) && !fs.existsSync(src)) {
        return { ok: true, skipped: true, detail: '已在目标路径' };
    }
    if (!fs.existsSync(src) && !fs.existsSync(dest)) {
        return { ok: false, error: `源 Prefab 不存在: Prefabs/${poolName}.prefab` };
    }
    (0, paths_1.ensureDir)((0, paths_1.effectsFsRoot)());
    await (0, assetIo_1.ensureAssetFolder)((0, paths_1.effectFolderDbUrl)(effectId), folderFs);
    await (0, assetIo_1.ensureAssetFolder)(`${(0, paths_1.effectFolderDbUrl)(effectId)}/Res`, (0, paths_1.effectResFsPath)(effectId));
    await (0, assetIo_1.ensureAssetFolder)(`${(0, paths_1.effectFolderDbUrl)(effectId)}/Output`, (0, paths_1.effectOutputFsPath)(effectId));
    if (fs.existsSync(src)) {
        const srcDb = `db://assets/resources/Prefabs/${poolName}.prefab`;
        const destDb = `db://assets/resources/${destRel}.prefab`;
        let moved = false;
        try {
            await Editor.Message.request('asset-db', 'move-asset', srcDb, destDb);
            moved = fs.existsSync(dest) || !fs.existsSync(src);
        }
        catch {
            /* try fs */
        }
        if (!moved && fs.existsSync(src)) {
            try {
                moveFileKeepMeta(src, dest);
                try {
                    await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/resources/Prefabs');
                    await Editor.Message.request('asset-db', 'refresh-asset', (0, paths_1.effectFolderDbUrl)(effectId));
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
        effectId,
        name: poolName,
        category: (0, paths_1.categoryFromPoolName)(poolName),
        prefab: destRel,
        poolName,
        description: `迁移自 Prefabs/${poolName}`,
        resId: effectId,
    };
    const okIndex = await (0, assetIo_1.writeTextAsset)((0, paths_1.indexDbUrl)(effectId), JSON.stringify(index, null, 2));
    if (!okIndex)
        return { ok: false, error: '写入 index.json 失败' };
    await updateResJsonUrl(effectId, poolName, destRel);
    try {
        await Editor.Message.request('asset-db', 'refresh-asset', (0, paths_1.effectFolderDbUrl)(effectId));
    }
    catch {
        /* ignore */
    }
    return { ok: true, detail: `${poolName} → ${destRel}` };
}
async function migrateAllEffects() {
    let ok = 0;
    let fail = 0;
    let skipped = 0;
    const lines = [];
    for (const row of exports.EFFECT_MIGRATE_MAP) {
        const r = await migrateOneEffect(row);
        if (r.ok && r.skipped) {
            skipped++;
            lines.push(`[SKIP] ${row.effectId} ${row.poolName}: ${r.detail}`);
        }
        else if (r.ok) {
            ok++;
            lines.push(`[OK] ${row.effectId} ${r.detail}`);
        }
        else {
            fail++;
            lines.push(`[FAIL] ${row.effectId} ${row.poolName}: ${r.error}`);
        }
    }
    return { ok, fail, skipped, lines };
}
//# sourceMappingURL=migrateEffects.js.map