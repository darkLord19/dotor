/**
 * LinkedIn Messages content script
 * Read-only DOM search - never navigates or mutates
 */

import { extractSnippets } from '../lib/dom-search.js';

// LinkedIn messaging selectors (may need updates as LinkedIn changes their UI)
const SELECTORS = {
  messageContainer: '.msg-conversations-container',
  messageList: '.msg-s-message-list',
  messageItem: '.msg-s-event-listitem__body',
  messageText: '.msg-s-event-listitem__message-bubble',
  conversationName: '.msg-conversation-listitem__participant-names',
};

// Handle search requests from background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SEARCH_DOM') {
    try {
      const snippets = searchLinkedInMessages(message.payload.keywords);
      sendResponse({ snippets });
    } catch (error) {
      sendResponse({ 
        snippets: [], 
        error: error instanceof Error ? error.message : 'Search failed' 
      });
    }
  }
  return true;
});

/**
 * Search LinkedIn messages for keywords
 * Read-only operation - never mutates DOM or navigates
 */
function searchLinkedInMessages(keywords: string[]): string[] {
  // Only run on messaging pages
  if (!window.location.href.includes('/messaging/')) {
    return [];
  }
  
  // First, try to find messages in the current conversation
  const conversationSnippets = extractSnippets(
    keywords,
    SELECTORS.messageText,
    15
  );
  
  // Also search conversation names for context
  const nameSnippets = extractSnippets(
    keywords,
    SELECTORS.conversationName,
    5
  );
  
  return [...conversationSnippets, ...nameSnippets];
}

// Log that content script is active (for debugging)
console.log('[Anor] LinkedIn content script loaded');
