'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const { refresh } = useAuth();
  const googleHref = '/api/auth/google?redirect=/pricing';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      // Refresh auth context so pricing can immediately create checkout.
      await refresh();

      // Redirect to pricing page after signup
      router.push('/pricing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-[24px] border border-white/10 bg-[#111317]/95 p-7 shadow-2xl shadow-black/20 sm:p-8">
      <p className="eyebrow text-[#c9974f]">Create your workspace</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">Join The Currency Merchant</h1>
      <p className="mb-7 mt-2 text-sm leading-6 text-neutral-400">Set up the account used for indicator access and education.</p>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <a
        href={googleHref}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-semibold text-white transition-colors hover:bg-white/[0.07]"
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-white placeholder-neutral-500 focus:border-[#c9974f]/60 focus:outline-none focus:ring-2 focus:ring-[#c9974f]/25"
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
            className="min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-white placeholder-neutral-500 focus:border-[#c9974f]/60 focus:outline-none focus:ring-2 focus:ring-[#c9974f]/25"
            placeholder="At least 8 characters"
            required
            minLength={8}
          />
          <p className="mt-1 text-xs text-neutral-500">
            Must be at least 8 characters with a number and letter
          </p>
        </div>

        <div>
          <label htmlFor="confirm-password" className="block text-sm font-medium text-neutral-300 mb-1">
            Confirm Password
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="min-h-12 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-white placeholder-neutral-500 focus:border-[#c9974f]/60 focus:outline-none focus:ring-2 focus:ring-[#c9974f]/25"
            placeholder="Confirm your password"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="min-h-12 w-full rounded-full bg-[#c9974f] px-5 text-sm font-semibold text-[#15171a] transition-colors hover:bg-[#dfb36e] disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>

        <p className="text-center text-xs text-neutral-500">
          By signing up, you agree to our Terms of Service and Privacy Policy.
        </p>
      </form>

      <div className="mt-6 pt-6 border-t border-neutral-800 text-center">
        <p className="text-neutral-400">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-[#d5aa68] hover:text-[#e7c58d]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
