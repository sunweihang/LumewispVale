"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Connection = void 0;
class Connection {
    constructor(fromNodeId, fromPortIndex, toNodeId, toPortIndex) {
        this.fromNodeId = fromNodeId;
        this.fromPortIndex = fromPortIndex;
        this.toNodeId = toNodeId;
        this.toPortIndex = toPortIndex;
    }
    equals(other) {
        return (this.fromNodeId === other.fromNodeId &&
            this.fromPortIndex === other.fromPortIndex &&
            this.toNodeId === other.toNodeId &&
            this.toPortIndex === other.toPortIndex);
    }
    clone() {
        return new Connection(this.fromNodeId, this.fromPortIndex, this.toNodeId, this.toPortIndex);
    }
    toJSON() {
        return {
            fromNodeId: this.fromNodeId,
            fromPortIndex: this.fromPortIndex,
            toNodeId: this.toNodeId,
            toPortIndex: this.toPortIndex,
        };
    }
    static fromJSON(json) {
        return new Connection(json.fromNodeId, json.fromPortIndex, json.toNodeId, json.toPortIndex);
    }
}
exports.Connection = Connection;
//# sourceMappingURL=Connection.js.map