import Fastify from 'fastify';
import cors from '@fastify/cors';
import { browserRoutes } from './routes/browser.js';
import { webhookRoutes } from './routes/webhook.js';
import { healthRoutes } from './routes/health.js';
import { syncRoutes } from './routes/sync.js';
import { screenshotRoutes } from './routes/screenshot.js';
import { configRoutes } from './routes/config.js';
import { whatsAppClient } from './lib/whatsapp-client.js';

const PORT = parseInt(process.env.PORT ?? '3002', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const BACKEND_URL = process.env.BACKEND_API_URL ?? process.env.BACKEND_URL ?? 'http://localhost:3001';
const WA_API_KEY = process.env.API_SECRET_KEY ?? process.env.WA_API_SECRET_KEY ?? '';

async function buildServer() {
  const isDev = process.env.NODE_ENV === 'development';

  const fastify = Fastify({
    logger: isDev
      ? {
          level: process.env.LOG_LEVEL ?? 'info',
          transport: {
            target: 'pino-pretty',
            options: { colorize: true },
          },
        }
      : {
          level: process.env.LOG_LEVEL ?? 'info',
        },
  });

  // Register CORS
  await fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server)
      if (!origin) {
        cb(null, true);
        return;
      }

      // In production, restrict to known origins
      const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) ?? [];
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }

      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(browserRoutes, { prefix: '/browser' });
  await fastify.register(webhookRoutes, { prefix: '/webhook' });
  await fastify.register(syncRoutes, { prefix: '/sync' });
  await fastify.register(screenshotRoutes, { prefix: '/screenshot' });
  await fastify.register(configRoutes, { prefix: '/wa' });

  return fastify;
}

async function start() {
  const server = await buildServer();

  // Set up WhatsApp client event handlers
  whatsAppClient.on('ready', async () => {
    console.log('[Server] WhatsApp Client ready!');
    const state = whatsAppClient.getState();
    const userId = state.userId;
    
    if (!userId) {
      console.error('[Server] No userId available on ready event');
      return;
    }
    
    try {
      const url = `${BACKEND_URL}/wa/linked`;
      console.log('[Server] Notifying backend about linkage for user:', userId);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': WA_API_KEY,
        },
        body: JSON.stringify({ 
          userId,
          linked: true,
          timestamp: new Date().toISOString()
        }),
      });

      if (!response.ok) {
        console.error(`[Server] Failed to notify backend: ${response.status} ${response.statusText}`);
      } else {
        console.log('[Server] Backend notified successfully');
        
        // Fetch and upload contacts immediately
        await syncContacts(userId);
      }
    } catch (error) {
      console.error('[Server] Error notifying backend:', error);
    }
  });

  whatsAppClient.on('disconnected', async () => {
    console.log('[Server] WhatsApp Client disconnected');
    // We could notify backend here too
  });

  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`[Server] WA Browser Server listening on ${HOST}:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

async function syncContacts(userId: string) {
  try {
    console.log('[Server] Syncing contacts...');
    const contacts = await whatsAppClient.getContacts();
    
    const formattedContacts = contacts.map(c => ({
      wa_id: c.id._serialized,
      name: c.name || c.pushname || c.shortName,
      short_name: c.shortName,
      pushname: c.pushname,
      is_business: c.isBusiness,
      is_group: c.isGroup,
      // profile_pic_url: can fetch separately but expensive
    }));

    const url = `${BACKEND_URL}/wa/contacts`;
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': WA_API_KEY,
      },
      body: JSON.stringify({ userId, contacts: formattedContacts }),
    });
    console.log(`[Server] Synced ${contacts.length} contacts`);
  } catch (error) {
    console.error('[Server] Failed to sync contacts:', error);
  }
}

start();
