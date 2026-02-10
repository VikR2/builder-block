import { redirect } from 'next/navigation';
import Link from "next/link";
import { getAllStudyGuides } from "@/lib/tcm-db";
import { StudyGuideGenerator } from "@/components/tcm/study-guide-generator";
import { getCurrentUser } from '@/lib/auth';
import { PaywallOverlay } from '@/components/paywall';

export const dynamic = 'force-dynamic';

export default async function GuidesPage() {
  // Check authentication and premium status
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/tcm/guides');
  }

  if (!user.isPremium) {
    return <PaywallOverlay
      returnUrl="/tcm/guides"
      title="Study Guides"
      description="Subscribe to Premium to access AI-generated study guides for trading concepts."
    />;
  }

  const guides = getAllStudyGuides();

  return (
    <div className="min-h-screen">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 via-transparent to-amber-500/5" />
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
                  Study Guides
                </h1>
              </div>
              <p className="text-lg text-muted-foreground">
                {guides.length} generated guide{guides.length !== 1 ? 's' : ''} - Create new ones from any topic
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20">
              <svg className="w-5 h-5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="text-sm font-medium text-sky-500">AI-Generated Guides</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Study Guide Generator */}
            <div className="lg:col-span-1">
              <StudyGuideGenerator />
            </div>

            {/* Guides List */}
            <div className="lg:col-span-2">
              <div className="rounded-xl border bg-card">
                <div className="px-4 py-3 border-b flex items-center gap-2">
                  <svg className="w-4 h-4 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h2 className="font-semibold">Your Study Guides</h2>
                </div>

                {guides.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500/20 to-amber-500/20 mx-auto mb-4 flex items-center justify-center">
                      <svg className="w-8 h-8 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <h3 className="font-semibold text-lg mb-2">No Study Guides Yet</h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                      Generate your first study guide by entering a topic. Each guide compiles relevant TCM concepts with explanations and examples.
                    </p>
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium text-foreground mb-2">Suggested topics:</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {["Submission Range", "Book Building", "Order Matching", "Liquidity Sweeps"].map((topic) => (
                          <span key={topic} className="px-3 py-1.5 bg-muted rounded-lg text-xs">
                            {topic}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y">
                    {guides.map((guide) => (
                      <GuideCard key={guide.id} guide={guide} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuideCard({ guide }: { guide: ReturnType<typeof getAllStudyGuides>[0] }) {
  const skillCount = guide.skill_ids ? JSON.parse(guide.skill_ids).length : 0;
  const previewContent = guide.content.replace(/^#.*\n/gm, '').substring(0, 150);

  return (
    <Link
      href={`/tcm/guides/${guide.slug}`}
      className="group block p-4 hover:bg-sky-500/5 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold group-hover:text-sky-500 transition-colors truncate">{guide.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {previewContent}...
          </p>
          <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
            {skillCount > 0 && (
              <span className="flex items-center gap-1 text-amber-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                {skillCount} skills
              </span>
            )}
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {new Date(guide.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>
        <svg className="w-5 h-5 text-muted-foreground group-hover:text-sky-500 group-hover:translate-x-1 flex-shrink-0 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
