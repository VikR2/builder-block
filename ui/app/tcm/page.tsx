import { ChatInterface } from "@/components/tcm/chat-interface";
import { getTCMSkills, getArchitectureDocuments, getLocalVideos } from "@/lib/tcm-db";

export default function TCMPage() {
  // Get stats for the sidebar
  const skills = getTCMSkills();
  const docs = getArchitectureDocuments();
  const videos = getLocalVideos();

  return (
    <div className="container py-6">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-rose-500/5" />
      </div>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-10rem)]">
        {/* Main Chat Area */}
        <div className="lg:col-span-3 rounded-xl border bg-card overflow-hidden flex flex-col">
          <ChatInterface />
        </div>

        {/* Sidebar */}
        <div className="hidden lg:flex flex-col gap-4">
          {/* Knowledge Stats */}
          <div className="rounded-xl border bg-card p-4">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Knowledge Base
            </h3>
            <div className="space-y-3">
              <StatItem
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                }
                label="TCM Skills"
                value={skills.length}
                color="text-amber-500"
              />
              <StatItem
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                }
                label="Study Guides"
                value={docs.length}
                color="text-sky-500"
              />
              <StatItem
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                }
                label="Video Sources"
                value={videos.length}
                color="text-rose-500"
              />
            </div>
          </div>

          {/* Quick Topics */}
          <div className="rounded-xl border bg-card p-4 flex-1 overflow-hidden flex flex-col">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
              Quick Topics
            </h3>
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-wrap gap-2">
                {[
                  "Submission Range",
                  "Book Building",
                  "Order Matching",
                  "Liquidity",
                  "Asian Session",
                  "EQ Level",
                  "Bias Formula",
                  "Gap Days",
                ].map((topic) => (
                  <TopicChip key={topic} topic={topic} />
                ))}
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="rounded-xl border bg-muted/50 p-4 text-sm text-muted-foreground">
            <p className="mb-2">
              <strong className="text-foreground">Tip:</strong> Click on source badges in chat responses to see full context.
            </p>
            <p>
              This bot searches through TCM skills, study guides, and video transcripts to answer your questions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatItem({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={color}>{icon}</span>
        {label}
      </div>
      <span className={`font-mono font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function TopicChip({ topic }: { topic: string }) {
  return (
    <button className="px-2.5 py-1 text-xs rounded-full bg-secondary hover:bg-secondary/80 border border-border/50 transition-colors">
      {topic}
    </button>
  );
}
