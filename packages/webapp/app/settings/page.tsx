'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '../ask/page';
import styles from './page.module.css';

interface Connection {
  type: string;
  email: string | null;
  scopes: string[];
  connectedAt: string;
  needsRefresh: boolean;
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = await getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push('/login');
        return;
      }
      
      setUser(user);
      
      // Fetch connections
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session) {
        try {
          const response = await fetch(`${backendUrl}/connections`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            setConnections(data);
          }
        } catch (error) {
          console.error('Failed to fetch connections:', error);
        }
      }
      
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  const handleDisconnect = async (type: string) => {
    const supabase = await getSupabase();
    const { data: { session } } = await supabase.auth.getSession();
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
    
    if (!session) return;
    
    try {
      const response = await fetch(`${backendUrl}/${type}/disconnect`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
      if (response.ok) {
        // Refresh connections
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

  if (loading) {
    return (
      <main className={styles.main}>
        <div className={styles.loading}>Loading...</div>
      </main>
    );
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>✦</span>
          Anor
        </div>
        <div className={styles.headerRight}>
          <button 
            onClick={() => router.push('/ask')} 
            className={styles.backButton}
          >
            ← Back
          </button>
        </div>
      </header>

      <div className={styles.container}>
        <h1 className={styles.title}>Settings</h1>

        {/* Profile Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Profile</h2>
          <div className={styles.profileInfo}>
            <div className={styles.profileField}>
              <label>Email</label>
              <div className={styles.profileValue}>{user?.email || 'N/A'}</div>
            </div>
            <div className={styles.profileField}>
              <label>User ID</label>
              <div className={styles.profileValue}>{user?.id || 'N/A'}</div>
            </div>
          </div>
        </section>

        {/* Connected Accounts Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Connected Accounts</h2>
          {connections.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No accounts connected</p>
            </div>
          ) : (
            <div className={styles.connectionsList}>
              {connections.map((conn, index) => (
                <div key={index} className={styles.connectionItem}>
                  <div className={styles.connectionInfo}>
                    <div className={styles.connectionType}>
                      {conn.type === 'google' && (
                        <svg className={styles.googleIcon} viewBox="0 0 24 24" width="24" height="24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                      )}
                      <span className={styles.connectionTypeName}>
                        {conn.type.charAt(0).toUpperCase() + conn.type.slice(1)}
                      </span>
                    </div>
                    {conn.email && (
                      <div className={styles.connectionEmail}>{conn.email}</div>
                    )}
                    <div className={styles.connectionMeta}>
                      <span>Connected {new Date(conn.connectedAt).toLocaleDateString()}</span>
                      {conn.needsRefresh && (
                        <span className={styles.needsRefresh}>• Needs refresh</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDisconnect(conn.type)}
                    className={styles.disconnectButton}
                  >
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

