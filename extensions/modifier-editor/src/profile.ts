import { BUILTIN_WHITELIST, modifierNodeTypeNames } from './nodes/modifierNodes';

export interface GraphProfileJSON {
  name?: string;
  useLightTheme?: boolean;
  nodeFilter?: {
    allowAll?: boolean;
    whitelist?: string[];
    blacklist?: string[];
  };
}

export function buildModifierGraphProfile(): GraphProfileJSON {
  return {
    name: 'modifier',
    useLightTheme: false,
    nodeFilter: {
      allowAll: false,
      whitelist: [...modifierNodeTypeNames(), ...BUILTIN_WHITELIST],
      blacklist: [],
    },
  };
}
