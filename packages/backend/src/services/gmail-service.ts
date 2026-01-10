import { searchGmail } from '../lib/gmail.js';
import { normalizeGmailResults } from '../lib/normalizer.js';
import { refreshAccessToken } from '../lib/calendar.js';
import { encrypt } from '../lib/encryption.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyBaseLogger } from 'fastify';
import type { SearchHit } from '../types/search.js';

interface GmailServiceParams {
    connection: any;
    query: string;
    maxResults: number;
    logger: FastifyBaseLogger;
    supabaseAdmin?: SupabaseClient;
}

export class GmailService {
    static async search({ connection, query, maxResults, logger, supabaseAdmin }: GmailServiceParams): Promise<SearchHit[]> {
        if (!connection) return [];

        let accessToken = connection.access_token_decrypted; // Assumes caller decrypted it
        const refreshToken = connection.refresh_token_decrypted; // Assumes caller decrypted it

        if (!accessToken) return [];

        // Helper for unauthorized check
        const isUnauthorized = (error: any) =>
            error?.code === 401 ||
            error?.status === 401 ||
            error?.response?.status === 401 ||
            error?.response?.data?.error?.code === 401;

        try {
            logger.info({ query }, 'Gmail query ready');
            let gmailResults;

            try {
                gmailResults = await searchGmail(accessToken, query, maxResults);
            } catch (error: any) {
                if (isUnauthorized(error)) {
                    logger.info('Gmail API returned 401, refreshing token and retrying');
                    try {
                        const newTokens = await refreshAccessToken(refreshToken);
                        if (!newTokens.access_token) throw new Error('No access token returned');

                        accessToken = newTokens.access_token;

                        if (supabaseAdmin) {
                            const encrypted = encrypt(newTokens.access_token);
                            await supabaseAdmin.from('connections').update({
                                access_token: encrypted,
                                token_expires_at: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
                            }).eq('id', connection.id);
                        }

                        // Retry
                        gmailResults = await searchGmail(accessToken, query, maxResults);
                    } catch (refreshError) {
                        logger.error(refreshError, 'Failed to refresh token after 401');
                        return [];
                    }
                } else {
                    throw error;
                }
            }

            if (gmailResults) {
                logger.info({ count: gmailResults.messages.length }, 'Gmail search complete');
                return normalizeGmailResults(gmailResults.messages);
            }
        } catch (error) {
            logger.error(error, 'Gmail search failed');
        }

        return [];
    }
}
