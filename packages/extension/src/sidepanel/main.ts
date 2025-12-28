import { 
  signInWithPassword, 
  signUp, 
  signOut
} from '../lib/auth.js';
import { getGoogleStatus } from '../lib/api.js';
import { getUser, type User } from '../lib/session.js';

// UI Elements
const loginScreen = document.getElementById('login-screen')!;
const chatScreen = document.getElementById('chat-screen')!;
const emailForm = document.getElementById('email-form')! as HTMLFormElement;
const emailInput = document.getElementById('email-input')! as HTMLInputElement;
const passwordInput = document.getElementById('password-input')! as HTMLInputElement;
const submitBtn = document.getElementById('submit-btn')! as HTMLButtonElement;
const toggleSignupBtn = document.getElementById('toggle-signup')!;
const messageDiv = document.getElementById('message')!;
const loginTitle = document.getElementById('login-title')!;
const loginSubtitle = document.getElementById('login-subtitle')!;
const googleStatusBadge = document.getElementById('google-status')!;

// Chat UI Elements
const signoutBtn = document.getElementById('signout-btn')! as HTMLButtonElement;
const askForm = document.getElementById('ask-form')! as HTMLFormElement;
const queryInput = document.getElementById('query-input')! as HTMLInputElement;
const askSubmitBtn = document.getElementById('ask-submit-btn')! as HTMLButtonElement;
const resultsDiv = document.getElementById('results')!;
const hintsDiv = document.getElementById('hints')!;

// State
let currentUser: User | null = null;
let authMode: 'login' | 'signup' = 'login';
let isSubmitting = false;

// Initialize
async function init() {
  try {
    currentUser = await getUser();
    
    if (currentUser) {
      showChatScreen();
    } else {
      showLoginScreen();
    }
  } catch (error) {
    console.error('Init error:', error);
    showLoginScreen();
  }
}

// Show login screen
function showLoginScreen() {
  loginScreen.style.display = 'flex';
  chatScreen.style.display = 'none';
  setAuthMode('login');
}

// Show chat screen
async function showChatScreen() {
  loginScreen.style.display = 'none';
  chatScreen.style.display = 'flex';
  if (currentUser) {
    // Check google status
    try {
      const { data } = await getGoogleStatus();
      if (data?.connected) {
        googleStatusBadge.style.display = 'flex';
      } else {
        googleStatusBadge.style.display = 'none';
      }
    } catch (e) {
      console.error('Failed to check google status', e);
      googleStatusBadge.style.display = 'none';
    }
  }
}

// Set auth mode
function setAuthMode(mode: 'login' | 'signup') {
  authMode = mode;
  
  emailForm.style.display = 'flex';
  loginTitle.textContent = mode === 'signup' ? 'Create account' : 'Welcome back';
  loginSubtitle.textContent = mode === 'signup' 
    ? 'Sign up to get started' 
    : 'Sign in to access your personal assistant';
  
  submitBtn.textContent = mode === 'signup' ? 'Sign up' : 'Sign in';
  hideMessage();
}

// Show message
function showMessage(text: string, isError = false) {
  messageDiv.textContent = text;
  messageDiv.className = `message ${isError ? 'error' : ''} show`;
}

// Hide message
function hideMessage() {
  messageDiv.className = 'message';
}

// Handle email/password form
emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isSubmitting) return;
  
  isSubmitting = true;
  submitBtn.disabled = true;
  hideMessage();
  
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  
  try {
    if (authMode === 'signup') {
      const result = await signUp(email, password);
      if (result.error) {
        showMessage(result.error, true);
      } else if (result.user) {
        currentUser = result.user;
        showChatScreen();
      } else {
        showMessage('Check your email to confirm your account!', false);
      }
    } else {
      currentUser = await signInWithPassword(email, password);
      showChatScreen();
    }
  } catch (error) {
    showMessage(error instanceof Error ? error.message : 'Authentication failed', true);
  } finally {
    isSubmitting = false;
    submitBtn.disabled = false;
  }
});

// Toggle signup
toggleSignupBtn.addEventListener('click', () => {
  setAuthMode(authMode === 'signup' ? 'login' : 'signup');
});

// Handle sign out
signoutBtn.addEventListener('click', async () => {
  try {
    await signOut();
    currentUser = null;
    showLoginScreen();
  } catch (error) {
    console.error('Sign out error:', error);
  }
});

