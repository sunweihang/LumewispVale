import type { GraphProfileJSON } from '../core/GraphProfile';
import type { NodeGraphJSON } from '../core/NodeGraph';
import type { NodeDefinition, PortTypeDef } from '../nodes/types';

export interface OpenGraphPayload {
  path?: string;
  graph?: NodeGraphJSON | Partial<NodeGraphJSON>;
  profile?: GraphProfileJSON;
}

export interface RegisterNodesPayload {
  nodes: NodeDefinition[];
}

export interface RegisterPortTypesPayload {
  portTypes: PortTypeDef[];
}

export type UnregisterNodesPayload = string[] | { typeNames: string[] };
