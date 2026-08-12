import { BUILTIN_WHITELIST, storyNodeTypeNames } from './nodes/storyNodes';

export interface GraphProfileJSON {
  name?: string;
  useLightTheme?: boolean;
  nodeFilter?: {
    allowAll?: boolean;
    whitelist?: string[];
    blacklist?: string[];
  };
}

export function buildStoryGraphProfile(): GraphProfileJSON {
  return {
    name: 'story',
    useLightTheme: false,
    nodeFilter: {
      allowAll: false,
      whitelist: [...storyNodeTypeNames(), ...BUILTIN_WHITELIST],
      blacklist: [],
    },
  };
}
