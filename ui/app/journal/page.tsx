import Link from "next/link";
import { getAllJournalEntries } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";

export default function JournalPage() {
  const entries = getAllJournalEntries();

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              Trading Journal
            </h1>
            <p className="text-lg text-muted-foreground">
              {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
            </p>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-lg border bg-muted/50 p-12 text-center">
            <h3 className="text-xl font-semibold mb-2">No journal entries yet</h3>
            <p className="text-muted-foreground mb-4">
              Start documenting your trading ideas, strategy analysis, and lessons learned.
            </p>
            <p className="text-sm text-muted-foreground">
              Journal entries can include charts, screenshots, and links to specific scripts.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {entries.map((entry) => (
              <Link
                key={entry.id}
                href={`/journal/${entry.id}`}
                className="rounded-lg border bg-card p-6 hover:bg-accent transition-colors"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{entry.title}</h3>
                    <span className="text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground">
                      {entry.entry_type}
                    </span>
                    {entry.has_attachments > 0 && (
                      <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">
                        {entry.attachment_count} attachment{entry.attachment_count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {entry.content}
                  </p>
                  <div className="text-sm text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
