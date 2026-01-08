import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { browserManager } from '../lib/browser-manager.js';
import { syncScheduler } from '../lib/sync-scheduler.js';
import { verifyApiKey } from '../lib/auth.js';

const SyncCompleteSchema = z.object({
  syncId: z.string(),
  success: z.boolean(),
  messagesFound: z.number().optional(),
  error: z.string().optional(),
});

export async function syncRoutes(fastify: FastifyInstance) {
  /**
   * GET /sync/status
   * Get current sync status
   */
  fastify.get('/status', async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string;
    if (!verifyApiKey(apiKey)) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }

    const syncState = syncScheduler.getState();
    const browserState = browserManager.getState();

    return {
      lastSyncAt: syncState.lastSyncAt?.toISOString() ?? null,
      nextSyncAt: syncState.nextSyncAt?.toISOString() ?? null,
      isSyncing: syncState.isSyncing,
      syncCount: syncState.syncCount,
      browserRunning: browserState.isRunning,
      browserLinked: browserState.isLinked,
    };
  });

  /**
   * POST /sync/trigger
   * Manually trigger a sync
   */
  fastify.post('/trigger', async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string;
    if (!verifyApiKey(apiKey)) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }

    const result = syncScheduler.requestSync(true);
    
    if (!result.success) {
      return reply.code(400).send({ error: result.error });
    }

    return {
      success: true,
      syncId: result.syncId,
      message: 'Sync requested. Content script will perform sync.',
    };
  });

  /**
   * GET /sync/pending
   * Check if there's a pending sync request (polled by content script)
   */
  fastify.get('/pending', async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string;
    if (!verifyApiKey(apiKey)) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }

    const pending = syncScheduler.getPendingSyncRequest();
    
    return {
      hasPending: !!pending,
      syncId: pending?.id ?? null,
      requestedAt: pending?.requestedAt?.toISOString() ?? null,
    };
  });

  /**
   * POST /sync/complete
   * Called by content script when sync is complete
   */
  fastify.post('/complete', async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string;
    if (!verifyApiKey(apiKey)) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }

    const body = SyncCompleteSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request', details: body.error.issues });
    }

    const { syncId, success, error } = body.data;
    
    await syncScheduler.completeSyncRequest(syncId, success, error);
    
    // Record activity
    browserManager.recordActivity();

    return { success: true };
  });
}
