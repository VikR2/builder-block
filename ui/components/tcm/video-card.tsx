"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { VideoDetails, formatDuration } from '@/lib/tcm-library.client';

interface VideoCardProps {
  video: VideoDetails;
}

export function VideoCard({ video }: VideoCardProps) {
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Link
      href={`/tcm/library/${encodeURIComponent(video.id)}`}
      className="group block rounded-xl border border-border bg-card overflow-hidden transition-all duration-300 hover:border-rose-500/50 hover:-translate-y-1 hover:shadow-lg hover:shadow-rose-500/10"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Thumbnail Container */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {/* Thumbnail Image */}
        {!imageError ? (
          <Image
            src={video.thumbnailUrl}
            alt={video.title}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImageError(true)}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-rose-500/10 to-amber-500/10">
            <svg className="w-16 h-16 text-rose-500/50" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}

        {/* Play Button Overlay */}
        <div
          className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-300 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="w-16 h-16 rounded-full bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/30 transform transition-all duration-300 group-hover:scale-110">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Duration Badge */}
        <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/80 text-white text-xs font-mono backdrop-blur-sm">
          {formatDuration(video.duration)}
        </div>

        {/* Chapter Count Badge */}
        <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-amber-500 text-background text-xs font-semibold">
          {video.frameCount} chapters
        </div>

        {/* TCM Badge */}
        <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-rose-500/90 text-white text-xs font-medium backdrop-blur-sm">
          TCM
        </div>
      </div>

      {/* Info Section */}
      <div className="p-4">
        <h3 className="font-semibold text-foreground line-clamp-2 leading-snug group-hover:text-rose-500 transition-colors">
          {video.title}
        </h3>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="text-amber-500">●</span>
          <span>TCM Trading Education</span>
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{formatDuration(video.duration)}</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span>{video.frameCount} chapters</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
