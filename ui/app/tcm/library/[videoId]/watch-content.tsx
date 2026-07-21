"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChatInterface } from "@/components/tcm/chat-interface";
import { VideoPlayer } from "@/components/tcm/video-player";
import { PlaylistSidebar } from "@/components/tcm/playlist-sidebar";
import { TranscriptPanel } from "@/components/tcm/transcript-panel";
import { ChapterMarkers } from "@/components/tcm/chapter-markers";
import {
  VideoDetails,
  VideoChapter,
  TranscriptSegment,
  formatDuration,
  formatTimestamp,
} from "@/lib/tcm-library.client";
import { VideoClipInfo } from "@/lib/tcm-video-clips";

interface PlaylistApiVideo {
  id: number;
  folder_id: string;
  title: string;
  duration_sec: number | null;
  frame_count: number;
  position: number;
}

interface PlaylistApiResponse {
  id: number;
  name: string;
  slug: string;
  videos: PlaylistApiVideo[];
}

interface WatchPageData {
  video: VideoDetails;
  chapters: VideoChapter[];
  transcript: {
    grouped: { timestamp: number; text: string }[];
    segments: TranscriptSegment[];
  };
  allVideos: VideoDetails[];
  playlistContext: {
    id: number;
    slug: string;
    name: string;
  } | null;
}

interface WatchContentProps {
  videoId: string;
}

function toPlaylistVideoDetails(
  playlistVideo: PlaylistApiVideo,
  currentVideo: VideoDetails
): VideoDetails {
  return {
    id: playlistVideo.folder_id || currentVideo.id,
    title: playlistVideo.title || currentVideo.title,
    duration: playlistVideo.duration_sec ?? currentVideo.duration,
    frameCount: playlistVideo.frame_count || currentVideo.frameCount,
    thumbnailUrl: playlistVideo.folder_id
      ? `/api/tcm/frames/${encodeURIComponent(playlistVideo.folder_id)}/1`
      : currentVideo.thumbnailUrl,
    frameInterval: currentVideo.frameInterval,
  };
}

