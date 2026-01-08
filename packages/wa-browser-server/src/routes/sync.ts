import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { whatsAppClient } from '../lib/whatsapp-client.js';
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

    const state = whatsAppClient.getState();

    return {
      lastSyncAt: null, // to be implemented
      nextSyncAt: null,
      isSyncing: false,
      syncCount: 0,
      browserRunning: state.isInitialized,
      browserLinked: state.isLinked,
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

    const state = whatsAppClient.getState();
    if (!state.isInitialized || !state.isLinked) {
      return reply.code(400).send({ 
        error: 'Browser not running or not linked',
        browserRunning: state.isInitialized,
        browserLinked: state.isLinked
      });
    }

    try {
      // Perform sync
      const messages = await whatsAppClient.syncMessages();
      
      // TODO: Send messages to backend
      const BACKEND_URL = process.env.BACKEND_API_URL ?? process.env.BACKEND_URL ?? 'http://localhost:3001';
      const WA_API_KEY = process.env.API_SECRET_KEY ?? process.env.WA_API_SECRET_KEY ?? '';
      
      await fetch(`${BACKEND_URL}/wa/messages/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': WA_API_KEY,
        },
        body: JSON.stringify({ 
          userId: state.userId,
          messages,
          receivedAt: new Date().toISOString()
        }),
      });

      return {
        success: true,
        message: `Synced ${messages.length} messages`,
        count: messages.length
      };
    } catch (err: any) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Sync failed', details: err.message });
    }
  });

  /**
   * GET /sync/pending
   * Check if there's a pending sync request (Legacy)
   */
  fastify.get('/pending', async (request, reply) => {
    return { hasPending: false };
  });

  /**
   * POST /sync/complete
   * Legacy endpoint
   */
  fastify.post('/complete', async (request, reply) => {
    return { success: true };
  });
}
