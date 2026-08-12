import { listLocalEffects } from './browseEffects';

export interface EffectCategoryListItem {
  categoryId: number;
  name: string;
  unitCount: number;
  subtitle?: string;
}

export function listLocalEffectCategories(): EffectCategoryListItem[] {
  const map = new Map<string, number>();
  for (const e of listLocalEffects()) {
    const cat = e.category || 'uncategorized';
    map.set(cat, (map.get(cat) || 0) + 1);
  }
  const names = [...map.keys()].sort((a, b) => a.localeCompare(b, 'zh'));
  return names.map((name, i) => ({
    categoryId: i + 1,
    name,
    unitCount: map.get(name) || 0,
    subtitle: `${map.get(name) || 0} 个特效`,
  }));
}