// Poll for ask results
async function pollAskResults(requestId: string, token: string) {
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const maxAttempts = 60;
  let attempts = 0;

  const poll = async () => {
    try {
      const res = await fetch(`${API_URL}/ask/${requestId}/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Poll failed: ${res.status}`);
      }

      const statusData = await res.json();

      if (statusData.status === 'complete') {
        // Fetch the full answer
        const answerRes = await fetch(`${API_URL}/ask/${requestId}/status`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (answerRes.ok) {
          const answerData = await answerRes.json();
          if (answerData.answer) {
            const answerCard = document.createElement('div');
            answerCard.className = `answer-card ${answerData.answer.insufficient ? 'insufficient' : ''}`;
            answerCard.innerHTML = `
              <div class="answer-text">${answerData.answer.answer}</div>
            `;
            resultsDiv.innerHTML = '';
            resultsDiv.appendChild(answerCard);
            return;
          }
        }
        
        // Fallback
        resultsDiv.innerHTML = '<div class="answer-card"><div class="answer-text">Search complete</div></div>';
        return;
      }

      // Continue polling
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(poll, 1000);
      } else {
        resultsDiv.innerHTML = '<div class="answer-card"><div class="answer-text">Search timed out. The tabs may still be loading. Please try again in a moment.</div></div>';
      }
    } catch (error) {
      console.error('Poll error:', error);
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(poll, 1000);
      } else {
        resultsDiv.innerHTML = `<div class="answer-card"><div class="answer-text">Error: ${error instanceof Error ? error.message : 'Failed to get results'}</div></div>`;
      }
    }
  };

  poll();
}

// Handle ask form
askForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = queryInput.value.trim();
  if (!query || isSubmitting) return;
  
  isSubmitting = true;
  askSubmitBtn.disabled = true;
  hintsDiv.style.display = 'none';
  resultsDiv.innerHTML = '<div class="answer-card"><div class="answer-text">Thinking...</div></div>';
  
  try {
    const tokenResponse = await chrome.runtime.sendMessage({ type: 'GET_TOKEN' });
    const token = tokenResponse.token;
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    
    const response = await fetch(`${API_URL}/ask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });
    
    const data = await response.json();
    
    // If extension is required, execute instructions
    if (data.requires_extension && data.request_id && data.instructions) {
      const sourcesNeeded = data.sources_needed || [];
      const sourcesText = sourcesNeeded.join(' and ');
      resultsDiv.innerHTML = `<div class="answer-card"><div class="answer-text">Opening ${sourcesText} tabs and searching... This may take a moment.</div></div>`;
      
      // Execute instructions via background script
      try {
        await chrome.runtime.sendMessage({
          type: 'EXECUTE_DOM_INSTRUCTIONS',
          payload: {
            request_id: data.request_id,
            instructions: data.instructions,
          },
        });
        
        // Poll for results
        pollAskResults(data.request_id, token);
      } catch (error) {
        console.error('Failed to execute instructions:', error);
        resultsDiv.innerHTML = `<div class="answer-card"><div class="answer-text">Error: Failed to search. The extension will try to open the required tabs automatically.</div></div>`;
        isSubmitting = false;
        askSubmitBtn.disabled = false;
      }
      return;
    }
    
    // Direct answer available
    if (data.answer) {
      const answerCard = document.createElement('div');
      answerCard.className = `answer-card ${data.answer.insufficient ? 'insufficient' : ''}`;
      answerCard.innerHTML = `
        <div class="answer-text">${data.answer.answer}</div>
      `;
      resultsDiv.innerHTML = '';
      resultsDiv.appendChild(answerCard);
    } else {
      resultsDiv.innerHTML = '<div class="answer-card"><div class="answer-text">No answer available</div></div>';
    }
  } catch (error) {
    resultsDiv.innerHTML = `<div class="answer-card"><div class="answer-text">Error: ${error instanceof Error ? error.message : 'Request failed'}</div></div>`;
  } finally {
    isSubmitting = false;
    askSubmitBtn.disabled = false;
  }
});

// Handle query input
queryInput.addEventListener('input', () => {
  askSubmitBtn.disabled = !queryInput.value.trim() || isSubmitting;
});

// Handle hint clicks
document.querySelectorAll('.hint').forEach((hint) => {
  hint.addEventListener('click', () => {
    const query = (hint as HTMLElement).dataset.query;
    if (query) {
      queryInput.value = query;
      askSubmitBtn.disabled = false;
      askForm.dispatchEvent(new Event('submit'));
    }
  });
});

// Start
init();

