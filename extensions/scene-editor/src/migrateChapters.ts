import * as fs from 'fs';
import * as path from 'path';
import { ensureAssetFolder, writeTextAsset } from './assetIo';
import {
  SceneIndexJSON,
  categoryFromPoolName,
  ensureDir,
  getProjectRoot,
  indexDbUrl,
  legacyChapterPrefabFs,
  resJsonFsPath,
  sceneFolderDbUrl,
  sceneFolderFsPath,
  sceneOutputFsPath,
  sceneOutputPrefabRel,
  sceneResFsPath,
  scenesFsRoot,
} from './paths';
import { createLogicSceneAssets } from './createLogicScene';
import { syncSpawnForScene } from './syncSpawnFromPrefab';

/** 与 res.json 600–609 对齐的既有关卡 */
export const CHAPTER_MIGRATE_MAP: Array<{
  sceneId: number;
  poolName: string;
}> = [
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

function moveFileKeepMeta(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  if (fs.existsSync(dest)) {
    fs.rmSync(dest, { force: true });
  }
  fs.renameSync(src, dest);
  const srcMeta = `${src}.meta`;
  const destMeta = `${dest}.meta`;
  if (fs.existsSync(srcMeta)) {
    if (fs.existsSync(destMeta)) fs.rmSync(destMeta, { force: true });
    fs.renameSync(srcMeta, destMeta);
  }
}

async function updateResJsonUrl(sceneId: number, poolName: string, prefabRel: string): Promise<void> {
  const p = resJsonFsPath();
  if (!fs.existsSync(p)) return;
  const data = JSON.parse(fs.readFileSync(p, 'utf8')) as {
    param?: unknown;
    prefab?: Record<string, { id?: number; name?: string; url?: string }>;
  };
  if (!data.prefab) data.prefab = {};
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
  } catch {
    /* ignore */
  }
}

