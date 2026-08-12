import type { PortTypeDef } from '../nodes/types';

export class PortTypeRegistry {
  static readonly Any = 'any';
  static readonly Float = 'float';
  static readonly Int = 'int';
  static readonly Bool = 'bool';
  static readonly String = 'string';
  static readonly GraphFlow = 'GraphFlow';

  private static _types = new Map<string, { color: string; compatibleWith: Set<string> }>();
  private static _inited = false;

  static ensureInit(): void {
    if (this._inited) return;
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

  private static registerBuiltin(typeName: string, color: string, compatibleWith: string[] = []): void {
    this._types.set(typeName, {
      color,
      compatibleWith: new Set(compatibleWith),
    });
  }

  static register(def: PortTypeDef): void {
    this.ensureInit();
    const existing = this._types.get(def.typeName);
    const set = new Set(def.compatibleWith ?? existing?.compatibleWith ?? []);
    this._types.set(def.typeName, { color: def.color, compatibleWith: set });
  }

  static registerMany(defs: PortTypeDef[]): void {
    for (const d of defs) this.register(d);
  }

  static addCompatibility(a: string, b: string): void {
    this.ensureInit();
    let info = this._types.get(a);
    if (!info) {
      info = { color: '#cccccc', compatibleWith: new Set() };
      this._types.set(a, info);
    }
    info.compatibleWith.add(b);
  }

  static getColor(typeName: string): string {
    this.ensureInit();
    return this._types.get(typeName)?.color ?? '#aaaaaa';
  }

  static has(typeName: string): boolean {
    this.ensureInit();
    return this._types.has(typeName);
  }

  static list(): PortTypeDef[] {
    this.ensureInit();
    const out: PortTypeDef[] = [];
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
  static canConnect(outType: string, inType: string): boolean {
    this.ensureInit();
    if (outType === this.GraphFlow || inType === this.GraphFlow) {
      return outType === this.GraphFlow && inType === this.GraphFlow;
    }
    if (outType === inType) return true;
    if (outType === this.Any || inType === this.Any) return true;
    const outInfo = this._types.get(outType);
    if (outInfo?.compatibleWith.has(inType)) return true;
    const inInfo = this._types.get(inType);
    if (inInfo?.compatibleWith.has(outType)) return true;
    return false;
  }
}
