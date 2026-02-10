import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { PaywallOverlay } from '@/components/paywall';
import Link from 'next/link';
import { ArrowLeft, Play, Clock, BookOpen, ListVideo } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface PlaylistVideo {
  id: number;
  folder_id: string;
  title: string;
  duration_sec: number | null;
  frame_count: number;
  position: number;
}

interface PlaylistDetails {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  is_published: boolean;
  video_count: number;
  total_duration: number;
  videos: PlaylistVideo[];
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${secs}s`;
}

function formatShortDuration(seconds: number | null | undefined): string {
  if (!seconds) return '--:--';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function PlaylistPage({ params }: PageProps) {
  const { slug } = await params;

  // Check authentication and premium status
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirect=/tcm/library/playlists/${slug}`);
  }

  if (!user.isPremium) {
    return <PaywallOverlay
      returnUrl={`/tcm/library/playlists/${slug}`}
      title="Video Courses"
      description="Subscribe to Premium to access all video courses with synchronized transcripts."
    />;
  }

  // Fetch playlist details
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const res = await fetch(`${baseUrl}/api/tcm/library/playlists/${slug}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    notFound();
  }

  const playlist: PlaylistDetails = await res.json();

  if (!playlist.is_published) {
    notFound();
  }

  return (
    <div className="min-h-screen">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-rose-500/5" />
      </div>

      <div className="container py-10 relative z-10">
        <div className="max-w-4xl mx-auto">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
            <Link href="/tcm/library" className="hover:text-foreground transition-colors flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" />
              Video Library
            </Link>
            <span>/</span>
            <span className="text-foreground">{playlist.name}</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 flex items-center justify-center shrink-0">
                <ListVideo className="w-8 h-8 text-amber-500" />
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight mb-2">
                  {playlist.name}
                </h1>
                {playlist.description && (
                  <p className="text-lg text-muted-foreground">
                    {playlist.description}
                  </p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-rose-500" />
                <span>{playlist.video_count} {playlist.video_count === 1 ? 'video' : 'videos'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span>{formatDuration(playlist.total_duration)} total</span>
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-500" />
                <span>{playlist.videos.reduce((acc, v) => acc + v.frame_count, 0)} chapters</span>
              </div>
            </div>
          </div>

          {/* Start Course CTA */}
          {playlist.videos.length > 0 && (
            <Link
              href={`/tcm/library/${playlist.videos[0].folder_id}`}
              className="flex items-center justify-center gap-3 w-full py-4 mb-8 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 text-white font-semibold text-lg hover:from-amber-400 hover:to-rose-400 transition-all shadow-lg shadow-amber-500/20"
            >
              <Play className="w-5 h-5" />
              Start Course
            </Link>
          )}

          {/* Video List */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold mb-4">Course Content</h2>
            {playlist.videos.map((video, index) => (
              <Link
                key={video.id}
                href={`/tcm/library/${video.folder_id}`}
                className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card hover:bg-accent/5 hover:border-amber-500/30 transition-all"
              >
                {/* Position Number */}
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 font-mono text-lg font-semibold text-muted-foreground group-hover:bg-amber-500/20 group-hover:text-amber-500 transition-colors">
                  {index + 1}
                </div>

                {/* Thumbnail Placeholder */}
                <div className="w-24 h-14 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 overflow-hidden">
                  <Play className="w-6 h-6 text-muted-foreground group-hover:text-amber-500 transition-colors" />
                </div>

                {/* Video Info */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground group-hover:text-amber-500 transition-colors truncate">
                    {video.title || `Video ${index + 1}`}
                  </h3>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>{formatShortDuration(video.duration_sec)}</span>
                    <span>•</span>
                    <span>{video.frame_count} chapters</span>
                  </div>
                </div>

                {/* Play Icon */}
                <div className="p-2 rounded-full bg-muted group-hover:bg-amber-500/20 transition-colors">
                  <Play className="w-4 h-4 text-muted-foreground group-hover:text-amber-500 transition-colors" />
                </div>
              </Link>
            ))}
          </div>

          {/* Empty State */}
          {playlist.videos.length === 0 && (
            <div className="text-center py-16 border border-dashed border-border/50 rounded-xl">
              <ListVideo className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">No videos in this course yet</p>
              <Link
                href="/tcm/library"
                className="mt-4 inline-flex items-center gap-2 text-sm text-amber-500 hover:text-amber-400"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Library
              </Link>
            </div>
          )}

          {/* Bottom CTA */}
          {playlist.videos.length > 0 && (
            <div className="mt-12 p-6 rounded-xl bg-gradient-to-r from-amber-500/10 to-rose-500/10 border border-amber-500/20 text-center">
              <h3 className="font-semibold text-lg mb-2">Have Questions?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Use the Knowledge Bot to ask questions about any concept from this course
              </p>
              <Link
                href="/tcm"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-background font-medium rounded-lg hover:bg-amber-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Ask Knowledge Bot
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
