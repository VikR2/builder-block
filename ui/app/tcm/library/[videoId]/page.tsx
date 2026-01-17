"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { VideoPlayer } from '@/components/tcm/video-player';
import { PlaylistSidebar } from '@/components/tcm/playlist-sidebar';
import { TranscriptPanel } from '@/components/tcm/transcript-panel';
import { ChapterMarkers } from '@/components/tcm/chapter-markers';
import {
  VideoDetails,
  VideoChapter,
  TranscriptSegment,
  formatDuration,
  formatTimestamp
} from '@/lib/tcm-library.client';
import { VideoClipInfo } from '@/lib/tcm-video-clips';

interface WatchPageData {
  video: VideoDetails;
  chapters: VideoChapter[];
  transcript: {
    grouped: { timestamp: number; text: string }[];
    segments: TranscriptSegment[];
  };
  allVideos: VideoDetails[];
}

export default function WatchPage() {
  const params = useParams();
  const videoId = params.videoId as string;

  const [data, setData] = useState<WatchPageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const playlistRef = useRef<HTMLDivElement>(null);

  // Close playlist when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (playlistRef.current && !playlistRef.current.contains(event.target as Node)) {
        setShowPlaylist(false);
      }
    }

    if (showPlaylist) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPlaylist]);

  // Fetch video data
  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch video details and all videos in parallel
        const [videoRes, libraryRes] = await Promise.all([
          fetch(`/api/tcm/library/${encodeURIComponent(videoId)}`),
          fetch('/api/tcm/library')
        ]);

        if (!videoRes.ok) {
          throw new Error('Video not found');
        }

        const videoData = await videoRes.json();

        // Library API might not exist yet, handle gracefully
        let allVideos: VideoDetails[] = [];
        if (libraryRes.ok) {
          allVideos = await libraryRes.json();
        } else {
          // Fallback: just use the current video
          allVideos = [videoData.video];
        }

        setData({
          ...videoData,
          allVideos
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load video');
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [videoId]);

  // Handle time updates from video player
  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  // Handle seek requests from chapters/transcript
  const handleSeek = useCallback((time: number) => {
    setSeekTo(time);
    // Reset seekTo after a short delay to allow re-seeking to same time
    setTimeout(() => setSeekTo(undefined), 100);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading video...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <svg className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 className="text-lg font-medium text-foreground mb-2">Video Not Found</h2>
          <p className="text-muted-foreground mb-4">{error || 'The requested video could not be loaded'}</p>
          <Link
            href="/tcm/library"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Library
          </Link>
        </div>
      </div>
    );
  }

  const { video, chapters, transcript, allVideos } = data;

  // Create clip info for video player (full video)
  const clipInfo: VideoClipInfo = {
    videoId: video.id,
    videoTitle: video.title,
    startTime: 0,
    endTime: video.duration
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Compact Header with Playlist Dropdown */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="container mx-auto px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/tcm/library"
              className="p-2 rounded-lg hover:bg-muted transition-colors shrink-0"
              title="Back to Library"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <h1 className="font-semibold text-foreground truncate">{video.title}</h1>
          </div>

          {/* Playlist Toggle Button */}
          <div className="relative" ref={playlistRef}>
            <button
              onClick={() => setShowPlaylist(!showPlaylist)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                showPlaylist ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-foreground'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
              <span className="hidden sm:inline">Playlist</span>
              <span className="text-xs opacity-75">({allVideos.length})</span>
              <svg className={`w-4 h-4 transition-transform ${showPlaylist ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Playlist Dropdown */}
            {showPlaylist && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-2xl z-40 max-h-[60vh] overflow-hidden">
                <PlaylistSidebar
                  videos={allVideos}
                  currentVideoId={video.id}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Theater Video Section - Full Width Dark Background */}
      <div className="bg-black">
        <div className="max-w-[1600px] mx-auto">
          <div className="aspect-video max-h-[70vh]">
            <VideoPlayer
              clip={clipInfo}
              defaultMode="full"
              hideHeader
              theaterMode
              onTimeUpdate={handleTimeUpdate}
              seekTo={seekTo}
              className="h-full w-full"
            />
          </div>
        </div>
      </div>

      {/* Video Info Bar */}
      <div className="border-b border-border/30 bg-card/50">
        <div className="container mx-auto px-4 py-3">
          <h2 className="text-xl font-bold text-foreground">{video.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {formatDuration(video.duration)} • {chapters.length} chapters • Current: <span className="text-primary font-medium">{formatTimestamp(currentTime)}</span>
          </p>
        </div>
      </div>

      {/* Chapters + Transcript Side by Side */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Chapters */}
          <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border/30 bg-muted/30">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                Chapters ({chapters.length})
              </h3>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              <ChapterMarkers
                chapters={chapters}
                currentTime={currentTime}
                onSeek={handleSeek}
              />
            </div>
          </div>

          {/* Transcript */}
          <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border/30 bg-muted/30">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Transcript
              </h3>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              <TranscriptPanel
                segments={transcript.segments}
                currentTime={currentTime}
                onSeek={handleSeek}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
