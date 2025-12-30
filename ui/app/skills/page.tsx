import { getAllSkills, getSkillCategories, searchSkills } from "@/lib/db";
import { SkillsSearch } from "@/components/skills-search";

// Server action for search
async function searchSkillsAction(query: string) {
  "use server";
  return searchSkills(query);
}

export default function SkillsPage() {
  const skills = getAllSkills();
  const categories = getSkillCategories();

  return (
    <div className="container py-10">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-accent/3" />
      </div>

      <div className="relative z-10 flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              Skills Library
            </h1>
            <p className="text-lg text-muted-foreground">
              {skills.length} reusable NinjaTrader patterns organized by category
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50 border">
            <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-sm text-muted-foreground">Full-text search enabled</span>
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
  );
}
