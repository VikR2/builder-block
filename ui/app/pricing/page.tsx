import { Suspense } from 'react';
import PricingPageClient from './pricing-page-client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function PricingFallback() {
  return (
    <div className="container py-20 max-w-lg mx-auto text-center">
      <div className="animate-pulse">
        <div className="h-10 bg-neutral-800 rounded w-3/4 mx-auto mb-4"></div>
        <div className="h-6 bg-neutral-800 rounded w-1/2 mx-auto mb-8"></div>
        <div className="bg-neutral-800 rounded-2xl h-96"></div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <Suspense fallback={<PricingFallback />}>
      <PricingPageClient />
    </Suspense>
  );
}
