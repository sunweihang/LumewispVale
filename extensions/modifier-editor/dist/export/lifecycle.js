"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLifecycleSpecs = getLifecycleSpecs;
const modifierNodes_1 = require("../nodes/modifierNodes");
function getLifecycleSpecs() {
    return modifierNodes_1.ENTRANCE_LIFECYCLE_PORTS.map((p, i) => ({
        portIndex: i,
        portName: p.name,
        methodName: p.method,
        params: p.params || '',
        alwaysEmit: !!p.alwaysEmit,
    }));
}
//# sourceMappingURL=lifecycle.js.map