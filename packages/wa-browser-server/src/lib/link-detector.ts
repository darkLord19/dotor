import CDP from 'chrome-remote-interface';
import { EventEmitter } from 'events';
import { browserManager } from './browser-manager.js';

interface CDPClient {
  Page: {
    enable(): Promise<void>;
  };
  Runtime: {
    evaluate(options: { expression: string; returnByValue?: boolean }): Promise<{ result: { value?: unknown } }>;
  };
  close(): Promise<void>;
}

export interface LinkStatus {
  isLinked: boolean;
  phoneNumber?: string | undefined;
  profileName?: string | undefined;
  timestamp: string;
}

/**
 * LinkDetector monitors the WhatsApp Web page to detect when
 * the user has successfully scanned the QR code and logged in.
 */
class LinkDetector extends EventEmitter {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly intervalMs = 3000; // Check every 3 seconds
  private readonly debugPort: number;
  private isLinked = false;

  constructor() {
    super();
    this.debugPort = parseInt(process.env.CHROME_DEBUG_PORT ?? '9222', 10);
  }

  /**
   * Check if WhatsApp is logged in (main chat view is visible)
   */
  async checkLinkStatus(): Promise<LinkStatus> {
    const browserState = browserManager.getState();
    
    console.log('[LinkDetector] checkLinkStatus called, browserState.isRunning:', browserState.isRunning);
    
    if (!browserState.isRunning) {
      console.log('[LinkDetector] Browser not running, returning isLinked: false');
      return { isLinked: false, timestamp: new Date().toISOString() };
    }

    let client: CDPClient | null = null;

    try {
      console.log('[LinkDetector] Connecting to CDP on port:', this.debugPort);
      client = await CDP({ port: this.debugPort }) as unknown as CDPClient;
      console.log('[LinkDetector] CDP connected successfully');
      await client.Page.enable();

      // Check for indicators that user is logged in:
      // 1. Side panel with chat list is visible
      // 2. QR code / landing page is NOT visible
      // 3. Main conversation area is accessible
      const result = await client.Runtime.evaluate({
        expression: `
          (function() {
            // Indicators that we're logged in (main chat interface)
            const chatList = document.querySelector('div[aria-label*="Chat list"]') ||
                            document.querySelector('[data-testid="chat-list"]') ||
                            document.querySelector('div[data-tab="3"]') ||
                            document.querySelector('div._akax') ||
                            document.querySelector('#pane-side');
            
            // Indicators we're on the QR/landing page (NOT logged in)
            const qrCode = document.querySelector('canvas[aria-label*="Scan"]') ||
                          document.querySelector('[data-testid="qrcode"]') ||
                          document.querySelector('div[data-testid="landing-main"]') ||
                          document.querySelector('div[data-ref]');
            
            // Check for main app wrapper that appears after login
            const mainApp = document.querySelector('#app div[data-asset-intro-image]') === null &&
                           document.querySelector('#app');
            
            // Get profile info if available
            let profileName = null;
            const profileEl = document.querySelector('[data-testid="drawer-left"] [data-testid="conversation-info-header-chat-title"]');
            if (profileEl) {
              profileName = profileEl.textContent;
            }
            
            // Alternative: check for settings/menu button which only appears when logged in
            const menuBtn = document.querySelector('[data-testid="menu"]') ||
                           document.querySelector('[aria-label="Menu"]');
            
            // We're linked if:
            // 1. Chat list is visible, OR
            // 2. Menu button exists (logged-in state), AND
            // 3. No QR code visible
            const hasLoggedInElements = !!(chatList || menuBtn);
            const hasQrCode = !!qrCode;
            
            return {
              isLinked: hasLoggedInElements && !hasQrCode,
              hasChat: !!chatList,
              hasQr: hasQrCode,
              hasMenu: !!menuBtn,
              profileName,
            };
          })()
        `,
        returnByValue: true,
      });

      const status = result.result.value as {
        isLinked: boolean;
        hasChat: boolean;
        hasQr: boolean;
        hasMenu: boolean;
        profileName?: string;
      } | null;

      console.log('[LinkDetector] Check result:', status);

      if (status?.isLinked && !this.isLinked) {
        console.log('[LinkDetector] WhatsApp linked! hasChat:', status.hasChat, 'hasMenu:', status.hasMenu);
        this.isLinked = true;
        browserManager.setLinked(true);
        this.emit('linked', { timestamp: new Date().toISOString() });
        
        // Emit notify-backend immediately when linked
        console.log('[LinkDetector] Emitting notify-backend event');
        this.emit('notify-backend');
      }

      return {
        isLinked: status?.isLinked ?? false,
        profileName: status?.profileName ?? undefined,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      // CDP connection failed - browser might be starting up
      console.debug('[LinkDetector] Check failed:', err instanceof Error ? err.message : err);
      return { isLinked: this.isLinked, timestamp: new Date().toISOString() };
    } finally {
      if (client) {
        try {
          await client.close();
        } catch {
          // Ignore
        }
      }
    }
  }

  /**
   * Start monitoring for link status
   */
  start(): void {
    if (this.checkInterval) {
      console.log('[LinkDetector] Already running, skipping start');
      return;
    }

    console.log('[LinkDetector] Starting link detection');
    this.isLinked = false;

    // Initial check after Chrome startup delay
    console.log('[LinkDetector] Scheduling initial check in 5 seconds');
    setTimeout(() => {
      console.log('[LinkDetector] Running initial check');
      this.checkLinkStatus();
    }, 5000);

    // Then check periodically
    this.checkInterval = setInterval(async () => {
      const browserState = browserManager.getState();
      
      console.log('[LinkDetector] Interval check - browserState.isRunning:', browserState.isRunning, 'this.isLinked:', this.isLinked);
      
      if (!browserState.isRunning) {
        console.log('[LinkDetector] Browser not running, stopping');
        this.stop();
        return;
      }

      // Already linked - stop checking
      if (this.isLinked) {
        console.log('[LinkDetector] Already linked, stopping periodic checks');
        this.stop();
        return;
      }

      await this.checkLinkStatus();
    }, this.intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[LinkDetector] Stopped link detection');
    }
  }

  /**
   * Reset state (when browser is killed/restarted)
   */
  reset(): void {
    this.stop();
    this.isLinked = false;
  }

  /**
   * Get current link status
   */
  getStatus(): boolean {
    return this.isLinked;
  }
}

// Singleton
export const linkDetector = new LinkDetector();
