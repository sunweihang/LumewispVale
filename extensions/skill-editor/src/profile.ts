import { BUILTIN_WHITELIST, skillNodeTypeNames } from './nodes/skillNodes';

export interface GraphProfileJSON {
  name?: string;
  useLightTheme?: boolean;
  nodeFilter?: {
    allowAll?: boolean;
    whitelist?: string[];
    blacklist?: string[];
  };
}

export function buildSkillGraphProfile(): GraphProfileJSON {
  return {
    name: 'skill',
    useLightTheme: false,
    nodeFilter: {
      allowAll: false,
      whitelist: [...skillNodeTypeNames(), ...BUILTIN_WHITELIST],
      blacklist: [],
    },
  };
}
