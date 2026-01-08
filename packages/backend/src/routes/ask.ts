import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyJWT, type AuthenticatedRequest } from '../proxy/auth.js';
import { createUserClient, supabaseAdmin } from '../lib/supabase.js';
import { analyzeQuery, planGmailQuery, type Message, type GmailQueryPlan } from '../lib/openai.js';
import { searchGmail } from '../lib/gmail.js';
import { getCalendarEvents, refreshAccessToken } from '../lib/calendar.js';
import { normalizeGmailResults, normalizeCalendarResults, mergeResults } from '../lib/normalizer.js';
import { synthesizeAnswer } from '../lib/synthesizer.js';
import { decryptTokens, encrypt } from '../lib/encryption.js';
import { getFeatureFlags, filterAnalysisByFlags, isExtensionEnabled, type FeatureFlags } from '../lib/feature-flags.js';
import { searchWhatsApp } from '../lib/whatsapp.js';
import { planQuery, type WhatsAppQueryPlan, type GmailQueryPlan } from '../lib/openai.js';
import type { SearchHit, PendingSearch, DOMInstruction } from '../types/search.js';

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

    // Get user's Google connection
    const { data: googleConnection, error: connectionError } = await supabase
      .from('connections')
      .select('*')
      .eq('user_id', authRequest.userId)
      .eq('type', 'google')
      .single();

    if (connectionError || !googleConnection) {
      return reply.code(400).send({
        error: 'Google account not connected',
        code: 'GOOGLE_NOT_CONNECTED',
      });
    }

    // Decrypt the stored tokens
    let decryptedTokens: { access_token: string; refresh_token: string };
    try {
      decryptedTokens = decryptTokens({
        access_token: googleConnection.access_token,
        refresh_token: googleConnection.refresh_token,
      });
    } catch (error) {
      fastify.log.error(error, 'Failed to decrypt tokens');
      return reply.code(500).send({
        error: 'Failed to decrypt stored tokens. Please reconnect your account.',
        code: 'DECRYPTION_FAILED',
      });
    }

    // Helper function to refresh and update Google token
    async function refreshAndUpdateToken(): Promise<string> {
      fastify.log.info('Refreshing Google access token');
      try {
        const newTokens = await refreshAccessToken(decryptedTokens.refresh_token);
        
        if (!newTokens.access_token) {
          throw new Error('No access token returned from refresh');
        }
        
        // Encrypt and update stored token (using admin client)
        if (supabaseAdmin) {
          const encryptedAccessToken = encrypt(newTokens.access_token);
          await supabaseAdmin
            .from('connections')
            .update({
              access_token: encryptedAccessToken,
              token_expires_at: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
            })
            .eq('user_id', authRequest.userId)
            .eq('type', 'google');
        }
        
        return newTokens.access_token;
      } catch (error) {
        fastify.log.error(error, 'Failed to refresh Google token');
        throw error;
      }
    }

    // Check if token needs refresh
    let accessToken = decryptedTokens.access_token;
    const tokenExpiry = googleConnection.token_expires_at 
      ? new Date(googleConnection.token_expires_at) 
      : null;
    
    // Refresh if expired or if expiry is unknown (null)
    if (!tokenExpiry || tokenExpiry < new Date()) {
      try {
        accessToken = await refreshAndUpdateToken();
      } catch (error) {
        return reply.code(400).send({
          error: 'Failed to refresh Google token. Please reconnect your account.',
          code: 'TOKEN_REFRESH_FAILED',
        });
      }
    }

    try {
      // Step 0: Get feature flags for user
      const dbFlags = await getFeatureFlags(authRequest.userId);
      
      // Merge flags from request
      const featureFlags: FeatureFlags = {
        ...dbFlags,
        enableLinkedIn: requestFlags?.enableLinkedIn ?? dbFlags.enableLinkedIn,
        enableWhatsApp: requestFlags?.enableWhatsApp ?? dbFlags.enableWhatsApp,
        enableGmail: requestFlags?.enableGmail ?? dbFlags.enableGmail,
      };
      
      fastify.log.info({ featureFlags }, 'Feature flags loaded');

      // Step 1: Analyze query and plan in one shot
      fastify.log.info({ query }, 'Planning query');
      const plan = await planQuery(query, conversationHistory, featureFlags);
      const analysis = plan.analysis;
      const gmailPlan = plan.gmail;
      const whatsappPlan = plan.whatsapp;
      
      fastify.log.info({ analysis, filteredByFlags: !isExtensionEnabled(featureFlags) }, 'Query planning complete');

      const results: SearchHit[] = [];
      const sourcesNeeded: string[] = [];
      const domInstructions: DOMInstruction[] = [];

      // Step 2: Fetch Gmail data if needed
      if (analysis.needsGmail && gmailPlan) {
        sourcesNeeded.push('gmail');
        try {
          fastify.log.info({ gmailPlan }, 'Gmail query ready');

          // Execute Gmail search with retry on 401
          let gmailResults;
          const maxResults = gmailPlan.intent === 'summary' || gmailPlan.intent === 'count' ? 20 : 10;
          
          try {
            gmailResults = await searchGmail(
              accessToken,
              gmailPlan.gmailQuery,
              maxResults
            );
          } catch (error: any) {
            // If we get a 401, try refreshing the token and retry
            const isUnauthorized = error?.code === 401 || 
                                  error?.status === 401 || 
                                  error?.response?.status === 401 ||
                                  error?.response?.data?.error?.code === 401;
            
            if (isUnauthorized) {
              fastify.log.info('Gmail API returned 401, refreshing token and retrying');
              try {
                accessToken = await refreshAndUpdateToken();
                gmailResults = await searchGmail(
                  accessToken,
                  gmailPlan.gmailQuery,
                  maxResults
                );
              } catch (refreshError) {
                fastify.log.error(refreshError, 'Failed to refresh token after 401');
                throw refreshError;
              }
            } else {
              throw error;
            }
          }
          
          fastify.log.info({ count: gmailResults.messages.length }, 'Gmail search complete');
          results.push(...normalizeGmailResults(gmailResults.messages));
        } catch (error) {
          fastify.log.error(error, 'Gmail search failed');
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

          let calendarResults;
          try {
            calendarResults = await getCalendarEvents(
              accessToken,
              startDate,
              endDate
            );
          } catch (error: any) {
            // If we get a 401, try refreshing the token and retry
            const isUnauthorized = error?.code === 401 || 
                                  error?.status === 401 || 
                                  error?.response?.status === 401 ||
                                  error?.response?.data?.error?.code === 401;
            
            if (isUnauthorized) {
              fastify.log.info('Calendar API returned 401, refreshing token and retrying');
              try {
                accessToken = await refreshAndUpdateToken();
                calendarResults = await getCalendarEvents(
                  accessToken,
                  startDate,
                  endDate
                );
              } catch (refreshError) {
                fastify.log.error(refreshError, 'Failed to refresh token after 401');
                throw refreshError;
              }
            } else {
              throw error;
            }
          }
          
          fastify.log.info({ count: calendarResults.events.length }, 'Calendar fetch complete');
          results.push(...normalizeCalendarResults(calendarResults.events));
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
