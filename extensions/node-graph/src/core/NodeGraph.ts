import { Connection, ConnectionJSON } from './Connection';
import { GraphProfile, GraphProfileJSON } from './GraphProfile';
import { NodeData, NodeDataJSON } from './NodeData';
import { PortTypeRegistry } from './PortTypeRegistry';

export interface NodeGraphJSON {
  version: number;
  graphId: string;
  profile?: GraphProfileJSON;
  nodes: NodeDataJSON[];
  connections: ConnectionJSON[];
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16).slice(-4)}`;
}

export class NodeGraph {
  graphId: string;
  profile: GraphProfile;
  private _nodes: NodeData[] = [];
  private _connections: Connection[] = [];

  constructor(json?: Partial<NodeGraphJSON>) {
    this.graphId = json?.graphId || genId('graph');
    this.profile = GraphProfile.fromJSON(json?.profile);
    if (json?.nodes) {
      this._nodes = json.nodes.map((n) => NodeData.fromJSON(n));
    }
    if (json?.connections) {
      this._connections = json.connections.map((c) => Connection.fromJSON(c));
    }
  }

  get nodes(): readonly NodeData[] {
    return this._nodes;
  }

  get connections(): readonly Connection[] {
    return this._connections;
  }

  isNodeAllowed(typeName: string): boolean {
    return this.profile.isNodeAllowed(typeName);
  }

  findNode(id: string): NodeData | null {
    return this._nodes.find((n) => n.id === id) ?? null;
  }

  addNode(node: NodeData): void {
    if (!node.id) node.id = genId('node');
    this._nodes.push(node);
  }

  removeNode(node: NodeData): void {
    this._connections = this._connections.filter(
      (c) => c.fromNodeId !== node.id && c.toNodeId !== node.id
    );
    this._nodes = this._nodes.filter((n) => n.id !== node.id);
  }

  removeNodes(ids: string[]): void {
    const set = new Set(ids);
    this._connections = this._connections.filter(
      (c) => !set.has(c.fromNodeId) && !set.has(c.toNodeId)
    );
    this._nodes = this._nodes.filter((n) => !set.has(n.id));
  }

  addConnection(conn: Connection, allowMultiFlowIn = false): boolean {
    const fromNode = this.findNode(conn.fromNodeId);
    const toNode = this.findNode(conn.toNodeId);
    if (!fromNode || !toNode) return false;
    if (conn.fromPortIndex < 0 || conn.fromPortIndex >= fromNode.outputs.length) return false;
    if (conn.toPortIndex < 0 || conn.toPortIndex >= toNode.inputs.length) return false;
    if (conn.fromNodeId === conn.toNodeId) return false;

    const outType = fromNode.outputs[conn.fromPortIndex].portType;
    const inType = toNode.inputs[conn.toPortIndex].portType;
    if (!PortTypeRegistry.canConnect(outType, inType)) return false;

    for (const c of this._connections) {
      if (c.equals(conn)) return false;
    }

    if (!allowMultiFlowIn) {
      this._connections = this._connections.filter(
        (c) => !(c.toNodeId === conn.toNodeId && c.toPortIndex === conn.toPortIndex)
      );
    }

    this._connections.push(conn);
    return true;
  }

  removeConnection(conn: Connection): void {
    this._connections = this._connections.filter((c) => !c.equals(conn));
  }

  removeConnectionAt(index: number): void {
    if (index >= 0 && index < this._connections.length) {
      this._connections.splice(index, 1);
    }
  }

  getConnectionsForNode(nodeId: string): Connection[] {
    return this._connections.filter((c) => c.fromNodeId === nodeId || c.toNodeId === nodeId);
  }

  toJSON(): NodeGraphJSON {
    return {
      version: 1,
      graphId: this.graphId,
      profile: this.profile.toJSON(),
      nodes: this._nodes.map((n) => n.toJSON()),
      connections: this._connections.map((c) => c.toJSON()),
    };
  }

  static fromJSON(json: NodeGraphJSON | Partial<NodeGraphJSON>): NodeGraph {
    return new NodeGraph(json);
  }

  static createEmpty(profile?: GraphProfileJSON): NodeGraph {
    return new NodeGraph({ profile });
  }

  static generateNodeId(): string {
    return genId('node');
  }
}
