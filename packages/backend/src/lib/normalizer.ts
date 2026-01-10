import type { SearchHit } from '../types/search.js';
import type { GmailMessage } from './gmail.js';
import type { CalendarEvent } from './calendar.js';
import type { OutlookEmail, OutlookEvent } from './microsoft-graph.js';

/**
 * Normalize Gmail messages to SearchHit format
 */
export function normalizeGmailResults(messages: GmailMessage[]): SearchHit[] {
  return messages.map((msg, index) => ({
    id: msg.id ?? `gmail-${index}`,
    source: 'gmail' as const,
    content: msg.snippet,
    metadata: {
      date: msg.date,
      sender: msg.from,
      subject: msg.subject,
      messageId: msg.id,
      threadId: msg.threadId,
    },
    relevance: 1.0,
  }));
}

/**
 * Normalize Calendar events to SearchHit format
 */
export function normalizeCalendarResults(events: CalendarEvent[]): SearchHit[] {
  return events.map((event, index) => ({
    id: event.id ?? `calendar-${index}`,
    source: 'calendar' as const,
    content: `${event.title} - ${event.start}`,
    metadata: {
      date: event.start,
      attendees: event.attendees,
      eventId: event.id,
    },
    relevance: 0.8, // Calendar context is secondary
  }));
}

/**
 * Normalize DOM snippets to SearchHit format
 */
export function normalizeDOMResults(
  snippets: string[],
  source: 'linkedin' | 'whatsapp'
): SearchHit[] {
  return snippets.map((snippet, index) => ({
    id: `${source}-${index}`,
    source,
    content: snippet,
    metadata: {},
    relevance: 0.9,
  }));
}

/**
 * Normalize Outlook messages to SearchHit format
 */
export function normalizeOutlookMailResults(messages: OutlookEmail[]): SearchHit[] {
  return messages.map((msg, index) => ({
    id: msg.id ?? `outlook-${index}`,
    source: 'outlook' as const,
    content: msg.bodyPreview,
    metadata: {
      date: msg.receivedDateTime,
      sender: msg.from?.emailAddress?.name || msg.from?.emailAddress?.address,
      subject: msg.subject,
      messageId: msg.id,
    },
    relevance: 1.0,
  }));
}

/**
 * Normalize Outlook Calendar events to SearchHit format
 */
export function normalizeOutlookCalendarResults(events: OutlookEvent[]): SearchHit[] {
  return events.map((event, index) => ({
    id: event.id ?? `outlook-calendar-${index}`,
    source: 'calendar' as const, // Can reuse 'calendar' source for now as it seems generic enough?
    content: `${event.subject} - ${event.start.dateTime}`,
    metadata: {
      date: event.start.dateTime,
      attendees: [], // Outlook event structure for attendees is complex, skipping for now or need to fetch
      eventId: event.id,
    },
    relevance: 0.8,
  }));
}

/**
 * Merge and sort all results by relevance
 */
export function mergeResults(...resultSets: SearchHit[][]): SearchHit[] {
  const allResults = resultSets.flat();
  
  // Sort by relevance (descending)
  return allResults.sort((a, b) => b.relevance - a.relevance);
}

/**
 * Safely handle empty or null results
 */
export function safeNormalize<T>(
  data: T[] | null | undefined,
  normalizer: (data: T[]) => SearchHit[]
): SearchHit[] {
  if (!data || data.length === 0) {
    return [];
  }
  return normalizer(data);
}

