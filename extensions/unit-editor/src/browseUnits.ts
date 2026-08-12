import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_COLLISION_RADIUS,
  UnitIndexJSON,
  prefabFsPath,
  unitsFsRoot,
} from './paths';

export interface UnitListItem extends UnitIndexJSON {
  hasPrefab: boolean;
  subtitle?: string;
}

export function listLocalUnits(): UnitListItem[] {
  const root = unitsFsRoot();
  if (!fs.existsSync(root)) return [];

  const items: UnitListItem[] = [];
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const id = Number(name);
    if (!Number.isFinite(id)) continue;

    const indexPath = path.join(dir, 'index.json');
    let index: UnitIndexJSON = {
      unitId: id,
      name: `Unit ${id}`,
      prefab: '',
    };
    if (fs.existsSync(indexPath)) {
      try {
        index = { ...index, ...JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
        index.unitId = id;
      } catch (e) {
        console.warn('[unit-editor] bad index.json', indexPath, e);
      }
    }

    const hasPrefab = !!index.prefab && fs.existsSync(prefabFsPath(index.prefab));
    const radius = index.collisionRadius ?? DEFAULT_COLLISION_RADIUS;
    items.push({
      ...index,
      hasPrefab,
      // 分类单独展示；subtitle 放路径/碰撞半径/状态
      subtitle: `${index.prefab || '(无 prefab)'} · 碰撞R=${radius.toFixed(2)}${
        hasPrefab ? '' : index.prefab ? ' · 缺Prefab' : ''
      }`,
    });
  }

  items.sort((a, b) => a.unitId - b.unitId);
  return items;
}
