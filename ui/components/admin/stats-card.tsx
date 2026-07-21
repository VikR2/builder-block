'use client';

import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color: 'amber' | 'rose' | 'emerald' | 'sky' | 'violet';
  subtitle?: string;
}

const colorClasses = {
  amber: 'bg-amber-500/20 text-amber-500',
  rose: 'bg-rose-500/20 text-rose-500',
  emerald: 'bg-emerald-500/20 text-emerald-500',
  sky: 'bg-sky-500/20 text-sky-500',
  violet: 'bg-violet-500/20 text-violet-500'
};

export function StatsCard({ label, value, icon: Icon, color, subtitle }: StatsCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-4 hover:bg-accent/5 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      {subtitle && (
        <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
      )}
    </div>
  );
}
