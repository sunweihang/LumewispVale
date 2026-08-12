import * as fs from 'fs';
import * as path from 'path';
import { BallisticIndexJSON, ballisticGraphsFsRoot } from './paths';

export interface BallisticListItem extends BallisticIndexJSON {
  hasGraph: boolean;
}

export function listLocalBallistics(): BallisticListItem[] {
  const root = ballisticGraphsFsRoot();
  if (!fs.existsSync(root)) return [];

  const items: BallisticListItem[] = [];
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const id = Number(name);
    if (!Number.isFinite(id)) continue;

    const indexPath = path.join(dir, 'index.json');
    const graphPath = path.join(dir, 'graph.graph.json');
    let index: BallisticIndexJSON = {
      ballisticId: id,
      name: `Ballistic ${id}`,
      exportFlag: false,
    };
    if (fs.existsSync(indexPath)) {
      try {
        index = { ...index, ...JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
        index.ballisticId = id;
      } catch (e) {
        console.warn('[ballistic-editor] bad index.json', indexPath, e);
      }
    }
    items.push({
      ...index,
      hasGraph: fs.existsSync(graphPath),
    });
  }

  items.sort((a, b) => a.ballisticId - b.ballisticId);
  return items;
}
