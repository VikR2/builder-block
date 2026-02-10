import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getStudyGuideBySlug, getTCMSkills } from "@/lib/tcm-db";
import { GuideContent, ExportButton } from "@/components/tcm/guide-content";
import { getCurrentUser } from '@/lib/auth';
import { PaywallOverlay } from '@/components/paywall';

export const dynamic = 'force-dynamic';

interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;

  // Check authentication and premium status
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirect=/tcm/guides/${slug}`);
  }

  if (!user.isPremium) {
    return <PaywallOverlay
      returnUrl={`/tcm/guides/${slug}`}
      title="Study Guide"
      description="Subscribe to Premium to access this study guide."
    />;
  }

  const guide = getStudyGuideBySlug(slug);

  if (!guide) {
    notFound();
  }

  // Get related skills
  const skillIds = guide.skill_ids ? JSON.parse(guide.skill_ids) as number[] : [];
  const allSkills = getTCMSkills();
  const relatedSkills = allSkills.filter(s => skillIds.includes(s.id));

  return (
    <div className="container py-6">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/3 via-transparent to-primary/3" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Back Link */}
        <Link href="/tcm/guides" className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 mb-4">
          <span>←</span> Back to Study Guides
        </Link>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6 text-sm">
          <Link href="/tcm" className="text-muted-foreground hover:text-foreground transition-colors">
            TCM Bot
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link href="/tcm/guides" className="text-muted-foreground hover:text-foreground transition-colors">
            Study Guides
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground truncate max-w-[200px]">{guide.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border bg-card overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b bg-secondary/50">
                <h1 className="text-2xl font-bold">{guide.title}</h1>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span>
                    Created {new Date(guide.created_at).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  {guide.source_topic && (
                    <span>
                      Topic: &quot;{guide.source_topic}&quot;
                    </span>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                <GuideContent content={guide.content} />
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Actions */}
            <div className="rounded-xl border bg-card p-4">
              <h3 className="font-semibold mb-3">Actions</h3>
              <div className="space-y-2">
                <ExportButton content={guide.content} title={guide.title} />
                <Link
                  href="/tcm"
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Ask Follow-up Questions
                </Link>
              </div>
            </div>

            {/* Related Skills */}
            {relatedSkills.length > 0 && (
              <div className="rounded-xl border bg-card p-4">
                <h3 className="font-semibold mb-3">Related Skills</h3>
                <div className="space-y-2">
                  {relatedSkills.map((skill) => (
                    <div
                      key={skill.id}
                      className="p-2 rounded bg-secondary/50 text-sm"
                    >
                      <div className="font-medium">{skill.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {skill.category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Back Link */}
            <Link
              href="/tcm/guides"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-card hover:bg-accent/50 text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to All Guides
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

