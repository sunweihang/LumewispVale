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
exports.findSkillsUsingBallistic = findSkillsUsingBallistic;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const paths_1 = require("./paths");
/** 扫描技能图中「发射子弹」对弹道模板 Id 的引用（字段或自定义数据）。 */
function findSkillsUsingBallistic(ballisticId) {
    var _a, _b;
    const root = (0, paths_1.skillGraphsFsRoot)();
    if (!fs.existsSync(root))
        return [];
    const hits = [];
    for (const name of fs.readdirSync(root)) {
        const dir = path.join(root, name);
        if (!fs.statSync(dir).isDirectory())
            continue;
        const skillId = Number(name);
        if (!Number.isFinite(skillId))
            continue;
        let skillName = `Skill ${skillId}`;
        const indexPath = path.join(dir, 'index.json');
        if (fs.existsSync(indexPath)) {
            try {
                const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
                if (idx.name)
                    skillName = idx.name;
            }
            catch {
                /* ignore */
            }
        }
        const graphPath = path.join(dir, 'graph.graph.json');
        if (!fs.existsSync(graphPath))
            continue;
        try {
            const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
            for (const n of graph.nodes || []) {
                if (n.typeName !== 'BallisticFireBulletBlueprint' &&
                    n.typeName !== 'FireProjectileBlueprint') {
                    continue;
                }
                const cd = n.customData || {};
                const tid = Number((_b = (_a = cd.ballisticTemplate) !== null && _a !== void 0 ? _a : cd.templateId) !== null && _b !== void 0 ? _b : 0);
                if (tid === ballisticId) {
                    hits.push({ skillId, skillName, nodeId: n.id, typeName: n.typeName });
                }
            }
        }
        catch (e) {
            console.warn('[ballistic-editor] scan skill graph failed', graphPath, e);
        }
    }
    return hits;
}
//# sourceMappingURL=findSkillsUsingBallistic.js.map