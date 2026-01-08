declare module 'chrome-remote-interface' {
  interface CDPOptions {
    host?: string;
    port?: number;
    target?: string | ((targets: Target[]) => Target);
  }

  interface Target {
    id: string;
    type: string;
    title: string;
    url: string;
    webSocketDebuggerUrl?: string;
  }

  interface Page {
    captureScreenshot(options?: {
      format?: 'jpeg' | 'png' | 'webp';
      quality?: number;
      clip?: { x: number; y: number; width: number; height: number; scale: number };
      fromSurface?: boolean;
      captureBeyondViewport?: boolean;
    }): Promise<{ data: string }>;
    navigate(options: { url: string }): Promise<void>;
    enable(): Promise<void>;
  }

  interface Client {
    Page: Page;
    close(): Promise<void>;
    on(event: string, callback: (...args: any[]) => void): void;
  }

  function CDP(options?: CDPOptions): Promise<Client>;
  
  namespace CDP {
    function List(options?: { host?: string; port?: number }): Promise<Target[]>;
    function Version(options?: { host?: string; port?: number }): Promise<{ webSocketDebuggerUrl?: string }>;
  }

  export = CDP;
}
