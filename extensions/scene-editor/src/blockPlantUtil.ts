/**
 * 阻挡种植：格子 ↔ AABB 互转（编辑器与保存共用）。
 */

export type CellXZ = { cx: number; cz: number };
export type Vec3Like = { x: number; y: number; z: number };
export type AabbLike = { min: Vec3Like; max: Vec3Like };

/** 默认半格：墙体多为非整数坐标/非 1 厚，1 格会对不齐 */
export const DEFAULT_BLOCK_CELL_SIZE = 0.5;
export const DEFAULT_BLOCK_Y_MIN = 0;
export const DEFAULT_BLOCK_Y_MAX = 4;

export function cellKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function parseCellKey(key: string): CellXZ | null {
  const i = key.indexOf(',');
  if (i < 0) return null;
  const cx = Number(key.slice(0, i));
  const cz = Number(key.slice(i + 1));
  if (!Number.isFinite(cx) || !Number.isFinite(cz)) return null;
  return { cx, cz };
}

export function worldToCell(
  x: number,
  z: number,
  cellSize: number,
  originX = 0,
  originZ = 0
): CellXZ {
  const s = cellSize > 1e-6 ? cellSize : DEFAULT_BLOCK_CELL_SIZE;
  return {
    cx: Math.floor((x - originX) / s),
    cz: Math.floor((z - originZ) / s),
  };
}

export function cellToWorldCenter(
  cx: number,
  cz: number,
  cellSize: number,
  originX = 0,
  originZ = 0
): { x: number; y: number; z: number } {
  const s = cellSize > 1e-6 ? cellSize : DEFAULT_BLOCK_CELL_SIZE;
  return {
    x: originX + (cx + 0.5) * s,
    y: (DEFAULT_BLOCK_Y_MIN + DEFAULT_BLOCK_Y_MAX) * 0.5,
    z: originZ + (cz + 0.5) * s,
  };
}

/**
 * 笔刷：半径 = 方形边长（格）。
 * 1 → 1×1；2 → 2×2；3 → 3×3。以光标格为中心铺开（偶数边长略偏 +X/+Z）。
 */
export function stampBrushCells(
  cells: Set<string>,
  centerCx: number,
  centerCz: number,
  brushRadius: number,
  erase: boolean
): void {
  const size = Math.max(1, Math.floor(brushRadius));
  const start = -Math.floor((size - 1) / 2);
  const end = start + size - 1;
  for (let dz = start; dz <= end; dz++) {
    for (let dx = start; dx <= end; dx++) {
      const key = cellKey(centerCx + dx, centerCz + dz);
      if (erase) cells.delete(key);
      else cells.add(key);
    }
  }
}

/** 将单个世界 AABB（XZ）覆盖到格子集合 */
export function stampAabbToCells(
  cells: Set<string>,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
  cellSize: number,
  originX = 0,
  originZ = 0
): void {
  const s = cellSize > 1e-6 ? cellSize : DEFAULT_BLOCK_CELL_SIZE;
  const loX = Math.min(minX, maxX);
  const hiX = Math.max(minX, maxX);
  const loZ = Math.min(minZ, maxZ);
  const hiZ = Math.max(minZ, maxZ);
  const cx0 = Math.floor((loX - originX) / s);
  const cx1 = Math.floor((hiX - originX - 1e-6) / s);
  const cz0 = Math.floor((loZ - originZ) / s);
  const cz1 = Math.floor((hiZ - originZ - 1e-6) / s);
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      cells.add(cellKey(cx, cz));
    }
  }
}

/** AABB 栅格化回格子集合 */
export function aabbsToCells(
  aabbs: AabbLike[],
  cellSize: number,
  originX = 0,
  originZ = 0
): Set<string> {
  const out = new Set<string>();
  for (const box of aabbs || []) {
    if (!box?.min || !box?.max) continue;
    stampAabbToCells(
      out,
      box.min.x,
      box.max.x,
      box.min.z,
      box.max.z,
      cellSize,
      originX,
      originZ
    );
  }
  return out;
}

/**
 * 相邻格子贪婪合并为尽量少的 XZ AABB。
 * Y 取固定高度区间，供可视化与线段扫掠。
 */
export function cellsToAabbs(
  cells: Iterable<string>,
  cellSize: number,
  originX = 0,
  originZ = 0,
  yMin = DEFAULT_BLOCK_Y_MIN,
  yMax = DEFAULT_BLOCK_Y_MAX
): AabbLike[] {
  const s = cellSize > 1e-6 ? cellSize : DEFAULT_BLOCK_CELL_SIZE;
  const set = new Set<string>();
  for (const k of cells) set.add(k);
  if (set.size === 0) return [];

  const visited = new Set<string>();
  const aabbs: AabbLike[] = [];

  const sorted = [...set]
    .map((k) => parseCellKey(k))
    .filter((c): c is CellXZ => !!c)
    .sort((a, b) => (a.cz !== b.cz ? a.cz - b.cz : a.cx - b.cx));

  for (const start of sorted) {
    const startKey = cellKey(start.cx, start.cz);
    if (visited.has(startKey) || !set.has(startKey)) continue;

    // 横向扩展
    let width = 1;
    while (set.has(cellKey(start.cx + width, start.cz)) && !visited.has(cellKey(start.cx + width, start.cz))) {
      width++;
    }
    // 纵向扩展（整行宽必须连续）
    let height = 1;
    outer: while (true) {
      for (let dx = 0; dx < width; dx++) {
        const k = cellKey(start.cx + dx, start.cz + height);
        if (!set.has(k) || visited.has(k)) break outer;
      }
      height++;
    }

    for (let dz = 0; dz < height; dz++) {
      for (let dx = 0; dx < width; dx++) {
        visited.add(cellKey(start.cx + dx, start.cz + dz));
      }
    }

    aabbs.push({
      min: {
        x: originX + start.cx * s,
        y: yMin,
        z: originZ + start.cz * s,
      },
      max: {
        x: originX + (start.cx + width) * s,
        y: yMax,
        z: originZ + (start.cz + height) * s,
      },
    });
  }

  return aabbs;
}
