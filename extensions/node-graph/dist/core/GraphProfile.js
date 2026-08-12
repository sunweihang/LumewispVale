"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GraphProfile = void 0;
const NodeFilterConfig_1 = require("./NodeFilterConfig");
class GraphProfile {
    constructor(json) {
        var _a, _b;
        this.name = (_a = json === null || json === void 0 ? void 0 : json.name) !== null && _a !== void 0 ? _a : 'default';
        this.useLightTheme = (_b = json === null || json === void 0 ? void 0 : json.useLightTheme) !== null && _b !== void 0 ? _b : false;
        this.nodeFilter = NodeFilterConfig_1.NodeFilterConfig.fromJSON(json === null || json === void 0 ? void 0 : json.nodeFilter);
    }
    isNodeAllowed(typeName) {
        return this.nodeFilter.isAllowed(typeName);
    }
    toJSON() {
        return {
            name: this.name,
            useLightTheme: this.useLightTheme,
            nodeFilter: this.nodeFilter.toJSON(),
        };
    }
    static fromJSON(json) {
        return new GraphProfile(json);
    }
}
exports.GraphProfile = GraphProfile;
//# sourceMappingURL=GraphProfile.js.map