"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortData = void 0;
class PortData {
    constructor(name, portType) {
        this.name = name;
        this.portType = portType;
    }
    clone() {
        return new PortData(this.name, this.portType);
    }
    toJSON() {
        return { name: this.name, portType: this.portType };
    }
    static fromJSON(json) {
        return new PortData(json.name, json.portType);
    }
}
exports.PortData = PortData;
//# sourceMappingURL=PortData.js.map