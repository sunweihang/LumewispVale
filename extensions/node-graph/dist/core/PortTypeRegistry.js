"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortTypeRegistry = void 0;
class PortTypeRegistry {
    static ensureInit() {
        if (this._inited)
            return;
        this._inited = true;
        this.registerBuiltin(this.Any, '#ffffff');
        this.registerBuiltin(this.Float, '#33ff33');
        this.registerBuiltin(this.Int, '#26d973');
        this.registerBuiltin(this.Bool, '#ff8080');
        this.registerBuiltin(this.String, '#66ccff');
        this.registerBuiltin(this.GraphFlow, '#f2f2f2');
        this.addCompatibility(this.Float, this.Int);
        this.addCompatibility(this.Int, this.Float);
    }
    static registerBuiltin(typeName, color, compatibleWith = []) {
        this._types.set(typeName, {
            color,
            compatibleWith: new Set(compatibleWith),
        });
    }
    static register(def) {
        var _a, _b;
        this.ensureInit();
        const existing = this._types.get(def.typeName);
        const set = new Set((_b = (_a = def.compatibleWith) !== null && _a !== void 0 ? _a : existing === null || existing === void 0 ? void 0 : existing.compatibleWith) !== null && _b !== void 0 ? _b : []);
        this._types.set(def.typeName, { color: def.color, compatibleWith: set });
    }
    static registerMany(defs) {
        for (const d of defs)
            this.register(d);
    }
    static addCompatibility(a, b) {
        this.ensureInit();
        let info = this._types.get(a);
        if (!info) {
            info = { color: '#cccccc', compatibleWith: new Set() };
            this._types.set(a, info);
        }
        info.compatibleWith.add(b);
    }
    static getColor(typeName) {
        var _a, _b;
        this.ensureInit();
        return (_b = (_a = this._types.get(typeName)) === null || _a === void 0 ? void 0 : _a.color) !== null && _b !== void 0 ? _b : '#aaaaaa';
    }
    static has(typeName) {
        this.ensureInit();
        return this._types.has(typeName);
    }
    static list() {
        this.ensureInit();
        const out = [];
        for (const [typeName, info] of this._types) {
            out.push({
                typeName,
                color: info.color,
                compatibleWith: [...info.compatibleWith],
            });
        }
        return out;
    }
    /**
     * GraphFlow only connects to GraphFlow (never via any).
     * any can connect to non-flow types.
     */
    static canConnect(outType, inType) {
        this.ensureInit();
        if (outType === this.GraphFlow || inType === this.GraphFlow) {
            return outType === this.GraphFlow && inType === this.GraphFlow;
        }
        if (outType === inType)
            return true;
        if (outType === this.Any || inType === this.Any)
            return true;
        const outInfo = this._types.get(outType);
        if (outInfo === null || outInfo === void 0 ? void 0 : outInfo.compatibleWith.has(inType))
            return true;
        const inInfo = this._types.get(inType);
        if (inInfo === null || inInfo === void 0 ? void 0 : inInfo.compatibleWith.has(outType))
            return true;
        return false;
    }
}
exports.PortTypeRegistry = PortTypeRegistry;
PortTypeRegistry.Any = 'any';
PortTypeRegistry.Float = 'float';
PortTypeRegistry.Int = 'int';
PortTypeRegistry.Bool = 'bool';
PortTypeRegistry.String = 'string';
PortTypeRegistry.GraphFlow = 'GraphFlow';
PortTypeRegistry._types = new Map();
PortTypeRegistry._inited = false;
//# sourceMappingURL=PortTypeRegistry.js.map