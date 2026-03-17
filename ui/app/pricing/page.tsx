'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';

function PricingContent() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isSuccess = searchParams.get('success') === 'true';
  const isCanceled = searchParams.get('canceled') === 'true';

  const handleSubscribe = async () => {
    if (!user) {
      router.push('/login?redirect=/pricing');
      return;
    }

    if (user.isPremium) {
      setError('You already have an active subscription');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  // If success, redirect to the library after a moment
  useEffect(() => {
    if (isSuccess) {
      const timer = setTimeout(() => {
        router.push('/tcm/library');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, router]);

  const features = [
    'Full access to video courses with synchronized transcripts',
    'Complete trading skills library with code snippets',
    'AI-powered Knowledge Bot for instant answers',
    'Comprehensive study guides and documentation',
    'Pine Script and NinjaTrader C# code examples',
    'New content added regularly',
  ];

  if (isSuccess) {
    return (
      <div className="container py-20 max-w-lg mx-auto text-center">
        <div className="bg-[#12121a] border border-green-500/20 rounded-2xl p-10">
          <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Welcome to Premium!</h1>
          <p className="text-neutral-400 mb-6">
            Your subscription is now active. You have full access to all content.
          </p>
          <p className="text-sm text-neutral-500">
            Redirecting you to the video library...
          </p>
        </div>
      </div>
    );
  }

  if (user?.isPremium) {
    return (
      <div className="container py-20 max-w-lg mx-auto text-center">
        <div className="bg-[#12121a] border border-amber-500/20 rounded-2xl p-10">
          <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">You're Premium!</h1>
          <p className="text-neutral-400 mb-6">
            You have full access to all content. Explore the platform:
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/tcm/library"
              className="px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors"
            >
              Browse Video Courses
            </Link>
            {user.hasStripeSubscription ? (
              <Link
                href="/account/subscription"
                className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-lg transition-colors"
              >
                Manage Subscription
              </Link>
            ) : (
              <Link
                href="/account"
                className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-lg transition-colors"
              >
                Account Settings
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-12 md:py-20">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-500 text-sm font-medium mb-6">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            TCM Premium Access
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Unlock All Trading Education
          </h1>
          <p className="text-lg text-neutral-400 max-w-2xl mx-auto">
            Get complete access to video courses, skills library, AI-powered Q&A, and more.
          </p>
        </div>

        {/* Canceled message */}
        {isCanceled && (
          <div className="mb-8 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-center">
            <p className="text-amber-400">
              Checkout was canceled. You can try again anytime.
            </p>
          </div>
        )}

        {/* Pricing card */}
        <div className="bg-[#12121a] border border-amber-500/20 rounded-2xl overflow-hidden">
          <div className="p-8 md:p-10">
            {/* Price */}
            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-5xl font-bold text-white">$XX</span>
              <span className="text-xl text-neutral-400">/month</span>
            </div>

            {/* Description */}
            <p className="text-neutral-400 mb-8">
              Everything you need to master trading concepts from The Currency Merchant.
            </p>

            {/* Features */}
            <ul className="space-y-4 mb-8">
              {features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-neutral-300">{feature}</span>
                </li>
              ))}
            </ul>

            {/* Error message */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* CTA Button */}
            <button
              onClick={handleSubscribe}
              disabled={loading || authLoading}
              className="w-full py-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white font-semibold rounded-xl text-lg transition-all shadow-lg shadow-amber-500/25"
            >
              {loading ? 'Redirecting to checkout...' : 'Subscribe Now'}
            </button>

            {!user && (
              <p className="mt-4 text-center text-sm text-neutral-500">
                Already have an account?{' '}
                <Link href="/login?redirect=/pricing" className="text-amber-500 hover:text-amber-400">
                  Sign in
                </Link>
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 md:px-10 py-4 bg-neutral-900/50 border-t border-neutral-800">
            <div className="flex items-center justify-center gap-6 text-sm text-neutral-500">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Secure checkout
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Cancel anytime
              </div>
            </div>
          </div>
        </div>

        {/* FAQ or Trust signals */}
        <div className="mt-12 text-center text-sm text-neutral-500">
          <p>Questions? Contact support for help with your subscription.</p>
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="container py-20 max-w-lg mx-auto text-center">
        <div className="animate-pulse">
          <div className="h-10 bg-neutral-800 rounded w-3/4 mx-auto mb-4"></div>
          <div className="h-6 bg-neutral-800 rounded w-1/2 mx-auto mb-8"></div>
          <div className="bg-neutral-800 rounded-2xl h-96"></div>
        </div>
      </div>
    }>
      <PricingContent />
    </Suspense>
  );
}
