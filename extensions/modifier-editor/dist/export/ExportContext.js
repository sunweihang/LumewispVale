"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExportContext = void 0;
exports.portTypeToTs = portTypeToTs;
const modifierNodes_1 = require("../nodes/modifierNodes");
const FLOW = 'GraphFlow';
function portTypeToTs(portType) {
    switch (portType) {
        case 'float':
        case 'int':
            return 'number';
        case 'bool':
            return 'boolean';
        case 'string':
        case 'prefab':
            return 'string';
        case 'entity':
            return 'Node | null';
        case 'entityList':
            return 'Node[]';
        case 'vec3':
            return 'Vec3';
        case 'modifier':
            return 'AbsModifier | null';
        default:
            return 'unknown';
    }
}
class ExportContext {
    constructor(graph, modifierId) {
        this.visitedNodes = [];
        this.dataVariables = new Map();
        this.visitById = new Map();
        this.graph = graph;
        this.modifierId = modifierId;
    }
    findEntrance() {
        var _a;
        return (_a = this.graph.nodes.find((n) => n.typeName === modifierNodes_1.ENTRANCE_TYPE)) !== null && _a !== void 0 ? _a : null;
    }
    collectReachable(entrance) {
        const queue = [];
        const seen = new Set();
        // seed: flow successors from entrance
        for (let i = 0; i < entrance.outputs.length; i++) {
            for (const c of this.outConns(entrance.id, i)) {
                if (!seen.has(c.toNodeId)) {
                    seen.add(c.toNodeId);
                    queue.push(c.toNodeId);
                }
            }
        }
        while (queue.length > 0) {
            const id = queue.shift();
            const node = this.findNode(id);
            if (!node || node.typeName === modifierNodes_1.ENTRANCE_TYPE)
                continue;
            if (!this.visitById.has(id)) {
                const index = this.visitedNodes.length;
                const info = {
                    node,
                    index,
                    methodName: `${node.typeName}_${index}`,
                };
                this.visitedNodes.push(info);
                this.visitById.set(id, info);
                this.registerDataOutputs(node, index);
            }
            // flow downstream
            for (let i = 0; i < node.outputs.length; i++) {
                if (node.outputs[i].portType !== FLOW)
                    continue;
                for (const c of this.outConns(node.id, i)) {
                    if (!seen.has(c.toNodeId)) {
                        seen.add(c.toNodeId);
                        queue.push(c.toNodeId);
                    }
                }
            }
            // data upstream producers
            for (let i = 0; i < node.inputs.length; i++) {
                if (node.inputs[i].portType === FLOW)
                    continue;
                for (const c of this.inConns(node.id, i)) {
                    const from = this.findNode(c.fromNodeId);
                    if (!from || from.typeName === modifierNodes_1.ENTRANCE_TYPE)
                        continue;
                    if (!seen.has(from.id)) {
                        seen.add(from.id);
                        queue.push(from.id);
                    }
                }
            }
        }
    }
    registerDataOutputs(node, visitIndex) {
        let dataOut = 0;
        for (let i = 0; i < node.outputs.length; i++) {
            if (node.outputs[i].portType === FLOW)
                continue;
            const key = `${node.id}_${i}`;
            const fieldName = `data${node.typeName}_${visitIndex}_${dataOut}`;
            this.dataVariables.set(key, {
                tsType: portTypeToTs(node.outputs[i].portType),
                fieldName,
                nodeId: node.id,
                outPortIndex: i,
            });
            dataOut++;
        }
    }
    getVisit(nodeId) {
        return this.visitById.get(nodeId);
    }
    findNode(id) {
        var _a;
        return (_a = this.graph.nodes.find((n) => n.id === id)) !== null && _a !== void 0 ? _a : null;
    }
    outConns(nodeId, fromPortIndex) {
        return this.graph.connections.filter((c) => c.fromNodeId === nodeId && c.fromPortIndex === fromPortIndex);
    }
    inConns(nodeId, toPortIndex) {
        return this.graph.connections.filter((c) => c.toNodeId === nodeId && c.toPortIndex === toPortIndex);
    }
    /** Data-port ordinal (skipping Flow) -> connected expression or default. */
    resolveDataInputExpr(node, dataInIndex) {
        let di = 0;
        for (let i = 0; i < node.inputs.length; i++) {
            if (node.inputs[i].portType === FLOW)
                continue;
            if (di === dataInIndex) {
                const conns = this.inConns(node.id, i);
                if (conns.length === 0) {
                    return defaultLiteral(node.inputs[i].portType);
                }
                const c = conns[0];
                const key = `${c.fromNodeId}_${c.fromPortIndex}`;
                const v = this.dataVariables.get(key);
                if (v)
                    return `this.${v.fieldName}`;
                // const node producing via field
                const from = this.findNode(c.fromNodeId);
                if (from) {
                    const lit = constNodeLiteral(from, c.fromPortIndex);
                    if (lit != null)
                        return lit;
                }
                return defaultLiteral(node.inputs[i].portType);
            }
            di++;
        }
        return 'undefined as any';
    }
    resolveDataOutputField(node, dataOutIndex) {
        let dout = 0;
        for (let i = 0; i < node.outputs.length; i++) {
            if (node.outputs[i].portType === FLOW)
                continue;
            if (dout === dataOutIndex) {
                const v = this.dataVariables.get(`${node.id}_${i}`);
                return v ? `this.${v.fieldName}` : '_unused';
            }
            dout++;
        }
        return '_unused';
    }
    getFlowCallsFromEntrance(portIndex) {
        const entrance = this.findEntrance();
        if (!entrance)
            return [];
        return this.formatFlowCallLines(entrance.id, portIndex);
    }
    formatFlowCalls(nodeId, flowOutIndex, indent = '        ') {
        const lines = this.formatFlowCallLines(nodeId, flowOutIndex);
        if (lines.length === 0)
            return '';
        return lines.map((l) => indent + l).join('\n') + '\n';
    }
    formatFlowCallLines(nodeId, absoluteOutPortIndex) {
        // convert absolute out index to flow-ordinal for matching? We use absolute port index.
        const conns = this.outConns(nodeId, absoluteOutPortIndex);
        const lines = [];
        for (const c of conns) {
            const visit = this.getVisit(c.toNodeId);
            if (!visit)
                continue;
            // data prelude: ensure data-only upstream of callee executed
            lines.push(...this.dataPreludeLines(visit.node));
            lines.push(`this.${visit.methodName}();`);
        }
        return lines;
    }
    /** Absolute Flow output port index by flow ordinal k. */
    flowOutAbsoluteIndex(node, flowOrdinal) {
        let f = 0;
        for (let i = 0; i < node.outputs.length; i++) {
            if (node.outputs[i].portType !== FLOW)
                continue;
            if (f === flowOrdinal)
                return i;
            f++;
        }
        return -1;
    }
    dataPreludeLines(node) {
        const lines = [];
        const need = new Set();
        for (let i = 0; i < node.inputs.length; i++) {
            if (node.inputs[i].portType === FLOW)
                continue;
            for (const c of this.inConns(node.id, i)) {
                const from = this.findNode(c.fromNodeId);
                if (!from || from.typeName === modifierNodes_1.ENTRANCE_TYPE)
                    continue;
                // 已有 Flow 前序连到本节点时，由 Flow 链执行，避免 FloatConst 等自递归
                if (this.hasFlowEdge(from.id, node.id))
                    continue;
                // Const / data producers: call before consumer even if they also have 前序.
                // (Flow-in may be unused when only the data pin is wired.)
                const hasFlowIn = from.inputs.some((p) => p.portType === FLOW);
                const constLike = isConstLike(from.typeName);
                if (!hasFlowIn || constLike) {
                    need.add(from.id);
                }
            }
        }
        for (const id of need) {
            const v = this.getVisit(id);
            if (v)
                lines.push(`this.${v.methodName}();`);
        }
        return lines;
    }
    /** from → to 是否存在任意 Flow 出边 */
    hasFlowEdge(fromId, toId) {
        const from = this.findNode(fromId);
        if (!from)
            return false;
        for (let i = 0; i < from.outputs.length; i++) {
            if (from.outputs[i].portType !== FLOW)
                continue;
            if (this.outConns(fromId, i).some((c) => c.toNodeId === toId))
                return true;
        }
        return false;
    }
    buildNodePlaceholders(info) {
        const node = info.node;
        const ph = {
            METHOD_NAME: info.methodName,
            TYPE_NAME: node.typeName,
        };
        // INNER from definition defaults + customData
        const fields = {};
        const def = (0, modifierNodes_1.findModifierNodeDef)(node.typeName);
        if (def === null || def === void 0 ? void 0 : def.fields) {
            for (const f of def.fields) {
                if (f.default !== undefined)
                    fields[f.key] = f.default;
            }
        }
        // builtin const defaults
        if (node.typeName === 'FloatConst' || node.typeName === 'BoolConst' || node.typeName === 'StringConst') {
            if (fields.value === undefined) {
                fields.value = node.typeName === 'BoolConst' ? true : node.typeName === 'StringConst' ? '' : 0;
            }
        }
        if (node.typeName === 'DebugLog' || node.typeName === 'AbilityDebugLog') {
            if (fields.message === undefined)
                fields.message = 'log';
        }
        Object.assign(fields, node.customData || {});
        for (const [k, v] of Object.entries(fields)) {
            ph[`INNER_${k}`] = literal(v);
        }
        ph.INNER = Object.entries(fields)
            .map(([k, v]) => `const ${k} = ${literal(v)};`)
            .join('\n        ');
        let dataIn = 0;
        for (let i = 0; i < node.inputs.length; i++) {
            if (node.inputs[i].portType === FLOW)
                continue;
            ph[`IN_${dataIn}`] = this.resolveDataInputExpr(node, dataIn);
            dataIn++;
        }
        let dataOut = 0;
        for (let i = 0; i < node.outputs.length; i++) {
            if (node.outputs[i].portType === FLOW)
                continue;
            ph[`OUT_${dataOut}`] = this.resolveDataOutputField(node, dataOut);
            dataOut++;
        }
        let flowK = 0;
        for (let i = 0; i < node.outputs.length; i++) {
            if (node.outputs[i].portType !== FLOW)
                continue;
            ph[`FLOW_${flowK}`] = this.formatFlowCalls(node.id, i, '        ');
            flowK++;
        }
        return ph;
    }
}
exports.ExportContext = ExportContext;
function defaultLiteral(portType) {
    switch (portType) {
        case 'float':
        case 'int':
            return '0';
        case 'bool':
            return 'false';
        case 'string':
        case 'prefab':
            return "''";
        case 'entityList':
            return '[]';
        case 'vec3':
            return 'new Vec3()';
        case 'entity':
            return 'null';
        case 'modifier':
            return 'null';
        default:
            return 'null as any';
    }
}
function literal(v) {
    if (typeof v === 'string')
        return JSON.stringify(v);
    if (typeof v === 'number' || typeof v === 'boolean')
        return String(v);
    if (v == null)
        return 'null as any';
    return JSON.stringify(v);
}
function isConstLike(typeName) {
    return (typeName === 'FloatConst' ||
        typeName === 'BoolConst' ||
        typeName === 'StringConst' ||
        typeName === 'GetSkillLevel' ||
        typeName === 'GetConfigNumber');
}
function constNodeLiteral(node, outPortIndex) {
    if (node.typeName === 'FloatConst' || node.typeName === 'BoolConst' || node.typeName === 'StringConst') {
        const port = node.outputs[outPortIndex];
        if (port && port.portType !== FLOW && 'value' in (node.customData || {})) {
            return literal(node.customData.value);
        }
    }
    return null;
}
//# sourceMappingURL=ExportContext.js.map