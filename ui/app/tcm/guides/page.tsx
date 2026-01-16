import Link from "next/link";
import { getAllStudyGuides } from "@/lib/tcm-db";
import { StudyGuideGenerator } from "@/components/tcm/study-guide-generator";

export default function GuidesPage() {
  const guides = getAllStudyGuides();

  return (
    <div className="container py-6">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/3 via-transparent to-primary/3" />
      </div>

      <div className="relative z-10 flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link href="/tcm" className="text-muted-foreground hover:text-foreground transition-colors">
                TCM Bot
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="text-foreground">Study Guides</span>
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              TCM Study Guides
            </h1>
            <p className="text-lg text-muted-foreground">
              {guides.length} generated guide{guides.length !== 1 ? 's' : ''} - Create new ones from topics
            </p>
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
              <div className="px-4 py-3 border-b">
                <h2 className="font-semibold">Your Study Guides</h2>
              </div>

              {guides.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                    <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <h3 className="font-medium mb-2">No Study Guides Yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Generate your first study guide by entering a topic on the left.
                  </p>
                  <div className="text-sm text-muted-foreground">
                    <p>Try topics like:</p>
                    <ul className="mt-2 space-y-1">
                      <li>• Submission Range</li>
                      <li>• Book Building</li>
                      <li>• Order Matching</li>
                    </ul>
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
  );
}

function GuideCard({ guide }: { guide: ReturnType<typeof getAllStudyGuides>[0] }) {
  const skillCount = guide.skill_ids ? JSON.parse(guide.skill_ids).length : 0;
  const previewContent = guide.content.replace(/^#.*\n/gm, '').substring(0, 150);

  return (
    <Link
      href={`/tcm/guides/${guide.slug}`}
      className="block p-4 hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{guide.title}</h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {previewContent}...
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
            {skillCount > 0 && (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                {skillCount} skills
              </span>
            )}
            <span>
              {new Date(guide.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>
        <svg className="w-5 h-5 text-muted-foreground flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
