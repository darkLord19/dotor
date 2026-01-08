import type { SupabaseClient } from '@supabase/supabase-js';
import type { SearchHit } from '../types/search.js';
import type { WhatsAppQueryPlan } from './openai.js';

export async function searchWhatsApp(
  supabase: SupabaseClient,
  userId: string,
  plan: WhatsAppQueryPlan
): Promise<SearchHit[]> {
  const hits: SearchHit[] = [];

  // 1. Search for matching messages using keywords (OR logic)
  let queryBuilder = supabase
    .from('synced_messages')
    .select('*, synced_conversations(title, external_id)')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(50); // Initial loose limit

  // Apply filters from plan
  if (plan.sender) {
    queryBuilder = queryBuilder.ilike('sender', `%${plan.sender}%`);
  }

  // Very basic keyword filtering (Postgres text search would be better)
  if (plan.keywords && plan.keywords.length > 0) {
    // Construct OR filter for keywords
    const filters = plan.keywords.map(k => `content.ilike.%${k}%`).join(',');
    queryBuilder = queryBuilder.or(filters);
  }

  const { data: messages, error } = await queryBuilder;

  if (error) {
    console.error('WhatsApp search failed:', error);
    return [];
  }

  if (!messages || messages.length === 0) return [];

  // 2. Expand context for each hit (100 before, 100 after)
  // To avoid hammering DB, we'll just process the top result or unique conversations
  // For now, let's take the most relevant message (most recent match) and expand it.
  
  // Strategy: Group by conversation, take top 3 distinct conversations
  const distinctConversationIds = [...new Set(messages.map((m: any) => m.conversation_id))].slice(0, 3);

  for (const convId of distinctConversationIds) {
    const primaryMatch = messages.find((m: any) => m.conversation_id === convId);
    if (!primaryMatch) continue;

    // Fetch surrounding messages
    const [before, after] = await Promise.all([
      // 100 before
      supabase
        .from('synced_messages')
        .select('*')
        .eq('conversation_id', convId)
        .lt('timestamp', primaryMatch.timestamp)
        .order('timestamp', { ascending: false })
        .limit(100),
      // 100 after
      supabase
        .from('synced_messages')
        .select('*')
        .eq('conversation_id', convId)
        .gt('timestamp', primaryMatch.timestamp)
        .order('timestamp', { ascending: true })
        .limit(100)
    ]);

    // Combine history: older -> match -> newer
    const history = [
      ...(before.data || []).reverse(),
      primaryMatch,
      ...(after.data || [])
    ];

    // Create a synthesized hit representing this conversation context
    const fullText = history
      .map((m: any) => `[${new Date(m.timestamp).toLocaleString()}] ${m.sender}: ${m.content}`)
      .join('\n');

    hits.push({
      id: primaryMatch.id,
      source: 'whatsapp',
      content: fullText, // Pass full context to LLM
      metadata: {
        sender: primaryMatch.sender,
        date: primaryMatch.timestamp,
        subject: primaryMatch.synced_conversations?.title || primaryMatch.synced_conversations?.external_id,
        threadId: primaryMatch.conversation_id
      },
      relevance: 1
    });
  }

  return hits;
}
