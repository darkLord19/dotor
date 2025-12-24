import { getAccessToken } from './supabase.js';

// API base URL from environment
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface DOMInstruction {
  request_id: string;
  source: 'linkedin' | 'whatsapp';
  keywords: string[];
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

async function fetchWithAuth<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = await getAccessToken();
  
  if (!token) {
    return { error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { error: data.error ?? 'Request failed' };
    }

    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Request failed' };
  }
}

// Get DOM search instructions from backend
export async function getInstructions(
  requestId: string,
  sources: ('linkedin' | 'whatsapp')[],
  keywords: string[]
): Promise<ApiResponse<{ instructions: DOMInstruction[] }>> {
  return fetchWithAuth('/dom/instructions', {
    method: 'POST',
    body: JSON.stringify({
      request_id: requestId,
      sources,
      keywords,
    }),
  });
}

// Submit DOM search results to backend
export async function submitResults(
  requestId: string,
  source: string,
  snippets: string[],
  error?: string
): Promise<ApiResponse<{ status: string }>> {
  return fetchWithAuth('/dom/results', {
    method: 'POST',
    body: JSON.stringify({
      request_id: requestId,
      source,
      snippets,
      error,
    }),
  });
}

// Execute DOM instructions in parallel
export async function executeDOMInstructions(
  instructions: DOMInstruction[]
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();

  // Execute all instructions in parallel
  await Promise.all(
    instructions.map(async (instruction) => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'DOM_SEARCH',
          payload: {
            request_id: instruction.request_id,
            keywords: instruction.keywords,
            source: instruction.source,
          },
        });

        results.set(instruction.source, response.snippets ?? []);

        // Submit results to backend
        await submitResults(
          instruction.request_id,
          instruction.source,
          response.snippets ?? [],
          response.error
        );
      } catch (error) {
        results.set(instruction.source, []);
        
        // Submit error to backend
        await submitResults(
          instruction.request_id,
          instruction.source,
          [],
          error instanceof Error ? error.message : 'Execution failed'
        );
      }
    })
  );

  return results;
}
