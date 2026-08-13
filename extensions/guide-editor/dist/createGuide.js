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
exports.buildEmptyStoryGraph = buildEmptyStoryGraph;
exports.nextGuideId = nextGuideId;
exports.createGuideAssets = createGuideAssets;
const fs = __importStar(require("fs"));
const assetIo_1 = require("./assetIo");
const browseGuides_1 = require("./browseGuides");
const graphTypes_1 = require("./graphTypes");
const guideNodes_1 = require("./nodes/guideNodes");
const paths_1 = require("./paths");
const profile_1 = require("./profile");
function entranceDef() {
    return (0, guideNodes_1.findGuideNodeDef)(guideNodes_1.ENTRANCE_TYPE);
}
function buildEmptyStoryGraph(guideId) {
    var _a, _b, _c, _d;
    const def = entranceDef();
    return {
        version: 1,
        graphId: `guide_${guideId}`,
        profile: (0, profile_1.buildGuideGraphProfile)(),
        nodes: [
            {
                id: 'node_entrance',
                typeName: def.typeName,
                title: def.title,
                position: { x: 100, y: 80, w: (_a = def.minWidth) !== null && _a !== void 0 ? _a : 220, h: (_b = def.minHeight) !== null && _b !== void 0 ? _b : 180 },
                minWidth: (_c = def.minWidth) !== null && _c !== void 0 ? _c : 220,
                minHeight: (_d = def.minHeight) !== null && _d !== void 0 ? _d : 180,
                inputs: def.inputs.map((p) => ({ ...p })),
                outputs: def.outputs.map((p) => ({ ...p })),
                customData: {},
            },
        ],
        connections: [],
    };
}
function nextGuideId() {
    const items = (0, browseGuides_1.listLocalGuides)();
    if (items.length === 0)
        return 2;
    return Math.max(...items.map((i) => i.guideId)) + 1;
}
async function createGuideAssets(opts) {
    var _a;
    const { guideId, name } = opts;
    if (!Number.isFinite(guideId) || guideId <= 0) {
        return { ok: false, guideId, error: '无效的 guideId' };
    }
    if (fs.existsSync((0, paths_1.indexFsPath)(guideId))) {
        return { ok: false, guideId, error: `引导 ${guideId} 已存在` };
    }
    (0, paths_1.ensureDir)((0, paths_1.guideGraphsFsRoot)());
    (0, paths_1.ensureDir)(`${(0, paths_1.guideGraphsFsRoot)()}/${guideId}`);
    try {
        await Editor.Message.request('asset-db', 'create-asset', (0, paths_1.guideFolderDbUrl)(guideId), null);
    }
    catch {
        /* folder may already exist */
    }
    const index = {
        guideId,
        name: name || `Guide ${guideId}`,
        description: opts.description || '',
        category: opts.category || '',
        exportFlag: (_a = opts.exportFlag) !== null && _a !== void 0 ? _a : true,
    };
    const graph = buildEmptyStoryGraph(guideId);
    graph.graphId = (0, graphTypes_1.genId)(`guide_${guideId}`);
    const okIndex = await (0, assetIo_1.writeTextAsset)((0, paths_1.indexDbUrl)(guideId), JSON.stringify(index, null, 2));
    const okGraph = await (0, assetIo_1.writeTextAsset)((0, paths_1.graphDbUrl)(guideId), JSON.stringify(graph, null, 2));
    if (!okIndex || !okGraph) {
        return { ok: false, guideId, error: `写入失败 index=${okIndex} graph=${okGraph}` };
    }
    console.log(`[guide-editor] created ${guideId}: ${paths_1.INDEX_FILE_NAME} + ${paths_1.GRAPH_FILE_NAME}`);
    return { ok: true, guideId };
}
//# sourceMappingURL=createGuide.js.map