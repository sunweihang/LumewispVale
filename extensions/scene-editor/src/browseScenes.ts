import * as fs from 'fs';
import * as path from 'path';
import {
  SceneIndexJSON,
  prefabFsPath,
  scenesFsRoot,
} from './paths';

export interface SceneListItem extends SceneIndexJSON {
  hasPrefab: boolean;
  hasLogic: boolean;
  subtitle?: string;
}

export function listLocalScenes(): SceneListItem[] {
  const root = scenesFsRoot();
  if (!fs.existsSync(root)) return [];

  const items: SceneListItem[] = [];
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const id = Number(name);
    if (!Number.isFinite(id)) continue;

    const indexPath = path.join(dir, 'index.json');
    let index: SceneIndexJSON = {
      sceneId: id,
      name: `Scene ${id}`,
      prefab: `scenes/${id}/Output/${id}`,
      poolName: `Scene_${id}`,
    };
    if (fs.existsSync(indexPath)) {
      try {
        index = { ...index, ...JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
        index.sceneId = id;
      } catch (e) {
        console.warn('[scene-editor] bad index.json', indexPath, e);
      }
    }

    const hasPrefab = !!index.prefab && fs.existsSync(prefabFsPath(index.prefab));
    const logicDir = path.join(dir, 'logic');
    let hasLogic = false;
    if (fs.existsSync(logicDir)) {
      for (const sub of fs.readdirSync(logicDir)) {
        if (fs.existsSync(path.join(logicDir, sub, 'index.json'))) {
          hasLogic = true;
          break;
        }
      }
    }

    items.push({
      ...index,
      hasPrefab,
      hasLogic,
      subtitle: `${index.poolName || ''} · ${index.prefab || '(无 prefab)'}${
        hasPrefab ? '' : index.prefab ? ' · 缺Prefab' : ''
      }${hasLogic ? ' · 有逻辑' : ''}`,
    });
  }

  items.sort((a, b) => a.sceneId - b.sceneId);
  return items;
}
