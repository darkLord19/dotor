import { searchWhatsApp } from '../lib/whatsapp.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FastifyBaseLogger } from 'fastify';
import type { SearchHit } from '../types/search.js';
import type { WhatsAppQueryPlan } from '../lib/openai.js';

interface WhatsAppServiceParams {
    supabase: SupabaseClient;
    userId: string;
    plan: WhatsAppQueryPlan;
    logger: FastifyBaseLogger;
}

export class WhatsAppService {
    static async search({ supabase, userId, plan, logger }: WhatsAppServiceParams): Promise<SearchHit[]> {
        try {
            logger.info({ plan }, 'WhatsApp query ready');

            const waResults = await searchWhatsApp(supabase, userId, plan);
            logger.info({ count: waResults.length }, 'WhatsApp search complete');
            return waResults;
        } catch (error) {
            logger.error(error, 'WhatsApp search failed');
            return [];
        }
    }
}
