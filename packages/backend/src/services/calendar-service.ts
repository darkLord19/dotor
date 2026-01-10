import { getCalendarEvents, refreshAccessToken } from '../lib/calendar.js';
import { getOutlookEvents } from '../lib/microsoft-graph.js';
import { normalizeCalendarResults, normalizeOutlookCalendarResults } from '../lib/normalizer.js';
import { refreshAccessToken as refreshMicrosoftToken } from '../lib/microsoft.js';
import { encrypt, encryptTokens } from '../lib/encryption.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyBaseLogger } from 'fastify';
import type { SearchHit } from '../types/search.js';

interface CalendarServiceParams {
    googleConnection?: any;
    microsoftConnection?: any;
    startDate?: Date | undefined;
    endDate?: Date | undefined;
    logger: FastifyBaseLogger;
    supabaseAdmin?: SupabaseClient;
}

export class CalendarService {
    static async getEvents({ googleConnection, microsoftConnection, startDate, endDate, logger, supabaseAdmin }: CalendarServiceParams): Promise<SearchHit[]> {
        const results: SearchHit[] = [];
        const promises: Promise<void>[] = [];

        // Helper for unauthorized check
        const isUnauthorized = (error: any) =>
            error?.code === 401 ||
            error?.status === 401 ||
            error?.response?.status === 401 ||
            error?.response?.data?.error?.code === 401 ||
            error?.message?.includes('401');

        // Google Calendar Logic
        if (googleConnection) {
            promises.push((async () => {
                let accessToken = googleConnection.access_token_decrypted;
                const refreshToken = googleConnection.refresh_token_decrypted;

                if (!accessToken) return;

                try {
                    let calendarResults;
                    try {
                        calendarResults = await getCalendarEvents(accessToken, startDate, endDate);
                    } catch (error: any) {
                        if (isUnauthorized(error)) {
                            logger.info('Calendar API returned 401, refreshing token and retrying');
                            try {
                                const newTokens = await refreshAccessToken(refreshToken);
                                if (!newTokens.access_token) throw new Error('No access token returned');
                                accessToken = newTokens.access_token;

                                if (supabaseAdmin) {
                                    const encrypted = encrypt(newTokens.access_token);
                                    await supabaseAdmin.from('connections').update({
                                        access_token: encrypted,
                                        token_expires_at: new Date(newTokens.expiry_date || Date.now() + 3600000).toISOString(),
                                    }).eq('id', googleConnection.id);
                                }
                                calendarResults = await getCalendarEvents(accessToken, startDate, endDate);
                            } catch (refreshError) {
                                logger.error(refreshError, 'Failed to refresh Google token after 401');
                                return;
                            }
                        } else {
                            throw error;
                        }
                    }

                    if (calendarResults) {
                        logger.info({ count: calendarResults.events.length }, 'Calendar fetch complete');
                        results.push(...normalizeCalendarResults(calendarResults.events));
                    }
                } catch (error) {
                    logger.error(error, 'Calendar fetch failed');
                }
            })());
        }

        // Outlook Calendar Logic
        if (microsoftConnection) {
            promises.push((async () => {
                let accessToken = microsoftConnection.access_token_decrypted;
                const refreshToken = microsoftConnection.refresh_token_decrypted;

                if (!accessToken) return;

                try {
                    const s = startDate || new Date();
                    const e = endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

                    let outlookEvents;
                    try {
                        outlookEvents = await getOutlookEvents(accessToken, s, e);
                    } catch (error: any) {
                        if (isUnauthorized(error)) {
                            logger.info('Outlook Calendar API returned 401, refreshing token');
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
                                    }).eq('id', microsoftConnection.id);
                                }
                                outlookEvents = await getOutlookEvents(accessToken, s, e);
                            } catch (refreshError) {
                                logger.error(refreshError, 'Failed to refresh Microsoft token');
                                return;
                            }
                        } else {
                            throw error;
                        }
                    }

                    if (outlookEvents) {
                        logger.info({ count: outlookEvents.length }, 'Outlook calendar fetch complete');
                        results.push(...normalizeOutlookCalendarResults(outlookEvents));
                    }
                } catch (error) {
                    logger.error(error, 'Outlook calendar fetch failed');
                }
            })());
        }

        await Promise.allSettled(promises);
        return results;
    }
}
