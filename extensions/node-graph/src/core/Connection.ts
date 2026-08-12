export interface ConnectionJSON {
  fromNodeId: string;
  fromPortIndex: number;
  toNodeId: string;
  toPortIndex: number;
}

export class Connection {
  fromNodeId: string;
  fromPortIndex: number;
  toNodeId: string;
  toPortIndex: number;

  constructor(fromNodeId: string, fromPortIndex: number, toNodeId: string, toPortIndex: number) {
    this.fromNodeId = fromNodeId;
    this.fromPortIndex = fromPortIndex;
    this.toNodeId = toNodeId;
    this.toPortIndex = toPortIndex;
  }

  equals(other: Connection): boolean {
    return (
      this.fromNodeId === other.fromNodeId &&
      this.fromPortIndex === other.fromPortIndex &&
      this.toNodeId === other.toNodeId &&
      this.toPortIndex === other.toPortIndex
    );
  }

  clone(): Connection {
    return new Connection(this.fromNodeId, this.fromPortIndex, this.toNodeId, this.toPortIndex);
  }

  toJSON(): ConnectionJSON {
    return {
      fromNodeId: this.fromNodeId,
      fromPortIndex: this.fromPortIndex,
      toNodeId: this.toNodeId,
      toPortIndex: this.toPortIndex,
    };
  }

  static fromJSON(json: ConnectionJSON): Connection {
    return new Connection(json.fromNodeId, json.fromPortIndex, json.toNodeId, json.toPortIndex);
  }
}
