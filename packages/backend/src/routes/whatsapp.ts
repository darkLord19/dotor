import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { verifyJWT, type AuthenticatedRequest } from "../proxy/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";

// WA Browser Server URL
const WA_SERVER_URL = process.env.WA_BROWSER_SERVER_URL ?? "http://localhost:3002";
const WA_API_KEY = process.env.WA_API_SECRET_KEY ?? "";

// Schemas
const LinkedSchema = z.object({
  userId: z.string().uuid(),
  linked: z.boolean(),
  timestamp: z.string(),
});

const MessageBatchSchema = z.object({
  userId: z.string().uuid(),
  messages: z.array(
    z.object({
      id: z.string(),
      chatId: z.string(),
      chatName: z.string().optional(),
      sender: z.string(),
      content: z.string(),
      timestamp: z.string(),
      isFromMe: z.boolean(),
    })
  ),
  receivedAt: z.string(),
});

const ContactSchema = z.object({
  userId: z.string().uuid(),
  contacts: z.array(
    z.object({
      wa_id: z.string(),
      name: z.string().optional().nullable(),
      short_name: z.string().optional().nullable(),
      pushname: z.string().optional().nullable(),
      is_business: z.boolean().optional(),
      is_group: z.boolean().optional(),
      profile_pic_url: z.string().optional().nullable(),
    })
  ),
});

const EventSchema = z.object({
  event: z.string(),
  data: z.unknown(),
  timestamp: z.string(),
});

const SyncStatusSchema = z.object({
  userId: z.string().uuid(),
  lastSyncAt: z.string(),
  syncCount: z.number(),
});

/**
 * Verify API key from WA browser server
 */
function verifyApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  const apiKey = request.headers["x-api-key"] as string;
  
  if (!WA_API_KEY) {
    // Development mode - allow without key
    return true;
  }

  if (apiKey !== WA_API_KEY) {
    reply.code(401).send({ error: "Invalid API key" });
    return false;
  }

  return true;
}

