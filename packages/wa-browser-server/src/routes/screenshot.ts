import type { FastifyInstance } from 'fastify';
import { verifyApiKey } from '../lib/auth.js';
import { whatsAppClient } from '../lib/whatsapp-client.js';

export async function screenshotRoutes(fastify: FastifyInstance) {
  /**
   * GET /screenshot
   * Get the latest QR code
   */
  fastify.get('/', async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string;
    if (!verifyApiKey(apiKey)) {
      return reply.code(401).send({ error: 'Invalid API key' });
    }

    const state = whatsAppClient.getState();
    
    if (!state.isInitialized) {
      return reply.code(400).send({ 
        error: 'Browser not running',
        browserRunning: false,
      });
    }

    if (state.isLinked) {
      return {
        success: true,
        linked: true,
        message: 'WhatsApp already linked',
      };
    }

    if (!state.qrCode) {
       return {
         success: false,
         linked: false,
         message: 'QR Code not generated yet',
       };
    }

    return {
      success: true,
      linked: false,
      image: state.qrCode, // Full Data URL
      mimeType: 'image/png', // Implicit in Data URL
      timestamp: new Date().toISOString(),
    };
  });

  /**
   * POST /screenshot/capture
   * No-op
   */
  fastify.post('/capture', async (request, reply) => {
    return { success: true };
  });
}
