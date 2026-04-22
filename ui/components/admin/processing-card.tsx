'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Film, Loader2, CheckCircle, AlertCircle, PauseCircle, Clock } from 'lucide-react';

interface ProcessingJob {
  id: number;
  video_id: number | null;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  current_step: string | null;
  progress_percent: number;
  checkpoint_type: string | null;
  skills_extracted: number;
  error_message: string | null;
  created_at: string;
}

interface ProcessingCardProps {
  job: ProcessingJob;
  videoTitle?: string;
  onCheckpoint?: () => void;
}

const stepLabels: Record<string, string> = {
  uploaded: 'Upload received',
  extracting: 'Extracting transcript and frames...',
  embedding: 'Generating FAISS embeddings...',
  lesson_building: 'Building lesson guide...',
  ready: 'Lesson ready',
  failed: 'Processing failed',
  transcribe: 'Transcribing audio...',
  frames: 'Extracting frames...',
  embeddings: 'Generating embeddings...',
  analysis: 'Analyzing content...',
  write: 'Writing to database...',
  complete: 'Complete'
};

const statusIcons: Record<string, React.ReactNode> = {
  queued: <Clock className="h-4 w-4 text-muted-foreground" />,
  running: <Loader2 className="h-4 w-4 text-sky-500 animate-spin" />,
  paused: <PauseCircle className="h-4 w-4 text-amber-500" />,
  completed: <CheckCircle className="h-4 w-4 text-emerald-500" />,
  failed: <AlertCircle className="h-4 w-4 text-rose-500" />
};

const statusColors: Record<string, string> = {
  queued: 'bg-muted-foreground/20',
  running: 'bg-sky-500',
  paused: 'bg-amber-500',
  completed: 'bg-emerald-500',
  failed: 'bg-rose-500'
};

export function ProcessingCard({ job, videoTitle, onCheckpoint }: ProcessingCardProps) {
  const stepLabel = job.current_step
    ? stepLabels[job.current_step] || job.current_step.replace(/_/g, ' ')
    : 'Starting...';

  return (
    <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-rose-500/20 flex items-center justify-center">
              <Film className="h-5 w-5 text-rose-500" />
            </div>
            <div>
              <Link
                href={`/tcm/admin/videos/${job.video_id}`}
                className="font-medium hover:text-amber-500 transition-colors"
              >
                {videoTitle || `Video #${job.video_id}`}
              </Link>
              <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                {statusIcons[job.status]}
                <span className="capitalize">{job.status}</span>
                {job.status === 'running' && (
                  <>
                    <span>·</span>
                    <span>{stepLabel}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {job.status === 'paused' && job.checkpoint_type && onCheckpoint && (
            <button
              onClick={onCheckpoint}
              className="px-3 py-1.5 bg-amber-500 text-black text-sm font-medium rounded-lg hover:bg-amber-400 transition-colors"
            >
              Review
            </button>
          )}
        </div>

        {/* Progress Bar */}
        {job.status === 'running' && (
          <div className="space-y-1.5">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${statusColors[job.status]}`}
                style={{ width: `${job.progress_percent}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{stepLabel}</span>
              <span>{job.progress_percent}%</span>
            </div>
          </div>
        )}

        {/* Checkpoint Message */}
        {job.status === 'paused' && job.checkpoint_type && (
          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="text-sm font-medium text-amber-500">
              {job.checkpoint_type === 'intent' && 'Auto-extract skills from this video?'}
              {job.checkpoint_type === 'skills' && 'Review extracted skills'}
              {job.checkpoint_type === 'generation' && 'Generate strategy artifacts?'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Click Review to continue processing
            </div>
          </div>
        )}

        {/* Error Message */}
        {job.status === 'failed' && job.error_message && (
          <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg">
            <div className="text-sm text-rose-500">{job.error_message}</div>
          </div>
        )}

        {/* Completed Message */}
        {job.status === 'completed' && (
          <div className="mt-3 flex items-center gap-2 text-sm text-emerald-500">
            <CheckCircle className="h-4 w-4" />
            <span>
              {job.skills_extracted > 0
                ? `Lesson ready • ${job.skills_extracted} skills extracted`
                : 'Lesson ready'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
