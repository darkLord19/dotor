import { API_BASE } from './api.js';
import { saveSession, clearSession } from './session.js';

export async function signInWithPassword(email: string, password: string) {
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    if (data.session) {
      await saveSession(data.session);
    }
    
    return data;
  } catch (error) {
    throw error;
  }
}

export async function signUp(email: string, password: string) {
  try {
    const response = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Signup failed');
    }

    if (data.session) {
      await saveSession(data.session);
    }
    
    return data;
  } catch (error) {
    throw error;
  }
}

export async function signOut() {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
    });
  } catch (e) {
    console.error('Logout failed', e);
  } finally {
    await clearSession();
  }
}
