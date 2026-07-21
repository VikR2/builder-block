import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { codeToHtml } from 'shiki';
import { getSkillBySlug } from "@/lib/db";
import { CodeViewer } from "@/components/code-viewer";
import { parseJSON, formatDate } from "@/lib/utils";
import { getCurrentUser } from '@/lib/auth';
import { PaywallOverlay } from '@/components/paywall';
import { normalizeSkillRecord } from '@/lib/skills-display';

export const dynamic = 'force-dynamic';

export default async function SkillPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Check authentication and premium status
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirect=/skills/${slug}`);
  }

  if (!user.isPremium) {
    return <PaywallOverlay
      returnUrl={`/skills/${slug}`}
      title="Skill Details"
      description="Subscribe to Premium to view skill details and code snippets."
    />;
  }

  const skill = getSkillBySlug(slug);

  if (!skill) {
    notFound();
  }

  const displaySkill = normalizeSkillRecord(skill);

  const keywords = parseJSON<string[]>(displaySkill.nlp_keywords) || [];
  const variables = parseJSON<string[]>(displaySkill.variables_required) || [];
  const dependencies = parseJSON<string[]>(displaySkill.dependencies) || [];
  const usageExamples = parseJSON<string[]>(displaySkill.usage_examples) || [];

  // Generate syntax highlighted HTML on server
  let codeHtml = '';
  if (displaySkill.code_snippet) {
    codeHtml = await codeToHtml(displaySkill.code_snippet, {
      lang: 'csharp',
      theme: 'github-dark',
    });
  }

  return (
    <div className="container py-10 max-w-5xl">
      <div className="flex flex-col gap-8">
        {/* Back Link */}
        <Link href="/skills" className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1 -mb-4">
          <span>←</span> Back to Skills Library
        </Link>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/skills" className="hover:text-foreground">
            Skills
          </Link>
          <span>/</span>
          <span>{displaySkill.category}</span>
          {displaySkill.subcategory && (
            <>
              <span>/</span>
              <span>{displaySkill.subcategory}</span>
            </>
          )}
        </div>

        {/* Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-2">
                {displaySkill.name}
              </h1>
              <p className="text-lg text-muted-foreground">
                {displaySkill.description}
              </p>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                {displaySkill.complexity}
              </span>
              {displaySkill.usage_count > 0 && (
                <span className="text-sm text-muted-foreground">
                  Used in {displaySkill.usage_count} script{displaySkill.usage_count !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Meta Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-lg border bg-muted/50">
            <div>
              <div className="text-sm font-medium mb-1">Category</div>
              <div className="text-sm text-muted-foreground">{displaySkill.category}</div>
            </div>
            {displaySkill.subcategory && (
              <div>
                <div className="text-sm font-medium mb-1">Subcategory</div>
                <div className="text-sm text-muted-foreground">{displaySkill.subcategory}</div>
              </div>
            )}
            {displaySkill.trading_style && (
              <div>
                <div className="text-sm font-medium mb-1">Trading Style</div>
                <div className="text-sm text-muted-foreground">{displaySkill.trading_style}</div>
              </div>
            )}
            {displaySkill.timeframe && (
              <div>
                <div className="text-sm font-medium mb-1">Timeframe</div>
                <div className="text-sm text-muted-foreground">{displaySkill.timeframe}</div>
              </div>
            )}
          </div>
        </div>

        {/* Keywords */}
        {keywords.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-3">Search Keywords</h2>
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Variables */}
        {variables.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-3">Required Variables</h2>
            <div className="rounded-lg border bg-card p-4">
              <code className="text-sm">
                {variables.map((v, i) => (
                  <div key={i} className="font-mono">
                    {v}
                  </div>
                ))}
              </code>
            </div>
          </div>
        )}

        {/* Dependencies */}
        {dependencies.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-3">Dependencies</h2>
            <div className="flex flex-col gap-2">
              {dependencies.map((dep, i) => (
                <Link
                  key={i}
                  href={`/skills/${dep}`}
                  className="text-primary hover:underline text-sm"
                >
                  {dep} →
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Usage Examples */}
        {usageExamples.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-3">Usage Examples</h2>
            <ul className="list-disc list-inside space-y-1">
              {usageExamples.map((example, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  {example}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Code */}
        {displaySkill.code_snippet && codeHtml && (
          <div>
            <h2 className="text-xl font-bold mb-3">Code Implementation</h2>
            <CodeViewer code={displaySkill.code_snippet} html={codeHtml} />
          </div>
        )}

        {/* Footer */}
        <div className="text-sm text-muted-foreground border-t pt-4">
          Added {formatDate(displaySkill.created_at)}
          {displaySkill.updated_at !== displaySkill.created_at && ` • Updated ${formatDate(displaySkill.updated_at)}`}
        </div>
      </div>
    </div>
  );
}
