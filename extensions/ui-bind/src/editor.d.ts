declare const Editor: {
  Dialog: {
    info(message: string, options?: object): Promise<unknown>;
    warn(message: string, options?: object): Promise<unknown>;
    error(message: string, options?: object): Promise<unknown>;
  };
  Message: {
    request(module: string, message: string, ...args: unknown[]): Promise<unknown>;
    send?(module: string, message: string, ...args: unknown[]): void;
  };
  Selection: {
    getSelected(type: string): string[];
  };
  Utils?: {
    Path?: { join(...parts: string[]): string };
  };
  Project: {
    path: string;
  };
};
