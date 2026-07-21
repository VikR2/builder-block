import { redirect } from 'next/navigation';
import { getLibraryVideos } from '@/lib/tcm-library';
import { getCurrentUser } from '@/lib/auth';
import { PaywallOverlay } from '@/components/paywall';
import { LibraryContent } from '@/components/tcm/library-content';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Play, Search } from 'lucide-react';

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
    <div className="min-h-screen overflow-hidden bg-[#0b0d10]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 opacity-40 [background-image:radial-gradient(circle_at_70%_0%,rgba(201,151,79,.11),transparent_34%)]"
      />

      <div className="site-container relative py-8 sm:py-12">
        <div className="flex flex-col gap-8">
          <section className="member-panel relative overflow-hidden p-6 sm:p-9">
            <div
              aria-hidden="true"
              className="absolute -right-20 -top-24 h-72 w-72 rounded-full border border-[#c9974f]/15"
            />
            <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
              <div>
                <Link
                  href="/home"
                  className="inline-flex min-h-11 items-center gap-2 text-sm text-[#92959c] transition-colors hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Member home
                </Link>
                <p className="eyebrow mt-8 text-[#c9974f]">TCM learning library</p>
                <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">
                  Study the model through the chart.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-[#92959c]">
                  Curated lessons, timestamped chapters, and synchronized
                  transcripts organized around the TCM trading process.
                </p>
              </div>
              <div className="grid min-w-[270px] grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <Play className="h-4 w-4 text-[#c9974f]" />
                  <p className="mt-6 font-mono text-2xl font-semibold">
                    {videos.length}
                  </p>
                  <p className="mt-1 text-xs text-[#7f838b]">Published lessons</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <BookOpen className="h-4 w-4 text-[#c9974f]" />
                  <p className="mt-6 font-mono text-2xl font-semibold">TCM</p>
                  <p className="mt-1 text-xs text-[#7f838b]">Original education</p>
                </div>
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-2 text-sm text-[#92959c]">
              <Search className="h-4 w-4 text-[#c9974f]" />
              Use course, category, and tag filters to narrow the library.
            </div>
            <Link
              href="/tcm"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-4 text-sm font-semibold text-[#e0b56d]"
            >
              Ask about a lesson
            </Link>
          </div>

          <LibraryContent initialVideos={videos} />
        </div>
      </div>
    </div>
  );
}
