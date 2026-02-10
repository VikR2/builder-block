import { redirect } from 'next/navigation';
import { getLibraryVideos } from '@/lib/tcm-library';
import { getCurrentUser } from '@/lib/auth';
import { PaywallOverlay } from '@/components/paywall';
import { LibraryContent } from '@/components/tcm/library-content';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  // Check authentication and premium status
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/tcm/library');
  }

  if (!user.isPremium) {
    return <PaywallOverlay
      returnUrl="/tcm/library"
      title="Video Courses"
      description="Subscribe to Premium to access all video courses with synchronized transcripts."
    />;
  }

  const videos = await getLibraryVideos();

  return (
    <div className="min-h-screen">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 via-transparent to-amber-500/5" />
      </div>

      <div className="container py-10 relative z-10">
        <div className="flex flex-col gap-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Link
                  href="/"
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title="Back to Home"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </Link>
                <h1 className="text-4xl font-bold tracking-tight">
                  Video Courses
                </h1>
              </div>
              <p className="text-lg text-muted-foreground">
                Master trading concepts with curated video lessons
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <svg className="w-5 h-5 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span className="text-sm font-medium text-rose-500">TCM Original Content</span>
            </div>
          </div>

          {/* Client-side content with filtering */}
          <LibraryContent initialVideos={videos} />
        </div>
      </div>
    </div>
  );
}
