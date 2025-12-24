'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { AnswerCard } from '@/components/AnswerCard';
import { ConfidenceBar } from '@/components/ConfidenceBar';
import { SourceBadges } from '@/components/SourceBadges';
import { ExtensionStatus } from '@/components/ExtensionStatus';

interface Answer {
  answer: string;
  citations: Array<{
    source: string;
    content: string;
    id: string;
  }>;
  confidence: number;
  insufficient: boolean;
}

interface AskResponse {
  status: string;
  request_id: string;
  answer?: Answer;
  requires_extension?: boolean;
  sources_needed?: string[];
}

// Lazy load supabase client
const getSupabase = async () => {
  const { createClient } = await import('@/lib/supabase/client');
  return createClient();
};

export default function AskPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const router = useRouter();

  const checkExtension = useCallback(async () => {
    try {
      setExtensionConnected(false);
    } catch {
      setExtensionConnected(false);
    }
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = await getSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
      } else {
        setUser(user);
      }
    };

    checkAuth();
    checkExtension();
  }, [router, checkExtension]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setResponse(null);

    try {
      const supabase = await getSupabase();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const res = await fetch('http://localhost:3001/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ query }),
      });

      const data = await res.json();
      setResponse(data);

      if (data.requires_extension && data.request_id) {
        pollForResults(data.request_id, session.access_token);
      }
    } catch (error) {
      console.error('Ask error:', error);
      setResponse({
        status: 'error',
        request_id: '',
        answer: {
          answer: 'An error occurred. Please try again.',
          citations: [],
          confidence: 0,
          insufficient: true,
        },
      });
    } finally {
      setLoading(false);
    }
  };

  const pollForResults = async (requestId: string, accessToken: string) => {
    const maxAttempts = 30;
    let attempts = 0;

    const poll = async () => {
      try {
        const res = await fetch(`http://localhost:3001/dom/results/${requestId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        const data = await res.json();

        if (data.status === 'complete' || attempts >= maxAttempts) {
          setResponse(prev => ({
            ...prev!,
            status: 'complete',
          }));
          return;
        }

        attempts++;
        setTimeout(poll, 1000);
      } catch {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000);
        }
      }
    };

    poll();
  };

  const handleSignOut = async () => {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>✦</span>
          Anor
        </div>
        <div className={styles.headerRight}>
          <ExtensionStatus connected={extensionConnected} />
          <div className={styles.userMenu}>
            <span className={styles.userEmail}>{user?.email}</span>
            <button onClick={handleSignOut} className={styles.signOutButton}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className={styles.container}>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputWrapper}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask anything about your emails, calendar, or messages..."
              className={styles.input}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className={styles.submitButton}
            >
              {loading ? (
                <span className={styles.spinner} />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              )}
            </button>
          </div>
        </form>

        {response?.requires_extension && response.status !== 'complete' && (
          <div className={styles.extensionNotice}>
            <span className={styles.noticeIcon}>⏳</span>
            Waiting for extension to search {response.sources_needed?.join(', ')}...
          </div>
        )}

        {response?.answer && (
          <div className={styles.results}>
            <ConfidenceBar confidence={response.answer.confidence} />
            <AnswerCard answer={response.answer} />
            {response.answer.citations.length > 0 && (
              <SourceBadges citations={response.answer.citations} />
            )}
          </div>
        )}

        {!response && !loading && (
          <div className={styles.hints}>
            <h3>Try asking:</h3>
            <div className={styles.hintList}>
              <button 
                className={styles.hint} 
                onClick={() => setQuery("What meetings do I have this week?")}
              >
                What meetings do I have this week?
              </button>
              <button 
                className={styles.hint}
                onClick={() => setQuery("Find emails from my manager about the project deadline")}
              >
                Find emails from my manager about the project deadline
              </button>
              <button 
                className={styles.hint}
                onClick={() => setQuery("What did John message me about on LinkedIn?")}
              >
                What did John message me about on LinkedIn?
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
