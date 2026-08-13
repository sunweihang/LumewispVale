"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLifecycleSpecs = getLifecycleSpecs;
const guideNodes_1 = require("../nodes/guideNodes");
function getLifecycleSpecs() {
    return guideNodes_1.ENTRANCE_LIFECYCLE_PORTS.map((p, i) => ({
        portIndex: i,
        portName: p.name,
        methodName: p.method,
        params: p.params || '',
        alwaysEmit: !!p.alwaysEmit,
        async: p.async !== false,
    }));
}
//# sourceMappingURL=lifecycle.js.map