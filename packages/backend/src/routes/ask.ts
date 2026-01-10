import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyJWT, type AuthenticatedRequest } from '../proxy/auth.js';
import { createUserClient, supabaseAdmin } from '../lib/supabase.js';
import { planQuery, type Message } from '../lib/openai.js';
import { searchGmail } from '../lib/gmail.js';
import { getCalendarEvents, refreshAccessToken } from '../lib/calendar.js';
import { normalizeGmailResults, normalizeCalendarResults, normalizeOutlookMailResults, normalizeOutlookCalendarResults, mergeResults } from '../lib/normalizer.js';
import { searchOutlook, getOutlookEvents } from '../lib/microsoft-graph.js';
import { refreshAccessToken as refreshMicrosoftToken } from '../lib/microsoft.js';
import { synthesizeAnswer } from '../lib/synthesizer.js';
import { decryptTokens, encrypt, encryptTokens } from '../lib/encryption.js';
import { getFeatureFlags, isExtensionEnabled, type FeatureFlags } from '../lib/feature-flags.js';
import { searchWhatsApp } from '../lib/whatsapp.js';
import type { SearchHit, PendingSearch } from '../types/search.js';

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
    // Only clean up 'ask' conversations, not synced WhatsApp chat history
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
          // Expired - start new
          currentConversationId = undefined;
        } else {
          conversationHistory = conversation.messages as unknown as Message[];
        }
      } else {
        // Not found - start new
        currentConversationId = undefined;
      }
    }

    if (!currentConversationId) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert([{
          user_id: authRequest.userId,
          messages: [],
          source: 'ask' // Mark as ask session
        }])
        .select()
        .single();

      if (newConv) {
        currentConversationId = newConv.id;
      }
    }

    // Insert usage event (no query content stored - privacy first)
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
      // Don't fail yet, maybe no connections but that's fine?
      // But if we fail to fetch, it's an error.
    }

    const googleConnection = connections?.find(c => c.type === 'google');
    const microsoftConnection = connections?.find(c => c.type === 'microsoft');

    // We only block if BOTH are missing AND we plan to search them? 
    // Actually, let's proceed and check later when planning.

    // Helper: Decrypt tokens safely
    const getDecryptedTokens = (conn: any) => {
      try {
        return decryptTokens({
          access_token: conn.access_token,
          refresh_token: conn.refresh_token,
        });
      } catch (e) {
        fastify.log.error(e, `Failed to decrypt ${conn.type} tokens`);
        return null;
      }
    };

    const googleTokens = googleConnection ? getDecryptedTokens(googleConnection) : null;
    const microsoftTokens = microsoftConnection ? getDecryptedTokens(microsoftConnection) : null;

    // Helper functions to refresh and update tokens
    async function refreshGoogleFn(): Promise<string | null> {
      if (!googleConnection || !googleTokens) return null;
      fastify.log.info('Refreshing Google access token');
      try {
        const newTokens = await refreshAccessToken(googleTokens.refresh_token);
        if (!newTokens.access_token) throw new Error('No access token returned');

        if (supabaseAdmin) {
          const encrypted = encrypt(newTokens.access_token);
          await supabaseAdmin.from('connections').update({
            access_token: encrypted,
            token_expires_at: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
          }).eq('id', googleConnection.id);
        }
        return newTokens.access_token;
      } catch (error) {
        fastify.log.error(error, 'Failed to refresh Google token');
        return null;
      }
    }

    async function refreshMicrosoftFn(): Promise<string | null> {
      if (!microsoftConnection || !microsoftTokens) return null;
      fastify.log.info('Refreshing Microsoft access token');
      try {
        const newTokens = await refreshMicrosoftToken(microsoftTokens.refresh_token || '');
        if (!newTokens.access_token) throw new Error('No access token returned');

        if (supabaseAdmin) {
          const encrypted = encryptTokens({
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token || microsoftTokens.refresh_token,
          });

          await supabaseAdmin.from('connections').update({
            access_token: encrypted.access_token,
            refresh_token: encrypted.refresh_token,
            token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
          }).eq('id', microsoftConnection.id);
        }
        return newTokens.access_token;
      } catch (error) {
        fastify.log.error(error, 'Failed to refresh Microsoft token');
        return null;
      }
    }

    // Check expiry and refresh if needed
    let activeGoogleToken = googleTokens?.access_token;
    if (googleConnection) {
      const expires = googleConnection.token_expires_at ? new Date(googleConnection.token_expires_at) : null;
      if (!expires || expires < new Date()) {
        const refreshed = await refreshGoogleFn();
        if (refreshed) activeGoogleToken = refreshed;
        // If refresh fails, we continue but might fail later or skip Google
      }
    }

    let activeMicrosoftToken = microsoftTokens?.access_token;
    if (microsoftConnection) {
      const expires = microsoftConnection.token_expires_at ? new Date(microsoftConnection.token_expires_at) : null;
      if (!expires || expires < new Date()) {
        const refreshed = await refreshMicrosoftFn();
        if (refreshed) activeMicrosoftToken = refreshed;
      }
    }

    try {
      // Step 0: Get feature flags for user
      const dbFlags = await getFeatureFlags(authRequest.userId);

      // Implicitly determine available sources based on connections
      const hasEmailConnection = !!(googleConnection || microsoftConnection);
      const hasWhatsAppConnection = connections?.some(c => c.type === 'whatsapp') || false;

      // Merge flags (priority: request -> implicit connection -> db flags default)
      const featureFlags: FeatureFlags = {
        ...dbFlags,
        enableLinkedIn: requestFlags?.enableLinkedIn ?? dbFlags.enableLinkedIn,
        enableWhatsApp: requestFlags?.enableWhatsApp ?? (hasWhatsAppConnection || dbFlags.enableWhatsApp),
        enableGmail: requestFlags?.enableGmail ?? (hasEmailConnection || dbFlags.enableGmail),
        enableOutlook: (hasEmailConnection || dbFlags.enableOutlook), // Defaults to enabled if connected or set in DB
      };

      fastify.log.info({ featureFlags, hasEmailConnection, hasWhatsAppConnection }, 'Feature flags loaded');

      // Step 1: Analyze query and plan in one shot
      fastify.log.info({ query }, 'Planning query');
      const plan = await planQuery(query, conversationHistory, featureFlags);
      const analysis = plan.analysis;
      const gmailPlan = plan.gmail;
      const outlookPlan = plan.outlook;
      const whatsappPlan = plan.whatsapp;

      fastify.log.info({ analysis, filteredByFlags: !isExtensionEnabled(featureFlags) }, 'Query planning complete');

      const results: SearchHit[] = [];
      const sourcesNeeded: string[] = [];
      // const domInstructions: DOMInstruction[] = [];

      // Step 2: Fetch Email data if needed

      // 2a. Search Gmail
      if (analysis.needsGmail && gmailPlan) {
        sourcesNeeded.push('gmail');

        const maxResults = gmailPlan.intent === 'summary' || gmailPlan.intent === 'count' ? 20 : 10;

        // Helper for unauthorized check
        const isUnauthorized = (error: any) =>
          error?.code === 401 ||
          error?.status === 401 ||
          error?.response?.status === 401 ||
          error?.response?.data?.error?.code === 401;

        if (activeGoogleToken) {
          try {
            fastify.log.info({ gmailPlan }, 'Gmail query ready');

            let gmailResults;
            try {
              gmailResults = await searchGmail(
                activeGoogleToken,
                gmailPlan.gmailQuery,
                maxResults
              );
            } catch (error: any) {
              if (isUnauthorized(error)) {
                fastify.log.info('Gmail API returned 401, refreshing token and retrying');
                try {
                  const refreshed = await refreshGoogleFn();
                  if (refreshed) {
                    activeGoogleToken = refreshed;
                    gmailResults = await searchGmail(
                      activeGoogleToken,
                      gmailPlan.gmailQuery,
                      maxResults
                    );
                  }
                } catch (refreshError) {
                  fastify.log.error(refreshError, 'Failed to refresh token after 401');
                }
              } else {
                throw error;
              }
            }

            if (gmailResults) {
              fastify.log.info({ count: gmailResults.messages.length }, 'Gmail search complete');
              results.push(...normalizeGmailResults(gmailResults.messages));
            }
          } catch (error) {
            fastify.log.error(error, 'Gmail search failed');
          }
        }
      }

      // 2b. Search Outlook
      if (analysis.needsOutlook && outlookPlan) {
        sourcesNeeded.push('outlook');
        const maxResults = outlookPlan.intent === 'summary' || outlookPlan.intent === 'count' ? 20 : 10;

        // Helper for unauthorized check
        const isUnauthorized = (error: any) =>
          error?.code === 401 ||
          error?.status === 401 ||
          error?.response?.status === 401 ||
          error?.response?.data?.error?.code === 401;

        if (activeMicrosoftToken) {
          try {
            fastify.log.info({ outlookPlan }, 'Outlook query start');
            let outlookResults;

            try {
              // Use the specific outlook query plan
              outlookResults = await searchOutlook(activeMicrosoftToken, outlookPlan.outlookQuery, maxResults);
            } catch (error: any) {
              if (isUnauthorized(error) || error.message.includes('401')) {
                fastify.log.info('Outlook API returned 401, refreshing token');
                const refreshed = await refreshMicrosoftFn();
                if (refreshed) {
                  activeMicrosoftToken = refreshed;
                  outlookResults = await searchOutlook(activeMicrosoftToken, outlookPlan.outlookQuery, maxResults);
                }
              } else {
                throw error;
              }
            }

            if (outlookResults) {
              fastify.log.info({ count: outlookResults.length }, 'Outlook search complete');
              results.push(...normalizeOutlookMailResults(outlookResults));
            }
          } catch (error) {
            fastify.log.error(error, 'Outlook search failed');
          }
        }
      }

      // Step 3: Fetch Calendar data if needed
      if (analysis.needsCalendar) {
        sourcesNeeded.push('calendar');
        try {
          const startDate = analysis.calendarDateRange?.start
            ? new Date(analysis.calendarDateRange.start)
            : undefined;
          const endDate = analysis.calendarDateRange?.end
            ? new Date(analysis.calendarDateRange.end)
            : undefined;

          // Helper for unauthorized check (redefined to be safe or reused if lifted scope)
          const isUnauthorized = (error: any) =>
            error?.code === 401 ||
            error?.status === 401 ||
            error?.response?.status === 401 ||
            error?.response?.data?.error?.code === 401;

          // 3a. Google Calendar
          if (activeGoogleToken) {
            try {
              let calendarResults;
              try {
                calendarResults = await getCalendarEvents(
                  activeGoogleToken,
                  startDate,
                  endDate
                );
              } catch (error: any) {
                if (isUnauthorized(error)) {
                  fastify.log.info('Calendar API returned 401, refreshing token and retrying');
                  try {
                    const refreshed = await refreshGoogleFn();
                    if (refreshed) {
                      activeGoogleToken = refreshed;
                      calendarResults = await getCalendarEvents(
                        activeGoogleToken,
                        startDate,
                        endDate
                      );
                    }
                  } catch (refreshError) {
                    fastify.log.error(refreshError, 'Failed to refresh token after 401');
                  }
                } else {
                  throw error;
                }
              }

              if (calendarResults) {
                fastify.log.info({ count: calendarResults.events.length }, 'Calendar fetch complete');
                results.push(...normalizeCalendarResults(calendarResults.events));
              }
            } catch (error) {
              fastify.log.error(error, 'Calendar fetch failed');
            }
          }

          // 3b. Outlook Calendar
          if (activeMicrosoftToken) {
            try {
              let outlookEvents;

              try {
                // Start defaults to 1 month ago if undefined?
                // End defaults to 1 month in future?
                // Let's stick to what analysis provided or reasonable defaults
                const s = startDate || new Date();
                const e = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                outlookEvents = await getOutlookEvents(activeMicrosoftToken, s, e);
              } catch (error: any) {
                if (isUnauthorized(error) || error.message.includes('401')) {
                  fastify.log.info('Outlook Calendar API returned 401, refreshing token');
                  const refreshed = await refreshMicrosoftFn();
                  if (refreshed) {
                    activeMicrosoftToken = refreshed;
                    const s = startDate || new Date();
                    const e = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                    outlookEvents = await getOutlookEvents(activeMicrosoftToken, s, e);
                  }
                } else {
                  throw error;
                }
              }

              if (outlookEvents) {
                fastify.log.info({ count: outlookEvents.length }, 'Outlook calendar fetch complete');
                results.push(...normalizeOutlookCalendarResults(outlookEvents));
              }
            } catch (error) {
              fastify.log.error(error, 'Outlook calendar fetch failed');
            }
          }

        } catch (error) {
          fastify.log.error(error, 'Calendar fetch failed');
        }
      }

      // Step 4: Fetch WhatsApp data (Local Search)
      if (featureFlags.enableWhatsApp && analysis.needsWhatsApp && whatsappPlan) {
        try {
          fastify.log.info({ whatsappPlan }, 'WhatsApp query ready');

          const waResults = await searchWhatsApp(supabase, authRequest.userId, whatsappPlan);
          fastify.log.info({ count: waResults.length }, 'WhatsApp search complete');
          results.push(...waResults);
          sourcesNeeded.push('whatsapp');
        } catch (error) {
          fastify.log.error(error, 'WhatsApp search failed');
        }
      }

      // LinkedIn (Local Search - Not implemented yet, no extension search)
      if (featureFlags.enableLinkedIn && analysis.needsLinkedIn) {
        fastify.log.info('LinkedIn search requested - local search not fully implemented/empty');
        // No logic here, just skipping extension instruction as requested
      }

      // Step 5: Synthesize answer from results (sync response)
      // Filter sources to only include what was actually searched
      const actualSourcesSearched = sourcesNeeded;
      const mergedResults = mergeResults(results);
      fastify.log.info({ totalResults: mergedResults.length }, 'Synthesizing answer');

      const answer = await synthesizeAnswer(query, mergedResults, conversationHistory);

      // Update conversation history
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
        sources_searched: actualSourcesSearched,
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

  /*
    // Get pending search status
    fastify.get('/ask/:requestId', {
      preHandler: verifyJWT,
    }, async (request, reply) => {
      // ... pending search logic disabled ...
      return reply.code(404).send({ error: 'Pending search mechanism disabled' });
    });
  */

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

    // Include answer if complete
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

    // Include answer if complete
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

    // Store DOM results
    const normalizedResults: SearchHit[] = snippets.map((snippet, index) => ({
      id: `${source}-${index}`,
      source: source as 'linkedin' | 'whatsapp',
      content: snippet,
      metadata: {},
      relevance: 0.9,
    }));

    pendingSearch.results[source] = normalizedResults;

    // Check if all sources are complete
    const allSourcesComplete = pendingSearch.sources_needed.every(
      src => pendingSearch.results[src] && pendingSearch.results[src]!.length >= 0
    );

    if (allSourcesComplete) {
      // Trigger synthesis in background
      (async () => {
        try {
          const allResults = mergeResults(...Object.values(pendingSearch.results).filter(Boolean) as SearchHit[][]);

          // Fetch conversation history if exists
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

          // Update conversation history
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

          // Store answer before cleanup (keep for a short time for polling)
          pendingSearch.answer = answer;
          pendingSearch.status = 'complete';

          // Clean up after a delay to allow polling
          setTimeout(() => {
            pendingSearches.delete(requestId);
          }, 30000); // Keep for 30 seconds after completion
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
