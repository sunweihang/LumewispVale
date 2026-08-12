/** Minimal Cocos Creator Editor typings for this extension. */
declare const Editor: {
  Panel: {
    define(options: Record<string, unknown>): unknown;
    open(name: string): void;
  };
  Message: {
    request(pkg: string, message: string, ...args: unknown[]): Promise<unknown>;
    send(pkg: string, message: string, ...args: unknown[]): void;
    broadcast(message: string, ...args: unknown[]): void;
  };
  Dialog?: {
    select(options: Record<string, unknown>): Promise<string | string[] | null>;
  };
  Utils?: {
    File?: {
      getPath?(name: string): string;
    };
  };
};
