import * as fs from 'fs';
import * as path from 'path';
import { ModifierIndexJSON, generatedClassFsPath, modifierGraphsFsRoot } from './paths';

export interface ModifierListItem extends ModifierIndexJSON {
  hasGraph: boolean;
  hasRuntimeClass: boolean;
}

export function listLocalModifiers(): ModifierListItem[] {
  const root = modifierGraphsFsRoot();
  if (!fs.existsSync(root)) return [];

  const items: ModifierListItem[] = [];
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const id = Number(name);
    if (!Number.isFinite(id)) continue;

    const indexPath = path.join(dir, 'index.json');
    const graphPath = path.join(dir, 'graph.graph.json');
    let index: ModifierIndexJSON = {
      modifierId: id,
      name: `Buff ${id}`,
      exportFlag: false,
    };
    if (fs.existsSync(indexPath)) {
      try {
        index = { ...index, ...JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
        index.modifierId = id;
      } catch (e) {
        console.warn('[modifier-editor] bad index.json', indexPath, e);
      }
    }
    items.push({
      ...index,
      hasGraph: fs.existsSync(graphPath),
      hasRuntimeClass: fs.existsSync(generatedClassFsPath(id)),
    });
  }

  items.sort((a, b) => a.modifierId - b.modifierId);
  return items;
}
