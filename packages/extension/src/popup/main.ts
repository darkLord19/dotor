import { signInWithOAuth, signOut } from '../lib/supabase.js';
import type { User } from '@supabase/supabase-js';

// UI Elements
const loginSection = document.getElementById('login-section')!;
const userSection = document.getElementById('user-section')!;
const loginButton = document.getElementById('login-btn')!;
const logoutButton = document.getElementById('logout-btn')!;
const userEmail = document.getElementById('user-email')!;
const statusDiv = document.getElementById('status')!;

// State
let currentUser: User | null = null;

// Initialize
async function init() {
  showStatus('Checking session...');
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
    currentUser = response.user;
    updateUI();
    hideStatus();
  } catch (error) {
    showStatus('Failed to check session', true);
    console.error(error);
  }
}

// Update UI based on auth state
function updateUI() {
  if (currentUser) {
    loginSection.style.display = 'none';
    userSection.style.display = 'block';
    userEmail.textContent = currentUser.email ?? 'Unknown user';
  } else {
    loginSection.style.display = 'block';
    userSection.style.display = 'none';
  }
}

// Status helpers
function showStatus(message: string, isError = false) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${isError ? 'error' : ''}`;
  statusDiv.style.display = 'block';
}

function hideStatus() {
  statusDiv.style.display = 'none';
}

// Event handlers
loginButton.addEventListener('click', async () => {
  showStatus('Signing in...');
  
  try {
    currentUser = await signInWithOAuth();
    updateUI();
    hideStatus();
  } catch (error) {
    showStatus('Sign in failed', true);
    console.error(error);
  }
});

logoutButton.addEventListener('click', async () => {
  showStatus('Signing out...');
  
  try {
    await signOut();
    currentUser = null;
    updateUI();
    hideStatus();
  } catch (error) {
    showStatus('Sign out failed', true);
    console.error(error);
  }
});

// Start
init();
