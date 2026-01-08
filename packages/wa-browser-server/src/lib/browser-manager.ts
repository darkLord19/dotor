import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface BrowserState {
  isRunning: boolean;
  userId: string | null;
  startedAt: Date | null;
  lastActivityAt: Date | null;
  isLinked: boolean;
  pid: number | null;
}

/**
 * Get Chrome executable path based on platform
 */
function getChromePath(): string {
  // Allow override via env
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }

  const platform = os.platform();
  
  if (platform === 'darwin') {
    // macOS
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  } else if (platform === 'win32') {
    // Windows
    return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  } else {
    // Linux
    return 'google-chrome';
  }
}

/**
 * BrowserManager enforces single browser instance constraint
 * - Only one browser process at a time
 * - Auto-kill on idle timeout
 * - Tracks user ownership
 */
export class BrowserManager extends EventEmitter {
  private browserProcess: ChildProcess | null = null;
  private state: BrowserState = {
    isRunning: false,
    userId: null,
    startedAt: null,
    lastActivityAt: null,
    isLinked: false,
    pid: null,
  };
  private idleCheckInterval: NodeJS.Timeout | null = null;
  private readonly idleTimeoutMs: number;
  private readonly userDataDir: string;

  constructor() {
    super();
    this.idleTimeoutMs = parseInt(process.env.IDLE_TIMEOUT_MS ?? '600000', 10); // 10 min default
    this.userDataDir = process.env.CHROME_USER_DATA_DIR ?? '/tmp/wa-chrome-data';
  }

  getState(): BrowserState {
    return { ...this.state };
  }

  /**
   * Check if Chrome is actually running (via lsof on debug port)
   */
  async isActuallyRunning(): Promise<boolean> {
    if (!this.state.isRunning) return false;
    
    const debugPort = parseInt(process.env.CHROME_DEBUG_PORT ?? '9222', 10);
    try {
      execSync(`lsof -i :${debugPort}`, { stdio: 'ignore' });
      return true;
    } catch {
      // lsof returns non-zero if no process found
      return false;
    }
  }

  isAvailable(): boolean {
    return !this.state.isRunning;
  }

  canControl(userId: string): boolean {
    return this.state.userId === userId;
  }

  /**
   * Spawn a headful Chrome browser for WhatsApp Web
   * Returns false if browser already running
   */
  async spawn(userId: string): Promise<{ success: boolean; error?: string }> {
    if (this.state.isRunning) {
      if (this.state.userId === userId) {
        return { success: false, error: 'Browser already running for this user' };
      }
      return { success: false, error: 'Browser already in use by another user' };
    }

    // Ensure user data directory exists
    try {
      const userDir = path.join(this.userDataDir, userId);
      if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
      }
    } catch (err) {
      console.error('Failed to create user data directory:', err);
      return { success: false, error: 'Failed to create user profile directory' };
    }

    const chromePath = getChromePath();
    console.log(`Using Chrome at: ${chromePath}`);

    // Remote debugging port for CDP screenshots
    const debugPort = parseInt(process.env.CHROME_DEBUG_PORT ?? '9222', 10);

