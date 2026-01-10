import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyJWT, type AuthenticatedRequest } from "../proxy/auth.js";
import { createUserClient, supabaseAdmin } from "../lib/supabase.js";
import { getMicrosoftAuthUrl, exchangeCodeForTokens, getUserProfile } from "../lib/microsoft.js";
import { encryptTokens } from "../lib/encryption.js";

const callbackSchema = z.object({
  code: z.string(),
  state: z.string(),
});

export async function microsoftRoutes(fastify: FastifyInstance): Promise<void> {
  // Get Microsoft connection status
  fastify.get(
    "/microsoft/status",
    {
      preHandler: verifyJWT,
    },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const supabase = createUserClient(authRequest.accessToken);

      const { data, error } = await supabase
        .from("connections")
        .select("email, scopes, created_at, token_expires_at")
        .eq("user_id", authRequest.userId)
        .eq("type", "microsoft")
        .single();

      if (error && error.code !== "PGRST116") {
        fastify.log.error(error, "Failed to fetch microsoft connection");
        return reply
          .code(500)
          .send({ error: "Failed to fetch connection status" });
      }

      if (!data) {
        return { connected: false };
      }

      const isExpired = new Date(data.token_expires_at) < new Date();

      return {
        connected: true,
        email: data.email,
        scopes: data.scopes,
        connectedAt: data.created_at,
        needsRefresh: isExpired,
      };
    }
  );

  // Get auth URL to connect Microsoft account
  fastify.get(
    "/microsoft/auth-url",
    {
      preHandler: verifyJWT,
    },
    async (request) => {
      const authRequest = request as AuthenticatedRequest;
      const state = JSON.stringify({
        userId: authRequest.userId,
        redirect: process.env.APP_URL + "/settings", // Redirect back to settings after auth
      });
      
      // We encode the state to make it URL safe
      const encodedState = Buffer.from(state).toString('base64');
      const url = getMicrosoftAuthUrl(encodedState);

      return { url };
    }
  );

  // Handle OAuth callback
  fastify.get(
    "/microsoft/callback",
    async (request, reply) => {
      try {
        const { code, state } = callbackSchema.parse(request.query);
        
        // Decode state
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
        const { userId, redirect } = decodedState;

        if (!userId) {
          return reply.code(400).send({ error: "Invalid state parameter" });
        }

        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code);
        
        // Get user profile
        const profile = await getUserProfile(tokens.access_token);
        
        if (!supabaseAdmin) {
          throw new Error("Supabase admin client not initialized");
        }

        // Encrypt tokens before storing
        const encrypted = encryptTokens({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || ''
        });

        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

        // Store in database using admin client (to bypass RLS for now/ensure robust write)
        const { error: upsertError } = await supabaseAdmin
          .from("connections")
          .upsert({
            user_id: userId,
            type: "microsoft",
            email: profile.email,
            access_token: encrypted.access_token,
            refresh_token: encrypted.refresh_token,
            token_expires_at: expiresAt.toISOString(),
            scopes: tokens.scope.split(' '),
            updated_at: new Date().toISOString(),
          }, {
              onConflict: 'user_id,type'
          });

        if (upsertError) {
          fastify.log.error(upsertError, "Failed to store microsoft connection");
          throw new Error("Failed to store connection");
        }

        // Redirect back to the app (using the redirect from state if provided, or default)
        const appUrl = process.env.APP_URL || process.env.WEBAPP_URL || "http://localhost:3000";
        const finalRedirect = redirect || `${appUrl}/settings`;
        
        return reply.redirect(`${finalRedirect}?microsoft_connected=true`);
      } catch (error) {
        fastify.log.error(error, "Microsoft callback failed");
        const appUrl = process.env.APP_URL || process.env.WEBAPP_URL || "http://localhost:3000";
        return reply.redirect(`${appUrl}/settings?microsoft_error=true`);
      }
    }
  );

  // Disconnect Microsoft account
  fastify.post(
    "/microsoft/disconnect",
    {
      preHandler: verifyJWT,
    },
    async (request, reply) => {
      const authRequest = request as AuthenticatedRequest;
      const supabase = createUserClient(authRequest.accessToken);

      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("user_id", authRequest.userId)
        .eq("type", "microsoft");

      if (error) {
        fastify.log.error(error, "Failed to disconnect microsoft");
        return reply.code(500).send({ error: "Failed to disconnect" });
      }

      return { success: true };
    }
  );
}