function patchSkillDebugBoot(): { ok: boolean; note: string } {
  const bootPath = path.join(
    getProjectRoot(),
    'assets',
    'Scripts',
    'src',
    'skill',
    'debug',
    'SkillDebugBoot.ts'
  );
  if (!fs.existsSync(bootPath)) {
    return { ok: false, note: 'SkillDebugBoot.ts 不存在' };
  }
  let text = fs.readFileSync(bootPath, 'utf8');
  const next = 'scenes/600/Output/600';
  if (text.includes(next)) {
    return { ok: true, note: 'SkillDebugBoot 已是新路径' };
  }
  const replaced = text.replace(
    /const\s+MAP_PREFAB\s*=\s*["']Prefabs\/Chapter01_Level00["']\s*;/,
    `const MAP_PREFAB = "${next}";`
  );
  if (replaced === text) {
    // 宽松替换任意 Prefabs/Chapter01_Level00 字符串常量
    const loose = text.replace(
      /(["'])Prefabs\/Chapter01_Level00\1/g,
      `"${next}"`
    );
    if (loose === text) {
      return { ok: false, note: '未找到 MAP_PREFAB Prefabs/Chapter01_Level00' };
    }
    text = loose;
  } else {
    text = replaced;
  }
  fs.writeFileSync(bootPath, text, 'utf8');
  return { ok: true, note: `SkillDebugBoot MAP_PREFAB → ${next}` };
}

export async function migrateOneChapter(opts: {
  sceneId: number;
  poolName: string;
}): Promise<{ ok: boolean; skipped?: boolean; error?: string; detail?: string }> {
  const { sceneId, poolName } = opts;
  const src = legacyChapterPrefabFs(poolName);
  const destRel = sceneOutputPrefabRel(sceneId);
  const dest = path.join(getProjectRoot(), 'assets', 'resources', `${destRel}.prefab`);
  const folderFs = sceneFolderFsPath(sceneId);

  // 已迁移：目标存在且源不存在
  if (fs.existsSync(dest) && !fs.existsSync(src)) {
    return { ok: true, skipped: true, detail: '已在目标路径' };
  }
  if (!fs.existsSync(src) && !fs.existsSync(dest)) {
    return { ok: false, error: `源 Prefab 不存在: Prefabs/${poolName}.prefab` };
  }

  ensureDir(scenesFsRoot());
  await ensureAssetFolder(sceneFolderDbUrl(sceneId), folderFs);
  await ensureAssetFolder(`${sceneFolderDbUrl(sceneId)}/Res`, sceneResFsPath(sceneId));
  await ensureAssetFolder(`${sceneFolderDbUrl(sceneId)}/Output`, sceneOutputFsPath(sceneId));

  if (fs.existsSync(src)) {
    const srcDb = `db://assets/resources/Prefabs/${poolName}.prefab`;
    const destDb = `db://assets/resources/${destRel}.prefab`;
    let moved = false;
    // Cocos 3.8：move-asset(source, target)
    try {
      await Editor.Message.request('asset-db', 'move-asset', srcDb, destDb);
      moved = fs.existsSync(dest) || !fs.existsSync(src);
    } catch {
      /* try object form / fs */
    }
    if (!moved && fs.existsSync(src)) {
      try {
        moveFileKeepMeta(src, dest);
        try {
          await Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/resources/Prefabs');
          await Editor.Message.request('asset-db', 'refresh-asset', sceneFolderDbUrl(sceneId));
        } catch {
          /* ignore */
        }
      } catch (e) {
        return { ok: false, error: `移动 Prefab 失败: ${e}` };
      }
    }
  }

  if (!fs.existsSync(dest)) {
    return { ok: false, error: `迁移后目标不存在: ${destRel}.prefab` };
  }

  const index: SceneIndexJSON = {
    sceneId,
    name: poolName,
    category: categoryFromPoolName(poolName),
    prefab: destRel,
    poolName,
    description: `迁移自 Prefabs/${poolName}`,
    resId: sceneId,
  };
  const okIndex = await writeTextAsset(indexDbUrl(sceneId), JSON.stringify(index, null, 2));
  if (!okIndex) return { ok: false, error: '写入 index.json 失败' };

  const logicFs = path.join(folderFs, 'logic', String(sceneId), 'index.json');
  if (!fs.existsSync(logicFs)) {
    await createLogicSceneAssets({
      logicId: sceneId,
      assetsSceneId: sceneId,
      name: `${poolName} 逻辑`,
      category: index.category,
    });
  }

  await updateResJsonUrl(sceneId, poolName, destRel);

  const sync = await syncSpawnForScene(sceneId);
  const syncNote = sync.ok
    ? `刷怪点 ${sync.spawnCount}`
    : `刷怪同步跳过: ${sync.error}`;

  try {
    await Editor.Message.request('asset-db', 'refresh-asset', sceneFolderDbUrl(sceneId));
  } catch {
    /* ignore */
  }

  return { ok: true, detail: `${poolName} → ${destRel}（${syncNote}）` };
}

export async function migrateAllChapters(): Promise<{
  ok: number;
  fail: number;
  skipped: number;
  lines: string[];
  skillDebug?: string;
}> {
  let ok = 0;
  let fail = 0;
  let skipped = 0;
  const lines: string[] = [];

  for (const row of CHAPTER_MIGRATE_MAP) {
    const r = await migrateOneChapter(row);
    if (r.ok && r.skipped) {
      skipped++;
      lines.push(`[SKIP] ${row.sceneId} ${row.poolName}: ${r.detail}`);
    } else if (r.ok) {
      ok++;
      lines.push(`[OK] ${row.sceneId} ${r.detail}`);
    } else {
      fail++;
      lines.push(`[FAIL] ${row.sceneId} ${row.poolName}: ${r.error}`);
    }
  }

  const boot = patchSkillDebugBoot();
  lines.push(`[SkillDebug] ${boot.note}`);

  return { ok, fail, skipped, lines, skillDebug: boot.note };
}
