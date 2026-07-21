"use client";

import { VideoCard } from './video-card';
import { VideoDetails } from '@/lib/tcm-library';
import Link from 'next/link';

interface VideoGridProps {
  videos: VideoDetails[];
}

export function VideoGrid({ videos }: VideoGridProps) {
  if (videos.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-12 text-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-rose-500/20 to-amber-500/20 mx-auto mb-6 flex items-center justify-center">
          <svg className="w-10 h-10 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <h3 className="font-semibold text-xl mb-2">No Videos Yet</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Video courses will appear here once content is added. Each video includes chapter navigation and synchronized transcripts.
        </p>
        <Link
          href="/tcm"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-background font-medium rounded-lg hover:bg-amber-400 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Try Knowledge Bot
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}
