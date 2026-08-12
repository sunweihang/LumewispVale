#!/usr/bin/env node
'use strict';

/**
 * 无 Editor 环境下执行 Chapter → scenes/{id} 迁移（与 migrateChapters 同逻辑）。
 * 用法：node extensions/scene-editor/scripts/migrate-cli.js
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');

const MAP = [
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

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function categoryFromPoolName(poolName) {
  const m = poolName.match(/^(Chapter\d+)/i);
  return m ? m[1] : 'uncategorized';
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

function extractSpawn(prefabPath) {
  const spawnPoints = [];
  const areas = [];
  if (!fs.existsSync(prefabPath)) return { spawnPoints, areas };
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
  } catch {
    return { spawnPoints, areas };
  }
  if (!Array.isArray(arr)) return { spawnPoints, areas };
  const seen = new Set();
  for (const obj of arr) {
    if (!obj || typeof obj !== 'object') continue;
    if (Array.isArray(obj.enemyList) && typeof obj.enemyCount === 'number') {
      const nodeId = obj.node && obj.node.__id__;
      const node = typeof nodeId === 'number' ? arr[nodeId] : null;
      spawnPoints.push({
        nodeName: (node && node._name) || 'EnemyBorn',
        position: {
          x: (node && node._lpos && node._lpos.x) || 0,
          y: (node && node._lpos && node._lpos.y) || 0,
          z: (node && node._lpos && node._lpos.z) || 0,
        },
        scale: {
          x: (node && node._lscale && node._lscale.x) || 1,
          y: (node && node._lscale && node._lscale.y) || 1,
          z: (node && node._lscale && node._lscale.z) || 1,
        },
        enemyList: obj.enemyList.map(String),
        enemyCount: obj.enemyCount | 0,
        fogOfWarName: typeof obj.fogOfWarName === 'string' ? obj.fogOfWarName : '',
      });
    }
    if (obj.__type__ === 'cc.Node' && (obj._name === 'InterDoor' || obj._name === 'ExitDoor')) {
      const key = obj._name + JSON.stringify(obj._lpos);
      if (!seen.has(key)) {
        seen.add(key);
        areas.push({
          nodeName: obj._name,
          kind: obj._name,
          position: {
            x: (obj._lpos && obj._lpos.x) || 0,
            y: (obj._lpos && obj._lpos.y) || 0,
            z: (obj._lpos && obj._lpos.z) || 0,
          },
        });
      }
    }
  }
  return { spawnPoints, areas };
}

function updateResJson(sceneId, poolName, prefabRel) {
  const p = path.join(projectRoot, 'assets/resources/json/res.json');
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!data.prefab) data.prefab = {};
  const key = String(sceneId);
  const prev = data.prefab[key] || { id: sceneId, name: poolName, url: '' };
  data.prefab[key] = {
    ...prev,
    id: sceneId,
    name: poolName,
    url: prefabRel,
  };
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function patchSkillDebug() {
  const bootPath = path.join(
    projectRoot,
    'assets/Scripts/src/skill/debug/SkillDebugBoot.ts'
  );
  let text = fs.readFileSync(bootPath, 'utf8');
  const next = 'scenes/600/Output/600';
  if (text.includes(next)) return 'already patched';
  const replaced = text.replace(
    /const\s+MAP_PREFAB\s*=\s*["']Prefabs\/Chapter01_Level00["']\s*;/,
    `const MAP_PREFAB = "${next}";`
  );
  if (replaced === text) {
    throw new Error('failed to patch SkillDebugBoot MAP_PREFAB');
  }
  fs.writeFileSync(bootPath, replaced, 'utf8');
  return `MAP_PREFAB → ${next}`;
}

let ok = 0;
let skip = 0;
let fail = 0;

for (const { sceneId, poolName } of MAP) {
  const src = path.join(projectRoot, `assets/resources/Prefabs/${poolName}.prefab`);
  const destRel = `scenes/${sceneId}/Output/${sceneId}`;
  const dest = path.join(projectRoot, `assets/resources/${destRel}.prefab`);
  const folder = path.join(projectRoot, `assets/resources/scenes/${sceneId}`);

  try {
    if (fs.existsSync(dest) && !fs.existsSync(src)) {
      console.log(`[SKIP] ${sceneId} ${poolName}`);
      skip++;
      continue;
    }
    if (!fs.existsSync(src) && !fs.existsSync(dest)) {
      console.log(`[FAIL] ${sceneId} missing source`);
      fail++;
      continue;
    }

    ensureDir(path.join(folder, 'Res'));
    ensureDir(path.join(folder, 'Output'));
    ensureDir(path.join(folder, 'logic', String(sceneId)));

    if (fs.existsSync(src)) {
      moveFileKeepMeta(src, dest);
    }

    const index = {
      sceneId,
      name: poolName,
      category: categoryFromPoolName(poolName),
      prefab: destRel,
      poolName,
      description: `迁移自 Prefabs/${poolName}`,
      resId: sceneId,
    };
    fs.writeFileSync(path.join(folder, 'index.json'), JSON.stringify(index, null, 2) + '\n');

    const { spawnPoints, areas } = extractSpawn(dest);
    const logic = {
      logicId: sceneId,
      name: `${poolName} 逻辑`,
      assetsSceneId: sceneId,
      category: index.category,
      description: '',
      spawnPoints,
      areas,
    };
    fs.writeFileSync(
      path.join(folder, 'logic', String(sceneId), 'index.json'),
      JSON.stringify(logic, null, 2) + '\n'
    );

    updateResJson(sceneId, poolName, destRel);
    console.log(`[OK] ${sceneId} ${poolName} → ${destRel} spawn=${spawnPoints.length}`);
    ok++;
  } catch (e) {
    console.error(`[FAIL] ${sceneId}`, e);
    fail++;
  }
}

try {
  console.log(`[SkillDebug] ${patchSkillDebug()}`);
} catch (e) {
  console.error('[SkillDebug]', e.message);
  fail++;
}

console.log(`\ndone ok=${ok} skip=${skip} fail=${fail}`);
process.exit(fail > 0 ? 1 : 0);
