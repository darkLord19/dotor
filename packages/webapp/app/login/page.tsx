'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { fadeVariants, slideUpVariants, staggerContainer, staggerItem } from '@/lib/animations';
import styles from './page.module.css';
import { signup, loginWithMagicLink } from './actions';

type AuthMode = 'login' | 'signup' | 'magic';

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();


  // Handle signup form submission
  const handleSignup = async (formData: FormData) => {
    setMessage('');
    setIsError(false);
    
    startTransition(async () => {
      const result = await signup(formData);
      
      if (result?.error) {
        setMessage(result.error);
        setIsError(true);
      } else if (result?.success) {
        setMessage(result.success);
        setIsError(false);
      }
    });
  };

  const handleMagicLink = async (formData: FormData) => {
    setMessage('');
    setIsError(false);
    
    startTransition(async () => {
      const result = await loginWithMagicLink(formData);
      
      if (result?.error) {
        setMessage(result.error);
        setIsError(true);
      } else if (result?.success) {
        setMessage(result.success);
        setIsError(false);
      }
    });
  };

  return (
    <motion.main 
      className={styles.main}
      initial="hidden"
      animate="visible"
      variants={fadeVariants}
    >
      <motion.div 
        className={styles.card}
        variants={slideUpVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={staggerContainer} initial="hidden" animate="visible">
          <motion.div className={styles.logo} variants={staggerItem}>
            <span className={styles.logoIcon}>✦</span>
            Dotor
          </motion.div>
          
          <motion.h1 className={styles.title} variants={staggerItem}>
            {mode === 'signup' ? 'Create account' : 'Welcome back'}
          </motion.h1>
          
          <motion.p className={styles.subtitle} variants={staggerItem}>
            {mode === 'signup' 
              ? 'Sign up to get started' 
              : 'Sign in to access your personal assistant'}
          </motion.p>

          <motion.div variants={staggerItem}>
            {mode === 'magic' ? (
              <form action={handleMagicLink} className={styles.form}>
                <input
                  type="email"
                  name="email"
                  placeholder="Enter your email"
                  className={styles.input}
                  disabled={isPending}
                  required
                />
                <button
                  type="submit"
                  disabled={isPending}
                  className={styles.primaryButton}
                >
                  {isPending ? 'Sending...' : 'Send Magic Link'}
                </button>
              </form>
            ) : (
              <form 
                action={mode === 'login' ? '/api/login' : handleSignup}
                {...(mode === 'login' ? { method: 'POST' } : {})}
                className={styles.form}
              >
                <input
                  type="email"
                  name="email"
                  placeholder="Email"
                  className={styles.input}
                  disabled={isPending}
                  autoComplete="email"
                  required
                />
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  className={styles.input}
                  disabled={isPending}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="submit"
                  disabled={isPending}
                  className={styles.primaryButton}
                >
                  {isPending ? 'Loading...' : mode === 'signup' ? 'Sign up' : 'Sign in'}
                </button>
              </form>
            )}
          </motion.div>

          {message && (
            <motion.p 
              className={`${styles.message} ${isError ? styles.error : ''}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {message}
            </motion.p>
          )}

          <motion.div className={styles.authToggle} variants={staggerItem}>
            {mode === 'login' && (
              <>
                <button 
                  onClick={() => { setMode('signup'); setMessage(''); }}
                  className={styles.linkButton}
                >
                  Don&apos;t have an account? Sign up
                </button>
                <button 
                  onClick={() => { setMode('magic'); setMessage(''); }}
                  className={styles.linkButton}
                >
                  Use magic link instead
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button 
                onClick={() => { setMode('login'); setMessage(''); }}
                className={styles.linkButton}
              >
                Already have an account? Sign in
              </button>
            )}
            {mode === 'magic' && (
              <button 
                onClick={() => { setMode('login'); setMessage(''); }}
                className={styles.linkButton}
              >
                Use password instead
              </button>
            )}
          </motion.div>

          <motion.p className={styles.privacy} variants={staggerItem}>
            🔒 Your data is never stored. Privacy-first.
          </motion.p>
        </motion.div>
      </motion.div>
    </motion.main>
  );
}
