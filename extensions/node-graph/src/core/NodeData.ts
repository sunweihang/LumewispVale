import { PortData, PortDataJSON } from './PortData';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NodeDataJSON {
  id: string;
  typeName: string;
  title: string;
  position: Rect;
  minWidth: number;
  minHeight: number;
  inputs: PortDataJSON[];
  outputs: PortDataJSON[];
  customData: Record<string, unknown>;
}

export class NodeData {
  id: string;
  typeName: string;
  title: string;
  position: Rect;
  minWidth: number;
  minHeight: number;
  inputs: PortData[];
  outputs: PortData[];
  customData: Record<string, unknown>;

  constructor(partial?: Partial<NodeDataJSON> & { id?: string; typeName?: string }) {
    this.id = partial?.id ?? '';
    this.typeName = partial?.typeName ?? '';
    this.title = partial?.title ?? '';
    this.position = partial?.position
      ? { ...partial.position }
      : { x: 0, y: 0, w: 180, h: 80 };
    this.minWidth = partial?.minWidth ?? 160;
    this.minHeight = partial?.minHeight ?? 64;
    this.inputs = (partial?.inputs ?? []).map((p) => PortData.fromJSON(p));
    this.outputs = (partial?.outputs ?? []).map((p) => PortData.fromJSON(p));
    this.customData = partial?.customData ? { ...partial.customData } : {};
  }

  clone(newId?: string): NodeData {
    const n = new NodeData({
      id: newId ?? this.id,
      typeName: this.typeName,
      title: this.title,
      position: { ...this.position },
      minWidth: this.minWidth,
      minHeight: this.minHeight,
      inputs: this.inputs.map((p) => p.toJSON()),
      outputs: this.outputs.map((p) => p.toJSON()),
      customData: JSON.parse(JSON.stringify(this.customData)),
    });
    return n;
  }

  toJSON(): NodeDataJSON {
    return {
      id: this.id,
      typeName: this.typeName,
      title: this.title,
      position: { ...this.position },
      minWidth: this.minWidth,
      minHeight: this.minHeight,
      inputs: this.inputs.map((p) => p.toJSON()),
      outputs: this.outputs.map((p) => p.toJSON()),
      customData: JSON.parse(JSON.stringify(this.customData)),
    };
  }

  static fromJSON(json: NodeDataJSON): NodeData {
    return new NodeData(json);
  }
}
