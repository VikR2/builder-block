import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getJournalEntryById, getAttachmentsByEntry, getProjectBySlug, getScriptById } from "@/lib/db";
import { formatDateTime, formatDate } from "@/lib/utils";

// Entry type color mapping
const entryTypeStyles: Record<string, { bg: string; text: string; border: string }> = {
  trade_idea: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/30" },
  analysis: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
  lesson: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/30" },
  review: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/30" },
  note: { bg: "bg-slate-500/10", text: "text-slate-400", border: "border-slate-500/30" },
};

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = getJournalEntryById(Number(id));

  if (!entry) {
    notFound();
  }

  const attachments = getAttachmentsByEntry(Number(id));

  // Get related project/script info if available
  let project = null;
  let script = null;

  if (entry.project_id) {
    // Need to get project by ID - let's query it
    const db = await import("@/lib/db").then(m => m.getDb());
    project = db.prepare('SELECT * FROM projects WHERE id = ?').get(entry.project_id) as { id: number; name: string; slug: string } | undefined;
    db.close();
  }

  if (entry.script_id) {
    script = getScriptById(entry.script_id);
  }

  const typeStyle = entryTypeStyles[entry.entry_type] || entryTypeStyles.note;
  const symbols = entry.symbols ? entry.symbols.split(',').map(s => s.trim()) : [];

  return (
    <div className="container py-10">
      {/* Decorative grid background */}
      <div className="fixed inset-0 pointer-events-none opacity-30">
        <div className="metrics-grid absolute inset-0" />
      </div>

      <div className="relative z-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-8">
          <Link
            href="/journal"
            className="hover:text-primary transition-colors"
          >
            Journal
          </Link>
          <span className="text-muted-foreground/50">/</span>
          <span className="text-foreground truncate max-w-[300px]">{entry.title}</span>
        </nav>

        {/* Header Card */}
        <div className="stat-card mb-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            {/* Title & Meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-3 py-1.5 rounded-md text-xs font-medium uppercase tracking-wider border ${typeStyle.bg} ${typeStyle.text} ${typeStyle.border}`}>
                  {entry.entry_type.replace('_', ' ')}
                </span>
                {attachments.length > 0 && (
                  <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-medium">
                    {attachments.length} attachment{attachments.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <h1 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4 leading-tight">
                {entry.title}
              </h1>

              {/* Symbols */}
              {symbols.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {symbols.map((symbol, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 rounded bg-accent/10 text-accent text-sm font-mono"
                    >
                      {symbol}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Metadata Sidebar */}
            <div className="lg:w-64 flex-shrink-0">
              <div className="rounded-lg border bg-secondary/30 p-4 space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Created</div>
                  <div className="text-sm font-medium">{formatDateTime(entry.created_at)}</div>
                </div>

                {entry.trade_date && (
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Trade Date</div>
                    <div className="text-sm font-medium">{formatDate(entry.trade_date)}</div>
                  </div>
                )}

                {entry.updated_at !== entry.created_at && (
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Updated</div>
                    <div className="text-sm font-medium">{formatDateTime(entry.updated_at)}</div>
                  </div>
                )}

                {/* Related Links */}
                {(project || script) && (
                  <div className="pt-4 border-t border-border">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Related</div>
                    <div className="space-y-2">
                      {project && (
                        <Link
                          href={`/projects/${project.slug}`}
                          className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          {project.name}
                        </Link>
                      )}
                      {script && project && (
                        <Link
                          href={`/projects/${project.slug}/scripts/${script.id}`}
                          className="flex items-center gap-2 text-sm text-accent hover:text-accent/80 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                          </svg>
                          {script.name}
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            {/* Main Content */}
            <div className="rounded-xl border bg-card p-8">
              <div className="prose prose-invert prose-lg max-w-none">
                <div className="whitespace-pre-wrap text-foreground/90 leading-relaxed">
                  {entry.content}
                </div>
              </div>
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="mt-8">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  Attachments
                </h2>
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                  {attachments.map((attachment) => {
                    const isImage = attachment.file_type.startsWith('image/');

                    return (
                      <div
                        key={attachment.id}
                        className="rounded-lg border bg-card overflow-hidden group hover:border-primary/50 transition-colors"
                      >
                        {isImage ? (
                          <div className="relative aspect-video bg-secondary/50">
                            <Image
                              src={`/attachments/${attachment.file_name}`}
                              alt={attachment.caption || attachment.file_name}
                              fill
                              className="object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        ) : (
                          <div className="aspect-video bg-secondary/50 flex items-center justify-center">
                            <svg className="w-16 h-16 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                        )}
                        <div className="p-3">
                          <div className="text-sm font-medium truncate">{attachment.file_name}</div>
                          {attachment.caption && (
                            <div className="text-xs text-muted-foreground mt-1">{attachment.caption}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Side Panel - Empty state or future content */}
          <div className="hidden lg:block">
            <div className="sticky top-8 space-y-4">
              {/* Quick Actions */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Actions</h3>
                <div className="space-y-2">
                  <Link
                    href="/journal"
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Journal
                  </Link>
                </div>
              </div>

              {/* Entry Stats */}
              <div className="rounded-lg border bg-card p-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Words</span>
                    <span className="font-mono">{entry.content.split(/\s+/).length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Characters</span>
                    <span className="font-mono">{entry.content.length}</span>
                  </div>
                  {attachments.length > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Attachments</span>
                      <span className="font-mono">{attachments.length}</span>
                    </div>
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
