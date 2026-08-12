"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listLocalUnitCategories = listLocalUnitCategories;
const browseUnits_1 = require("./browseUnits");
function listLocalUnitCategories() {
    const map = new Map();
    for (const u of (0, browseUnits_1.listLocalUnits)()) {
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
//# sourceMappingURL=browseCategories.js.map