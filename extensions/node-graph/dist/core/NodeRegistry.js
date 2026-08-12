"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeRegistry = void 0;
const NodeData_1 = require("./NodeData");
const PortData_1 = require("./PortData");
class NodeRegistry {
    static register(def) {
        this._defs.set(def.typeName, def);
    }
    static registerMany(defs) {
        for (const d of defs)
            this.register(d);
    }
    static unregister(typeNames) {
        for (const t of typeNames)
            this._defs.delete(t);
    }
    static get(typeName) {
        return this._defs.get(typeName);
    }
    static list() {
        return [...this._defs.values()];
    }
    static createNode(typeName, id, x = 0, y = 0) {
        var _a, _b, _c, _d, _e;
        const def = this._defs.get(typeName);
        if (!def)
            return null;
        const node = new NodeData_1.NodeData({
            id,
            typeName: def.typeName,
            title: def.title,
            position: {
                x,
                y,
                w: (_a = def.minWidth) !== null && _a !== void 0 ? _a : 180,
                h: (_b = def.minHeight) !== null && _b !== void 0 ? _b : 80,
            },
            minWidth: (_c = def.minWidth) !== null && _c !== void 0 ? _c : 160,
            minHeight: (_d = def.minHeight) !== null && _d !== void 0 ? _d : 64,
            customData: {},
        });
        node.inputs = def.inputs.map((p) => new PortData_1.PortData(p.name, p.portType));
        node.outputs = def.outputs.map((p) => new PortData_1.PortData(p.name, p.portType));
        if (def.fields) {
            for (const f of def.fields) {
                if (node.customData[f.key] === undefined && f.default !== undefined) {
                    node.customData[f.key] = f.default;
                }
            }
        }
        (_e = def.setup) === null || _e === void 0 ? void 0 : _e.call(def, node);
        return node;
    }
    static toJSONList() {
        return this.list().map((d) => ({
            typeName: d.typeName,
            title: d.title,
            category: d.category,
            color: d.color,
            inputs: d.inputs.map((p) => ({ ...p })),
            outputs: d.outputs.map((p) => ({ ...p })),
            fields: d.fields ? d.fields.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })) : undefined,
            minWidth: d.minWidth,
            minHeight: d.minHeight,
        }));
    }
}
exports.NodeRegistry = NodeRegistry;
NodeRegistry._defs = new Map();
//# sourceMappingURL=NodeRegistry.js.map