"use strict";
/** Minimal graph JSON shapes (mirrors node-graph serialization). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.genId = genId;
function genId(prefix) {
    return `${prefix}_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-4)}`;
}
//# sourceMappingURL=graphTypes.js.map