/**
 * WhatsApp Web Content Script
 * 
 * This script runs in the browser context and:
 * 1. Detects login state (QR scanned)
 * 2. Observes new messages via MutationObserver
 * 3. Sends data to the wa-browser-server
 * 4. Supports periodic sync via polling
 * 
 * RULES:
 * - NO automation
 * - NO scrolling
 * - NO message sending
 * - Only observe what's visible
 * - Minimal DOM queries
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    serverUrl: '__SERVER_URL__', // Replaced at build time
    userId: '__USER_ID__', // Replaced at build time
    apiKey: '__API_KEY__', // Replaced at build time
    linkedCheckInterval: 2000,
    messageSyncInterval: 2000,
    heartbeatInterval: 30000,
    syncPollInterval: 10000, // Check for sync requests every 10s
  };

  // State
  let isLinked = false;
  let messageBuffer = [];
  let lastLinkedCheck = 0;
  let currentSyncId = null;
  let isSyncing = false;

  /**
   * Check if user is logged in (chat list visible)
   */
  function checkIsLinked() {
    // WhatsApp Web shows chat-list when logged in
    const chatList = document.querySelector('[data-testid="chat-list"]');
    const conversationPanel = document.querySelector('[data-testid="conversation-panel"]');
    return !!(chatList || conversationPanel);
  }

  /**
   * Report login state to server
   */
  async function reportLinkedState(linked) {
    try {
      await fetch(`${CONFIG.serverUrl}/webhook/linked`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': CONFIG.apiKey,
        },
        body: JSON.stringify({
          userId: CONFIG.userId,
          linked,
        }),
      });
    } catch (err) {
      console.error('[WA Content] Failed to report linked state:', err);
    }
  }

  /**
   * Check login state periodically
   */
  function startLinkedCheck() {
    setInterval(() => {
      const nowLinked = checkIsLinked();
      
      if (nowLinked !== isLinked) {
        isLinked = nowLinked;
        console.log('[WA Content] Login state changed:', isLinked ? 'LINKED' : 'NOT LINKED');
        reportLinkedState(isLinked);
      }
    }, CONFIG.linkedCheckInterval);
  }

  /**
   * Check if node is a message bubble
   */
  function isMessageBubble(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    
    // WhatsApp uses data-testid for message components
    const testId = node.getAttribute?.('data-testid');
    if (testId && (testId.includes('msg-') || testId === 'conversation-panel-messages')) {
      return true;
    }

    // Also check for message containers
    if (node.classList?.contains('message-in') || node.classList?.contains('message-out')) {
      return true;
    }

    // Check for role="row" which contains messages
    if (node.getAttribute?.('role') === 'row') {
      return true;
    }

    return false;
  }

  /**
   * Extract message data from a message element
   */
  function extractMessageData(node) {
    try {
      // Try to get message ID from data attributes
      const msgId = node.getAttribute?.('data-id') || 
                    node.querySelector?.('[data-id]')?.getAttribute('data-id') ||
                    `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Get message text
      const textElement = node.querySelector?.('[class*="selectable-text"]') ||
                          node.querySelector?.('[data-testid="balloon-text"]');
      const content = textElement?.textContent?.trim() || '';

      // Skip empty messages
      if (!content) return null;

      // Determine if outgoing
      const isFromMe = node.classList?.contains('message-out') ||
                       !!node.querySelector?.('[data-testid="msg-dblcheck"]') ||
                       !!node.querySelector?.('[data-testid="msg-check"]');

      // Get timestamp
      const timeElement = node.querySelector?.('[data-testid="msg-time"]') ||
                          node.querySelector?.('span[dir="auto"]');
      const timestamp = timeElement?.textContent || new Date().toISOString();

      // Get sender (for group chats)
      const senderElement = node.querySelector?.('[data-testid="msg-container"]')?.
                            previousElementSibling;
      const sender = senderElement?.textContent?.trim() || (isFromMe ? 'Me' : 'Contact');

      // Get current chat info
      const chatHeader = document.querySelector('[data-testid="conversation-header"]');
      const chatName = chatHeader?.querySelector?.('span[dir="auto"]')?.textContent || 'Unknown';
      const chatId = document.querySelector('[data-testid="conversation-panel"]')?.
                     getAttribute('data-id') || 'unknown-chat';

      return {
        id: msgId,
        chatId,
        chatName,
        sender,
        content,
        timestamp,
        isFromMe,
      };
    } catch (err) {
      console.error('[WA Content] Failed to extract message:', err);
      return null;
    }
  }

  /**
   * Process added nodes for messages
   */
  function processAddedNodes(nodes) {
    for (const node of nodes) {
      if (!isMessageBubble(node)) continue;

      const msgData = extractMessageData(node);
      if (msgData) {
        // Avoid duplicates
        if (!messageBuffer.some(m => m.id === msgData.id)) {
          messageBuffer.push(msgData);
        }
      }
    }
  }

  /**
   * Send buffered messages to server
   */
  async function flushMessageBuffer() {
    if (messageBuffer.length === 0) return;

    const messages = messageBuffer.splice(0, messageBuffer.length);
    
    try {
      await fetch(`${CONFIG.serverUrl}/webhook/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': CONFIG.apiKey,
        },
        body: JSON.stringify({
          userId: CONFIG.userId,
          messages,
        }),
      });
      console.log(`[WA Content] Sent ${messages.length} messages`);
    } catch (err) {
      console.error('[WA Content] Failed to send messages:', err);
      // Put messages back in buffer for retry
      messageBuffer.unshift(...messages);
    }
  }

  /**
   * Start observing DOM for new messages
   */
  function startMessageObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          processAddedNodes(mutation.addedNodes);
        }
      }
    });

    // Observe body for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Flush buffer periodically
    setInterval(flushMessageBuffer, CONFIG.messageSyncInterval);

    console.log('[WA Content] Message observer started');
  }

  /**
   * Send heartbeat to keep connection alive
   */
  function startHeartbeat() {
    setInterval(async () => {
      try {
        await fetch(`${CONFIG.serverUrl}/webhook/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': CONFIG.apiKey,
          },
        });
      } catch (err) {
        console.error('[WA Content] Heartbeat failed:', err);
      }
    }, CONFIG.heartbeatInterval);
  }

  /**
   * Poll for pending sync requests from the server
   */
  function startSyncPoll() {
    setInterval(async () => {
      if (!isLinked || isSyncing) return;

      try {
        const response = await fetch(`${CONFIG.serverUrl}/sync/pending`, {
          headers: { 'X-API-Key': CONFIG.apiKey },
        });
        
        if (!response.ok) return;
        
        const data = await response.json();
        
        if (data.hasPending && data.syncId) {
          console.log('[WA Content] Sync request received:', data.syncId);
          performSync(data.syncId);
        }
      } catch (err) {
        console.error('[WA Content] Sync poll failed:', err);
      }
    }, CONFIG.syncPollInterval);
  }

  /**
   * Perform a full sync of visible messages
   */
  async function performSync(syncId) {
    if (isSyncing) return;
    
    isSyncing = true;
    currentSyncId = syncId;
    
    console.log('[WA Content] Starting sync:', syncId);
    
    try {
      // Collect all visible messages from the current conversation
      const messages = collectVisibleMessages();
      
      console.log(`[WA Content] Found ${messages.length} visible messages`);
      
      // Send messages to server
      if (messages.length > 0) {
        await fetch(`${CONFIG.serverUrl}/webhook/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': CONFIG.apiKey,
          },
          body: JSON.stringify({
            userId: CONFIG.userId,
            messages,
          }),
        });
      }
      
      // Report sync complete
      await fetch(`${CONFIG.serverUrl}/sync/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': CONFIG.apiKey,
        },
        body: JSON.stringify({
          syncId,
          success: true,
          messagesFound: messages.length,
        }),
      });
      
      console.log('[WA Content] Sync completed:', syncId);
    } catch (err) {
      console.error('[WA Content] Sync failed:', err);
      
      // Report sync failed
      try {
        await fetch(`${CONFIG.serverUrl}/sync/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': CONFIG.apiKey,
          },
          body: JSON.stringify({
            syncId,
            success: false,
            error: err.message,
          }),
        });
      } catch (e) {
        console.error('[WA Content] Failed to report sync failure:', e);
      }
    } finally {
      isSyncing = false;
      currentSyncId = null;
    }
  }

  /**
   * Collect all visible messages from current conversation
   * This is a non-invasive scan of what's currently visible
   */
  function collectVisibleMessages() {
    const messages = [];
    const seen = new Set();
    
    // Find all message rows
    const messageRows = document.querySelectorAll('[role="row"]');
    
    for (const row of messageRows) {
      // Skip if not a message container
      const msgContainer = row.querySelector('[data-testid="msg-container"]');
      if (!msgContainer) continue;
      
      const msgData = extractMessageData(row);
      if (msgData && !seen.has(msgData.id)) {
        seen.add(msgData.id);
        messages.push(msgData);
      }
    }
    
    // Also check for message-in / message-out elements
    const bubbles = document.querySelectorAll('.message-in, .message-out');
    for (const bubble of bubbles) {
      const msgData = extractMessageData(bubble);
      if (msgData && !seen.has(msgData.id)) {
        seen.add(msgData.id);
        messages.push(msgData);
      }
    }
    
    return messages;
  }

  /**
   * Initialize content script
   */
  function init() {
    console.log('[WA Content] Initializing...');

    // Wait for page to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
      return;
    }

    // Check if we're on WhatsApp Web
    if (!window.location.hostname.includes('web.whatsapp.com')) {
      console.log('[WA Content] Not on WhatsApp Web, exiting');
      return;
    }

    // Start all monitoring
    startLinkedCheck();
    startMessageObserver();
    startHeartbeat();
    startSyncPoll();

    console.log('[WA Content] Initialized successfully');
  }

  // Start
  init();
})();
