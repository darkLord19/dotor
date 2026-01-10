'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getBackendUrl } from '@/lib/config';
import styles from './ConnectMicrosoft.module.css';

export function ConnectMicrosoft() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setError('Please log in first');
        return;
      }

      const backendUrl = getBackendUrl();

      // Get the auth URL from the backend
      const response = await fetch(`${backendUrl}/microsoft/auth-url`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get auth URL');
      }

      const { url } = await response.json();

      // Redirect to Microsoft OAuth
      window.location.href = url;
    } catch (err) {
      console.error('Failed to connect Microsoft:', err);
      setError('Failed to start Microsoft connection. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.iconWrapper}>
          <svg className={styles.icon} viewBox="0 0 23 23">
            <path fill="#f35325" d="M1 1h10v10H1z"/>
            <path fill="#81bc06" d="M12 1h10v10H12z"/>
            <path fill="#05a6f0" d="M1 12h10v10H1z"/>
            <path fill="#ffba08" d="M12 12h10v10H12z"/>
          </svg>
        </div>
        <h2 className={styles.title}>Connect Your Outlook Account</h2>
        <p className={styles.description}>
          To search your emails and calendar, you need to connect your Microsoft Outlook account. 
          We only request read-only access and never store your personal data.
        </p>
        <ul className={styles.permissions}>
          <li>
            <span className={styles.permissionIcon}>📧</span>
            <span>Read-only access to Outlook</span>
          </li>
          <li>
            <span className={styles.permissionIcon}>📅</span>
            <span>Read-only access to Calendar</span>
          </li>
        </ul>
        {error && <p className={styles.error}>{error}</p>}
        <button
          onClick={handleConnect}
          disabled={loading}
          className={styles.button}
        >
          {loading ? (
            <span className={styles.spinner} />
          ) : (
            <>
              <svg className={styles.msIcon} viewBox="0 0 23 23">
                <path fill="#f35325" d="M1 1h10v10H1z"/>
                <path fill="#81bc06" d="M12 1h10v10H12z"/>
                <path fill="#05a6f0" d="M1 12h10v10H12z"/>
                <path fill="#ffba08" d="M12 12h10v10H12z"/>
              </svg>
              Connect Outlook Account
            </>
          )}
        </button>
        <p className={styles.privacy}>
          🔒 Your data stays private. We process queries in real-time and never store your emails or events.
        </p>
      </div>
    </div>
  );
}
