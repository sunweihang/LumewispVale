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
exports.buildEmptyModifierGraph = buildEmptyModifierGraph;
exports.nextModifierId = nextModifierId;
exports.createModifierAssets = createModifierAssets;
const fs = __importStar(require("fs"));
const assetIo_1 = require("./assetIo");
const browseModifiers_1 = require("./browseModifiers");
const graphTypes_1 = require("./graphTypes");
const modifierNodes_1 = require("./nodes/modifierNodes");
const paths_1 = require("./paths");
const profile_1 = require("./profile");
function entranceDef() {
    return (0, modifierNodes_1.findModifierNodeDef)(modifierNodes_1.ENTRANCE_TYPE);
}
function buildEmptyModifierGraph(modifierId) {
    var _a, _b, _c, _d;
    const def = entranceDef();
    return {
        version: 1,
        graphId: `modifier_${modifierId}`,
        profile: (0, profile_1.buildModifierGraphProfile)(),
        nodes: [
            {
                id: 'node_entrance',
                typeName: def.typeName,
                title: def.title,
                position: { x: 100, y: 80, w: (_a = def.minWidth) !== null && _a !== void 0 ? _a : 200, h: (_b = def.minHeight) !== null && _b !== void 0 ? _b : 140 },
                minWidth: (_c = def.minWidth) !== null && _c !== void 0 ? _c : 200,
                minHeight: (_d = def.minHeight) !== null && _d !== void 0 ? _d : 140,
                inputs: def.inputs.map((p) => ({ ...p })),
                outputs: def.outputs.map((p) => ({ ...p })),
                customData: {},
            },
        ],
        connections: [],
    };
}
function nextModifierId() {
    const items = (0, browseModifiers_1.listLocalModifiers)();
    if (items.length === 0)
        return 200000001;
    return Math.max(...items.map((i) => i.modifierId)) + 1;
}
async function createModifierAssets(opts) {
    var _a;
    const { modifierId, name } = opts;
    if (!Number.isFinite(modifierId) || modifierId <= 0) {
        return { ok: false, modifierId, error: '无效的 modifierId' };
    }
    if (fs.existsSync((0, paths_1.indexFsPath)(modifierId))) {
        return { ok: false, modifierId, error: `Buff ${modifierId} 已存在` };
    }
    (0, paths_1.ensureDir)((0, paths_1.modifierGraphsFsRoot)());
    (0, paths_1.ensureDir)(`${(0, paths_1.modifierGraphsFsRoot)()}/${modifierId}`);
    try {
        await Editor.Message.request('asset-db', 'create-asset', (0, paths_1.modifierFolderDbUrl)(modifierId), null);
    }
    catch {
        /* folder may already exist */
    }
    const index = {
        modifierId,
        name: name || `Buff ${modifierId}`,
        description: opts.description || '',
        category: opts.category || '',
        exportFlag: (_a = opts.exportFlag) !== null && _a !== void 0 ? _a : true,
    };
    const graph = buildEmptyModifierGraph(modifierId);
    graph.graphId = (0, graphTypes_1.genId)(`modifier_${modifierId}`);
    const okIndex = await (0, assetIo_1.writeTextAsset)((0, paths_1.indexDbUrl)(modifierId), JSON.stringify(index, null, 2));
    const okGraph = await (0, assetIo_1.writeTextAsset)((0, paths_1.graphDbUrl)(modifierId), JSON.stringify(graph, null, 2));
    if (!okIndex || !okGraph) {
        return { ok: false, modifierId, error: `写入失败 index=${okIndex} graph=${okGraph}` };
    }
    console.log(`[modifier-editor] created ${modifierId}: ${paths_1.INDEX_FILE_NAME} + ${paths_1.GRAPH_FILE_NAME}`);
    return { ok: true, modifierId };
}
//# sourceMappingURL=createModifier.js.map