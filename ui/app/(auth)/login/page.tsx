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

  const searchParams = useSearchParams();
  const router = useRouter();
  const { refresh } = useAuth();
  const redirect = getSafeRedirectPath(searchParams.get('redirect'), '/home');
  const googleHref = `/api/auth/google?redirect=${encodeURIComponent(redirect)}`;

  // Handle URL error/success messages
  useEffect(() => {
    const errorParam = searchParams.get('error');
    const verifiedParam = searchParams.get('verified');

    if (errorParam === 'invalid_token') {
      setError('The verification link is invalid or has expired.');
    } else if (errorParam === 'missing_token') {
      setError('Invalid verification link.');
    } else if (errorParam === 'google_not_configured') {
      setError('Google sign-in is not configured yet. Use email and password for now.');
    } else if (errorParam === 'google_invalid_state') {
      setError('Your Google sign-in session expired. Please try again.');
    } else if (errorParam === 'google_denied') {
      setError('Google sign-in was cancelled.');
    } else if (errorParam === 'google_email_unverified') {
      setError('Google did not confirm a verified email for this account.');
    } else if (errorParam === 'google_account_mismatch') {
      setError('This email is already linked to a different Google account.');
    } else if (errorParam?.startsWith('google_')) {
      setError('Google sign-in failed. Please try again or use email and password.');
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

      await refresh();
      router.push(redirect);
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

      <a
        href={googleHref}
        className="flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-medium text-white transition-colors hover:border-neutral-500 hover:bg-neutral-900"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-neutral-900">
          G
        </span>
        Continue with Google
      </a>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-neutral-800"></div>
        <span className="text-xs uppercase tracking-wide text-neutral-500">or email</span>
        <div className="h-px flex-1 bg-neutral-800"></div>
      </div>

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
