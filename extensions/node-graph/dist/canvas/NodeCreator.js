"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterNodeDefs = filterNodeDefs;
exports.groupByCategory = groupByCategory;
function filterNodeDefs(defs, profile, query) {
    const q = query.trim().toLowerCase();
    const items = [];
    for (const def of defs) {
        if (!profile.isNodeAllowed(def.typeName))
            continue;
        const label = `${def.category}/${def.title}`;
        if (!q ||
            def.title.toLowerCase().includes(q) ||
            def.typeName.toLowerCase().includes(q) ||
            def.category.toLowerCase().includes(q) ||
            label.toLowerCase().includes(q)) {
            items.push({ def, label });
        }
    }
    items.sort((a, b) => a.label.localeCompare(b.label));
    return items;
}
function groupByCategory(items) {
    const map = new Map();
    for (const item of items) {
        const cat = item.def.category || 'Other';
        if (!map.has(cat))
            map.set(cat, []);
        map.get(cat).push(item);
    }
    return map;
}
//# sourceMappingURL=NodeCreator.js.map