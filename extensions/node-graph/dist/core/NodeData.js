"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeData = void 0;
const PortData_1 = require("./PortData");
class NodeData {
    constructor(partial) {
        var _a, _b, _c, _d, _e, _f, _g;
        this.id = (_a = partial === null || partial === void 0 ? void 0 : partial.id) !== null && _a !== void 0 ? _a : '';
        this.typeName = (_b = partial === null || partial === void 0 ? void 0 : partial.typeName) !== null && _b !== void 0 ? _b : '';
        this.title = (_c = partial === null || partial === void 0 ? void 0 : partial.title) !== null && _c !== void 0 ? _c : '';
        this.position = (partial === null || partial === void 0 ? void 0 : partial.position)
            ? { ...partial.position }
            : { x: 0, y: 0, w: 180, h: 80 };
        this.minWidth = (_d = partial === null || partial === void 0 ? void 0 : partial.minWidth) !== null && _d !== void 0 ? _d : 160;
        this.minHeight = (_e = partial === null || partial === void 0 ? void 0 : partial.minHeight) !== null && _e !== void 0 ? _e : 64;
        this.inputs = ((_f = partial === null || partial === void 0 ? void 0 : partial.inputs) !== null && _f !== void 0 ? _f : []).map((p) => PortData_1.PortData.fromJSON(p));
        this.outputs = ((_g = partial === null || partial === void 0 ? void 0 : partial.outputs) !== null && _g !== void 0 ? _g : []).map((p) => PortData_1.PortData.fromJSON(p));
        this.customData = (partial === null || partial === void 0 ? void 0 : partial.customData) ? { ...partial.customData } : {};
    }
    clone(newId) {
        const n = new NodeData({
            id: newId !== null && newId !== void 0 ? newId : this.id,
            typeName: this.typeName,
            title: this.title,
            position: { ...this.position },
            minWidth: this.minWidth,
            minHeight: this.minHeight,
            inputs: this.inputs.map((p) => p.toJSON()),
            outputs: this.outputs.map((p) => p.toJSON()),
            customData: JSON.parse(JSON.stringify(this.customData)),
        });
        return n;
    }
    toJSON() {
        return {
            id: this.id,
            typeName: this.typeName,
            title: this.title,
            position: { ...this.position },
            minWidth: this.minWidth,
            minHeight: this.minHeight,
            inputs: this.inputs.map((p) => p.toJSON()),
            outputs: this.outputs.map((p) => p.toJSON()),
            customData: JSON.parse(JSON.stringify(this.customData)),
        };
    }
    static fromJSON(json) {
        return new NodeData(json);
    }
}
exports.NodeData = NodeData;
//# sourceMappingURL=NodeData.js.map