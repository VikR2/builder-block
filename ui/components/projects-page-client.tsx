"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  ProjectWithDetails,
  JournalEntryWithProject,
} from "@/lib/db";

interface ProjectsPageClientProps {
  projects: ProjectWithDetails[];
  journalEntries: JournalEntryWithProject[];
}

export function ProjectsPageClient({
  projects,
  journalEntries,
}: ProjectsPageClientProps) {
  const [activeTab, setActiveTab] = useState<"all" | "journal">("all");

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8 items-center">
        <div className="flex flex-col gap-4 w-full max-w-6xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">
                Projects
              </h1>
              <p className="text-lg text-muted-foreground">
                Manage your NinjaTrader trading strategies
              </p>
            </div>
            <button className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors">
              Create Project
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-6 border-b border-border pb-4">
            <button
              onClick={() => setActiveTab("all")}
              className={`text-base font-medium transition-colors relative pb-4 ${
                activeTab === "all"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Projects
              {activeTab === "all" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("journal")}
              className={`text-base font-medium transition-colors relative pb-4 ${
                activeTab === "journal"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Journal Entries
              {activeTab === "journal" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></span>
              )}
            </button>
          </div>

          {/* All Projects View */}
          {activeTab === "all" && <ProjectsGrid projects={projects} />}

          {/* Journal Entries View */}
          {activeTab === "journal" && (
            <JournalGrid journalEntries={journalEntries} />
          )}
        </div>
      </div>
    </div>
  );
}

function ProjectsGrid({ projects }: { projects: ProjectWithDetails[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
      {projects.map((project) => (
        <Link
          key={project.id}
          href={`/projects/${project.slug}`}
          className="project-card"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
              <span className="text-xl font-bold font-mono text-primary">
                {project.name.substring(0, 2)}
              </span>
            </div>
            <span className="px-3 py-1 rounded-lg bg-primary/15 border border-primary/30 text-primary text-xs font-semibold">
              {project.status}
            </span>
          </div>
          <h3 className="text-xl font-semibold mb-2">{project.name}</h3>
          <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
            {project.description}
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Scripts
              </span>
              <span className="text-sm font-mono font-medium">
                {project.scriptCount}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Journal
              </span>
              <span className="text-sm font-mono font-medium">
                {project.journalCount} entries
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Skills
              </span>
              <span className="text-sm font-mono font-medium">
                {project.skillsUsedCount}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function JournalGrid({
  journalEntries,
}: {
  journalEntries: JournalEntryWithProject[];
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Upload Area */}
      <div className="rounded-xl border-2 border-dashed border-border bg-card/50 p-12 text-center hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer">
        <div className="flex flex-col items-center gap-4">
          <div className="text-6xl">📸</div>
          <div className="flex flex-col gap-2">
            <p className="text-xl font-medium">Upload Screenshot</p>
            <p className="text-sm text-muted-foreground">
              Click to select or drag and drop
            </p>
          </div>
        </div>
      </div>

      {/* Journal Entries */}
      <div className="grid gap-6">
        {journalEntries.map((entry) => (
          <div
            key={entry.id}
            className="grid md:grid-cols-[200px_1fr] gap-6 rounded-xl border border-border bg-card p-6 hover:border-accent/40 transition-all"
          >
            <div className="w-full h-40 md:h-36 rounded-lg bg-secondary/50 border border-border flex items-center justify-center">
              <span className="text-sm text-muted-foreground">No preview</span>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold mb-1">{entry.title}</h3>
                  <span className="inline-block px-2 py-1 rounded bg-primary/10 text-primary text-xs font-mono">
                    {entry.entry_type}
                  </span>
                </div>
                <span className="text-xs font-mono text-muted-foreground">
                  {entry.created_at
                    ? new Date(entry.created_at).toLocaleDateString()
                    : "N/A"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {entry.content.substring(0, 200)}
                {entry.content.length > 200 ? "..." : ""}
              </p>
              {entry.project_slug && (
                <Link
                  href={`/projects/${entry.project_slug}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent/15 border border-accent/30 rounded-lg text-accent text-sm font-medium hover:bg-accent/25 transition-colors w-fit"
                >
                  <span>🔗</span>
                  <span>{entry.project_name}</span>
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
