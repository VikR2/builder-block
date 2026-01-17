import { VideoGrid } from '@/components/tcm/video-grid';
import { getLibraryVideos } from '@/lib/tcm-library';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const videos = await getLibraryVideos();
  const totalMinutes = Math.round(videos.reduce((acc, v) => acc + v.duration, 0) / 60);
  const totalChapters = videos.reduce((acc, v) => acc + v.frameCount, 0);

  return (
    <div className="min-h-screen">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 via-transparent to-amber-500/5" />
      </div>

      <div className="container py-10 relative z-10">
        <div className="flex flex-col gap-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Link
                  href="/"
                  className="p-2 rounded-lg hover:bg-muted transition-colors"
                  title="Back to Home"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                </Link>
                <h1 className="text-4xl font-bold tracking-tight">
                  Video Courses
                </h1>
              </div>
              <p className="text-lg text-muted-foreground">
                Master trading concepts with curated video lessons
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <svg className="w-5 h-5 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span className="text-sm font-medium text-rose-500">TCM Original Content</span>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-rose-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{videos.length}</h3>
                  <p className="text-sm text-muted-foreground">{videos.length === 1 ? 'Video' : 'Videos'} Available</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{totalMinutes}</h3>
                  <p className="text-sm text-muted-foreground">Minutes of Content</p>
                </div>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{totalChapters}</h3>
                  <p className="text-sm text-muted-foreground">Chapters & Topics</p>
                </div>
              </div>
            </div>
          </div>

          {/* Section Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">All Courses</h2>
              <p className="text-muted-foreground text-sm">Click any video to start learning with chapter navigation</p>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Synchronized transcripts</span>
            </div>
          </div>

          {/* Video Grid */}
          <VideoGrid videos={videos} />

          {/* Bottom CTA */}
          {videos.length > 0 && (
            <div className="mt-8 p-6 rounded-xl bg-gradient-to-r from-amber-500/10 to-rose-500/10 border border-amber-500/20 text-center">
              <h3 className="font-semibold text-lg mb-2">Ready to Learn More?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Use the Knowledge Bot to ask questions about any concept from these videos
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
