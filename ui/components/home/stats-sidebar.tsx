'use client';

import Link from 'next/link';

interface StatsData {
  skillsCount: number;
  videosCount: number;
  guidesCount: number;
  modelsCount?: number;
}

interface StatsSidebarProps {
  stats: StatsData;
}

function StatItem({
  icon,
  label,
  value,
  href,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  href: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between p-3 rounded-lg bg-card/50 hover:bg-card border border-border/50 hover:border-border transition-all group"
    >
      <div className="flex items-center gap-3">
        <span className={`text-lg ${color}`}>{icon}</span>
        <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
          {label}
        </span>
      </div>
      <span className="text-lg font-semibold text-foreground">{value}</span>
    </Link>
  );
}

export function StatsSidebar({ stats }: StatsSidebarProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <span className="text-amber-500">📊</span>
        <h3 className="font-semibold text-foreground">Quick Stats</h3>
      </div>

      {/* Stats list */}
      <div className="space-y-2">
        <StatItem
          icon="◆"
          label="Skills"
          value={stats.skillsCount}
          href="/skills"
          color="text-emerald-500"
        />
        <StatItem
          icon="▶"
          label="Videos"
          value={stats.videosCount}
          href="/tcm/library"
          color="text-rose-500"
        />
        <StatItem
          icon="◎"
          label="Guides"
          value={stats.guidesCount}
          href="/tcm/guides"
          color="text-sky-500"
        />
        {stats.modelsCount !== undefined && stats.modelsCount > 0 && (
          <StatItem
            icon="⬡"
            label="Models"
            value={stats.modelsCount}
            href="/skills?type=model"
            color="text-violet-500"
          />
        )}
      </div>

      {/* Motivational footer */}
      <div className="mt-5 pt-4 border-t border-border/50">
        <p className="text-xs text-muted-foreground text-center italic">
          "The market rewards patience and precision"
        </p>
      </div>
    </div>
  );
}

export function StatsSidebarSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-5 animate-pulse">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-5 h-5 rounded bg-muted"></div>
        <div className="h-5 w-24 rounded bg-muted"></div>
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded bg-muted"></div>
              <div className="h-4 w-16 rounded bg-muted"></div>
            </div>
            <div className="h-6 w-8 rounded bg-muted"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
