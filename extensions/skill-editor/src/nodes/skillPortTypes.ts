export interface PortTypeDef {
  typeName: string;
  color: string;
  compatibleWith?: string[];
}

export const SKILL_PORT_TYPES: PortTypeDef[] = [
  { typeName: 'entity', color: '#e67e22' },
  { typeName: 'entityList', color: '#d35400' },
  { typeName: 'vec3', color: '#1abc9c' },
  { typeName: 'prefab', color: '#9b59b6' },
];
