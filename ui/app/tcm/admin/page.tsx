'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Video,
  ListOrdered,
  AlertCircle,
  Sparkles,
  CheckCircle,
  Plus,
  RefreshCw
} from 'lucide-react';
import { StatsCard } from '@/components/admin/stats-card';
import { ProcessingCard } from '@/components/admin/processing-card';
import { ActivityFeed } from '@/components/admin/activity-feed';
import { CheckpointIntent } from '@/components/admin/checkpoint-intent';
import { CheckpointSkills } from '@/components/admin/checkpoint-skills';

interface AdminStats {
  totalVideos: number;
  queuedJobs: number;
  runningJobs: number;
  pendingCheckpoints: number;
  totalSkills: number;
  completedToday: number;
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

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [queue, setQueue] = useState<QueueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCheckpoint, setActiveCheckpoint] = useState<ProcessingJob | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [videosRes, queueRes] = await Promise.all([
        fetch('/api/tcm/admin/videos?stats=true'),
        fetch('/api/tcm/admin/queue?all=true')
      ]);

      if (videosRes.ok) {
        const data = await videosRes.json();
        setStats(data.stats);
      }

      if (queueRes.ok) {
        const data = await queueRes.json();
        setQueue(data);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Set up SSE for real-time updates
    const eventSource = new EventSource('/api/tcm/admin/status/stream');

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'progress' || data.type === 'init' || data.type === 'heartbeat') {
        // Refresh data on updates
        fetchData();
      }
    };

    eventSource.onerror = () => {
      // Reconnect after a delay
      setTimeout(() => {
        eventSource.close();
      }, 5000);
    };

    return () => {
      eventSource.close();
    };
  }, [fetchData]);

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
        fetchData();
      }
    } catch (error) {
      console.error('Error responding to checkpoint:', error);
    }
  };

  // Build activity items from recent jobs
  const activityItems = (queue?.recent || []).map((job) => ({
    id: job.id,
    type: job.status as 'completed' | 'failed',
    title: `Video #${job.video_id}`,
    subtitle: job.status === 'completed'
      ? `${job.skills_extracted} skills extracted`
      : job.error_message || 'Processing failed',
    videoId: job.video_id || undefined,
    timestamp: job.created_at
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Manage your video processing pipeline</p>
        </div>
        <Link
          href="/tcm/admin/upload"
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black font-medium rounded-lg hover:bg-amber-400 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Upload Video
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          label="Total Videos"
          value={stats?.totalVideos || 0}
          icon={Video}
          color="rose"
        />
        <StatsCard
          label="In Queue"
          value={(stats?.queuedJobs || 0) + (stats?.runningJobs || 0)}
          icon={ListOrdered}
          color="sky"
          subtitle={stats?.runningJobs ? `${stats.runningJobs} processing` : undefined}
        />
        <StatsCard
          label="Needs Attention"
          value={stats?.pendingCheckpoints || 0}
          icon={AlertCircle}
          color="amber"
        />
        <StatsCard
          label="Total Skills"
          value={stats?.totalSkills || 0}
          icon={Sparkles}
          color="emerald"
          subtitle={stats?.completedToday ? `+${stats.completedToday} today` : undefined}
        />
      </div>

      {/* Active Processing */}
      {queue && (queue.running.length > 0 || queue.queued.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Active Processing</h2>
            <Link href="/tcm/admin/queue" className="text-sm text-amber-500 hover:underline">
              View All
            </Link>
          </div>
          <div className="grid gap-3">
            {queue.running.map((job) => (
              <ProcessingCard
                key={job.id}
                job={job}
                videoTitle={`Video #${job.video_id}`}
              />
            ))}
            {queue.queued.slice(0, 2).map((job) => (
              <ProcessingCard
                key={job.id}
                job={job}
                videoTitle={`Video #${job.video_id}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Needs Attention */}
      {queue && queue.pendingCheckpoints.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Needs Attention
            </h2>
          </div>
          <div className="grid gap-3">
            {queue.pendingCheckpoints.map((job) => (
              <ProcessingCard
                key={job.id}
                job={job}
                videoTitle={`Video #${job.video_id}`}
                onCheckpoint={() => setActiveCheckpoint(job)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Completed */}
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              Recent Activity
            </h2>
          </div>
          <ActivityFeed items={activityItems} maxItems={5} />
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <h2 className="font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Link
              href="/tcm/admin/upload"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Plus className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <div className="font-medium">Upload New Video</div>
                <div className="text-xs text-muted-foreground">Add videos for processing</div>
              </div>
            </Link>
            <Link
              href="/tcm/admin/videos"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-rose-500/20 flex items-center justify-center">
                <Video className="h-5 w-5 text-rose-500" />
              </div>
              <div>
                <div className="font-medium">Browse Videos</div>
                <div className="text-xs text-muted-foreground">View all uploaded videos</div>
              </div>
            </Link>
            <Link
              href="/tcm/library"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <div className="font-medium">View Library</div>
                <div className="text-xs text-muted-foreground">Browse processed content</div>
              </div>
            </Link>
          </div>
        </div>
      </div>

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
