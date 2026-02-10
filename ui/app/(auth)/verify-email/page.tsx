'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function VerifyEmailContent() {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');

    if (!token) {
      setStatus('error');
      return;
    }

    // The verification is handled by the API route which redirects
    // This page is for manual verification or showing status
    const verifyEmail = async () => {
      try {
        const response = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);

        if (response.redirected) {
          window.location.href = response.url;
          return;
        }

        if (response.ok) {
          setStatus('success');
        } else {
          setStatus('error');
        }
      } catch (error) {
        setStatus('error');
      }
    };

    verifyEmail();
  }, [searchParams]);

  if (status === 'verifying') {
    return (
      <div className="bg-[#12121a] border border-neutral-800 rounded-xl p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <h1 className="text-xl font-bold text-white mb-2">Verifying your email...</h1>
        <p className="text-neutral-400">Please wait while we verify your email address.</p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="bg-[#12121a] border border-neutral-800 rounded-xl p-8 text-center">
        <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Email Verified!</h1>
        <p className="text-neutral-400 mb-6">Your email address has been verified successfully.</p>
        <Link
          href="/login"
          className="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
        >
          Continue to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-[#12121a] border border-neutral-800 rounded-xl p-8 text-center">
      <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-white mb-2">Verification Failed</h1>
      <p className="text-neutral-400 mb-6">
        The verification link is invalid or has expired. Please request a new verification email.
      </p>
      <Link
        href="/login"
        className="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
      >
        Back to Sign In
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="bg-[#12121a] border border-neutral-800 rounded-xl p-8 text-center">
        <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <h1 className="text-xl font-bold text-white mb-2">Loading...</h1>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
