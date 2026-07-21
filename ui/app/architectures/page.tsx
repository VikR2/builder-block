import Link from "next/link";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, basename } from "path";
import matter from "gray-matter";

export const dynamic = 'force-dynamic';

interface ArchitectureMetadata {
  name: string;
  source_url?: string;
  source_title?: string;
  type?: string;
  complexity?: string;
  generated?: string;
  confidence?: number;
}

interface ArchitectureFile {
  slug: string;
  filename: string;
  metadata: ArchitectureMetadata;
  modified: Date;
}

function getArchitectures(): ArchitectureFile[] {
  const archDir = join(process.cwd(), "..", "data", "architectures");

  try {
    const files = readdirSync(archDir).filter((f) => f.endsWith(".md"));

    return files.map((filename) => {
      const filePath = join(archDir, filename);
      const content = readFileSync(filePath, "utf-8");
      const stat = statSync(filePath);

      // Parse YAML frontmatter from markdown
      // The SAD format has metadata in a ```yaml code block, not frontmatter
      let metadata: ArchitectureMetadata = { name: basename(filename, ".md") };

      // Try to extract YAML from code block
      const yamlMatch = content.match(/```yaml\n([\s\S]*?)```/);
      if (yamlMatch) {
        try {
          // Parse the YAML content
          const yamlContent = yamlMatch[1];
          const lines = yamlContent.split("\n");
          for (const line of lines) {
            const match = line.match(/^(\w+):\s*"?(.+?)"?\s*$/);
            if (match) {
              const [, key, value] = match;
              (metadata as ArchitectureMetadata & Record<string, unknown>)[key] = value;
            }
          }
        } catch {
          // Fallback to filename
        }
      }

      // Also try standard frontmatter
      const { data } = matter(content);
      if (data && Object.keys(data).length > 0) {
        metadata = { ...metadata, ...data };
      }

      return {
        slug: basename(filename, ".md"),
        filename,
        metadata,
        modified: stat.mtime,
      };
    }).sort((a, b) => b.modified.getTime() - a.modified.getTime());
  } catch {
    return [];
  }
}

// Complexity badge colors
const complexityStyles: Record<string, { bg: string; text: string }> = {
  simple: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-400" },
  complex: { bg: "bg-rose-500/10", text: "text-rose-400" },
};

export default function ArchitecturesPage() {
  const architectures = getArchitectures();

  return (
    <div className="container py-10">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="metrics-grid absolute inset-0 opacity-20" />
      </div>

      <div className="relative z-10">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-4xl font-bold tracking-tight">
                Strategy Architectures
              </h1>
              <p className="text-lg text-muted-foreground mt-1">
                {architectures.length} Strategy Architecture Document{architectures.length !== 1 ? "s" : ""} (SAD)
              </p>
            </div>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Strategy Architecture Documents define the blueprint for NinjaTrader strategies.
            Each document captures trading concepts, skill compositions, and implementation plans
            extracted from video tutorials.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="stat-card">
            <div className="text-3xl font-bold text-primary">{architectures.length}</div>
            <div className="text-sm text-muted-foreground">Total SADs</div>
          </div>
          <div className="stat-card">
            <div className="text-3xl font-bold text-emerald-400">
              {architectures.filter(a => a.metadata.complexity === 'simple').length}
            </div>
            <div className="text-sm text-muted-foreground">Simple</div>
          </div>
          <div className="stat-card">
            <div className="text-3xl font-bold text-amber-400">
              {architectures.filter(a => a.metadata.complexity === 'medium').length}
            </div>
            <div className="text-sm text-muted-foreground">Medium</div>
          </div>
          <div className="stat-card">
            <div className="text-3xl font-bold text-rose-400">
              {architectures.filter(a => a.metadata.complexity === 'complex').length}
            </div>
            <div className="text-sm text-muted-foreground">Complex</div>
          </div>
        </div>

        {/* Architecture Cards */}
        {architectures.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">No Architectures Yet</h3>
            <p className="text-muted-foreground mb-4 max-w-md mx-auto">
              Strategy Architecture Documents are generated from YouTube trading videos
              using the pipeline.
            </p>
            <code className="text-xs bg-secondary px-3 py-2 rounded-md text-muted-foreground font-mono">
              uv run python -m runtime.harness scripts/generate_from_youtube.py --url &quot;...&quot;
            </code>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {architectures.map((arch) => {
              const complexity = arch.metadata.complexity || "medium";
              const style = complexityStyles[complexity] || complexityStyles.medium;
              const confidence = arch.metadata.confidence
                ? Math.round(Number(arch.metadata.confidence) * 100)
                : null;

              return (
                <Link
                  key={arch.slug}
                  href={`/architectures/${arch.slug}`}
                  className="group"
                >
                  <div className="project-card h-full">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg group-hover:text-primary transition-colors truncate">
                          {arch.metadata.name || arch.slug}
                        </h3>
                        {arch.metadata.type && (
                          <span className="text-xs text-muted-foreground uppercase tracking-wider">
                            {arch.metadata.type}
                          </span>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${style.bg} ${style.text}`}>
                        {complexity}
                      </span>
                    </div>

                    {/* Source */}
                    {arch.metadata.source_url && (
                      <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                        <svg className="w-4 h-4 flex-shrink-0 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                        </svg>
                        <span className="truncate">
                          {arch.metadata.source_title || "YouTube Source"}
                        </span>
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-4 border-t border-border mt-auto">
                      <div className="text-xs text-muted-foreground">
                        {arch.metadata.generated || arch.modified.toLocaleDateString()}
                      </div>
                      {confidence !== null && (
                        <div className="flex items-center gap-1">
                          <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${confidence}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground font-mono">
                            {confidence}%
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Hover indicator */}
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-accent scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
