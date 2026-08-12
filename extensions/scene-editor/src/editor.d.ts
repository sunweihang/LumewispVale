/** Minimal Cocos Creator Editor typings for this extension. */
declare const Editor: {
  Panel: {
    define(options: Record<string, unknown>): unknown;
    open(name: string): void;
    close?(name: string): void;
  };
  Message: {
    request(pkg: string, message: string, ...args: unknown[]): Promise<unknown>;
    send(pkg: string, message: string, ...args: unknown[]): void;
    broadcast(message: string, ...args: unknown[]): void;
  };
  Dialog: {
    info(message: string, options?: Record<string, unknown>): Promise<number>;
    warn(message: string, options?: Record<string, unknown>): Promise<number>;
    error(message: string, options?: Record<string, unknown>): Promise<number>;
  };
  Project?: {
    path: string;
  };
  Selection?: {
    clear(): void;
    select(type: string, uuid: string): void;
    getSelected?(type: string): string[];
  };
};
