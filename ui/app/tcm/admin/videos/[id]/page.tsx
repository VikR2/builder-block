'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Film,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Play,
  Trash2,
  ExternalLink,
  FileText,
  Image,
  Database,
  Sparkles
} from 'lucide-react';
import { ProcessingCard } from '@/components/admin/processing-card';
import { CheckpointIntent } from '@/components/admin/checkpoint-intent';
import { CheckpointSkills } from '@/components/admin/checkpoint-skills';

interface ProcessedVideo {
  id: number;
  filename: string;
  file_path: string;
  file_hash: string | null;
  file_size_bytes: number | null;
  duration_sec: number | null;
  frame_count: number | null;
  resolution: string | null;
  transcript_method: string | null;
  whisper_model: string | null;
  transcript_path: string | null;
  skills_extracted: number;
  sad_path: string | null;
  pine_path: string | null;
  processing_status: string;
  error_message: string | null;
  title: string | null;
  description: string | null;
  source_type: string | null;
  created_at: string;
  updated_at: string | null;
  processed_at: string | null;
}

interface ProcessingJob {
  id: number;
  video_id: number | null;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  current_step: string | null;
  progress_percent: number;
  checkpoint_type: string | null;
  checkpoint_data: string | null;
  skills_extracted: number;
  error_message: string | null;
  created_at: string;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Unknown';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return 'Unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString();
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-5 w-5 text-muted-foreground" />,
  processing: <Loader2 className="h-5 w-5 text-sky-500 animate-spin" />,
  completed: <CheckCircle className="h-5 w-5 text-emerald-500" />,
  failed: <AlertCircle className="h-5 w-5 text-rose-500" />
};

