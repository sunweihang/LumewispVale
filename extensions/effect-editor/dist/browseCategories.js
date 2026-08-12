"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listLocalEffectCategories = listLocalEffectCategories;
const browseEffects_1 = require("./browseEffects");
function listLocalEffectCategories() {
    const map = new Map();
    for (const e of (0, browseEffects_1.listLocalEffects)()) {
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
//# sourceMappingURL=browseCategories.js.map