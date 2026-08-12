'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
const NodeRegistry_1 = require("./core/NodeRegistry");
const PortTypeRegistry_1 = require("./core/PortTypeRegistry");
const builtins_1 = require("./nodes/builtins");
const PKG = 'node-graph';
let pendingOpen = null;
let panelReady = false;
function ensureBuiltins() {
    PortTypeRegistry_1.PortTypeRegistry.ensureInit();
    if (!NodeRegistry_1.NodeRegistry.get('FlowStart')) {
        NodeRegistry_1.NodeRegistry.registerMany(builtins_1.BUILTIN_NODES);
    }
}
async function ensurePanelOpen() {
    Editor.Panel.open(PKG);
    // wait briefly for panel ready
    for (let i = 0; i < 40; i++) {
        if (panelReady)
            return;
        await new Promise((r) => setTimeout(r, 50));
    }
}
async function pushToPanel(payload) {
    await ensurePanelOpen();
    await Editor.Message.request(PKG, 'load-into-panel', payload);
}
exports.methods = {
    openPanel() {
        ensureBuiltins();
        Editor.Panel.open(PKG);
    },
    async openSandbox() {
        ensureBuiltins();
        pendingOpen = { graph: (0, builtins_1.createSandboxGraphJSON)() };
        await pushToPanel(pendingOpen);
        pendingOpen = null;
    },
    async openGraph(payload = {}) {
        ensureBuiltins();
        pendingOpen = payload || {};
        await pushToPanel(pendingOpen);
        pendingOpen = null;
    },
    registerNodes(arg) {
        var _a;
        ensureBuiltins();
        const nodes = Array.isArray(arg) ? arg : (_a = arg === null || arg === void 0 ? void 0 : arg.nodes) !== null && _a !== void 0 ? _a : [];
        NodeRegistry_1.NodeRegistry.registerMany(nodes);
        Editor.Message.send(PKG, 'panel-refresh-registry');
        return { ok: true, count: nodes.length };
    },
    registerPortTypes(arg) {
        var _a;
        ensureBuiltins();
        const portTypes = Array.isArray(arg) ? arg : (_a = arg === null || arg === void 0 ? void 0 : arg.portTypes) !== null && _a !== void 0 ? _a : [];
        PortTypeRegistry_1.PortTypeRegistry.registerMany(portTypes);
        Editor.Message.send(PKG, 'panel-refresh-registry');
        return { ok: true, count: portTypes.length };
    },
    unregisterNodes(arg) {
        var _a;
        const typeNames = Array.isArray(arg) ? arg : (_a = arg === null || arg === void 0 ? void 0 : arg.typeNames) !== null && _a !== void 0 ? _a : [];
        NodeRegistry_1.NodeRegistry.unregister(typeNames);
        Editor.Message.send(PKG, 'panel-refresh-registry');
        return { ok: true, count: typeNames.length };
    },
    queryNodeDefs() {
        ensureBuiltins();
        return NodeRegistry_1.NodeRegistry.toJSONList();
    },
    queryPortTypes() {
        ensureBuiltins();
        return PortTypeRegistry_1.PortTypeRegistry.list();
    },
    onPanelReady() {
        panelReady = true;
        ensureBuiltins();
        if (pendingOpen) {
            const p = pendingOpen;
            pendingOpen = null;
            Editor.Message.send(PKG, 'load-into-panel', p);
        }
        return {
            nodes: NodeRegistry_1.NodeRegistry.toJSONList(),
            portTypes: PortTypeRegistry_1.PortTypeRegistry.list(),
        };
    },
    onPanelClosed() {
        panelReady = false;
    },
    async getGraph() {
        return Editor.Message.request(PKG, 'panel-get-graph');
    },
    async setGraph(graph) {
        return Editor.Message.request(PKG, 'panel-set-graph', { graph });
    },
    async saveGraph(arg) {
        return Editor.Message.request(PKG, 'panel-save-graph', arg || {});
    },
};
function load() {
    ensureBuiltins();
    console.log('[node-graph] extension loaded');
}
function unload() {
    panelReady = false;
    console.log('[node-graph] extension unloaded');
}
//# sourceMappingURL=main.js.map