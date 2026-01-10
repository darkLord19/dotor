const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

const SCOPES = [
  'User.Read',
  'Mail.Read',
  'Calendars.Read',
  'offline_access'
].join(' ');

export interface MicrosoftTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export function getMicrosoftAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
    response_mode: 'query',
    scope: SCOPES,
    state,
    prompt: 'select_account' 
  });

  return `${MICROSOFT_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<MicrosoftTokens> {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    scope: SCOPES,
    code,
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
    grant_type: 'authorization_code',
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
  });

  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Microsoft] Token exchange failed:', errorText);
    throw new Error(`Microsoft token exchange failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<MicrosoftTokens> {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    scope: SCOPES,
    refresh_token: refreshToken,
    redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
    grant_type: 'refresh_token',
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
  });

  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Microsoft] Token refresh failed:', errorText);
    throw new Error(`Microsoft token refresh failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function getUserProfile(accessToken: string): Promise<{
    email: string;
    displayName: string;
}> {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    
    if (!response.ok) {
        throw new Error('Failed to fetch user profile');
    }
    
    const data = await response.json();
    return {
        email: data.mail || data.userPrincipalName,
        displayName: data.displayName
    };
}
