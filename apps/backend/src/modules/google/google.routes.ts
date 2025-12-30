import type { FastifyInstance } from 'fastify';
import type { Logger } from '@dotor/logger';
import { GoogleController } from '../../controllers/google.controller.js';
import { authMiddleware } from '../../middleware/auth.js';

export async function googleRoutes(fastify: FastifyInstance, logger: Logger): Promise<void> {
  const controller = new GoogleController(logger);

  // Get all connections
  fastify.get('/connections', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    await controller.getAllConnections(request, reply);
  });

  // Get Google connection status
  fastify.get('/google/status', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    await controller.getGoogleStatus(request, reply);
  });

  // Get auth URL to connect Google account
  fastify.get('/google/auth-url', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    await controller.getAuthUrl(request, reply);
  });

  // Handle OAuth callback
  fastify.get('/google/callback', async (request, reply) => {
    await controller.handleCallback(request, reply);
  });

  // Disconnect Google account
  fastify.delete('/google/disconnect', {
    preHandler: authMiddleware,
  }, async (request, reply) => {
    await controller.disconnect(request, reply);
  });
}
