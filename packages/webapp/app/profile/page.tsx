'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getBackendUrl } from '@/lib/config';
import { User, Lock, CreditCard, Loader2, Check, AlertCircle } from 'lucide-react';
import styles from './page.module.css';

type TabType = 'profile' | 'security' | 'subscription';

function ProfileContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState<TabType>('profile');
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Profile state
    const [name, setName] = useState('');
    const [updating, setUpdating] = useState(false);

    // Security state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        const tabParam = searchParams.get('tab') as TabType;
        if (tabParam && ['profile', 'security', 'subscription'].includes(tabParam)) {
            setActiveTab(tabParam);
        }
    }, [searchParams]);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const supabase = createClient();
                const { data: { session } } = await supabase.auth.getSession();

                if (!session) {
                    router.push('/login');
                    return;
                }

                setUser(session.user);
                setName(session.user.user_metadata?.full_name || session.user.user_metadata?.name || '');
            } catch (error) {
                console.error('Failed to fetch user:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
    }, [router]);

    const handleUpdateName = async (e: React.FormEvent) => {
        e.preventDefault();
        setUpdating(true);
        setMessage(null);

        try {
            const backendUrl = getBackendUrl();
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) throw new Error('Not authenticated');

            const response = await fetch(`${backendUrl}/account/profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update name');
            }

            // Refresh user data from server to confirm persistence
            const { data: { user: updatedUser } } = await supabase.auth.getUser();
            if (updatedUser) {
                setUser(updatedUser);
                setName(updatedUser.user_metadata?.full_name || updatedUser.user_metadata?.name || '');
                // Update session in storage
                await supabase.auth.refreshSession();
            }

            setMessage({ type: 'success', text: 'Profile updated successfully' });
            setTimeout(() => setMessage(null), 3000);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setUpdating(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match' });
            return;
        }

        setUpdating(true);
        setMessage(null);

        try {
            const backendUrl = getBackendUrl();
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            const response = await fetch(`${backendUrl}/account/password`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    currentPassword,
                    password: newPassword
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to update password');
            }

            setMessage({ type: 'success', text: 'Password updated successfully' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setTimeout(() => setMessage(null), 3000);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setUpdating(false);
        }
    };

    const handleDeleteAccount = async () => {
        setUpdating(true);
        try {
            const backendUrl = getBackendUrl();
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();

            const response = await fetch(`${backendUrl}/account/delete`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                },
            });

            if (!response.ok) throw new Error('Failed to delete account');

            setMessage({ type: 'success', text: 'Account deleted. Redirecting...' });
            setTimeout(() => router.push('/login'), 2000);
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
            setUpdating(false);
        }
    };

    if (loading) {
        return <div className={styles.loading}><Loader2 className={styles.spinner} /></div>;
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Account Settings</h1>
            </header>

            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${activeTab === 'profile' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('profile')}
                >
                    <User size={18} />
                    <span>My profile</span>
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'security' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('security')}
                >
                    <Lock size={18} />
                    <span>Security</span>
                </button>
                <button
                    className={`${styles.tab} ${activeTab === 'subscription' ? styles.tabActive : ''}`}
                    onClick={() => setActiveTab('subscription')}
                >
                    <CreditCard size={18} />
                    <span>Subscription</span>
                </button>
            </div>

            {message && (
                <div className={`${styles.message} ${styles[message.type]}`}>
                    {message.type === 'success' ? <Check size={18} /> : <AlertCircle size={18} />}
                    <span>{message.text}</span>
                </div>
            )}

            <main className={styles.content}>
                {activeTab === 'profile' && (
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>Personal Information</h2>
                        <form onSubmit={handleUpdateName} className={styles.form}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Full Name</label>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="e.g. John Doe"
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Email Address</label>
                                <input
                                    type="email"
                                    className={styles.input}
                                    value={user?.email || ''}
                                    disabled
                                />
                                <p className={styles.hint}>Email cannot be changed.</p>
                            </div>
                            <button type="submit" className={styles.button} disabled={updating}>
                                {updating ? 'Saving...' : 'Save Changes'}
                            </button>
                        </form>
                    </section>
                )}

                {activeTab === 'security' && (
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>Security Settings</h2>
                        <form onSubmit={handleUpdatePassword} className={styles.form}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Current Password</label>
                                <input
                                    type="password"
                                    className={styles.input}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>New Password</label>
                                <input
                                    type="password"
                                    className={styles.input}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    minLength={6}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Confirm New Password</label>
                                <input
                                    type="password"
                                    className={styles.input}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                            </div>
                            <button type="submit" className={styles.button} disabled={updating}>
                                {updating ? 'Updating...' : 'Update Password'}
                            </button>
                        </form>

                        <div className={styles.dangerZone}>
                            <h3 className={styles.dangerTitle}>Danger Zone</h3>
                            <p className={styles.dangerText}>Once you delete your account, there is no going back. Please be certain.</p>
                            {!showDeleteConfirm ? (
                                <button
                                    className={styles.deleteButton}
                                    onClick={() => setShowDeleteConfirm(true)}
                                >
                                    Delete Account
                                </button>
                            ) : (
                                <div className={styles.confirmDelete}>
                                    <p>Are you absolutely sure?</p>
                                    <div className={styles.confirmButtons}>
                                        <button className={styles.deleteButton} onClick={handleDeleteAccount} disabled={updating}>
                                            Yes, delete my account
                                        </button>
                                        <button className={styles.cancelButton} onClick={() => setShowDeleteConfirm(false)}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {activeTab === 'subscription' && (
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>Subscription Plan</h2>
                        <div className={styles.planCard}>
                            <div className={styles.planInfo}>
                                <h3 className={styles.planName}>Free Plan</h3>
                                <p className={styles.planDescription}>Access to basic AI assistant features.</p>
                            </div>
                            <div className={styles.planStatus}>Active</div>
                        </div>
                        <p className={styles.comingSoon}>Premium subscription management coming soon.</p>
                    </section>
                )}
            </main>
        </div>
    );
}

export default function ProfilePage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ProfileContent />
        </Suspense>
    );
}
