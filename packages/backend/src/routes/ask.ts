import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyJWT, type AuthenticatedRequest } from '../proxy/auth.js';
import { createUserClient, supabaseAdmin } from '../lib/supabase.js';
import { planQuery, type Message } from '../lib/openai.js';
import { mergeResults } from '../lib/normalizer.js';
import { refreshAccessToken } from '../lib/calendar.js';
import { refreshAccessToken as refreshMicrosoftToken } from '../lib/microsoft.js';
import { synthesizeAnswer } from '../lib/synthesizer.js';
import { decryptTokens, encrypt, encryptTokens } from '../lib/encryption.js';
import { getFeatureFlags, type FeatureFlags } from '../lib/feature-flags.js';
import type { SearchHit, PendingSearch } from '../types/search.js';
import { GmailService } from '../services/gmail-service.js';
import { OutlookService } from '../services/outlook-service.js';
import { CalendarService } from '../services/calendar-service.js';
import { WhatsAppService } from '../services/whatsapp-service.js';

const askRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  conversationId: z.string().uuid().optional(),
  flags: z.object({
    enableLinkedIn: z.boolean().optional(),
    enableWhatsApp: z.boolean().optional(),
    enableGmail: z.boolean().optional(),
  }).optional(),
});

// In-memory store for pending searches (would use Redis in production)
const pendingSearches = new Map<string, PendingSearch>();

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

    const { query, conversationId, flags: requestFlags } = parseResult.data;
    const requestId = crypto.randomUUID();

    // Create user-scoped Supabase client
    const supabase = createUserClient(authRequest.accessToken);

    // Clean up expired conversations for this user (older than 10 minutes)
    const tenMinutesAgoISO = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabase
      .from('conversations')
      .delete()
      .eq('user_id', authRequest.userId)
      .neq('source', 'whatsapp') // Protect WhatsApp data
      .lt('updated_at', tenMinutesAgoISO);

    // Handle conversation history
    let conversationHistory: Message[] = [];
    let currentConversationId = conversationId;

    if (currentConversationId) {
      const { data: conversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', currentConversationId)
        .single();

      if (conversation) {
        // Check if expired (10 mins)
        const updatedAt = new Date(conversation.updated_at);
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

        if (updatedAt < tenMinutesAgo) {
          currentConversationId = undefined; // Expired
        } else {
          conversationHistory = conversation.messages as unknown as Message[];
        }
      } else {
        currentConversationId = undefined; // Not found
      }
    }

    if (!currentConversationId) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert([{
          user_id: authRequest.userId,
          messages: [],
          source: 'ask'
        }])
        .select()
        .single();

      if (newConv) currentConversationId = newConv.id;
    }

    // Insert usage event
    const { error: insertError } = await supabase
      .from('usage_events')
      .insert([{
        user_id: authRequest.userId,
        event_type: 'ask',
      }]);

    if (insertError) {
      fastify.log.error(insertError, 'Failed to insert usage event');
    }

    // Get all user connections
    const { data: connections, error: connectionsError } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', authRequest.userId);

    if (connectionsError) {
      fastify.log.error(connectionsError, 'Failed to fetch connections');
    }

    const googleConnection = connections?.find(c => c.type === 'google');
    const microsoftConnection = connections?.find(c => c.type === 'microsoft');

    // Helper: Decrypt tokens safely
    const decorateWithDecryptedTokens = (conn: any) => {
      try {
        const tokens = decryptTokens({
          access_token: conn.access_token,
          refresh_token: conn.refresh_token,
        });
        conn.access_token_decrypted = tokens.access_token;
        conn.refresh_token_decrypted = tokens.refresh_token;
        return true;
      } catch (e) {
        fastify.log.error(e, `Failed to decrypt ${conn.type} tokens`);
        return false;
      }
    };

    if (googleConnection) decorateWithDecryptedTokens(googleConnection);
    if (microsoftConnection) decorateWithDecryptedTokens(microsoftConnection);

    // Pre-emptive Token Refresh Logic (keep inline for simplicity/safety before parallel search)
    // We could move this to services too, but doing it here ensures fresh tokens for all services sharing the connection
    if (googleConnection && (googleConnection as any).access_token_decrypted) {
      const expires = googleConnection.token_expires_at ? new Date(googleConnection.token_expires_at) : null;
      if (!expires || expires < new Date()) {
        try {
          fastify.log.info('Refreshing Google access token');
          const newTokens = await refreshAccessToken((googleConnection as any).refresh_token_decrypted);
          if (newTokens.access_token) {
            (googleConnection as any).access_token_decrypted = newTokens.access_token;
            if (supabaseAdmin) {
              const encrypted = encrypt(newTokens.access_token);
              await supabaseAdmin.from('connections').update({
                access_token: encrypted,
                token_expires_at: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
              }).eq('id', googleConnection.id);
            }
          }
        } catch (e) { fastify.log.error(e, 'Failed to refresh Google token'); }
      }
    }

    if (microsoftConnection && (microsoftConnection as any).access_token_decrypted) {
      const expires = microsoftConnection.token_expires_at ? new Date(microsoftConnection.token_expires_at) : null;
      if (!expires || expires < new Date()) {
        try {
          fastify.log.info('Refreshing Microsoft access token');
          const newTokens = await refreshMicrosoftToken((microsoftConnection as any).refresh_token_decrypted || '');
          if (newTokens.access_token) {
            (microsoftConnection as any).access_token_decrypted = newTokens.access_token;
            if (supabaseAdmin) {
              const encrypted = encryptTokens({
                access_token: newTokens.access_token,
                refresh_token: newTokens.refresh_token || (microsoftConnection as any).refresh_token_decrypted,
              });
              await supabaseAdmin.from('connections').update({
                access_token: encrypted.access_token,
                refresh_token: encrypted.refresh_token,
                token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
              }).eq('id', microsoftConnection.id);
            }
          }
        } catch (e) { fastify.log.error(e, 'Failed to refresh Microsoft token'); }
      }
    }

    try {
      // Step 0: Get feature flags
      const dbFlags = await getFeatureFlags(authRequest.userId);
      const hasEmailConnection = !!(googleConnection || microsoftConnection);
      const hasWhatsAppConnection = connections?.some(c => c.type === 'whatsapp') || false;

      const featureFlags: FeatureFlags = {
        ...dbFlags,
        enableLinkedIn: requestFlags?.enableLinkedIn ?? dbFlags.enableLinkedIn,
        enableWhatsApp: requestFlags?.enableWhatsApp ?? (hasWhatsAppConnection || dbFlags.enableWhatsApp),
        enableGmail: requestFlags?.enableGmail ?? (hasEmailConnection || dbFlags.enableGmail),
        enableOutlook: (hasEmailConnection || dbFlags.enableOutlook),
      };

      // Step 1: Plan
      fastify.log.info({ query }, 'Planning query');
      const plan = await planQuery(query, conversationHistory, featureFlags);
      const { analysis, gmail: gmailPlan, outlook: outlookPlan, whatsapp: whatsappPlan } = plan;

      fastify.log.info({ analysis }, 'Query planning complete');

      const sourcesNeeded: string[] = [];
      const searchPromises: Promise<SearchHit[]>[] = [];

      // Step 2: Execute Searches in Parallel

      // Gmail
      if (analysis.needsGmail && gmailPlan && googleConnection) {
        sourcesNeeded.push('gmail');
        const maxResults = gmailPlan.intent === 'summary' || gmailPlan.intent === 'count' ? 20 : 10;
        searchPromises.push(
          GmailService.search({
            connection: googleConnection as any,
            query: gmailPlan.gmailQuery,
            maxResults,
            logger: fastify.log,
            supabaseAdmin: (supabaseAdmin as any) ?? undefined
          })
        );
      }

      // Outlook
      if (analysis.needsOutlook && outlookPlan && microsoftConnection) {
        sourcesNeeded.push('outlook');
        const maxResults = outlookPlan.intent === 'summary' || outlookPlan.intent === 'count' ? 20 : 10;
        searchPromises.push(
          OutlookService.search({
            connection: microsoftConnection as any,
            query: outlookPlan.outlookQuery,
            maxResults,
            logger: fastify.log,
            supabaseAdmin: (supabaseAdmin as any) ?? undefined
          })
        );
      }

      // Calendar (Google + Outlook)
      if (analysis.needsCalendar) {
        sourcesNeeded.push('calendar');
        const startDate = analysis.calendarDateRange?.start ? new Date(analysis.calendarDateRange.start) : undefined;
        const endDate = analysis.calendarDateRange?.end ? new Date(analysis.calendarDateRange.end) : undefined;

        searchPromises.push(
          CalendarService.getEvents({
            googleConnection: googleConnection as any,
            microsoftConnection: microsoftConnection as any,
            startDate,
            endDate,
            logger: fastify.log,
            supabaseAdmin: (supabaseAdmin as any) ?? undefined
          })
        );
      }

      // WhatsApp
      if (featureFlags.enableWhatsApp && analysis.needsWhatsApp && whatsappPlan) {
        sourcesNeeded.push('whatsapp');
        searchPromises.push(
          WhatsAppService.search({
            supabase,
            userId: authRequest.userId,
            plan: whatsappPlan,
            logger: fastify.log
          })
        );
      }

      // Await all searches
      const resultsSettled = await Promise.allSettled(searchPromises);
      const allResults: SearchHit[] = [];

      resultsSettled.forEach(result => {
        if (result.status === 'fulfilled') {
          allResults.push(...result.value);
        } else {
          fastify.log.error(result.reason, 'A search service failed');
        }
      });

      // Step 3: Synthesize
      const mergedResults = mergeResults(allResults);
      fastify.log.info({ totalResults: mergedResults.length }, 'Synthesizing answer');

      const answer = await synthesizeAnswer(query, mergedResults, conversationHistory);

      // Update history
      if (currentConversationId) {
        const updatedHistory: Message[] = [
          ...conversationHistory,
          {
            role: 'user',
            content: query,
            metadata: {
              queryAnalysis: analysis,
              ...(gmailPlan ? { gmailPlan } : {}),
              ...(outlookPlan ? { outlookPlan } : {}),
              ...(whatsappPlan ? { whatsappPlan } : {}),
            }
          },
          { role: 'assistant', content: answer.answer }
        ];

        await supabase
          .from('conversations')
          .update({
            messages: updatedHistory as any,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentConversationId);
      }

      return {
        status: 'complete',
        request_id: requestId,
        answer,
        sources_searched: sourcesNeeded,
        conversationId: currentConversationId,
      };

    } catch (error) {
      fastify.log.error(error, 'Ask processing failed');
      return reply.code(500).send({
        error: 'Failed to process query',
        request_id: requestId,
      });
    }
  });

  // Get pending search status
  fastify.get('/ask/:requestId', {
    preHandler: verifyJWT,
  }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const { requestId } = request.params as { requestId: string };

    const pendingSearch = pendingSearches.get(requestId);

    if (!pendingSearch) {
      return reply.code(404).send({ error: 'Search not found' });
    }

    if (pendingSearch.user_id !== authRequest.userId) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const response: any = {
      status: pendingSearch.status,
      request_id: requestId,
      sources_needed: pendingSearch.sources_needed,
    };

    if (pendingSearch.status === 'complete' && pendingSearch.answer) {
      response.answer = pendingSearch.answer;
    }

    return response;
  });

  // Get pending search status (Legacy)
  fastify.get('/ask/:requestId/status', {
    preHandler: verifyJWT,
  }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const { requestId } = request.params as { requestId: string };

    const pendingSearch = pendingSearches.get(requestId);

    if (!pendingSearch) {
      return reply.code(404).send({ error: 'Search not found' });
    }

    if (pendingSearch.user_id !== authRequest.userId) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const response: any = {
      status: pendingSearch.status,
      request_id: requestId,
      sources_needed: pendingSearch.sources_needed,
    };

    if (pendingSearch.status === 'complete' && pendingSearch.answer) {
      response.answer = pendingSearch.answer;
    }

    return response;
  });

  // Submit DOM results from extension
  fastify.post('/ask/:requestId/dom-results', {
    preHandler: verifyJWT,
  }, async (request, reply) => {
    const authRequest = request as AuthenticatedRequest;
    const { requestId } = request.params as { requestId: string };
    const { source, snippets } = request.body as { source: string; snippets: string[] };

    const pendingSearch = pendingSearches.get(requestId);

    if (!pendingSearch) {
      return reply.code(404).send({ error: 'Search not found' });
    }

    if (pendingSearch.user_id !== authRequest.userId) {
      return reply.code(403).send({ error: 'Not authorized' });
    }

    const normalizedResults: SearchHit[] = snippets.map((snippet, index) => ({
      id: `${source}-${index}`,
      source: source as 'linkedin' | 'whatsapp',
      content: snippet,
      metadata: {},
      relevance: 0.9,
    }));

    pendingSearch.results[source] = normalizedResults;

    const allSourcesComplete = pendingSearch.sources_needed.every(
      src => pendingSearch.results[src] && pendingSearch.results[src]!.length >= 0
    );

    if (allSourcesComplete) {
      (async () => {
        try {
          const allResults = mergeResults(...Object.values(pendingSearch.results).filter(Boolean) as SearchHit[][]);

          let conversationHistory: Message[] = [];
          const supabase = createUserClient(authRequest.accessToken);

          if (pendingSearch.conversation_id) {
            const { data: conversation } = await supabase
              .from('conversations')
              .select('*')
              .eq('id', pendingSearch.conversation_id)
              .single();

            if (conversation) {
              conversationHistory = conversation.messages as unknown as Message[];
            }
          }

          const answer = await synthesizeAnswer(pendingSearch.query, allResults, conversationHistory);

          if (pendingSearch.conversation_id) {
            const updatedHistory: Message[] = [
              ...conversationHistory,
              {
                role: 'user',
                content: pendingSearch.query,
                ...(pendingSearch.metadata ? { metadata: pendingSearch.metadata } : {})
              },
              { role: 'assistant', content: answer.answer }
            ];

            await supabase
              .from('conversations')
              .update({
                messages: updatedHistory as any,
                updated_at: new Date().toISOString(),
              })
              .eq('id', pendingSearch.conversation_id);
          }

          pendingSearch.answer = answer;
          pendingSearch.status = 'complete';

          setTimeout(() => {
            pendingSearches.delete(requestId);
          }, 30000);
        } catch (error) {
          fastify.log.error(error, 'Background synthesis failed');
          pendingSearch.status = 'failed';
        }
      })();

      return {
        status: 'processing',
        request_id: requestId,
      };
    }

    pendingSearch.status = 'partial';
    return {
      status: 'partial',
      request_id: requestId,
    };
  });
}
