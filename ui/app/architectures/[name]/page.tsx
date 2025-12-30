import Link from "next/link";
import { notFound } from "next/navigation";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { codeToHtml } from "shiki";

interface ArchitectureMetadata {
  name: string;
  source_url?: string;
  source_title?: string;
  type?: string;
  complexity?: string;
  generated?: string;
  confidence?: number;
}

// Parse YAML from ```yaml code block (not frontmatter)
function parseYamlBlock(content: string): ArchitectureMetadata {
  const metadata: ArchitectureMetadata & Record<string, unknown> = { name: "Unknown" };

  const yamlMatch = content.match(/```yaml\n([\s\S]*?)```/);
  if (yamlMatch) {
    const lines = yamlMatch[1].split("\n");
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*"?(.+?)"?\s*$/);
      if (match) {
        const [, key, value] = match;
        metadata[key] = value;
      }
    }
  }

  return metadata;
}

// Split markdown into sections for rendering
function parseMarkdownSections(content: string): {
  title: string;
  level: number;
  content: string;
  id: string;
}[] {
  const sections: { title: string; level: number; content: string; id: string }[] = [];
  const lines = content.split("\n");

  let currentSection: { title: string; level: number; lines: string[]; id: string } | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      if (currentSection) {
        sections.push({
          ...currentSection,
          content: currentSection.lines.join("\n").trim(),
        });
      }
      const title = headerMatch[2];
      currentSection = {
        title,
        level: headerMatch[1].length,
        lines: [],
        id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      };
    } else if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  if (currentSection) {
    sections.push({
      ...currentSection,
      content: currentSection.lines.join("\n").trim(),
    });
  }

  return sections;
}

// Extract and highlight code blocks
async function highlightCodeBlocks(
  content: string
): Promise<{ text: string; codeBlocks: Map<string, string> }> {
  const codeBlocks = new Map<string, string>();
  let blockIndex = 0;

  // Find all code blocks
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const lang = match[1] || "text";
    const code = match[2].trim();
    const placeholder = `__CODE_BLOCK_${blockIndex}__`;

    try {
      const html = await codeToHtml(code, {
        lang: lang === "yaml" ? "yaml" : lang === "csharp" ? "csharp" : "text",
        theme: "github-dark",
      });
      codeBlocks.set(placeholder, html);
    } catch {
      // Fallback for unknown languages
      codeBlocks.set(
        placeholder,
        `<pre class="shiki github-dark"><code>${code
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</code></pre>`
      );
    }

    blockIndex++;
  }

  // Replace code blocks with placeholders
  let text = content;
  blockIndex = 0;
  text = text.replace(codeBlockRegex, () => `__CODE_BLOCK_${blockIndex++}__`);

  return { text, codeBlocks };
}

// Render markdown content with highlighted code blocks
function renderContent(
  text: string,
  codeBlocks: Map<string, string>
): string {
  let html = text;

  // Replace placeholders with highlighted code
  codeBlocks.forEach((codeHtml, placeholder) => {
    html = html.replace(placeholder, codeHtml);
  });

  // Basic markdown rendering
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-secondary px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');
  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" class="text-primary hover:underline" target="_blank" rel="noopener">$1</a>'
  );
  // Lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>');
  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr class="border-border my-4" />');
  // Line breaks
  html = html.replace(/\n\n/g, "</p><p class='mb-4'>");
  html = `<p class='mb-4'>${html}</p>`;

  return html;
}

// Complexity badge styles
const complexityStyles: Record<string, { bg: string; text: string; border: string }> = {
  simple: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  complex: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/30" },
};

