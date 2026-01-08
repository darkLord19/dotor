import Fastify from 'fastify';
import cors from '@fastify/cors';
import { browserRoutes } from './routes/browser.js';
import { webhookRoutes } from './routes/webhook.js';
import { healthRoutes } from './routes/health.js';
import { syncRoutes } from './routes/sync.js';
import { screenshotRoutes } from './routes/screenshot.js';
import { syncScheduler } from './lib/sync-scheduler.js';
import { screenshotManager } from './lib/screenshot-manager.js';
import { browserManager } from './lib/browser-manager.js';
import { linkDetector } from './lib/link-detector.js';

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

  return fastify;
}

async function start() {
  const server = await buildServer();

  // Start the sync scheduler
  syncScheduler.start();

  // Set up link detection notification handler ONCE at startup
  // This ensures we don't miss the event
  linkDetector.on('notify-backend', async () => {
    console.log('[Server] notify-backend event received!');
    const browserState = browserManager.getState();
    const userId = browserState.userId;
    
    console.log('[Server] browserState:', JSON.stringify(browserState));
    
    if (!userId) {
      console.error('[Server] No userId available for backend notification');
      return;
    }
    
    try {
      const url = `${BACKEND_URL}/wa/linked`;
      console.log('[Server] WhatsApp linked, notifying backend for user:', userId);
      console.log('[Server] Calling URL:', url);
      console.log('[Server] API Key present:', !!WA_API_KEY);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': WA_API_KEY,
        },
        body: JSON.stringify({ userId }),
      });
      
      console.log('[Server] Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Server] Failed to notify backend:', errorText);
      } else {
        const result = await response.json();
        console.log('[Server] Backend notified of link successfully:', JSON.stringify(result));
      }
    } catch (err) {
      console.error('[Server] Failed to notify backend:', err);
    }
  });

  // Start screenshot capture and link detection when browser spawns
  browserManager.on('browser:spawn', ({ userId }) => {
    console.log('[Server] Browser spawned for user:', userId);
    screenshotManager.startAutoCapture();
    linkDetector.start();
  });

  // Stop screenshot capture when browser exits or links
  browserManager.on('browser:exit', () => {
    screenshotManager.clear();
    linkDetector.reset();
  });
  browserManager.on('browser:linked', ({ linked }) => {
    if (linked) {
      screenshotManager.stopAutoCapture();
    }
  });

  try {
    await server.listen({ port: PORT, host: HOST });
    server.log.info(`WA Browser Server listening on ${HOST}:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

start();
