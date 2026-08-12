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
exports.tbAbilityJsonFsPath = tbAbilityJsonFsPath;
exports.loadTbAbilityRows = loadTbAbilityRows;
exports.findTbAbilityRowForGraphId = findTbAbilityRowForGraphId;
exports.formatTbAbilityHint = formatTbAbilityHint;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const paths_1 = require("./paths");
function tbAbilityJsonFsPath() {
    return path.join((0, paths_1.getProjectRoot)(), 'assets', 'resources', 'config', 'luban', 'tbability.json');
}
function loadTbAbilityRows() {
    const p = tbAbilityJsonFsPath();
    if (!fs.existsSync(p))
        return [];
    try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        return Array.isArray(raw) ? raw : [];
    }
    catch (e) {
        console.warn('[skill-editor] bad tbability.json', p, e);
        return [];
    }
}
/** 图 skillId 是否已挂表：行 id 或 templete 命中。 */
function findTbAbilityRowForGraphId(graphId) {
    if (!graphId)
        return null;
    const rows = loadTbAbilityRows();
    for (const r of rows) {
        if (r.id === graphId || r.templete === graphId)
            return r;
    }
    return null;
}
function formatTbAbilityHint(graphId) {
    const row = findTbAbilityRowForGraphId(graphId);
    if (!row)
        return '仅有图、未入 TbAbility';
    return `已挂表 id=${row.id} templete=${row.templete}`;
}
//# sourceMappingURL=tbAbilityTable.js.map