export default function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [video, setVideo] = useState<ProcessedVideo | null>(null);
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCheckpoint, setShowCheckpoint] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tcm/admin/videos/${resolvedParams.id}`);
      if (res.ok) {
        const data = await res.json();
        setVideo(data.video);
        setJob(data.job);
      } else if (res.status === 404) {
        router.push('/tcm/admin/videos');
      }
    } catch (error) {
      console.error('Error fetching video:', error);
    } finally {
      setIsLoading(false);
    }
  }, [resolvedParams.id, router]);

  useEffect(() => {
    fetchData();

    // Poll for updates if processing
    const interval = setInterval(() => {
      if (job?.status === 'running' || job?.status === 'queued') {
        fetchData();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchData, job?.status]);

  const handleReprocess = async () => {
    if (!confirm('Start processing this video again?')) return;
    setIsProcessing(true);

    try {
      const res = await fetch(`/api/tcm/admin/videos/${resolvedParams.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error reprocessing:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this video and all associated data?')) return;

    try {
      const res = await fetch(`/api/tcm/admin/videos/${resolvedParams.id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        router.push('/tcm/admin/videos');
      }
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  const handleCheckpointResponse = async (response: object) => {
    try {
      const res = await fetch(`/api/tcm/admin/videos/${resolvedParams.id}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response })
      });

      if (res.ok) {
        setShowCheckpoint(false);
        fetchData();
      }
    } catch (error) {
      console.error('Error responding to checkpoint:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Video not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/tcm/admin/videos"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Videos
          </Link>
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-xl bg-rose-500/20 flex items-center justify-center">
              <Film className="h-7 w-7 text-rose-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{video.title || video.filename}</h1>
              <div className="flex items-center gap-2 text-muted-foreground">
                {statusIcons[video.processing_status]}
                <span className="capitalize">{video.processing_status}</span>
                {video.skills_extracted > 0 && (
                  <>
                    <span>·</span>
                    <span>{video.skills_extracted} skills</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {video.processing_status === 'completed' && (
            <Link
              href={`/tcm/library/${video.id}`}
              className="flex items-center gap-2 px-4 py-2 border border-border bg-card text-foreground rounded-lg hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              View in Library
            </Link>
          )}
          <button
            onClick={handleReprocess}
            disabled={isProcessing || job?.status === 'running'}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {job?.status === 'running' ? 'Processing...' : 'Reprocess'}
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 border border-rose-500/50 text-rose-500 rounded-lg hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Active Job */}
      {job && (job.status === 'running' || job.status === 'queued' || job.status === 'paused') && (
        <ProcessingCard
          job={job}
          videoTitle={video.title || video.filename}
          onCheckpoint={() => setShowCheckpoint(true)}
        />
      )}

      {/* Error Message */}
      {video.error_message && (
        <div className="p-4 rounded-xl border border-rose-500/50 bg-rose-500/10">
          <div className="flex items-center gap-2 text-rose-500 font-medium mb-1">
            <AlertCircle className="h-5 w-5" />
            Error
          </div>
          <p className="text-sm text-muted-foreground">{video.error_message}</p>
        </div>
      )}

      {/* Info Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* File Info */}
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Film className="h-5 w-5 text-rose-500" />
            File Information
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Filename</dt>
              <dd className="font-mono text-xs truncate max-w-[200px]">{video.filename}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">File Size</dt>
              <dd>{formatFileSize(video.file_size_bytes)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Duration</dt>
              <dd>{formatDuration(video.duration_sec)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Resolution</dt>
              <dd>{video.resolution || 'Unknown'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Hash</dt>
              <dd className="font-mono text-xs truncate max-w-[150px]">{video.file_hash || 'N/A'}</dd>
            </div>
          </dl>
        </div>

        {/* Processing Info */}
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Database className="h-5 w-5 text-sky-500" />
            Processing Details
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="capitalize">{video.processing_status}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Transcript Method</dt>
              <dd>{video.transcript_method || 'None'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Whisper Model</dt>
              <dd>{video.whisper_model || 'N/A'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Frame Count</dt>
              <dd>{video.frame_count || 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Skills Extracted</dt>
              <dd className="text-emerald-500">{video.skills_extracted}</dd>
            </div>
          </dl>
        </div>

        {/* Timestamps */}
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-500" />
            Timestamps
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Uploaded</dt>
              <dd>{formatDate(video.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Last Updated</dt>
              <dd>{formatDate(video.updated_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Processed</dt>
              <dd>{formatDate(video.processed_at)}</dd>
            </div>
          </dl>
        </div>

        {/* Generated Files */}
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-500" />
            Generated Files
          </h2>
          <div className="space-y-2">
            <div className={`flex items-center gap-2 p-2 rounded-lg ${video.transcript_path ? 'bg-emerald-500/10' : 'bg-muted/20'}`}>
              <FileText className={`h-4 w-4 ${video.transcript_path ? 'text-emerald-500' : 'text-muted-foreground'}`} />
              <span className="text-sm">Transcript</span>
              {video.transcript_path ? (
                <CheckCircle className="h-4 w-4 text-emerald-500 ml-auto" />
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground ml-auto" />
              )}
            </div>
            <div className={`flex items-center gap-2 p-2 rounded-lg ${video.frame_count ? 'bg-emerald-500/10' : 'bg-muted/20'}`}>
              <Image className={`h-4 w-4 ${video.frame_count ? 'text-emerald-500' : 'text-muted-foreground'}`} />
              <span className="text-sm">Frames ({video.frame_count || 0})</span>
              {video.frame_count ? (
                <CheckCircle className="h-4 w-4 text-emerald-500 ml-auto" />
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground ml-auto" />
              )}
            </div>
            <div className={`flex items-center gap-2 p-2 rounded-lg ${video.skills_extracted > 0 ? 'bg-emerald-500/10' : 'bg-muted/20'}`}>
              <Sparkles className={`h-4 w-4 ${video.skills_extracted > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`} />
              <span className="text-sm">Skills ({video.skills_extracted})</span>
              {video.skills_extracted > 0 ? (
                <CheckCircle className="h-4 w-4 text-emerald-500 ml-auto" />
              ) : (
                <Clock className="h-4 w-4 text-muted-foreground ml-auto" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Checkpoint Modal */}
      {showCheckpoint && job?.checkpoint_type && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl">
            {job.checkpoint_type === 'intent' && (
              <CheckpointIntent
                videoTitle={video.title || video.filename}
                onRespond={handleCheckpointResponse}
                onClose={() => setShowCheckpoint(false)}
              />
            )}
            {job.checkpoint_type === 'skills' && job.checkpoint_data && (
              <CheckpointSkills
                videoTitle={video.title || video.filename}
                skills={JSON.parse(job.checkpoint_data).skills || []}
                onRespond={handleCheckpointResponse}
                onClose={() => setShowCheckpoint(false)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