    // Spawn headful Chrome with minimal flags
    // NO headless, NO automation flags
    const chromeArgs = [
      `--user-data-dir=${path.join(this.userDataDir, userId)}`,
      `--remote-debugging-port=${debugPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--disable-dev-shm-usage', // Required for Docker
      '--window-size=1024,768',
      '--lang=en-US',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--safebrowsing-disable-auto-update',
      'https://web.whatsapp.com',
    ];

    try {
      this.browserProcess = spawn(chromePath, chromeArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      });

      this.state = {
        isRunning: true,
        userId,
        startedAt: new Date(),
        lastActivityAt: new Date(),
        isLinked: false,
        pid: this.browserProcess.pid ?? null,
      };

      // Handle process exit
      // On macOS, Chrome forks and the original process exits with code 0
      // So we only treat non-zero exit codes as errors
      this.browserProcess.on('exit', (code, signal) => {
        console.log(`Chrome spawner exited with code ${code}, signal ${signal}`);
        
        // Only cleanup if it was an error exit or explicit signal
        // code 0 on macOS means Chrome forked successfully
        if (code !== 0 || signal) {
          console.log('Chrome process terminated unexpectedly');
          this.cleanup();
          this.emit('browser:exit', { code, signal, userId });
        } else {
          console.log('Chrome forked successfully, browser still running');
          // Keep state as running, will be monitored via CDP
        }
      });

      this.browserProcess.on('error', (err) => {
        console.error('Chrome process error:', err);
        this.cleanup();
        this.emit('browser:error', { error: err.message, userId });
      });

      // Start idle monitoring
      this.startIdleMonitor();

      this.emit('browser:spawn', { userId });
      return { success: true };
    } catch (err) {
      console.error('Failed to spawn Chrome:', err);
      this.cleanup();
      return { success: false, error: 'Failed to spawn Chrome browser' };
    }
  }

  /**
   * Kill the browser process
   */
  async kill(userId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.state.isRunning) {
      return { success: false, error: 'No browser running' };
    }

    if (this.state.userId !== userId) {
      return { success: false, error: 'Not authorized to kill this browser' };
    }

    try {
      // Try to kill the spawned process if it exists
      if (this.browserProcess && !this.browserProcess.killed) {
        this.browserProcess.kill('SIGTERM');
      }
      
      // Also kill any Chrome processes using our debugging port
      // This handles the case where Chrome forked on macOS
      const debugPort = parseInt(process.env.CHROME_DEBUG_PORT ?? '9222', 10);
      try {
        execSync(`pkill -f "remote-debugging-port=${debugPort}"`, { stdio: 'ignore' });
      } catch {
        // Ignore errors - process may not exist
      }

      this.cleanup();
      this.emit('browser:kill', { userId });
      return { success: true };
    } catch (err) {
      console.error('Failed to kill Chrome:', err);
      return { success: false, error: 'Failed to kill browser' };
    }
  }

  /**
   * Force kill regardless of user (for admin/emergency)
   */
  async forceKill(): Promise<void> {
    if (this.browserProcess && !this.browserProcess.killed) {
      this.browserProcess.kill('SIGKILL');
    }
    
    // Also kill any Chrome processes using our debugging port
    const debugPort = parseInt(process.env.CHROME_DEBUG_PORT ?? '9222', 10);
    try {
      execSync(`pkill -f "remote-debugging-port=${debugPort}"`, { stdio: 'ignore' });
    } catch {
      // Ignore errors
    }
    
    this.cleanup();
    this.emit('browser:force-kill', {});
  }

  /**
   * Update activity timestamp (called on any user interaction)
   */
  recordActivity(): void {
    if (this.state.isRunning) {
      this.state.lastActivityAt = new Date();
    }
  }

  /**
   * Mark browser as linked (QR scanned, logged in)
   */
  setLinked(linked: boolean): void {
    this.state.isLinked = linked;
    this.emit('browser:linked', { linked, userId: this.state.userId });
  }

  private cleanup(): void {
    this.stopIdleMonitor();
    this.browserProcess = null;
    this.state = {
      isRunning: false,
      userId: null,
      startedAt: null,
      lastActivityAt: null,
      isLinked: false,
      pid: null,
    };
  }

  private startIdleMonitor(): void {
    this.stopIdleMonitor();
    
    this.idleCheckInterval = setInterval(() => {
      if (!this.state.isRunning || !this.state.lastActivityAt) {
        return;
      }

      const idleTime = Date.now() - this.state.lastActivityAt.getTime();
      if (idleTime > this.idleTimeoutMs) {
        console.log(`Browser idle for ${idleTime}ms, killing...`);
        this.forceKill();
        this.emit('browser:idle-timeout', { userId: this.state.userId });
      }
    }, 30000); // Check every 30 seconds
  }

  private stopIdleMonitor(): void {
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
  }
}

// Singleton instance
export const browserManager = new BrowserManager();
