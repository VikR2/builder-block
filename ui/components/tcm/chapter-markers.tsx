"use client";

import { useState } from 'react';
import Image from 'next/image';
import { VideoChapter, formatTimestamp } from '@/lib/tcm-library.client';

interface ChapterMarkersProps {
  chapters: VideoChapter[];
  currentTime: number;
  onSeek: (time: number) => void;
}

export function ChapterMarkers({ chapters, currentTime, onSeek }: ChapterMarkersProps) {
  // Find current chapter
  const currentChapterIndex = chapters.findIndex((chapter, index) => {
    const nextChapter = chapters[index + 1];
    if (nextChapter) {
      return currentTime >= chapter.timestamp && currentTime < nextChapter.timestamp;
    }
    return currentTime >= chapter.timestamp;
  });

  if (chapters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <svg className="w-10 h-10 text-muted-foreground/30 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        <p className="text-sm text-muted-foreground">No chapters available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50">
        <h3 className="text-sm font-medium text-foreground">Chapters</h3>
        <p className="text-xs text-muted-foreground">{chapters.length} sections</p>
      </div>

      {/* Chapters List */}
      <div className="flex-1 overflow-y-auto">
        {chapters.map((chapter, index) => (
          <ChapterItem
            key={index}
            chapter={chapter}
            index={index}
            isCurrent={index === currentChapterIndex}
            isPast={index < currentChapterIndex}
            onSeek={onSeek}
          />
        ))}
      </div>
    </div>
  );
}

interface ChapterItemProps {
  chapter: VideoChapter;
  index: number;
  isCurrent: boolean;
  isPast: boolean;
  onSeek: (time: number) => void;
}

function ChapterItem({ chapter, index, isCurrent, isPast, onSeek }: ChapterItemProps) {
  const [imageError, setImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={() => onSeek(chapter.timestamp)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`w-full flex items-start gap-3 p-2 text-left transition-all border-l-2 ${
        isCurrent
          ? 'bg-primary/10 border-primary'
          : isPast
          ? 'border-transparent opacity-60 hover:opacity-100 hover:bg-muted/30'
          : 'border-transparent hover:bg-muted/30'
      }`}
    >
      {/* Chapter Number */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
        {isCurrent ? (
          <div className="w-2 h-2 rounded-full bg-primary" />
        ) : (
          <span className="text-xs text-muted-foreground">{index + 1}</span>
        )}
      </div>

      {/* Thumbnail (optional) */}
      {chapter.frameUrl && (
        <div className="relative flex-shrink-0 w-16 aspect-video rounded overflow-hidden bg-muted">
          {!imageError ? (
            <Image
              src={chapter.frameUrl}
              alt={chapter.title}
              fill
              className="object-cover"
              onError={() => setImageError(true)}
              sizes="64px"
            />
          ) : (
            <div className="absolute inset-0 bg-muted" />
          )}

          {/* Play overlay on hover */}
          {isHovered && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-mono ${
            isCurrent ? 'text-primary font-medium' : 'text-muted-foreground'
          }`}>
            {formatTimestamp(chapter.timestamp)}
          </span>
        </div>
        <p className={`text-sm line-clamp-2 mt-0.5 ${
          isCurrent ? 'text-foreground font-medium' : 'text-muted-foreground'
        }`}>
          {chapter.title}
        </p>
      </div>
    </button>
  );
}

/**
 * Compact chapter markers for timeline display
 */
interface CompactChapterMarkersProps {
  chapters: VideoChapter[];
  duration: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

export function CompactChapterMarkers({ chapters, duration, currentTime, onSeek }: CompactChapterMarkersProps) {
  if (chapters.length === 0 || duration === 0) return null;

  return (
    <div className="relative h-1 bg-transparent">
      {chapters.map((chapter, index) => {
        const position = (chapter.timestamp / duration) * 100;
        const isCurrent = chapters.findIndex((c, i) => {
          const next = chapters[i + 1];
          if (next) return currentTime >= c.timestamp && currentTime < next.timestamp;
          return currentTime >= c.timestamp;
        }) === index;

        return (
          <button
            key={index}
            onClick={() => onSeek(chapter.timestamp)}
            className="absolute top-0 -translate-x-1/2 group"
            style={{ left: `${position}%` }}
            title={`${formatTimestamp(chapter.timestamp)} - ${chapter.title}`}
          >
            <div className={`w-0.5 h-2 transition-all ${
              isCurrent ? 'bg-primary h-3' : 'bg-muted-foreground/50 group-hover:bg-foreground'
            }`} />
          </button>
        );
      })}
    </div>
  );
}
