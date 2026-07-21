"use client";

import { useEffect, useRef, useState, useCallback } from 'react';
import { formatTimestamp, TranscriptSegment } from '@/lib/tcm-library.client';

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  currentTime: number;
  onSeek: (time: number) => void;
}

export function TranscriptPanel({ segments, currentTime, onSeek }: TranscriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [userScrolled, setUserScrolled] = useState(false);

  // Find current segment index
  const currentIndex = segments.findIndex(
    (seg) => currentTime >= seg.start && currentTime <= seg.end
  );

  // Auto-scroll to active segment
  useEffect(() => {
    if (autoScroll && activeRef.current && containerRef.current && !userScrolled) {
      const container = containerRef.current;
      const active = activeRef.current;

      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();

      // Check if active element is out of view
      if (activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom) {
        active.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }
  }, [currentIndex, autoScroll, userScrolled]);

  // Reset user scroll flag after a delay
  useEffect(() => {
    if (userScrolled) {
      const timeout = setTimeout(() => {
        setUserScrolled(false);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [userScrolled]);

  const handleScroll = useCallback(() => {
    setUserScrolled(true);
  }, []);

  const handleSegmentClick = (segment: TranscriptSegment) => {
    onSeek(segment.start);
    setUserScrolled(false);
  };

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <svg className="w-10 h-10 text-muted-foreground/30 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm text-muted-foreground">No transcript available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <h3 className="text-sm font-medium text-foreground">Transcript</h3>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            autoScroll
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
          title={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          <span>Follow</span>
        </button>
      </div>

      {/* Segments */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        {segments.map((segment, index) => {
          const isActive = index === currentIndex;
          const isPast = currentTime > segment.end;

          return (
            <button
              key={index}
              ref={isActive ? activeRef : null}
              onClick={() => handleSegmentClick(segment)}
              className={`w-full text-left px-3 py-2 transition-all border-l-2 ${
                isActive
                  ? 'bg-primary/10 border-primary'
                  : isPast
                  ? 'border-transparent opacity-60 hover:opacity-100 hover:bg-muted/30'
                  : 'border-transparent hover:bg-muted/30'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className={`flex-shrink-0 text-xs font-mono ${
                  isActive ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}>
                  {formatTimestamp(segment.start)}
                </span>
                <p className={`text-sm leading-relaxed ${
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {segment.text}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground text-center">
        Click any line to jump to that point
      </div>
    </div>
  );
}

/**
 * Grouped transcript panel for longer videos
 * Groups segments by time interval for easier navigation
 */
interface GroupedTranscriptPanelProps {
  grouped: { timestamp: number; text: string }[];
  currentTime: number;
  onSeek: (time: number) => void;
}

export function GroupedTranscriptPanel({ grouped, currentTime, onSeek }: GroupedTranscriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Find current group index
  const currentIndex = grouped.findIndex((group, index) => {
    const nextGroup = grouped[index + 1];
    if (nextGroup) {
      return currentTime >= group.timestamp && currentTime < nextGroup.timestamp;
    }
    return currentTime >= group.timestamp;
  });

  // Auto-scroll to active group
  useEffect(() => {
    if (autoScroll && activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentIndex, autoScroll]);

  if (grouped.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-sm text-muted-foreground">No transcript available</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <h3 className="text-sm font-medium text-foreground">Transcript</h3>
        <button
          onClick={() => setAutoScroll(!autoScroll)}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
            autoScroll ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          <span>Follow</span>
        </button>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {grouped.map((group, index) => {
          const isActive = index === currentIndex;

          return (
            <button
              key={index}
              ref={isActive ? activeRef : null}
              onClick={() => onSeek(group.timestamp)}
              className={`w-full text-left px-3 py-3 transition-all border-l-2 ${
                isActive
                  ? 'bg-primary/10 border-primary'
                  : 'border-transparent hover:bg-muted/30'
              }`}
            >
              <span className={`text-xs font-mono ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                {formatTimestamp(group.timestamp)}
              </span>
              <p className={`mt-1 text-sm leading-relaxed ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                {group.text}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