export async function whatsappRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /wa/status
   * Get WhatsApp connection status for current user
   */
  fastify.get(
    "/wa/status",
    {
      preHandler: verifyJWT,
    },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;

      if (!supabaseAdmin) {
        return reply.code(500).send({ error: "Database not configured" });
      }

      // Get browser instance status
      const { data: instance, error } = await supabaseAdmin
        .from("browser_instances")
        .select("*")
        .eq("user_id", authRequest.userId)
        .single();

      if (error && error.code !== "PGRST116") {
        fastify.log.error(error, "Failed to fetch browser instance");
        return reply.code(500).send({ error: "Failed to fetch status" });
      }

      // Check for WhatsApp connection record (persistent link status)
      const { data: connection } = await supabaseAdmin
        .from("connections")
        .select("id, updated_at, browser_instance_id")
        .eq("user_id", authRequest.userId)
        .eq("type", "whatsapp")
        .single();

      const hasConnection = !!connection;

      // Also check with WA server for live status
      let liveStatus: { isRunning?: boolean; isLinked?: boolean } | null = null;
      try {
        const response = await fetch(`${WA_SERVER_URL}/browser/status`, {
          headers: { "X-API-Key": WA_API_KEY },
        });
        if (response.ok) {
          liveStatus = await response.json() as { isRunning?: boolean; isLinked?: boolean };
        }
      } catch (err) {
        fastify.log.warn("Failed to fetch live status from WA server");
      }

      // isLinked is true if:
      // 1. We have a connection record (persisted from previous session), OR
      // 2. Live status from WA server says it's linked
      const isLinked = hasConnection || (liveStatus?.isLinked ?? false);

      return {
        connected: instance?.status === "linked" || hasConnection,
        status: instance?.status ?? (hasConnection ? "linked" : "disconnected"),
        lastSeenAt: instance?.last_seen_at ?? null,
        lastSyncAt: instance?.last_sync_at ?? null,
        syncCount: instance?.sync_count ?? 0,
        browserRunning: liveStatus?.isRunning ?? false,
        isLinked,
        // @ts-ignore
        connectionId: connection?.id ?? null,
        browserInstanceId: instance?.id ?? null,
      };
    }
  );

  /**
   * GET /wa/screenshot
   * Get screenshot of the browser (for QR code display)
   */
  fastify.get(
    "/wa/screenshot",
    {
      preHandler: verifyJWT,
    },
    async (_request, reply) => {
      try {
        const response = await fetch(`${WA_SERVER_URL}/screenshot`, {
          headers: { "X-API-Key": WA_API_KEY },
        });

        const result = await response.json();

        if (!response.ok) {
          return reply.code(response.status).send(result);
        }

        return result;
      } catch (err) {
        fastify.log.error(err, "Failed to get screenshot");
        return reply.code(502).send({ error: "Failed to connect to browser server" });
      }
    }
  );

  /**
   * POST /wa/browser/spawn
   * Start a browser instance for the current user
   */
  fastify.post(
    "/wa/browser/spawn",
    {
      preHandler: verifyJWT,
    },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;

      if (!supabaseAdmin) {
        return reply.code(500).send({ error: "Database not configured" });
      }

      // Check if user already has a running browser
      const { data: existing } = await supabaseAdmin
        .from("browser_instances")
        .select("status")
        .eq("user_id", authRequest.userId)
        .single();

      if (existing?.status === "running" || existing?.status === "linked") {
        return reply.code(409).send({ error: "Browser already running" });
      }

      // Request browser spawn from WA server
      try {
        const response = await fetch(`${WA_SERVER_URL}/browser/spawn`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": WA_API_KEY,
          },
          body: JSON.stringify({ userId: authRequest.userId }),
        });

        const result = await response.json();

        if (!response.ok) {
          return reply.code(response.status).send(result);
        }

        // Update database
        await supabaseAdmin.from("browser_instances").upsert({
          user_id: authRequest.userId,
          status: "running",
          last_seen_at: new Date().toISOString(),
        });

        return {
          success: true,
          message: "Browser spawned. Scan QR code to login.",
        };
      } catch (err) {
        fastify.log.error(err, "Failed to spawn browser");
        return reply.code(502).send({ error: "Failed to connect to browser server" });
      }
    }
  );

  /**
   * POST /wa/browser/stop
   * Stop the browser instance
   */
  fastify.post(
    "/wa/browser/stop",
    {
      preHandler: verifyJWT,
    },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;

      if (!supabaseAdmin) {
        return reply.code(500).send({ error: "Database not configured" });
      }

      try {
        const response = await fetch(`${WA_SERVER_URL}/browser/stop`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": WA_API_KEY,
          },
          body: JSON.stringify({ userId: authRequest.userId }),
        });

        const result = await response.json();

        if (!response.ok) {
          return reply.code(response.status).send(result);
        }

        // Update database
        await supabaseAdmin
          .from("browser_instances")
          .update({ status: "stopped" })
          .eq("user_id", authRequest.userId);

        return { success: true, message: "Browser stopped" };
      } catch (err) {
        fastify.log.error(err, "Failed to stop browser");
        return reply.code(502).send({ error: "Failed to connect to browser server" });
      }
    }
  );

  /**
   * DELETE /wa/disconnect
   * Disconnect WhatsApp (clear session)
   */
  fastify.delete(
    "/wa/disconnect",
    {
      preHandler: verifyJWT,
    },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;

      if (!supabaseAdmin) {
        return reply.code(500).send({ error: "Database not configured" });
      }

      // Stop browser if running
      try {
        await fetch(`${WA_SERVER_URL}/browser/stop`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": WA_API_KEY,
          },
          body: JSON.stringify({ userId: authRequest.userId }),
        });
      } catch {
        // Ignore errors
      }

      // Delete browser instance record
      await supabaseAdmin
        .from("browser_instances")
        .delete()
        .eq("user_id", authRequest.userId);

      // Delete WhatsApp connection record
      await supabaseAdmin
        .from("connections")
        .delete()
        .eq("user_id", authRequest.userId)
        .eq("type", "whatsapp");

      // Optionally delete messages
      // await supabaseAdmin
      //   .from("whatsapp_messages")
      //   .delete()
      //   .eq("user_id", authRequest.userId);

      return { success: true, message: "WhatsApp disconnected" };
    }
  );

  /**
   * POST /wa/sync/trigger
   * Manually trigger a sync for the current user
   */
  fastify.post(
    "/wa/sync/trigger",
    {
      preHandler: verifyJWT,
    },
    async (_request, reply) => {
      // Forward to WA server
      try {
        const response = await fetch(`${WA_SERVER_URL}/sync/trigger`, {
          method: "POST",
          headers: {
            "X-API-Key": WA_API_KEY,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return reply.code(response.status).send(result);
        }

        return {
          success: true,
          message: "Sync triggered",
          syncId: (result as { syncId?: string }).syncId,
        };
      } catch (err) {
        fastify.log.error(err, "Failed to trigger sync");
        return reply.code(502).send({ error: "Failed to connect to browser server" });
      }
    }
  );

  /**
   * GET /wa/sync/status
   * Get sync status from WA server
   */
  fastify.get(
    "/wa/sync/status",
    {
      preHandler: verifyJWT,
    },
    async (_request, reply) => {
      // Forward to WA server
      try {
        const response = await fetch(`${WA_SERVER_URL}/sync/status`, {
          headers: { "X-API-Key": WA_API_KEY },
        });

        if (!response.ok) {
          return reply.code(response.status).send({ error: "Failed to get sync status" });
        }

        const result = await response.json();
        return result;
      } catch (err) {
        fastify.log.error(err, "Failed to get sync status");
        return reply.code(502).send({ error: "Failed to connect to browser server" });
      }
    }
  );

  /**
   * GET /wa/live-chats
   * Proxy to browser server to get recent chats
   */
  fastify.get(
    "/wa/live-chats",
    {
      preHandler: verifyJWT,
    },
    async (_request, reply) => {
      try {
        const response = await fetch(`${WA_SERVER_URL}/wa/chats`, {
          headers: {
            "X-API-Key": WA_API_KEY,
          },
        });

        if (!response.ok) {
          throw new Error(`Browser server error: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
      } catch (error) {
        fastify.log.error(error, "Failed to fetch chats from browser server");
        return reply.code(502).send({ error: "Failed to fetch chats" });
      }
    }
  );

  /**
   * POST /wa/config
   * Save sync configuration
   */
  fastify.post(
    "/wa/config",
    {
      preHandler: verifyJWT,
    },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const bodySchema = z.object({
        monitoredChats: z.array(z.string()),
      });

      const parseResult = bodySchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.code(400).send({ error: "Invalid request body" });
      }

      const { monitoredChats } = parseResult.data;

      if (!supabaseAdmin) {
        return reply.code(500).send({ error: "Database not configured" });
      }

      // 1. Save to database
      const { error } = await supabaseAdmin
        .from("connections")
        .update({ sync_config: { monitoredChats } } as any)
        .eq("user_id", authRequest.userId)
        .eq("type", "whatsapp");

      if (error) {
        fastify.log.error(error, "Failed to update connection config");
        return reply.code(500).send({ error: "Database update failed" });
      }

      // 2. Forward to browser server
      try {
        await fetch(`${WA_SERVER_URL}/wa/config`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": WA_API_KEY,
          },
          body: JSON.stringify({ monitoredChats }),
        });
      } catch (error) {
        // Log but don't fail, as DB update succeeded
        fastify.log.warn(error, "Failed to push config to browser server");
      }

      return { success: true };
    }
  );

  /**
   * POST /wa/linked
   * Called by browser server when WhatsApp linkage is detected
   * Creates/updates connection record and browser instance status
   */
  fastify.post("/wa/linked", async (request, reply) => {
    fastify.log.info("POST /wa/linked called");
    fastify.log.info({ body: request.body }, "Request body");
    
    if (!verifyApiKey(request, reply)) {
      fastify.log.warn("API key verification failed");
      return;
    }

    // Accept either format: { userId } or { userId, linked, timestamp }
    const bodySimple = z.object({ userId: z.string().uuid() }).safeParse(request.body);
    const bodyFull = LinkedSchema.safeParse(request.body);
    
    let userId: string;
    let linked = true;
    let timestamp = new Date().toISOString();

    if (bodyFull.success) {
      userId = bodyFull.data.userId;
      linked = bodyFull.data.linked;
      timestamp = bodyFull.data.timestamp;
      fastify.log.info({ userId, linked, timestamp }, "Parsed full body");
    } else if (bodySimple.success) {
      userId = bodySimple.data.userId;
      fastify.log.info({ userId }, "Parsed simple body");
    } else {
      fastify.log.error({ bodySimple: bodySimple.error, bodyFull: bodyFull.error }, "Failed to parse body");
      return reply.code(400).send({ error: "Invalid request - userId required" });
    }

    if (!supabaseAdmin) {
      fastify.log.error("supabaseAdmin not configured");
      return reply.code(500).send({ error: "Database not configured" });
    }

    fastify.log.info({ userId, linked }, "Upserting browser instance");
    
    // Upsert browser instance and get its ID
    const { data: browserInstance, error: browserError } = await supabaseAdmin
      .from("browser_instances")
      .upsert({
        user_id: userId,
        fly_machine_id: `local-${userId.slice(0, 8)}`, // Local development identifier
        status: linked ? "linked" : "running",
        linked_at: linked ? timestamp : null,
        last_heartbeat: timestamp,
        updated_at: timestamp,
      }, {
        onConflict: 'user_id',
      })
      .select('id')
      .single();

    if (browserError) {
      fastify.log.error(browserError, "Failed to upsert browser instance");
      return reply.code(500).send({ error: "Failed to update browser instance" });
    }

    const browserInstanceId = browserInstance?.id;
    fastify.log.info({ browserInstanceId }, "Browser instance upserted");

    // Create or update WhatsApp connection record
    if (linked) {
      fastify.log.info("Checking for existing WhatsApp connection");
      
      // Check if connection already exists
      const { data: existingConn, error: selectError } = await supabaseAdmin
        .from("connections")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "whatsapp")
        .single();

      if (selectError && selectError.code !== "PGRST116") {
        fastify.log.error(selectError, "Error checking existing connection");
      }
      
      fastify.log.info({ existingConn }, "Existing connection check result");

      if (!existingConn) {
        fastify.log.info("No existing connection, creating new one");
        
        // Create new WhatsApp connection linked to browser instance
        const { data: newConn, error: connError } = await supabaseAdmin.from("connections").insert({
          user_id: userId,
          type: "whatsapp",
          access_token: "browser-session", // Placeholder since we use browser session
          refresh_token: "",
          token_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
          scopes: ["messages.read"],
          browser_instance_id: browserInstanceId,
          created_at: timestamp,
          updated_at: timestamp,
        }).select('id').single();
        
        if (connError) {
          fastify.log.error(connError, "Failed to create WhatsApp connection");
        } else {
          fastify.log.info({ connectionId: newConn?.id }, `Created WhatsApp connection for user ${userId} with browser instance ${browserInstanceId}`);
        }
      } else {
        fastify.log.info({ existingConnId: existingConn.id }, "Updating existing connection");
        
        // Update existing connection with browser instance link
        const { error: updateError } = await supabaseAdmin
          .from("connections")
          .update({ 
            updated_at: timestamp,
            browser_instance_id: browserInstanceId,
          })
          .eq("id", existingConn.id);
        
        if (updateError) {
          fastify.log.error(updateError, "Failed to update connection");
        } else {
          fastify.log.info(`Updated WhatsApp connection for user ${userId}`);
        }
      }
    } else {
      fastify.log.info("Unlinking - removing connection");
      // Unlinked - remove connection
      await supabaseAdmin
        .from("connections")
        .delete()
        .eq("user_id", userId)
        .eq("type", "whatsapp");
    }

    fastify.log.info(`WhatsApp ${linked ? "linked" : "unlinked"} for user ${userId}`);

    return { success: true, linked, browserInstanceId };
  });

  /**
   * POST /wa/sync-status
   * Called when sync completes to update sync tracking
   */
  fastify.post("/wa/sync-status", async (request, reply) => {
    if (!verifyApiKey(request, reply)) return;

    const body = SyncStatusSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid request", details: body.error.issues });
    }

    if (!supabaseAdmin) {
      return reply.code(500).send({ error: "Database not configured" });
    }

    const { userId, lastSyncAt, syncCount } = body.data;

    // Update browser instance with sync info
    await supabaseAdmin
      .from("browser_instances")
      .update({
        last_sync_at: lastSyncAt,
        sync_count: syncCount,
        last_seen_at: lastSyncAt,
      })
      .eq("user_id", userId);

    fastify.log.info(`Sync completed for user ${userId}, count: ${syncCount}`);

    return { success: true };
  });

  /**
   * POST /wa/contacts
   * Store synced contacts
   */
  fastify.post("/wa/contacts", async (request, reply) => {
    if (!verifyApiKey(request, reply)) return;

    const body = ContactSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid request", details: body.error.issues });
    }

    if (!supabaseAdmin) {
      return reply.code(500).send({ error: "Database not configured" });
    }

    const { userId, contacts } = body.data;
    
    // Prepare upsert
    // const toUpsert = contacts.map(c => ({ ... }));

    // Upsert in batches of 1000
    // Note: whatsapp_contacts table is deprecated/removed. 
    // Skipping storage for now until a generic contacts solution is in place.
    /*
    for (let i = 0; i < toUpsert.length; i += 1000) {
      const batch = toUpsert.slice(i, i + 1000);
      const { error } = await supabaseAdmin
        .from("whatsapp_contacts")
        .upsert(batch, { onConflict: "user_id,wa_id" });

      if (error) {
        fastify.log.error(error, "Failed to upsert contacts batch");
      }
    }
    */

    fastify.log.info(`Synced ${contacts.length} contacts for user ${userId} (Storage skipped - table removed)`);
    return { success: true, count: contacts.length };
  });

  /**
   * POST /wa/messages/batch
   * Called when new messages are detected
   */
  fastify.post("/wa/messages/batch", async (request, reply) => {
    if (!verifyApiKey(request, reply)) return;

    const body = MessageBatchSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid request", details: body.error.issues });
    }

    if (!supabaseAdmin) {
      return reply.code(500).send({ error: "Database not configured" });
    }

    const { userId, messages, receivedAt } = body.data;

    // Group messages by chat
    const chats: Record<string, any[]> = {};
    const chatNames: Record<string, string> = {};

    for (const msg of messages) {
      if (!chats[msg.chatId]) chats[msg.chatId] = [];
      
      chats[msg.chatId]!.push({
        id: msg.id,
        sender: msg.sender,
        content: msg.content,
        timestamp: msg.timestamp,
        isFromMe: msg.isFromMe,
        receivedAt: receivedAt
      });
      
      if (msg.chatName) chatNames[msg.chatId] = msg.chatName;
    }

    let storedCount = 0;

    // Process each chat
    for (const [chatId, chatMessages] of Object.entries(chats)) {
      try {
        // 1. Fetch or create synced_conversation
        let conversationId: string | undefined;

        const { data: existing } = await supabaseAdmin
          .from('synced_conversations')
          .select('id')
          .eq('user_id', userId)
          .eq('source', 'whatsapp')
          .eq('external_id', chatId)
          .single();

        if (existing) {
          conversationId = existing.id;
          // Update timestamp and title
          await supabaseAdmin
            .from('synced_conversations')
            .update({ 
              updated_at: new Date().toISOString(),
              title: chatNames[chatId] || null
            })
            .eq('id', conversationId);
        } else {
          // Create new conversation
          const { data: newConv } = await supabaseAdmin
            .from('synced_conversations')
            .insert({
              user_id: userId,
              source: 'whatsapp',
              external_id: chatId,
              title: chatNames[chatId] || chatId,
              // metadata: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single();
          
          if (newConv) conversationId = newConv.id;
        }

        if (conversationId) {
          // 2. Insert individual synced_messages
          const messagesToInsert = chatMessages.map(m => ({
            conversation_id: conversationId,
            user_id: userId,
            external_id: m.id,
            sender: m.sender,
            content: m.content,
            timestamp: m.timestamp,
            received_at: m.receivedAt,
            is_from_me: m.isFromMe,
            created_at: new Date().toISOString()
          }));

          // Use upsert to avoid duplicates
          const { error } = await supabaseAdmin
            .from('synced_messages')
            .upsert(messagesToInsert, { onConflict: 'user_id,conversation_id,external_id' });
            
          if (error) {
             fastify.log.error(error, `Failed to insert synced messages for ${chatId}`);
          } else {
             storedCount += chatMessages.length;
          }
        }
      } catch (err) {
        fastify.log.error(err, `Failed to sync conversation ${chatId}`);
      }
    }

    // Update last seen
    await supabaseAdmin
      .from("browser_instances")
      .update({ last_seen_at: receivedAt })
      .eq("user_id", userId);

    fastify.log.info(`Stored ${storedCount} messages for user ${userId} in synced_messages table`);

    return { success: true, stored: storedCount };
  });

  /**
   * POST /wa/events
   * Generic event handler from WA server
   */
  fastify.post("/wa/events", async (request, reply) => {
    if (!verifyApiKey(request, reply)) return;

    const body = EventSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "Invalid request" });
    }

    const { event, data, timestamp } = body.data;

    fastify.log.info({ event, data, timestamp }, "WA event received");

    // Handle specific events
    if (event === "browser:idle-timeout" && supabaseAdmin) {
      const eventData = data as { userId?: string };
      if (eventData.userId) {
        await supabaseAdmin
          .from("browser_instances")
          .update({ status: "idle-timeout" })
          .eq("user_id", eventData.userId);
      }
    }

    return { success: true };
  });

  /**
   * GET /wa/messages
   * Get recent WhatsApp messages for current user
   */
  fastify.get(
    "/wa/messages",
    {
      preHandler: verifyJWT,
    },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const query = request.query as { limit?: string; chatId?: string };

      if (!supabaseAdmin) {
        return reply.code(500).send({ error: "Database not configured" });
      }

      const limit = Math.min(parseInt(query.limit ?? "50", 10), 100);

      let queryBuilder = supabaseAdmin
        .from("synced_messages")
        .select("*, synced_conversations!inner(title, external_id)")
        .eq("user_id", authRequest.userId)
        .order("timestamp", { ascending: false })
        .limit(limit);

      if (query.chatId) {
        queryBuilder = queryBuilder.eq("synced_conversations.external_id", query.chatId);
      }

      const { data, error } = await queryBuilder;

      if (error) {
        fastify.log.error(error, "Failed to fetch messages");
        return reply.code(500).send({ error: "Failed to fetch messages" });
      }

      // Map to frontend expectation
      const messages = (data || []).map((m: any) => ({
             user_id: m.user_id,
             message_id: m.external_id,
             chat_id: m.synced_conversations?.external_id,
             chat_name: m.synced_conversations?.title,
             sender: m.sender,
             content: m.content,
             message_timestamp: m.timestamp,
             is_from_me: m.is_from_me,
             received_at: m.received_at
      }));

      return { messages };
    }
  );

  /**
   * GET /wa/chats
   * Get list of chats with recent messages
   */
  fastify.get(
    "/wa/chats",
    {
      preHandler: verifyJWT,
    },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;

      if (!supabaseAdmin) {
        return reply.code(500).send({ error: "Database not configured" });
      }

      // Get conversations from 'synced_conversations' table
      const { data, error } = await supabaseAdmin
        .from("synced_conversations")
        .select("id, external_id, title, updated_at")
        .eq("user_id", authRequest.userId)
        .eq("source", "whatsapp")
        .order("updated_at", { ascending: false });

      if (error) {
        fastify.log.error(error, "Failed to fetch chats");
        return reply.code(500).send({ error: "Failed to fetch chats" });
      }

      // Fetch latest message for each chat explicitly from synced_messages
      // This is a bit expensive, N+1 problem. Optimally we'd use a join or view.
      // For now, let's keep it simple.
      const chats = await Promise.all((data || []).map(async (conv: any) => {
        const { data: lastMsg } = await supabaseAdmin!
            .from("synced_messages")
            .select("content, timestamp")
            .eq("conversation_id", conv.id)
            .order("timestamp", { ascending: false })
            .limit(1)
            .single();

        return {
          chatId: conv.external_id,
          chatName: conv.title || conv.external_id,
          lastMessage: lastMsg?.content || "",
          lastMessageAt: lastMsg?.timestamp || conv.updated_at
        };
      }));

      return { chats };
    }
  );
}
