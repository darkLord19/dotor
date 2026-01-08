import CDP from 'chrome-remote-interface';
import { browserManager } from './browser-manager.js';

interface CDPClient {
  Page: {
    enable(): Promise<void>;
  };
  Runtime: {
    evaluate(options: { 
      expression: string; 
      returnByValue?: boolean;
      awaitPromise?: boolean;
    }): Promise<{ result: { value?: unknown } }>;
  };
  close(): Promise<void>;
}

export class WhatsAppController {
  private readonly debugPort: number;

  constructor() {
    this.debugPort = parseInt(process.env.CHROME_DEBUG_PORT ?? '9222', 10);
  }

  /**
   * Execute a command via the DOM event bridge to the content script
   */
  private async executeCommand<T>(commandType: string, payload: any = {}): Promise<T> {
    const browserState = browserManager.getState();
    if (!browserState.isRunning) {
      throw new Error('Browser is not running');
    }

    let client: CDPClient | null = null;
    try {
      client = await CDP({ port: this.debugPort }) as unknown as CDPClient;
      await client.Page.enable();

      // Generate unique ID for request/response correlation
      const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
      
      // The script injects a promise that waits for the response event
      const expression = `
        (function() {
          return new Promise(resolve => {
            const id = "${id}";
            const handler = (e) => {
              window.removeEventListener("DOTOR_RESPONSE_" + id, handler);
              resolve(e.detail);
            };
            window.addEventListener("DOTOR_RESPONSE_" + id, handler);
            
            window.dispatchEvent(new CustomEvent("DOTOR_COMMAND", { 
              detail: { 
                type: "${commandType}", 
                id: id, 
                payload: ${JSON.stringify(payload)} 
              } 
            }));
            
            // Timeout safety (2 minutes for sync operations)
            setTimeout(() => {
              window.removeEventListener("DOTOR_RESPONSE_" + id, handler);
              resolve({ error: "Timeout waiting for client response" });
            }, 120000);
          });
        })()
      `;

      const { result } = await client.Runtime.evaluate({
        expression,
        returnByValue: true,
        awaitPromise: true
      });

      return result.value as T;
    } finally {
      if (client) {
        await client.close();
      }
    }
  }

  /**
   * Get list of recent chats from the side panel
   */
  async getRecentChats(): Promise<{name: string}[]> {
    const response = await this.executeCommand<{chats?: {name: string}[], error?: string}>('LIST_CHATS');
    if (response.error) {
      throw new Error(response.error);
    }
    return response.chats || [];
  }

  /**
   * Perform sync on specific chats
   */
  async syncChats(chatNames: string[]): Promise<any> {
    return this.executeCommand('SYNC_CHATS', { chatNames });
  }
}

export const whatsAppController = new WhatsAppController();
