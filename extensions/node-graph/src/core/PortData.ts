export interface PortDataJSON {
  name: string;
  portType: string;
}

export class PortData {
  name: string;
  portType: string;

  constructor(name: string, portType: string) {
    this.name = name;
    this.portType = portType;
  }

  clone(): PortData {
    return new PortData(this.name, this.portType);
  }

  toJSON(): PortDataJSON {
    return { name: this.name, portType: this.portType };
  }

  static fromJSON(json: PortDataJSON): PortData {
    return new PortData(json.name, json.portType);
  }
}
