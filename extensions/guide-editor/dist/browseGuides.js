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
exports.listLocalGuides = listLocalGuides;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const paths_1 = require("./paths");
function listLocalGuides() {
    const root = (0, paths_1.guideGraphsFsRoot)();
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
            guideId: id,
            name: `Guide ${id}`,
            exportFlag: false,
        };
        if (fs.existsSync(indexPath)) {
            try {
                index = { ...index, ...JSON.parse(fs.readFileSync(indexPath, 'utf8')) };
                index.guideId = id;
            }
            catch (e) {
                console.warn('[guide-editor] bad index.json', indexPath, e);
            }
        }
        items.push({
            ...index,
            hasGraph: fs.existsSync(graphPath),
            hasRuntimeClass: fs.existsSync((0, paths_1.generatedClassFsPath)(id)),
        });
    }
    items.sort((a, b) => a.guideId - b.guideId);
    return items;
}
//# sourceMappingURL=browseGuides.js.map