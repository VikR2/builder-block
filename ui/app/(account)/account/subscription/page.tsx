'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';

export default function SubscriptionPage() {
  const { user, loading } = useAuth();
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to open subscription portal');
      }

      // Redirect to Stripe Customer Portal
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setPortalLoading(false);
    }
  };

  // Server-side layout handles auth, show loading while hydrating
  if (loading || !user) {
    return (
      <div className="container py-12 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-neutral-800 rounded w-1/3"></div>
          <div className="h-48 bg-neutral-800 rounded"></div>
        </div>
      </div>
    );
  }

  if (!user.isPremium) {
    return (
      <div className="container py-12 max-w-2xl mx-auto">
        <div className="bg-[#12121a] border border-neutral-800 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">No Active Subscription</h1>
          <p className="text-neutral-400 mb-6">
            You don't have an active subscription. Upgrade to Premium to access all content.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium rounded-lg transition-colors"
          >
            View Pricing
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-12 max-w-2xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link
          href="/account"
          className="text-neutral-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-white">Subscription</h1>
      </div>

      {/* Status Card */}
      <div className="bg-[#12121a] border border-amber-500/20 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white mb-1">TCM Premium</h2>
            <p className="text-neutral-400">Full access to all content</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-sm font-medium">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
            Active
          </span>
        </div>

        <div className="pt-4 border-t border-neutral-800">
          <p className="text-sm text-neutral-500">
            Your subscription is active and you have full access to all features.
          </p>
        </div>
      </div>

      {/* Actions Card */}
      <div className="bg-[#12121a] border border-neutral-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Manage Subscription</h2>

        <p className="text-neutral-400 mb-6">
          Use the Stripe Customer Portal to update your payment method, view invoices, or cancel your subscription.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleManageSubscription}
          disabled={portalLoading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
        >
          {portalLoading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Opening portal...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open Stripe Portal
            </>
          )}
        </button>

        <div className="mt-6 pt-6 border-t border-neutral-800">
          <h3 className="text-sm font-medium text-neutral-300 mb-3">What you can do in the portal:</h3>
          <ul className="space-y-2 text-sm text-neutral-400">
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Update payment method
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              View billing history and invoices
            </li>
            <li className="flex items-center gap-2">
              <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Cancel subscription
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
