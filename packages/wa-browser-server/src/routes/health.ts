import type { FastifyInstance } from 'fastify';
import { browserManager } from '../lib/browser-manager.js';

export async function healthRoutes(fastify: FastifyInstance) {
  /**
   * GET /health
   * Health check endpoint
   */
  fastify.get('/health', async () => {
    const state = browserManager.getState();
    return {
      status: 'ok',
      service: 'wa-browser-server',
      timestamp: new Date().toISOString(),
      browser: {
        isRunning: state.isRunning,
        isLinked: state.isLinked,
      },
      memory: process.memoryUsage(),
    };
  });

  /**
   * GET /ready
   * Readiness check
   */
  fastify.get('/ready', async () => {
    return { ready: true };
  });
}
