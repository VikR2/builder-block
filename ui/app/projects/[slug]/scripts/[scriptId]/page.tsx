import { notFound } from "next/navigation";
import Link from "next/link";
import { readFileSync } from "fs";
import { getScriptById, getProjectBySlug, getSkillsByScript } from "@/lib/db";
import { codeToHtml } from "shiki";
import { CodeViewer } from "@/components/code-viewer";

export default async function ScriptDetailPage({
  params,
}: {
  params: Promise<{ slug: string; scriptId: string }>;
}) {
  const { slug, scriptId } = await params;
  const script = getScriptById(Number(scriptId));
  const project = getProjectBySlug(slug);

  if (!script || !project) {
    notFound();
  }

  const skills = getSkillsByScript(Number(scriptId));

  // Read the actual script file
  let scriptCode = "";
  let linesOfCode = 0;
  try {
    scriptCode = readFileSync(script.file_path, "utf-8");
    linesOfCode = scriptCode.split("\n").length;
  } catch (error) {
    scriptCode = "// Error: Could not read script file";
  }

  // Syntax highlight the code
  const highlightedCode = await codeToHtml(scriptCode, {
    lang: "csharp",
    theme: "github-dark",
  });

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8 items-center">
        <div className="w-full max-w-6xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link
              href="/projects"
              className="hover:text-foreground transition-colors"
            >
              Projects
            </Link>
            <span>/</span>
            <Link
              href={`/projects/${slug}`}
              className="hover:text-foreground transition-colors"
            >
              {project.name}
            </Link>
            <span>/</span>
            <span>Scripts</span>
            <span>/</span>
            <span className="text-foreground">{script.name}</span>
          </nav>

          {/* Script Header */}
          <div className="rounded-xl border border-border bg-card p-8 mb-8">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
                  <span className="text-2xl font-bold font-mono text-primary">
                    CS
                  </span>
                </div>
                <div>
                  <h1 className="text-4xl font-bold tracking-tight mb-2">
                    {script.name}
                  </h1>
                  <p className="text-lg text-muted-foreground">
                    Version {script.version}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {script.compilation_status && (
                  <span
                    className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                      script.compilation_status === "success"
                        ? "bg-primary/15 border border-primary/30 text-primary"
                        : script.compilation_status === "error"
                        ? "bg-destructive/15 border border-destructive/30 text-destructive"
                        : "bg-secondary/50 text-secondary-foreground"
                    }`}
                  >
                    {script.compilation_status}
                  </span>
                )}
                {script.deployment_status && (
                  <span className="px-4 py-2 rounded-lg bg-accent/15 border border-accent/30 text-accent text-sm font-semibold">
                    {script.deployment_status}
                  </span>
                )}
              </div>
            </div>

            {script.description && (
              <p className="text-base text-muted-foreground leading-relaxed mb-6">
                {script.description}
              </p>
            )}

            {/* Metadata Grid */}
            <div className="grid grid-cols-5 gap-6 pt-6 border-t border-border">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Lines of Code
                </span>
                <span className="text-xl font-bold font-mono text-primary">
                  {linesOfCode}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Skills Used
                </span>
                <span className="text-xl font-bold font-mono text-accent">
                  {skills.length}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  File
                </span>
                <span className="text-sm font-mono text-foreground truncate">
                  {script.file_path.split("/").pop()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Created
                </span>
                <span className="text-sm font-mono text-foreground">
                  {new Date(script.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Updated
                </span>
                <span className="text-sm font-mono text-foreground">
                  {new Date(script.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <a
                href={`/api/download-script?path=${encodeURIComponent(
                  script.file_path
                )}`}
                download
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
              >
                Download Script
              </a>
              <Link
                href={`/projects/${slug}`}
                className="px-6 py-3 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80 transition-colors"
              >
                Back to Project
              </Link>
            </div>
          </div>

          {/* Code Viewer */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Source Code</h2>
            <CodeViewer code={scriptCode} html={highlightedCode} />
          </div>

          {/* Skills Used */}
          {skills.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-4">Skills Used</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {skills.map((skill) => (
                  <Link
                    key={skill.id}
                    href={`/skills/${skill.slug}`}
                    className="skill-card rounded-xl border border-border bg-card p-6 hover:border-primary/40 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg text-foreground">
                            {skill.name}
                          </h3>
                        </div>
                        <span className="text-xs px-3 py-1 rounded-full font-mono category-badge border border-primary/20 text-primary">
                          {skill.category}
                        </span>
                      </div>
                      <div className="text-xs font-mono px-3 py-1.5 rounded-lg bg-secondary/50 text-secondary-foreground whitespace-nowrap">
                        {skill.complexity}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {skill.description}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
