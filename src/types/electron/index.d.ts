import type { EventEmitter } from "node:events";

declare module "electron" {
  interface BrowserWindowConstructorOptions {
    width?: number;
    height?: number;
    webPreferences?: {
      preload?: string;
      nodeIntegration?: boolean;
      contextIsolation?: boolean;
    };
    show?: boolean;
    title?: string;
  }

  interface LoadURLOptions {
    hash?: string;
  }

  class BrowserWindow extends EventEmitter {
    constructor(options?: BrowserWindowConstructorOptions);
    static getAllWindows(): BrowserWindow[];
    loadURL(url: string, options?: LoadURLOptions): Promise<void>;
    show(): void;
    once(event: "ready-to-show", listener: () => void): this;
    on(event: "closed", listener: () => void): this;
  }

  interface App extends EventEmitter {
    readonly isPackaged: boolean;
    isReady(): boolean;
    whenReady(): Promise<void>;
    on(event: "window-all-closed", listener: () => void): this;
    on(event: "activate", listener: () => void): this;
    quit(): void;
  }

  export const app: App;
  export { BrowserWindow };
}
