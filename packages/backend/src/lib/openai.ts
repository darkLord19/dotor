import OpenAI from 'openai';
import { z } from 'zod';
import { getGmailQueryPlanPrompt, getUnifiedQueryPlanPrompt } from './prompts.js';
import type { FeatureFlags } from './feature-flags.js';

// Use OpenRouter with OpenAI SDK
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:3000',
    'X-Title': 'Dotor',
  },
});

// Default model - can be changed to any OpenRouter-supported model
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4-turbo-preview';

// Schema for Gmail query plan
export const GmailQueryPlanSchema = z.object({
  gmailQuery: z.string().describe('The optimized Gmail search query string'),
  intent: z.enum(['search', 'count', 'summary', 'meetings']).describe('The intent of the user query'),
  dateRange: z.object({
    days: z.number().nullable(),
  }).nullable(),
  filters: z.object({
    segments: z.array(z.string()),
    negatedSegments: z.array(z.string()),
    participants: z.array(z.string()).nullable(),
    keywords: z.array(z.string()).nullable(),
    hasAttachment: z.boolean().nullable(),
    labels: z.array(z.string()).nullable().optional(),
    categories: z.array(z.string()).nullable().optional(),
  }),
  explanation: z.string().describe('Brief explanation of the search strategy'),
});

export type GmailQueryPlan = z.infer<typeof GmailQueryPlanSchema>;

// Schema for Outlook query plan
export const OutlookQueryPlanSchema = z.object({
  outlookQuery: z.string().describe('The optimized Outlook/Microsoft Graph search query string'),
  intent: z.enum(['search', 'count', 'summary', 'meetings']).describe('The intent of the user query'),
  dateRange: z.object({
    days: z.number().nullable(),
  }).nullable(),
  filters: z.object({
    segments: z.array(z.string()),
    negatedSegments: z.array(z.string()),
    participants: z.array(z.string()).nullable(),
    keywords: z.array(z.string()).nullable(),
    hasAttachment: z.boolean().nullable(),
    labels: z.array(z.string()).nullable().optional(),
    categories: z.array(z.string()).nullable().optional(),
  }),
  explanation: z.string().describe('Brief explanation of the search strategy'),
});

export type OutlookQueryPlan = z.infer<typeof OutlookQueryPlanSchema>;

// Schema for WhatsApp query plan
export const WhatsAppQueryPlanSchema = z.object({
  keywords: z.array(z.string()),
  sender: z.string().nullable().optional(),
  dateRange: z.object({
    days: z.number().nullable(),
  }).nullable().optional(),
  limit: z.number().optional().default(10),
});

export type WhatsAppQueryPlan = z.infer<typeof WhatsAppQueryPlanSchema>;

// Schema for determining required data sources
export const QueryAnalysisSchema = z.object({
  needsGmail: z.boolean(),
  needsOutlook: z.boolean(),
  needsCalendar: z.boolean(),
  needsLinkedIn: z.boolean(),
  needsWhatsApp: z.boolean(),
  gmailQuery: z.string().nullable().optional(), // Allow null when Gmail not needed
  calendarDateRange: z.object({
    start: z.string().optional(),
    end: z.string().optional(),
  }).nullable().optional(),
  linkedInKeywords: z.array(z.string()).nullable().optional(),
  whatsAppKeywords: z.array(z.string()).nullable().optional(),
});

export type QueryAnalysis = z.infer<typeof QueryAnalysisSchema>;

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    queryAnalysis?: QueryAnalysis;
    gmailPlan?: GmailQueryPlan;
    outlookPlan?: OutlookQueryPlan;
    whatsappPlan?: WhatsAppQueryPlan;
  };
}

// Convert natural language to Gmail search query
export async function planGmailQuery(userQuery: string, conversationHistory: Message[] = []): Promise<GmailQueryPlan> {
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'system',
        content: getGmailQueryPlanPrompt() + "\n\n=== CONVERSATION HISTORY ===\nUse the following conversation history to resolve references like 'him', 'her', 'it', 'that email'.",
      },
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: userQuery,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenRouter');
  }

  const parsed = JSON.parse(content);
  return GmailQueryPlanSchema.parse(parsed);
}

/*
// Convert natural language to WhatsApp search query
export async function planWhatsAppQuery(userQuery: string, conversationHistory: Message[] = []): Promise<WhatsAppQueryPlan> {
    // ...deprecated...
}
*/

/*
// Analyze user query to determine which data sources are needed
// DEPRECATED: Use planQuery instead
*/
/*
export async function analyzeQuery(userQuery: string, conversationHistory: Message[] = [], flags: FeatureFlags): Promise<QueryAnalysis> {
  // ...
  return {} as QueryAnalysis;
}
*/

/*
// Analyze user query to determine which data sources are needed
// DEPRECATED: Use planQuery instead
export async function analyzeQuery(userQuery: string, conversationHistory: Message[] = [], flags: FeatureFlags): Promise<QueryAnalysis> {
  // ...
  return {} as QueryAnalysis;
}
*/

// Unified Query Plan Schema
export const UnifiedQueryPlanSchema = z.object({
  analysis: z.object({
    needsGmail: z.boolean(),
    needsOutlook: z.boolean(),
    needsCalendar: z.boolean(),
    needsWhatsApp: z.boolean(),
    // LinkedIn deprecated/stubbed
    needsLinkedIn: z.boolean().optional().default(false),
    calendarDateRange: z.object({
      start: z.string().optional(),
      end: z.string().optional(),
    }).nullable().optional(),
  }),
  gmail: GmailQueryPlanSchema.nullable().optional(),
  outlook: OutlookQueryPlanSchema.nullable().optional(),
  whatsapp: WhatsAppQueryPlanSchema.nullable().optional(),
});

export type UnifiedQueryPlan = z.infer<typeof UnifiedQueryPlanSchema>;

// Unified planning function
export async function planQuery(
  userQuery: string,
  conversationHistory: Message[] = [],
  flags: FeatureFlags
): Promise<UnifiedQueryPlan> {
  const todayStr = new Date().toISOString().split('T')[0]!;

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'system',
        content: getUnifiedQueryPlanPrompt(todayStr, {
          enableWhatsApp: !!flags.enableWhatsApp,
          enableGmail: !!flags.enableGmail,
          enableOutlook: !!flags.enableOutlook
        }) + "\n\n=== CONVERSATION HISTORY ===\nUse the following conversation history to resolve references.",
      },
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: userQuery,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenRouter');
  }

  const parsed = JSON.parse(content);
  return UnifiedQueryPlanSchema.parse(parsed);
}
