import Link from 'next/link';

interface PaywallOverlayProps {
  returnUrl?: string;
  title?: string;
  description?: string;
}

export function PaywallOverlay({
  returnUrl,
  title = 'Premium Content',
  description = 'Subscribe to access videos, premium resources, and the full skills library.',
}: PaywallOverlayProps) {
  const loginUrl = returnUrl
    ? `/login?redirect=${encodeURIComponent(returnUrl)}`
    : '/login';

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-[#12121a] border border-amber-500/20 rounded-2xl p-8 text-center">
        {/* Lock icon */}
        <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-10 h-10 text-amber-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white mb-3">{title}</h1>

        {/* Description */}
        <p className="text-neutral-400 mb-8">{description}</p>

        {/* CTA Buttons */}
        <div className="space-y-3">
          <Link
            href="/pricing"
            className="block w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold rounded-lg transition-all shadow-lg shadow-amber-500/25"
          >
            View Pricing
          </Link>

          <Link
            href={loginUrl}
            className="block w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-lg transition-colors"
          >
            Sign In
          </Link>
        </div>

        {/* Features preview */}
        <div className="mt-8 pt-8 border-t border-neutral-800">
          <p className="text-sm text-neutral-500 mb-4">Premium includes:</p>
          <ul className="text-left space-y-2">
            <li className="flex items-center gap-2 text-sm text-neutral-400">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Video courses with transcripts
            </li>
            <li className="flex items-center gap-2 text-sm text-neutral-400">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              AI Knowledge Bot
            </li>
            <li className="flex items-center gap-2 text-sm text-neutral-400">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Trading skills library
            </li>
            <li className="flex items-center gap-2 text-sm text-neutral-400">
              <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Premium learning resources
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
