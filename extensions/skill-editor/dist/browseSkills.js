"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listLocalSkills = listLocalSkills;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const paths_1 = require("./paths");
const tbAbilityTable_1 = require("./tbAbilityTable");
function listLocalSkills() {
    const root = (0, paths_1.skillGraphsFsRoot)();
    if (!fs.existsSync(root))
        return [];
    const items = [];
    for (const name of fs.readdirSync(root)) {
        const dir = path.join(root, name);
        if (!fs.statSync(dir).isDirectory())
            continue;
        const id = Number(name);
        if (!Number.isFinite(id))
            continue;
        const indexPath = path.join(dir, 'index.json');
        const graphPath = path.join(dir, 'graph.graph.json');
        let index = {
            skillId: id,
            name: `Skill ${id}`,
            exportFlag: false,
        };
        if (fs.existsSync(indexPath)) {
            try {
                index = { ...index, ...JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
                index.skillId = id;
            }
            catch (e) {
                console.warn('[skill-editor] bad index.json', indexPath, e);
            }
        }
        const abilityRow = (0, tbAbilityTable_1.findTbAbilityRowForGraphId)(id);
        items.push({
            ...index,
            hasGraph: fs.existsSync(graphPath),
            inTbAbility: !!abilityRow,
            abilityRowId: abilityRow === null || abilityRow === void 0 ? void 0 : abilityRow.id,
            abilityTemplete: abilityRow === null || abilityRow === void 0 ? void 0 : abilityRow.templete,
            tbAbilityHint: (0, tbAbilityTable_1.formatTbAbilityHint)(id),
        });
    }
    items.sort((a, b) => a.skillId - b.skillId);
    return items;
}
//# sourceMappingURL=browseSkills.js.map