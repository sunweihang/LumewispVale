import { listLocalScenes } from './browseScenes';

export interface SceneCategoryListItem {
  categoryId: number;
  name: string;
  unitCount: number;
  subtitle?: string;
}

export function listLocalSceneCategories(): SceneCategoryListItem[] {
  const map = new Map<string, number>();
  for (const s of listLocalScenes()) {
    const cat = s.category || 'uncategorized';
    map.set(cat, (map.get(cat) || 0) + 1);
  }
  const names = [...map.keys()].sort((a, b) => a.localeCompare(b, 'zh'));
  return names.map((name, i) => ({
    categoryId: i + 1,
    name,
    unitCount: map.get(name) || 0,
    subtitle: `${map.get(name) || 0} 个场景`,
  }));
}
