"use client";

import { useState } from "react";
import Link from "next/link";
import type { Project, Script, JournalEntry, Skill } from "@/lib/db";
import ScriptUpload from "./script-upload";
import JournalForm from "./journal-form";

interface ProjectTabsProps {
  project: Project;
  scripts: Script[];
  journalEntries: JournalEntry[];
  skills: Skill[];
}

export default function ProjectTabs({
  project,
  scripts,
  journalEntries,
  skills,
}: ProjectTabsProps) {
  const [activeTab, setActiveTab] = useState<"scripts" | "journal" | "skills">(
    "scripts"
  );
  const [showScriptUpload, setShowScriptUpload] = useState(false);
  const [showJournalForm, setShowJournalForm] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Tab Navigation */}
      <div className="flex gap-6 border-b border-border pb-4">
        <button
          onClick={() => setActiveTab("scripts")}
          className={`text-base font-medium transition-colors relative pb-4 ${
            activeTab === "scripts"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Scripts ({scripts.length})
          {activeTab === "scripts" && (
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
          Journal ({journalEntries.length})
          {activeTab === "journal" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("skills")}
          className={`text-base font-medium transition-colors relative pb-4 ${
            activeTab === "skills"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Skills Used ({skills.length})
          {activeTab === "skills" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"></span>
          )}
        </button>
      </div>

      {/* Scripts Tab */}
      {activeTab === "scripts" && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Scripts</h2>
            <button
              onClick={() => setShowScriptUpload(true)}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Upload Script
            </button>
          </div>

          {scripts.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-border bg-card/50 p-12 text-center">
              <p className="text-lg text-muted-foreground mb-2">
                No scripts yet
              </p>
              <p className="text-sm text-muted-foreground">
                Upload your first C# script to get started
              </p>
            </div>
          ) : (
            <div className="grid gap-6">
              {scripts.map((script) => (
                <Link
                  key={script.id}
                  href={`/projects/${project.slug}/scripts/${script.id}`}
                  className="project-card"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
                        <span className="text-xl font-bold font-mono text-primary">
                          CS
                        </span>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold mb-1">
                          {script.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Version {script.version}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {script.compilation_status && (
                        <span
                          className={`px-3 py-1 rounded-lg text-xs font-semibold ${
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
                        <span className="px-3 py-1 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs font-semibold">
                          {script.deployment_status}
                        </span>
                      )}
                    </div>
                  </div>

                  {script.description && (
                    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                      {script.description}
                    </p>
                  )}

                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">
                        File
                      </span>
                      <span className="text-sm font-mono font-medium truncate">
                        {script.file_path.split("/").pop()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">
                        Created
                      </span>
                      <span className="text-sm font-mono font-medium">
                        {new Date(script.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">
                        Updated
                      </span>
                      <span className="text-sm font-mono font-medium">
                        {new Date(script.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Journal Tab */}
      {activeTab === "journal" && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Journal Entries</h2>
            <button
              onClick={() => setShowJournalForm(true)}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              New Entry
            </button>
          </div>

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
          {journalEntries.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-lg text-muted-foreground">
                No journal entries yet
              </p>
            </div>
          ) : (
            <div className="grid gap-6">
              {journalEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid md:grid-cols-[200px_1fr] gap-6 rounded-xl border border-border bg-card p-6 hover:border-accent/40 transition-all"
                >
                  <div className="w-full h-40 md:h-36 rounded-lg bg-secondary/50 border border-border flex items-center justify-center">
                    <span className="text-sm text-muted-foreground">
                      No preview
                    </span>
                  </div>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-semibold mb-1">
                          {entry.title}
                        </h3>
                        <span className="inline-block px-2 py-1 rounded bg-primary/10 text-primary text-xs font-mono">
                          {entry.entry_type}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
                      {entry.content.split("\n")[0]}
                    </p>
                    {entry.script_id && (
                      <Link
                        href={`/projects/${project.slug}/scripts/${entry.script_id}`}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-accent/15 border border-accent/30 rounded-lg text-accent text-sm font-medium hover:bg-accent/25 transition-colors w-fit"
                      >
                        <span>🔗</span>
                        <span>Linked to script</span>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Skills Used Tab */}
      {activeTab === "skills" && (
        <div className="flex flex-col gap-6">
          <h2 className="text-2xl font-bold">Skills Used</h2>

          {skills.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-lg text-muted-foreground">No skills used yet</p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
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
          )}
        </div>
      )}

      {/* Modals */}
      {showScriptUpload && (
        <ScriptUpload
          projectId={project.id}
          projectSlug={project.slug}
          onSuccess={() => setShowScriptUpload(false)}
          onClose={() => setShowScriptUpload(false)}
        />
      )}

      {showJournalForm && (
        <JournalForm
          projectId={project.id}
          onSuccess={() => setShowJournalForm(false)}
          onClose={() => setShowJournalForm(false)}
        />
      )}
    </div>
  );
}
