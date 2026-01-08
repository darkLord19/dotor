import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { browserManager } from '../lib/browser-manager.js';
import { linkDetector } from '../lib/link-detector.js';
import { verifyApiKey } from '../lib/auth.js';

const SpawnSchema = z.object({
  userId: z.string().uuid(),
});

const KillSchema = z.object({
  userId: z.string().uuid(),
});

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
  fastify.get('/status', async (request, reply) => {
    const state = browserManager.getState();
    const isLinked = linkDetector.getStatus() || state.isLinked;
    
    // Double-check if browser is actually running (handles macOS fork case)
    const actuallyRunning = state.isRunning ? await browserManager.isActuallyRunning() : false;
    
    return {
      isRunning: actuallyRunning,
      userId: state.userId,
      isLinked,
      startedAt: state.startedAt?.toISOString() ?? null,
      lastActivityAt: state.lastActivityAt?.toISOString() ?? null,
      idleTimeMs: state.lastActivityAt 
        ? Date.now() - state.lastActivityAt.getTime() 
        : null,
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
    const result = await browserManager.spawn(userId);

    if (!result.success) {
      return reply.code(409).send({ error: result.error });
    }

    return { 
      success: true, 
      message: 'Browser spawned',
      state: browserManager.getState(),
    };
  });

  /**
   * POST /browser/stop
   * Stop the browser instance
   */
  fastify.post('/stop', async (request, reply) => {
    const body = KillSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request', details: body.error.issues });
    }

    const { userId } = body.data;
    const result = await browserManager.kill(userId);

    if (!result.success) {
      return reply.code(400).send({ error: result.error });
    }

    return { success: true, message: 'Browser stopped' };
  });

  /**
   * POST /browser/activity
   * Record user activity (extend idle timeout)
   */
  fastify.post('/activity', async (request, reply) => {
    browserManager.recordActivity();
    return { success: true };
  });

  /**
   * DELETE /browser/force
   * Force kill browser (admin only)
   */
  fastify.delete('/force', async (request, reply) => {
    await browserManager.forceKill();
    return { success: true, message: 'Browser force killed' };
  });
}
