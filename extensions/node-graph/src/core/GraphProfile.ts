import { NodeFilterConfig, NodeFilterConfigJSON } from './NodeFilterConfig';

export interface GraphProfileJSON {
  name?: string;
  useLightTheme?: boolean;
  nodeFilter?: NodeFilterConfigJSON;
}

export class GraphProfile {
  name: string;
  useLightTheme: boolean;
  nodeFilter: NodeFilterConfig;

  constructor(json?: GraphProfileJSON) {
    this.name = json?.name ?? 'default';
    this.useLightTheme = json?.useLightTheme ?? false;
    this.nodeFilter = NodeFilterConfig.fromJSON(json?.nodeFilter);
  }

  isNodeAllowed(typeName: string): boolean {
    return this.nodeFilter.isAllowed(typeName);
  }

  toJSON(): GraphProfileJSON {
    return {
      name: this.name,
      useLightTheme: this.useLightTheme,
      nodeFilter: this.nodeFilter.toJSON(),
    };
  }

  static fromJSON(json?: GraphProfileJSON): GraphProfile {
    return new GraphProfile(json);
  }
}
