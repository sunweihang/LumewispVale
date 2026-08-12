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
exports.syncGraphPortsFromDefs = syncGraphPortsFromDefs;
exports.syncGraphProfileFromDefs = syncGraphProfileFromDefs;
exports.syncStoryGraphOnDisk = syncStoryGraphOnDisk;
const fs = __importStar(require("fs"));
const storyNodes_1 = require("./nodes/storyNodes");
const paths_1 = require("./paths");
const profile_1 = require("./profile");
/**
 * 按当前节点定义刷新图上端口，并按「端口名」重映射连线索引。
 */
function syncGraphPortsFromDefs(graph) {
    let changed = false;
    const defByType = new Map((0, storyNodes_1.allStoryRegisterNodes)().map((d) => [d.typeName, d]));
    for (const node of graph.nodes) {
        const def = defByType.get(node.typeName);
        if (!def)
            continue;
        const oldInNames = node.inputs.map((p) => p.name);
        const oldOutNames = node.outputs.map((p) => p.name);
        const newInNames = def.inputs.map((p) => p.name);
        const newOutNames = def.outputs.map((p) => p.name);
        const portsChanged = oldInNames.join('\0') !== newInNames.join('\0') ||
            oldOutNames.join('\0') !== newOutNames.join('\0') ||
            node.inputs.some((p, i) => { var _a; return p.portType !== ((_a = def.inputs[i]) === null || _a === void 0 ? void 0 : _a.portType); }) ||
            node.outputs.some((p, i) => { var _a; return p.portType !== ((_a = def.outputs[i]) === null || _a === void 0 ? void 0 : _a.portType); });
        if (!portsChanged)
            continue;
        const inMap = buildIndexMap(oldInNames, newInNames);
        const outMap = buildIndexMap(oldOutNames, newOutNames);
        node.inputs = def.inputs.map((p) => ({ name: p.name, portType: p.portType }));
        node.outputs = def.outputs.map((p) => ({ name: p.name, portType: p.portType }));
        if (def.minWidth != null)
            node.minWidth = def.minWidth;
        if (def.minHeight != null)
            node.minHeight = def.minHeight;
        if (def.title)
            node.title = def.title;
        graph.connections = remapConnections(graph.connections, node.id, inMap, outMap);
        changed = true;
    }
    return changed;
}
function buildIndexMap(oldNames, newNames) {
    const map = new Map();
    for (let i = 0; i < oldNames.length; i++) {
        const j = newNames.indexOf(oldNames[i]);
        if (j >= 0)
            map.set(i, j);
    }
    return map;
}
function remapConnections(conns, nodeId, inMap, outMap) {
    const next = [];
    for (const c of conns) {
        let fromPort = c.fromPortIndex;
        let toPort = c.toPortIndex;
        if (c.fromNodeId === nodeId) {
            const mapped = outMap.get(c.fromPortIndex);
            if (mapped == null)
                continue;
            fromPort = mapped;
        }
        if (c.toNodeId === nodeId) {
            const mapped = inMap.get(c.toPortIndex);
            if (mapped == null)
                continue;
            toPort = mapped;
        }
        next.push({ ...c, fromPortIndex: fromPort, toPortIndex: toPort });
    }
    return next;
}
function syncGraphProfileFromDefs(graph) {
    var _a;
    const desired = (0, profile_1.buildStoryGraphProfile)();
    const before = JSON.stringify((_a = graph.profile) !== null && _a !== void 0 ? _a : null);
    graph.profile = {
        name: desired.name,
        useLightTheme: desired.useLightTheme,
        nodeFilter: desired.nodeFilter
            ? {
                allowAll: desired.nodeFilter.allowAll,
                whitelist: desired.nodeFilter.whitelist ? [...desired.nodeFilter.whitelist] : [],
                blacklist: desired.nodeFilter.blacklist ? [...desired.nodeFilter.blacklist] : [],
            }
            : undefined,
    };
    return JSON.stringify(graph.profile) !== before;
}
function syncStoryGraphOnDisk(storyId) {
    const p = (0, paths_1.graphFsPath)(storyId);
    if (!fs.existsSync(p))
        return null;
    let graph;
    try {
        graph = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    catch {
        return null;
    }
    const portsChanged = syncGraphPortsFromDefs(graph);
    const profileChanged = syncGraphProfileFromDefs(graph);
    if (portsChanged || profileChanged) {
        fs.writeFileSync(p, JSON.stringify(graph, null, 2), 'utf8');
    }
    return graph;
}
//# sourceMappingURL=syncStoryGraphPorts.js.map