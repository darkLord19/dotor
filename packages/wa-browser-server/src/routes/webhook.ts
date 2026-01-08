import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { browserManager } from '../lib/browser-manager.js';
import { verifyApiKey } from '../lib/auth.js';
import { forwardToBackend } from '../lib/backend-client.js';

const LinkedSchema = z.object({
  userId: z.string().uuid(),
  linked: z.boolean(),
});

const MessageBatchSchema = z.object({
  userId: z.string().uuid(),
  messages: z.array(z.object({
    id: z.string(),
    chatId: z.string(),
    chatName: z.string().optional(),
    sender: z.string(),
    content: z.string(),
    timestamp: z.string(),
    isFromMe: z.boolean(),
  })),
});

export async function webhookRoutes(fastify: FastifyInstance) {
  // Middleware to verify API key
  fastify.addHook('preHandler', async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string;
    if (!verifyApiKey(apiKey)) {
      reply.code(401).send({ error: 'Invalid API key' });
    }
  });

  /**
   * POST /webhook/linked
   * Called when WhatsApp login state changes
   */
  fastify.post('/linked', async (request, reply) => {
    const body = LinkedSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request', details: body.error.issues });
    }

    const { userId, linked } = body.data;
    
    // Update local state
    browserManager.setLinked(linked);
    browserManager.recordActivity();

    // Forward to main backend
    try {
      await forwardToBackend('/wa/linked', {
        userId,
        linked,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      fastify.log.error('Failed to forward linked status to backend:', err);
    }

    return { success: true };
  });

  /**
   * POST /webhook/messages
   * Called when new messages are detected
   */
  fastify.post('/messages', async (request, reply) => {
    const body = MessageBatchSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Invalid request', details: body.error.issues });
    }

    const { userId, messages } = body.data;
    
    // Record activity
    browserManager.recordActivity();

    // Forward to main backend
    try {
      await forwardToBackend('/wa/messages/batch', {
        userId,
        messages,
        receivedAt: new Date().toISOString(),
      });
    } catch (err) {
      fastify.log.error('Failed to forward messages to backend:', err);
      return reply.code(502).send({ error: 'Failed to forward to backend' });
    }

    return { 
      success: true, 
      processed: messages.length,
    };
  });

  /**
   * POST /webhook/heartbeat
   * Called periodically by content script to keep connection alive
   */
  fastify.post('/heartbeat', async (request, reply) => {
    browserManager.recordActivity();
    return { success: true };
  });
}
