import { BUILTIN_WHITELIST, guideNodeTypeNames } from './nodes/guideNodes';

export interface GraphProfileJSON {
  name?: string;
  useLightTheme?: boolean;
  nodeFilter?: {
    allowAll?: boolean;
    whitelist?: string[];
    blacklist?: string[];
  };
}

export function buildGuideGraphProfile(): GraphProfileJSON {
  return {
    name: 'guide',
    useLightTheme: false,
    nodeFilter: {
      allowAll: false,
      whitelist: [...guideNodeTypeNames(), ...BUILTIN_WHITELIST],
      blacklist: [],
    },
  };
}
