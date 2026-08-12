"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeFilterConfig = void 0;
class NodeFilterConfig {
    constructor(json) {
        var _a;
        this.allowAll = (_a = json === null || json === void 0 ? void 0 : json.allowAll) !== null && _a !== void 0 ? _a : true;
        this.whitelist = (json === null || json === void 0 ? void 0 : json.whitelist) ? [...json.whitelist] : [];
        this.blacklist = (json === null || json === void 0 ? void 0 : json.blacklist) ? [...json.blacklist] : [];
    }
    isAllowed(typeName) {
        if (this.blacklist.includes(typeName))
            return false;
        if (this.allowAll)
            return true;
        // allowAll:false + empty whitelist is almost always a broken/stale profile
        // (e.g. new skill scaffold); treat as open so the creator is usable.
        if (this.whitelist.length === 0)
            return true;
        return this.whitelist.includes(typeName);
    }
    toJSON() {
        return {
            allowAll: this.allowAll,
            whitelist: [...this.whitelist],
            blacklist: [...this.blacklist],
        };
    }
    static fromJSON(json) {
        return new NodeFilterConfig(json);
    }
}
exports.NodeFilterConfig = NodeFilterConfig;
//# sourceMappingURL=NodeFilterConfig.js.map