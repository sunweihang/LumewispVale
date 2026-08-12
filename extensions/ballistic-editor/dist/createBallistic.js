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
exports.buildEmptyBallisticGraph = buildEmptyBallisticGraph;
exports.nextBallisticId = nextBallisticId;
exports.createBallisticAssets = createBallisticAssets;
const fs = __importStar(require("fs"));
const assetIo_1 = require("./assetIo");
const ballisticNodes_1 = require("./nodes/ballisticNodes");
const paths_1 = require("./paths");
const profile_1 = require("./profile");
const graphTypes_1 = require("./graphTypes");
function entranceDef() {
    return (0, ballisticNodes_1.findBallisticNodeDef)(ballisticNodes_1.ENTRANCE_TYPE);
}
function buildEmptyBallisticGraph(ballisticId) {
    var _a, _b, _c, _d;
    const def = entranceDef();
    return {
        version: 1,
        graphId: `ballistic_${ballisticId}`,
        profile: (0, profile_1.buildBallisticGraphProfile)(),
        nodes: [
            {
                id: 'node_entrance',
                typeName: def.typeName,
                title: def.title,
                position: { x: 100, y: 80, w: (_a = def.minWidth) !== null && _a !== void 0 ? _a : 200, h: (_b = def.minHeight) !== null && _b !== void 0 ? _b : 160 },
                minWidth: (_c = def.minWidth) !== null && _c !== void 0 ? _c : 200,
                minHeight: (_d = def.minHeight) !== null && _d !== void 0 ? _d : 160,
                inputs: def.inputs.map((p) => ({ ...p })),
                outputs: def.outputs.map((p) => ({ ...p })),
                customData: {},
            },
        ],
        connections: [],
    };
}
/** Unity 弹道 Id 习惯 9 位，从 100000000 起 */
function nextBallisticId() {
    const root = (0, paths_1.ballisticGraphsFsRoot)();
    if (!fs.existsSync(root))
        return 100000000;
    let max = 99999999;
    for (const name of fs.readdirSync(root)) {
        const n = Number(name);
        if (Number.isFinite(n) && n > max)
            max = n;
    }
    return max + 1;
}
async function createBallisticAssets(opts) {
    var _a;
    const { ballisticId, name } = opts;
    if (!Number.isFinite(ballisticId) || ballisticId <= 0) {
        return { ok: false, ballisticId, error: '无效的 ballisticId' };
    }
    if (fs.existsSync((0, paths_1.indexFsPath)(ballisticId))) {
        return { ok: false, ballisticId, error: `弹道 ${ballisticId} 已存在` };
    }
    (0, paths_1.ensureDir)((0, paths_1.ballisticGraphsFsRoot)());
    (0, paths_1.ensureDir)(`${(0, paths_1.ballisticGraphsFsRoot)()}/${ballisticId}`);
    try {
        await Editor.Message.request('asset-db', 'create-asset', (0, paths_1.ballisticFolderDbUrl)(ballisticId), null);
    }
    catch {
        /* folder may already exist */
    }
    const index = {
        ballisticId,
        name: name || `Ballistic ${ballisticId}`,
        description: opts.description || '',
        category: opts.category || '',
        exportFlag: (_a = opts.exportFlag) !== null && _a !== void 0 ? _a : true,
    };
    const graph = buildEmptyBallisticGraph(ballisticId);
    graph.graphId = (0, graphTypes_1.genId)(`ballistic_${ballisticId}`);
    const okIndex = await (0, assetIo_1.writeTextAsset)((0, paths_1.indexDbUrl)(ballisticId), JSON.stringify(index, null, 2));
    const okGraph = await (0, assetIo_1.writeTextAsset)((0, paths_1.graphDbUrl)(ballisticId), JSON.stringify(graph, null, 2));
    if (!okIndex || !okGraph) {
        return { ok: false, ballisticId, error: `写入失败 index=${okIndex} graph=${okGraph}` };
    }
    console.log(`[ballistic-editor] created ballistic ${ballisticId}: ${paths_1.INDEX_FILE_NAME} + ${paths_1.GRAPH_FILE_NAME}`);
    return { ok: true, ballisticId };
}
//# sourceMappingURL=createBallistic.js.map