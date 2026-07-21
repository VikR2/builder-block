import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, BookOpen, Clock, PlayCircle } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { PaywallOverlay } from '@/components/paywall';
import { getPublishedReadyVideoByFolderId } from '@/lib/tcm-admin/db';
import { isLessonPresentationReady, readVideoLesson } from '@/lib/tcm-lessons';
import { resolveVideoDirectory } from '@/lib/tcm-video-artifacts';
import { formatTimestamp, getVideoDetails, resolveVideoId } from '@/lib/tcm-library';

export const dynamic = 'force-dynamic';

interface LessonPageProps {
  params: Promise<{ videoId: string }>;
}

export default async function LessonPage({ params }: LessonPageProps) {
  const { videoId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirect=/tcm/library/${videoId}/lesson`);
  }

  if (!user.isPremium) {
    return (
      <PaywallOverlay
        returnUrl={`/tcm/library/${videoId}/lesson`}
        title="Premium Lesson Guide"
        description="Subscribe to Premium to access lesson guides, timestamped notes, and linked video explanations."
      />
    );
  }

  const resolvedId = resolveVideoId(videoId);
  if (!resolvedId) {
    notFound();
  }

  const video = getPublishedReadyVideoByFolderId(resolvedId);
  const details = await getVideoDetails(resolvedId);
  const videoDir = video ? resolveVideoDirectory(video) : null;
  const lesson = videoDir ? readVideoLesson(videoDir) : null;

  if (!video || !details || !lesson) {
    notFound();
  }

  const showFullGuide = isLessonPresentationReady(lesson);
  const displayedSections = showFullGuide ? lesson.sections : lesson.sections.slice(0, 3);

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-rose-500/5" />
      </div>

      <div className="container relative z-10 py-10">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link
                href={`/tcm/library/${encodeURIComponent(resolvedId)}`}
                className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to video
              </Link>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
                  <BookOpen className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Lesson guide</p>
                  <h1 className="text-3xl font-bold tracking-tight">{details.title}</h1>
                </div>
              </div>
              <p className="max-w-3xl text-lg text-muted-foreground">{lesson.summary}</p>
              {!showFullGuide && (
                <div className="mt-4 max-w-3xl rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
                  This guide is still being refined. You can use the transcript-backed overview and recommended moments below, but we are not treating this lesson page as the final authoritative teaching guide yet.
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/tcm/library/${encodeURIComponent(resolvedId)}`}
                className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                <PlayCircle className="h-4 w-4 text-rose-500" />
                Watch lesson
              </Link>
            </div>
          </div>

          {showFullGuide && (
            <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-2xl border border-border/50 bg-card p-6">
                <h2 className="mb-4 text-lg font-semibold">Key Takeaways</h2>
                <ul className="space-y-3">
                  {lesson.keyTakeaways.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm leading-6 text-foreground/90">
                      <span className="mt-2 h-2 w-2 rounded-full bg-amber-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-2xl border border-border/50 bg-card p-6">
                <h2 className="mb-4 text-lg font-semibold">Suggested Questions</h2>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  {lesson.suggestedQuestions.map((question) => (
                    <li key={question} className="rounded-xl border border-border/30 bg-background/50 px-4 py-3">
                      {question}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          <section className="rounded-2xl border border-border/50 bg-card p-6">
            <div className="mb-5 flex items-center gap-2">
              <Clock className="h-4 w-4 text-rose-500" />
              <h2 className="text-lg font-semibold">Recommended Moments</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {lesson.recommendedMoments.map((moment) => (
                <Link
                  key={`${moment.timestamp}-${moment.title}`}
                  href={`/tcm/library/${encodeURIComponent(resolvedId)}?t=${Math.floor(moment.timestamp)}`}
                  className="rounded-xl border border-border/40 bg-background/50 p-4 hover:border-amber-500/40 hover:bg-accent/5 transition-colors"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-foreground">{moment.title}</span>
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500">
                      {moment.timestampLabel || formatTimestamp(moment.timestamp)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{moment.reason}</p>
                </Link>
              ))}
            </div>
          </section>

          <section className="space-y-5">
            {displayedSections.map((section) => (
              <article key={`${section.title}-${section.startTime}`} className="rounded-2xl border border-border/50 bg-card p-6">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold">{section.title}</h2>
                  <Link
                    href={`/tcm/library/${encodeURIComponent(resolvedId)}?t=${Math.floor(section.startTime)}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-500 hover:bg-rose-500/20 transition-colors"
                  >
                    <PlayCircle className="h-3.5 w-3.5" />
                    {section.timestampLabel || formatTimestamp(section.startTime)}
                  </Link>
                </div>
                <div className="space-y-4 text-sm leading-7 text-foreground/90">
                  <p>{section.summary}</p>
                  <p className="text-muted-foreground">{showFullGuide ? section.citation : `Transcript-backed note · ${section.citation}`}</p>
                  {section.transcriptExcerpt && (
                    <blockquote className="border-l-2 border-amber-500/40 pl-4 italic text-muted-foreground">
                      {section.transcriptExcerpt}
                    </blockquote>
                  )}
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
