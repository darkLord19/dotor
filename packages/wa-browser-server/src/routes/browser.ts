import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { whatsAppClient } from '../lib/whatsapp-client.js';
import { verifyApiKey } from '../lib/auth.js';

const SpawnSchema = z.object({
  userId: z.string().uuid(),
});

// const KillSchema = z.object({
//   userId: z.string().uuid(),
// });

export async function browserRoutes(fastify: FastifyInstance) {
  // Middleware to verify API key
  fastify.addHook('preHandler', async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string;
    if (!verifyApiKey(apiKey)) {
      reply.code(401).send({ error: 'Invalid API key' });
    }
  });

  /**
   * GET /browser/status
   * Get current browser state
   */
  fastify.get('/status', async (_request, _reply) => {
    const state = whatsAppClient.getState();
    return {
      isRunning: state.isInitialized,
      userId: state.userId,
      isLinked: state.isLinked,
      startedAt: null, // Legacy field
      lastActivityAt: null,
      idleTimeMs: 0,
    };
  });

  /**
   * POST /browser/spawn
   * Spawn a new browser instance for a user
   */
  fastify.post('/spawn', async (request, reply) => {
    const body = SpawnSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request', details: body.error.issues });
    }

    const { userId } = body.data;
    
    // No response needed, init is async
    whatsAppClient.initialize(userId);

    return { 
      success: true, 
      message: 'Browser starting',
      state: whatsAppClient.getState(),
    };
  });

  /**
   * POST /browser/stop
   * Stop the browser instance
   */
  fastify.post('/stop', async (_request, _reply) => {
    // We don't really use the userId for stopping anymore since it's a singleton
    // but we can check if it matches
    // const state = whatsAppClient.getState();
    await whatsAppClient.destroy();

    return { success: true, message: 'Browser stopped' };
  });

  /**
   * POST /browser/activity
   * Record user activity (extend idle timeout)
   */
  fastify.post('/activity', async (_request, _reply) => {
    // Legacy support
    return { success: true };
  });
}
