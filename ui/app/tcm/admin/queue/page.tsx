'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  ListOrdered,
  Play,
  PauseCircle,
  CheckCircle,
  AlertCircle,
  Clock
} from 'lucide-react';
import { ProcessingCard } from '@/components/admin/processing-card';
import { CheckpointIntent } from '@/components/admin/checkpoint-intent';
import { CheckpointSkills } from '@/components/admin/checkpoint-skills';

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
  completed_at: string | null;
}

interface QueueData {
  running: ProcessingJob[];
  queued: ProcessingJob[];
  paused: ProcessingJob[];
  recent: ProcessingJob[];
  pendingCheckpoints: ProcessingJob[];
  counts: {
    running: number;
    queued: number;
    paused: number;
    pending: number;
  };
}

export default function QueuePage() {
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCheckpoint, setActiveCheckpoint] = useState<ProcessingJob | null>(null);
  const [filter, setFilter] = useState<'active' | 'history'>('active');

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/tcm/admin/queue?all=true');
      if (res.ok) {
        const data = await res.json();
        setQueue(data);
      }
    } catch (error) {
      console.error('Error fetching queue:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();

    // Set up SSE for real-time updates
    const eventSource = new EventSource('/api/tcm/admin/status/stream');

    eventSource.onmessage = () => {
      fetchQueue();
    };

    eventSource.onerror = () => {
      setTimeout(() => eventSource.close(), 5000);
    };

    return () => eventSource.close();
  }, [fetchQueue]);

  const handleCheckpointResponse = async (jobId: number, response: object) => {
    const job = queue?.pendingCheckpoints.find(j => j.id === jobId);
    if (!job || !job.video_id) return;

    try {
      const res = await fetch(`/api/tcm/admin/videos/${job.video_id}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response })
      });

      if (res.ok) {
        setActiveCheckpoint(null);
        fetchQueue();
      }
    } catch (error) {
      console.error('Error responding to checkpoint:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const activeJobs = [...(queue?.running || []), ...(queue?.queued || []), ...(queue?.paused || [])];
  const historyJobs = queue?.recent || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Processing Queue</h1>
          <p className="text-muted-foreground">
            {queue?.counts.running || 0} running • {queue?.counts.queued || 0} queued • {queue?.counts.pending || 0} waiting
          </p>
        </div>
        <button
          onClick={fetchQueue}
          className="flex items-center gap-2 px-4 py-2 border border-border bg-card rounded-lg hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card">
          <div className="h-10 w-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <Play className="h-5 w-5 text-sky-500" />
          </div>
          <div>
            <div className="text-2xl font-bold">{queue?.counts.running || 0}</div>
            <div className="text-xs text-muted-foreground">Running</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Clock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <div className="text-2xl font-bold">{queue?.counts.queued || 0}</div>
            <div className="text-xs text-muted-foreground">Queued</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card">
          <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <PauseCircle className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <div className="text-2xl font-bold">{queue?.counts.pending || 0}</div>
            <div className="text-xs text-muted-foreground">Waiting</div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card">
          <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl font-bold">{historyJobs.filter(j => j.status === 'completed').length}</div>
            <div className="text-xs text-muted-foreground">Completed</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 p-1 bg-card border border-border/50 rounded-lg w-fit">
        <button
          onClick={() => setFilter('active')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${
            filter === 'active'
              ? 'bg-amber-500 text-black font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Active ({activeJobs.length})
        </button>
        <button
          onClick={() => setFilter('history')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${
            filter === 'history'
              ? 'bg-amber-500 text-black font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          History ({historyJobs.length})
        </button>
      </div>

      {/* Job List */}
      {filter === 'active' ? (
        <div className="space-y-4">
          {activeJobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ListOrdered className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No active jobs</p>
              <Link href="/tcm/admin/upload" className="text-amber-500 hover:underline text-sm mt-1 inline-block">
                Upload a video to get started
              </Link>
            </div>
          ) : (
            <>
              {/* Running */}
              {queue?.running && queue.running.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-sky-500 flex items-center gap-2">
                    <Play className="h-4 w-4" />
                    Running
                  </h3>
                  {queue.running.map((job) => (
                    <ProcessingCard
                      key={job.id}
                      job={job}
                      videoTitle={`Video #${job.video_id}`}
                    />
                  ))}
                </div>
              )}

              {/* Paused (Checkpoints) */}
              {queue?.paused && queue.paused.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-amber-500 flex items-center gap-2">
                    <PauseCircle className="h-4 w-4" />
                    Waiting for Input
                  </h3>
                  {queue.paused.map((job) => (
                    <ProcessingCard
                      key={job.id}
                      job={job}
                      videoTitle={`Video #${job.video_id}`}
                      onCheckpoint={() => setActiveCheckpoint(job)}
                    />
                  ))}
                </div>
              )}

              {/* Queued */}
              {queue?.queued && queue.queued.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Queued
                  </h3>
                  {queue.queued.map((job) => (
                    <ProcessingCard
                      key={job.id}
                      job={job}
                      videoTitle={`Video #${job.video_id}`}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {historyJobs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No processing history yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {historyJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center gap-4 p-4 rounded-lg border border-border/50 bg-card"
                >
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    job.status === 'completed' ? 'bg-emerald-500/20' : 'bg-rose-500/20'
                  }`}>
                    {job.status === 'completed' ? (
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-rose-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <Link
                      href={`/tcm/admin/videos/${job.video_id}`}
                      className="font-medium hover:text-amber-500 transition-colors"
                    >
                      Video #{job.video_id}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {job.status === 'completed'
                        ? `${job.skills_extracted} skills extracted`
                        : job.error_message || 'Failed'}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {job.completed_at && new Date(job.completed_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Checkpoint Modal */}
      {activeCheckpoint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl">
            {activeCheckpoint.checkpoint_type === 'intent' && (
              <CheckpointIntent
                videoTitle={`Video #${activeCheckpoint.video_id}`}
                onRespond={(response) => handleCheckpointResponse(activeCheckpoint.id, response)}
                onClose={() => setActiveCheckpoint(null)}
              />
            )}
            {activeCheckpoint.checkpoint_type === 'skills' && activeCheckpoint.checkpoint_data && (
              <CheckpointSkills
                videoTitle={`Video #${activeCheckpoint.video_id}`}
                skills={JSON.parse(activeCheckpoint.checkpoint_data).skills || []}
                onRespond={(response) => handleCheckpointResponse(activeCheckpoint.id, response)}
                onClose={() => setActiveCheckpoint(null)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
