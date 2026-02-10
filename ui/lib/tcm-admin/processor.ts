import { spawn, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { EventEmitter } from 'events';
import {
  getJobById,
  updateJob,
  addProcessingEvent,
  getVideoById,
  updateVideo,
  ProcessingJob
} from './db';
import { resetFAISSCache } from '../tcm-faiss.server';

const SCRIPTS_PATH = join(process.cwd(), '..', 'scripts');

// Helper function to generate FAISS embeddings with proper error handling
async function generateEmbeddings(videoDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', [
      join(SCRIPTS_PATH, 'embed_transcripts.py')
    ], {
      cwd: join(process.cwd(), '..'),
      env: { ...process.env }
    });

    let stderr = '';
    proc.stderr?.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Embedding process exited with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}

// Global process registry for active jobs
const activeProcesses: Map<number, ChildProcess> = new Map();

// Event emitter for broadcasting progress updates
export const processingEvents = new EventEmitter();
processingEvents.setMaxListeners(100); // Allow many SSE connections

export interface ProgressUpdate {
  jobId: number;
  videoId: number | null;
  status: string;
  currentStep: string;
  progressPercent: number;
  message?: string;
  checkpointType?: string;
  checkpointData?: object;
  error?: string;
}

// Broadcast progress update to all listeners
function broadcastProgress(update: ProgressUpdate) {
  processingEvents.emit('progress', update);
  addProcessingEvent(update.jobId, 'progress', update);
}

// Start processing a job
export async function startProcessing(jobId: number): Promise<{ success: boolean; error?: string }> {
  const job = getJobById(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  if (job.status === 'running') {
    return { success: false, error: 'Job is already running' };
  }

  const video = job.video_id ? getVideoById(job.video_id) : null;
  if (!video) {
    return { success: false, error: 'Video not found' };
  }

  // Update job status to running
  updateJob(jobId, {
    status: 'running',
    started_at: new Date().toISOString(),
    current_step: 'transcribe',
    progress_percent: 0
  });

  // Update video status
  updateVideo(video.id, { processing_status: 'processing' });

  broadcastProgress({
    jobId,
    videoId: video.id,
    status: 'running',
    currentStep: 'transcribe',
    progressPercent: 0,
    message: 'Starting processing...'
  });

  // Spawn Python processing script
  // Use system Python directly (faster-whisper is installed there)
  // Don't use 'uv run' as it tries to install openai-whisper which has numba compatibility issues
  try {
    // Use the video's directory (where it was uploaded) instead of parent directory
    // This ensures frames are extracted to the same folder as the video file
    const videoDir = dirname(video.file_path);

    const pythonProcess = spawn('python', [
      join(SCRIPTS_PATH, 'process_local_mp4.py'),
      video.file_path,  // positional argument, not --video-path
      '--output-dir', videoDir,  // Use video's actual directory
      '--whisper-model', job.whisper_model,
      '--frame-interval', job.frame_interval.toString(),
      '--json'  // Output JSON for progress parsing
    ], {
      cwd: join(process.cwd(), '..'),
      env: { ...process.env }
    });

    activeProcesses.set(jobId, pythonProcess);

    // Handle stdout (progress updates as JSON lines)
    let buffer = '';
    pythonProcess.stdout?.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim().startsWith('{')) {
          try {
            const update = JSON.parse(line.trim());
            handleProgressUpdate(jobId, video.id, update);
          } catch {
            // Not JSON, log as message
            addProcessingEvent(jobId, 'log', { message: line.trim() });
          }
        }
      }
    });

    // Handle stderr
    pythonProcess.stderr?.on('data', (data: Buffer) => {
      const message = data.toString().trim();
      console.error(`[Job ${jobId}] stderr:`, message);
      addProcessingEvent(jobId, 'log', { message, level: 'error' });
    });

    // Handle process exit
    pythonProcess.on('close', (code: number | null) => {
      activeProcesses.delete(jobId);

      if (code === 0) {
        // Check if job was paused for checkpoint
        const currentJob = getJobById(jobId);
        if (currentJob?.status !== 'paused') {
          // VERIFY manifest.json was created before marking complete
          const manifestPath = join(videoDir, 'manifest.json');
          if (!existsSync(manifestPath)) {
            // Processing "succeeded" but didn't produce expected output
            updateJob(jobId, {
              status: 'failed',
              error_message: 'Processing completed but manifest.json was not created'
            });
            updateVideo(video.id, {
              processing_status: 'failed',
              error_message: 'Missing manifest.json after processing'
            });
            broadcastProgress({
              jobId,
              videoId: video.id,
              status: 'failed',
              currentStep: 'error',
              progressPercent: 0,
              error: 'Processing completed but manifest.json was not created'
            });
            return;
          }

          updateJob(jobId, {
            status: 'completed',
            completed_at: new Date().toISOString(),
            progress_percent: 100
          });
          updateVideo(video.id, {
            processing_status: 'completed',
            processed_at: new Date().toISOString()
          });
          broadcastProgress({
            jobId,
            videoId: video.id,
            status: 'completed',
            currentStep: 'complete',
            progressPercent: 100,
            message: 'Processing complete'
          });

          // Generate FAISS embeddings for semantic search (async, non-blocking for job status)
          (async () => {
            addProcessingEvent(jobId, 'log', { message: 'Generating FAISS embeddings...', level: 'info' });
            try {
              await generateEmbeddings(videoDir);

              // Verify embeddings were created
              const embeddingsPath = join(videoDir, 'embeddings.faiss');
              if (existsSync(embeddingsPath)) {
                addProcessingEvent(jobId, 'log', { message: 'FAISS embeddings generated successfully', level: 'info' });
                // Reset FAISS cache so new embeddings are discoverable
                resetFAISSCache();
              } else {
                addProcessingEvent(jobId, 'log', { message: 'FAISS embeddings file not created', level: 'warn' });
              }
            } catch (embedError) {
              // Non-blocking - log but don't fail the job
              addProcessingEvent(jobId, 'log', {
                message: `FAISS embedding failed: ${embedError instanceof Error ? embedError.message : 'Unknown error'}`,
                level: 'warn'
              });
            }
          })();
        }
      } else {
        const currentJob = getJobById(jobId);
        if (currentJob?.status !== 'paused') {
          updateJob(jobId, {
            status: 'failed',
            error_message: `Process exited with code ${code}`
          });
          updateVideo(video.id, {
            processing_status: 'failed',
            error_message: `Process exited with code ${code}`
          });
          broadcastProgress({
            jobId,
            videoId: video.id,
            status: 'failed',
            currentStep: 'error',
            progressPercent: 0,
            error: `Process exited with code ${code}`
          });
        }
      }
    });

    pythonProcess.on('error', (err: Error) => {
      activeProcesses.delete(jobId);
      updateJob(jobId, {
        status: 'failed',
        error_message: err.message
      });
      updateVideo(video.id, {
        processing_status: 'failed',
        error_message: err.message
      });
      broadcastProgress({
        jobId,
        videoId: video.id,
        status: 'failed',
        currentStep: 'error',
        progressPercent: 0,
        error: err.message
      });
    });

    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to start process';
    updateJob(jobId, { status: 'failed', error_message: errorMsg });
    updateVideo(video.id, { processing_status: 'failed', error_message: errorMsg });
    return { success: false, error: errorMsg };
  }
}

