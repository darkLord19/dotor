import pkg from 'whatsapp-web.js';
const { Client: ClientClass, LocalAuth } = pkg;
import { Client } from 'whatsapp-web.js';
import QRCode from 'qrcode';
import { EventEmitter } from 'events';

// Workaround for using both default import (for runtime) and named import (for types)
// In runtime, we use ClientClass from default export. In types, we use Client interface.
type ClientInstance = Client; 

export interface WhatsAppState {
  isInitialized: boolean;
  isLinked: boolean;
  qrCode: string | null; // Data URL
  userId: string | null;
  pushname?: string;
}

export class WhatsAppClient extends EventEmitter {
  private client: ClientInstance | null = null;
  private state: WhatsAppState = {
    isInitialized: false,
    isLinked: false,
    qrCode: null,
    userId: null,
  };
  private dataDir: string;

  constructor() {
    super();
    this.dataDir = process.env.CHROME_USER_DATA_DIR || './.wwebjs_auth';
  }

  getState(): WhatsAppState {
    return { ...this.state };
  }

  async initialize(userId: string) {
    if (this.client) {
      console.log('[WhatsAppClient] Already initialized');
      return;
    }

    console.log('[WhatsAppClient] Initializing client for user:', userId);
    this.state.userId = userId;
    this.state.isInitialized = true; // Mark as starting
    
    // Determine executable path based on environment
    // const isProduction = process.env.NODE_ENV === 'production';
    const executablePath = '/usr/bin/google-chrome-stable';
    // const macPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    
    // In Docker (production), use Linux path. Local dev uses Mac path.
    // const executablePath = isProduction ? linuxPath : (process.env.CHROME_BIN || macPath);

    // Use LocalAuth to persist session
    this.client = new ClientClass({
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: this.dataDir
      }),
      puppeteer: {
        headless: false,
        executablePath: executablePath,
        protocolTimeout: 60000, // Increase Protocol Timeout to 60s (default is 30s)
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled' 
        ],
        ignoreDefaultArgs: ['--enable-automation']
      }
    });

    this.setupEvents();

    try {
      await this.client.initialize();
      console.log('[WhatsAppClient] Client initialization started');
    } catch (error) {
      console.error('[WhatsAppClient] Initialization failed:', error);
      this.cleanup();
    }
  }

  private setupEvents() {
    if (!this.client) return;

    this.client.on('qr', async (qr: string) => {
      console.log('[WhatsAppClient] QR code received');
      try {
        // Generate Data URL for the QR code
        this.state.qrCode = await QRCode.toDataURL(qr);
        this.state.isLinked = false;
        this.emit('qr', this.state.qrCode);
      } catch (err) {
        console.error('[WhatsAppClient] Failed to generate QR code image:', err);
      }
    });

    this.client.on('ready', () => {
      console.log('[WhatsAppClient] Client is ready!');
      this.state.isLinked = true;
      this.state.qrCode = null;
      if (this.client?.info?.pushname) {
        this.state.pushname = this.client.info.pushname;
      }
      this.emit('ready');
      this.emit('status', this.state);
    });

    this.client.on('authenticated', () => {
      console.log('[WhatsAppClient] Authenticated');
      this.state.isLinked = true;
      this.state.qrCode = null;
      this.emit('authenticated');
    });

    this.client.on('auth_failure', (msg: string) => {
      console.error('[WhatsAppClient] Auth failure:', msg);
      this.state.isLinked = false;
      this.emit('auth_failure', msg);
    });

    this.client.on('disconnected', (reason: string) => {
      console.log('[WhatsAppClient] Disconnected:', reason);
      this.cleanup();
      this.emit('disconnected', reason);
    });
  }

  async destroy() {
    if (this.client) {
      console.log('[WhatsAppClient] Destroying client');
      try {
        await this.client.destroy();
      } catch (error) {
        console.error('[WhatsAppClient] Error destroying client:', error);
      }
    }
    this.cleanup();
  }

  private cleanup() {
    this.client = null;
    this.state = {
      isInitialized: false,
      isLinked: false,
      qrCode: null,
      userId: null,
    };
    this.emit('status', this.state);
  }

  async getContacts() {
    if (!this.client || !this.state.isLinked) {
      throw new Error('Client not ready');
    }
    return await this.client.getContacts();
  }

  async getChats() {
    if (!this.client || !this.state.isLinked) {
      throw new Error('Client not ready');
    }
    return await this.client.getChats();
  }

  async syncMessages(limit = 50) {
    if (!this.client || !this.state.isLinked) {
      throw new Error('Client not ready');
    }
    
    console.log('[WhatsAppClient] Syncing messages...');
    const chats = await this.client.getChats();
    const allMessages = [];
    
    // Process top 10 recent chats for now
    for (const chat of chats.slice(0, 10)) {
       try { 
        console.log(`[WhatsAppClient] Fetching messages for chat: ${chat.name || chat.id.user}`);
        const messages = await chat.fetchMessages({ limit });
        
        allMessages.push(...messages.map(m => ({
          id: m.id._serialized,
          chatId: m.fromMe ? m.to : m.from, // simplified
          chatName: chat.name || chat.id.user,
          sender: m.author || m.from,
          content: m.body,
          timestamp: new Date(m.timestamp * 1000).toISOString(),
          isFromMe: m.fromMe
        })));
       } catch (err) {
         console.error(`[WhatsAppClient] Failed to fetch messages for chat ${chat.id._serialized}:`, err);
       }
    }
    
    return allMessages;
  }
}

export const whatsAppClient = new WhatsAppClient();
