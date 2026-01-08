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
        lastSeenAt: instance?.last_heartbeat ?? instance?.last_seen_at ?? null,
        lastSyncAt: instance?.last_sync_at ?? null,
        syncCount: instance?.total_synced ?? 0,
        browserRunning: liveStatus?.isRunning ?? false,
        isLinked,
        connectionId: connection?.id ?? null,
        browserInstanceId: connection?.browser_instance_id ?? instance?.id ?? null,
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

  // =========================================
  // Webhook endpoints (from WA browser server)
  // =========================================

  /**
   * POST /wa/linked
   * Called when WhatsApp login completes (QR scanned)
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

    // Insert messages
    const messagesToInsert = messages.map((msg) => ({
      user_id: userId,
      message_id: msg.id,
      chat_id: msg.chatId,
      chat_name: msg.chatName ?? null,
      sender: msg.sender,
      content: msg.content,
      message_timestamp: msg.timestamp,
      is_from_me: msg.isFromMe,
      received_at: receivedAt,
    }));

    const { error } = await supabaseAdmin
      .from("whatsapp_messages")
      .upsert(messagesToInsert, { onConflict: "user_id,message_id" });

    if (error) {
      fastify.log.error(error, "Failed to insert messages");
      return reply.code(500).send({ error: "Failed to store messages" });
    }

    // Update last seen
    await supabaseAdmin
      .from("browser_instances")
      .update({ last_seen_at: receivedAt })
      .eq("user_id", userId);

    fastify.log.info(`Stored ${messages.length} messages for user ${userId}`);

    return { success: true, stored: messages.length };
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
        .from("whatsapp_messages")
        .select("*")
        .eq("user_id", authRequest.userId)
        .order("received_at", { ascending: false })
        .limit(limit);

      if (query.chatId) {
        queryBuilder = queryBuilder.eq("chat_id", query.chatId);
      }

      const { data, error } = await queryBuilder;

      if (error) {
        fastify.log.error(error, "Failed to fetch messages");
        return reply.code(500).send({ error: "Failed to fetch messages" });
      }

      return { messages: data };
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

      // Get distinct chats with last message
      const { data, error } = await supabaseAdmin
        .from("whatsapp_messages")
        .select("chat_id, chat_name, content, received_at")
        .eq("user_id", authRequest.userId)
        .order("received_at", { ascending: false });

      if (error) {
        fastify.log.error(error, "Failed to fetch chats");
        return reply.code(500).send({ error: "Failed to fetch chats" });
      }

      // Group by chat_id and get latest message
      const chatMap = new Map<string, { chatId: string; chatName: string; lastMessage: string; lastMessageAt: string }>();
      for (const msg of data || []) {
        if (!chatMap.has(msg.chat_id)) {
          chatMap.set(msg.chat_id, {
            chatId: msg.chat_id,
            chatName: msg.chat_name || msg.chat_id,
            lastMessage: msg.content,
            lastMessageAt: msg.received_at,
          });
        }
      }

      return { chats: Array.from(chatMap.values()) };
    }
  );
}
