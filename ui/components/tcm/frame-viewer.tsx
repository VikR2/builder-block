"use client";

import { useState } from "react";
import Image from "next/image";

export interface FrameData {
  videoId: string;
  videoTitle: string;
  frameNumber: number;
  timestamp: number;
  timestampFormatted: string;
  transcriptText?: string;
}

interface FrameViewerProps {
  frame: FrameData;
  onClose?: () => void;
}

export function FrameViewer({ frame, onClose }: FrameViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const imageUrl = `/api/tcm/frames/${encodeURIComponent(frame.videoId)}/${frame.frameNumber}`;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-secondary/50">
        <div className="flex items-center gap-2 text-sm">
          <svg
            className="w-4 h-4 text-yellow-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span className="font-medium truncate max-w-[200px]">
            {frame.videoTitle}
          </span>
          <span className="text-muted-foreground">@ {frame.timestampFormatted}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-secondary rounded transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Image */}
      <div className="relative aspect-video bg-black">
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {hasError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <svg
              className="w-12 h-12 mb-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm">Frame unavailable</span>
          </div>
        ) : (
          <Image
            src={imageUrl}
            alt={`Frame from ${frame.videoTitle} at ${frame.timestampFormatted}`}
            fill
            className={`object-contain transition-opacity duration-300 ${
              isLoading ? "opacity-0" : "opacity-100"
            }`}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            unoptimized // Since we're serving from our own API
          />
        )}
      </div>

      {/* Transcript */}
      {frame.transcriptText && (
        <div className="px-3 py-2 border-t bg-secondary/30">
          <p className="text-sm text-muted-foreground italic">
            &quot;{frame.transcriptText}&quot;
          </p>
        </div>
      )}
    </div>
  );
}

// Inline frame preview (smaller)
interface FramePreviewProps {
  frame: FrameData;
  onClick?: () => void;
}

export function FramePreview({ frame, onClick }: FramePreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const imageUrl = `/api/tcm/frames/${encodeURIComponent(frame.videoId)}/${frame.frameNumber}`;

  return (
    <button
      onClick={onClick}
      className="group relative w-32 h-20 rounded overflow-hidden border bg-black hover:border-primary transition-colors"
    >
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
          className={`object-cover transition-opacity ${
            isLoading ? "opacity-0" : "opacity-100"
          }`}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          unoptimized
        />
      )}

      {/* Timestamp overlay */}
      <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/70 text-white text-xs">
        @ {frame.timestampFormatted}
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
          />
        </svg>
      </div>
    </button>
  );
}

// Modal for full-size frame viewing
interface FrameModalProps {
  frame: FrameData;
  onClose: () => void;
}

export function FrameModal({ frame, onClose }: FrameModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <FrameViewer frame={frame} onClose={onClose} />
      </div>
    </div>
  );
}