function parseNumericParam(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function WatchContent({ videoId }: WatchContentProps) {
  const searchParams = useSearchParams();
  const playlistRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<WatchPageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTo, setSeekTo] = useState<number | undefined>(undefined);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [showTutor, setShowTutor] = useState(false);

  const playlistId = parseNumericParam(searchParams.get("playlist"));
  const playlistSlug = searchParams.get("playlistSlug");
  const requestedTimestamp = parseNumericParam(searchParams.get("t"));

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (playlistRef.current && !playlistRef.current.contains(event.target as Node)) {
        setShowPlaylist(false);
      }
    }

    if (showPlaylist) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showPlaylist]);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        const videoPromise = fetch(`/api/tcm/library/${encodeURIComponent(videoId)}`);
        const relatedPromise = playlistSlug
          ? fetch(`/api/tcm/library/playlists/${encodeURIComponent(playlistSlug)}`)
          : fetch("/api/tcm/library");

        const [videoRes, relatedRes] = await Promise.all([videoPromise, relatedPromise]);

        if (!videoRes.ok) {
          throw new Error("Video not found");
        }

        const videoData = await videoRes.json();
        let allVideos: VideoDetails[] = [videoData.video];
        let playlistContext: WatchPageData["playlistContext"] = null;

        if (playlistSlug && relatedRes.ok) {
          const playlistData = (await relatedRes.json()) as PlaylistApiResponse;
          playlistContext = {
            id: playlistData.id,
            slug: playlistData.slug,
            name: playlistData.name,
          };
          allVideos = playlistData.videos.map((playlistVideo) =>
            playlistVideo.folder_id === videoData.video.id
              ? videoData.video
              : toPlaylistVideoDetails(playlistVideo, videoData.video)
          );
        } else if (relatedRes.ok) {
          allVideos = await relatedRes.json();
        }

        if (!allVideos.some((video: VideoDetails) => video.id === videoData.video.id)) {
          allVideos = [videoData.video, ...allVideos];
        }

        setData({
          ...videoData,
          allVideos,
          playlistContext,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load video");
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [playlistSlug, videoId]);

  useEffect(() => {
    if (requestedTimestamp !== null && data) {
      setSeekTo(requestedTimestamp);
      const timer = window.setTimeout(() => setSeekTo(undefined), 100);
      return () => window.clearTimeout(timer);
    }
  }, [data, requestedTimestamp]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleSeek = useCallback((time: number) => {
    setSeekTo(time);
    window.setTimeout(() => setSeekTo(undefined), 100);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b border-border/50 bg-card/50">
          <div className="container mx-auto px-4 py-4">
            <div className="h-6 w-48 rounded bg-muted animate-pulse" />
          </div>
        </div>
        <div className="bg-black">
          <div className="max-w-[1600px] mx-auto aspect-video animate-pulse bg-zinc-900" />
        </div>
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[0, 1].map((index) => (
              <div key={index} className="rounded-xl border border-border/50 bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/30 bg-muted/30">
                  <div className="h-5 w-32 rounded bg-muted animate-pulse" />
                </div>
                <div className="p-4 space-y-3">
                  <div className="h-4 w-full rounded bg-muted animate-pulse" />
                  <div className="h-4 w-5/6 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-6 text-center">
            Preparing video, transcript, chapters, and lesson context...
          </p>
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
          <p className="text-muted-foreground mb-4">{error || "The requested video could not be loaded"}</p>
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

  const { video, chapters, transcript, allVideos, playlistContext } = data;
  const clipInfo: VideoClipInfo = {
    videoId: video.id,
    videoTitle: video.title,
    startTime: 0,
    endTime: video.duration,
  };
  const lessonHref = `/tcm/library/${encodeURIComponent(video.id)}/lesson`;
  const tutorSubtitle = playlistContext
    ? `Global tutor with extra weight on this lesson and ${playlistContext.name}`
    : "Global tutor with extra weight on this lesson";
  const lessonStorageNamespace = playlistContext
    ? `lesson:playlist-${playlistContext.id}`
    : `lesson:video-${video.id}`;
  const legacyLessonStorageNamespaces = playlistContext
    ? [`lesson-playlist-${playlistContext.id}`]
    : [`lesson-video-${video.id}`];

  return (
    <div className="min-h-screen bg-[#0b0d10]">
      <header className="sticky top-[72px] z-30 border-b border-white/[0.08] bg-[#111317]/95 backdrop-blur-xl">
        <div className="site-container flex min-h-16 items-center justify-between gap-3 py-2">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={playlistContext ? `/tcm/library/playlists/${encodeURIComponent(playlistContext.slug)}` : "/tcm/library"}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 text-[#92959c] transition-colors hover:bg-white/[0.05] hover:text-white"
              title={playlistContext ? `Back to ${playlistContext.name}` : "Back to Library"}
              aria-label={playlistContext ? `Back to ${playlistContext.name}` : "Back to Library"}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </Link>
            <div className="sr-only">
              <h1 className="font-semibold text-foreground truncate">{video.title}</h1>
              {playlistContext && (
                <p className="text-xs text-muted-foreground truncate">{playlistContext.name}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={lessonHref}
              className="hidden min-h-10 items-center gap-2 rounded-full border border-[#c9974f]/25 bg-[#c9974f]/10 px-4 text-sm font-semibold text-[#e0b56d] transition-colors hover:bg-[#c9974f]/20 sm:inline-flex"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Lesson Guide
            </Link>
            <button
              onClick={() => setShowTutor(true)}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#c9974f] px-4 text-sm font-semibold text-[#15171a] transition-colors hover:bg-[#dfb36e]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Ask Tutor
            </button>
            <div className="relative" ref={playlistRef}>
              <button
                onClick={() => setShowPlaylist(!showPlaylist)}
                title={playlistContext?.name || "Playlist"}
                aria-label={playlistContext?.name || "Playlist"}
                className={`flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
                  showPlaylist ? "bg-[#c9974f] text-[#15171a]" : "border border-white/10 bg-white/[0.04] text-[#d8d3cb] hover:bg-white/[0.08]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <span className="sr-only">{playlistContext?.name || "Playlist"}</span>
                <span className="text-xs opacity-75">({allVideos.length})</span>
                <svg className={`w-4 h-4 transition-transform ${showPlaylist ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showPlaylist && (
                <div className="absolute right-0 top-full z-40 mt-2 max-h-[60vh] w-80 overflow-hidden rounded-2xl border border-white/10 bg-[#15181c] shadow-2xl">
                  <PlaylistSidebar
                    videos={allVideos}
                    currentVideoId={video.id}
                    playlistId={playlistContext?.id || playlistId}
                    playlistSlug={playlistContext?.slug || playlistSlug}
                    playlistName={playlistContext?.name}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="bg-black py-4 sm:py-6">
        <div className="site-container">
          <div className="aspect-video max-h-[72vh] overflow-hidden rounded-xl border border-white/[0.08]">
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

      <div className="border-b border-white/[0.08] bg-[#111317]">
        <div className="site-container flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="eyebrow text-[#c9974f]">Current lesson</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-[#f4efe7]">{video.title}</h2>
            <p className="mt-1 font-mono text-[10px] text-[#7f838b]">
              {formatDuration(video.duration)} • {chapters.length} chapters • Current:{" "}
              <span className="font-medium text-[#e0b56d]">{formatTimestamp(currentTime)}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={lessonHref}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 text-sm font-semibold text-[#d8d3cb] transition-colors hover:bg-white/[0.07]"
            >
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Read Lesson Guide
            </Link>
            <button
              onClick={() => setShowTutor(true)}
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#c9974f] px-4 text-sm font-semibold text-[#15171a] transition-colors hover:bg-[#dfb36e]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Ask Tutor
            </button>
          </div>
        </div>
      </div>

      <div className="site-container py-6 sm:py-8">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="member-panel overflow-hidden">
            <div className="border-b border-white/[0.08] bg-white/[0.025] px-5 py-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                Lesson chapters ({chapters.length})
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

          <div className="member-panel overflow-hidden">
            <div className="border-b border-white/[0.08] bg-white/[0.025] px-5 py-4">
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

      {showTutor && (
        <>
          <button
            type="button"
            aria-label="Close tutor"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setShowTutor(false)}
          />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-[#0f1114] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div>
                <h2 className="font-semibold text-lg">Ask Tutor</h2>
                <p className="text-sm text-muted-foreground">{tutorSubtitle}</p>
              </div>
              <button
                onClick={() => setShowTutor(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ChatInterface
                preferredVideoId={video.id}
                preferredPlaylistId={playlistContext?.id || playlistId}
                preferredTimestamp={Math.floor(currentTime)}
                storageNamespace={lessonStorageNamespace}
                legacyStorageNamespaces={legacyLessonStorageNamespaces}
                chatMode="lesson"
                title="TCM Lesson Tutor"
                subtitle={tutorSubtitle}
                welcomeMessage={`Ask anything about this lesson${playlistContext ? ` or the ${playlistContext.name} course` : ""}. I’ll search the full TCM library, but I’ll prioritize clips, notes, and lesson guidance closest to what you’re watching right now.`}
                placeholder="Ask about this setup, timestamp, or course..."
                helperText="Global library search, boosted by this lesson context"
                newChatLabel="Reset"
              />
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
