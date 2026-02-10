"use client";

import { useState } from "react";
import Image from "next/image";
import { TCMSearchResult } from "@/lib/tcm-db";
import { ChartConfig } from "@/lib/tcm-chart-data";
import { ChartViewer } from "./chart-viewer";
import { VideoPlayer, VideoModal, WatchExplanationButton } from "./video-player";
import { VideoClipInfo } from "@/lib/tcm-video-clips";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: TCMSearchResult[];
  isLoading?: boolean;
  frames?: FrameReference[];
  chartData?: ChartConfig;
  videoClip?: VideoClipInfo;
}

// Re-export VideoClipInfo for external use
export type VideoClip = VideoClipInfo;

export interface FrameReference {
  videoId: string;
  videoTitle: string;
  frameNumber: number;
  timestamp: number;
  timestampFormatted: string;
  transcriptText?: string;
}

interface MessageBubbleProps {
  message: Message;
  onSourceClick?: (source: TCMSearchResult) => void;
}

// Lightweight markdown renderer for chat messages
function renderMarkdown(content: string): string {
  return content
    // Remove leading/trailing horizontal rules and whitespace
    .replace(/^[\s\n]*---[\s\n]*/g, '')
    .replace(/[\s\n]*---[\s\n]*$/g, '')
    // Remove blockquote markers and style the text better
    .replace(/^>\s*(.*)$/gm, '<blockquote class="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">$1</blockquote>')
    // Headers
    .replace(/^### (.*)$/gm, '<h3 class="font-semibold text-base mt-3 mb-1">$1</h3>')
    .replace(/^## (.*)$/gm, '<h2 class="font-semibold text-lg mt-3 mb-1">$2</h2>')
    // Bold
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    // Italic
    .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code class="bg-background/50 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    // Unordered lists with proper styling
    .replace(/^- (.*)$/gm, '<li class="flex items-start gap-2 ml-1"><span class="text-primary mt-1.5 text-xs">●</span><span>$1</span></li>')
    // Numbered lists
    .replace(/^(\d+)\.\s+(.*)$/gm, '<li class="flex items-start gap-2 ml-1"><span class="text-primary font-medium">$1.</span><span>$2</span></li>')
    // Wrap consecutive list items
    .replace(/(<li[^>]*>.*?<\/li>\n?)+/g, '<ul class="space-y-1 my-2">$&</ul>')
    // Clean up multiple blockquotes into one
    .replace(/(<\/blockquote>\s*<blockquote[^>]*>)/g, '<br />')
    // Line breaks
    .replace(/\n\n/g, '</p><p class="my-3">')
    .replace(/\n/g, '<br />');
}

export function MessageBubble({ message, onSourceClick }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[85%] rounded-xl px-4 py-3 shadow-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border"
        }`}
      >
        {/* Message Content */}
        {message.isLoading ? (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span className="text-sm opacity-70">Searching...</span>
          </div>
        ) : isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div
            className="text-sm leading-relaxed [&_ul]:list-none [&_p]:my-0"
            dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(message.content)}</p>` }}
          />
        )}

        {/* Interactive Chart - HIDDEN: user feedback indicates charts are difficult to conceptualize
        {message.chartData && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <ChartViewer config={message.chartData} height={250} />
          </div>
        )}
        */}

        {/* Video Clip */}
        {message.videoClip && (
          <VideoClipSection clip={message.videoClip} />
        )}

        {/* Frame Previews */}
        {message.frames && message.frames.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Video Examples:
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {message.frames.map((frame, idx) => (
                <FramePreviewInline key={`${frame.videoId}-${frame.frameNumber}-${idx}`} frame={frame} />
              ))}
            </div>
          </div>
        )}

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="text-xs text-muted-foreground mb-2">Sources:</div>
            <div className="flex flex-wrap gap-2">
              {message.sources.map((source) => (
                <button
                  key={source.id}
                  onClick={() => onSourceClick?.(source)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-background/50 hover:bg-background border border-border/50 text-xs transition-colors"
                >
                  <SourceIcon type={source.type} />
                  <span className="truncate max-w-[150px]">{source.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`text-xs mt-2 ${
            isUser ? "text-primary-foreground/60" : "text-muted-foreground"
          }`}
        >
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

function SourceIcon({ type }: { type: TCMSearchResult["type"] }) {
  switch (type) {
    case "skill":
      return (
        <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case "document":
      return (
        <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "transcript":
      return (
        <svg className="w-3.5 h-3.5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function VideoClipSection({ clip }: { clip: VideoClipInfo }) {
  const [showModal, setShowModal] = useState(false);
  const [showInline, setShowInline] = useState(false);

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
        <svg className="w-3.5 h-3.5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Video Explanation:
      </div>

      {showInline ? (
        <div className="space-y-2">
          <VideoPlayer clip={clip} />
          <button
            onClick={() => setShowInline(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Hide video
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <WatchExplanationButton clip={clip} onWatch={() => setShowInline(true)} />
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-background/50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            Fullscreen
          </button>
        </div>
      )}

      <VideoModal clip={clip} isOpen={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}

function FramePreviewInline({ frame }: { frame: FrameReference }) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const imageUrl = `/api/tcm/frames/${encodeURIComponent(frame.videoId)}/${frame.frameNumber}`;

  return (
    <>
      <div
        className="relative flex-shrink-0 cursor-pointer group"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowModal(true)}
      >
        <div className="w-36 h-20 rounded overflow-hidden border bg-black relative group-hover:ring-2 group-hover:ring-primary/50 transition-all">
          {isLoading && !hasError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {hasError ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
          ) : (
            <Image
              src={imageUrl}
              alt={`Frame at ${frame.timestampFormatted}`}
              fill
              className={`object-cover transition-opacity ${isLoading ? "opacity-0" : "opacity-100"}`}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
              unoptimized
            />
          )}
          {/* Expand icon overlay on hover */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
          {/* Timestamp overlay */}
          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-black/70 text-white text-xs flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {frame.timestampFormatted}
          </div>
        </div>

        {/* Tooltip with transcript */}
        {showTooltip && frame.transcriptText && (
          <div className="absolute bottom-full left-0 mb-2 w-64 p-2 rounded bg-popover border shadow-lg z-10">
            <div className="text-xs font-medium mb-1 truncate">{frame.videoTitle}</div>
            <div className="text-xs text-muted-foreground italic line-clamp-3">
              &quot;{frame.transcriptText}&quot;
            </div>
          </div>
        )}
      </div>

      {/* Full-size modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-card rounded-lg overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-2 right-2 z-10 p-1 rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Large image */}
            <div className="relative w-full" style={{ aspectRatio: '16/9', minWidth: '600px' }}>
              <Image
                src={imageUrl}
                alt={`Frame at ${frame.timestampFormatted}`}
                fill
                className="object-contain bg-black"
                unoptimized
              />
            </div>

            {/* Info panel */}
            <div className="p-4 border-t border-border bg-card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-lg">{frame.videoTitle}</h3>
                <span className="text-primary font-mono text-lg">@ {frame.timestampFormatted}</span>
              </div>
              {frame.transcriptText && (
                <p className="text-sm text-muted-foreground italic">
                  &quot;{frame.transcriptText}&quot;
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
