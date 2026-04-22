"use client";

import Link from "next/link";
import { ReactNode, useState } from "react";
import Image from "next/image";
import { TCMSearchResult } from "@/lib/tcm-db";
import { ChartConfig } from "@/lib/tcm-chart-data";
import { StructuredCoachBrief } from "@/lib/tcm-coach-brief";
import { ChartViewer } from "./chart-viewer";
import { VideoPlayer, VideoModal, WatchExplanationButton } from "./video-player";
import { VideoClipInfo } from "@/lib/tcm-video-clips";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  structuredAnswer?: StructuredCoachBrief;
  sources?: TCMSearchResult[];
  isLoading?: boolean;
  frames?: FrameReference[];
  chartData?: ChartConfig;
  videoClip?: VideoClipInfo;
  primaryClip?: VideoClipInfo;
  recommendedClips?: VideoClipInfo[];
  watchLink?: string;
  lessonLink?: string;
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

function renderStructuredAnswer(answer: StructuredCoachBrief, isLoading: boolean): ReactNode {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        Mentor take
      </div>

      <p className="text-[15px] leading-7 text-foreground">{answer.lead}</p>

      {answer.bullets.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Key takeaways</div>
          <ul className="space-y-2.5">
            {answer.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2 text-sm leading-relaxed text-foreground/90">
                <span className="mt-1.5 text-[0.55rem] text-primary">●</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {answer.bestClipReason && (
        <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Why this watch helps</div>
          <p className="mt-1 text-sm leading-relaxed text-foreground/85">{answer.bestClipReason}</p>
        </div>
      )}

      {answer.broaderContext && (
        <div className="rounded-xl border border-border/50 bg-background/30 px-3 py-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">How it fits</div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{answer.broaderContext}</p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span>Refining answer...</span>
        </div>
      )}
    </div>
  );
}

function normalizeAssistantContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/^[\s\n]*---+\s*/g, "")
    .replace(/\s*---+\s*$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text
    .split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .filter(Boolean)
    .map((token, index) => {
      if (token.startsWith("**") && token.endsWith("**")) {
        return (
          <strong key={`strong-${index}`} className="font-semibold text-foreground">
            {token.slice(2, -2)}
          </strong>
        );
      }

      if (token.startsWith("`") && token.endsWith("`")) {
        return (
          <code key={`code-${index}`} className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[0.95em]">
            {token.slice(1, -1)}
          </code>
        );
      }

      if (token.startsWith("*") && token.endsWith("*")) {
        return (
          <em key={`em-${index}`} className="italic">
            {token.slice(1, -1)}
          </em>
        );
      }

      return token;
    });
}

function isBulletLine(line: string): boolean {
  return /^\s*[-*]\s+/.test(line);
}

function isNumberedLine(line: string): boolean {
  return /^\s*\d+\.\s+/.test(line);
}

