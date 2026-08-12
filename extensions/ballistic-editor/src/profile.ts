import { BUILTIN_WHITELIST, ballisticNodeTypeNames } from './nodes/ballisticNodes';

export interface GraphProfileJSON {
  name?: string;
  useLightTheme?: boolean;
  nodeFilter?: {
    allowAll?: boolean;
    whitelist?: string[];
    blacklist?: string[];
  };
}

export function buildBallisticGraphProfile(): GraphProfileJSON {
  return {
    name: 'ballistic',
    useLightTheme: false,
    nodeFilter: {
      allowAll: false,
      whitelist: [...ballisticNodeTypeNames(), ...BUILTIN_WHITELIST],
      blacklist: [],
    },
  };
}
