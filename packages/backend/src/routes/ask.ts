import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyJWT, type AuthenticatedRequest } from '../middleware/auth.js';
import { createUserClient } from '../lib/supabase.js';

const askRequestSchema = z.object({
  query: z.string().min(1).max(1000),
});

export async function askRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/ask', {
    preHandler: verifyJWT,
  }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;

    // Validate request body
    const parseResult = askRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Invalid request body',
        details: parseResult.error.issues,
      });
    }

    // Create user-scoped Supabase client
    const supabase = createUserClient(authRequest.accessToken);

    // Insert usage event (no query content stored - privacy first)
    const { error: insertError } = await supabase
      .from('usage_events')
      .insert([{
        user_id: authRequest.userId,
        event_type: 'ask',
      }]);

    if (insertError) {
      fastify.log.error(insertError, 'Failed to insert usage event');
      // Don't fail the request for analytics errors
    }

    // Return stub response for now
    return {
      status: 'stub',
      request_id: crypto.randomUUID(),
      message: 'Query received. Full processing not yet implemented.',
    };
  });
}
