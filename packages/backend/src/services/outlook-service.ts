import { searchOutlook } from '../lib/microsoft-graph.js';
import { normalizeOutlookMailResults } from '../lib/normalizer.js';
import { refreshAccessToken as refreshMicrosoftToken } from '../lib/microsoft.js';
import { encryptTokens } from '../lib/encryption.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyBaseLogger } from 'fastify';
import type { SearchHit } from '../types/search.js';

interface OutlookServiceParams {
    connection: any;
    query: string;
    maxResults: number;
    logger: FastifyBaseLogger;
    supabaseAdmin?: SupabaseClient;
}

export class OutlookService {
    static async search({ connection, query, maxResults, logger, supabaseAdmin }: OutlookServiceParams): Promise<SearchHit[]> {
        if (!connection) return [];

        let accessToken = connection.access_token_decrypted; // Assumes caller decrypted it
        const refreshToken = connection.refresh_token_decrypted; // Assumes caller decrypted it

        if (!accessToken) return [];

        // Helper for unauthorized check
        const isUnauthorized = (error: any) =>
            error?.code === 401 ||
            error?.status === 401 ||
            error?.response?.status === 401 ||
            error?.response?.data?.error?.code === 401 ||
            error?.message?.includes('401');

        try {
            logger.info({ query }, 'Outlook query start');
            let outlookResults;

            try {
                outlookResults = await searchOutlook(accessToken, query, maxResults);
            } catch (error: any) {
                if (isUnauthorized(error)) {
                    logger.info('Outlook API returned 401, refreshing token');
                    try {
                        const newTokens = await refreshMicrosoftToken(refreshToken || '');
                        if (!newTokens.access_token) throw new Error('No access token returned');

                        accessToken = newTokens.access_token;

                        if (supabaseAdmin) {
                            const encrypted = encryptTokens({
                                access_token: newTokens.access_token,
                                refresh_token: newTokens.refresh_token || refreshToken,
                            });

                            await supabaseAdmin.from('connections').update({
                                access_token: encrypted.access_token,
                                refresh_token: encrypted.refresh_token,
                                token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
                            }).eq('id', connection.id);
                        }
                        // Retry
                        outlookResults = await searchOutlook(accessToken, query, maxResults);
                    } catch (refreshError) {
                        logger.error(refreshError, 'Failed to refresh Microsoft token');
                        return [];
                    }
                } else {
                    throw error;
                }
            }

            if (outlookResults) {
                logger.info({ count: outlookResults.length }, 'Outlook search complete');
                return normalizeOutlookMailResults(outlookResults);
            }
        } catch (error) {
            logger.error(error, 'Outlook search failed');
        }

        return [];
    }
}
