import { redirect } from 'next/navigation';
import { getAllSkills, getSkillCategories, searchSkills } from "@/lib/db";
import { SkillsSearch } from "@/components/skills-search";
import Link from "next/link";
import { getCurrentUser } from '@/lib/auth';
import { PaywallOverlay } from '@/components/paywall';

export const dynamic = 'force-dynamic';

// Server action for search
async function searchSkillsAction(query: string) {
  "use server";
  return searchSkills(query);
}

export default async function SkillsPage() {
  // Check authentication and premium status
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirect=/skills');
  }

  if (!user.isPremium) {
    return <PaywallOverlay
      returnUrl="/skills"
      title="Skills Library"
      description="Subscribe to Premium to access the full trading skills library with code snippets."
    />;
  }

  const skills = getAllSkills();
  const categories = getSkillCategories();

  return (
    <div className="min-h-screen">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-amber-500/5" />
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
                  Skills Library
                </h1>
              </div>
              <p className="text-lg text-muted-foreground">
                {skills.length} trading patterns organized by category
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-sm font-medium text-emerald-500">Full-text search enabled</span>
            </div>
          </div>

          {/* Quick Tips */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Search Anything</h3>
                  <p className="text-sm text-muted-foreground">Type keywords, descriptions, or concepts to find skills instantly</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Browse by Category</h3>
                  <p className="text-sm text-muted-foreground">Skills are grouped by type for easy navigation</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium mb-1">View Code Snippets</h3>
                  <p className="text-sm text-muted-foreground">Click any skill to see implementation details</p>
                </div>
              </div>
            </div>
          </div>

          {/* Skills with Search */}
          <SkillsSearch
            initialSkills={skills}
            categories={categories}
            searchAction={searchSkillsAction}
          />
        </div>
      </div>
    </div>
  );
}
