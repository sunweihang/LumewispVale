#!/usr/bin/env node
'use strict';

/**
 * 无 Editor 环境下执行 Prefabs/SFX_*|VFX_* → effects/{id} 迁移。
 * 用法：node extensions/effect-editor/scripts/migrate-cli.js
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');

const MAP = [
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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function categoryFromPoolName(poolName) {
  if (/^SFX_/i.test(poolName)) return 'SFX';
  if (/^VFX_/i.test(poolName)) return 'VFX';
  return 'uncategorized';
}

function moveFileKeepMeta(src, dest) {
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
  fs.renameSync(src, dest);
  const srcMeta = `${src}.meta`;
  const destMeta = `${dest}.meta`;
  if (fs.existsSync(srcMeta)) {
    if (fs.existsSync(destMeta)) fs.rmSync(destMeta, { force: true });
    fs.renameSync(srcMeta, destMeta);
  }
}

function updateResJson(effectId, poolName, prefabRel) {
  const p = path.join(projectRoot, 'assets/resources/json/res.json');
  if (!fs.existsSync(p)) return;
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!data.prefab) data.prefab = {};
  const key = String(effectId);
  const prev = data.prefab[key] || { id: effectId, name: poolName, url: '' };
  data.prefab[key] = {
    ...prev,
    id: effectId,
    name: poolName,
    url: prefabRel.replace(/\.prefab$/, ''),
  };
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function migrateOne({ effectId, poolName }) {
  const src = path.join(projectRoot, 'assets/resources/Prefabs', `${poolName}.prefab`);
  const destRel = `effects/${effectId}/Output/${effectId}`;
  const dest = path.join(projectRoot, 'assets/resources', `${destRel}.prefab`);
  const folder = path.join(projectRoot, 'assets/resources/effects', String(effectId));

  if (fs.existsSync(dest) && !fs.existsSync(src)) {
    return { ok: true, skipped: true, detail: '已在目标路径' };
  }
  if (!fs.existsSync(src) && !fs.existsSync(dest)) {
    return { ok: false, error: `源不存在 Prefabs/${poolName}.prefab` };
  }

  ensureDir(path.join(folder, 'Res'));
  ensureDir(path.join(folder, 'Output'));

  if (fs.existsSync(src)) {
    moveFileKeepMeta(src, dest);
  }
  if (!fs.existsSync(dest)) {
    return { ok: false, error: `迁移后目标不存在 ${destRel}.prefab` };
  }

  const index = {
    effectId,
    name: poolName,
    category: categoryFromPoolName(poolName),
    prefab: destRel,
    poolName,
    description: `迁移自 Prefabs/${poolName}`,
    resId: effectId,
  };
  fs.writeFileSync(path.join(folder, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
  updateResJson(effectId, poolName, destRel);
  return { ok: true, detail: `${poolName} → ${destRel}` };
}

let ok = 0;
let fail = 0;
let skipped = 0;
for (const row of MAP) {
  const r = migrateOne(row);
  if (r.ok && r.skipped) {
    skipped++;
    console.log(`[SKIP] ${row.effectId} ${row.poolName}: ${r.detail}`);
  } else if (r.ok) {
    ok++;
    console.log(`[OK] ${row.effectId} ${r.detail}`);
  } else {
    fail++;
    console.log(`[FAIL] ${row.effectId} ${row.poolName}: ${r.error}`);
  }
}
console.log(`\n完成：成功 ${ok}，跳过 ${skipped}，失败 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