// Handle progress update from Python script
function handleProgressUpdate(jobId: number, videoId: number, update: {
  step?: string;
  progress?: number;
  message?: string;
  checkpoint?: {
    type: string;
    data: object;
  };
  skills_extracted?: number;
  error?: string;
}) {
  if (update.checkpoint) {
    // Pause job for checkpoint
    updateJob(jobId, {
      status: 'paused',
      checkpoint_type: update.checkpoint.type,
      checkpoint_data: JSON.stringify(update.checkpoint.data)
    });

    broadcastProgress({
      jobId,
      videoId,
      status: 'paused',
      currentStep: update.step || 'checkpoint',
      progressPercent: update.progress || 0,
      message: update.message || 'Waiting for user input',
      checkpointType: update.checkpoint.type,
      checkpointData: update.checkpoint.data
    });
  } else if (update.error) {
    updateJob(jobId, {
      status: 'failed',
      error_message: update.error
    });
    updateVideo(videoId, {
      processing_status: 'failed',
      error_message: update.error
    });

    broadcastProgress({
      jobId,
      videoId,
      status: 'failed',
      currentStep: 'error',
      progressPercent: 0,
      error: update.error
    });
  } else {
    // Normal progress update
    const jobUpdate: Partial<ProcessingJob> = {};
    if (update.step) jobUpdate.current_step = update.step;
    if (update.progress !== undefined) jobUpdate.progress_percent = update.progress;
    if (update.skills_extracted !== undefined) jobUpdate.skills_extracted = update.skills_extracted;

    if (Object.keys(jobUpdate).length > 0) {
      updateJob(jobId, jobUpdate);
    }

    broadcastProgress({
      jobId,
      videoId,
      status: 'running',
      currentStep: update.step || 'processing',
      progressPercent: update.progress || 0,
      message: update.message
    });
  }
}

// Stop a running job
export function stopProcessing(jobId: number): boolean {
  const process = activeProcesses.get(jobId);
  if (process) {
    process.kill('SIGTERM');
    activeProcesses.delete(jobId);
    updateJob(jobId, { status: 'failed', error_message: 'Cancelled by user' });
    return true;
  }
  return false;
}

// Resume a paused job after checkpoint response
export async function resumeProcessing(jobId: number, checkpointResponse: object): Promise<{ success: boolean; error?: string }> {
  const job = getJobById(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  if (job.status !== 'paused') {
    return { success: false, error: 'Job is not paused' };
  }

  // Store checkpoint response
  updateJob(jobId, {
    checkpoint_response: JSON.stringify(checkpointResponse),
    checkpoint_type: null,
    checkpoint_data: null,
    status: 'queued' // Re-queue for continuation
  });

  // Re-start processing with checkpoint response
  return startProcessing(jobId);
}

// Get currently running jobs
export function getRunningJobs(): number[] {
  return Array.from(activeProcesses.keys());
}

// Check if a job is running
export function isJobRunning(jobId: number): boolean {
  return activeProcesses.has(jobId);
}

// Process next job in queue
export async function processNextJob(): Promise<{ started: boolean; jobId?: number }> {
  const { getActiveJobs } = require('./db');
  const jobs = getActiveJobs();

  // Find first queued job
  const queuedJob = jobs.find((j: ProcessingJob) => j.status === 'queued');
  if (!queuedJob) {
    return { started: false };
  }

  const result = await startProcessing(queuedJob.id);
  if (result.success) {
    return { started: true, jobId: queuedJob.id };
  }

  return { started: false };
}

// API endpoint handler for progress updates from Python script
export function handleProgressCallback(body: {
  jobId: number;
  step?: string;
  progress?: number;
  message?: string;
  checkpoint?: { type: string; data: object };
  skills_extracted?: number;
  error?: string;
}): void {
  const job = getJobById(body.jobId);
  if (!job || !job.video_id) return;

  handleProgressUpdate(body.jobId, job.video_id, body);
}
