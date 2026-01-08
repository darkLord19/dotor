import type { FastifyInstance } from 'fastify';
import { verifyApiKey } from '../lib/auth.js';
import { screenshotManager } from '../lib/screenshot-manager.js';
import { browserManager } from '../lib/browser-manager.js';

export async function screenshotRoutes(fastify: FastifyInstance) {
  /**
   * GET /screenshot
   * Get the latest screenshot of the browser
   */
  fastify.get('/', async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string;
    if (!verifyApiKey(apiKey)) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }

    const browserState = browserManager.getState();
    
    if (!browserState.isRunning) {
      return reply.code(400).send({ 
        error: 'Browser not running',
        browserRunning: false,
      });
    }

    // If already linked, no need for screenshot
    if (browserState.isLinked) {
      return {
        success: true,
        linked: true,
        message: 'WhatsApp already linked, no QR code needed',
      };
    }

    // Get cached screenshot or capture new one
    let result = screenshotManager.getLastScreenshot();
    
    if (!result.success) {
      // No cached screenshot, capture one
      result = await screenshotManager.capture();
    }

    if (!result.success) {
      return reply.code(500).send({ error: result.error });
    }

    return {
      success: true,
      linked: false,
      image: result.data,
      mimeType: result.mimeType,
      timestamp: result.timestamp,
    };
  });

  /**
   * POST /screenshot/capture
   * Force capture a new screenshot
   */
  fastify.post('/capture', async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string;
    if (!verifyApiKey(apiKey)) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }

    const result = await screenshotManager.capture();

    if (!result.success) {
      return reply.code(500).send({ error: result.error });
    }

    return {
      success: true,
      image: result.data,
      mimeType: result.mimeType,
      timestamp: result.timestamp,
    };
  });
}
