import * as fs from 'fs';
import * as path from 'path';
import { EffectIndexJSON, effectsFsRoot, prefabFsPath } from './paths';

export interface EffectListItem extends EffectIndexJSON {
  hasPrefab: boolean;
  subtitle?: string;
}

export function listLocalEffects(): EffectListItem[] {
  const root = effectsFsRoot();
  if (!fs.existsSync(root)) return [];

  const items: EffectListItem[] = [];
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const id = Number(name);
    if (!Number.isFinite(id)) continue;

    const indexPath = path.join(dir, 'index.json');
    let index: EffectIndexJSON = {
      effectId: id,
      name: `Effect ${id}`,
      prefab: `effects/${id}/Output/${id}`,
      poolName: `Effect_${id}`,
    };
    if (fs.existsSync(indexPath)) {
      try {
        index = { ...index, ...JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
        index.effectId = id;
      } catch (e) {
        console.warn('[effect-editor] bad index.json', indexPath, e);
      }
    }

    const hasPrefab = !!index.prefab && fs.existsSync(prefabFsPath(index.prefab));
    items.push({
      ...index,
      hasPrefab,
      subtitle: `${index.poolName || ''} · ${index.prefab || '(无 prefab)'}${
        hasPrefab ? '' : index.prefab ? ' · 缺Prefab' : ''
      }`,
    });
  }

  items.sort((a, b) => a.effectId - b.effectId);
  return items;
}
