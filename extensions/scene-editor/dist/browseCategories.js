"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listLocalSceneCategories = listLocalSceneCategories;
const browseScenes_1 = require("./browseScenes");
function listLocalSceneCategories() {
    const map = new Map();
    for (const s of (0, browseScenes_1.listLocalScenes)()) {
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
//# sourceMappingURL=browseCategories.js.map