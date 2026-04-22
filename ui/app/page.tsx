import Link from "next/link";
import { redirect } from "next/navigation";
import { getStats, getAllSkills } from "@/lib/db";
import { getTCMSkills, getArchitectureDocuments, getLocalVideos } from "@/lib/tcm-db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Redirect authenticated users to /home
  const user = await getCurrentUser();
  if (user) {
    redirect('/home');
  }

  const stats = getStats();
  const recentSkills = getAllSkills().slice(0, 4);
  const tcmSkills = getTCMSkills();
  const studyGuides = getArchitectureDocuments();
  const videos = getLocalVideos();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-rose-500/5"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent"></div>

        <div className="container relative py-20 md:py-28">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full mb-8">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-sm font-medium text-amber-500">Trading Education Platform</span>
            </div>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight mb-6">
              <span className="text-amber-500">The Currency Merchant</span>
            </h1>

            <p className="text-xl text-muted-foreground max-w-2xl leading-relaxed mb-10">
              Master trading concepts through curated video courses, interactive Q&A,
              and a comprehensive skills library. Your complete TCM learning companion.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/tcm"
                className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500 text-background font-semibold rounded-xl hover:bg-amber-400 transition-all shadow-lg shadow-amber-500/25"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Start Learning
              </Link>
              <Link
                href="/tcm/library"
                className="inline-flex items-center gap-2 px-6 py-3 bg-card border border-border hover:border-amber-500/50 font-semibold rounded-xl transition-all"
              >
                <svg className="w-5 h-5 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Watch Courses
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="container py-16">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Link href="/tcm" className="group p-6 rounded-2xl bg-card border border-border hover:border-amber-500/50 transition-all">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
              <svg className="w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="font-semibold text-lg mb-2">Knowledge Bot</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ask questions about TCM concepts and get answers with video clips and sources.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-amber-500 font-medium">
              <span>{tcmSkills.length + studyGuides.length} sources</span>
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          <Link href="/tcm/library" className="group p-6 rounded-2xl bg-card border border-border hover:border-rose-500/50 transition-all">
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center mb-4 group-hover:bg-rose-500/20 transition-colors">
              <svg className="w-6 h-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-lg mb-2">Video Courses</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Watch trading lessons with synchronized transcripts and chapter navigation.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-rose-500 font-medium">
              <span>{videos.length} videos</span>
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

          <Link href="/skills" className="group p-6 rounded-2xl bg-card border border-border hover:border-emerald-500/50 transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
              <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <h3 className="font-semibold text-lg mb-2">Skills Library</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Browse and search reusable trading patterns with full-text search.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-emerald-500 font-medium">
              <span>{stats.skills} skills</span>
              <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>

        </div>
      </div>

      {/* Recent Skills Section */}
      {recentSkills.length > 0 && (
        <div className="container py-16 border-t border-border/50">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold mb-2">Recent Skills</h2>
              <p className="text-muted-foreground">Latest trading patterns added to the library</p>
            </div>
            <Link
              href="/skills"
              className="text-sm font-medium text-amber-500 hover:text-amber-400 transition-colors flex items-center gap-1"
            >
              View all
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {recentSkills.map((skill) => (
              <Link
                key={skill.id}
                href={`/skills/${skill.slug}`}
                className="group p-5 rounded-xl border border-border bg-card hover:border-amber-500/30 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-foreground group-hover:text-amber-500 transition-colors truncate">
                        {skill.name}
                      </h3>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 font-medium shrink-0">
                        {skill.category}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {skill.description}
                    </p>
                  </div>
                  <div className="text-xs px-2.5 py-1 rounded-lg bg-muted text-muted-foreground font-medium shrink-0">
                    {skill.complexity}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* How It Works */}
      <div className="container py-16 border-t border-border/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold mb-2">How It Works</h2>
            <p className="text-muted-foreground">Your journey to mastering TCM trading concepts</p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/25">
                <span className="text-2xl font-bold text-background">1</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Ask Questions</h3>
              <p className="text-sm text-muted-foreground">
                Use the Knowledge Bot to ask about any trading concept. Get answers with relevant video clips.
              </p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-rose-500/25">
                <span className="text-2xl font-bold text-background">2</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Watch & Learn</h3>
              <p className="text-sm text-muted-foreground">
                Dive deep with video courses featuring synchronized transcripts and chapter navigation.
              </p>
            </div>

            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25">
                <span className="text-2xl font-bold text-background">3</span>
              </div>
              <h3 className="font-semibold text-lg mb-2">Master Skills</h3>
              <p className="text-sm text-muted-foreground">
                Reference the skills library to reinforce concepts and build trading expertise.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
