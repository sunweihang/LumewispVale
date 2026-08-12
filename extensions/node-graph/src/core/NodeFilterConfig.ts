export interface NodeFilterConfigJSON {
  allowAll?: boolean;
  whitelist?: string[];
  blacklist?: string[];
}

export class NodeFilterConfig {
  allowAll: boolean;
  whitelist: string[];
  blacklist: string[];

  constructor(json?: NodeFilterConfigJSON) {
    this.allowAll = json?.allowAll ?? true;
    this.whitelist = json?.whitelist ? [...json.whitelist] : [];
    this.blacklist = json?.blacklist ? [...json.blacklist] : [];
  }

  isAllowed(typeName: string): boolean {
    if (this.blacklist.includes(typeName)) return false;
    if (this.allowAll) return true;
    // allowAll:false + empty whitelist is almost always a broken/stale profile
    // (e.g. new skill scaffold); treat as open so the creator is usable.
    if (this.whitelist.length === 0) return true;
    return this.whitelist.includes(typeName);
  }

  toJSON(): NodeFilterConfigJSON {
    return {
      allowAll: this.allowAll,
      whitelist: [...this.whitelist],
      blacklist: [...this.blacklist],
    };
  }

  static fromJSON(json?: NodeFilterConfigJSON): NodeFilterConfig {
    return new NodeFilterConfig(json);
  }
}
