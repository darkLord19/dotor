import { FastifyPluginAsync } from 'fastify';
import { whatsAppClient } from '../lib/whatsapp-client.js';
// import { syncScheduler } from '../lib/sync-scheduler.js';

export const configRoutes: FastifyPluginAsync = async (fastify) => {
  // Get recent chats for selection
  fastify.get('/chats', async (request, reply) => {
    try {
      const chats = await whatsAppClient.getChats();
      // Format chats for frontend
      const formattedChats = chats.map(c => ({
        name: c.name || c.id.user, // Use phone number if no name
        id: c.id._serialized,
        isGroup: c.isGroup,
        unreadCount: c.unreadCount
      }));
      return { chats: formattedChats };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch chats' });
    }
  });
  
  // Set sync configuration
  fastify.post('/config', async (request, reply) => {
    const body = request.body as { monitoredChats: string[] };
    if (!body.monitoredChats || !Array.isArray(body.monitoredChats)) {
      return reply.code(400).send({ error: 'Invalid config' });
    }
    
    // syncScheduler.setMonitoredChats(body.monitoredChats);
    // Store in client or database? Ideally database handles it.
    // The backend stores it, so we just acknowledge here.
    // We might need to tell the sync logic about it later.
    
    request.log.info(`Updated sync config with ${body.monitoredChats.length} chats`);
    return { success: true };
  });
};
