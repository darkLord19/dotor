import type { Logger } from '@dotor/logger';
import { createUserClient, getAdminClient } from '../lib/supabase/index.js';
import { getGoogleAuthUrl, exchangeCodeForTokens } from '../lib/calendar.js';
import { encryptTokens } from '../lib/encryption.js';
import { AuthError } from '../lib/errors/index.js';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

export interface Connection {
  type: string;
  email: string | null;
  scopes: string[];
  connectedAt: string;
  needsRefresh: boolean;
}

export interface GoogleConnectionStatus {
  connected: boolean;
  email?: string | null;
  scopes?: string[];
  connectedAt?: string;
  needsRefresh?: boolean;
}

export class GoogleService {
  constructor(private readonly logger: Logger) {}

  async getAllConnections(userId: string, accessToken: string): Promise<Connection[]> {
    const supabase = createUserClient(accessToken);

    const { data, error } = await supabase
      .from('connections')
      .select('type, email, scopes, created_at, token_expires_at')
      .eq('user_id', userId);

    if (error) {
      this.logger.error({ error, userId }, 'Failed to fetch connections');
      throw new Error('Failed to fetch connections');
    }

    return (data || []).map((conn) => ({
      type: conn.type,
      email: conn.email,
      scopes: conn.scopes,
      connectedAt: conn.created_at,
      needsRefresh: new Date(conn.token_expires_at) < new Date(),
    }));
  }

  async getGoogleStatus(userId: string, accessToken: string): Promise<GoogleConnectionStatus> {
    const supabase = createUserClient(accessToken);

    const { data, error } = await supabase
      .from('connections')
      .select('email, scopes, created_at, token_expires_at')
      .eq('user_id', userId)
      .eq('type', 'google')
      .single();

    if (error && error.code !== 'PGRST116') {
      this.logger.error({ error, userId }, 'Failed to fetch google connection');
      throw new Error('Failed to fetch connection status');
    }

    if (!data) {
      return { connected: false };
    }

    const isExpired = new Date(data.token_expires_at) < new Date();

    return {
      connected: true,
      email: data.email,
      scopes: data.scopes,
      connectedAt: data.created_at,
      needsRefresh: isExpired,
    };
  }

  getAuthUrl(userId: string): string {
    const state = Buffer.from(
      JSON.stringify({
        userId,
        timestamp: Date.now(),
      })
    ).toString('base64');

    return getGoogleAuthUrl(state);
  }

  async handleOAuthCallback(code: string, state: string): Promise<string> {
    // Decode and verify state
    let stateData: { userId: string; timestamp: number };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
    } catch {
      throw new AuthError('Invalid state parameter');
    }

    // Check state is not too old (5 minutes max)
    if (Date.now() - stateData.timestamp > 5 * 60 * 1000) {
      throw new AuthError('State expired');
    }

    const admin = getAdminClient();

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    this.logger.info(
      {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiryDate: tokens.expiry_date,
      },
      'Tokens received from Google'
    );

    if (!tokens.access_token || !tokens.refresh_token) {
      this.logger.error({ tokens }, 'Missing tokens from Google');
      throw new Error('Failed to get tokens from Google');
    }

    // Get user's Google email
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text();
      this.logger.error(
        {
          status: userInfoResponse.status,
          error: errorText,
        },
        'Failed to fetch user info from Google'
      );
      throw new Error('Failed to get user info from Google');
    }

    const userInfo = (await userInfoResponse.json()) as { email?: string };
    const googleEmail = userInfo.email;

    if (!googleEmail) {
      throw new Error('Could not get Google email');
    }

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + (tokens.expiry_date || 3600 * 1000));

    // Encrypt tokens before storing
    const encryptedTokens = encryptTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });

    // Upsert the connection
    const { error: upsertError } = await admin
      .from('connections')
      .upsert(
        {
          user_id: stateData.userId,
          type: 'google',
          email: googleEmail,
          access_token: encryptedTokens.access_token,
          refresh_token: encryptedTokens.refresh_token,
          token_expires_at: expiresAt.toISOString(),
          scopes: SCOPES,
        },
        {
          onConflict: 'user_id,type',
        }
      );

    if (upsertError) {
      this.logger.error({ error: upsertError }, 'Failed to save connection');
      throw new Error('Failed to save connection');
    }

    return stateData.userId;
  }

  async disconnect(userId: string, accessToken: string): Promise<void> {
    const supabase = createUserClient(accessToken);

    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('user_id', userId)
      .eq('type', 'google');

    if (error) {
      this.logger.error({ error, userId }, 'Failed to disconnect google');
      throw new Error('Failed to disconnect');
    }
  }
}
