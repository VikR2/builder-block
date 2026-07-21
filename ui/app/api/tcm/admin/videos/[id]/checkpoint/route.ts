import { NextResponse } from 'next/server';
import {
  getJobByVideoId,
  getJobById,
  respondToCheckpoint,
  ensureAdminTables
} from '@/lib/tcm-admin';
import { resumeProcessing } from '@/lib/tcm-admin/processor';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/tcm/admin/videos/[id]/checkpoint - Get checkpoint data for video
export async function GET(request: Request, context: RouteContext) {
  try {
    ensureAdminTables();
    const { id } = await context.params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const job = getJobByVideoId(videoId);
    if (!job) {
      return NextResponse.json({ error: 'No job found for video' }, { status: 404 });
    }

    if (job.status !== 'paused' || !job.checkpoint_type) {
      return NextResponse.json({ error: 'No pending checkpoint' }, { status: 404 });
    }

    return NextResponse.json({
      jobId: job.id,
      checkpointType: job.checkpoint_type,
      checkpointData: job.checkpoint_data ? JSON.parse(job.checkpoint_data) : null,
      currentStep: job.current_step,
      progressPercent: job.progress_percent
    });
  } catch (error) {
    console.error('Error fetching checkpoint:', error);
    return NextResponse.json(
      { error: 'Failed to fetch checkpoint' },
      { status: 500 }
    );
  }
}

// POST /api/tcm/admin/videos/[id]/checkpoint - Respond to checkpoint
export async function POST(request: Request, context: RouteContext) {
  try {
    ensureAdminTables();
    const { id } = await context.params;
    const videoId = parseInt(id);

    if (isNaN(videoId)) {
      return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
    }

    const job = getJobByVideoId(videoId);
    if (!job) {
      return NextResponse.json({ error: 'No job found for video' }, { status: 404 });
    }

    if (job.status !== 'paused' || !job.checkpoint_type) {
      return NextResponse.json({ error: 'No pending checkpoint' }, { status: 404 });
    }

    const body = await request.json();
    const { response } = body;

    if (!response) {
      return NextResponse.json({ error: 'response is required' }, { status: 400 });
    }

    // Store checkpoint response and resume processing
    const result = await resumeProcessing(job.id, response);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, jobId: job.id });
  } catch (error) {
    console.error('Error responding to checkpoint:', error);
    return NextResponse.json(
      { error: 'Failed to respond to checkpoint' },
      { status: 500 }
    );
  }
}
