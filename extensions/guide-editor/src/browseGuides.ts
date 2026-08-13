import * as fs from 'fs';
import * as path from 'path';
import { GuideIndexJSON, generatedClassFsPath, guideGraphsFsRoot } from './paths';

export interface GuideListItem extends GuideIndexJSON {
  hasGraph: boolean;
  hasRuntimeClass: boolean;
}

export function listLocalGuides(): GuideListItem[] {
  const root = guideGraphsFsRoot();
  if (!fs.existsSync(root)) return [];

  const items: GuideListItem[] = [];
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const id = Number(name);
    if (!Number.isFinite(id)) continue;

    const indexPath = path.join(dir, 'index.json');
    const graphPath = path.join(dir, 'graph.graph.json');
    let index: GuideIndexJSON = {
      guideId: id,
      name: `Guide ${id}`,
      exportFlag: false,
    };
    if (fs.existsSync(indexPath)) {
      try {
        index = { ...index, ...JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
        index.guideId = id;
      } catch (e) {
        console.warn('[guide-editor] bad index.json', indexPath, e);
      }
    }
    items.push({
      ...index,
      hasGraph: fs.existsSync(graphPath),
      hasRuntimeClass: fs.existsSync(generatedClassFsPath(id)),
    });
  }

  items.sort((a, b) => a.guideId - b.guideId);
  return items;
}
