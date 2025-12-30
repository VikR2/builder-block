import { notFound } from "next/navigation";
import Link from "next/link";
import { getProjectWithDetails, getScriptsByProjectSlug, getJournalEntriesByProject, getSkillsByScript } from "@/lib/db";
import ProjectTabs from "@/components/project-tabs";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProjectWithDetails(slug);

  if (!project) {
    notFound();
  }

  const scripts = getScriptsByProjectSlug(slug);
  const journalEntries = getJournalEntriesByProject(project.id);

  // Get all unique skills used across all scripts
  const allSkills = scripts.flatMap((script) => getSkillsByScript(script.id));
  const uniqueSkills = Array.from(
    new Map(allSkills.map((skill) => [skill.id, skill])).values()
  );

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8 items-center">
        <div className="w-full max-w-6xl">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link href="/projects" className="hover:text-foreground transition-colors">
              Projects
            </Link>
            <span>/</span>
            <span className="text-foreground">{project.name}</span>
          </nav>

          {/* Project Header */}
          <div className="rounded-xl border border-border bg-card p-8 mb-8">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <h1 className="text-4xl font-bold tracking-tight">
                    {project.name}
                  </h1>
                  <span
                    className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                      project.status === "active"
                        ? "bg-primary/15 border border-primary/30 text-primary"
                        : project.status === "testing"
                        ? "bg-accent/15 border border-accent/30 text-accent"
                        : "bg-secondary/50 text-secondary-foreground"
                    }`}
                  >
                    {project.status}
                  </span>
                </div>
                {project.description && (
                  <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl">
                    {project.description}
                  </p>
                )}
              </div>
            </div>

            {/* Meta Info */}
            <div className="grid grid-cols-4 gap-6 pt-6 border-t border-border">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Scripts
                </span>
                <span className="text-2xl font-bold font-mono text-primary">
                  {project.scriptCount}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Journal Entries
                </span>
                <span className="text-2xl font-bold font-mono text-accent">
                  {project.journalCount}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Skills Used
                </span>
                <span className="text-2xl font-bold font-mono text-chart-3">
                  {project.skillsUsedCount}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  Last Worked
                </span>
                <span className="text-sm font-mono text-foreground">
                  {project.last_worked_on
                    ? new Date(project.last_worked_on).toLocaleDateString()
                    : "Never"}
                </span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <ProjectTabs
            project={project}
            scripts={scripts}
            journalEntries={journalEntries}
            skills={uniqueSkills}
          />
        </div>
      </div>
    </div>
  );
}
