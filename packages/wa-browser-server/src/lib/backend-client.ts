/**
 * Client for forwarding data to the main backend
 */

const BACKEND_URL = process.env.BACKEND_API_URL ?? 'http://localhost:3001';
const API_SECRET_KEY = process.env.API_SECRET_KEY ?? '';

export async function forwardToBackend(path: string, data: unknown): Promise<unknown> {
  const url = `${BACKEND_URL}${path}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_SECRET_KEY,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Backend request failed: ${response.status} ${text}`);
  }

  return response.json();
}

export async function notifyBackend(event: string, data: unknown): Promise<void> {
  try {
    await forwardToBackend('/wa/events', { event, data, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error(`Failed to notify backend of ${event}:`, err);
  }
}
