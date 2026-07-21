import { NextResponse } from 'next/server';
import {
  getActiveJobs,
  getPendingCheckpoints,
  getAllJobs,
  getJobById,
  ensureAdminTables,
  processNextJob,
  startProcessing
} from '@/lib/tcm-admin';

// GET /api/tcm/admin/queue - Get queue status
export async function GET(request: Request) {
  try {
    ensureAdminTables();

    const { searchParams } = new URL(request.url);
    const showAll = searchParams.get('all') === 'true';
    const jobId = searchParams.get('id');

    // Get specific job
    if (jobId) {
      const id = parseInt(jobId);
      if (isNaN(id)) {
        return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
      }
      const job = getJobById(id);
      if (!job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      return NextResponse.json({ job });
    }

    // Get all or active jobs
    const jobs = showAll ? getAllJobs() : getActiveJobs();
    const pendingCheckpoints = getPendingCheckpoints();

    // Categorize jobs
    const running = jobs.filter(j => j.status === 'running');
    const queued = jobs.filter(j => j.status === 'queued');
    const paused = jobs.filter(j => j.status === 'paused');
    const recent = showAll
      ? jobs.filter(j => j.status === 'completed' || j.status === 'failed').slice(0, 10)
      : [];

    return NextResponse.json({
      running,
      queued,
      paused,
      recent,
      pendingCheckpoints,
      counts: {
        running: running.length,
        queued: queued.length,
        paused: paused.length,
        pending: pendingCheckpoints.length
      }
    });
  } catch (error) {
    console.error('Error fetching queue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch queue' },
      { status: 500 }
    );
  }
}

// POST /api/tcm/admin/queue - Trigger processing
export async function POST(request: Request) {
  try {
    ensureAdminTables();

    const body = await request.json().catch(() => ({}));
    const jobId = body.jobId;

    // If specific job ID provided, start that job
    if (jobId) {
      const id = parseInt(jobId);
      if (isNaN(id)) {
        return NextResponse.json({ error: 'Invalid job ID' }, { status: 400 });
      }
      const result = await startProcessing(id);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ success: true, jobId: id, message: 'Processing started' });
    }

    // Otherwise, process next queued job
    const result = await processNextJob();
    if (result.started) {
      return NextResponse.json({
        success: true,
        jobId: result.jobId,
        message: `Started processing job ${result.jobId}`
      });
    }

    return NextResponse.json({
      success: false,
      message: 'No queued jobs to process'
    });
  } catch (error) {
    console.error('Error triggering processing:', error);
    return NextResponse.json(
      { error: 'Failed to trigger processing' },
      { status: 500 }
    );
  }
}
