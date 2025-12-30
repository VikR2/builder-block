import Link from "next/link";
import { getStats, getAllSkills } from "@/lib/db";

export default function HomePage() {
  const stats = getStats();
  const recentSkills = getAllSkills().slice(0, 5);

  return (
    <div className="container py-12">
      <div className="flex flex-col gap-12 items-center">
        {/* Hero Section */}
        <div className="flex flex-col gap-6 text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full w-fit mx-auto">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></div>
            <span className="text-xs font-mono text-primary uppercase tracking-wider">Trading System Active</span>
          </div>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-tight">
            <span className="text-primary terminal-glow">NinjaTrader</span>
            <br />
            <span className="text-foreground">Script Builder</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed font-light">
            Streamline your trading platform workflow with AI-powered script generation and intelligent code optimization
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 w-full max-w-6xl">
          <div className="stat-card">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Scripts Built</span>
              </div>
              <span className="text-5xl font-bold font-mono text-primary">{stats.skills}.0</span>
              <span className="text-sm text-primary font-mono">+2 this week</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Active Jobs</span>
              </div>
              <span className="text-5xl font-bold font-mono text-accent">{stats.projects}</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Success Rate</span>
              </div>
              <span className="text-5xl font-bold font-mono text-foreground">0%</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Time Saved</span>
              </div>
              <span className="text-5xl font-bold font-mono text-chart-3">0h</span>
            </div>
          </div>
        </div>

        {/* Recent Skills */}
        <div className="flex flex-col gap-6 w-full max-w-6xl">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold">
              Recent Skills
            </h2>
            <Link href="/skills" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
              View all →
            </Link>
          </div>
          <div className="grid gap-4">
            {recentSkills.map((skill) => (
              <Link
                key={skill.id}
                href={`/skills/${skill.slug}`}
                className="skill-card rounded-xl border border-border bg-card p-6 hover:border-primary/40 transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg text-foreground">{skill.name}</h3>
                      <span className="text-xs px-3 py-1 rounded-full font-mono category-badge border border-primary/20 text-primary">
                        {skill.category}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {skill.description}
                    </p>
                  </div>
                  <div className="text-xs font-mono px-3 py-1.5 rounded-lg bg-secondary/50 text-secondary-foreground whitespace-nowrap">
                    {skill.complexity}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Getting Started */}
        <div className="rounded-xl border border-primary/20 bg-card p-10 w-full max-w-6xl">
          <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
            Getting Started
          </h2>
          <div className="grid gap-8 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-primary font-mono text-lg font-bold">01</span>
                <h3 className="font-semibold text-lg">Build Scripts in Claude Code</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Use Claude Code to build NinjaTrader strategies. The MCP server auto-loads relevant skills into context.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-accent font-mono text-lg font-bold">02</span>
                <h3 className="font-semibold text-lg">Extract Skills</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                After building a script, use the <code className="px-2 py-1 rounded bg-primary/10 border border-primary/20 text-primary font-mono text-xs">/extract-nt-skills</code> skill to save reusable patterns.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-chart-4 font-mono text-lg font-bold">03</span>
                <h3 className="font-semibold text-lg">Browse & Reference</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Use this UI to browse your skills library, organize projects, and document your trading journal.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-chart-3 font-mono text-lg font-bold">04</span>
                <h3 className="font-semibold text-lg">Accelerate Development</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Skills auto-load in future sessions, making it faster to build new strategies with proven patterns.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
