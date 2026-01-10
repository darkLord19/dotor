'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getBackendUrl } from '@/lib/config';
import { Plus, X, ChevronRight, Loader2 } from 'lucide-react';
import styles from './page.module.css';

interface Connection {
  type: string;
  email: string | null;
  scopes: string[];
  connectedAt: string;
  needsRefresh: boolean;
}

interface WhatsAppStatus {
  connected: boolean;
  status: string;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  syncCount: number;
  browserRunning: boolean;
  isLinked: boolean;
}

interface AvailableChat {
  name: string;
  id: string;
  isGroup: boolean;
  unreadCount: number;
}

type SettingsSection = 'profile' | 'connected-accounts';

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  // WhatsApp state
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatus | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [qrScreenshot, setQrScreenshot] = useState<string | null>(null);
  const [qrPolling, setQrPolling] = useState(false);

  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync Config State
  const [monitoredChats, setMonitoredChats] = useState<string[]>([]);
  const [availableChats, setAvailableChats] = useState<AvailableChat[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Handle OAuth callback params
  useEffect(() => {
    const isGoogleConnected = searchParams.get('google_connected') === 'true';
    const isMicrosoftConnected = searchParams.get('microsoft_connected') === 'true';

    if (isGoogleConnected || isMicrosoftConnected) {
      setProfileMessage({
        type: 'success',
        text: `${isGoogleConnected ? 'Google' : 'Microsoft'} account connected successfully!`
      });
      setTimeout(() => setProfileMessage(null), 5000);
      router.replace('/connections');
    }

    if (searchParams.get('google_error') === 'true' || searchParams.get('microsoft_error') === 'true') {
      setProfileMessage({
        type: 'error',
        text: `Failed to connect ${searchParams.get('google_error') === 'true' ? 'Google' : 'Microsoft'} account.`
      });
      router.replace('/connections');
    }
  }, [searchParams, router]);

  // Avoid unused variable warning if accessToken is only set but not read in this scope yet
  // Once we implement chat fetching that uses the token, this will be resolved naturally.
  // For now, suppress the warning by using it in a trivial way or ignoring it.
  useEffect(() => {
    if (accessToken) {
      // Token will be used for authenticated requests
    }
  }, [accessToken]);

  useEffect(() => {
    const checkAuth = async () => {
      const backendUrl = getBackendUrl();

      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          router.push('/login');
          return;
        }

        const token = session.access_token;
        setAccessToken(token);

        setUser(session.user);

        // Fetch connections
        const connectionsResponse = await fetch(`${backendUrl}/connections`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (connectionsResponse.ok) {
          const connectionsData = await connectionsResponse.json();
          setConnections(connectionsData);

          // Load existing sync config
          const waConn = connectionsData.find((c: any) => c.type === 'whatsapp');
          if (waConn?.syncConfig?.monitoredChats) {
            setMonitoredChats(waConn.syncConfig.monitoredChats);
          }
        }

        // Fetch WhatsApp status
        const waResponse = await fetch(`${backendUrl}/wa/status`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (waResponse.ok) {
          const waData = await waResponse.json();
          setWhatsappStatus(waData);
        }
      } catch (error) {
        console.error('Failed to check auth:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Poll for QR screenshot when browser is running but not linked
  useEffect(() => {
    // Don't poll if browser not running
    if (!whatsappStatus?.browserRunning) {
      setQrScreenshot(null);
      setQrPolling(false);
      return;
    }

    // Don't poll if already linked (live status from browser)
    if (whatsappStatus?.isLinked) {
      setQrScreenshot(null);
      setQrPolling(false);
      return;
    }

    // Start polling for screenshot
    setQrPolling(true);
    let cancelled = false;

    const pollScreenshot = async () => {
      if (cancelled) return;

      const backendUrl = getBackendUrl();

      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session || cancelled) return;

        // First check status to see if already linked
        const statusResponse = await fetch(`${backendUrl}/wa/status`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (statusResponse.ok) {
          const status = await statusResponse.json();
          setWhatsappStatus(status);

          // Stop polling if linked (live) or browser stopped
          if (status.isLinked || !status.browserRunning) {
            setQrScreenshot(null);
            setQrPolling(false);
            cancelled = true;
            return;
          }
        }

        if (cancelled) return;

        // Only fetch screenshot if still not linked
        const screenshotResponse = await fetch(`${backendUrl}/wa/screenshot`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (cancelled) return;

        if (screenshotResponse.ok) {
          const data = await screenshotResponse.json();

          if (data.linked) {
            // Browser is now linked, stop polling
            setQrScreenshot(null);
            setQrPolling(false);
            cancelled = true;
            return;
          }

          if (data.image && !cancelled) {
            // Check if image is already a Data URL
            if (data.image.startsWith('data:')) {
              setQrScreenshot(data.image);
            } else {
              setQrScreenshot(`data:${data.mimeType};base64,${data.image}`);
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch screenshot:', err);
      }
    };

    // Poll immediately, then every 2 seconds
    pollScreenshot();
    const interval = setInterval(() => {
      if (!cancelled) {
        pollScreenshot();
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      setQrScreenshot(null);
      setQrPolling(false);
    };
  }, [whatsappStatus?.browserRunning, whatsappStatus?.isLinked]);


  const handleConnect = async (type: string) => {
    const backendUrl = getBackendUrl();

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${backendUrl}/${type}/auth-url`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get auth URL');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (error) {
      console.error('Failed to connect:', error);
    }
  };

  const handleDisconnect = async (type: string) => {
    const backendUrl = getBackendUrl();

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${backendUrl}/${type}/disconnect`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const connectionsResponse = await fetch(`${backendUrl}/connections`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (connectionsResponse.ok) {
          const data = await connectionsResponse.json();
          setConnections(data);
        }
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  // WhatsApp handlers
  const handleWhatsAppConnect = async () => {
    const backendUrl = getBackendUrl();
    setWhatsappLoading(true);
    setWhatsappError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${backendUrl}/wa/browser/spawn`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start browser');
      }

      // Refresh status
      const statusResponse = await fetch(`${backendUrl}/wa/status`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (statusResponse.ok) {
        setWhatsappStatus(await statusResponse.json());
      }
    } catch (error: any) {
      setWhatsappError(error.message || 'Failed to connect WhatsApp');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const handleWhatsAppDisconnect = async () => {
    const backendUrl = getBackendUrl();
    setWhatsappLoading(true);
    setWhatsappError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${backendUrl}/wa/disconnect`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to disconnect');
      }

      setWhatsappStatus({
        connected: false,
        status: 'disconnected',
        lastSeenAt: null,
        lastSyncAt: null,
        syncCount: 0,
        browserRunning: false,
        isLinked: false,
      });
    } catch (error: any) {
      setWhatsappError(error.message || 'Failed to disconnect WhatsApp');
    } finally {
      setWhatsappLoading(false);
    }
  };

  const handleWhatsAppStop = async () => {
    const backendUrl = getBackendUrl();
    setWhatsappLoading(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      await fetch(`${backendUrl}/wa/browser/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      // Refresh status
      const statusResponse = await fetch(`${backendUrl}/wa/status`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (statusResponse.ok) {
        setWhatsappStatus(await statusResponse.json());
      }
    } catch (error) {
      console.error('Failed to stop browser:', error);
    } finally {
      setWhatsappLoading(false);
    }
  };

  const handleWhatsAppSync = async () => {
    const backendUrl = getBackendUrl();
    setWhatsappLoading(true);
    setWhatsappError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${backendUrl}/wa/sync/trigger`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to trigger sync');
      }

      // Poll for status update after a few seconds
      setTimeout(async () => {
        const statusResponse = await fetch(`${backendUrl}/wa/status`, {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        });

        if (statusResponse.ok) {
          setWhatsappStatus(await statusResponse.json());
        }
        setWhatsappLoading(false);
      }, 5000);
    } catch (error: any) {
      setWhatsappError(error.message || 'Failed to sync');
      setWhatsappLoading(false);
    }
  };

  const handleLoadChats = async () => {
    setLoadingChats(true);
    setAvailableChats([]);

    try {
      const backendUrl = getBackendUrl();
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`${backendUrl}/wa/live-chats`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load chats');
      }

      setAvailableChats(data.chats);

      if (data.chats.length === 0) {
        setProfileMessage({ type: 'success', text: 'No recent chats found. Syncing top 5 chats by default.' });
        setTimeout(() => setProfileMessage(null), 5000);
      }
    } catch (error: any) {
      setWhatsappError(error.message || 'Failed to load chats');
    } finally {
      setLoadingChats(false);
    }
  };

  const toggleChat = (chatName: string) => {
    setMonitoredChats(prev => {
      if (prev.includes(chatName)) {
        return prev.filter(name => name !== chatName);
      } else {
        return [...prev, chatName];
      }
    });
  };

  const handleSaveSyncConfig = async () => {
    setSavingConfig(true);
    setProfileMessage(null);

    try {
      const backendUrl = getBackendUrl();
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      // Save the sync configuration
      const response = await fetch(`${backendUrl}/wa/config`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ monitoredChats }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save sync configuration');
      }

      setProfileMessage({ type: 'success', text: 'Sync configuration saved successfully' });
      setTimeout(() => setProfileMessage(null), 3000);
    } catch (error: any) {
      setProfileMessage({ type: 'error', text: error.message || 'Failed to save sync configuration' });
    } finally {
      setSavingConfig(false);
    }
  };

  const isGoogleConnected = connections.some(conn => conn.type === 'google');
  const isMicrosoftConnected = connections.some(conn => conn.type === 'microsoft');

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>Loading...</div>
      </main>
    );
  }

  const isAnyConnected = isGoogleConnected || isMicrosoftConnected || whatsappStatus?.isLinked;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Connections</h1>
        <button
          className={styles.addAccountButton}
          onClick={() => setShowAddModal(true)}
        >
          <Plus size={18} />
          <span>Add connection</span>
        </button>
      </header>

      {profileMessage && (
        <div className={`${styles.message} ${styles[`message${profileMessage.type === 'success' ? 'Success' : 'Error'}`]}`}>
          {profileMessage.text}
        </div>
      )}

      <div className={styles.content}>
        <section className={styles.section}>
          {!isAnyConnected && !whatsappStatus?.browserRunning && (
            <div className={styles.noConnections}>
              <div className={styles.noConnectionsText}>No accounts connected yet.</div>
              <button
                className={styles.connectButton}
                onClick={() => setShowAddModal(true)}
              >
                Connect your first account
              </button>
            </div>
          )}

          {/* Google Account - Only if connected */}
          {isGoogleConnected && (
            <div className={styles.accountProvider}>
              <div className={styles.providerHeader}>
                <div className={styles.providerInfo}>
                  <svg className={styles.googleIcon} viewBox="0 0 24 24" width="24" height="24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  <span className={styles.providerName}>Google</span>
                </div>
                <button
                  onClick={() => handleDisconnect('google')}
                  className={styles.disconnectButton}
                >
                  Disconnect
                </button>
              </div>
              {(() => {
                const googleConn = connections.find(conn => conn.type === 'google');
                if (!googleConn) return null;

                const scopeLabels: Record<string, string> = {
                  'gmail.readonly': '📧 Gmail (read-only)',
                  'calendar.readonly': '📅 Calendar (read-only)',
                  'userinfo.email': '👤 Email address',
                };

                const displayedScopes = googleConn.scopes
                  .map(scope => {
                    if (scope.includes('gmail')) return scopeLabels['gmail.readonly'];
                    if (scope.includes('calendar')) return scopeLabels['calendar.readonly'];
                    if (scope.includes('userinfo')) return scopeLabels['userinfo.email'];
                    return null;
                  })
                  .filter(Boolean) as string[];

                return (
                  <div className={styles.connectionDetails}>
                    {googleConn.email && (
                      <div className={styles.connectionEmail}>{googleConn.email}</div>
                    )}
                    <div className={styles.connectionMeta}>
                      <span>Connected {new Date(googleConn.connectedAt).toLocaleDateString()}</span>
                      {googleConn.needsRefresh && (
                        <span className={styles.needsRefresh}>• Needs refresh</span>
                      )}
                    </div>
                    {displayedScopes.length > 0 && (
                      <div className={styles.scopes}>
                        <span className={styles.scopesLabel}>Permissions:</span>
                        <ul className={styles.scopesList}>
                          {displayedScopes.map((label, idx) => (
                            <li key={idx} className={styles.scopeItem}>{label}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Microsoft Account - Only if connected */}
          {isMicrosoftConnected && (
            <div className={styles.accountProvider}>
              <div className={styles.providerHeader}>
                <div className={styles.providerInfo}>
                  <svg className={styles.googleIcon} viewBox="0 0 23 23" width="24" height="24">
                    <path fill="#f35325" d="M1 1h10v10H1z" />
                    <path fill="#81bc06" d="M12 1h10v10H12z" />
                    <path fill="#05a6f0" d="M1 12h10v10H1z" />
                    <path fill="#ffba08" d="M12 12h10v10H12z" />
                  </svg>
                  <span className={styles.providerName}>Outlook</span>
                </div>
                <button
                  onClick={() => handleDisconnect('microsoft')}
                  className={styles.disconnectButton}
                >
                  Disconnect
                </button>
              </div>
              {(() => {
                const msConn = connections.find(conn => conn.type === 'microsoft');
                if (!msConn) return null;

                return (
                  <div className={styles.connectionDetails}>
                    {msConn.email && (
                      <div className={styles.connectionEmail}>{msConn.email}</div>
                    )}
                    <div className={styles.connectionMeta}>
                      <span>Connected {new Date(msConn.connectedAt).toLocaleDateString()}</span>
                      {msConn.needsRefresh && (
                        <span className={styles.needsRefresh}>• Needs refresh</span>
                      )}
                    </div>
                    <div className={styles.scopes}>
                      <span className={styles.scopesLabel}>Permissions:</span>
                      <ul className={styles.scopesList}>
                        <li className={styles.scopeItem}>📧 Mail (read-only)</li>
                        <li className={styles.scopeItem}>📅 Calendar (read-only)</li>
                      </ul>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* WhatsApp - Only if connected or connecting (browser running) */}
          {(whatsappStatus?.connected || whatsappStatus?.browserRunning) && (
            <div className={styles.accountProvider}>
              <div className={styles.providerHeader}>
                <div className={styles.providerInfo}>
                  <svg className={styles.whatsappIcon} viewBox="0 0 24 24" width="24" height="24">
                    <path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  <div className={styles.providerNameLabel}>WhatsApp</div>
                </div>
                <div className={styles.providerActions}>
                  {whatsappStatus?.browserRunning && !whatsappStatus?.isLinked && (
                    <button
                      onClick={handleWhatsAppStop}
                      disabled={whatsappLoading}
                      className={styles.stopButton}
                    >
                      Cancel Connection
                    </button>
                  )}
                  {whatsappStatus?.isLinked && (
                    <button
                      onClick={handleWhatsAppDisconnect}
                      className={styles.disconnectButton}
                      disabled={whatsappLoading}
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>

              {whatsappError && (
                <div className={styles.waError}>{whatsappError}</div>
              )}

              {whatsappStatus?.browserRunning && !whatsappStatus?.isLinked && (
                <div className={styles.waQrPrompt}>
                  <div className={styles.waQrHeader}>
                    <span className={styles.waQrIcon}>📱</span>
                    <div className={styles.waQrText}>
                      <p><strong>Scan QR Code</strong></p>
                      <p>Open WhatsApp on your phone → Settings → Linked Devices → Link a Device</p>
                    </div>
                  </div>

                  {qrScreenshot ? (
                    <div className={styles.waQrImageContainer}>
                      <img
                        src={qrScreenshot}
                        alt="WhatsApp QR Code"
                        className={styles.waQrImage}
                      />
                      {qrPolling && (
                        <div className={styles.waQrRefreshing}>
                          <span className={styles.waQrSpinner} />
                          Refreshing...
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={styles.waQrLoading}>
                      <span className={styles.waQrSpinner} />
                      Loading QR code...
                    </div>
                  )}
                </div>
              )}

              {whatsappStatus?.isLinked && (
                <div className={styles.connectionDetails}>
                  <div className={styles.waStatus}>
                    <span className={styles.waStatusDot} />
                    <span>Connected</span>
                  </div>
                  <div className={styles.waSyncInfo}>
                    {whatsappStatus.lastSyncAt && (
                      <div className={styles.waSyncRow}>
                        <span className={styles.waSyncLabel}>Last sync:</span>
                        <span>{new Date(whatsappStatus.lastSyncAt).toLocaleString()}</span>
                      </div>
                    )}
                    {whatsappStatus.syncCount > 0 && (
                      <div className={styles.waSyncRow}>
                        <span className={styles.waSyncLabel}>Total syncs:</span>
                        <span>{whatsappStatus.syncCount}</span>
                      </div>
                    )}
                  </div>

                  {/* Sync Configuration Strategy */}
                  <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-primary)', paddingTop: '15px' }}>
                    <h4 style={{ marginBottom: '10px', fontSize: '0.95rem' }}>Sync Configuration</h4>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                      <button
                        onClick={handleLoadChats}
                        disabled={loadingChats || whatsappLoading}
                        className={styles.syncButton}
                        style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                      >
                        {loadingChats ? 'Loading Chats...' : 'Refresh Chats'}
                      </button>
                      <button
                        onClick={handleSaveSyncConfig}
                        disabled={savingConfig}
                        className={styles.connectButton}
                        style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                      >
                        {savingConfig ? 'Saving...' : 'Save Selection'}
                      </button>
                    </div>

                    {availableChats.length > 0 && (
                      <div style={{
                        maxHeight: '200px',
                        overflowY: 'auto',
                        background: 'var(--bg-secondary)',
                        padding: '10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-primary)'
                      }}>
                        {availableChats.map(chat => (
                          <label key={chat.id} style={{
                            padding: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            cursor: 'pointer',
                            borderBottom: '1px solid var(--border-primary)',
                            fontSize: '0.9rem'
                          }}>
                            <input
                              type="checkbox"
                              checked={monitoredChats.includes(chat.name)}
                              onChange={() => toggleChat(chat.name)}
                              style={{ marginRight: '10px' }}
                            />
                            <span>{chat.name}</span>
                            {chat.unreadCount > 0 && (
                              <span style={{
                                marginLeft: 'auto',
                                background: '#25D366',
                                color: 'white',
                                borderRadius: '999px',
                                padding: '2px 6px',
                                fontSize: '0.7em'
                              }}>
                                {chat.unreadCount}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={styles.scopes}>
                    <span className={styles.scopesLabel}>Features:</span>
                    <ul className={styles.scopesList}>
                      <li className={styles.scopeItem}>💬 Message sync (while browser active)</li>
                      <li className={styles.scopeItem}>🔄 Auto-sync every 30 minutes</li>
                    </ul>
                  </div>

                  <button
                    onClick={handleWhatsAppSync}
                    disabled={whatsappLoading}
                    className={styles.syncButton}
                    style={{ marginTop: '16px' }}
                  >
                    {whatsappLoading ? 'Syncing...' : 'Sync Now'}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Add Account Modal */}
        {showAddModal && (
          <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>Add Connection</h2>
                <button
                  className={styles.closeButton}
                  onClick={() => setShowAddModal(false)}
                >
                  <X size={20} />
                </button>
              </div>

              <div className={styles.modalBody}>
                {/* Google */}
                <div
                  className={`${styles.providerOption} ${isGoogleConnected ? styles.providerOptionDisabled : ''}`}
                  onClick={() => {
                    if (!isGoogleConnected) {
                      handleConnect('google');
                      setShowAddModal(false);
                    }
                  }}
                >
                  <div className={styles.providerLabel}>
                    <svg className={styles.googleIcon} viewBox="0 0 24 24" width="24" height="24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <div>
                      <div className={styles.providerNameLabel}>Google</div>
                      <div className={styles.providerStatusLabel}>Gmail and Calendar</div>
                    </div>
                  </div>
                  {isGoogleConnected ? (
                    <span className={styles.providerStatusLabel}>Connected</span>
                  ) : (
                    <ChevronRight size={20} color="var(--text-secondary)" />
                  )}
                </div>

                {/* Microsoft */}
                <div
                  className={`${styles.providerOption} ${isMicrosoftConnected ? styles.providerOptionDisabled : ''}`}
                  onClick={() => {
                    if (!isMicrosoftConnected) {
                      handleConnect('microsoft');
                      setShowAddModal(false);
                    }
                  }}
                >
                  <div className={styles.providerLabel}>
                    <svg className={styles.googleIcon} viewBox="0 0 23 23" width="24" height="24">
                      <path fill="#f35325" d="M1 1h10v10H1z" />
                      <path fill="#81bc06" d="M12 1h10v10H12z" />
                      <path fill="#05a6f0" d="M1 12h10v10H1z" />
                      <path fill="#ffba08" d="M12 12h10v10H12z" />
                    </svg>
                    <div>
                      <div className={styles.providerNameLabel}>Outlook</div>
                      <div className={styles.providerStatusLabel}>Mail and Calendar</div>
                    </div>
                  </div>
                  {isMicrosoftConnected ? (
                    <span className={styles.providerStatusLabel}>Connected</span>
                  ) : (
                    <ChevronRight size={20} color="var(--text-secondary)" />
                  )}
                </div>

                {/* WhatsApp */}
                <div
                  className={`${styles.providerOption} ${(whatsappStatus?.connected || whatsappStatus?.browserRunning) ? styles.providerOptionDisabled : ''}`}
                  onClick={() => {
                    if (!(whatsappStatus?.connected || whatsappStatus?.browserRunning)) {
                      handleWhatsAppConnect();
                      setShowAddModal(false);
                    }
                  }}
                >
                  <div className={styles.providerLabel}>
                    <svg className={styles.whatsappIcon} viewBox="0 0 24 24" width="24" height="24">
                      <path fill="#25D366" d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.432 2.56 1.258 3.522l-1.328 4.78 4.904-1.286c1.111.606 2.37.924 3.652.925.001 0 .001 0 0 0 3.181 0 5.767-2.586 5.768-5.766.001-1.536-.597-2.986-1.684-4.075-1.087-1.088-2.537-1.687-4.073-1.687L12.031 6.172zm3.328 8.167c-.201-.101-1.189-.587-1.373-.654-.184-.067-.319-.101-.453.101-.134.201-.52.654-.637.788-.118.134-.235.151-.436.05-.201-.101-.85-.313-1.618-1c-.596-.532-.998-1.189-1.115-1.391-.118-.201-.012-.31.089-.41.09-.091.201-.235.302-.352.101-.118.134-.201.201-.336.067-.134.034-.252-.017-.352-.05-.101-.453-1.091-.621-1.494-.164-.391-.332-.338-.454-.344-.117-.006-.252-.007-.384-.007-.134 0-.352.05-.537.252-.185.201-.704.688-.704 1.68s.721 1.947.822 2.081c.101.134 1.417 2.164 3.433 3.036.48.207.854.331 1.146.424.481.153.918.131 1.263.079.385-.058 1.189-.486 1.356-.956.168-.47.168-.872.118-.956-.05-.084-.184-.134-.385-.235z" />
                    </svg>
                    <div>
                      <div className={styles.providerNameLabel}>WhatsApp</div>
                      <div className={styles.providerStatusLabel}>Real-time message sync</div>
                    </div>
                  </div>
                  {(whatsappStatus?.connected || whatsappStatus?.browserRunning) ? (
                    <span className={styles.providerStatusLabel}>{whatsappStatus.connected ? 'Connected' : 'Connecting...'}</span>
                  ) : (
                    <ChevronRight size={20} color="var(--text-secondary)" />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className={styles.loading}>Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
