import { signInWithPassword, signUp, signOut } from '../lib/auth.js';
import { getUser, type User } from '../lib/session.js';

// UI Elements
const loginSection = document.getElementById('login-section')!;
const userSection = document.getElementById('user-section')!;
const loginButton = document.getElementById('login-btn')!;
const signupButton = document.getElementById('signup-btn')!;
const logoutButton = document.getElementById('logout-btn')!;
const userEmail = document.getElementById('user-email')!;
const statusDiv = document.getElementById('status')!;
const emailInput = document.getElementById('email-input') as HTMLInputElement;
const passwordInput = document.getElementById('password-input') as HTMLInputElement;

// State
let currentUser: User | null = null;

// Initialize
async function init() {
  showStatus('Checking session...');
  
  try {
    // We can check session directly or via background
    currentUser = await getUser();
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
  const email = emailInput.value;
  const password = passwordInput.value;
  
  if (!email || !password) {
    showStatus('Please enter email and password', true);
    return;
  }

  showStatus('Signing in...');
  
  try {
    const data = await signInWithPassword(email, password);
    currentUser = data.user;
    updateUI();
    hideStatus();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : 'Sign in failed', true);
    console.error(error);
  }
});

signupButton.addEventListener('click', async () => {
  const email = emailInput.value;
  const password = passwordInput.value;
  
  if (!email || !password) {
    showStatus('Please enter email and password', true);
    return;
  }

  showStatus('Signing up...');
  
  try {
    const data = await signUp(email, password);
    if (data.session) {
        currentUser = data.user;
        updateUI();
        hideStatus();
    } else {
        showStatus('Check your email to confirm signup');
    }
  } catch (error) {
    showStatus(error instanceof Error ? error.message : 'Sign up failed', true);
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
