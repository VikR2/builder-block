'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';

export default function AccountPage() {
  const { user, loading, logout } = useAuth();

  // Server-side layout handles auth, show loading while hydrating
  if (loading || !user) {
    return (
      <div className="container py-12 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-neutral-800 rounded w-1/3"></div>
          <div className="h-48 bg-neutral-800 rounded"></div>
          <div className="h-48 bg-neutral-800 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-12 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-8">Account Settings</h1>

      {/* Profile Section */}
      <div className="bg-[#12121a] border border-neutral-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Profile</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Email</label>
            <p className="text-white">{user?.email}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Account Status</label>
            <div className="flex items-center gap-2">
              {user?.isPremium ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-400 rounded-full text-sm font-medium">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Premium Member
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-neutral-800 text-neutral-400 rounded-full text-sm font-medium">
                  Free Account
                </span>
              )}
              {user?.emailVerified ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-sm font-medium">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Email Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 text-yellow-400 rounded-full text-sm font-medium">
                  Email Not Verified
                </span>
              )}
            </div>
          </div>

          {!user?.isPremium && (
            <div className="pt-4 border-t border-neutral-800">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium rounded-lg transition-colors"
              >
                Upgrade to Premium
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Subscription Section (for paid subscriptions) */}
      {user.hasPaidSubscription && (
        <div className="bg-[#12121a] border border-neutral-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Subscription</h2>

          <p className="text-neutral-400 mb-4">
            Manage your subscription, update payment methods, or view billing history.
          </p>

          <Link
            href="/account/subscription"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            Manage Subscription
          </Link>
        </div>
      )}

      {/* Premium access that is not managed through Whop */}
      {user.isPremium && !user.hasPaidSubscription && (
        <div className="bg-[#12121a] border border-amber-500/20 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Premium Access</h2>

          <p className="text-neutral-400">
            Your premium access is active, but it is not managed through the Whop billing portal.
            If you need billing help or access changes, please contact support.
          </p>
        </div>
      )}

      {/* Security Section */}
      <div className="bg-[#12121a] border border-neutral-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">Security</h2>

        <div className="space-y-4">
          <p className="text-neutral-400">
            To change your password, use the password reset flow.
          </p>
          <Link
            href="/reset-password"
            className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Change Password
          </Link>
        </div>
      </div>

      {/* Sign Out */}
      <div className="bg-[#12121a] border border-neutral-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Session</h2>

        <button
          onClick={logout}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600/10 hover:bg-red-600/20 text-red-400 font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  );
}
