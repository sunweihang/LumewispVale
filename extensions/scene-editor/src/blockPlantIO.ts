import * as fs from 'fs';
import { writeTextAsset } from './assetIo';
import {
  aabbsToCells,
  cellsToAabbs,
  DEFAULT_BLOCK_CELL_SIZE,
  DEFAULT_BLOCK_Y_MAX,
  DEFAULT_BLOCK_Y_MIN,
} from './blockPlantUtil';
import {
  BlockPlantJSON,
  SceneIndexJSON,
  indexDbUrl,
  indexFsPath,
  sceneFolderFsPath,
  ensureDir,
} from './paths';

export function loadResourceSceneIndex(sceneId: number): SceneIndexJSON | null {
  const path = indexFsPath(sceneId);
  if (!fs.existsSync(path)) return null;
  try {
    const index = JSON.parse(fs.readFileSync(path, 'utf8')) as SceneIndexJSON;
    index.sceneId = sceneId;
    return index;
  } catch {
    return null;
  }
}

export function normalizeBlockPlant(raw?: BlockPlantJSON | null): BlockPlantJSON {
  const cellSize =
    raw?.cellSize && raw.cellSize > 1e-6 ? Number(raw.cellSize) : DEFAULT_BLOCK_CELL_SIZE;
  const origin = {
    x: Number(raw?.origin?.x) || 0,
    z: Number(raw?.origin?.z) || 0,
  };
  const aabbs = Array.isArray(raw?.aabbs)
    ? raw!.aabbs
        .filter((b) => b?.min && b?.max)
        .map((b) => ({
          min: {
            x: Number(b.min.x) || 0,
            y: Number.isFinite(Number(b.min.y)) ? Number(b.min.y) : DEFAULT_BLOCK_Y_MIN,
            z: Number(b.min.z) || 0,
          },
          max: {
            x: Number(b.max.x) || 0,
            y: Number.isFinite(Number(b.max.y)) ? Number(b.max.y) : DEFAULT_BLOCK_Y_MAX,
            z: Number(b.max.z) || 0,
          },
        }))
    : [];
  return {
    formatVersion: raw?.formatVersion ?? 1,
    cellSize,
    origin,
    aabbs,
  };
}

/** 从资源 index 取出格子工作集 */
export function blockPlantToCells(blockPlant?: BlockPlantJSON | null): {
  cellSize: number;
  originX: number;
  originZ: number;
  cells: Set<string>;
} {
  const bp = normalizeBlockPlant(blockPlant);
  const cells = aabbsToCells(bp.aabbs, bp.cellSize!, bp.origin!.x, bp.origin!.z);
  return {
    cellSize: bp.cellSize!,
    originX: bp.origin!.x,
    originZ: bp.origin!.z,
    cells,
  };
}

export async function saveResourceBlockPlant(
  sceneId: number,
  blockPlant: BlockPlantJSON
): Promise<{ ok: boolean; error?: string; aabbCount?: number }> {
  const path = indexFsPath(sceneId);
  if (!fs.existsSync(path)) {
    return { ok: false, error: `资源场景 ${sceneId} 的 index.json 不存在` };
  }

  let index: SceneIndexJSON;
  try {
    index = JSON.parse(fs.readFileSync(path, 'utf8')) as SceneIndexJSON;
  } catch (e) {
    return { ok: false, error: `读取失败: ${e}` };
  }

  const normalized = normalizeBlockPlant(blockPlant);
  index.sceneId = sceneId;
  index.blockPlant = {
    formatVersion: 1,
    cellSize: normalized.cellSize,
    origin: normalized.origin,
    aabbs: normalized.aabbs,
  };

  ensureDir(sceneFolderFsPath(sceneId));
  const ok = await writeTextAsset(indexDbUrl(sceneId), JSON.stringify(index, null, 2));
  if (!ok) return { ok: false, error: '写入资源 index 失败' };
  return { ok: true, aabbCount: normalized.aabbs.length };
}

/** 格子集合 → 规范化 blockPlant（合并 AABB） */
export function cellsToBlockPlant(
  cells: Iterable<string>,
  cellSize: number,
  originX = 0,
  originZ = 0
): BlockPlantJSON {
  const s = cellSize > 1e-6 ? cellSize : DEFAULT_BLOCK_CELL_SIZE;
  return {
    formatVersion: 1,
    cellSize: s,
    origin: { x: originX, z: originZ },
    aabbs: cellsToAabbs(cells, s, originX, originZ),
  };
}
