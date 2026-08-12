#!/usr/bin/env node
'use strict';

/**
 * 将仅被单个特效引用的 Art/SFX（等）资源移动到 effects/{id}/Res/{Materials|Textures|Models}/
 * 保留 .meta（UUID 不变）。多特效共享 / 被子弹·角色·场景引用的资源留在原处。
 *
 * 用法：node extensions/effect-editor/scripts/migrate-res-cli.js
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const ASSETS = path.join(projectRoot, 'assets');
const EFFECTS = path.join(ASSETS, 'resources', 'effects');
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const MOVEABLE_PREFIXES = [
  'Art/SFX/Materials/',
  'Art/SFX/Textures/',
  'Art/SFX/Models/',
  'Art/Role/Materials/',
];

function walkFiles(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = path.join(dir, name);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
}

function buildUuidMap() {
  const map = new Map();
  const files = [];
  walkFiles(ASSETS, files);
  for (const f of files) {
    if (!f.endsWith('.meta')) continue;
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch {
      continue;
    }
    const m = text.match(/"uuid"\s*:\s*"([^"]+)"/);
    if (!m) continue;
    const asset = f.slice(0, -5); // strip .meta
    if (fs.existsSync(asset)) {
      map.set(m[1].toLowerCase(), asset);
    }
  }
  return map;
}

function collectDeps(filePath, uuidMap) {
  const deps = new Set();
  const seenU = new Set();
  const queue = [];

  const pushFrom = (fp) => {
    let text;
    try {
      text = fs.readFileSync(fp, 'utf8');
    } catch {
      return;
    }
    const found = text.match(UUID_RE) || [];
    for (const u of found) queue.push(u.toLowerCase());
  };

  pushFrom(filePath);
  let i = 0;
  while (i < queue.length) {
    const u = queue[i++];
    if (seenU.has(u)) continue;
    seenU.add(u);
    const dep = uuidMap.get(u);
    if (!dep) continue;
    const rel = path.relative(ASSETS, dep).split(path.sep).join('/');
    if (rel.startsWith('Scripts/')) continue;
    deps.add(dep);
    const ext = path.extname(dep).toLowerCase();
    if (ext === '.mtl' || ext === '.prefab' || ext === '.effect') {
      pushFrom(dep);
    }
  }
  return deps;
}

function kindFolder(absPath) {
  const rel = path.relative(ASSETS, absPath).split(path.sep).join('/');
  const ext = path.extname(absPath).toLowerCase();
  if (rel.includes('/Materials/') || ext === '.mtl') return 'Materials';
  if (
    rel.includes('/Textures/') ||
    ['.png', '.jpg', '.jpeg', '.tga', '.webp'].includes(ext)
  ) {
    return 'Textures';
  }
  if (
    rel.includes('/Models/') ||
    rel.includes('/FBX/') ||
    ['.fbx', '.mesh', '.gltf', '.glb'].includes(ext)
  ) {
    return 'Models';
  }
  if (rel.includes('/Anims/') || ext === '.anim') return 'Anims';
  return null;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function moveKeepMeta(src, dest) {
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) fs.rmSync(dest, { force: true });
  fs.renameSync(src, dest);
  const sm = `${src}.meta`;
  const dm = `${dest}.meta`;
  if (fs.existsSync(sm)) {
    if (fs.existsSync(dm)) fs.rmSync(dm, { force: true });
    fs.renameSync(sm, dm);
  }
}

function main() {
  console.log('[effect-res] building uuid map…');
  const uuidMap = buildUuidMap();
  console.log(`[effect-res] uuid map: ${uuidMap.size}`);

  const effectDeps = new Map(); // eid -> Set(abs)
  if (!fs.existsSync(EFFECTS)) {
    console.error('effects root missing');
    process.exit(1);
  }

  for (const name of fs.readdirSync(EFFECTS)) {
    if (!/^\d+$/.test(name)) continue;
    const eid = Number(name);
    const prefab = path.join(EFFECTS, name, 'Output', `${name}.prefab`);
    if (!fs.existsSync(prefab)) continue;
    effectDeps.set(eid, collectDeps(prefab, uuidMap));
  }

  const otherFiles = [];
  const otherRoots = [
    path.join(ASSETS, 'resources', 'Prefabs'),
    path.join(ASSETS, 'resources', 'units'),
    path.join(ASSETS, 'resources', 'scenes'),
    path.join(ASSETS, 'Scene'),
    path.join(ASSETS, 'Art', 'Role'),
  ];
  // 特效预览场景不参与「共享」判定（否则专属资源会被误判为全局占用）
  const IGNORE_CONSUMERS = new Set([
    path.join(ASSETS, 'Art', 'SFX', 'Level_SFX.scene'),
    path.join(ASSETS, 'Scene', 'EffectPreview.scene'),
  ]);

  for (const root of otherRoots) {
    const files = [];
    walkFiles(root, files);
    for (const f of files) {
      if (IGNORE_CONSUMERS.has(f)) continue;
      const ext = path.extname(f).toLowerCase();
      if (['.prefab', '.scene', '.mtl'].includes(ext)) otherFiles.push(f);
    }
  }

  console.log(`[effect-res] scanning ${otherFiles.length} non-effect consumers…`);
  const usedElsewhere = new Set();
  for (const f of otherFiles) {
    for (const dep of collectDeps(f, uuidMap)) usedElsewhere.add(dep);
  }

  const assetToEffects = new Map();
  for (const [eid, deps] of effectDeps) {
    for (const dep of deps) {
      if (!assetToEffects.has(dep)) assetToEffects.set(dep, new Set());
      assetToEffects.get(dep).add(eid);
    }
  }

  const moves = [];
  const sharedLeft = [];
  const globalLeft = [];

  for (const [eid, deps] of [...effectDeps.entries()].sort((a, b) => a[0] - b[0])) {
    for (const dep of [...deps].sort()) {
      const rel = path.relative(ASSETS, dep).split(path.sep).join('/');
      if (!MOVEABLE_PREFIXES.some((p) => rel.startsWith(p))) continue;
      if (rel.startsWith('Art/Role/') && !rel.startsWith('Art/Role/Materials/')) {
        continue;
      }
      const users = assetToEffects.get(dep) || new Set();
      if (users.size > 1) {
        sharedLeft.push({ rel, users: [...users].sort() });
        continue;
      }
      if (usedElsewhere.has(dep)) {
        globalLeft.push(rel);
        continue;
      }
      const folder = kindFolder(dep);
      if (!folder) continue;
      const dest = path.join(EFFECTS, String(eid), 'Res', folder, path.basename(dep));
      if (path.resolve(dest) === path.resolve(dep)) continue;
      moves.push({ eid, src: dep, dest, rel });
    }
  }

  // dedupe shared report
  const sharedSeen = new Set();
  const sharedUnique = [];
  for (const row of sharedLeft) {
    if (sharedSeen.has(row.rel)) continue;
    sharedSeen.add(row.rel);
    sharedUnique.push(row);
  }

  console.log(`\n[effect-res] exclusive moves: ${moves.length}`);
  for (const m of moves) {
    const destRel = path.relative(ASSETS, m.dest).split(path.sep).join('/');
    console.log(`  ${m.eid}  ${m.rel}  ->  ${destRel}`);
    moveKeepMeta(m.src, m.dest);
  }

  const reportPath = path.join(__dirname, 'last-res-migrate-report.txt');
  const lines = [
    `MOVED ${moves.length} exclusive assets into effects/*/Res/`,
    '',
    ...moves.map((m) => {
      const destRel = path.relative(ASSETS, m.dest).split(path.sep).join('/');
      return `${m.eid}\t${m.rel}\t->\t${destRel}`;
    }),
    '',
    `SHARED across effects (left in place): ${sharedUnique.length}`,
    ...sharedUnique.map((r) => `  ${r.rel}  effects=[${r.users.join(',')}]`),
    '',
    `USED by bullets/role/scenes (left in place): ${new Set(globalLeft).size}`,
    ...[...new Set(globalLeft)].sort().map((r) => `  ${r}`),
    '',
  ];
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
  console.log(`\n[effect-res] done. report: ${reportPath}`);
  console.log(
    `shared-left=${sharedUnique.length} global-left=${new Set(globalLeft).size}`
  );
}

main();
