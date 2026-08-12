import type { NodeDefinition } from '../nodes/types';
import { NodeData } from './NodeData';
import { PortData } from './PortData';

export class NodeRegistry {
  private static _defs = new Map<string, NodeDefinition>();

  static register(def: NodeDefinition): void {
    this._defs.set(def.typeName, def);
  }

  static registerMany(defs: NodeDefinition[]): void {
    for (const d of defs) this.register(d);
  }

  static unregister(typeNames: string[]): void {
    for (const t of typeNames) this._defs.delete(t);
  }

  static get(typeName: string): NodeDefinition | undefined {
    return this._defs.get(typeName);
  }

  static list(): NodeDefinition[] {
    return [...this._defs.values()];
  }

  static createNode(typeName: string, id: string, x = 0, y = 0): NodeData | null {
    const def = this._defs.get(typeName);
    if (!def) return null;

    const node = new NodeData({
      id,
      typeName: def.typeName,
      title: def.title,
      position: {
        x,
        y,
        w: def.minWidth ?? 180,
        h: def.minHeight ?? 80,
      },
      minWidth: def.minWidth ?? 160,
      minHeight: def.minHeight ?? 64,
      customData: {},
    });

    node.inputs = def.inputs.map((p) => new PortData(p.name, p.portType));
    node.outputs = def.outputs.map((p) => new PortData(p.name, p.portType));

    if (def.fields) {
      for (const f of def.fields) {
        if (node.customData[f.key] === undefined && f.default !== undefined) {
          node.customData[f.key] = f.default;
        }
      }
    }

    def.setup?.(node);
    return node;
  }

  static toJSONList(): NodeDefinition[] {
    return this.list().map((d) => ({
      typeName: d.typeName,
      title: d.title,
      category: d.category,
      color: d.color,
      inputs: d.inputs.map((p) => ({ ...p })),
      outputs: d.outputs.map((p) => ({ ...p })),
      fields: d.fields ? d.fields.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })) : undefined,
      minWidth: d.minWidth,
      minHeight: d.minHeight,
    }));
  }
}
