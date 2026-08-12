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
exports.buildEmptySkillGraph = buildEmptySkillGraph;
exports.nextSkillId = nextSkillId;
exports.createSkillAssets = createSkillAssets;
const fs = __importStar(require("fs"));
const assetIo_1 = require("./assetIo");
const skillNodes_1 = require("./nodes/skillNodes");
const paths_1 = require("./paths");
const profile_1 = require("./profile");
const graphTypes_1 = require("./graphTypes");
function entranceDef() {
    return skillNodes_1.SKILL_NODE_DEFS.find((d) => d.typeName === skillNodes_1.ENTRANCE_TYPE);
}
function buildEmptySkillGraph(skillId) {
    var _a, _b, _c, _d;
    const def = entranceDef();
    const nodeId = 'node_entrance';
    return {
        version: 1,
        graphId: `skill_${skillId}`,
        profile: (0, profile_1.buildSkillGraphProfile)(),
        nodes: [
            {
                id: nodeId,
                typeName: def.typeName,
                title: def.title,
                position: { x: 100, y: 80, w: (_a = def.minWidth) !== null && _a !== void 0 ? _a : 220, h: (_b = def.minHeight) !== null && _b !== void 0 ? _b : 320 },
                minWidth: (_c = def.minWidth) !== null && _c !== void 0 ? _c : 220,
                minHeight: (_d = def.minHeight) !== null && _d !== void 0 ? _d : 320,
                inputs: def.inputs.map((p) => ({ ...p })),
                outputs: def.outputs.map((p) => ({ ...p })),
                customData: {},
            },
        ],
        connections: [],
    };
}
function nextSkillId() {
    const root = (0, paths_1.skillGraphsFsRoot)();
    if (!fs.existsSync(root))
        return 9001;
    let max = 9000;
    for (const name of fs.readdirSync(root)) {
        const n = Number(name);
        if (Number.isFinite(n) && n > max)
            max = n;
    }
    return max + 1;
}
async function createSkillAssets(opts) {
    var _a;
    const { skillId, name } = opts;
    if (!Number.isFinite(skillId) || skillId <= 0) {
        return { ok: false, skillId, error: '无效的 skillId' };
    }
    if (fs.existsSync((0, paths_1.indexFsPath)(skillId))) {
        return { ok: false, skillId, error: `技能 ${skillId} 已存在` };
    }
    (0, paths_1.ensureDir)((0, paths_1.skillGraphsFsRoot)());
    (0, paths_1.ensureDir)(`${(0, paths_1.skillGraphsFsRoot)()}/${skillId}`);
    // ensure folder visible to asset-db
    try {
        await Editor.Message.request('asset-db', 'create-asset', (0, paths_1.skillFolderDbUrl)(skillId), null);
    }
    catch {
        /* folder may already exist */
    }
    const index = {
        skillId,
        name: name || `Skill ${skillId}`,
        description: opts.description || '',
        exportFlag: (_a = opts.exportFlag) !== null && _a !== void 0 ? _a : true,
    };
    const graph = buildEmptySkillGraph(skillId);
    // unique graph id
    graph.graphId = (0, graphTypes_1.genId)(`skill_${skillId}`);
    const okIndex = await (0, assetIo_1.writeTextAsset)((0, paths_1.indexDbUrl)(skillId), JSON.stringify(index, null, 2));
    const okGraph = await (0, assetIo_1.writeTextAsset)((0, paths_1.graphDbUrl)(skillId), JSON.stringify(graph, null, 2));
    if (!okIndex || !okGraph) {
        return { ok: false, skillId, error: `写入失败 index=${okIndex} graph=${okGraph}` };
    }
    console.log(`[skill-editor] created skill ${skillId}: ${paths_1.INDEX_FILE_NAME} + ${paths_1.GRAPH_FILE_NAME}`);
    return { ok: true, skillId };
}
//# sourceMappingURL=createSkill.js.map