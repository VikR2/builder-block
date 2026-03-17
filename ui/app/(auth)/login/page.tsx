'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { getSafeRedirectPath } from '@/lib/auth/redirects';

function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<'password' | 'magic-link'>('password');

  const searchParams = useSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();
  const redirect = getSafeRedirectPath(searchParams.get('redirect'), '/home');

  // Handle URL error/success messages
  useEffect(() => {
    const errorParam = searchParams.get('error');
    const verifiedParam = searchParams.get('verified');

    if (errorParam === 'invalid_token') {
      setError('The sign-in link is invalid or has expired. Please request a new one.');
    } else if (errorParam === 'missing_token') {
      setError('Invalid sign-in link. Please request a new one.');
    }

    if (verifiedParam === 'true') {
      setSuccess('Email verified successfully! You can now sign in.');
    }
  }, [searchParams]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      router.push(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send magic link');
      }

      setSuccess('Check your email for the sign-in link!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#12121a] border border-neutral-800 rounded-xl p-8">
      <h1 className="text-2xl font-bold text-white mb-2">Welcome back</h1>
      <p className="text-neutral-400 mb-6">Sign in to your account</p>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setMode('password')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            mode === 'password'
              ? 'bg-indigo-600 text-white'
              : 'bg-neutral-800 text-neutral-400 hover:text-white'
          }`}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => setMode('magic-link')}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            mode === 'magic-link'
              ? 'bg-indigo-600 text-white'
              : 'bg-neutral-800 text-neutral-400 hover:text-white'
          }`}
        >
          Magic Link
        </button>
      </div>

      {/* Error/Success messages */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
          {success}
        </div>
      )}

      {mode === 'password' ? (
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Enter your password"
              required
            />
          </div>

          <div className="flex justify-end">
            <Link
              href="/reset-password"
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleMagicLink} className="space-y-4">
          <div>
            <label htmlFor="magic-email" className="block text-sm font-medium text-neutral-300 mb-1">
              Email
            </label>
            <input
              id="magic-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="you@example.com"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Sending...' : 'Send Magic Link'}
          </button>

          <p className="text-center text-sm text-neutral-500">
            We'll send you a link to sign in instantly, no password needed.
          </p>
        </form>
      )}

      <div className="mt-6 pt-6 border-t border-neutral-800 text-center">
        <p className="text-neutral-400">
          Don't have an account?{' '}
          <Link href="/signup" className="text-indigo-400 hover:text-indigo-300">
            Sign up
          </Link>
        </p>
      </div>

      {/* Dev-only auto-login button */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="mt-4 pt-4 border-t border-dashed border-yellow-600/30">
          <button
            type="button"
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                const response = await fetch('/api/dev/login', { method: 'POST' });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error);
                await refresh(); // Update auth context with new session
                router.push(redirect);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Dev login failed');
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            className="w-full py-2 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/50 text-yellow-500 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Logging in...' : '⚡ Dev Login (dev@test.com)'}
          </button>
          <p className="text-xs text-yellow-600/60 mt-2 text-center">Development only</p>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-[#12121a] border border-neutral-800 rounded-xl p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-neutral-800 rounded w-2/3"></div>
            <div className="h-4 bg-neutral-800 rounded w-1/2"></div>
            <div className="h-10 bg-neutral-800 rounded"></div>
            <div className="h-10 bg-neutral-800 rounded"></div>
            <div className="h-12 bg-neutral-800 rounded"></div>
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
