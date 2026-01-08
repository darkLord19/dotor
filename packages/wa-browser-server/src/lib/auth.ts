/**
 * Verify API key for inter-service communication
 */
export function verifyApiKey(apiKey: string | undefined): boolean {
  const expectedKey = process.env.API_SECRET_KEY;
  
  if (!expectedKey) {
    console.warn('API_SECRET_KEY not set, allowing all requests (development mode)');
    return true;
  }

  return apiKey === expectedKey;
}
