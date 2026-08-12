import type { NodeData } from '../core/NodeData';

export interface PortDef {
  name: string;
  portType: string;
}

export type FieldType = 'number' | 'int' | 'string' | 'bool' | 'enum';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  default?: unknown;
  options?: { label: string; value: string | number | boolean }[];
  min?: number;
  max?: number;
  step?: number;
}

export interface NodeDefinition {
  typeName: string;
  title: string;
  category: string;
  color?: string;
  inputs: PortDef[];
  outputs: PortDef[];
  fields?: FieldDef[];
  minWidth?: number;
  minHeight?: number;
  setup?(node: NodeData): void;
}

export interface PortTypeDef {
  typeName: string;
  color: string;
  compatibleWith?: string[];
}
