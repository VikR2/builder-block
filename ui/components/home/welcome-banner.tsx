'use client';

import Link from 'next/link';

interface WelcomeBannerProps {
  userName?: string;
  lastActivity?: {
    type: 'video' | 'skill' | 'guide';
    title: string;
    url: string;
  } | null;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getFirstName(email: string): string {
  // Extract name from email if possible, otherwise return "Trader"
  const localPart = email.split('@')[0];
  if (!localPart) return 'Trader';

  // Try to extract a name-like string
  const cleanName = localPart
    .replace(/[._0-9]/g, ' ')
    .trim()
    .split(' ')[0];

  if (cleanName && cleanName.length > 2) {
    return cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase();
  }

  return 'Trader';
}

export function WelcomeBanner({ userName, lastActivity }: WelcomeBannerProps) {
  const greeting = getGreeting();
  const displayName = userName ? getFirstName(userName) : 'Trader';

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 via-card to-card p-8">
      {/* Decorative elements */}
      <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-amber-500/5 blur-3xl"></div>
      <div className="absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-amber-600/5 blur-2xl"></div>

      <div className="relative">
        {/* Greeting */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">&#9825;</span>
          <h1 className="text-2xl font-semibold">
            <span className="text-muted-foreground">{greeting},</span>{' '}
            <span className="text-foreground">{displayName}</span>
          </h1>
        </div>

        {/* Subtext */}
        <p className="text-muted-foreground mb-6 max-w-md">
          Your journey to mastering price action continues. What would you like to learn today?
        </p>

        {/* Quick actions or continue learning */}
        {lastActivity ? (
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Continue where you left off</p>
              <Link
                href={lastActivity.url}
                className="inline-flex items-center gap-2 text-amber-500 hover:text-amber-400 font-medium transition-colors"
              >
                <span className="text-lg">
                  {lastActivity.type === 'video' ? '▶' : lastActivity.type === 'skill' ? '◆' : '◎'}
                </span>
                {lastActivity.title}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Link
              href="/tcm/library"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-500 font-medium transition-all"
            >
              <span className="text-rose-500">▶</span>
              Watch Videos
            </Link>
            <Link
              href="/tcm"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-card hover:bg-muted border border-border text-foreground font-medium transition-all"
            >
              <span className="text-violet-500">●</span>
              Ask the Bot
            </Link>
          </div>
        )}
      </div>

      {/* Warm accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500/0 via-amber-500/30 to-amber-500/0"></div>
    </div>
  );
}
