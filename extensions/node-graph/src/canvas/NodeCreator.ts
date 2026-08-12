import type { NodeDefinition } from '../nodes/types';
import type { GraphProfile } from '../core/GraphProfile';

export interface NodeCreatorItem {
  def: NodeDefinition;
  label: string;
}

export function filterNodeDefs(
  defs: NodeDefinition[],
  profile: GraphProfile,
  query: string
): NodeCreatorItem[] {
  const q = query.trim().toLowerCase();
  const items: NodeCreatorItem[] = [];
  for (const def of defs) {
    if (!profile.isNodeAllowed(def.typeName)) continue;
    const label = `${def.category}/${def.title}`;
    if (
      !q ||
      def.title.toLowerCase().includes(q) ||
      def.typeName.toLowerCase().includes(q) ||
      def.category.toLowerCase().includes(q) ||
      label.toLowerCase().includes(q)
    ) {
      items.push({ def, label });
    }
  }
  items.sort((a, b) => a.label.localeCompare(b.label));
  return items;
}

export function groupByCategory(items: NodeCreatorItem[]): Map<string, NodeCreatorItem[]> {
  const map = new Map<string, NodeCreatorItem[]>();
  for (const item of items) {
    const cat = item.def.category || 'Other';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(item);
  }
  return map;
}
