"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { VideoDetails, formatDuration } from '@/lib/tcm-library.client';

interface PlaylistSidebarProps {
  videos: VideoDetails[];
  currentVideoId: string;
  playlistId?: number | null;
  playlistSlug?: string | null;
  playlistName?: string | null;
}

export function PlaylistSidebar({
  videos,
  currentVideoId,
  playlistId,
  playlistSlug,
  playlistName
}: PlaylistSidebarProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50">
        <h3 className="text-sm font-medium text-foreground">{playlistName || 'Playlist'}</h3>
        <p className="text-xs text-muted-foreground">{videos.length} videos</p>
      </div>

      {/* Video List */}
      <div className="flex-1 overflow-y-auto">
        {videos.map((video, index) => (
          <PlaylistItem
            key={video.id}
            video={video}
            index={index + 1}
            isCurrent={video.id === currentVideoId}
            playlistId={playlistId}
            playlistSlug={playlistSlug}
          />
        ))}
      </div>
    </div>
  );
}

interface PlaylistItemProps {
  video: VideoDetails;
  index: number;
  isCurrent: boolean;
  playlistId?: number | null;
  playlistSlug?: string | null;
}

function PlaylistItem({ video, index, isCurrent, playlistId, playlistSlug }: PlaylistItemProps) {
  const [imageError, setImageError] = useState(false);
  const href = playlistId && playlistSlug
    ? `/tcm/library/${encodeURIComponent(video.id)}?playlist=${playlistId}&playlistSlug=${encodeURIComponent(playlistSlug)}`
    : `/tcm/library/${encodeURIComponent(video.id)}`;

  return (
    <Link
      href={href}
      className={`flex gap-2 p-2 transition-colors ${
        isCurrent
          ? 'bg-primary/10 border-l-2 border-primary'
          : 'hover:bg-muted/50 border-l-2 border-transparent'
      }`}
    >
      {/* Index */}
      <div className="flex-shrink-0 w-6 text-center">
        {isCurrent ? (
          <div className="w-5 h-5 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{index}</span>
        )}
      </div>

      {/* Thumbnail */}
      <div className="relative flex-shrink-0 w-20 aspect-video rounded overflow-hidden bg-muted">
        {!imageError ? (
          <Image
            src={video.thumbnailUrl}
            alt={video.title}
            fill
            className="object-cover"
            onError={() => setImageError(true)}
            sizes="80px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-6 h-6 text-muted-foreground/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        )}

        {/* Duration */}
        <div className="absolute bottom-0.5 right-0.5 px-1 py-0.5 rounded text-[10px] bg-black/70 text-white font-mono">
          {formatDuration(video.duration)}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className={`text-xs font-medium line-clamp-2 ${isCurrent ? 'text-primary' : 'text-foreground'}`}>
          {video.title}
        </h4>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {video.frameCount} chapters
        </p>
      </div>
    </Link>
  );
}
