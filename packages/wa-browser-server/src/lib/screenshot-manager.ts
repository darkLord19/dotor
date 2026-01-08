import CDP from 'chrome-remote-interface';
import { browserManager } from './browser-manager.js';

export interface ScreenshotResult {
  success: boolean;
  data?: string; // base64 encoded image
  mimeType?: string;
  error?: string;
  timestamp?: string;
}

interface Runtime {
  evaluate(options: { expression: string; returnByValue?: boolean }): Promise<{ result: { value?: unknown } }>;
}

interface CDPClient {
  Page: {
    captureScreenshot(options?: {
      format?: 'jpeg' | 'png' | 'webp';
      quality?: number;
      clip?: { x: number; y: number; width: number; height: number; scale: number };
      fromSurface?: boolean;
      captureBeyondViewport?: boolean;
    }): Promise<{ data: string }>;
    enable(): Promise<void>;
  };
  Runtime: Runtime;
  close(): Promise<void>;
}

/**
 * ScreenshotManager captures screenshots via Chrome DevTools Protocol
 * Used to show QR code inline in the webapp
 */
class ScreenshotManager {
  private lastScreenshot: { data: string; timestamp: Date } | null = null;
  private screenshotInterval: NodeJS.Timeout | null = null;
  private readonly intervalMs = 2000; // Capture every 2 seconds when active
  private readonly debugPort: number;

  constructor() {
    this.debugPort = parseInt(process.env.CHROME_DEBUG_PORT ?? '9222', 10);
  }

  /**
   * Take a screenshot via Chrome DevTools Protocol
   * Attempts to capture just the QR code area
   */
  async capture(): Promise<ScreenshotResult> {
    const browserState = browserManager.getState();
    
    if (!browserState.isRunning) {
      return { success: false, error: 'Browser not running' };
    }

    let client: CDPClient | null = null;

    try {
      // Wait a bit for Chrome to be ready on first capture
      await this.waitForDebugger();

      // Connect to Chrome
      client = await CDP({ port: this.debugPort }) as unknown as CDPClient;
      
      // Enable Page domain
      await client.Page.enable();

      // Try to find and capture just the QR code element
      const qrBounds = await this.getQrCodeBounds(client);
      
      let screenshotOptions: {
        format: 'png';
        captureBeyondViewport: boolean;
        clip?: { x: number; y: number; width: number; height: number; scale: number };
      } = {
        format: 'png',
        captureBeyondViewport: false,
      };

      if (qrBounds) {
        // Add some padding around the QR code
        const padding = 40;
        screenshotOptions.clip = {
          x: Math.max(0, qrBounds.x - padding),
          y: Math.max(0, qrBounds.y - padding),
          width: qrBounds.width + (padding * 2),
          height: qrBounds.height + (padding * 2),
          scale: 1,
        };
        console.log('[ScreenshotManager] Capturing QR code area:', screenshotOptions.clip);
      } else {
        // Fallback: capture center portion of screen where QR typically is
        screenshotOptions.clip = {
          x: 200,
          y: 150,
          width: 500,
          height: 500,
          scale: 1,
        };
        console.log('[ScreenshotManager] QR element not found, using fallback area');
      }

      // Capture screenshot
      const { data } = await client.Page.captureScreenshot(screenshotOptions);
      
      const timestamp = new Date();
      
      this.lastScreenshot = {
        data,
        timestamp,
      };

      return {
        success: true,
        data,
        mimeType: 'image/png',
        timestamp: timestamp.toISOString(),
      };
    } catch (err) {
      console.error('[ScreenshotManager] Failed to capture:', err);
      return { 
        success: false, 
        error: err instanceof Error ? err.message : 'Screenshot failed' 
      };
    } finally {
      if (client) {
        try {
          await client.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  }

  /**
   * Find the QR code element bounds using CDP Runtime
   */
  private async getQrCodeBounds(client: CDPClient): Promise<{ x: number; y: number; width: number; height: number } | null> {
    try {
      // WhatsApp Web QR code selectors (they change sometimes, try multiple)
      const selectors = [
        'canvas[aria-label*="Scan"]',  // QR canvas
        'div[data-testid="qrcode"]',   // QR container
        'canvas',                       // Any canvas (likely QR)
        'div._akau',                    // WhatsApp specific class
      ];

      for (const selector of selectors) {
        const result = await client.Runtime.evaluate({
          expression: `
            (function() {
              const el = document.querySelector('${selector}');
              if (!el) return null;
              const rect = el.getBoundingClientRect();
              // Only return if element has reasonable size (QR code should be at least 200x200)
              if (rect.width > 150 && rect.height > 150) {
                return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
              }
              return null;
            })()
          `,
          returnByValue: true,
        });

        if (result.result.value) {
          return result.result.value as { x: number; y: number; width: number; height: number };
        }
      }

      // Try to find the QR section container
      const containerResult = await client.Runtime.evaluate({
        expression: `
          (function() {
            // Look for the landing page / QR section
            const landing = document.querySelector('div[data-testid="landing-main"]') || 
                           document.querySelector('._a2jh') ||
                           document.querySelector('div[class*="landing"]');
            if (landing) {
              const rect = landing.getBoundingClientRect();
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            }
            return null;
          })()
        `,
        returnByValue: true,
      });

      if (containerResult.result.value) {
        return containerResult.result.value as { x: number; y: number; width: number; height: number };
      }

      return null;
    } catch (err) {
      console.error('[ScreenshotManager] Failed to get QR bounds:', err);
      return null;
    }
  }

  /**
   * Wait for Chrome debugger to be available
   */
  private async waitForDebugger(maxAttempts = 10): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const targets = await CDP.List({ port: this.debugPort });
        if (targets.length > 0) {
          return;
        }
      } catch {
        // Not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  /**
   * Get the last captured screenshot (cached)
   */
  getLastScreenshot(): ScreenshotResult {
    if (!this.lastScreenshot) {
      return { success: false, error: 'No screenshot available' };
    }

    return {
      success: true,
      data: this.lastScreenshot.data,
      mimeType: 'image/png',
      timestamp: this.lastScreenshot.timestamp.toISOString(),
    };
  }

  /**
   * Start auto-capturing screenshots while waiting for QR scan
   */
  startAutoCapture(): void {
    if (this.screenshotInterval) {
      return; // Already running
    }

    console.log('[ScreenshotManager] Starting auto-capture');
    
    // Capture after a delay to let Chrome start
    setTimeout(() => this.capture(), 3000);

    // Then capture periodically
    this.screenshotInterval = setInterval(async () => {
      const browserState = browserManager.getState();
      
      // Stop capturing once linked (QR scanned)
      if (browserState.isLinked) {
        console.log('[ScreenshotManager] Browser linked, stopping auto-capture');
        this.stopAutoCapture();
        return;
      }

      // Stop if browser not running
      if (!browserState.isRunning) {
        this.stopAutoCapture();
        return;
      }

      await this.capture();
    }, this.intervalMs);
  }

  /**
   * Stop auto-capturing
   */
  stopAutoCapture(): void {
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
      console.log('[ScreenshotManager] Stopped auto-capture');
    }
  }

  /**
   * Clear cached screenshot
   */
  clear(): void {
    this.lastScreenshot = null;
    this.stopAutoCapture();
  }
}

// Singleton
export const screenshotManager = new ScreenshotManager();
