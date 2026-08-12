"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeGraph = void 0;
const Connection_1 = require("./Connection");
const GraphProfile_1 = require("./GraphProfile");
const NodeData_1 = require("./NodeData");
const PortTypeRegistry_1 = require("./PortTypeRegistry");
function genId(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-4)}`;
}
class NodeGraph {
    constructor(json) {
        this._nodes = [];
        this._connections = [];
        this.graphId = (json === null || json === void 0 ? void 0 : json.graphId) || genId('graph');
        this.profile = GraphProfile_1.GraphProfile.fromJSON(json === null || json === void 0 ? void 0 : json.profile);
        if (json === null || json === void 0 ? void 0 : json.nodes) {
            this._nodes = json.nodes.map((n) => NodeData_1.NodeData.fromJSON(n));
        }
        if (json === null || json === void 0 ? void 0 : json.connections) {
            this._connections = json.connections.map((c) => Connection_1.Connection.fromJSON(c));
        }
    }
    get nodes() {
        return this._nodes;
    }
    get connections() {
        return this._connections;
    }
    isNodeAllowed(typeName) {
        return this.profile.isNodeAllowed(typeName);
    }
    findNode(id) {
        var _a;
        return (_a = this._nodes.find((n) => n.id === id)) !== null && _a !== void 0 ? _a : null;
    }
    addNode(node) {
        if (!node.id)
            node.id = genId('node');
        this._nodes.push(node);
    }
    removeNode(node) {
        this._connections = this._connections.filter((c) => c.fromNodeId !== node.id && c.toNodeId !== node.id);
        this._nodes = this._nodes.filter((n) => n.id !== node.id);
    }
    removeNodes(ids) {
        const set = new Set(ids);
        this._connections = this._connections.filter((c) => !set.has(c.fromNodeId) && !set.has(c.toNodeId));
        this._nodes = this._nodes.filter((n) => !set.has(n.id));
    }
    addConnection(conn, allowMultiFlowIn = false) {
        const fromNode = this.findNode(conn.fromNodeId);
        const toNode = this.findNode(conn.toNodeId);
        if (!fromNode || !toNode)
            return false;
        if (conn.fromPortIndex < 0 || conn.fromPortIndex >= fromNode.outputs.length)
            return false;
        if (conn.toPortIndex < 0 || conn.toPortIndex >= toNode.inputs.length)
            return false;
        if (conn.fromNodeId === conn.toNodeId)
            return false;
        const outType = fromNode.outputs[conn.fromPortIndex].portType;
        const inType = toNode.inputs[conn.toPortIndex].portType;
        if (!PortTypeRegistry_1.PortTypeRegistry.canConnect(outType, inType))
            return false;
        for (const c of this._connections) {
            if (c.equals(conn))
                return false;
        }
        if (!allowMultiFlowIn) {
            this._connections = this._connections.filter((c) => !(c.toNodeId === conn.toNodeId && c.toPortIndex === conn.toPortIndex));
        }
        this._connections.push(conn);
        return true;
    }
    removeConnection(conn) {
        this._connections = this._connections.filter((c) => !c.equals(conn));
    }
    removeConnectionAt(index) {
        if (index >= 0 && index < this._connections.length) {
            this._connections.splice(index, 1);
        }
    }
    getConnectionsForNode(nodeId) {
        return this._connections.filter((c) => c.fromNodeId === nodeId || c.toNodeId === nodeId);
    }
    toJSON() {
        return {
            version: 1,
            graphId: this.graphId,
            profile: this.profile.toJSON(),
            nodes: this._nodes.map((n) => n.toJSON()),
            connections: this._connections.map((c) => c.toJSON()),
        };
    }
    static fromJSON(json) {
        return new NodeGraph(json);
    }
    static createEmpty(profile) {
        return new NodeGraph({ profile });
    }
    static generateNodeId() {
        return genId('node');
    }
}
exports.NodeGraph = NodeGraph;
//# sourceMappingURL=NodeGraph.js.map