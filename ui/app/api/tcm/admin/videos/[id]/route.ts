import { NextResponse } from 'next/server';
import {
  getVideoById,
  updateVideo,
  deleteVideo,
  getJobByVideoId,
  createJob,
  ensureAdminTables
} from '@/lib/tcm-admin';
import { getVideoArtifactStatus } from '@/lib/tcm-video-artifacts';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tcm/admin/videos/[id] - Get video details with job status
export async function GET(request: Request, context: RouteContext) {
  try {
    ensureAdminTables();
    const { id } = await context.params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const video = getVideoById(videoId);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    // Get latest job for this video
    const job = getJobByVideoId(videoId);
    const artifactStatus = getVideoArtifactStatus(video);

    return NextResponse.json({ video, job, artifactStatus });
  } catch (error) {
    console.error('Error fetching video:', error);
    return NextResponse.json(
      { error: 'Failed to fetch video' },
      { status: 500 }
    );
  }
}

// PATCH /api/tcm/admin/videos/[id] - Update video metadata
export async function PATCH(request: Request, context: RouteContext) {
  try {
    ensureAdminTables();
    const { id } = await context.params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const body = await request.json();
    const { title, description, source_type } = body;

    const success = updateVideo(videoId, {
      ...(title && { title }),
      ...(description && { description }),
      ...(source_type && { source_type })
    });

    if (!success) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const video = getVideoById(videoId);
    return NextResponse.json({ video });
  } catch (error) {
    console.error('Error updating video:', error);
    return NextResponse.json(
      { error: 'Failed to update video' },
      { status: 500 }
    );
  }
}

// DELETE /api/tcm/admin/videos/[id] - Delete video and associated data
export async function DELETE(request: Request, context: RouteContext) {
  try {
    ensureAdminTables();
    const { id } = await context.params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const success = deleteVideo(videoId);
    if (!success) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting video:', error);
    return NextResponse.json(
      { error: 'Failed to delete video' },
      { status: 500 }
    );
  }
}

// POST /api/tcm/admin/videos/[id] - Start/restart processing
export async function POST(request: Request, context: RouteContext) {
  try {
    ensureAdminTables();
    const { id } = await context.params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const video = getVideoById(videoId);
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const {
      whisper_model = 'base',
      frame_interval = 45,
      extraction_mode = 'reflective'
    } = body;

    // Create new job
    const jobId = createJob({
      video_id: videoId,
      job_type: 'manual',
      whisper_model,
      frame_interval,
      extraction_mode
    });

    // Import and start processing
    const { startProcessing } = await import('@/lib/tcm-admin/processor');
    const result = await startProcessing(jobId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, jobId });
  } catch (error) {
    console.error('Error starting processing:', error);
    return NextResponse.json(
      { error: 'Failed to start processing' },
      { status: 500 }
    );
  }
}
