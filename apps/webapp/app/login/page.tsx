'use client';

import { useState, useTransition } from 'react';
import { signup, loginWithMagicLink } from './actions';
import { ThemeSwitcher } from '@/components/ui/theme-switcher';

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
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-gray-50 to-primary-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 px-4">
      <div className="absolute top-4 right-4">
        <ThemeSwitcher />
      </div>

      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 p-8 space-y-6">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 text-2xl font-bold">
            <span className="text-primary-600 dark:text-primary-400">✦</span>
            <span className="text-gray-900 dark:text-gray-100">Dotor</span>
          </div>

          {/* Title */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {mode === 'signup' ? 'Create account' : 'Welcome back'}
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              {mode === 'signup' 
                ? 'Sign up to get started' 
                : 'Sign in to access your personal assistant'}
            </p>
          </div>

          {/* Form */}
          {mode === 'magic' ? (
            <form action={handleMagicLink} className="space-y-4">
              <input
                type="email"
                name="email"
                placeholder="Enter your email"
                className="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 disabled:opacity-50"
                disabled={isPending}
                required
              />
              <button
                type="submit"
                disabled={isPending}
                className="w-full px-4 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-medium transition-colors"
              >
                {isPending ? 'Sending...' : 'Send Magic Link'}
              </button>
            </form>
          ) : (
            <form 
              action={mode === 'login' ? '/api/login' : handleSignup}
              {...(mode === 'login' ? { method: 'POST' } : {})}
              className="space-y-4"
            >
              <input
                type="email"
                name="email"
                placeholder="Email"
                className="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 disabled:opacity-50"
                disabled={isPending}
                autoComplete="email"
                required
              />
              <input
                type="password"
                name="password"
                placeholder="Password"
                className="w-full px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 disabled:opacity-50"
                disabled={isPending}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
              />
              <button
                type="submit"
                disabled={isPending}
                className="w-full px-4 py-3 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white font-medium transition-colors"
              >
                {isPending ? 'Loading...' : mode === 'signup' ? 'Sign up' : 'Sign in'}
              </button>
            </form>
          )}

          {/* Message */}
          {message && (
            <p className={`text-sm text-center ${isError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
              {message}
            </p>
          )}

          {/* Auth Toggle */}
          <div className="space-y-2 text-center">
            {mode === 'login' && (
              <>
                <button 
                  onClick={() => { setMode('signup'); setMessage(''); }}
                  className="block w-full text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Don&apos;t have an account? Sign up
                </button>
                <button 
                  onClick={() => { setMode('magic'); setMessage(''); }}
                  className="block w-full text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Use magic link instead
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button 
                onClick={() => { setMode('login'); setMessage(''); }}
                className="block w-full text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                Already have an account? Sign in
              </button>
            )}
            {mode === 'magic' && (
              <button 
                onClick={() => { setMode('login'); setMessage(''); }}
                className="block w-full text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                Use password instead
              </button>
            )}
          </div>

          {/* Privacy Notice */}
          <p className="text-sm text-center text-gray-600 dark:text-gray-400">
            🔒 Your data is never stored. Privacy-first.
          </p>
        </div>
      </div>
    </main>
  );
}
