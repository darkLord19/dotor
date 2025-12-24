import OpenAI from 'openai';
import { z } from 'zod';
import type { SearchHit } from '../types/search.js';

// Use OpenRouter with OpenAI SDK
const openai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:3000',
    'X-Title': 'Anor',
  },
});

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL ?? 'openai/gpt-4-turbo-preview';

// Schema for synthesized answer
export const AnswerSchema = z.object({
  answer: z.string().describe('The synthesized answer to the user question'),
  citations: z.array(z.object({
    source: z.string(),
    content: z.string(),
    id: z.string(),
  })).describe('Sources cited in the answer'),
  confidence: z.number().min(0).max(100).describe('Confidence score 0-100'),
  insufficient: z.boolean().describe('Whether data was insufficient to answer'),
});

export type Answer = z.infer<typeof AnswerSchema>;

/**
 * Synthesize an answer from search results
 * Uses only provided snippets - no hallucination
 */
export async function synthesizeAnswer(
  userQuery: string,
  results: SearchHit[]
): Promise<Answer> {
  // Handle empty results
  if (results.length === 0) {
    return {
      answer: 'I could not find any relevant information to answer your question.',
      citations: [],
      confidence: 0,
      insufficient: true,
    };
  }

  // Format results for the prompt
  const formattedResults = results.map((hit, index) => {
    const parts = [`[${index + 1}] Source: ${hit.source}`];
    if (hit.metadata.sender) parts.push(`From: ${hit.metadata.sender}`);
    if (hit.metadata.subject) parts.push(`Subject: ${hit.metadata.subject}`);
    if (hit.metadata.date) parts.push(`Date: ${hit.metadata.date}`);
    parts.push(`Content: ${hit.content}`);
    return parts.join('\n');
  }).join('\n\n');

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are a personal assistant that answers questions based ONLY on the provided search results.

CRITICAL RULES:
1. ONLY use information from the provided search results
2. NEVER make up or hallucinate information
3. ALWAYS cite sources using [N] notation matching the result numbers
4. If the results don't contain enough information, say so honestly
5. Keep answers concise and directly relevant to the question

Respond with a JSON object:
{
  "answer": "Your answer with [N] citations",
  "citations": [{ "source": "gmail|calendar|linkedin|whatsapp", "content": "relevant excerpt", "id": "result id" }],
  "confidence": 0-100,
  "insufficient": true/false
}`,
      },
      {
        role: 'user',
        content: `Question: ${userQuery}

Search Results:
${formattedResults}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return {
      answer: 'Failed to generate an answer. Please try again.',
      citations: [],
      confidence: 0,
      insufficient: true,
    };
  }

  try {
    const parsed = JSON.parse(content);
    return AnswerSchema.parse(parsed);
  } catch {
    return {
      answer: content,
      citations: [],
      confidence: 50,
      insufficient: false,
    };
  }
}