export default async function ArchitectureDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const archDir = join(process.cwd(), "..", "data", "architectures");
  const filePath = join(archDir, `${name}.md`);

  if (!existsSync(filePath)) {
    notFound();
  }

  const content = readFileSync(filePath, "utf-8");
  const metadata = parseYamlBlock(content);
  const sections = parseMarkdownSections(content);
  const { text: processedContent, codeBlocks } = await highlightCodeBlocks(content);

  const complexity = metadata.complexity || "medium";
  const style = complexityStyles[complexity] || complexityStyles.medium;
  const confidence = metadata.confidence ? Math.round(Number(metadata.confidence) * 100) : null;

  // Build table of contents from sections
  const toc = sections.filter((s) => s.level <= 2 && s.title !== "Metadata");

  return (
    <div className="min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-accent/3" />
        <div className="metrics-grid absolute inset-0 opacity-10" />
      </div>

      <div className="container py-10 relative z-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link href="/architectures" className="hover:text-primary transition-colors">
            Architectures
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground truncate">{metadata.name}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
          {/* Main Content */}
          <div className="min-w-0">
            {/* Header Card */}
            <div className="stat-card mb-8">
              <div className="flex flex-col gap-4">
                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  {metadata.type && (
                    <span className="px-2 py-1 rounded text-xs font-medium uppercase tracking-wider bg-secondary text-secondary-foreground">
                      {metadata.type}
                    </span>
                  )}
                  <span className={`px-2 py-1 rounded text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}>
                    {complexity}
                  </span>
                  {confidence !== null && (
                    <span className="px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
                      {confidence}% confidence
                    </span>
                  )}
                </div>

                {/* Title */}
                <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">
                  {metadata.name}
                </h1>

                {/* Source */}
                {metadata.source_url && (
                  <a
                    href={metadata.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                  >
                    <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                    <span className="group-hover:underline">
                      {metadata.source_title || "Watch Source Video"}
                    </span>
                    <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                )}

                {/* Generated date */}
                {metadata.generated && (
                  <div className="text-xs text-muted-foreground">
                    Generated: {metadata.generated}
                  </div>
                )}
              </div>
            </div>

            {/* Document Content */}
            <div className="rounded-xl border bg-card overflow-hidden">
              {sections.map((section, index) => {
                if (section.title === "Metadata") return null;

                const sectionContent = renderContent(
                  section.content,
                  codeBlocks
                );

                return (
                  <div
                    key={index}
                    id={section.id}
                    className="border-b border-border last:border-b-0"
                  >
                    {/* Section Header */}
                    <div className={`px-6 py-4 bg-secondary/30 ${section.level === 1 ? "border-l-4 border-primary" : ""}`}>
                      <h2 className={`font-semibold ${section.level === 1 ? "text-xl" : section.level === 2 ? "text-lg" : "text-base"}`}>
                        {section.title}
                      </h2>
                    </div>

                    {/* Section Content */}
                    {section.content && (
                      <div className="px-6 py-4">
                        <div
                          className="prose prose-invert prose-sm max-w-none [&_pre]:rounded-lg [&_pre]:border [&_pre]:my-4 [&_pre]:overflow-x-auto [&_code]:text-sm [&_li]:text-muted-foreground [&_strong]:text-foreground"
                          dangerouslySetInnerHTML={{ __html: sectionContent }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block">
            <div className="sticky top-8 space-y-6">
              {/* Quick Stats */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Document Info
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sections</span>
                    <span className="font-mono">{sections.length - 1}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Characters</span>
                    <span className="font-mono">{content.length.toLocaleString()}</span>
                  </div>
                  {confidence !== null && (
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Confidence</span>
                        <span className="font-mono">{confidence}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${confidence}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Table of Contents */}
              {toc.length > 0 && (
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                    Contents
                  </h3>
                  <nav className="space-y-1">
                    {toc.map((item, i) => (
                      <a
                        key={i}
                        href={`#${item.id}`}
                        className={`block text-sm hover:text-primary transition-colors ${
                          item.level === 1
                            ? "text-foreground font-medium"
                            : "text-muted-foreground pl-3 border-l border-border"
                        }`}
                      >
                        {item.title.replace(/^\d+\.\s*/, "")}
                      </a>
                    ))}
                  </nav>
                </div>
              )}

              {/* Actions */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Actions
                </h3>
                <div className="space-y-2">
                  <Link
                    href="/architectures"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to List
                  </Link>
                  {metadata.source_url && (
                    <a
                      href={metadata.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open Source
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
