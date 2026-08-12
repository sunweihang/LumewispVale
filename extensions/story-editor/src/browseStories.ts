import * as fs from 'fs';
import * as path from 'path';
import { StoryIndexJSON, generatedClassFsPath, storyGraphsFsRoot } from './paths';

export interface StoryListItem extends StoryIndexJSON {
  hasGraph: boolean;
  hasRuntimeClass: boolean;
}

export function listLocalStories(): StoryListItem[] {
  const root = storyGraphsFsRoot();
  if (!fs.existsSync(root)) return [];

  const items: StoryListItem[] = [];
  for (const name of fs.readdirSync(root)) {
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const id = Number(name);
    if (!Number.isFinite(id)) continue;

    const indexPath = path.join(dir, 'index.json');
    const graphPath = path.join(dir, 'graph.graph.json');
    let index: StoryIndexJSON = {
      storyId: id,
      name: `Story ${id}`,
      exportFlag: false,
    };
    if (fs.existsSync(indexPath)) {
      try {
        index = { ...index, ...JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
        index.storyId = id;
      } catch (e) {
        console.warn('[story-editor] bad index.json', indexPath, e);
      }
    }
    items.push({
      ...index,
      hasGraph: fs.existsSync(graphPath),
      hasRuntimeClass: fs.existsSync(generatedClassFsPath(id)),
    });
  }

  items.sort((a, b) => a.storyId - b.storyId);
  return items;
}
