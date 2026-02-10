'use client';

import Link from 'next/link';
import { CheckCircle, AlertCircle, Clock, Sparkles, Upload } from 'lucide-react';

interface ActivityItem {
  id: number;
  type: 'completed' | 'failed' | 'queued' | 'skills' | 'upload';
  title: string;
  subtitle?: string;
  videoId?: number;
  timestamp: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
  maxItems?: number;
}

const activityIcons: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="h-4 w-4 text-emerald-500" />,
  failed: <AlertCircle className="h-4 w-4 text-rose-500" />,
  queued: <Clock className="h-4 w-4 text-muted-foreground" />,
  skills: <Sparkles className="h-4 w-4 text-amber-500" />,
  upload: <Upload className="h-4 w-4 text-sky-500" />
};

const activityColors: Record<string, string> = {
  completed: 'bg-emerald-500/20',
  failed: 'bg-rose-500/20',
  queued: 'bg-muted',
  skills: 'bg-amber-500/20',
  upload: 'bg-sky-500/20'
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

export function ActivityFeed({ items, maxItems = 10 }: ActivityFeedProps) {
  const displayItems = items.slice(0, maxItems);

  if (displayItems.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No recent activity
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {displayItems.map((item) => (
        <div key={item.id} className="flex items-start gap-3">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${activityColors[item.type]}`}>
            {activityIcons[item.type]}
          </div>
          <div className="flex-1 min-w-0">
            {item.videoId ? (
              <Link
                href={`/tcm/admin/videos/${item.videoId}`}
                className="text-sm font-medium hover:text-amber-500 transition-colors"
              >
                {item.title}
              </Link>
            ) : (
              <div className="text-sm font-medium">{item.title}</div>
            )}
            {item.subtitle && (
              <div className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</div>
            )}
          </div>
          <div className="text-xs text-muted-foreground flex-shrink-0">
            {formatTime(item.timestamp)}
          </div>
        </div>
      ))}
    </div>
  );
}