function renderAssistantContent(content: string): ReactNode[] {
  const normalized = normalizeAssistantContent(content);

  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const trimmed = lines[index].trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^###\s+/.test(trimmed)) {
      blocks.push(
        <h3 key={`h3-${key += 1}`} className="text-base font-semibold text-foreground">
          {renderInlineMarkdown(trimmed.replace(/^###\s+/, ""))}
        </h3>
      );
      index += 1;
      continue;
    }

    if (/^##\s+/.test(trimmed)) {
      blocks.push(
        <h2 key={`h2-${key += 1}`} className="text-lg font-semibold text-foreground">
          {renderInlineMarkdown(trimmed.replace(/^##\s+/, ""))}
        </h2>
      );
      index += 1;
      continue;
    }

    if (/^>\s*/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s*/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s*/, ""));
        index += 1;
      }

      blocks.push(
        <blockquote
          key={`quote-${key += 1}`}
          className="border-l-2 border-primary/50 pl-3 italic text-muted-foreground"
        >
          {renderInlineMarkdown(quoteLines.join(" "))}
        </blockquote>
      );
      continue;
    }

    if (isBulletLine(trimmed)) {
      const items: string[] = [];
      while (index < lines.length && isBulletLine(lines[index])) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }

      blocks.push(
        <ul key={`ul-${key += 1}`} className="space-y-2">
          {items.map((item, itemIndex) => (
            <li key={`ul-item-${itemIndex}`} className="flex items-start gap-2">
              <span className="mt-1.5 text-[0.55rem] text-primary">●</span>
              <span>{renderInlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (isNumberedLine(trimmed)) {
      const items: Array<{ marker: string; content: string }> = [];
      while (index < lines.length && isNumberedLine(lines[index])) {
        const match = lines[index].trim().match(/^(\d+\.)\s+(.*)$/);
        if (match) {
          items.push({ marker: match[1], content: match[2] });
        }
        index += 1;
      }

      blocks.push(
        <ol key={`ol-${key += 1}`} className="space-y-2">
          {items.map((item, itemIndex) => (
            <li key={`ol-item-${itemIndex}`} className="flex items-start gap-2">
              <span className="min-w-[1.75rem] font-medium text-primary">{item.marker}</span>
              <span>{renderInlineMarkdown(item.content)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines = [trimmed];
    index += 1;

    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^##\s+/.test(lines[index].trim()) &&
      !/^###\s+/.test(lines[index].trim()) &&
      !/^>\s*/.test(lines[index].trim()) &&
      !isBulletLine(lines[index]) &&
      !isNumberedLine(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    blocks.push(
      <p key={`p-${key += 1}`} className="text-sm leading-relaxed text-foreground/95">
        {renderInlineMarkdown(paragraphLines.join(" "))}
      </p>
    );
  }

  return blocks;
}

export function MessageBubble({ message, onSourceClick }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const primaryClip = message.primaryClip || message.videoClip;
  const extraClips = (message.recommendedClips || []).filter((clip, index) => {
    if (!primaryClip) return true;
    if (index === 0 && clip.videoId === primaryClip.videoId && clip.startTime === primaryClip.startTime) {
      return false;
    }
    return clip.videoId !== primaryClip.videoId || clip.startTime !== primaryClip.startTime;
  });

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[84%] rounded-2xl px-4 py-4 shadow-sm ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "border border-border/70 bg-card/95 shadow-[0_12px_30px_rgba(0,0,0,0.12)]"
        }`}
      >
        {/* Message Content */}
        {message.structuredAnswer ? (
          renderStructuredAnswer(message.structuredAnswer, Boolean(message.isLoading))
        ) : message.isLoading ? (
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
          <div className="space-y-3 text-sm leading-relaxed">
            {renderAssistantContent(message.content)}
          </div>
        )}

        {/* Interactive Chart - HIDDEN: user feedback indicates charts are difficult to conceptualize
        {message.chartData && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <ChartViewer config={message.chartData} height={250} />
          </div>
        )}
        */}

        {/* Video Clip */}
        {primaryClip && (
          <VideoClipSection
            clip={primaryClip}
            watchLink={message.watchLink || primaryClip.watchLink}
            lessonLink={message.lessonLink || primaryClip.lessonLink}
          />
        )}

        {extraClips.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <div className="text-xs text-muted-foreground mb-2">Keep going with:</div>
            <div className="space-y-2">
              {extraClips.slice(0, 3).map((clip) => (
                <div
                  key={`${clip.videoId}-${clip.startTime}`}
                  className="rounded-xl border border-border/50 bg-background/40 px-3 py-3"
                >
                  <div className="text-sm font-medium">{clip.videoTitle}</div>
                  {clip.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{clip.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {clip.watchLink && (
                      <Link
                        href={clip.watchLink}
                        className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 font-medium text-rose-500 hover:bg-rose-500/20 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Watch clip
                      </Link>
                    )}
                    {clip.lessonLink && (
                      <Link
                        href={clip.lessonLink}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-500 hover:bg-amber-500/20 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        Lesson guide
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
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
            <div className="text-xs text-muted-foreground mb-2">Backed by:</div>
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

function VideoClipSection({
  clip,
  watchLink,
  lessonLink
}: {
  clip: VideoClipInfo;
  watchLink?: string;
  lessonLink?: string;
}) {
  const [showModal, setShowModal] = useState(false);
  const [showInline, setShowInline] = useState(false);

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
        <svg className="w-3.5 h-3.5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Best watch:
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
          {watchLink && (
            <Link
              href={watchLink}
              className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-500 hover:bg-rose-500/20 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Open watch page
            </Link>
          )}
          {lessonLink && (
            <Link
              href={lessonLink}
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500 hover:bg-amber-500/20 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Read lesson guide
            </Link>
          )}
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
