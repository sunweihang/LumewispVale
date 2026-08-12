import { listLocalUnits } from './browseUnits';

export interface UnitCategoryListItem {
  categoryId: number;
  name: string;
  unitCount: number;
  subtitle?: string;
}

export function listLocalUnitCategories(): UnitCategoryListItem[] {
  const map = new Map<string, number>();
  for (const u of listLocalUnits()) {
    const cat = u.category || 'uncategorized';
    map.set(cat, (map.get(cat) || 0) + 1);
  }
  const names = [...map.keys()].sort((a, b) => a.localeCompare(b, 'zh'));
  return names.map((name, i) => ({
    categoryId: i + 1,
    name,
    unitCount: map.get(name) || 0,
    subtitle: `${map.get(name) || 0} 个单位`,
  }));
}
