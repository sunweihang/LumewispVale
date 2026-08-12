/** Minimal graph JSON shapes (mirrors node-graph serialization). */

export interface PortJSON {
  name: string;
  portType: string;
}

export interface RectJSON {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NodeDataJSON {
  id: string;
  typeName: string;
  title: string;
  position: RectJSON;
  minWidth: number;
  minHeight: number;
  inputs: PortJSON[];
  outputs: PortJSON[];
  customData: Record<string, unknown>;
}

export interface ConnectionJSON {
  fromNodeId: string;
  fromPortIndex: number;
  toNodeId: string;
  toPortIndex: number;
}

export interface NodeGraphJSON {
  version: number;
  graphId: string;
  profile?: {
    name?: string;
    useLightTheme?: boolean;
    nodeFilter?: {
      allowAll?: boolean;
      whitelist?: string[];
      blacklist?: string[];
    };
  };
  nodes: NodeDataJSON[];
  connections: ConnectionJSON[];
}

export function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-4)}`;
}
