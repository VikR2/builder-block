import Link from "next/link";
import { getAllSkills, getSkillCategories } from "@/lib/db";
import { parseJSON } from "@/lib/utils";

export default function SkillsPage() {
  const skills = getAllSkills();
  const categories = getSkillCategories();

  // Group skills by category
  const skillsByCategory = skills.reduce((acc, skill) => {
    if (!acc[skill.category]) {
      acc[skill.category] = [];
    }
    acc[skill.category].push(skill);
    return acc;
  }, {} as Record<string, typeof skills>);

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            Skills Library
          </h1>
          <p className="text-lg text-muted-foreground">
            {skills.length} reusable NinjaTrader patterns organized by category
          </p>
        </div>

        {/* Category Summary */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {categories.map((cat) => (
            <div
              key={cat.category}
              className="rounded-md border bg-card p-4 text-center"
            >
              <div className="text-2xl font-bold">{cat.count}</div>
              <div className="text-sm text-muted-foreground">{cat.category}</div>
            </div>
          ))}
        </div>

        {/* Skills by Category */}
        {Object.entries(skillsByCategory).map(([category, categorySkills]) => (
          <div key={category} className="flex flex-col gap-4">
            <h2 className="text-2xl font-bold">{category}</h2>
            <div className="grid gap-4">
              {categorySkills.map((skill) => {
                const keywords = parseJSON<string[]>(skill.nlp_keywords) || [];
                const variables = parseJSON<string[]>(skill.variables_required) || [];

                return (
                  <Link
                    key={skill.id}
                    href={`/skills/${skill.slug}`}
                    className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-lg">{skill.name}</h3>
                            {skill.subcategory && (
                              <span className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground">
                                {skill.subcategory}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {skill.description}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">
                            {skill.complexity}
                          </span>
                          {skill.usage_count > 0 && (
                            <span className="text-xs text-muted-foreground">
                              Used in {skill.usage_count} script{skill.usage_count !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Keywords */}
                      {keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {keywords.slice(0, 6).map((keyword, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Variables */}
                      {variables.length > 0 && (
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium">Variables:</span> {variables.join(', ')}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
