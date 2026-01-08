import { EventEmitter } from 'events';
import { browserManager } from './browser-manager.js';
import { forwardToBackend } from './backend-client.js';

export interface SyncState {
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
  isSyncing: boolean;
  syncCount: number;
}

/**
 * SyncScheduler handles periodic message sync
 * - Triggers sync every N minutes (configurable, default 30)
 * - Only syncs when browser is running and linked
 * - Tracks sync state and timing
 */
export class SyncScheduler extends EventEmitter {
  private syncIntervalMs: number;
  private syncTimer: NodeJS.Timeout | null = null;
  private state: SyncState = {
    lastSyncAt: null,
    nextSyncAt: null,
    isSyncing: false,
    syncCount: 0,
  };

  // Pending sync request that content script should pick up
  private pendingSyncRequest: { id: string; requestedAt: Date } | null = null;

  constructor() {
    super();
    // Default: 30 minutes, configurable via env
    this.syncIntervalMs = parseInt(process.env.SYNC_INTERVAL_MS ?? '1800000', 10);
  }

  getState(): SyncState {
    return { ...this.state };
  }

  getPendingSyncRequest(): { id: string; requestedAt: Date } | null {
    return this.pendingSyncRequest;
  }

  /**
   * Start the sync scheduler
   */
  start(): void {
    if (this.syncTimer) {
      return; // Already running
    }

    console.log(`[SyncScheduler] Starting with interval ${this.syncIntervalMs}ms (${this.syncIntervalMs / 60000} min)`);
    
    // Schedule next sync
    this.scheduleNextSync();

    // Listen to browser events
    browserManager.on('browser:spawn', () => this.onBrowserSpawn());
    browserManager.on('browser:exit', () => this.onBrowserExit());
    browserManager.on('browser:linked', ({ linked }) => {
      if (linked) {
        this.onBrowserLinked();
      }
    });
  }

  /**
   * Stop the sync scheduler
   */
  stop(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.state.nextSyncAt = null;
    console.log('[SyncScheduler] Stopped');
  }

  /**
   * Request an immediate sync
   */
  requestSync(manual: boolean = false): { success: boolean; syncId?: string; error?: string } {
    const browserState = browserManager.getState();
    
    if (!browserState.isRunning) {
      return { success: false, error: 'Browser not running' };
    }

    if (!browserState.isLinked) {
      return { success: false, error: 'WhatsApp not linked' };
    }

    if (this.state.isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }

    const syncId = `sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.pendingSyncRequest = {
      id: syncId,
      requestedAt: new Date(),
    };

    this.state.isSyncing = true;
    this.emit('sync:requested', { syncId, manual });
    console.log(`[SyncScheduler] Sync requested: ${syncId} (manual: ${manual})`);

    // Timeout for sync completion (5 min max)
    setTimeout(() => {
      if (this.pendingSyncRequest?.id === syncId) {
        this.completeSyncRequest(syncId, false, 'Sync timed out');
      }
    }, 300000);

    return { success: true, syncId };
  }

  /**
   * Called by content script when sync is complete
   */
  async completeSyncRequest(syncId: string, success: boolean, error?: string): Promise<void> {
    if (this.pendingSyncRequest?.id !== syncId) {
      console.warn(`[SyncScheduler] Unknown sync ID: ${syncId}`);
      return;
    }

    this.pendingSyncRequest = null;
    this.state.isSyncing = false;

    if (success) {
      this.state.lastSyncAt = new Date();
      this.state.syncCount++;
      console.log(`[SyncScheduler] Sync completed: ${syncId}`);
      this.emit('sync:completed', { syncId, lastSyncAt: this.state.lastSyncAt });

      // Update backend with sync status
      const browserState = browserManager.getState();
      if (browserState.userId) {
        try {
          await forwardToBackend('/wa/sync-status', {
            userId: browserState.userId,
            lastSyncAt: this.state.lastSyncAt.toISOString(),
            syncCount: this.state.syncCount,
          });
        } catch (err) {
          console.error('[SyncScheduler] Failed to update backend sync status:', err);
        }
      }
    } else {
      console.error(`[SyncScheduler] Sync failed: ${syncId} - ${error}`);
      this.emit('sync:failed', { syncId, error });
    }

    // Reschedule next sync
    this.scheduleNextSync();
  }

  private scheduleNextSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.state.nextSyncAt = new Date(Date.now() + this.syncIntervalMs);
    
    this.syncTimer = setTimeout(() => {
      this.triggerScheduledSync();
    }, this.syncIntervalMs);

    console.log(`[SyncScheduler] Next sync scheduled at ${this.state.nextSyncAt.toISOString()}`);
  }

  private triggerScheduledSync(): void {
    const browserState = browserManager.getState();
    
    if (browserState.isRunning && browserState.isLinked) {
      console.log('[SyncScheduler] Triggering scheduled sync');
      this.requestSync(false);
    } else {
      console.log('[SyncScheduler] Skipping scheduled sync - browser not ready');
      // Reschedule for next interval
      this.scheduleNextSync();
    }
  }

  private onBrowserSpawn(): void {
    console.log('[SyncScheduler] Browser spawned, scheduling sync');
    this.scheduleNextSync();
  }

  private onBrowserExit(): void {
    console.log('[SyncScheduler] Browser exited, pausing sync');
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.state.nextSyncAt = null;
    this.state.isSyncing = false;
    this.pendingSyncRequest = null;
  }

  private onBrowserLinked(): void {
    // Do an initial sync when browser becomes linked
    console.log('[SyncScheduler] Browser linked, triggering initial sync');
    setTimeout(() => {
      this.requestSync(false);
    }, 5000); // Wait 5s for page to stabilize
  }
}

// Singleton instance
export const syncScheduler = new SyncScheduler();
